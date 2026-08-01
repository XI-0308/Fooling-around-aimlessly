import { loadSettings } from "../config.js";
import { openAiChatCompletion } from "../services/openaiCompat.js";
import { getChat } from "../store/chats.js";
import { getCharacter } from "../store/characters.js";
import { loadUserPersona } from "../store/userPersona.js";
import { hasKeepHealthIntent, isKeepDeferredIntent } from "../keep/intent.js";
import { resolveActivityForPrompt } from "../activity/resolve.js";
import { stripUserVisibleText } from "../tools/enrichMarkers.js";
import { hasMusicIntent } from "../music/intent.js";
import { hasImageGenIntent } from "../imageGen/intent.js";
import { hasWebImageIntent } from "../web/webImage.js";
import { isToolDispatcherActive } from "../toolDispatcher/run.js";
import { buildDispatcherHistory } from "../toolDispatcher/types.js";
import { formatRegistryForDecide } from "./registry.js";
import type { InvisibleMode, InvisibleToolCall } from "./types.js";

function dispatcherReady(): boolean {
  // 避免与 toolDispatcher/run 形成环依赖时也可内联；此处仍复用同一开关语义
  try {
    return isToolDispatcherActive();
  } catch {
    return false;
  }
}
function parseCalls(raw: string, mode: InvisibleMode): InvisibleToolCall[] {
  const text = raw.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return [];
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as {
      tools?: { name?: string; arg?: string | null }[];
    };
    const list = Array.isArray(obj.tools) ? obj.tools : [];
    const out: InvisibleToolCall[] = [];
    const seen = new Set<string>();
    for (const item of list) {
      const name = String(item?.name || "").trim();
      if (!name || seen.has(name)) continue;
      if (mode === "heartbeat" && (name === "music" || name === "voice" || name === "image" || name === "shareImage")) {
        continue;
      }
      if (
        name !== "keep" &&
        name !== "activity_remind" &&
        name !== "music" &&
        name !== "voice" &&
        name !== "image" &&
        name !== "shareImage"
      ) {
        continue;
      }
      seen.add(name);
      const arg =
        item.arg === null || item.arg === undefined
          ? undefined
          : String(item.arg);
      out.push({ tool: name as InvisibleToolCall["tool"], arg });
    }
    // image / shareImage 互斥：保留先出现的
    const hasImage = out.some((c) => c.tool === "image");
    const hasShare = out.some((c) => c.tool === "shareImage");
    if (hasImage && hasShare) {
      const first = out.findIndex((c) => c.tool === "image" || c.tool === "shareImage");
      const drop = out[first]?.tool === "image" ? "shareImage" : "image";
      return out.filter((c) => c.tool !== drop);
    }
    return out;
  } catch {
    return [];
  }
}

