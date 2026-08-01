import type { Request, Response } from "express";
import path from "path";
import { CHARACTERS_DIR } from "../config.js";
import { fileMtimeVersion } from "../http/cachedFile.js";
import { getCharacter } from "../store/characters.js";
import {
  appendUserMessage,
  createChat,
  deleteChat,
  deleteMessage,
  getChat,
  listChats,
  patchMessageInjectedActivityCompleted,
  patchMessageInjectedMemoryRating,
  removeLastAssistant,
  removeLastUserAndAssistant,
  saveChatAttachment,
  truncateFromAssistantMessage,
  truncateAfterUserMessage,
  updateChatMeta,
  updateMessage,
  type ChatMessage,
  type MessageAttachment,
} from "../store/chats.js";
import { upsertMemoryFeedback } from "../memory/feedback.js";
import { loadWorldInfoBook } from "../worldInfo/store.js";
import { evaluateWorldInfo } from "../worldInfo/engine.js";
import {
  buildRelatedMemoriesBody,
  resolveMemoriesForChat,
} from "../memory/resolveMemories.js";
import { buildInjectedMemorySnaps } from "../memory/injectedSnap.js";
import {
  getUserAvatarFile,
  loadUserPersona,
} from "../store/userPersona.js";
import {
  formatPersonaInjection,
  resolvePersonaForChat,
} from "../persona/resolve.js";
import { resolveActivityForPrompt } from "../activity/resolve.js";
import { markOccurrenceDone } from "../activity/store.js";

import { buildPromptScanText } from "../promptScan.js";
import { summarizeEventAsOne, summarizeForMemory } from "../memory/summarizer.js";
import { addMemoryChunk } from "../memory/store.js";
import { loadSettings } from "../config.js";
import { getEffectiveGeneration } from "../characterPreset.js";
import { streamRoleplayChat } from "../web/chatStream.js";
import {
  buildExplicitSearchHint,
  extractExplicitSearchQuery,
  shouldEnableWebSearchForTurn,
} from "../web/search/intent.js";
import { extractZhihuUrls } from "../zhihu/intent.js";
import {
  buildZhihuOpenSearchHint,
  extractQueryFromUserText,
  formatZhihuOpenItems,
  resolveZhihuAccessSecret,
  shouldAttachZhihuOpenSearch,
  zhihuOpenSearch,
} from "../zhihu/openPlatform.js";
import { isZhihuOpenConfigured } from "../tools/serviceAuth.js";
import { enrichLatestUserMessageUrls } from "../web/urlEnrich.js";
import { enrichLatestUserMessageWeRead } from "../weread/wereadEnrich.js";
import { enrichLatestUserMessageBilibili } from "../bilibili/bilibiliEnrich.js";
import { enrichLatestUserMessageZhihu } from "../zhihu/zhihuEnrich.js";
import { enrichLatestUserMessageUv } from "../weather/uvEnrich.js";
import { runInvisibleAgentBeforeReply } from "../invisibleAgent/loop.js";
import { peekInvisibleInjections } from "../invisibleAgent/state.js";
import { buildToolFailureReplyHint } from "../tools/capabilities.js";
import {
  hasBilibiliEnrichFailure,
  hasUvEnrichFailure,
  hasWeReadEnrichFailure,
  hasZhihuEnrichFailure,
  stripUserVisibleText,
} from "../tools/enrichMarkers.js";
import {
  buildSuggestedWeReadKeys,
  extractWeReadEnrichData,
  hasWeReadExcerptableContent,
  summarizeWeReadForMemory,
} from "../weread/wereadMemory.js";
import { buildPromptMessages, trimMessagesToContext, estimateTokens, computePromptTokenBreakdown, exceedsReplyTokenLimit } from "../promptBuilder.js";
import { buildDeepSeekRequestBody, isDeepSeekThinkingMode, type StreamUsage } from "../deepseek.js";
import { finalizeAssistantReplyWithOptionalImage } from "../imageGen/followUp.js";
import { enrichLatestUserMessageImages, findAttachmentFilePath } from "../visionEnrich.js";
import { enrichLatestUserMessageVoice } from "../voice/voiceEnrich.js";
import { isUnlimited } from "../tokenLimits.js";
import { scheduleProactiveForChat } from "../proactive/scheduler.js";
import { markProactiveSeen } from "../proactive/state.js";
import { initSseResponse, writeSseEvent } from "../sse.js";

