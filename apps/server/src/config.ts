import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 项目根目录 rp-agent/ */
export const ROOT_DIR = path.resolve(__dirname, "../../..");

/** 数据目录 */
export const DATA_DIR = path.join(ROOT_DIR, "data");
export const CHARACTERS_DIR = path.join(DATA_DIR, "characters");
export const CHATS_DIR = path.join(DATA_DIR, "chats");
export const WORLD_INFO_DIR = path.join(DATA_DIR, "worldinfo");
export const MEMORY_DIR = path.join(DATA_DIR, "memory");
/**
 * LEANN/FAISS 在 Windows 下无法用含非 ASCII 的路径写 .index（用户名含中文时
 * data/leann 会失败）。此类情况改存到 ProgramData 下的纯英文路径。
 */
function resolveLeannDir(): string {
  const preferred = path.join(DATA_DIR, "leann");
  if (!/[^\u0000-\u007f]/.test(preferred)) return preferred;
  const programData = process.env.ProgramData || "C:\\ProgramData";
  return path.join(programData, "rp-agent", "leann");
}
export const LEANN_DIR = resolveLeannDir();
export const PERSONA_DIR = path.join(DATA_DIR, "persona");
export const ACTIVITY_DIR = path.join(DATA_DIR, "activity");


export const SETTINGS_PATH = path.join(DATA_DIR, "settings.json");

import type { PromptSlot } from "./characterPreset.js";
import { normalizeNetEaseCookie } from "./music/cookieUtil.js";
import { DEFAULT_PROACTIVE_PROMPT } from "./proactive/config.js";

export interface GenerationSettings {
  model: string;
  temperature: number;
  topP: number;
  topK: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxTokens: number;
  maxContext: number;
  mainPrompt: string;
  jailbreakPrompt: string;
  postHistoryInstructions: string;
  /** ST 风格提示词块排序（角色预设提供，全局默认兜底） */
  promptOrder?: PromptSlot[];
  /** 向量化前：DeepSeek 如何把原文整理成记忆条目 */
  memorySummarizePrompt: string;
  /** 检索时：DeepSeek 如何从候选中挑选相关记忆 */
  memorySelectPrompt: string;
  /** 注入时：记忆块插入 prompt 的模板，含 {{memories}} */
  memoryInsertPrompt: string;
  /** 共读：从该书论点中挑选 1 条 / NONE */
  coreadSelectPrompt?: string;
  /** 共读：单条论点注入模板，含 {{title}} {{claim}} */
  coreadInsertPrompt?: string;
  /** 共读：草稿整理为论点的提示词 */
  coreadDigestPrompt?: string;
  memoryChunkSize: number;
  memoryChunkOverlap: number;
  memoryRetrieveCount: number;
  memoryScoreThreshold: number;
  /** 无关键词命中时，TF-IDF + DeepSeek 主动检索（默认最多 1 条，精筛可 NONE） */
  memoryProactiveRetrieveEnabled?: boolean;
  memoryProactiveRetrieveMax?: number;
  /** 聊天后是否自动总结并存入向量库 */
  autoSummarizeChat: boolean;
  /** DeepSeek v4 思维链：enabled / disabled（旧版 reasoner/chat 由模型名推断） */
  deepseekThinking?: "enabled" | "disabled";
  /** 思维链深度：high / max（仅 thinking 开启时有效） */
  deepseekReasoningEffort?: "low" | "high" | "max";
}