async function decideByLlm(
  chatId: string,
  mode: InvisibleMode
): Promise<InvisibleToolCall[] | null> {
  if (!dispatcherReady()) return null;
  const settings = loadSettings();
  const chat = getChat(chatId);
  if (!chat) return null;
  const character = getCharacter(chat.characterId);
  const userName = loadUserPersona().name?.trim() || "你";
  const charName = character?.data?.name?.trim() || chat.characterName || "角色";
  const history = buildDispatcherHistory(chat.messages, {
    pass: 1,
    userName,
    charName,
  });

  const modeHint =
    mode === "heartbeat"
      ? `现在是主动找${userName}的 heartbeat 回合：只能选用事实型工具 keep / activity_remind；不要点歌/生图/语音。`
      : "现在是普通对话回合：可按需选用注册表中的工具。副作用工具（music/voice/image/shareImage）会在角色说完后执行。";

  const system =
    `你是 Encore Flow 的隐形 Agent 决策器，不是角色扮演者。\n` +
    `用户叫「${userName}」，角色叫「${charName}」。\n` +
    `${modeHint}\n` +
    `可用工具：\n${formatRegistryForDecide(mode)}\n` +
    `规则：只在真正需要时调用；不要为了调用而调用；activity_remind 仅在有待提醒事项且适合叮嘱时。\n` +
    `Keep 时机：用户说「要去/正要去/我去健身了」等出发或进行中的话时不要查（数据还没同步）；` +
    `她说练完/跑完/健身回来/今天跑了多少/查一下运动数据时再查 keep。\n` +
    `走廊快走、走路、点歌、听音乐 ≠ 查 Keep；用户要听歌时用 music，不要调 keep。\n` +
    `用户自己发了图/让你看图 ≠ 网页找图；只有明确「找图/搜图/网上找一张」才用 shareImage。\n` +
    `只输出一个 JSON：{"tools":[{"name":"工具名","arg":"参数或空字符串"}]}\n` +
    `不需要任何工具时输出 {"tools":[]}`;

  try {
    const { content } = await openAiChatCompletion(
      settings.toolDispatcher,
      [
        { role: "system", content: system },
        ...history.map((m) => ({ role: m.role, content: m.content })),
      ],
      { maxTokens: 400, temperature: 0.2 }
    );
    console.log(
      `[invisibleAgent] llm decide mode=${mode} raw=${JSON.stringify(content).slice(0, 240)}`
    );
    const lastUser = [...chat.messages].reverse().find((m) => m.role === "user");
    const lastUserIdx = lastUser ? chat.messages.lastIndexOf(lastUser) : -1;
    const prevAssistant =
      lastUserIdx > 0
        ? [...chat.messages.slice(0, lastUserIdx)].reverse().find((m) => m.role === "assistant")
        : undefined;
    const userText = stripUserVisibleText(lastUser?.content || "");
    const assistantText = stripUserVisibleText(prevAssistant?.content || "");
    const hasUserImage = Boolean(
      lastUser?.attachments?.some(
        (a) => a.kind === "image" || String(a.mimeType || "").startsWith("image/")
      )
    );
    let calls = parseCalls(content, mode);
    // 硬闸：启发式不认的 Keep 一律不查（防 LLM 把「快走+点歌」派给 Keep）
    // 例外：角色刚问睡眠、用户短答跟进 → 仍放行
    if (!hasKeepHealthIntent(userText, assistantText)) {
      calls = calls.filter((c) => c.tool !== "keep");
    }
    // 硬闸：出发/进行中绝不查 Keep
    if (isKeepDeferredIntent(userText)) {
      calls = calls.filter((c) => c.tool !== "keep");
    }
    // 硬闸：用户本轮已发图时，不网页找图
    if (hasUserImage) {
      calls = calls.filter((c) => c.tool !== "shareImage");
    }
    return calls;
  } catch (err) {
    console.warn(
      "[invisibleAgent] llm decide 失败，回退启发式:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

function decideByHeuristic(chatId: string, mode: InvisibleMode): InvisibleToolCall[] {
  const settings = loadSettings();
  const chat = getChat(chatId);
  if (!chat) return [];
  const lastUser = [...chat.messages].reverse().find((m) => m.role === "user");
  const lastUserIdx = lastUser ? chat.messages.lastIndexOf(lastUser) : -1;
  const prevAssistant =
    lastUserIdx > 0
      ? [...chat.messages.slice(0, lastUserIdx)].reverse().find((m) => m.role === "assistant")
      : undefined;
  const userText = stripUserVisibleText(lastUser?.content || "");
  const assistantText = stripUserVisibleText(prevAssistant?.content || "");
  const calls: InvisibleToolCall[] = [];

  if (settings.keepEnabled !== false && hasKeepHealthIntent(userText, assistantText)) {
    calls.push({ tool: "keep", arg: "" });
  }

  try {
    const { remindSnaps } = resolveActivityForPrompt();
    if (remindSnaps.length > 0) {
      if (mode === "heartbeat") {
        calls.push({ tool: "activity_remind" });
      } else if (
        /提醒|记得|别忘|约定|计划|今天.+吗|晚饭|开会/.test(userText) ||
        remindSnaps.some((s) => userText.includes(s.title))
      ) {
        calls.push({ tool: "activity_remind" });
      }
    }
  } catch {
    /* ignore */
  }

  if (mode === "chat") {
    if (settings.musicEnabled !== false && hasMusicIntent(userText)) {
      calls.push({ tool: "music", arg: "" });
    }
    const hasUserImage = Boolean(
      lastUser?.attachments?.some(
        (a) => a.kind === "image" || String(a.mimeType || "").startsWith("image/")
      )
    );
    if (
      settings.imageGenEnabled !== false &&
      hasImageGenIntent(userText) &&
      !hasWebImageIntent(userText)
    ) {
      calls.push({ tool: "image", arg: "" });
    }
    if (hasWebImageIntent(userText) && !hasUserImage) {
      calls.push({ tool: "shareImage", arg: "" });
    }
  }

  return calls;
}

/** heartbeat 启发式：有待提醒则提醒；可轻度查 Keep */
export function decideHeartbeatHeuristic(): InvisibleToolCall[] {
  const settings = loadSettings();
  const calls: InvisibleToolCall[] = [];
  try {
    const { remindSnaps } = resolveActivityForPrompt();
    if (remindSnaps.length > 0) {
      calls.push({ tool: "activity_remind" });
    }
  } catch {
    /* ignore */
  }
  // heartbeat 默认不查 Keep，除非决策器 LLM 选了；启发式保持安静
  void settings;
  return calls;
}

export async function decideInvisibleTools(
  chatId: string,
  mode: InvisibleMode
): Promise<{ calls: InvisibleToolCall[]; decidedBy: "llm" | "heuristic" }> {
  const llm = await decideByLlm(chatId, mode);
  if (llm) {
    // heartbeat：若 LLM 漏了提醒但确实有待提醒项，补上
    if (mode === "heartbeat") {
      try {
        const { remindSnaps } = resolveActivityForPrompt();
        if (
          remindSnaps.length > 0 &&
          !llm.some((c) => c.tool === "activity_remind")
        ) {
          llm.push({ tool: "activity_remind" });
        }
      } catch {
        /* ignore */
      }
    }
    return { calls: llm, decidedBy: "llm" };
  }
  const calls =
    mode === "heartbeat" ? decideHeartbeatHeuristic() : decideByHeuristic(chatId, mode);
  return { calls, decidedBy: "heuristic" };
}