function patchOutputTokenSummary(
  contextLog: Record<string, unknown>,
  replyText: string,
  reasoningText?: string,
  apiUsage?: StreamUsage
): Record<string, unknown> {
  const apiReasoning = apiUsage?.completion_tokens_details?.reasoning_tokens;
  const apiCompletion = apiUsage?.completion_tokens;
  const estimatedReasoning = reasoningText?.trim() ? estimateTokens(reasoningText) : 0;
  const reasoningTokens = apiReasoning ?? estimatedReasoning;
  const replyTokens =
    apiCompletion !== undefined
      ? Math.max(0, apiCompletion - (apiReasoning ?? 0))
      : estimateTokens(replyText);
  const outputTokens =
    apiCompletion !== undefined ? apiCompletion : replyTokens + reasoningTokens;
  const ts =
    contextLog.tokenSummary && typeof contextLog.tokenSummary === "object"
      ? (contextLog.tokenSummary as Record<string, unknown>)
      : {};
  return {
    ...contextLog,
    tokenSummary: {
      ...ts,
      replyTokens,
      reasoningTokens,
      outputTokens,
      ...(apiUsage
        ? {
            apiUsage: {
              completionTokens: apiUsage.completion_tokens,
              promptTokens: apiUsage.prompt_tokens,
              reasoningTokens: apiReasoning,
            },
          }
        : {}),
    },
  };
}

export function listChatsHandler(_req: Request, res: Response): void {
  // 列表页只要元数据；整包 messages/contextLog 可达数 MB，手机经 Tailscale 会一直「加载中」
  const chats = listChats().map(
    ({ id, characterId, characterName, title, createdAt, updatedAt, messages }) => ({
      id,
      characterId,
      characterName,
      title,
      createdAt,
      updatedAt,
      messageCount: messages.length,
    })
  );
  res.json({ chats });
}

export function getChatHandler(req: Request, res: Response): void {
  const chat = getChat(req.params.id);
  if (!chat) {
    res.status(404).json({ error: "聊天不存在" });
    return;
  }
  const character = getCharacter(chat.characterId);
  const persona = loadUserPersona();
  const characterAvatarFile = character?.avatarPath
    ? path.join(CHARACTERS_DIR, character.avatarPath)
    : null;
  const userAvatarFile = getUserAvatarFile();
  // 去掉每条消息里的完整 contextLog（可占数 MB），详情页加载会快很多；分析面板按需拉取
  const lightChat = {
    ...chat,
    messages: chat.messages.map((m) => {
      if (!m.contextLog) return m;
      const { contextLog: _drop, ...rest } = m;
      return { ...rest, contextLog: { omitted: true } };
    }),
  };
  res.json({
    chat: lightChat,
    characterId: chat.characterId,
    characterHasAvatar: Boolean(character?.avatarPath),
    userHasAvatar: Boolean(persona.avatarPath),
    characterAvatarVersion: fileMtimeVersion(characterAvatarFile),
    userAvatarVersion: fileMtimeVersion(userAvatarFile),
    userName: persona.name,
  });
}

/** 按需取单条消息的完整提示词分析 */
export function getMessageContextLogHandler(req: Request, res: Response): void {
  const chat = getChat(req.params.id);
  if (!chat) {
    res.status(404).json({ error: "聊天不存在" });
    return;
  }
  const msg = chat.messages.find((m) => m.id === req.params.messageId);
  if (!msg) {
    res.status(404).json({ error: "消息不存在" });
    return;
  }
  res.json({
    contextLog:
      msg.contextLog || { 说明: "此消息在「提示词分析」功能上线前生成，无记录。" },
  });
}

/** 对本轮注入的事件记忆打 ♥（准）/ ×（不准） */
export function memoryFeedbackHandler(req: Request, res: Response): void {
  const chatId = req.params.id;
  const messageId = req.params.messageId;
  const { chunkId, rating } = req.body as {
    chunkId?: string;
    rating?: "up" | "down" | null;
  };
  if (!chunkId?.trim()) {
    res.status(400).json({ error: "缺少 chunkId" });
    return;
  }
  if (rating !== "up" && rating !== "down" && rating !== null) {
    res.status(400).json({ error: "rating 须为 up / down / null" });
    return;
  }

  const chat = getChat(chatId);
  if (!chat) {
    res.status(404).json({ error: "聊天不存在" });
    return;
  }
  const msg = chat.messages.find((m) => m.id === messageId);
  if (!msg || msg.role !== "assistant") {
    res.status(404).json({ error: "助手消息不存在" });
    return;
  }
  const snap = msg.injectedMemories?.find((s) => s.chunkId === chunkId);
  if (!snap) {
    res.status(404).json({ error: "该消息未注入此记忆" });
    return;
  }

  upsertMemoryFeedback({
    chatId,
    messageId,
    chunkId,
    query: snap.query,
    rating,
  });
  const updated = patchMessageInjectedMemoryRating(chatId, messageId, chunkId, rating);
  res.json({ success: true, message: updated });
}

/** 对本轮需提醒活动点 √ 完成（仅用户确认） */
export function activityCompleteHandler(req: Request, res: Response): void {
  const chatId = req.params.id;
  const messageId = req.params.messageId;
  const { activityId, occurrenceDate } = req.body as {
    activityId?: string;
    occurrenceDate?: string;
  };
  if (!activityId?.trim() || !occurrenceDate?.trim()) {
    res.status(400).json({ error: "缺少 activityId 或 occurrenceDate" });
    return;
  }

  const chat = getChat(chatId);
  if (!chat) {
    res.status(404).json({ error: "聊天不存在" });
    return;
  }
  const msg = chat.messages.find((m) => m.id === messageId);
  if (!msg || msg.role !== "assistant") {
    res.status(404).json({ error: "助手消息不存在" });
    return;
  }
  const snap = msg.injectedActivities?.find(
    (s) => s.activityId === activityId && s.occurrenceDate === occurrenceDate
  );
  if (!snap) {
    res.status(404).json({ error: "该消息未挂此活动提醒" });
    return;
  }

  markOccurrenceDone(activityId, occurrenceDate);
  const updated = patchMessageInjectedActivityCompleted(
    chatId,
    messageId,
    activityId,
    occurrenceDate,
    true
  );
  res.json({ success: true, message: updated });
}

