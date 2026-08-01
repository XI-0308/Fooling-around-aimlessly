import type { Response } from "express";
import type { StoredCharacter } from "../store/characters.js";
import {
  appendAssistantMessage,
  getChat,
  replaceLastAssistant,
} from "../store/chats.js";
import {
  assistantRoleplayedImageWithoutMarker,
  fallbackImagePromptFromRecentAssistant,
  fallbackImagePromptFromUserMessage,
  hasImageGenIntent,
  imagePromptFromAssistantText,
  stripImageGenMarker,
  stripRoleplayedImageArtifacts,
} from "../imageGen/intent.js";
import { runImageGenFollowUp } from "../imageGen/pipeline.js";
import {
  assistantClaimedWebImage,
  hasWebImageIntent,
  runWebImageShareFollowUp,
  stripShareImageMarker,
} from "../web/webImage.js";
import {
  extractMusicQueryFromChatHistory,
  extractMusicQueryFromText,
  hasMusicIntent,
  sanitizeMusicQuery,
  stripMusicMarker,
  stripRoleplayedAgentArtifacts,
} from "../music/intent.js";
import { runMusicFollowUp } from "../music/pipeline.js";
import { appendToolFailureExplanation } from "../tools/toolErrors.js";
import { stripUserVisibleText } from "../tools/enrichMarkers.js";
import { loadSettings } from "../config.js";
import { runAssistantVoiceFollowUp } from "../voice/voiceFollowUp.js";
import {
  assistantRoleplayedVoiceWithoutMarker,
  stripRoleplayedVoiceArtifacts,
  stripVoiceMarker,
} from "../voice/intent.js";
import { sanitizeAssistantOutput } from "../text/speakerLabel.js";
import { loadUserPersona } from "../store/userPersona.js";
import {
  isToolDispatcherActive,
  runToolDispatcherPass2,
} from "../toolDispatcher/run.js";
import { takeTurnToolPlan } from "../toolDispatcher/state.js";
import { peekInvisibleInjections } from "../invisibleAgent/state.js";
import { stripUnsupportedToolClaims } from "../invisibleAgent/antiHallucination.js";
import type { InjectedMemorySnap } from "../memory/injectedSnap.js";

function lastUserContentBeforeReply(chatId: string): string {
  const chat = getChat(chatId);
  if (!chat) return "";
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    if (chat.messages[i].role === "user") {
      return chat.messages[i].content;
    }
  }
  return "";
}

function lastUserHasImageAttachment(chatId: string): boolean {
  const chat = getChat(chatId);
  if (!chat) return false;
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    if (chat.messages[i].role === "user") {
      return Boolean(
        chat.messages[i].attachments?.some(
          (a) => a.kind === "image" || String(a.mimeType || "").startsWith("image/")
        )
      );
    }
  }
  return false;
}

