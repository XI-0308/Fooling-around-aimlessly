import type { StoredCharacter } from "./store/characters.js";

import type { ChatHistorySummary, ChatMessage } from "./store/chats.js";

import type { GenerationSettings } from "./config.js";

import {
  buildChatHistoryHeaderBlock,
  historyRawStartIndex,
} from "./chat/historySummary.js";

import type { WiInjectionResult } from "./worldInfo/engine.js";

import { formatWiBlock } from "./worldInfo/engine.js";

import { expandUserMessageForPrompt } from "./memoryCitationFormat.js";

import {

  DEFAULT_PROMPT_ORDER,

  PROMPT_SLOT_LABELS,

  getPromptSlotLabel,
  normalizePromptOrder,
  normalizePreset,
  type PromptSlotId,
} from "./characterPreset.js";
import { buildSupervisorCapabilitiesDirective } from "./tools/capabilities.js";

import { chatHistoryTokenBudget, isUnlimited } from "./tokenLimits.js";
import { stripEnrichBlocksForPromptHistory, isToolFollowUpPlaceholder } from "./tools/enrichMarkers.js";
import { expandPromptMacros } from "./promptMacros.js";
import { formatDialogueTurn } from "./text/speakerLabel.js";

export { stripSpeakerPrefix } from "./text/speakerLabel.js";



export interface DeepSeekMessage {

  role: "system" | "user" | "assistant";

  content: string;

}



export interface PromptAnalysisSection {

  label: string;

  role: "system" | "user" | "assistant";

  content: string;

  kind?: "prompt" | "chat_marker" | "chat_turn";

  tokens?: number;

  speaker?: string;

  /** 该条历史的系统时钟标注（发给模型的时间行） */
  clock?: string;

  /** 对应 ChatMessage.id，用于定位裁剪窗口 */
  messageId?: string;

}



export interface PromptTokenSummary {

  inputTokens: number;

  fullInputTokens?: number;

  inputBudget: number;

  maxReply: number;

  maxContext: number;

  trimmed?: boolean;

}



export interface PromptContextLog {

  sections: PromptAnalysisSection[];

  tokenSummary?: PromptTokenSummary;

  [key: string]: unknown;

}



/** 聊天历史块开头（发给模型可见） */
const CHAT_HISTORY_MARKER = "---以下为历史对话，不覆盖上方设定---";
/** 示例对话块开头（与真实历史区分） */
const EXAMPLE_HISTORY_MARKER = "---以下为示例对话---";

function substitute(text: string, charName: string, userName: string): string {

  return text

    .replace(/\{\{char\}\}/g, charName)

    .replace(/\{\{user\}\}/g, userName)

    .replace(/<BOT>/g, charName)

    .replace(/<USER>/g, userName);

}



function wrapWithContent(template: string, content: string, charName: string, userName: string): string {

  let tpl = template.replace(/\{\{char\}\}/g, charName).replace(/\{\{user\}\}/g, userName);

  return tpl.replace(/\{\{content\}\}/g, content);

}



function isDirectTemplate(template?: string): boolean {

  const t = template?.trim();

  return Boolean(t && !t.includes("{{content}}"));

}



function parseMesExample(raw: string, charName: string, userName: string): DeepSeekMessage[] {

  if (!raw.trim()) return [];

  const messages: DeepSeekMessage[] = [];

  const blocks = raw.split(/<START>/gi).map((b) => b.trim()).filter(Boolean);



  for (const block of blocks) {

    const lines = block.split("\n").filter((l) => l.trim());

    for (const line of lines) {

      const trimmed = line.trim();

      if (trimmed.startsWith("{{user}}:") || trimmed.startsWith(`${userName}:`)) {

        messages.push({

          role: "user",

          content: trimmed.replace(/^\{\{user\}\}:\s*/i, "").replace(new RegExp(`^${userName}:\\s*`), ""),

        });

      } else if (trimmed.startsWith("{{char}}:") || trimmed.startsWith(`${charName}:`)) {

        messages.push({

          role: "assistant",

          content: trimmed.replace(/^\{\{char\}\}:\s*/i, "").replace(new RegExp(`^${charName}:\\s*`), ""),

        });

      }

    }

  }

  return messages;

}