export function deleteChatHandler(req: Request, res: Response): void {
  const ok = deleteChat(req.params.id);
  if (!ok) {
    res.status(404).json({ error: "聊天不存在" });
    return;
  }
  res.json({ success: true });
}

export function patchChatHandler(req: Request, res: Response): void {
  const { title } = req.body as { title?: string };
  if (title === undefined) {
    res.status(400).json({ error: "缺少 title" });
    return;
  }
  const chat = updateChatMeta(req.params.id, { title });
  if (!chat) {
    res.status(404).json({ error: "聊天不存在" });
    return;
  }
  res.json({ chat });
}

export function createChatHandler(req: Request, res: Response): void {
  const { characterId } = req.body as { characterId?: string };
  if (!characterId) {
    res.status(400).json({ error: "缺少 characterId" });
    return;
  }

  const character = getCharacter(characterId);
  if (!character) {
    res.status(404).json({ error: "角色不存在" });
    return;
  }

  const chat = createChat(characterId, character.data.name, character.data.first_mes);
  res.json({ chat });
}

export function uploadAttachmentHandler(req: Request, res: Response): void {
  try {
    const chatId = req.params.id;
    const chat = getChat(chatId);
    if (!chat) {
      res.status(404).json({ error: "聊天不存在" });
      return;
    }

    const { filename, mimeType, dataBase64, durationSec } = req.body as {
      filename?: string;
      mimeType?: string;
      dataBase64?: string;
      durationSec?: number;
    };

    if (!filename || !dataBase64) {
      res.status(400).json({ error: "缺少文件数据" });
      return;
    }

    const buffer = Buffer.from(dataBase64, "base64");
    const attachment = saveChatAttachment(
      chatId,
      filename,
      mimeType || "application/octet-stream",
      buffer,
      {
        durationSec:
          typeof durationSec === "number" && durationSec > 0
            ? Math.round(durationSec)
            : undefined,
      }
    );
    res.json({ attachment });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "上传失败" });
  }
}

export function getAttachmentHandler(req: Request, res: Response): void {
  const chatId = req.params.id;
  const attachmentId = req.params.attachmentId;
  const chat = getChat(chatId);
  if (!chat) {
    res.status(404).json({ error: "聊天不存在" });
    return;
  }

  const meta = chat.messages
    .flatMap((m) => m.attachments ?? [])
    .find((a) => a.id === attachmentId);

  if (!meta) {
    res.status(404).json({ error: "附件不存在" });
    return;
  }

  const filePath = findAttachmentFilePath(chatId, meta);
  if (!filePath) {
    res.status(404).json({ error: "附件文件未找到" });
    return;
  }

  res.setHeader("Content-Type", meta.mimeType || "application/octet-stream");
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.sendFile(filePath, (err) => {
    if (err && !res.headersSent) {
      res.status(500).json({ error: "读取附件失败" });
    }
  });
}

function formatMessagesForSummary(
  messages: ChatMessage[],
  characterName: string,
  userName: string
): string {
  return messages
    .map((m) => {
      const label = m.role === "user" ? userName : characterName;
      return `${label}：${m.content}`;
    })
    .join("\n\n");
}