export interface AppSettings extends GenerationSettings {
  deepseekApiKey: string;
  appPasswordHash: string;
  /** OpenAI 兼容自定义端点（Agent 扩展模型） */
  openaiCompat: OpenAiCompatConn;
  /** NewAPI 生图 */
  imageGenConn: NewApiChannelConn;
  /** NewAPI 看图 / Vision */
  imageViewConn: NewApiChannelConn;
  /** 火山引擎 TTS */
  volcanoTts: VolcanoTtsConn;
  /** 网易云点歌 */
  neteaseMusic: NetEaseMusicConn;
  /** 微信读书（书架、笔记、划线） */
  weread: WeReadConn;
  /** Bilibili 视频字幕 */
  bilibili: BilibiliConn;
  /** 知乎专栏/问答 */
  zhihu: ZhihuConn;
  /** 启用 DeepSeek 原生联网搜索（Anthropic 接口 + web_search） */
  webSearchEnabled: boolean;
  /** 各能力独立开关（默认开启） */
  musicEnabled: boolean;
  imageGenEnabled: boolean;
  imageViewEnabled: boolean;
  volcanoTtsEnabled: boolean;
  /** 朗读供应商：火山 / OpenAI 兼容（复用 openaiCompat 连接） */
  ttsProvider: "volcano" | "openai";
  /** OpenAI TTS 模型名（如 gpt-4o-mini-tts、tts-1） */
  openaiTtsModel: string;
  /** OpenAI TTS 音色（如 alloy、nova、verse） */
  openaiTtsVoice: string;
  /** 聊天语音消息（录音发送 + 语音气泡） */
  voiceMessagesEnabled: boolean;
  /** 助手回复自动合成语音条 */
  assistantVoiceReplyEnabled: boolean;
  /** 用户语音 → 火山 ASR 转写 */
  volcanoAsrEnabled: boolean;
  volcanoAsrEndpoint: string;
  volcanoAsrResourceId: string;
  openaiCompatEnabled: boolean;
  wereadEnabled: boolean;
  bilibiliEnabled: boolean;
  zhihuEnabled: boolean;
  /** Keep 运动/健康数据只读查询 */
  keepEnabled: boolean;
  /**
   * 工具调度员：Keep 主责；点歌/语音/生图/找图为角色标记兜底（默认关，走旧语义路径）
   */
  toolDispatcherEnabled: boolean;
  toolDispatcher: OpenAiCompatConn;
  /** 角色主动找用户（heartbeat） */
  proactiveMessagingEnabled: boolean;
  proactivePrompt: string;
  proactiveTimingMode: "random" | "fixed";
  proactiveMinGapHours: number;
  proactiveMaxRandomHours: number;
  proactiveFixedTime: string;
  proactiveQuietStartHour: number;
  proactiveQuietEndHour: number;
  /** LEANN 向量索引（电子书语义检索） */
  leannEnabled: boolean;
  leannPythonPath: string;
  leannEmbeddingMode: string;
  leannRetrieveCount: number;
  leannScoreThreshold: number;
  /** Obsidian 慢思考知识库 */
  obsidianEnabled: boolean;
  obsidianVaultPath: string;
  /** vault 显示名（用于 obsidian:// URI）；空则用路径末段 */
  obsidianVaultName: string;
  /** 白名单相对目录，逗号或换行分隔 */
  obsidianWhitelistDirs: string;
  obsidianNightlyEnabled: boolean;
  /** 夜间留言目标小时 0–23 */
  obsidianNightlyHour: number;
  obsidianMaxCommentsPerNight: number;
  /** 留言后是否 Web Push 提醒 */
  obsidianPushNotify: boolean;
  /** Obsidian 慢思考留言提示词（叠在角色身份段之后） */
  obsidianPrompt: string;
  /** 是否启用人格画像夜间自动归纳（关闭后仍可手动「立刻整理」） */
  personaDigestEnabled: boolean;
}

export interface OpenAiCompatConn {
  baseUrl: string;
  apiKey: string;
  defaultModel?: string;
}

export interface NewApiChannelConn {
  baseUrl: string;
  apiKey: string;
  defaultModel?: string;
}

export interface VolcanoTtsConn {
  endpoint: string;
  resourceId: string;
  appId: string;
  accessToken: string;
  secretKey: string;
  defaultSpeaker?: string;
  audioFormat?: string;
  sampleRate?: number;
}