function resolveAgentFollowUps(
  chatId: string,
  assistantRaw: string,
  userContent: string
): {
  cleanAssistantText: string;
  imagePrompt: string | null;
  shareImageSource: string | null;
  musicQuery: string | null;
  wantsVoice: boolean;
} {
  const { cleanText: afterShare, source: shareFromMarker } = stripShareImageMarker(assistantRaw);
  const { cleanText: afterImage, prompt: imageFromMarker } = stripImageGenMarker(afterShare);
  const { cleanText: afterMusic, query: musicFromMarker } = stripMusicMarker(afterImage);
  const { cleanText: afterVoice, wantsVoice: voiceFromMarker } = stripVoiceMarker(afterMusic);
  const wantsVoice =
    voiceFromMarker || assistantRoleplayedVoiceWithoutMarker(assistantRaw);

  let shareImageSource: string | null = shareFromMarker;
  const userSentImage = lastUserHasImageAttachment(chatId);
  if (!shareImageSource && !userSentImage && hasWebImageIntent(userContent)) {
    const url =
      userContent.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/i)?.[0]?.replace(/[),.;!?，。！？]+$/g, "") ||
      null;
    shareImageSource = url || userContent.replace(/\s+/g, " ").trim().slice(0, 80);
  } else if (!shareImageSource && !userSentImage && assistantClaimedWebImage(assistantRaw)) {
    shareImageSource =
      assistantRaw.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/i)?.[0]?.replace(/[),.;!?，。！？]+$/g, "") ||
      stripUserVisibleText(userContent).replace(/\s+/g, " ").trim().slice(0, 80) ||
      null;
  }

  let imagePrompt: string | null = null;
  if (!shareImageSource) {
    imagePrompt = imageFromMarker || fallbackImagePromptFromUserMessage(userContent);
    if (
      !imagePrompt &&
      (hasImageGenIntent(userContent) || assistantRoleplayedImageWithoutMarker(assistantRaw))
    ) {
      imagePrompt = fallbackImagePromptFromRecentAssistant(chatId);
    }
  }

  const userQuery = sanitizeMusicQuery(extractMusicQueryFromText(userContent));
  const markerQuery = sanitizeMusicQuery(musicFromMarker);
  const userWantsMusic = hasMusicIntent(userContent);
  const assistantWantsMusic = hasMusicIntent(afterMusic || assistantRaw) || musicFromMarker !== null;

  let musicQuery: string | null = null;
  if (userQuery !== null) {
    musicQuery = userQuery;
  } else if (markerQuery !== null) {
    musicQuery = markerQuery;
  } else if (userWantsMusic) {
    musicQuery = sanitizeMusicQuery(extractMusicQueryFromChatHistory(chatId)) ?? "";
  } else if (assistantWantsMusic) {
    musicQuery = "";
  }

  let cleanAssistantText = afterVoice.trim();
  if (!cleanAssistantText) {
    if (shareImageSource) cleanAssistantText = "好，我去找。";
    else if (imagePrompt && musicQuery !== null) cleanAssistantText = "好。";
    else if (imagePrompt) cleanAssistantText = "好，我去画。";
    else if (musicQuery !== null) cleanAssistantText = "好，我去放。";
    else if (wantsVoice) cleanAssistantText = "嗯。";
    else cleanAssistantText = assistantRaw.trim();
  }

  if (imagePrompt || shareImageSource || musicQuery !== null) {
    cleanAssistantText = stripRoleplayedAgentArtifacts(cleanAssistantText);
    if (imagePrompt || shareImageSource) {
      cleanAssistantText = stripRoleplayedImageArtifacts(cleanAssistantText);
    }
    if (!cleanAssistantText) {
      cleanAssistantText = shareImageSource
        ? "好，我去找。"
        : musicQuery !== null
          ? "好，我去放。"
          : "好，我去画。";
    }
  }

  if (wantsVoice) {
    cleanAssistantText = stripRoleplayedVoiceArtifacts(cleanAssistantText);
    if (!cleanAssistantText) cleanAssistantText = "嗯。";
  }

  return { cleanAssistantText, imagePrompt, shareImageSource, musicQuery, wantsVoice };
}

