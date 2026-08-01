import type { Request, Response } from "express";
import bcrypt from "bcryptjs";
import {
  loadSettings,
  saveSettings,
  getDeepSeekKeySource,
  type NewApiChannelConn,
  type OpenAiCompatConn,
  type VolcanoTtsConn,
} from "../config.js";
import { testOpenAiCompatConn } from "../services/openaiCompat.js";
import { testImageGenConn, testNewApiConn, testVisionConn } from "../services/newApiClient.js";
import { testVolcanoTtsConn } from "../services/volcanoTts.js";
import { testOpenAiTtsConn } from "../services/openaiTts.js";
import { testNetEaseMusicConn } from "../music/neteaseClient.js";
import { normalizeNetEaseCookie } from "../music/cookieUtil.js";
import { testWeReadConn } from "../weread/client.js";
import { testBilibiliConn } from "../bilibili/client.js";
import { testZhihuConn } from "../zhihu/client.js";
import { testZhihuOpenConn } from "../zhihu/openPlatform.js";
import { testCookieCloudConn } from "../cookieCloud/shared.js";
import { probeLeann } from "../leann/client.js";
import { isDeepSeekThinkingMode } from "../deepseekModels.js";
import { testDeepSeekConn } from "../deepseek.js";
import { rescheduleAllProactiveChats } from "../proactive/state.js";

function keyPreview(key: string): string {
  if (!key) return "";
  if (key.length <= 10) return `${key.slice(0, 3)}...`;
  return `${key.slice(0, 6)}...${key.slice(-4)}`;
}

function cookiePreview(cookie: string): string {
  if (!cookie) return "";
  if (cookie.length <= 16) return `${cookie.slice(0, 4)}...`;
  return `${cookie.slice(0, 8)}...${cookie.slice(-4)}`;
}

function connFull(conn: { apiKey?: string; baseUrl?: string; defaultModel?: string }) {
  return {
    baseUrl: conn.baseUrl || "",
    apiKey: conn.apiKey || "",
    defaultModel: conn.defaultModel || "",
    hasKey: Boolean(conn.apiKey),
    keyPreview: keyPreview(conn.apiKey || ""),
  };
}

