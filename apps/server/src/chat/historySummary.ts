import { deepseekComplete } from "../memory/summarizer.js";
import { loadSettings } from "../config.js";
import { openAiChatCompletion } from "../services/openaiCompat.js";
import { stripEnrichBlocksForPromptHistory } from "../tools/enrichMarkers.js";
import {
  getChat,
  saveChat,
  type ChatHistorySummary,
  type ChatMessage,
} from "../store/chats.js";

/** 一段摘要覆盖的消息条数（刚被裁掉的最近窗口） */
export const HISTORY_SUMMARY_CHUNK_SIZE = 50;
/** 固定输出几条「-」摘要 */
export const HISTORY_SUMMARY_BULLET_COUNT = 5;
/** 每完成多少「轮」对话才刷新摘要（1 轮 ≈ 用户 1 条 + 角色 1 条） */
export const HISTORY_SUMMARY_EVERY_ROUNDS = 5;
/** 对应消息条数阈值 */
export const HISTORY_SUMMARY_EVERY_MESSAGES = HISTORY_SUMMARY_EVERY_ROUNDS * 2;

/**
 * 摘要用语：用户=运行时用户名，角色=「你」（给角色读，第二人称指他自己）
 */
function dialogueForSummary(messages: ChatMessage[], userName: string): string {
  const lines: string[] = [];
  let n = 0;
  for (const m of messages) {
    // 输入侧也固定标签，避免模型学成「一方/另一方」
    const who = m.role === "assistant" ? "你" : userName.trim() || "你";
    let text = m.content || "";
    if (m.role === "user") {
      text = stripEnrichBlocksForPromptHistory(text);
    }
    text = text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    n += 1;
    if (text.length > 320) text = `${text.slice(0, 320)}…`;
    lines.push(`[${n}] ${who}：${text}`);
  }
  return lines.join("\n");
}

/** 统一成恰好约 N 条「- 条目」 */
export function normalizeBulletSummary(
  raw: string,
  maxBullets: number = HISTORY_SUMMARY_BULLET_COUNT
): string {
  const lines = raw
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .filter((l) => !/^(摘要|流水账|如下)/.test(l));
  const bullets: string[] = [];
  for (const line of lines) {
    let t = line
      .replace(/^[-*•‧・]\s*/, "")
      .replace(/^\d+\s*[\.\)、:：]\s*/, "")
      .trim();
    if (!t) continue;
    bullets.push(`- ${t}`);
    if (bullets.length >= maxBullets) break;
  }
  return bullets.join("\n").trim();
}

function isOpenAiCompatActive(): boolean {
  const settings = loadSettings();
  const conn = settings.openaiCompat;
  return (
    settings.openaiCompatEnabled === true &&
    Boolean(conn?.baseUrl?.trim() && conn?.apiKey?.trim())
  );
}

async function runSummaryModel(
  dialogue: string,
  messageCount: number,
  userName: string,
  charName = "角色"
): Promise<string> {
  const name = userName.trim() || "你";
  const system =
    "你是对话流水账摘要员，不是角色。\n" +
    `任务：把给定对话压成条目式流水账，供角色「${charName}」阅读。\n` +
    "指代（必须遵守）：\n" +
    `- 用户一律写「${name}」，不要写「一方」「女方」「她」（除非转述别人）\n` +
    `- 角色一律写「你」，不要写「另一方」「男方」「${charName}」\n` +
    "- 禁止「一方…另一方…」这种含糊写法\n" +
    "格式（必须遵守）：\n" +
    `- 只输出 ${HISTORY_SUMMARY_BULLET_COUNT} 条，每条以「- 」开头\n` +
    "- 不要写具体日期、星期、几点几分\n" +
    "- 不要开场白、不要收尾、不要编号（1. 2.）\n" +
    "- 按事情发生顺序；可保留关键情绪与约定；不要编造";

  const userContent =
    `以下共 ${messageCount} 条对话（按时间从早到晚）。` +
    `请输出恰好 ${HISTORY_SUMMARY_BULLET_COUNT} 条「- 」流水账；指代用「${name}」与「你」。\n\n` +
    dialogue.slice(0, 28000);

  const messages = [
    { role: "system" as const, content: system },
    { role: "user" as const, content: userContent },
  ];

  if (isOpenAiCompatActive()) {
    const conn = loadSettings().openaiCompat;
    const { content } = await openAiChatCompletion(conn, messages, {
      model: conn.defaultModel || "gpt-4o-mini",
      temperature: 0.3,
      maxTokens: 700,
    });
    return normalizeBulletSummary(content);
  }

  return normalizeBulletSummary(await deepseekComplete(messages, 700));
}