async function generateReply(
  req: Request,
  res: Response,
  chatId: string,
  mode: "normal" | "regenerate" | "fresh"
): Promise<void> {
  const settings = loadSettings();
  if (!settings.deepseekApiKey) {
    res.status(400).json({
      error:
        "DeepSeek 未配置：请在「设置 → 角色对话 · DeepSeek」填写 API Key 并保存，或先在设置页点「测试角色对话连接」确认可用。",
    });
    return;
  }

  const chat = getChat(chatId);
  if (!chat) {
    res.status(404).json({ error: "聊天不存在" });
    return;
  }

  const character = getCharacter(chat.characterId);
  if (!character) {
    res.status(404).json({ error: "关联角色不存在" });
    return;
  }
  const charName = character.data.name?.trim() || "角色";

  let history = [...chat.messages];
  if (mode === "regenerate") {
    removeLastAssistant(chatId);
    const refreshed = getChat(chatId);
    if (!refreshed) {
      res.status(404).json({ error: "聊天不存在" });
      return;
    }
    history = [...refreshed.messages];
  }

  const book = loadWorldInfoBook();
  const persona = loadUserPersona();
  const scanCtx = {
    chatMessages: history,
    character: character.data,
    userName: persona.name,
    userDescription: persona.description,
  };

  const wi = evaluateWorldInfo(book, scanCtx);

  const scanText = buildPromptScanText(scanCtx, book.scanDepth);
  const lastUserMsg = [...history].reverse().find((m) => m.role === "user");
  const queryText = lastUserMsg?.content?.trim() || scanText;
  const related = await resolveMemoriesForChat(
    scanText,
    chatId,
    book.caseSensitive,
    queryText
  );
  const relatedMemoryBody = buildRelatedMemoriesBody(related);
  let personaPortraitBody = "";
  try {
    personaPortraitBody = formatPersonaInjection(
      resolvePersonaForChat(scanText, queryText)
    );
  } catch (err) {
    console.error("[persona] 召回失败:", err instanceof Error ? err.message : err);
  }

  let activityBody = "";
  let activityRemindSnaps: ReturnType<typeof resolveActivityForPrompt>["remindSnaps"] = [];
  try {
    const act = resolveActivityForPrompt();
    activityBody = act.activityBody;
    activityRemindSnaps = act.remindSnaps;
  } catch (err) {
    console.error("[activity] 注入失败:", err instanceof Error ? err.message : err);
  }

  const genSettings = getEffectiveGeneration(character, settings);
  const userNameForSummary = persona.name || "你";

  // ① 先按全文组 prompt 并裁剪，定位「刚被裁掉的最近 50 条」
  const probe = buildPromptMessages({
    character,
    chatMessages: history,
    settings: genSettings,
    userName: userNameForSummary,
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
    const firstKeptId = findFirstKeptChatMessageId(probeTrim.sections);
    const chunk = getRecentlyTrimmedChunk(history, firstKeptId);
    if (chunk) {
      historySummary = await ensureChatHistorySummaryForChunk(chatId, chunk, {
        charName: character.data.name,
        userName: userNameForSummary,
      });
    }
  } catch (err) {
    console.warn(
      "[historySummary] ensure failed:",
      err instanceof Error ? err.message : err
    );
  }

  // ② 有摘要则重组成「摘要 + 其后原文」，再裁一次
  // full* = 裁剪前组稿；sent/trimmed = 裁剪后实际送模型
  let trimmed = probeTrim.messages;
  let preTrimSections = probe.contextLog.sections;
  let postTrimSections = probeTrim.sections ?? probe.contextLog.sections;
  let historyTrimmed = probeTrim.historyTrimmed;
  let omittedChatMessages = probeTrim.omittedChatMessages ?? 0;
  let contextLogShell = { ...probe.contextLog };

  if (historySummary?.text) {
    const built = buildPromptMessages({
      character,
      chatMessages: history,
      settings: genSettings,
      userName: userNameForSummary,
      userDescription: persona.description,
      chatId,
      worldInfo: wi,
      relatedMemoryBody,
      personaPortraitBody,
      activityBody,
      historySummary,
    });
    const trimResult = trimMessagesToContext(
      built.messages,
      genSettings.maxContext,
      genSettings.maxTokens,
      built.contextLog.sections
    );
    trimmed = trimResult.messages;
    preTrimSections = built.contextLog.sections;
    postTrimSections = trimResult.sections ?? built.contextLog.sections;
    historyTrimmed = trimResult.historyTrimmed;
    omittedChatMessages = trimResult.omittedChatMessages ?? 0;
    contextLogShell = { ...built.contextLog };
  }

  const lastUser = [...history].reverse().find((m) => m.role === "user");
  // Invisible Agent 事实结果以 system 注入；Keep 不再挂在用户的用户消息上冒充自述
  const invisiblePeek = peekInvisibleInjections(chatId);
  for (const inj of invisiblePeek.systemInjections) {
    trimmed.push({ role: "system", content: inj });
  }
  let webSearchThisTurn = false;

  if (lastUser && settings.webSearchEnabled !== false) {
    webSearchThisTurn = shouldEnableWebSearchForTurn(lastUser.content);
    const explicitQuery = extractExplicitSearchQuery(
      stripUserVisibleText(lastUser.content)
    );
    if (explicitQuery) {
      trimmed.push({ role: "system", content: buildExplicitSearchHint(explicitQuery, userNameForSummary) });
    }
    if (
      webSearchThisTurn &&
      isZhihuOpenConfigured(settings.zhihu) &&
      settings.zhihuEnabled !== false
    ) {
      const stripped = stripUserVisibleText(lastUser.content);
      const urls = extractZhihuUrls(stripped);
      const zhQuery =
        explicitQuery ||
        extractQueryFromUserText(stripped, urls) ||
        (shouldAttachZhihuOpenSearch(stripped) ? stripped.replace(/\s+/g, " ").slice(0, 80) : "");
      if (zhQuery.trim().length >= 2) {
        try {
          const items = await zhihuOpenSearch(
            resolveZhihuAccessSecret(settings.zhihu),
            zhQuery.trim(),
            5
          );
          const body =
            items.length > 0
              ? formatZhihuOpenItems(items, "")
              : "（未找到相关结果）";
          trimmed.push({
            role: "system",
            content: buildZhihuOpenSearchHint(zhQuery.trim(), body),
          });
        } catch (err) {
          console.warn(
            "[zhihu-open] 站内搜索失败:",
            err instanceof Error ? err.message : err
          );
        }
      }
    }
    if (hasWeReadEnrichFailure(lastUser.content)) {
      trimmed.push({ role: "system", content: buildToolFailureReplyHint("微信读书") });
    }
    if (hasBilibiliEnrichFailure(lastUser.content)) {
      trimmed.push({ role: "system", content: buildToolFailureReplyHint("Bilibili 字幕") });
    }
    if (hasZhihuEnrichFailure(lastUser.content)) {
      trimmed.push({ role: "system", content: buildToolFailureReplyHint("知乎") });
    }
    if (hasUvEnrichFailure(lastUser.content)) {
      trimmed.push({ role: "system", content: buildToolFailureReplyHint("紫外线指数") });
    }
  }

  const finalSections = [...postTrimSections];
  for (const inj of invisiblePeek.systemInjections) {
    finalSections.push({
      label: "【近况补充】",
      role: "system",
      content: inj,
      kind: "prompt",
    });
  }
  // 「裁剪前」始终用全文原文组稿（probe，未加摘要、未裁窗口），
  // 避免二次组稿后剩余原文已能塞进限额时，误显示「已裁剪 0」。
  const fullBreakdown = computePromptTokenBreakdown(probe.contextLog.sections);
  const sentBreakdown = computePromptTokenBreakdown(finalSections);
  const trimmedTokenCount = Math.max(
    0,
    fullBreakdown.totalTokens - sentBreakdown.totalTokens
  );
  const apiPreview = buildDeepSeekRequestBody(trimmed, genSettings);
  const thinking = isDeepSeekThinkingMode(genSettings);
  let latestContextLog: Record<string, unknown> = {
    ...contextLogShell,
    sections: finalSections,
    invisibleAgent: invisiblePeek.outcome
      ? {
          decidedBy: invisiblePeek.outcome.decidedBy,
          mode: invisiblePeek.outcome.mode,
          toolSummary: invisiblePeek.outcome.toolSummaryForPrompt || undefined,
          tools: invisiblePeek.outcome.results.map((r) => ({
            tool: r.tool,
            ok: r.ok,
            summary: r.summary.slice(0, 200),
          })),
        }
      : undefined,
    trimSummary: historyTrimmed || trimmedTokenCount > 0
      ? { omittedChatMessages }
      : undefined,
    tokenSummary: {
      inputTokens: sentBreakdown.totalTokens,
      promptTokens: sentBreakdown.promptTokens,
      chatHistoryTokens: sentBreakdown.chatHistoryTokens,
      trimmedTokens: trimmedTokenCount,
      chatHistoryLimit: isUnlimited(genSettings.maxContext) ? null : genSettings.maxContext,
      chatHistoryBudgetRemaining:
        isUnlimited(genSettings.maxContext) || sentBreakdown.chatHistoryTokens === undefined
          ? null
          : Math.max(0, genSettings.maxContext - sentBreakdown.chatHistoryTokens),
      unlimitedChatHistory: isUnlimited(genSettings.maxContext),
      maxReply: isUnlimited(genSettings.maxTokens) ? null : genSettings.maxTokens,
      unlimitedReply: isUnlimited(genSettings.maxTokens),
      trimmed: trimmedTokenCount > 0,
      fullInputTokens: fullBreakdown.totalTokens,
      fullChatHistoryTokens: fullBreakdown.chatHistoryTokens,
      fullPromptTokens: fullBreakdown.promptTokens,
      // 二次组稿未裁时的体量（含摘要头），便于对照
      assembledInputTokens: computePromptTokenBreakdown(preTrimSections).totalTokens,
      byCategory: sentBreakdown.byCategory,
    },
    appliedLimits: {
      chatHistoryTokenLimit: isUnlimited(genSettings.maxContext) ? null : genSettings.maxContext,
      maxReplyTokens: isUnlimited(genSettings.maxTokens) ? null : genSettings.maxTokens,
      capturedAt: new Date().toISOString(),
      source: "character_preset",
    },
    generationParams: {
      model: apiPreview.model,
      thinking: (apiPreview.thinking as { type?: string })?.type ?? "disabled",
      max_tokens:
        apiPreview.max_tokens !== undefined ? apiPreview.max_tokens : "不限制（未传 max_tokens）",
      ...(thinking
        ? {
            reasoning_effort: apiPreview.reasoning_effort ?? "high",
            samplingNote: "思维链模式下温度 / Top-P / 惩罚项不传 API（DeepSeek 官方规定）",
          }
        : {
            temperature: apiPreview.temperature,
            top_p: apiPreview.top_p,
            frequency_penalty: apiPreview.frequency_penalty,
            presence_penalty: apiPreview.presence_penalty,
          }),
    },
  };

  initSseResponse(res);

  // 尽早把入库后的用户消息推给前端，替换 temp- 乐观气泡，避免被过期 loadChat 盖掉后「像消失了」
  if (mode === "normal") {
    const live = getChat(chatId);
    const lastUser = live
      ? [...live.messages].reverse().find((m) => m.role === "user")
      : undefined;
    if (lastUser) {
      writeSseEvent(res, { type: "user_message", message: lastUser });
    }
  }

  try {
    const { listPendingLeannOffers } = await import("../leann/ingestFromText.js");
    for (const offer of listPendingLeannOffers(chatId)) {
      writeSseEvent(res, {
        type: "leann_offer",
        offer: {
          id: offer.id,
          title: offer.title,
          source: offer.source,
          charCount: offer.charCount,
        },
      });
    }
  } catch {
    // ignore
  }

  writeSseEvent(res, { type: "context", contextLog: latestContextLog, trimmedCount: trimmed.length });

  let fullText = "";
  let fullReasoning = "";
  let replyLimitExceeded = false;

  await streamRoleplayChat(
    settings.deepseekApiKey,
    trimmed,
    { ...genSettings, webSearchEnabled: settings.webSearchEnabled, webSearchThisTurn },
    {
    onToken: (token) => {
      if (replyLimitExceeded) return;
      const nextText = fullText + token;
      if (exceedsReplyTokenLimit(nextText, genSettings.maxTokens)) {
        replyLimitExceeded = true;
        writeSseEvent(res, {
            type: "error",
            error: `回复超过最长回复限制（${genSettings.maxTokens} 词元）。请调高档案中的「最长回复」，或让${charName}写短一些。`,
          });
        res.end();
        return;
      }
      fullText = nextText;
      writeSseEvent(res, { type: "token", token });
    },
    onReasoningToken: (token) => {
      fullReasoning += token;
      writeSseEvent(res, { type: "reasoning", token });
    },
    onWebSearching: () => {
      writeSseEvent(res, { type: "web_searching" });
    },
    onDone: (text, reasoning, usage) => {
      if (replyLimitExceeded) return;
      const finalText = text || fullText;
      if (exceedsReplyTokenLimit(finalText, genSettings.maxTokens)) {
        writeSseEvent(res, {
          type: "error",
          error: `回复超过最长回复限制（${genSettings.maxTokens} 词元）。请调高档案中的「最长回复」，或让${charName}写短一些。`,
        });
        res.end();
        return;
      }
      const finalReasoning = reasoning || fullReasoning || undefined;
      const contextWithOutput = patchOutputTokenSummary(
        latestContextLog,
        finalText,
        finalReasoning,
        usage
      );
      void finalizeAssistantReplyWithOptionalImage(
        res,
        chatId,
        character,
        finalText,
        contextWithOutput,
        finalReasoning,
        {
          injectedMemories: buildInjectedMemorySnaps(related, queryText),
          injectedActivities: activityRemindSnaps,
        }
      ).catch((err) => {
        writeSseEvent(res, {
          type: "error",
          error: err instanceof Error ? err.message : "保存回复失败",
        });
        res.end();
      });
    },
    onError: (error) => {
      writeSseEvent(res, { type: "error", error });
      res.end();
    },
  });
}

export async function sendMessageHandler(req: Request, res: Response): Promise<void> {
  const chatId = req.params.id;
  const { content, attachments, memoryCitation, visionPrompt } = req.body as {
    content?: string;
    attachments?: MessageAttachment[];
    memoryCitation?: { chunkId?: string; text?: string };
    visionPrompt?: string;
  };

  if (!content?.trim() && (!attachments || attachments.length === 0)) {
    res.status(400).json({ error: "消息不能为空" });
    return;
  }

  const chat = getChat(chatId);
  if (!chat) {
    res.status(404).json({ error: "聊天不存在" });
    return;
  }

  const displayContent = content?.trim() || `[附件 ${attachments?.length ?? 0} 个]`;
  const citation =
    memoryCitation?.chunkId && memoryCitation.text?.trim()
      ? { chunkId: memoryCitation.chunkId, text: memoryCitation.text.trim() }
      : undefined;

  const userMsg = appendUserMessage(chatId, displayContent, attachments, citation);
  markProactiveSeen();
  scheduleProactiveForChat(chatId, new Date(userMsg.createdAt));
  await enrichLatestUserMessageVoice(chatId);
  await enrichLatestUserMessageImages(chatId, {
    visionPrompt: typeof visionPrompt === "string" ? visionPrompt : undefined,
  });
  await enrichLatestUserMessageBilibili(chatId);
  await enrichLatestUserMessageZhihu(chatId);
  await enrichLatestUserMessageUrls(chatId);
  await enrichLatestUserMessageWeRead(chatId);
  await enrichLatestUserMessageUv(chatId);
  // Invisible Agent：decide → execute(事实) → inject；副作用写入 TurnToolPlan
  await runInvisibleAgentBeforeReply(chatId, "chat");
  await generateReply(req, res, chatId, "normal");
}

export async function regenerateHandler(req: Request, res: Response): Promise<void> {
  const chatId = req.params.id;
  const chat = getChat(chatId);
  if (!chat) {
    res.status(404).json({ error: "聊天不存在" });
    return;
  }

  const last = chat.messages[chat.messages.length - 1];
  if (!last || last.role !== "assistant") {
    res.status(400).json({ error: "没有可重新生成的 AI 回复" });
    return;
  }

  // 重新生成前刷新紫外线，并重跑 Invisible Agent（Keep / 活动提醒等）
  await enrichLatestUserMessageUv(chatId);
  await runInvisibleAgentBeforeReply(chatId, "chat");
  await generateReply(req, res, chatId, "regenerate");
}

export async function regenerateMessageHandler(req: Request, res: Response): Promise<void> {
  const chatId = req.params.id;
  const messageId = req.params.messageId;
  const chat = getChat(chatId);
  if (!chat) {
    res.status(404).json({ error: "聊天不存在" });
    return;
  }

  const target = chat.messages.find((m) => m.id === messageId && m.role === "assistant");
  if (!target) {
    res.status(404).json({ error: "未找到该角色消息" });
    return;
  }

  truncateFromAssistantMessage(chatId, messageId);
  await generateReply(req, res, chatId, "fresh");
}

export async function summarizeEventPreviewHandler(req: Request, res: Response): Promise<void> {
  const chatId = req.params.id;
  const { messageIds } = req.body as { messageIds?: string[] };

  if (!messageIds?.length) {
    res.status(400).json({ error: "请至少选择一条消息" });
    return;
  }

  const chat = getChat(chatId);
  if (!chat) {
    res.status(404).json({ error: "聊天不存在" });
    return;
  }

  const character = getCharacter(chat.characterId);
  const charName = character?.data.name || "角色";
  const persona = loadUserPersona();

  const idSet = new Set(messageIds);
  const selected = chat.messages.filter((m) => idSet.has(m.id));
  if (selected.length === 0) {
    res.status(400).json({ error: "未找到选中的消息" });
    return;
  }

  const dialogue = formatMessagesForSummary(selected, charName, persona.name);

  try {
    const summary = await summarizeEventAsOne(
      dialogue,
      `事件记忆（${chat.title}·${selected.length}条对话）`
    );
    res.json({
      summary,
      messageIds: selected.map((m) => m.id),
      chatId,
      chatTitle: chat.title,
      messageCount: selected.length,
      suggestedMemoryAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "总结失败" });
  }
}

/** 微信读书摘抄：从含 WeRead 注入的用户消息预览总结 */
export async function wereadMemoryPreviewHandler(req: Request, res: Response): Promise<void> {
  const chatId = req.params.id;
  const { messageIds } = req.body as { messageIds?: string[] };

  if (!messageIds?.length) {
    res.status(400).json({ error: "请至少选择一条消息" });
    return;
  }

  const chat = getChat(chatId);
  if (!chat) {
    res.status(404).json({ error: "聊天不存在" });
    return;
  }

  const idSet = new Set(messageIds);
  const selected = chat.messages.filter((m) => idSet.has(m.id) && m.role === "user");
  if (selected.length === 0) {
    res.status(400).json({ error: "请勾选含微信读书数据的自己的消息" });
    return;
  }

  const dataBodies: string[] = [];
  const userQuestions: string[] = [];
  const excerptableSelected: typeof selected = [];
  for (const m of selected) {
    if (!hasWeReadExcerptableContent(m.content)) continue;
    excerptableSelected.push(m);
    const data = extractWeReadEnrichData(m.content);
    if (data) dataBodies.push(data);
    userQuestions.push(stripUserVisibleText(m.content));
  }

  if (dataBodies.length === 0) {
    res.status(400).json({
      error:
        "所选消息没有可摘抄的划线或笔记。仅书架/在读概览不能摘抄，请选含具体划线或笔记内容的消息。",
    });
    return;
  }

  try {
    const { summary, meta } = await summarizeWeReadForMemory(dataBodies, userQuestions);
    const suggestedKeys = buildSuggestedWeReadKeys(meta);
    res.json({
      summary,
      messageIds: excerptableSelected.map((m) => m.id),
      chatId,
      chatTitle: chat.title,
      messageCount: excerptableSelected.length,
      bookTitle: meta.bookTitle,
      progress: meta.progress,
      suggestedKeysText: suggestedKeys.join(", "),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "摘抄总结失败" });
  }
}

/** @deprecated 请使用 preview + /memory/ingest/event；保留兼容直接入库 */
export async function summarizeEventHandler(req: Request, res: Response): Promise<void> {
  const chatId = req.params.id;
  const { messageIds } = req.body as { messageIds?: string[] };

  if (!messageIds?.length) {
    res.status(400).json({ error: "请至少选择一条消息" });
    return;
  }

  const chat = getChat(chatId);
  if (!chat) {
    res.status(404).json({ error: "聊天不存在" });
    return;
  }

  const character = getCharacter(chat.characterId);
  const charName = character?.data.name || "角色";
  const persona = loadUserPersona();

  const idSet = new Set(messageIds);
  const selected = chat.messages.filter((m) => idSet.has(m.id));
  if (selected.length === 0) {
    res.status(400).json({ error: "未找到选中的消息" });
    return;
  }

  const dialogue = formatMessagesForSummary(selected, charName, persona.name);

  try {
    const summaries = await summarizeForMemory(dialogue, `事件总结（${selected.length}条对话）`);
    const created = summaries.map((t) =>
      addMemoryChunk({
        sourceType: "chat",
        sourceName: "事件记忆",
        chatId,
        sourceChatTitle: chat.title,
        sourceMessageIds: selected.map((m) => m.id),
        text: t,
      })
    );
    res.json({ success: true, count: created.length, chunks: created });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "总结失败" });
  }
}