/** 网易云音乐（搜歌 + 链接卡片，Cookie / CookieCloud / 限定歌单） */
export interface NetEaseMusicConn {
  cookie?: string;
  cookieCloud?: {
    url?: string;
    id?: string;
    password?: string;
  };
  /** 歌单链接或 id，点歌时仅在此歌单内匹配 */
  playlistUrl?: string;
  playlistId?: string;
}

/** 微信读书（书架、笔记、划线，需 Cookie 或 CookieCloud） */
export interface WeReadConn {
  cookie?: string;
  cookieCloud?: {
    url?: string;
    id?: string;
    password?: string;
  };
}

/** Bilibili（视频信息 + 字幕，字幕建议配置 Cookie） */
export type BilibiliConn = WeReadConn;

/** 知乎（专栏/问答 Cookie + 开放平台 Access Secret） */
export interface ZhihuConn {
  cookie?: string;
  cookieCloud?: {
    url?: string;
    id?: string;
    password?: string;
  };
  /** developer.zhihu.com 开放平台 Access Secret */
  accessSecret?: string;
}

const DEFAULT_OPENAI_COMPAT: OpenAiCompatConn = {
  baseUrl: "",
  apiKey: "",
  defaultModel: "",
};

const DEFAULT_NEWAPI: NewApiChannelConn = {
  baseUrl: "",
  apiKey: "",
  defaultModel: "",
};

const DEFAULT_VOLCANO_TTS: VolcanoTtsConn = {
  endpoint: "https://openspeech.bytedance.com/api/v3/tts/unidirectional",
  resourceId: "seed-tts-2.0",
  appId: "",
  accessToken: "",
  secretKey: "",
  defaultSpeaker: "zh_female_shuangkuaisisi_uranus_bigtts",
  audioFormat: "mp3",
  sampleRate: 24000,
};

const DEFAULT_NETEASE_MUSIC: NetEaseMusicConn = {
  cookie: "",
  cookieCloud: { url: "", id: "", password: "" },
  playlistUrl: "https://163cn.tv/bauTclbb",
  playlistId: "",
};

const DEFAULT_WEREAD: WeReadConn = {
  cookie: "",
  cookieCloud: { url: "", id: "", password: "" },
};

const DEFAULT_BILIBILI: BilibiliConn = { ...DEFAULT_WEREAD };
const DEFAULT_ZHIHU: ZhihuConn = { ...DEFAULT_WEREAD, accessSecret: "" };