function allTriggeredWorldInfo(wi?: WiInjectionResult): string {

  if (!wi) return "";

  const blocks = [

    wi.byPosition.before_char_defs,

    wi.byPosition.after_char_defs,

    wi.byPosition.before_examples,

    wi.byPosition.after_examples,

  ]

    .filter(Boolean)

    .map((entries) => formatWiBlock(entries!));

  return blocks.join("\n\n");
}

export interface PromptBuildInput {

  character: StoredCharacter;

  chatMessages: ChatMessage[];

  settings: GenerationSettings;

  userName?: string;

  userDescription?: string;

  chatId?: string;

  worldInfo?: WiInjectionResult;

  /** 「相关记忆」槽正文；可为空（事件/共读/LEANN 已在上游拼好） */
  relatedMemoryBody?: string;

  /** 「用户的信息补充」路径追加：人格画像（最多 2 条软归因，可空） */
  personaPortraitBody?: string;

  /** 「用户的信息补充」路径追加：近期活动账本（可空） */
  activityBody?: string;

  /** 前 50 条流水账摘要；有则历史原文从第 51 条起 */
  historySummary?: ChatHistorySummary | null;

}




export function buildPromptMessages(input: PromptBuildInput): {

  messages: DeepSeekMessage[];

  contextLog: PromptContextLog;

} {

  const {

    character,

    chatMessages,

    settings,

    userName = "用户",

    userDescription = "",

    worldInfo,

    relatedMemoryBody,

    personaPortraitBody,

    activityBody,

    historySummary,

  } = input;

  const d = character.data;

  const charName = d.name;

  const order = normalizePromptOrder(settings.promptOrder?.length ? settings.promptOrder : DEFAULT_PROMPT_ORDER);



  const macroCtx = { charName, userName, chatMessages };



  const mainFallback = substitute(settings.mainPrompt || "", charName, userName);

  const jailbreakFallback = substitute(settings.jailbreakPrompt || "", charName, userName);

  const postHistoryFallback = substitute(

    d.post_history_instructions || settings.postHistoryInstructions || "",

    charName,

    userName

  );

  const userDescRaw = substitute(userDescription.trim(), charName, userName);



  const wiBeforeChar = worldInfo?.byPosition.before_char_defs

    ? formatWiBlock(worldInfo.byPosition.before_char_defs)

    : "";

  const wiAfterChar = worldInfo?.byPosition.after_char_defs

    ? formatWiBlock(worldInfo.byPosition.after_char_defs)

    : "";

  const wiBeforeEx = worldInfo?.byPosition.before_examples

    ? formatWiBlock(worldInfo.byPosition.before_examples)

    : "";

  const wiAfterEx = worldInfo?.byPosition.after_examples

    ? formatWiBlock(worldInfo.byPosition.after_examples)

    : "";

  const wiCombinedBase = allTriggeredWorldInfo(worldInfo);
  const personaBody = personaPortraitBody?.trim() || "";
  const wiCombined = [wiCombinedBase, personaBody].filter(Boolean).join("\n\n");
  const wiAfterWithPersona = [wiAfterChar, personaBody].filter(Boolean).join("\n\n");

  const memoryBody = relatedMemoryBody?.trim() || "";
  const activityBlock = activityBody?.trim() || "";


  const examples = parseMesExample(d.mes_example, charName, userName);



  const messages: DeepSeekMessage[] = [];

  const sections: PromptAnalysisSection[] = [];



  function push(

    role: "system" | "user" | "assistant",

    content: string,

    label: string,

    kind: PromptAnalysisSection["kind"] = "prompt",

    extra?: Pick<PromptAnalysisSection, "speaker" | "clock" | "messageId">

  ) {

    if (!content.trim()) return;

    const tokens = estimateTokens(content);

    sections.push({ label, role, content, kind, tokens, ...extra });

    messages.push({ role, content });

  }



  const historyNow = new Date();

  function pushDialogueTurn(
    role: "user" | "assistant",
    rawContent: string,
    label: string,
    createdAt?: string | null,
    messageId?: string
  ) {
    const { text, speaker, clockLabel } = formatDialogueTurn(
      role,
      rawContent,
      charName,
      userName,
      createdAt,
      historyNow
    );
    push(role, text, label, "chat_turn", {
      speaker,
      ...(clockLabel ? { clock: clockLabel } : {}),
      ...(messageId ? { messageId } : {}),
    });
  }



  /** 直接系统块（包裹无 {{content}}）> 包裹+字段 > 裸字段 */

  function pushSlotBlock(label: string, template: string | undefined, fieldText: string, fallbackText = "") {

    const tpl = template?.trim() ?? "";

    const field = expandPromptMacros(substitute(fieldText.trim(), charName, userName), macroCtx);

    const fallback = expandPromptMacros(substitute(fallbackText.trim(), charName, userName), macroCtx);



    if (isDirectTemplate(tpl)) {

      push("system", expandPromptMacros(substitute(tpl, charName, userName), macroCtx), label);

      return;

    }



    const body = field || fallback;

    if (!body) return;



    if (tpl.includes("{{content}}")) {

      push("system", expandPromptMacros(wrapWithContent(tpl, body, charName, userName), macroCtx), label);

      return;

    }



    push("system", body, label);

  }



  function appendChatHistory() {

    if (chatMessages.length === 0) return;

    const summary = historySummary?.text?.trim() ? historySummary : null;

    // marker + 摘要 +「最近原文」标题合并为一条，裁剪时整段保留
    push(
      "system",
      buildChatHistoryHeaderBlock(summary),
      "聊天历史",
      "chat_marker"
    );

    const historyLen = chatMessages.length;
    // 摘要覆盖「刚被裁掉的一段」后，原文从该段之后起，避免与摘要重复
    const startIdx = historyRawStartIndex(chatMessages, summary);

    let lastUserIndex = -1;
    for (let j = historyLen - 1; j >= 0; j--) {
      if (chatMessages[j].role === "user") {
        lastUserIndex = j;
        break;
      }
    }

    for (let i = startIdx; i < historyLen; i++) {

      const msg = chatMessages[i];

      if (isToolFollowUpPlaceholder(msg, charName)) {
        continue;
      }

      const depthFromEnd = historyLen - 1 - i;



      if (worldInfo?.atDepth.length) {

        for (const inj of worldInfo.atDepth) {

          if (inj.depth === depthFromEnd) {

            push("system", `[World Info @ Depth ${inj.depth}]\n${inj.content}`, `语意记忆 @D${inj.depth}`);

          }

        }

      }



      let rawContent = msg.content;
      if (msg.role === "user") {
        if (i !== lastUserIndex) {
          rawContent = stripEnrichBlocksForPromptHistory(rawContent);
        }
        if (msg.memoryCitation) {
          rawContent = expandUserMessageForPrompt(rawContent, userName, msg.memoryCitation);
        }
      }

      pushDialogueTurn(msg.role, rawContent, "聊天历史", msg.createdAt, msg.id);

    }

  }



  for (const slot of order) {

    if (!slot.enabled) continue;



    switch (slot.id) {

      case "description":

        pushSlotBlock(getPromptSlotLabel(slot), slot.template, d.description);

        break;

      case "personality":

        pushSlotBlock(getPromptSlotLabel(slot), slot.template, d.personality);

        break;

      case "user_description":

        pushSlotBlock(getPromptSlotLabel(slot), slot.template, userDescRaw);

        break;

      case "world_info_before":

        if (wiBeforeChar) {

          pushSlotBlock(getPromptSlotLabel(slot), slot.template, wiBeforeChar);

        }

        break;

      case "world_info_after":

        if (wiCombined) {

          pushSlotBlock(getPromptSlotLabel(slot), slot.template, wiCombined);

        } else if (wiAfterWithPersona) {

          pushSlotBlock(getPromptSlotLabel(slot), slot.template, wiAfterWithPersona);

        }

        break;

      case "chat_history": {
        appendChatHistory();
        break;
      }

      case "supervisor": {
        const preset = normalizePreset(character.preset);
        const fallback = buildSupervisorCapabilitiesDirective(
          charName,
          preset.supervisorCapabilitiesPrompt,
          userName
        );
        pushSlotBlock(getPromptSlotLabel(slot), slot.template, "", fallback);
        break;
      }

      case "memories": {

        // 正文已在 resolveMemories 按类型套好事件/共读插入提示词，此处不再二次包裹
        if (memoryBody) {
          pushSlotBlock(getPromptSlotLabel(slot), slot.template, memoryBody);
        }

        break;
      }

      case "activities": {
        if (!activityBlock) break;
        const label = getPromptSlotLabel(slot);
        const tpl = slot.template?.trim() ?? "";
        // 留空模板：用格子标题当注入标题（可自行改 label）
        if (!tpl) {
          push("system", `${label}\n${activityBlock}`, label);
          break;
        }
        // 含 {{content}}：标题/说明写在模板里，活动列表替换进去
        if (tpl.includes("{{content}}")) {
          pushSlotBlock(label, slot.template, activityBlock);
          break;
        }
        // 其它「直接系统块」：只注入模板（与其它槽一致）；无活动时本 case 已 break
        pushSlotBlock(label, slot.template, activityBlock);
        break;
      }

      case "scenario":

        pushSlotBlock(getPromptSlotLabel(slot), slot.template, d.scenario);

        break;

      case "main":

        pushSlotBlock(getPromptSlotLabel(slot), slot.template, "", mainFallback);

        break;

      case "post_history":

        pushSlotBlock(

          getPromptSlotLabel(slot),

          slot.template,

          d.post_history_instructions || "",

          postHistoryFallback

        );

        break;

      case "jailbreak":

        pushSlotBlock(getPromptSlotLabel(slot), slot.template, "", jailbreakFallback);

        break;

      case "system_prompt":

        if (d.system_prompt) {

          pushSlotBlock(getPromptSlotLabel(slot), slot.template, substitute(d.system_prompt, charName, userName));

        }

        break;

      case "mes_example":

        if (examples.length > 0) {

          push("system", EXAMPLE_HISTORY_MARKER, "示例对话", "chat_marker");

        }

        if (wiBeforeEx) push("system", `[World Info — Before Examples]\n${wiBeforeEx}`, "语意记忆（示例前）");

        for (const ex of examples) {

          if (ex.role === "user" || ex.role === "assistant") {

            pushDialogueTurn(ex.role, ex.content, "示例对话");

          }

        }

        if (wiAfterEx) push("system", `[World Info — After Examples]\n${wiAfterEx}`, "语意记忆（示例后）");

        break;

    }

  }

  return { messages, contextLog: { sections } };

}