/** 调度员模式：角色标记 > 调度/Invisible plan > 本地关键词/表演兜底 */
function resolveDispatcherFollowUps(
  chatId: string,
  assistantRaw: string,
  plan: {
    musicQuery: string | null;
    imagePrompt: string | null;
    shareImageSource: string | null;
    wantsVoice: boolean;
  } | null
): {
  cleanAssistantText: string;
  imagePrompt: string | null;
  shareImageSource: string | null;
  musicQuery: string | null;
  wantsVoice: boolean;
} {
  const { cleanText: afterShare, source: shareFromMarker } = stripShareImageMarker(assistantRaw);
  const { cleanText: afterImage, prompt: imageFromMarker } = stripImageGenMarker(afterShare);
  const { cleanText: afterMusic, query: musicFromMarker } = stripMusicMarker(afterImage);
  const { cleanText: afterVoice, wantsVoice: voiceFromMarker } = stripVoiceMarker(afterMusic);

  const userContent = stripUserVisibleText(lastUserContentBeforeReply(chatId));
  const markerMusic = sanitizeMusicQuery(musicFromMarker);

  // ① 角色标记优先
  let shareImageSource: string | null = shareFromMarker;
  let imagePrompt: string | null = shareFromMarker ? null : imageFromMarker;
  let musicQuery: string | null = markerMusic;
  let wantsVoice = voiceFromMarker;

  // ② 调度员 plan 仅填空位（不覆盖角色已选的 image/share 互斥侧）
  if (shareImageSource === null && !imageFromMarker && plan?.shareImageSource != null) {
    shareImageSource = plan.shareImageSource;
  }
  if (imagePrompt === null && shareImageSource === null && plan?.imagePrompt != null) {
    imagePrompt = plan.imagePrompt;
  }
  if (musicQuery === null && plan?.musicQuery != null) {
    musicQuery = plan.musicQuery;
  }
  if (!wantsVoice && plan?.wantsVoice) {
    wantsVoice = true;
  }

  // ③ 本地兜底（仍空才补）
  if (musicQuery === null) {
    if (
      /发(?:了|来|出)?(?:一张|一条|首)?(?:音乐|歌曲)?卡片|调用.*(?:网易云|点歌)|网易云链接|给你放(?:了)?一首|帮你放(?:了)?一首|我(?:给)?你点(?:了)?/.test(
        assistantRaw
      )
    ) {
      musicQuery = sanitizeMusicQuery(extractMusicQueryFromText(assistantRaw)) ?? "";
    }
  }

  if (shareImageSource === null && (hasWebImageIntent(userContent) || assistantClaimedWebImage(assistantRaw))) {
    if (!lastUserHasImageAttachment(chatId)) {
      shareImageSource =
        assistantRaw.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/i)?.[0]?.replace(/[),.;!?，。！？]+$/g, "") ||
        userContent.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/i)?.[0]?.replace(/[),.;!?，。！？]+$/g, "") ||
        userContent.replace(/\s+/g, " ").trim().slice(0, 80);
      imagePrompt = null;
      console.log(
        `[toolDispatcher] local-backfill shareImage=${JSON.stringify(shareImageSource).slice(0, 100)}`
      );
    }
  }

  if (imagePrompt === null && shareImageSource === null) {
    if (assistantRoleplayedImageWithoutMarker(assistantRaw)) {
      imagePrompt =
        imagePromptFromAssistantText(assistantRaw) ||
        fallbackImagePromptFromRecentAssistant(chatId) ||
        fallbackImagePromptFromUserMessage(userContent);
    } else if (hasImageGenIntent(userContent) && !hasWebImageIntent(userContent)) {
      imagePrompt =
        imagePromptFromAssistantText(assistantRaw) ||
        fallbackImagePromptFromUserMessage(userContent) ||
        fallbackImagePromptFromRecentAssistant(chatId) ||
        "按对话语境绘制用户要求看到的场景，画面干净、氛围贴合当下";
      console.log(
        `[toolDispatcher] local-backfill image from user intent prompt=${JSON.stringify(imagePrompt).slice(0, 120)}`
      );
    }
  }

  if (!wantsVoice && assistantRoleplayedVoiceWithoutMarker(assistantRaw)) {
    wantsVoice = true;
  }

  let text = afterVoice.trim() || assistantRaw.trim();
  text = stripRoleplayedAgentArtifacts(text);
  text = stripRoleplayedImageArtifacts(text);
  text = stripRoleplayedVoiceArtifacts(text);
  if (!text.trim()) {
    if (shareImageSource) text = "好，我去找。";
    else if (imagePrompt && musicQuery !== null) text = "好。";
    else if (imagePrompt) text = "好，我去画。";
    else if (musicQuery !== null) text = "好，我去放。";
    else if (wantsVoice) text = "嗯。";
    else text = assistantRaw.trim();
  }

  return {
    cleanAssistantText: text.trim(),
    imagePrompt,
    shareImageSource,
    musicQuery,
    wantsVoice,
  };
}