export function getSettingsHandler(_req: Request, res: Response): void {
  const settings = loadSettings();
  const deepseekKeySource = getDeepSeekKeySource(settings);
  res.json({
    hasDeepseekKey: Boolean(settings.deepseekApiKey?.trim()),
    deepseekKeySource,
    deepseekApiKey: settings.deepseekApiKey || "",
    deepseekApiKeyPreview: keyPreview(settings.deepseekApiKey),
    model: settings.model,
    deepseekThinking: settings.deepseekThinking || "enabled",
    deepseekReasoningEffort: settings.deepseekReasoningEffort || "high",
    deepseekThinkingEnabled: isDeepSeekThinkingMode(settings),
    temperature: settings.temperature,
    topP: settings.topP,
    topK: settings.topK,
    frequencyPenalty: settings.frequencyPenalty,
    presencePenalty: settings.presencePenalty,
    maxTokens: settings.maxTokens,
    maxContext: settings.maxContext,
    mainPrompt: settings.mainPrompt,
    jailbreakPrompt: settings.jailbreakPrompt,
    postHistoryInstructions: settings.postHistoryInstructions,
    memorySummarizePrompt: settings.memorySummarizePrompt,
    memorySelectPrompt: settings.memorySelectPrompt,
    memoryInsertPrompt: settings.memoryInsertPrompt,
    coreadSelectPrompt: settings.coreadSelectPrompt || "",
    coreadInsertPrompt: settings.coreadInsertPrompt || "",
    coreadDigestPrompt: settings.coreadDigestPrompt || "",
    memoryChunkSize: settings.memoryChunkSize,
    memoryChunkOverlap: settings.memoryChunkOverlap,
    memoryRetrieveCount: settings.memoryRetrieveCount,
    memoryScoreThreshold: settings.memoryScoreThreshold,
    autoSummarizeChat: settings.autoSummarizeChat,
    openaiCompat: connFull(settings.openaiCompat),
    toolDispatcherEnabled: settings.toolDispatcherEnabled === true,
    toolDispatcher: connFull(settings.toolDispatcher || { baseUrl: "", apiKey: "" }),
    imageGenConn: connFull(settings.imageGenConn),
    imageViewConn: connFull(settings.imageViewConn),
    volcanoTts: {
      endpoint: settings.volcanoTts.endpoint,
      resourceId: settings.volcanoTts.resourceId,
      appId: settings.volcanoTts.appId,
      accessToken: settings.volcanoTts.accessToken || "",
      secretKey: settings.volcanoTts.secretKey || "",
      hasAccessToken: Boolean(settings.volcanoTts.accessToken),
      accessTokenPreview: keyPreview(settings.volcanoTts.accessToken),
      hasSecretKey: Boolean(settings.volcanoTts.secretKey),
      secretKeyPreview: keyPreview(settings.volcanoTts.secretKey),
      defaultSpeaker: settings.volcanoTts.defaultSpeaker || "",
    },
    webSearchEnabled: settings.webSearchEnabled !== false,
    musicEnabled: settings.musicEnabled !== false,
    imageGenEnabled: settings.imageGenEnabled !== false,
    imageViewEnabled: settings.imageViewEnabled !== false,
    volcanoTtsEnabled: settings.volcanoTtsEnabled !== false,
    ttsProvider: settings.ttsProvider === "openai" ? "openai" : "volcano",
    openaiTtsModel: settings.openaiTtsModel || "gpt-4o-mini-tts",
    openaiTtsVoice: settings.openaiTtsVoice || "alloy",
    voiceMessagesEnabled: settings.voiceMessagesEnabled !== false,
    assistantVoiceReplyEnabled: settings.assistantVoiceReplyEnabled !== false,
    volcanoAsrEnabled: settings.volcanoAsrEnabled !== false,
    volcanoAsrEndpoint:
      settings.volcanoAsrEndpoint ||
      "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash",
    volcanoAsrResourceId: settings.volcanoAsrResourceId || "volc.bigasr.auc_turbo",
    openaiCompatEnabled: settings.openaiCompatEnabled === true,
    wereadEnabled: settings.wereadEnabled !== false,
    bilibiliEnabled: settings.bilibiliEnabled !== false,
    zhihuEnabled: settings.zhihuEnabled !== false,
    keepEnabled: settings.keepEnabled !== false,
    proactiveMessagingEnabled: settings.proactiveMessagingEnabled !== false,
    proactivePrompt: settings.proactivePrompt || "",
    proactiveTimingMode: settings.proactiveTimingMode === "fixed" ? "fixed" : "random",
    proactiveMinGapHours: settings.proactiveMinGapHours ?? 3,
    proactiveMaxRandomHours: settings.proactiveMaxRandomHours ?? 0,
    proactiveFixedTime: settings.proactiveFixedTime || "20:00",
    proactiveQuietStartHour: settings.proactiveQuietStartHour ?? 22,
    proactiveQuietEndHour: settings.proactiveQuietEndHour ?? 10,
    leannEnabled: settings.leannEnabled === true,
    leannPythonPath: settings.leannPythonPath || "python",
    leannEmbeddingMode: settings.leannEmbeddingMode || "",
    leannRetrieveCount: settings.leannRetrieveCount ?? 5,
    leannScoreThreshold: settings.leannScoreThreshold ?? 0,
    obsidianEnabled: settings.obsidianEnabled === true,
    obsidianVaultPath: settings.obsidianVaultPath || "",
    obsidianVaultName: settings.obsidianVaultName || "",
    obsidianWhitelistDirs:
      settings.obsidianWhitelistDirs || "*",
    obsidianNightlyEnabled: settings.obsidianNightlyEnabled === true,
    obsidianNightlyHour: settings.obsidianNightlyHour ?? 21,
    obsidianMaxCommentsPerNight: settings.obsidianMaxCommentsPerNight ?? 3,
    obsidianPushNotify: settings.obsidianPushNotify !== false,
    obsidianPrompt: settings.obsidianPrompt || "",
    personaDigestEnabled: settings.personaDigestEnabled !== false,
    neteaseMusic: {
      cookie: settings.neteaseMusic.cookie || "",
      hasCookie: Boolean(settings.neteaseMusic.cookie),
      cookiePreview: cookiePreview(settings.neteaseMusic.cookie || ""),
      playlistUrl: settings.neteaseMusic.playlistUrl || "",
      playlistId: settings.neteaseMusic.playlistId || "",
      cookieCloud: {
        url: settings.neteaseMusic.cookieCloud?.url || "",
        id: settings.neteaseMusic.cookieCloud?.id || "",
        password: settings.neteaseMusic.cookieCloud?.password || "",
        hasPassword: Boolean(settings.neteaseMusic.cookieCloud?.password),
      },
    },
    weread: {
      cookie: settings.weread.cookie || "",
      hasCookie: Boolean(settings.weread.cookie),
      cookiePreview: cookiePreview(settings.weread.cookie || ""),
      cookieCloud: {
        url: settings.weread.cookieCloud?.url || "",
        id: settings.weread.cookieCloud?.id || "",
        password: settings.weread.cookieCloud?.password || "",
        hasPassword: Boolean(settings.weread.cookieCloud?.password),
      },
    },
    bilibili: {
      cookie: settings.bilibili.cookie || "",
      hasCookie: Boolean(settings.bilibili.cookie),
      cookiePreview: cookiePreview(settings.bilibili.cookie || ""),
      cookieCloud: {
        url: settings.bilibili.cookieCloud?.url || "",
        id: settings.bilibili.cookieCloud?.id || "",
        password: settings.bilibili.cookieCloud?.password || "",
        hasPassword: Boolean(settings.bilibili.cookieCloud?.password),
      },
    },
    zhihu: {
      cookie: settings.zhihu.cookie || "",
      hasCookie: Boolean(settings.zhihu.cookie),
      cookiePreview: cookiePreview(settings.zhihu.cookie || ""),
      accessSecret: settings.zhihu.accessSecret || "",
      hasAccessSecret: Boolean(settings.zhihu.accessSecret?.trim()),
      accessSecretPreview: keyPreview(settings.zhihu.accessSecret || ""),
      cookieCloud: {
        url: settings.zhihu.cookieCloud?.url || "",
        id: settings.zhihu.cookieCloud?.id || "",
        password: settings.zhihu.cookieCloud?.password || "",
        hasPassword: Boolean(settings.zhihu.cookieCloud?.password),
      },
    },
  });
}