export function estimateTokens(text: string): number {
  let tokens = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    // 中文等多字节字符按约 1 token 估算，ASCII 约 4 字符 1 token（偏保守，避免低估）
    tokens += code <= 0x7f ? 0.25 : 1;
  }
  return Math.ceil(tokens);
}



export interface PromptTokenBreakdown {
  promptTokens: number;
  chatHistoryTokens: number;
  totalTokens: number;
  byCategory: {
    preset: number;
    worldInfo: number;
    memory: number;
    chatHistory: number;
    other: number;
  };
}

function isChatHistoryBudgetSection(
  messages: DeepSeekMessage[],
  sections: PromptAnalysisSection[] | undefined,
  idx: number
): boolean {
  const sec = sections?.[idx];
  if (sec?.label === "聊天历史说明" || sec?.label === "说话人标注（系统）") return false;
  // 历史块开头（含摘要标题）整段不计入裁剪预算，始终随 marker 保留
  if (sec?.label === "聊天历史" && sec.kind === "chat_marker") {
    const content = messages[idx]?.content ?? "";
    if (content.includes(CHAT_HISTORY_MARKER)) return false;
    return content.length > 8;
  }
  if (sec?.kind === "chat_turn") return true;
  if (sec?.kind === "chat_marker" && sec.label === "时间线") return true;
  if (sec?.label.startsWith("世界书 @D") || sec?.label.startsWith("语意记忆 @D")) return true;
  if (messages[idx]?.role === "user" || messages[idx]?.role === "assistant") return true;
  return false;
}

