/** RP-Agent 分包备份 manifest 定义（B 阶段） */

export const BACKUP_FORMAT = "rp-agent-backup" as const;
export const PACKAGE_FORMAT = "rp-agent-backup-package" as const;
export const BACKUP_VERSION = 1;

export type BackupPackageId =
  | "memory"
  | "worldinfo"
  | "chats"
  | "profile"
  | "api-connections"
  | "generation-system"
  | "decorate";

export type BackupCategory = "soul" | "settings";

export interface PackageDefinition {
  id: BackupPackageId;
  filename: string;
  label: string;
  category: BackupCategory;
  description: string;
  /** 导入建议顺序，数字越小越先 */
  importOrder: number;
}

export const PACKAGE_DEFINITIONS: PackageDefinition[] = [
  {
    id: "profile",
    filename: "档案.zip",
    label: "档案",
    category: "soul",
    description: "角色（含九槽预设与采样参数）、用户 Persona、人格画像库、头像",
    importOrder: 1,
  },
  {
    id: "chats",
    filename: "聊天.zip",
    label: "聊天",
    category: "soul",
    description: "全部对话记录、上下文日志与聊天附件",
    importOrder: 2,
  },
  {
    id: "worldinfo",
    filename: "世界书.zip",
    label: "语意记忆",
    category: "soul",
    description: "语意记忆条目与触发设置（备份文件名仍为世界书.zip，兼容旧包）",
    importOrder: 3,
  },
  {
    id: "memory",
    filename: "记忆库.zip",
    label: "记忆库",
    category: "soul",
    description:
      "事件/资料/读书记忆、记忆反馈、近期活动，以及 LEANN 电子书草稿与向量索引",
    importOrder: 4,
  },
  {
    id: "generation-system",
    filename: "生成与系统.zip",
    label: "生成与系统",
    category: "settings",
    description:
      "全局模型、思维链、各功能开关、记忆/Obsidian/主动消息设置、Obsidian 与主动消息运行状态、登录密码等（不含 API Key）",
    importOrder: 5,
  },
  {
    id: "api-connections",
    filename: "API连接.zip",
    label: "API 连接",
    category: "settings",
    description: "DeepSeek、看图/生图、TTS、网易云、微信读书与 CookieCloud 等",
    importOrder: 6,
  },
  {
    id: "decorate",
    filename: "装饰.zip",
    label: "装饰",
    category: "settings",
    description: "聊天区/登录页主题配色、背景图与浏览器端装饰缓存",
    importOrder: 7,
  },
];

export function getPackageDefinition(id: BackupPackageId): PackageDefinition {
  const def = PACKAGE_DEFINITIONS.find((p) => p.id === id);
  if (!def) throw new Error(`未知备份包：${id}`);
  return def;
}

export interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: number;
  createdAt: string;
  appVersion: string;
  includeApiKeys: boolean;
  packages: BackupManifestEntry[];
}

export interface BackupManifestEntry {
  id: BackupPackageId;
  filename: string;
  label: string;
  category: BackupCategory;
  description: string;
  importOrder: number;
  included: boolean;
}

export interface PackageMeta {
  format: typeof PACKAGE_FORMAT;
  version: number;
  id: BackupPackageId;
  label: string;
  createdAt: string;
}

/** settings.json 中 API 连接字段 */
export const API_CONNECTION_KEYS = [
  "deepseekApiKey",
  "openaiCompat",
  "toolDispatcher",
  "imageGenConn",
  "imageViewConn",
  "volcanoTts",
  "neteaseMusic",
  "weread",
  "bilibili",
  "zhihu",
] as const;

/** settings.json 中生成与系统字段（含登录密码） */
export const GENERATION_SYSTEM_KEYS = [
  "appPasswordHash",
  "model",
  "temperature",
  "topP",
  "topK",
  "frequencyPenalty",
  "presencePenalty",
  "maxTokens",
  "maxContext",
  "mainPrompt",
  "jailbreakPrompt",
  "postHistoryInstructions",
  "promptOrder",
  "memorySummarizePrompt",
  "memorySelectPrompt",
  "memoryInsertPrompt",
  "coreadSelectPrompt",
  "coreadInsertPrompt",
  "coreadDigestPrompt",
  "memoryChunkSize",
  "memoryChunkOverlap",
  "memoryRetrieveCount",
  "memoryScoreThreshold",
  "memoryProactiveRetrieveEnabled",
  "memoryProactiveRetrieveMax",
  "autoSummarizeChat",
  "deepseekThinking",
  "deepseekReasoningEffort",
  "webSearchEnabled",
  "musicEnabled",
  "imageGenEnabled",
  "imageViewEnabled",
  "volcanoTtsEnabled",
  "ttsProvider",
  "openaiTtsModel",
  "openaiTtsVoice",
  "voiceMessagesEnabled",
  "assistantVoiceReplyEnabled",
  "volcanoAsrEnabled",
  "volcanoAsrEndpoint",
  "volcanoAsrResourceId",
  "openaiCompatEnabled",
  "wereadEnabled",
  "bilibiliEnabled",
  "zhihuEnabled",
  "keepEnabled",
  "toolDispatcherEnabled",
  "proactiveMessagingEnabled",
  "proactivePrompt",
  "proactiveTimingMode",
  "proactiveMinGapHours",
  "proactiveMaxRandomHours",
  "proactiveFixedTime",
  "proactiveQuietStartHour",
  "proactiveQuietEndHour",
  "leannEnabled",
  "leannPythonPath",
  "leannEmbeddingMode",
  "leannRetrieveCount",
  "leannScoreThreshold",
  "obsidianEnabled",
  "obsidianVaultPath",
  "obsidianVaultName",
  "obsidianWhitelistDirs",
  "obsidianNightlyEnabled",
  "obsidianNightlyHour",
  "obsidianMaxCommentsPerNight",
  "obsidianPushNotify",
  "obsidianPrompt",
] as const;

export const IMPORT_ORDER_HINT =
  "建议导入顺序：档案 → 聊天 → 语意记忆 → 记忆库（含 LEANN 电子书与近期活动）→ 生成与系统 → API 连接 → 装饰。只恢复一部分时，勾选需要的包即可；导入前会自动保存当前数据快照。";
