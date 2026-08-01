import { loadSettings } from "../config.js";
import { getEffectiveGeneration } from "../characterPreset.js";
import { completeRoleplayChat } from "../deepseek.js";
import {
  buildPromptMessages,
  trimMessagesToContext,
  computePromptTokenBreakdown,
  estimateTokens,
} from "../promptBuilder.js";
import { isUnlimited } from "../tokenLimits.js";
import { loadUserPersona } from "../store/userPersona.js";
import { getCharacter } from "../store/characters.js";
import { getChat } from "../store/chats.js";
import { loadWorldInfoBook } from "../worldInfo/store.js";
import { evaluateWorldInfo } from "../worldInfo/engine.js";
import { buildPromptScanText } from "../promptScan.js";
import {
  buildRelatedMemoriesBody,
  resolveMemoriesForChat,
} from "../memory/resolveMemories.js";
import {
  formatPersonaInjection,
  resolvePersonaForChat,
} from "../persona/resolve.js";
import { resolveActivityForPrompt } from "../activity/resolve.js";
import { getProactiveConfig, renderProactivePrompt } from "./config.js";
import { runInvisibleAgentBeforeReply } from "../invisibleAgent/loop.js";
import { peekInvisibleInjections } from "../invisibleAgent/state.js";

export async function generateProactiveMessage(
  chatId: string
): Promise<{ content: string; contextLog: Record<string, unknown>; reasoning?: string }> {
  const settings = loadSettings();
  if (!settings.deepseekApiKey?.trim()) {
    throw new Error("未配置 DeepSeek API Key");
  }

  const chat = getChat(chatId);
  if (!chat) throw new Error("聊天不存在");

  const character = getCharacter(chat.characterId);
  if (!character) throw new Error("角色不存在");

  const persona = loadUserPersona();
  const userName = persona.name?.trim() || "你";
  const charName = character.data.name;

  const book = loadWorldInfoBook();
  const scanCtx = {
    chatMessages: chat.messages,
    character: character.data,
    userName,
    userDescription: persona.description,
  };
  const wi = evaluateWorldInfo(book, scanCtx);
  const scanText = buildPromptScanText(scanCtx, book.scanDepth);
  const related = await resolveMemoriesForChat(scanText, chatId, book.caseSensitive, scanText);
  const relatedMemoryBody = buildRelatedMemoriesBody(related);
  let personaPortraitBody = "";
  try {
    personaPortraitBody = formatPersonaInjection(
      resolvePersonaForChat(scanText, scanText)
    );
  } catch {
    // 主动消息不因画像召回失败而中断
  }

  let activityBody = "";
  try {
    activityBody = resolveActivityForPrompt().activityBody;
  } catch {
    // 主动消息不因活动账本失败而中断
  }

  const genSettings = getEffectiveGeneration(character, settings);
  const probe = buildPromptMessages({
    character,
    chatMessages: chat.messages,
    settings: genSettings,
    userName,
    userDescription: persona.description,
    chatId,
    worldInfo: wi,
    relatedMemoryBody,
    personaPortraitBody,
    activityBody,
    historySummary: null,
  });
  const probeTrim = trimMessagesToContext(
    probe.messages,
    genSettings.maxContext,
    genSettings.maxTokens,
    probe.contextLog.sections
  );

  let historySummary = null as typeof chat.historySummary | null;
  try {
    const {
      ensureChatHistorySummaryForChunk,
      findFirstKeptChatMessageId,
      getRecentlyTrimmedChunk,
    } = await import("../chat/historySummary.js");
    const chunk = getRecentlyTrimmedChunk(
      chat.messages,
      findFirstKeptChatMessageId(probeTrim.sections)
    );
    if (chunk) {
      historySummary = await ensureChatHistorySummaryForChunk(chatId, chunk, {
        charName,
        userName,
      });
    }
  } catch {
    // 摘要失败不阻断主动消息
  }

  let built = probe;
  let trimResult = probeTrim;
  if (historySummary?.text) {
    built = buildPromptMessages({
      character,
      chatMessages: chat.messages,
      settings: genSettings,
      userName,
      userDescription: persona.description,
      chatId,
      worldInfo: wi,
      relatedMemoryBody,
      personaPortraitBody,
      activityBody,
      historySummary,
    });
    trimResult = trimMessagesToContext(
      built.messages,
      genSettings.maxContext,
      genSettings.maxTokens,
      built.contextLog.sections
    );
  }
  const trimmed = [...trimResult.messages];

  // Heartbeat：同一 Invisible Agent 回路（活动提醒 + 只读 Keep 等）
  await runInvisibleAgentBeforeReply(chatId, "heartbeat");
  const invisiblePeek = peekInvisibleInjections(chatId);
  for (const inj of invisiblePeek.systemInjections) {
    trimmed.push({ role: "system", content: inj });
  }

  const cfg = getProactiveConfig(settings);
  const hint = renderProactivePrompt(cfg.prompt, charName, userName, chat.messages);
  const nudge = `[主动消息 · 仅本轮]
${hint}

请以${charName}的身份，直接给${userName}发一条消息。
要求：
1. 只输出消息正文，不要旁白、括号说明或 meta 解释
2. 1–3 句，自然，像在主动找${userName}聊天
3. 不要重复你上一条已说过的话
4. 若上方有「${userName}的近况」系统块，可自然用上；不要假装使用了未给出的事实、图片或音乐卡片`;
  trimmed.push({ role: "user", content: nudge });

  const finalSections = [...(trimResult.sections ?? built.contextLog.sections)];
  for (const inj of invisiblePeek.systemInjections) {
    finalSections.push({
      label: "【近况补充 · Heartbeat】",
      role: "system",
      content: inj,
      kind: "prompt",
    });
  }
  finalSections.push({
    label: "【主动消息 · Heartbeat】",
    role: "user",
    content: nudge,
    kind: "prompt",
  });

  const sentBreakdown = computePromptTokenBreakdown(finalSections);
  const fullBreakdown = computePromptTokenBreakdown(built.contextLog.sections);

  let contextLog: Record<string, unknown> = {
    ...built.contextLog,
    kind: "proactive",
    proactiveHint: nudge,
    trimmedMessageCount: trimmed.length,
    sections: finalSections,
    invisibleAgent: invisiblePeek.outcome
      ? {
          decidedBy: invisiblePeek.outcome.decidedBy,
          mode: invisiblePeek.outcome.mode,
          tools: invisiblePeek.outcome.results.map((r) => ({
            tool: r.tool,
            ok: r.ok,
            summary: r.summary.slice(0, 200),
          })),
        }
      : undefined,
    trimSummary: trimResult.historyTrimmed
      ? { omittedChatMessages: trimResult.omittedChatMessages ?? 0 }
      : undefined,
    tokenSummary: {
      inputTokens: sentBreakdown.totalTokens,
      promptTokens: sentBreakdown.promptTokens,
      chatHistoryTokens: sentBreakdown.chatHistoryTokens,
      trimmedTokens: Math.max(0, fullBreakdown.totalTokens - sentBreakdown.totalTokens),
      chatHistoryLimit: isUnlimited(genSettings.maxContext) ? null : genSettings.maxContext,
      unlimitedChatHistory: isUnlimited(genSettings.maxContext),
      maxReply: isUnlimited(genSettings.maxTokens) ? null : genSettings.maxTokens,
      unlimitedReply: isUnlimited(genSettings.maxTokens),
      trimmed: Boolean(trimResult.historyTrimmed),
      fullInputTokens: fullBreakdown.totalTokens,
      byCategory: sentBreakdown.byCategory,
    },
    appliedLimits: {
      chatHistoryTokenLimit: isUnlimited(genSettings.maxContext) ? null : genSettings.maxContext,
      maxReplyTokens: isUnlimited(genSettings.maxTokens) ? null : genSettings.maxTokens,
      capturedAt: new Date().toISOString(),
      source: "proactive_heartbeat",
    },
  };

  const { content: text, reasoning } = await completeRoleplayChat(
    settings.deepseekApiKey,
    trimmed,
    genSettings,
    genSettings.maxTokens || 512
  );
  const cleaned = text
    .replace(/\[\[MUSIC:[\s\S]*?\]\]/gi, "")
    .replace(/\[\[IMAGE:[\s\S]*?\]\]/gi, "")
    .trim();
  if (!cleaned) throw new Error("主动消息生成为空");

  const estimatedReasoning = reasoning?.trim() ? estimateTokens(reasoning) : 0;
  const replyTokens = estimateTokens(cleaned);
  const ts =
    contextLog.tokenSummary && typeof contextLog.tokenSummary === "object"
      ? (contextLog.tokenSummary as Record<string, unknown>)
      : {};
  contextLog = {
    ...contextLog,
    tokenSummary: {
      ...ts,
      replyTokens,
      reasoningTokens: estimatedReasoning,
      outputTokens: replyTokens + estimatedReasoning,
    },
  };

  return { content: cleaned, contextLog, reasoning };
}