function isChatHistorySection(section: PromptAnalysisSection): boolean {
  if (section.label === "聊天历史说明" || section.label === "说话人标注（系统）") return false;
  if (section.kind === "chat_turn") return true;
  if (section.kind === "chat_marker") {
    if (section.label === "聊天历史") {
      return !section.content.includes("表示新的一天");
    }
    return section.label === "时间线";
  }
  if (section.label.startsWith("世界书 @D") || section.label.startsWith("语意记忆 @D")) {
    return true;
  }
  return false;
}

function categorizePromptSection(section: PromptAnalysisSection): keyof PromptTokenBreakdown["byCategory"] {
  if (isChatHistorySection(section)) return "chatHistory";
  const label = section.label;
  if (label.includes("世界书") || label.includes("语意记忆")) return "worldInfo";
  if (label.includes("记忆")) return "memory";
  if (
    label.includes("提示") ||
    label.includes("说明") ||
    label.includes("角色") ||
    label.includes("场景") ||
    label.includes("示例") ||
    label.includes("指令") ||
    label.includes("监管") ||
    label.includes("说话人") ||
    label === "主提示词"
  ) {
    return "preset";
  }
  return "other";
}

export function computePromptTokenBreakdown(sections: PromptAnalysisSection[]): PromptTokenBreakdown {
  const byCategory = { preset: 0, worldInfo: 0, memory: 0, chatHistory: 0, other: 0 };
  let promptTokens = 0;
  let chatHistoryTokens = 0;

  for (const section of sections) {
    const tokens = section.tokens ?? estimateTokens(section.content);
    if (isChatHistorySection(section)) {
      chatHistoryTokens += tokens;
    } else {
      promptTokens += tokens;
    }
    byCategory[categorizePromptSection(section)] += tokens;
  }

  return {
    promptTokens,
    chatHistoryTokens,
    totalTokens: promptTokens + chatHistoryTokens,
    byCategory,
  };
}