export async function finalizeAssistantReplyWithOptionalImage(
  res: Response,
  chatId: string,
  character: StoredCharacter,
  rawAssistantText: string,
  latestContextLog: Record<string, unknown>,
  reasoning?: string,
  options?: {
    contentPrefix?: string;
    injectedMemories?: InjectedMemorySnap[];
    injectedActivities?: import("../activity/types.js").InjectedActivitySnap[];
  }
): Promise<void> {
  const settings = loadSettings();
  const dispatcherOn = isToolDispatcherActive();

  // Pass2 仅作漏调兜底；Invisible Agent 已在 RP 前写入 TurnToolPlan
  if (dispatcherOn) {
    await runToolDispatcherPass2(chatId, rawAssistantText);
  }
  const plan = takeTurnToolPlan(chatId);
  const resolved = resolveDispatcherFollowUps(chatId, rawAssistantText, plan);

  let cleanAssistantText = resolved.cleanAssistantText;
  let musicQuery = settings.musicEnabled !== false ? resolved.musicQuery : null;
  let imagePrompt = settings.imageGenEnabled !== false ? resolved.imagePrompt : null;
  let shareImageSource = resolved.shareImageSource;
  let wantsVoice =
    settings.assistantVoiceReplyEnabled !== false &&
    settings.voiceMessagesEnabled !== false &&
    resolved.wantsVoice;

  const inv = peekInvisibleInjections(chatId);
  const didKeep = Boolean(
    plan?.keepDone || inv.outcome?.results.some((r) => r.tool === "keep" && r.ok)
  );
  cleanAssistantText = stripUnsupportedToolClaims(cleanAssistantText, {
    willMusic: musicQuery !== null,
    willImage: Boolean(imagePrompt),
    willShareImage: Boolean(shareImageSource),
    willVoice: wantsVoice,
    didKeep,
  });

  if (
    (musicQuery !== null && plan?.musicQuery == null) ||
    (imagePrompt && !plan?.imagePrompt) ||
    (shareImageSource && !plan?.shareImageSource) ||
    (wantsVoice && !plan?.wantsVoice)
  ) {
    console.log(
      `[invisibleAgent] followUp fill music=${JSON.stringify(musicQuery)} ` +
        `image=${imagePrompt ? "yes" : "no"} shareImage=${shareImageSource ? "yes" : "no"} voice=${wantsVoice}`
    );
  }

  let contentPrefix = options?.contentPrefix?.trim() || "";

  const userName = loadUserPersona().name?.trim() || "你";
  const cleanedBody = sanitizeAssistantOutput(
    cleanAssistantText,
    character.data.name,
    userName
  );
  const savedText = contentPrefix ? `${contentPrefix}\n\n${cleanedBody}` : cleanedBody;

  const injectedMemories = options?.injectedMemories?.length
    ? options.injectedMemories
    : undefined;
  const injectedActivities = options?.injectedActivities?.length
    ? options.injectedActivities
    : undefined;
  const current = getChat(chatId);
  const lastRole = current?.messages[current.messages.length - 1]?.role;
  let textMsg =
    lastRole === "assistant"
      ? replaceLastAssistant(chatId, savedText, latestContextLog, reasoning, {
          injectedMemories: injectedMemories ?? [],
          injectedActivities: injectedActivities ?? [],
        }) ??
        appendAssistantMessage(chatId, savedText, latestContextLog, reasoning, undefined, undefined, {
          injectedMemories,
          injectedActivities,
        })
      : appendAssistantMessage(chatId, savedText, latestContextLog, reasoning, undefined, undefined, {
          injectedMemories,
          injectedActivities,
        });

  res.write(
    `data: ${JSON.stringify({
      type: "done",
      message: textMsg,
      content: textMsg.content,
      reasoning,
      contextLog: latestContextLog,
    })}\n\n`
  );

  if (musicQuery !== null) {
    res.write(`data: ${JSON.stringify({ type: "music_searching" })}\n\n`);
    const musicResult = await runMusicFollowUp(chatId, musicQuery, character.data.name);
    if (!musicResult.ok) {
      const merged = appendToolFailureExplanation(textMsg.content, "点歌", musicResult.error, userName);
      const updated = replaceLastAssistant(chatId, merged, latestContextLog, reasoning);
      if (updated) textMsg = updated;
      res.write(
        `data: ${JSON.stringify({
          type: "music_done",
          message: textMsg,
        })}\n\n`
      );
    } else {
      res.write(
        `data: ${JSON.stringify({
          type: "music_done",
          message: musicResult.message,
        })}\n\n`
      );
    }
  }

  if (shareImageSource) {
    res.write(`data: ${JSON.stringify({ type: "image_generating" })}\n\n`);
    const shareResult = await runWebImageShareFollowUp(chatId, shareImageSource);
    if (!shareResult.ok) {
      const merged = appendToolFailureExplanation(textMsg.content, "网页找图", shareResult.error, userName);
      const updated = replaceLastAssistant(chatId, merged, latestContextLog, reasoning);
      if (updated) textMsg = updated;
      res.write(
        `data: ${JSON.stringify({
          type: "image_done",
          message: textMsg,
        })}\n\n`
      );
    } else {
      res.write(
        `data: ${JSON.stringify({
          type: "image_done",
          message: shareResult.message,
        })}\n\n`
      );
    }
  } else if (imagePrompt) {
    res.write(`data: ${JSON.stringify({ type: "image_generating" })}\n\n`);
    const imageResult = await runImageGenFollowUp(chatId, imagePrompt, character.data.name);
    if (!imageResult.ok) {
      const merged = appendToolFailureExplanation(textMsg.content, "生图", imageResult.error, userName);
      const updated = replaceLastAssistant(chatId, merged, latestContextLog, reasoning);
      if (updated) textMsg = updated;
      res.write(
        `data: ${JSON.stringify({
          type: "image_done",
          message: textMsg,
        })}\n\n`
      );
    } else {
      res.write(
        `data: ${JSON.stringify({
          type: "image_done",
          message: imageResult.message,
        })}\n\n`
      );
    }
  }

  if (wantsVoice) {
    const voiceSource =
      getChat(chatId)?.messages.find((m) => m.id === textMsg.id)?.content || textMsg.content;
    await runAssistantVoiceFollowUp(res, chatId, character.id, voiceSource);
  }

  res.end();
}