function mergeConn<T extends { apiKey?: string }>(current: T, patch: Partial<T> | undefined): T {
  if (!patch) return current;
  const next = { ...current, ...patch };
  if (typeof patch.apiKey === "string") {
    next.apiKey = patch.apiKey.trim() ? patch.apiKey.trim() : current.apiKey;
  }
  return next;
}

function mergeVolcano(current: VolcanoTtsConn, patch?: Partial<VolcanoTtsConn>): VolcanoTtsConn {
  if (!patch) return current;
  const next = { ...current, ...patch };
  if (typeof patch.accessToken === "string") {
    next.accessToken = patch.accessToken.trim() ? patch.accessToken.trim() : current.accessToken;
  }
  if (typeof patch.secretKey === "string") {
    next.secretKey = patch.secretKey.trim() ? patch.secretKey.trim() : current.secretKey;
  }
  return next;
}

export async function updateSettingsHandler(req: Request, res: Response): Promise<void> {
  const body = req.body as Record<string, unknown>;
  const settings = loadSettings();

  if (typeof body.deepseekApiKey === "string" && body.deepseekApiKey.trim()) {
    settings.deepseekApiKey = body.deepseekApiKey.trim();
  }
  if (typeof body.model === "string") settings.model = body.model;
  if (body.deepseekThinking === "enabled" || body.deepseekThinking === "disabled") {
    settings.deepseekThinking = body.deepseekThinking;
  }
  if (
    body.deepseekReasoningEffort === "low" ||
    body.deepseekReasoningEffort === "high" ||
    body.deepseekReasoningEffort === "max"
  ) {
    settings.deepseekReasoningEffort = body.deepseekReasoningEffort;
  }
  if (typeof body.temperature === "number") settings.temperature = body.temperature;
  if (typeof body.topP === "number") settings.topP = body.topP;
  if (typeof body.topK === "number") settings.topK = body.topK;
  if (typeof body.frequencyPenalty === "number") settings.frequencyPenalty = body.frequencyPenalty;
  if (typeof body.presencePenalty === "number") settings.presencePenalty = body.presencePenalty;
  if (typeof body.maxTokens === "number") settings.maxTokens = body.maxTokens;
  if (typeof body.maxContext === "number") settings.maxContext = body.maxContext;
  if (typeof body.mainPrompt === "string") settings.mainPrompt = body.mainPrompt;
  if (typeof body.jailbreakPrompt === "string") settings.jailbreakPrompt = body.jailbreakPrompt;
  if (typeof body.postHistoryInstructions === "string") {
    settings.postHistoryInstructions = body.postHistoryInstructions;
  }
  if (typeof body.memorySummarizePrompt === "string") {
    settings.memorySummarizePrompt = body.memorySummarizePrompt;
  }
  if (typeof body.memorySelectPrompt === "string") settings.memorySelectPrompt = body.memorySelectPrompt;
  if (typeof body.memoryInsertPrompt === "string") settings.memoryInsertPrompt = body.memoryInsertPrompt;
  if (typeof body.coreadSelectPrompt === "string") settings.coreadSelectPrompt = body.coreadSelectPrompt;
  if (typeof body.coreadInsertPrompt === "string") settings.coreadInsertPrompt = body.coreadInsertPrompt;
  if (typeof body.coreadDigestPrompt === "string") settings.coreadDigestPrompt = body.coreadDigestPrompt;
  if (typeof body.memoryChunkSize === "number") settings.memoryChunkSize = body.memoryChunkSize;
  if (typeof body.memoryChunkOverlap === "number") settings.memoryChunkOverlap = body.memoryChunkOverlap;
  if (typeof body.memoryRetrieveCount === "number") settings.memoryRetrieveCount = body.memoryRetrieveCount;
  if (typeof body.memoryScoreThreshold === "number") {
    settings.memoryScoreThreshold = body.memoryScoreThreshold;
  }
  if (typeof body.autoSummarizeChat === "boolean") settings.autoSummarizeChat = body.autoSummarizeChat;
  if (typeof body.webSearchEnabled === "boolean") settings.webSearchEnabled = body.webSearchEnabled;
  if (typeof body.musicEnabled === "boolean") settings.musicEnabled = body.musicEnabled;
  if (typeof body.imageGenEnabled === "boolean") settings.imageGenEnabled = body.imageGenEnabled;
  if (typeof body.imageViewEnabled === "boolean") settings.imageViewEnabled = body.imageViewEnabled;
  if (typeof body.volcanoTtsEnabled === "boolean") settings.volcanoTtsEnabled = body.volcanoTtsEnabled;
  if (body.ttsProvider === "openai" || body.ttsProvider === "volcano") {
    settings.ttsProvider = body.ttsProvider;
  }
  if (typeof body.openaiTtsModel === "string") {
    settings.openaiTtsModel = body.openaiTtsModel.trim() || "gpt-4o-mini-tts";
  }
  if (typeof body.openaiTtsVoice === "string") {
    settings.openaiTtsVoice = body.openaiTtsVoice.trim() || "alloy";
  }
  if (typeof body.voiceMessagesEnabled === "boolean") {
    settings.voiceMessagesEnabled = body.voiceMessagesEnabled;
  }
  if (typeof body.assistantVoiceReplyEnabled === "boolean") {
    settings.assistantVoiceReplyEnabled = body.assistantVoiceReplyEnabled;
  }
  if (typeof body.volcanoAsrEnabled === "boolean") settings.volcanoAsrEnabled = body.volcanoAsrEnabled;
  if (typeof body.volcanoAsrEndpoint === "string") {
    settings.volcanoAsrEndpoint = body.volcanoAsrEndpoint.trim();
  }
  if (typeof body.volcanoAsrResourceId === "string") {
    settings.volcanoAsrResourceId = body.volcanoAsrResourceId.trim() || "volc.bigasr.auc_turbo";
  }
  if (typeof body.openaiCompatEnabled === "boolean") settings.openaiCompatEnabled = body.openaiCompatEnabled;
  if (typeof body.wereadEnabled === "boolean") settings.wereadEnabled = body.wereadEnabled;
  if (typeof body.bilibiliEnabled === "boolean") settings.bilibiliEnabled = body.bilibiliEnabled;
  if (typeof body.zhihuEnabled === "boolean") settings.zhihuEnabled = body.zhihuEnabled;
  if (typeof body.keepEnabled === "boolean") settings.keepEnabled = body.keepEnabled;
  if (typeof body.toolDispatcherEnabled === "boolean") {
    settings.toolDispatcherEnabled = body.toolDispatcherEnabled;
  }
  if (typeof body.proactiveMessagingEnabled === "boolean") {
    settings.proactiveMessagingEnabled = body.proactiveMessagingEnabled;
  }
  if (typeof body.proactivePrompt === "string") settings.proactivePrompt = body.proactivePrompt;
  if (body.proactiveTimingMode === "random" || body.proactiveTimingMode === "fixed") {
    settings.proactiveTimingMode = body.proactiveTimingMode;
  }
  if (typeof body.proactiveMinGapHours === "number") {
    settings.proactiveMinGapHours = Math.min(72, Math.max(1, body.proactiveMinGapHours));
  }
  if (typeof body.proactiveMaxRandomHours === "number") {
    settings.proactiveMaxRandomHours = Math.min(72, Math.max(0, body.proactiveMaxRandomHours));
  }
  if (typeof body.proactiveFixedTime === "string") {
    settings.proactiveFixedTime = body.proactiveFixedTime.trim() || settings.proactiveFixedTime;
  }
  if (typeof body.proactiveQuietStartHour === "number") {
    settings.proactiveQuietStartHour = Math.min(23, Math.max(0, body.proactiveQuietStartHour));
  }
  if (typeof body.proactiveQuietEndHour === "number") {
    settings.proactiveQuietEndHour = Math.min(23, Math.max(0, body.proactiveQuietEndHour));
  }
  if (typeof body.leannEnabled === "boolean") settings.leannEnabled = body.leannEnabled;
  if (typeof body.leannPythonPath === "string") settings.leannPythonPath = body.leannPythonPath.trim() || "python";
  if (typeof body.leannEmbeddingMode === "string") settings.leannEmbeddingMode = body.leannEmbeddingMode.trim();
  if (typeof body.leannRetrieveCount === "number") settings.leannRetrieveCount = body.leannRetrieveCount;
  if (typeof body.leannScoreThreshold === "number") settings.leannScoreThreshold = body.leannScoreThreshold;
  if (typeof body.obsidianEnabled === "boolean") settings.obsidianEnabled = body.obsidianEnabled;
  if (typeof body.obsidianVaultPath === "string") {
    const { normalizeVaultPathInput } = await import("../obsidian/vault.js");
    settings.obsidianVaultPath = normalizeVaultPathInput(body.obsidianVaultPath);
  }
  if (typeof body.obsidianVaultName === "string") {
    settings.obsidianVaultName = body.obsidianVaultName.trim();
  }
  if (typeof body.obsidianWhitelistDirs === "string") {
    settings.obsidianWhitelistDirs = body.obsidianWhitelistDirs.trim();
  }
  if (typeof body.obsidianNightlyEnabled === "boolean") {
    settings.obsidianNightlyEnabled = body.obsidianNightlyEnabled;
  }
  if (typeof body.obsidianNightlyHour === "number") {
    settings.obsidianNightlyHour = Math.min(23, Math.max(0, Math.round(body.obsidianNightlyHour)));
  }
  if (typeof body.obsidianMaxCommentsPerNight === "number") {
    settings.obsidianMaxCommentsPerNight = Math.min(
      10,
      Math.max(1, Math.round(body.obsidianMaxCommentsPerNight))
    );
  }
  if (typeof body.obsidianPushNotify === "boolean") {
    settings.obsidianPushNotify = body.obsidianPushNotify;
  }
  if (typeof body.personaDigestEnabled === "boolean") {
    settings.personaDigestEnabled = body.personaDigestEnabled;
  }
  if (typeof body.obsidianPrompt === "string") {
    settings.obsidianPrompt = body.obsidianPrompt;
  }

  settings.openaiCompat = mergeConn(
    settings.openaiCompat,
    body.openaiCompat as Partial<OpenAiCompatConn>
  );
  settings.toolDispatcher = mergeConn(
    settings.toolDispatcher || { baseUrl: "", apiKey: "" },
    body.toolDispatcher as Partial<OpenAiCompatConn>
  );
  settings.imageGenConn = mergeConn(
    settings.imageGenConn,
    body.imageGenConn as Partial<NewApiChannelConn>
  );
  settings.imageViewConn = mergeConn(
    settings.imageViewConn,
    body.imageViewConn as Partial<NewApiChannelConn>
  );
  settings.volcanoTts = mergeVolcano(
    settings.volcanoTts,
    body.volcanoTts as Partial<VolcanoTtsConn>
  );

  if (body.neteaseMusic && typeof body.neteaseMusic === "object") {
    const patch = body.neteaseMusic as {
      cookie?: string;
      playlistUrl?: string;
      playlistId?: string;
      cookieCloud?: { url?: string; id?: string; password?: string };
    };
    if (typeof patch.cookie === "string" && patch.cookie.trim()) {
      settings.neteaseMusic.cookie = normalizeNetEaseCookie(patch.cookie);
    }
    if (typeof patch.playlistUrl === "string") {
      settings.neteaseMusic.playlistUrl = patch.playlistUrl.trim();
    }
    if (typeof patch.playlistId === "string") {
      settings.neteaseMusic.playlistId = patch.playlistId.trim();
    }
    if (patch.cookieCloud && typeof patch.cookieCloud === "object") {
      const cc = patch.cookieCloud;
      if (typeof cc.url === "string") settings.neteaseMusic.cookieCloud!.url = cc.url.trim();
      if (typeof cc.id === "string") settings.neteaseMusic.cookieCloud!.id = cc.id.trim();
      if (typeof cc.password === "string" && cc.password.trim()) {
        settings.neteaseMusic.cookieCloud!.password = cc.password.trim();
      }
    }
  }

  if (body.weread && typeof body.weread === "object") {
    const patch = body.weread as {
      cookie?: string;
      cookieCloud?: { url?: string; id?: string; password?: string };
    };
    if (typeof patch.cookie === "string" && patch.cookie.trim()) {
      settings.weread.cookie = patch.cookie.trim();
    }
    if (patch.cookieCloud && typeof patch.cookieCloud === "object") {
      const cc = patch.cookieCloud;
      if (typeof cc.url === "string") settings.weread.cookieCloud!.url = cc.url.trim();
      if (typeof cc.id === "string") settings.weread.cookieCloud!.id = cc.id.trim();
      if (typeof cc.password === "string" && cc.password.trim()) {
        settings.weread.cookieCloud!.password = cc.password.trim();
      }
    }
  }

  if (body.bilibili && typeof body.bilibili === "object") {
    const patch = body.bilibili as {
      cookie?: string;
      cookieCloud?: { url?: string; id?: string; password?: string };
    };
    if (typeof patch.cookie === "string" && patch.cookie.trim()) {
      settings.bilibili.cookie = patch.cookie.trim();
    }
    if (patch.cookieCloud && typeof patch.cookieCloud === "object") {
      const cc = patch.cookieCloud;
      if (typeof cc.url === "string") settings.bilibili.cookieCloud!.url = cc.url.trim();
      if (typeof cc.id === "string") settings.bilibili.cookieCloud!.id = cc.id.trim();
      if (typeof cc.password === "string" && cc.password.trim()) {
        settings.bilibili.cookieCloud!.password = cc.password.trim();
      }
    }
  }

  if (body.zhihu && typeof body.zhihu === "object") {
    const patch = body.zhihu as {
      cookie?: string;
      accessSecret?: string;
      cookieCloud?: { url?: string; id?: string; password?: string };
    };
    if (typeof patch.cookie === "string" && patch.cookie.trim()) {
      settings.zhihu.cookie = patch.cookie.trim();
    }
    if (typeof patch.accessSecret === "string" && patch.accessSecret.trim()) {
      settings.zhihu.accessSecret = patch.accessSecret.trim();
    }
    if (patch.cookieCloud && typeof patch.cookieCloud === "object") {
      const cc = patch.cookieCloud;
      if (typeof cc.url === "string") settings.zhihu.cookieCloud!.url = cc.url.trim();
      if (typeof cc.id === "string") settings.zhihu.cookieCloud!.id = cc.id.trim();
      if (typeof cc.password === "string" && cc.password.trim()) {
        settings.zhihu.cookieCloud!.password = cc.password.trim();
      }
    }
  }

  const newPassword = body.newPassword;
  if (typeof newPassword === "string" && newPassword.length >= 4) {
    settings.appPasswordHash = await bcrypt.hash(newPassword, 10);
  }

  const proactiveTouched =
    body.proactiveMessagingEnabled !== undefined ||
    body.proactivePrompt !== undefined ||
    body.proactiveTimingMode !== undefined ||
    body.proactiveMinGapHours !== undefined ||
    body.proactiveMaxRandomHours !== undefined ||
    body.proactiveFixedTime !== undefined ||
    body.proactiveQuietStartHour !== undefined ||
    body.proactiveQuietEndHour !== undefined;

  const obsidianTouched =
    body.obsidianEnabled !== undefined ||
    body.obsidianNightlyEnabled !== undefined ||
    body.obsidianNightlyHour !== undefined;

  saveSettings(settings);
  if (proactiveTouched && settings.proactiveMessagingEnabled !== false) {
    rescheduleAllProactiveChats();
  }
  if (obsidianTouched) {
    try {
      const { rescheduleObsidianNightly } = await import("../obsidian/scheduler.js");
      rescheduleObsidianNightly();
    } catch {
      /* ignore */
    }
  }
  res.json({ success: true });
}