export function exceedsReplyTokenLimit(text: string, maxReplyTokens: number): boolean {
  if (isUnlimited(maxReplyTokens)) return false;
  return estimateTokens(text) > maxReplyTokens;
}

function findChatHistoryRange(
  messages: DeepSeekMessage[],
  sections?: PromptAnalysisSection[]
): { start: number; end: number } | null {
  const start = messages.findIndex(
    (m) => m.role === "system" && m.content.includes(CHAT_HISTORY_MARKER)
  );
  if (start === -1) return null;

  let end = messages.length;
  if (sections) {
    for (let i = start + 1; i < sections.length; i++) {
      const sec = sections[i];
      if (sec.label === "后续历史指令" && sec.kind === "prompt") {
        end = i;
        break;
      }
    }
  }
  return { start, end };
}

export interface TrimToContextResult {
  messages: DeepSeekMessage[];
  sections?: PromptAnalysisSection[];
  omittedChatMessages?: number;
  historyTrimmed?: boolean;
}

function messageTokens(m: DeepSeekMessage): number {
  return estimateTokens(m.content);
}

function assembleTrimResult(
  messages: DeepSeekMessage[],
  sections: PromptAnalysisSection[] | undefined,
  keptIndices: number[],
  options?: { insertOmissionAfterMarker?: boolean; omittedChatMessages?: number }
): TrimToContextResult {
  const sorted = [...keptIndices].sort((a, b) => a - b);
  const outMessages: DeepSeekMessage[] = [];
  const outSections: PromptAnalysisSection[] = [];
  const chatStartIdx = messages.findIndex(
    (m) => m.role === "system" && m.content.includes(CHAT_HISTORY_MARKER)
  );

  for (const idx of sorted) {
    outMessages.push(messages[idx]);
    if (sections) outSections.push(sections[idx]);

    // 裁剪时不再插入「更早对话已省略」说明；历史块仅保留 CHAT_HISTORY_MARKER
  }

  return {
    messages: outMessages,
    sections: sections ? outSections : undefined,
    omittedChatMessages: options?.omittedChatMessages ?? 0,
    historyTrimmed: Boolean(options?.insertOmissionAfterMarker && (options.omittedChatMessages ?? 0) > 0),
  };
}