export function deleteLastExchangeHandler(req: Request, res: Response): void {
  removeLastUserAndAssistant(req.params.id);
  const chat = getChat(req.params.id);
  res.json({ chat });
}

export function updateMessageHandler(req: Request, res: Response): void {
  const chatId = req.params.id;
  const messageId = req.params.messageId;
  const { content } = req.body as { content?: string };

  if (content === undefined || !content.trim()) {
    res.status(400).json({ error: "消息内容不能为空" });
    return;
  }

  const msg = updateMessage(chatId, messageId, { content: content.trim() });
  if (!msg) {
    res.status(404).json({ error: "消息不存在" });
    return;
  }
  // 只回单条；整包 chat（含 contextLog）可达数 MB，编辑保存会卡死
  const { contextLog: _drop, ...light } = msg;
  res.json({
    message: msg.contextLog ? { ...light, contextLog: { omitted: true } } : msg,
  });
}

export async function resendUserMessageHandler(req: Request, res: Response): Promise<void> {
  const chatId = req.params.id;
  const messageId = req.params.messageId;
  const { content } = req.body as { content?: string };

  const chat = getChat(chatId);
  if (!chat) {
    res.status(404).json({ error: "聊天不存在" });
    return;
  }

  const target = chat.messages.find((m) => m.id === messageId && m.role === "user");
  if (!target) {
    res.status(404).json({ error: "未找到该用户消息" });
    return;
  }

  if (content?.trim()) {
    updateMessage(chatId, messageId, { content: content.trim() });
  }

  truncateAfterUserMessage(chatId, messageId);
  await enrichLatestUserMessageVoice(chatId);
  await enrichLatestUserMessageImages(chatId);
  await enrichLatestUserMessageBilibili(chatId);
  await enrichLatestUserMessageZhihu(chatId);
  await enrichLatestUserMessageUrls(chatId);
  await enrichLatestUserMessageWeRead(chatId);
  await enrichLatestUserMessageUv(chatId);
  await runInvisibleAgentBeforeReply(chatId, "chat");
  await generateReply(req, res, chatId, "fresh");
}