/** 裁剪后保留的第一条聊天原文对应的 messageId */
export function findFirstKeptChatMessageId(
  sections: { kind?: string; messageId?: string }[] | undefined
): string | null {
  if (!sections?.length) return null;
  for (const s of sections) {
    if (s.kind === "chat_turn" && s.messageId) return s.messageId;
  }
  return null;
}

/**
 * 取「紧挨着保留窗口之前」被裁掉的最近 chunkSize 条。
 */
export function getRecentlyTrimmedChunk(
  messages: ChatMessage[],
  firstKeptMessageId: string | null,
  chunkSize: number = HISTORY_SUMMARY_CHUNK_SIZE
): ChatMessage[] | null {
  if (!firstKeptMessageId || chunkSize <= 0) return null;
  const keptIdx = messages.findIndex((m) => m.id === firstKeptMessageId);
  if (keptIdx < chunkSize) return null;
  return messages.slice(keptIdx - chunkSize, keptIdx);
}

/**
 * 是否该刷新摘要：
 * - 还没有摘要 → 需要（若有 50 条可裁窗口）
 * - 自上次摘要后，聊天又新增 ≥ 5 轮（约 10 条消息）→ 需要
 * 否则复用旧摘要（避免每轮因裁剪窗口滑动而重算）
 */
export function shouldRefreshHistorySummary(
  summary: ChatHistorySummary | undefined,
  messageCount: number
): boolean {
  if (!summary?.text?.trim()) return true;
  const at = summary.atMessageCount ?? 0;
  return messageCount - at >= HISTORY_SUMMARY_EVERY_MESSAGES;
}

/** 为「刚被裁掉的最近 50 条」生成摘要；未到 5 轮刷新点则原样复用 */
export async function ensureChatHistorySummaryForChunk(
  chatId: string,
  chunk: ChatMessage[] | null,
  opts?: { charName?: string; userName?: string }
): Promise<ChatHistorySummary | null> {
  const chat = getChat(chatId);
  if (!chat) return null;

  const existing = chat.historySummary;
  if (!shouldRefreshHistorySummary(existing, chat.messages.length)) {
    return existing?.text?.trim() ? existing : null;
  }

  if (!chunk || chunk.length < HISTORY_SUMMARY_CHUNK_SIZE) {
    // 到了刷新点但暂时裁不够 50 条：继续用旧摘要（若有）
    return existing?.text?.trim() ? existing : null;
  }

  const userName = opts?.userName?.trim() || "你";
  const charName = opts?.charName?.trim() || "角色";
  const dialogue = dialogueForSummary(chunk, userName);
  if (!dialogue.trim()) return existing?.text?.trim() ? existing : null;

  try {
    const text = await runSummaryModel(dialogue, chunk.length, userName, charName);
    if (!text) {
      console.warn(`[historySummary] 空摘要 chat=${chatId}`);
      return existing?.text?.trim() ? existing : null;
    }
    const row: ChatHistorySummary = {
      coveredCount: chunk.length,
      fromMessageId: chunk[0].id,
      throughMessageId: chunk[chunk.length - 1].id,
      atMessageCount: chat.messages.length,
      text,
      updatedAt: new Date().toISOString(),
    };
    const latest = getChat(chatId);
    if (!latest) return null;
    latest.historySummary = row;
    saveChat(latest);
    console.log(
      `[historySummary] refresh chat=${chatId} rounds=${HISTORY_SUMMARY_EVERY_ROUNDS} ` +
        `bullets=${text.split("\n").length} atMsgs=${row.atMessageCount} ` +
        `from=${row.fromMessageId.slice(0, 8)} through=${row.throughMessageId.slice(0, 8)}`
    );
    return row;
  } catch (err) {
    console.warn(
      "[historySummary] 生成失败:",
      err instanceof Error ? err.message : err
    );
    return existing?.text?.trim() ? existing : null;
  }
}

/** 拼进历史块开头的 system 文案（与 marker 合并，裁剪时整段保留） */
export function buildChatHistoryHeaderBlock(summary: ChatHistorySummary | null | undefined): string {
  const parts = ["---以下为历史对话，不覆盖上方设定---"];
  if (summary?.text?.trim()) {
    parts.push("");
    parts.push("【更早的对话摘要】");
    parts.push(summary.text.trim());
  }
  parts.push("");
  parts.push("【最近实时对话原文】");
  return parts.join("\n");
}

/** 摘要覆盖结束后的原文起点（下一条） */
export function historyRawStartIndex(
  messages: ChatMessage[],
  summary: ChatHistorySummary | null | undefined
): number {
  if (!summary?.throughMessageId) return 0;
  const idx = messages.findIndex((m) => m.id === summary.throughMessageId);
  return idx >= 0 ? idx + 1 : 0;
}