export function trimMessagesToContext(
  messages: DeepSeekMessage[],
  chatHistoryTokenLimit: number,
  _reserveForReply: number,
  sections?: PromptAnalysisSection[]
): TrimToContextResult {
  if (messages.length <= 2) {
    return { messages, sections, omittedChatMessages: 0, historyTrimmed: false };
  }

  const range = findChatHistoryRange(messages, sections);
  if (!range) {
    return { messages, sections, omittedChatMessages: 0, historyTrimmed: false };
  }

  const prefixIndices = Array.from({ length: range.start }, (_, i) => i);
  const suffixIndices = Array.from(
    { length: messages.length - range.end },
    (_, i) => range.end + i
  );
  const historyIndices = Array.from({ length: range.end - range.start }, (_, i) => range.start + i);

  if (isUnlimited(chatHistoryTokenLimit)) {
    return {
      messages,
      sections,
      omittedChatMessages: 0,
      historyTrimmed: false,
    };
  }

  const historyBudget = chatHistoryTokenBudget(chatHistoryTokenLimit);
  if (!Number.isFinite(historyBudget) || historyBudget <= 0) {
    const keptIndices = [...prefixIndices, ...suffixIndices];
    return assembleTrimResult(messages, sections, keptIndices, {
      insertOmissionAfterMarker: historyIndices.length > 0,
      omittedChatMessages: countChatTurnsInIndices(messages, historyIndices),
    });
  }

  const markerIdx = historyIndices[0];
  const restHistory = historyIndices.slice(1);

  let keptRest = pickContiguousHistorySuffix(
    messages,
    sections,
    restHistory,
    historyBudget
  );
  keptRest = trimLeadingHistoryOrphans(messages, sections, keptRest);

  let omittedChatMessages = 0;
  const keptRestSet = new Set(keptRest);
  for (const idx of restHistory) {
    if (keptRestSet.has(idx)) continue;
    if (!isChatHistoryBudgetSection(messages, sections, idx)) continue;
    const role = messages[idx].role;
    if (role === "user" || role === "assistant") omittedChatMessages++;
  }

  const keptIndices = [...prefixIndices, markerIdx, ...keptRest, ...suffixIndices];

  return assembleTrimResult(messages, sections, keptIndices, {
    insertOmissionAfterMarker: omittedChatMessages > 0,
    omittedChatMessages,
  });
}

/** 从最新消息起连续向后取，预算用尽即停（不跳过中间再拼接更早消息） */
function pickContiguousHistorySuffix(
  messages: DeepSeekMessage[],
  sections: PromptAnalysisSection[] | undefined,
  restHistory: number[],
  historyBudget: number
): number[] {
  const keptRest: number[] = [];
  let usedHistory = 0;
  for (let i = restHistory.length - 1; i >= 0; i--) {
    const idx = restHistory[i];
    const counts = isChatHistoryBudgetSection(messages, sections, idx);
    const t = counts ? messageTokens(messages[idx]) : 0;
    if (counts && usedHistory + t > historyBudget) {
      break;
    }
    keptRest.unshift(idx);
    if (counts) usedHistory += t;
  }
  return keptRest;
}

/** 去掉保留块开头不完整的片段（如孤立的 assistant、@D 世界书），避免跨段拼接 */
function trimLeadingHistoryOrphans(
  messages: DeepSeekMessage[],
  sections: PromptAnalysisSection[] | undefined,
  keptRest: number[]
): number[] {
  if (keptRest.length === 0) return keptRest;
  let start = 0;
  while (start < keptRest.length) {
    const idx = keptRest[start];
    const sec = sections?.[idx];
    const role = messages[idx]?.role;
    if (sec?.label?.startsWith("世界书 @D") || sec?.label?.startsWith("语意记忆 @D")) {
      start++;
      continue;
    }
    if (sec?.kind === "chat_marker" && sec.label === "时间线") {
      if (sec.content.includes("[——")) break;
      start++;
      continue;
    }
    if (sec?.kind === "chat_turn" && role === "assistant") {
      start++;
      continue;
    }
    break;
  }
  return keptRest.slice(start);
}

function countChatTurnsInIndices(messages: DeepSeekMessage[], indices: number[]): number {
  return indices.filter((i) => {
    const role = messages[i].role;
    return role === "user" || role === "assistant";
  }).length;
}