/** 读取项目根目录 .env（不覆盖已有环境变量） */
function loadEnvFile(): void {
  const envPath = path.join(ROOT_DIR, ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf-8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

loadEnvFile();

function applyEnvDefaults(settings: AppSettings): AppSettings {
  if (!settings.deepseekApiKey?.trim() && process.env.DEEPSEEK_API_KEY?.trim()) {
    settings.deepseekApiKey = process.env.DEEPSEEK_API_KEY.trim();
  }
  if (!settings.zhihu.accessSecret?.trim() && process.env.ZHIHU_ACCESS_SECRET?.trim()) {
    settings.zhihu.accessSecret = process.env.ZHIHU_ACCESS_SECRET.trim();
  }
  return settings;
}

export type DeepSeekKeySource = "settings" | "env" | "none";

export function getDeepSeekKeySource(settings: AppSettings): DeepSeekKeySource {
  try {
    if (!fs.existsSync(SETTINGS_PATH)) {
      return settings.deepseekApiKey?.trim() ? "env" : "none";
    }
    const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8")) as Record<string, unknown>;
    const fileKey = String((raw.deepseekApiKey as string | undefined) || "").trim();
    if (fileKey) return "settings";
    if (settings.deepseekApiKey?.trim()) return "env";
    return "none";
  } catch {
    return settings.deepseekApiKey?.trim() ? "env" : "none";
  }
}

function mergeSettings(raw: Record<string, unknown>): AppSettings {
  const merged = { ...DEFAULT_SETTINGS, ...raw } as AppSettings;
  merged.openaiCompat = { ...DEFAULT_OPENAI_COMPAT, ...(raw.openaiCompat as object) };
  merged.toolDispatcher = { ...DEFAULT_OPENAI_COMPAT, ...(raw.toolDispatcher as object) };
  merged.imageGenConn = { ...DEFAULT_NEWAPI, ...(raw.imageGenConn as object) };
  merged.imageViewConn = { ...DEFAULT_NEWAPI, ...(raw.imageViewConn as object) };
  merged.volcanoTts = { ...DEFAULT_VOLCANO_TTS, ...(raw.volcanoTts as object) };
  const rawNetease = raw.neteaseMusic as NetEaseMusicConn | undefined;
  merged.neteaseMusic = {
    cookie: normalizeNetEaseCookie(String(rawNetease?.cookie || "")),
    cookieCloud: {
      url: String(rawNetease?.cookieCloud?.url || ""),
      id: String(rawNetease?.cookieCloud?.id || ""),
      password: String(rawNetease?.cookieCloud?.password || ""),
    },
    playlistUrl: String(rawNetease?.playlistUrl || DEFAULT_NETEASE_MUSIC.playlistUrl || ""),
    playlistId: String(rawNetease?.playlistId || ""),
  };
  const rawWeread = raw.weread as WeReadConn | undefined;
  merged.weread = {
    cookie: String(rawWeread?.cookie || ""),
    cookieCloud: {
      url: String(rawWeread?.cookieCloud?.url || ""),
      id: String(rawWeread?.cookieCloud?.id || ""),
      password: String(rawWeread?.cookieCloud?.password || ""),
    },
  };
  const rawBilibili = raw.bilibili as BilibiliConn | undefined;
  merged.bilibili = {
    cookie: String(rawBilibili?.cookie || ""),
    cookieCloud: {
      url: String(rawBilibili?.cookieCloud?.url || ""),
      id: String(rawBilibili?.cookieCloud?.id || ""),
      password: String(rawBilibili?.cookieCloud?.password || ""),
    },
  };
  const rawZhihu = raw.zhihu as ZhihuConn | undefined;
  merged.zhihu = {
    cookie: String(rawZhihu?.cookie || ""),
    cookieCloud: {
      url: String(rawZhihu?.cookieCloud?.url || ""),
      id: String(rawZhihu?.cookieCloud?.id || ""),
      password: String(rawZhihu?.cookieCloud?.password || ""),
    },
    accessSecret: String(rawZhihu?.accessSecret || ""),
  };
  if (typeof raw.webSearchEnabled === "boolean") {
    merged.webSearchEnabled = raw.webSearchEnabled;
  }
  if (typeof raw.musicEnabled === "boolean") merged.musicEnabled = raw.musicEnabled;
  if (typeof raw.imageGenEnabled === "boolean") merged.imageGenEnabled = raw.imageGenEnabled;
  if (typeof raw.imageViewEnabled === "boolean") merged.imageViewEnabled = raw.imageViewEnabled;
  if (typeof raw.volcanoTtsEnabled === "boolean") merged.volcanoTtsEnabled = raw.volcanoTtsEnabled;
  if (raw.ttsProvider === "openai" || raw.ttsProvider === "volcano") {
    merged.ttsProvider = raw.ttsProvider;
  }
  if (typeof raw.openaiTtsModel === "string") merged.openaiTtsModel = raw.openaiTtsModel;
  if (typeof raw.openaiTtsVoice === "string") merged.openaiTtsVoice = raw.openaiTtsVoice;
  if (typeof raw.voiceMessagesEnabled === "boolean") {
    merged.voiceMessagesEnabled = raw.voiceMessagesEnabled;
  }
  if (typeof raw.assistantVoiceReplyEnabled === "boolean") {
    merged.assistantVoiceReplyEnabled = raw.assistantVoiceReplyEnabled;
  }
  if (typeof raw.volcanoAsrEnabled === "boolean") merged.volcanoAsrEnabled = raw.volcanoAsrEnabled;
  if (typeof raw.volcanoAsrEndpoint === "string") merged.volcanoAsrEndpoint = raw.volcanoAsrEndpoint;
  if (typeof raw.volcanoAsrResourceId === "string") {
    merged.volcanoAsrResourceId = raw.volcanoAsrResourceId;
  }
  if (typeof raw.openaiCompatEnabled === "boolean") merged.openaiCompatEnabled = raw.openaiCompatEnabled;
  if (typeof raw.wereadEnabled === "boolean") merged.wereadEnabled = raw.wereadEnabled;
  if (typeof raw.bilibiliEnabled === "boolean") merged.bilibiliEnabled = raw.bilibiliEnabled;
  if (typeof raw.zhihuEnabled === "boolean") merged.zhihuEnabled = raw.zhihuEnabled;
  if (typeof raw.keepEnabled === "boolean") merged.keepEnabled = raw.keepEnabled;
  if (typeof raw.toolDispatcherEnabled === "boolean") {
    merged.toolDispatcherEnabled = raw.toolDispatcherEnabled;
  }
  if (typeof raw.proactiveMessagingEnabled === "boolean") {
    merged.proactiveMessagingEnabled = raw.proactiveMessagingEnabled;
  }
  if (typeof raw.proactivePrompt === "string") merged.proactivePrompt = raw.proactivePrompt;
  if (raw.proactiveTimingMode === "random" || raw.proactiveTimingMode === "fixed") {
    merged.proactiveTimingMode = raw.proactiveTimingMode;
  }
  if (typeof raw.proactiveMinGapHours === "number") {
    merged.proactiveMinGapHours = raw.proactiveMinGapHours;
  }
  if (typeof raw.proactiveMaxRandomHours === "number") {
    merged.proactiveMaxRandomHours = raw.proactiveMaxRandomHours;
  }
  if (typeof raw.proactiveFixedTime === "string") merged.proactiveFixedTime = raw.proactiveFixedTime;
  if (typeof raw.proactiveQuietStartHour === "number") {
    merged.proactiveQuietStartHour = raw.proactiveQuietStartHour;
  }
  if (typeof raw.proactiveQuietEndHour === "number") {
    merged.proactiveQuietEndHour = raw.proactiveQuietEndHour;
  }
  if (typeof raw.leannEnabled === "boolean") merged.leannEnabled = raw.leannEnabled;
  if (typeof raw.leannPythonPath === "string") merged.leannPythonPath = raw.leannPythonPath;
  if (typeof raw.leannEmbeddingMode === "string") merged.leannEmbeddingMode = raw.leannEmbeddingMode;
  if (typeof raw.leannRetrieveCount === "number") merged.leannRetrieveCount = raw.leannRetrieveCount;
  if (typeof raw.leannScoreThreshold === "number") merged.leannScoreThreshold = raw.leannScoreThreshold;
  if (typeof raw.obsidianEnabled === "boolean") merged.obsidianEnabled = raw.obsidianEnabled;
  if (typeof raw.obsidianVaultPath === "string") merged.obsidianVaultPath = raw.obsidianVaultPath;
  if (typeof raw.obsidianVaultName === "string") merged.obsidianVaultName = raw.obsidianVaultName;
  if (typeof raw.obsidianWhitelistDirs === "string") {
    merged.obsidianWhitelistDirs = raw.obsidianWhitelistDirs;
  }
  if (typeof raw.obsidianNightlyEnabled === "boolean") {
    merged.obsidianNightlyEnabled = raw.obsidianNightlyEnabled;
  }
  if (typeof raw.obsidianNightlyHour === "number") merged.obsidianNightlyHour = raw.obsidianNightlyHour;
  if (typeof raw.obsidianMaxCommentsPerNight === "number") {
    merged.obsidianMaxCommentsPerNight = raw.obsidianMaxCommentsPerNight;
  }
  if (typeof raw.obsidianPushNotify === "boolean") merged.obsidianPushNotify = raw.obsidianPushNotify;
  if (typeof raw.obsidianPrompt === "string") merged.obsidianPrompt = raw.obsidianPrompt;
  if (typeof raw.personaDigestEnabled === "boolean") {
    merged.personaDigestEnabled = raw.personaDigestEnabled;
  }
  return applyEnvDefaults(merged);
}

export const DEFAULT_GENERATION: GenerationSettings = {
  model: "deepseek-v4-flash",
  temperature: 0.85,
  topP: 0.95,
  topK: 40,
  frequencyPenalty: 0,
  presencePenalty: 0,
  maxTokens: 512,
  maxContext: 8192,
  mainPrompt: "",
  jailbreakPrompt: "",
  postHistoryInstructions: "",
  promptOrder: undefined,
  memorySummarizePrompt: `你是「记忆整理器」，不是角色。将输入文本提炼为独立、可检索的记忆条目。
规则：
1. 每条记忆一行，以 "- " 开头
2. 只写客观事实、设定、关系、事件，不要对话语气
3. 严格只根据输入文本总结，不要编造、不要补充文本外内容
4. 每条 15–120 字，中文输出
5. 来源：{{source}}`,
  memorySelectPrompt: `你是「记忆检索器」，不是角色。根据当前对话，从候选记忆中选出最相关的条目 id。
规则：
1. 最多选 {{max}} 条
2. 只返回相关记忆的 id，逗号分隔
3. 无相关则返回 NONE
4. 不要输出解释`,
  memoryInsertPrompt:
    "【{{char}}可能自然想起的事——不要向{{user}}提起「记忆」「条目」「系统」；像自己本就记得一样用，勿逐条复述】\n{{memories}}",
  coreadSelectPrompt: `你是「共读讨论检索器」。用户对话已提到本书，请从本书讨论论点中选出最有助于回复的 1 条。
规则：
1. 最多选 1 条，只返回该条 id（或序号）
2. 用户提到书名、共读或书中意象时，应选出最能承接的论点，不要轻易 NONE
3. 仅当对话与本书完全无关时才返回 NONE
4. 不要输出解释`,
  coreadInsertPrompt: `【共读讨论 · 《{{title}}》】\n{{claim}}`,
  coreadDigestPrompt: `你是「共读讨论整理器」，不是角色。根据草稿中的对话，提炼用户与角色围绕本书的讨论论点。
规则：
1. 只输出 JSON：{"points":[{"claim":"论点","userView":"用户的观点","charView":"角色的观点"}]}
2. 每个论点对应一个独立讨论点；可与已有论点合并更新，不要重复同义论点
3. 严格依据草稿，不要编造未出现的观点
4. 中文；论点简洁，观点各 1–4 句`,
  memoryChunkSize: 2000,
  memoryChunkOverlap: 200,
  memoryRetrieveCount: 5,
  memoryScoreThreshold: 0.05,
  memoryProactiveRetrieveEnabled: true,
  memoryProactiveRetrieveMax: 1,
  autoSummarizeChat: false,
  deepseekThinking: "enabled",
  deepseekReasoningEffort: "high",
};

const DEFAULT_SETTINGS: AppSettings = {
  deepseekApiKey: "",
  appPasswordHash: "",
  openaiCompat: { ...DEFAULT_OPENAI_COMPAT },
  imageGenConn: { ...DEFAULT_NEWAPI },
  imageViewConn: { ...DEFAULT_NEWAPI },
  volcanoTts: { ...DEFAULT_VOLCANO_TTS },
  neteaseMusic: { ...DEFAULT_NETEASE_MUSIC },
  weread: { ...DEFAULT_WEREAD },
  bilibili: { ...DEFAULT_BILIBILI },
  zhihu: { ...DEFAULT_ZHIHU },
  webSearchEnabled: true,
  musicEnabled: true,
  imageGenEnabled: true,
  imageViewEnabled: true,
  volcanoTtsEnabled: true,
  ttsProvider: "volcano",
  openaiTtsModel: "gpt-4o-mini-tts",
  openaiTtsVoice: "alloy",
  voiceMessagesEnabled: true,
  assistantVoiceReplyEnabled: true,
  volcanoAsrEnabled: true,
  volcanoAsrEndpoint: "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash",
  volcanoAsrResourceId: "volc.bigasr.auc_turbo",
  openaiCompatEnabled: false,
  wereadEnabled: true,
  bilibiliEnabled: true,
  zhihuEnabled: true,
  keepEnabled: true,
  toolDispatcherEnabled: false,
  toolDispatcher: { ...DEFAULT_OPENAI_COMPAT },
  proactiveMessagingEnabled: true,
  proactivePrompt: DEFAULT_PROACTIVE_PROMPT,
  proactiveTimingMode: "random",
  proactiveMinGapHours: 3,
  proactiveMaxRandomHours: 0,
  proactiveFixedTime: "20:00",
  proactiveQuietStartHour: 22,
  proactiveQuietEndHour: 10,
  leannEnabled: false,
  leannPythonPath: "python",
  leannEmbeddingMode: "",
  leannRetrieveCount: 5,
  leannScoreThreshold: 0,
  obsidianEnabled: false,
  obsidianVaultPath: "",
  obsidianVaultName: "",
  obsidianWhitelistDirs: "*",
  obsidianNightlyEnabled: false,
  obsidianNightlyHour: 21,
  obsidianMaxCommentsPerNight: 3,
  obsidianPushNotify: true,
  obsidianPrompt: "",
  personaDigestEnabled: true,
  ...DEFAULT_GENERATION,
};

export function ensureDataDir(): void {
  for (const dir of [
    DATA_DIR,
    CHARACTERS_DIR,
    CHATS_DIR,
    WORLD_INFO_DIR,
    MEMORY_DIR,
    LEANN_DIR,
    PERSONA_DIR,
    ACTIVITY_DIR,
  ]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export function loadSettings(): AppSettings {
  ensureDataDir();
  if (!fs.existsSync(SETTINGS_PATH)) {
    return applyEnvDefaults({ ...DEFAULT_SETTINGS });
  }
  try {
    const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8")) as Record<string, unknown>;
    return mergeSettings(raw);
  } catch {
    return applyEnvDefaults({ ...DEFAULT_SETTINGS });
  }
}

export function saveSettings(settings: AppSettings): void {
  ensureDataDir();
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

export function getGenerationSettings(): GenerationSettings {
  const s = loadSettings();
  return {
    model: s.model,
    temperature: s.temperature,
    topP: s.topP,
    topK: s.topK,
    frequencyPenalty: s.frequencyPenalty,
    presencePenalty: s.presencePenalty,
    maxTokens: s.maxTokens,
    maxContext: s.maxContext,
    mainPrompt: s.mainPrompt,
    jailbreakPrompt: s.jailbreakPrompt,
    postHistoryInstructions: s.postHistoryInstructions,
    promptOrder: s.promptOrder,
    memorySummarizePrompt: s.memorySummarizePrompt,
    memorySelectPrompt: s.memorySelectPrompt,
    memoryInsertPrompt: s.memoryInsertPrompt,
    coreadSelectPrompt: s.coreadSelectPrompt,
    coreadInsertPrompt: s.coreadInsertPrompt,
    coreadDigestPrompt: s.coreadDigestPrompt,
    memoryChunkSize: s.memoryChunkSize,
    memoryChunkOverlap: s.memoryChunkOverlap,
    memoryRetrieveCount: s.memoryRetrieveCount,
    memoryScoreThreshold: s.memoryScoreThreshold,
    memoryProactiveRetrieveEnabled: s.memoryProactiveRetrieveEnabled,
    memoryProactiveRetrieveMax: s.memoryProactiveRetrieveMax,
    autoSummarizeChat: s.autoSummarizeChat,
    deepseekThinking: s.deepseekThinking,
    deepseekReasoningEffort: s.deepseekReasoningEffort,
  };
}