export async function testIntegrationHandler(req: Request, res: Response): Promise<void> {
  const kind = req.params.kind;
  const settings = loadSettings();

  try {
    let message = "";
    switch (kind) {
      case "deepseek": {
        const body = req.body as { model?: string; apiKey?: string };
        const key =
          typeof body.apiKey === "string" && body.apiKey.trim()
            ? body.apiKey.trim()
            : settings.deepseekApiKey?.trim() || "";
        if (!key) {
          res.status(400).json({
            error:
              "DeepSeek API Key 未配置：请在上方输入 Key，或在项目根目录 .env 设置 DEEPSEEK_API_KEY 后重启服务",
          });
          return;
        }
        message = await testDeepSeekConn(key, body.model || settings.model);
        break;
      }
      case "openai":
        message = await testOpenAiCompatConn(settings.openaiCompat);
        break;
      case "tool-dispatcher": {
        const body = req.body as {
          baseUrl?: string;
          apiKey?: string;
          defaultModel?: string;
        };
        const conn = {
          baseUrl:
            typeof body.baseUrl === "string" && body.baseUrl.trim()
              ? body.baseUrl.trim()
              : settings.toolDispatcher?.baseUrl || "",
          apiKey:
            typeof body.apiKey === "string" && body.apiKey.trim()
              ? body.apiKey.trim()
              : settings.toolDispatcher?.apiKey || "",
          defaultModel:
            typeof body.defaultModel === "string"
              ? body.defaultModel
              : settings.toolDispatcher?.defaultModel,
        };
        message = await testOpenAiCompatConn(conn);
        break;
      }
      case "image-gen": {
        const body = req.body as { model?: string };
        message = await testImageGenConn(settings.imageGenConn, body.model);
        break;
      }
      case "image-view": {
        const body = req.body as { model?: string };
        message = await testVisionConn(settings.imageViewConn, body.model);
        break;
      }
      case "tts": {
        const body = req.body as {
          speaker?: string;
          voice?: string;
          model?: string;
          provider?: string;
        };
        const provider =
          body.provider === "openai" || body.provider === "volcano"
            ? body.provider
            : settings.ttsProvider === "openai"
              ? "openai"
              : "volcano";
        if (provider === "openai") {
          const result = await testOpenAiTtsConn(settings.openaiCompat, {
            model: body.model || settings.openaiTtsModel,
            voice: body.voice || body.speaker || settings.openaiTtsVoice,
          });
          res.json({
            success: true,
            message: result.message,
            audioBase64: result.audioBase64,
            format: result.format,
          });
          return;
        }
        message = await testVolcanoTtsConn(settings.volcanoTts, body.speaker);
        break;
      }
      case "netease-music":
        message = await testNetEaseMusicConn(settings.neteaseMusic);
        break;
      case "weread":
        message = await testWeReadConn(settings.weread);
        break;
      case "bilibili":
        message = await testBilibiliConn(settings.bilibili);
        break;
      case "zhihu":
        message = await testZhihuConn(settings.zhihu);
        break;
      case "zhihu-open":
        message = await testZhihuOpenConn(settings.zhihu);
        break;
      case "cookiecloud": {
        const body = req.body as {
          cookieCloud?: { url?: string; id?: string; password?: string };
        };
        const input = body.cookieCloud ?? {};
        const stored = settings.neteaseMusic.cookieCloud ?? settings.weread.cookieCloud;
        const cc = {
          url: (input.url?.trim() || stored?.url || "").trim(),
          id: (input.id?.trim() || stored?.id || "").trim(),
          password: (input.password?.trim() || stored?.password || "").trim(),
        };
        message = await testCookieCloudConn(cc, [
          { label: "网易云", needles: ["music.163.com", "163.com"] },
          { label: "微信读书", needles: ["weread.qq.com", "weread"] },
          { label: "Bilibili", needles: ["bilibili.com", "bilibili"] },
          { label: "知乎", needles: ["zhihu.com", "zhihu"] },
        ]);
        break;
      }
      case "leann": {
        const probe = await probeLeann();
        if (!probe.ok) {
          res.status(400).json({ error: probe.error || "LEANN 不可用" });
          return;
        }
        message = `LEANN 就绪（${probe.version || "unknown"}${probe.pdf ? "，PDF 可解析" : "，PDF 需 pip install pymupdf"}）`;
        break;
      }
      default:
        res.status(400).json({ error: "未知测试类型" });
        return;
    }
    res.json({ success: true, message });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "测试失败" });
  }
}