export function deleteMessageHandler(req: Request, res: Response): void {
  const chatId = req.params.id;
  const messageId = req.params.messageId;
  const ok = deleteMessage(chatId, messageId);
  if (!ok) {
    res.status(404).json({ error: "消息不存在" });
    return;
  }
  res.json({ ok: true, messageId });
}

/** 确认：把本轮解析的视频/网页正文建成 LEANN 电子书索引 */
export async function confirmLeannOfferHandler(req: Request, res: Response): Promise<void> {
  const chatId = req.params.id;
  const { offerId } = req.body as { offerId?: string };
  if (!offerId?.trim()) {
    res.status(400).json({ error: "缺少 offerId" });
    return;
  }
  try {
    const {
      getPendingLeannOffer,
      takePendingLeannOffer,
      createLeannDraft,
    } = await import("../leann/ingestFromText.js");
    const offer = getPendingLeannOffer(chatId, offerId.trim());
    if (!offer) {
      res.status(404).json({ error: "确认项不存在或已处理" });
      return;
    }
    const result = createLeannDraft({
      title: offer.title,
      text: offer.text,
      keys: [offer.title],
    });
    // 成功后再移除，失败时弹窗可重试
    takePendingLeannOffer(chatId, offerId.trim());
    res.json({
      success: true,
      draft: true,
      collection: {
        id: result.collectionId,
        name: result.name,
        chunkCount: result.chunkCount,
        status: result.status,
      },
      memoryChunkId: result.memoryChunkId,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "写入 LEANN 失败",
    });
  }
}

/** 跳过：不把本轮资料写入 LEANN */
export function dismissLeannOfferHandler(req: Request, res: Response): void {
  const chatId = req.params.id;
  const { offerId } = req.body as { offerId?: string };
  if (!offerId?.trim()) {
    res.status(400).json({ error: "缺少 offerId" });
    return;
  }
  import("../leann/ingestFromText.js")
    .then(({ dismissPendingLeannOffer }) => {
      const ok = dismissPendingLeannOffer(chatId, offerId.trim());
      if (!ok) {
        res.status(404).json({ error: "确认项不存在或已处理" });
        return;
      }
      res.json({ ok: true });
    })
    .catch((err) => {
      res.status(500).json({
        error: err instanceof Error ? err.message : "操作失败",
      });
    });
}
