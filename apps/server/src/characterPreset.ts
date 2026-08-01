import type { GenerationSettings } from "./config.js";
import { loadSettings } from "./config.js";
import type { StoredCharacter } from "./store/characters.js";

/** ST 风格提示词槽位 */
export type PromptSlotId =
  | "main"
  | "jailbreak"
  | "memories"
  | "activities"
  | "user_description"
  | "world_info_before"
  | "system_prompt"
  | "description"
  | "personality"
  | "scenario"
  | "world_info_after"
  | "mes_example"
  | "chat_history"
  | "post_history"
  | "supervisor";

export interface PromptSlot {
  id: PromptSlotId;
  enabled: boolean;
  /** 包裹 {{content}} 的模板；留空则用内置默认 */
  template?: string;
  /** 界面显示名（可自定义，如「关于用户」） */
  label?: string;
}

/** 角色绑定的预设（仿 ST：提示词排序 + 包裹 + 采样，不含模型） */
export interface CharacterPreset {
  name: string;
  promptOrder: PromptSlot[];
  mainPrompt: string;
  jailbreakPrompt: string;
  postHistoryInstructions: string;
  temperature: number;
  topP: number;
  topK: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxTokens: number;
  maxContext: number;
  /** 火山 TTS 音色 ID，留空则用设置页默认音色 */
  ttsSpeaker?: string;
  /** 能力 · 主管 常驻提示（注入于聊天历史前）；留空用内置默认，支持 {{char}} */
  supervisorCapabilitiesPrompt?: string;
}

export function getPromptSlotLabel(slot: PromptSlot): string {
  const custom = slot.label?.trim();
  if (custom) return custom;
  return PROMPT_SLOT_LABELS[slot.id] || slot.id;
}

export const PROMPT_SLOT_LABELS: Record<PromptSlotId, string> = {
  main: "主提示词",
  jailbreak: "系统说明 / 越狱",
  memories: "相关记忆",
  activities: "相关活动",
  user_description: "用户描述",
  world_info_before: "语意记忆（角色定义前）",
  system_prompt: "系统提示词覆盖",
  description: "角色描述",
  personality: "角色设定摘要",
  scenario: "情景",
  world_info_after: "语意记忆（角色定义后）",
  mes_example: "示例对话",
  chat_history: "聊天历史",
  post_history: "后续历史指令",
  supervisor: "能力 · 主管",
};

/** 一对一身份合一模式：默认注入顺序 */
export const IDENTITY_PROMPT_ORDER: PromptSlot[] = [
  { id: "description", enabled: true },
  { id: "personality", enabled: true },
  { id: "user_description", enabled: true },
  { id: "world_info_after", enabled: true },
  { id: "supervisor", enabled: true },
  { id: "chat_history", enabled: true },
  { id: "memories", enabled: true },
  { id: "activities", enabled: true },
  { id: "scenario", enabled: true },
  { id: "main", enabled: true },
  { id: "post_history", enabled: true },
  { id: "jailbreak", enabled: false },
  { id: "world_info_before", enabled: false },
  { id: "system_prompt", enabled: false },
  { id: "mes_example", enabled: false },
];

export const DEFAULT_PROMPT_ORDER: PromptSlot[] = IDENTITY_PROMPT_ORDER.map((s) => ({ ...s }));

/** 与 config.DEFAULT_GENERATION 保持一致，此处内联以避免循环引用 */
const PRESET_DEFAULTS = {
  mainPrompt: "",
  jailbreakPrompt: "",
  postHistoryInstructions: "",
  temperature: 0.85,
  topP: 0.95,
  topK: 40,
  frequencyPenalty: 0,
  presencePenalty: 0,
  maxTokens: 512,
  maxContext: 8192,
};

export const DEFAULT_CHARACTER_PRESET: CharacterPreset = {
  name: "默认预设",
  promptOrder: DEFAULT_PROMPT_ORDER.map((s) => ({ ...s })),
  mainPrompt: PRESET_DEFAULTS.mainPrompt,
  jailbreakPrompt: PRESET_DEFAULTS.jailbreakPrompt,
  postHistoryInstructions: PRESET_DEFAULTS.postHistoryInstructions,
  temperature: PRESET_DEFAULTS.temperature,
  topP: PRESET_DEFAULTS.topP,
  topK: PRESET_DEFAULTS.topK,
  frequencyPenalty: PRESET_DEFAULTS.frequencyPenalty,
  presencePenalty: PRESET_DEFAULTS.presencePenalty,
  maxTokens: PRESET_DEFAULTS.maxTokens,
  maxContext: PRESET_DEFAULTS.maxContext,
};

/** 确保旧预设包含必要槽位 */
export function normalizePromptOrder(
  order?: PromptSlot[],
  legacySupervisor?: string
): PromptSlot[] {
  let base = order?.length ? order.map((s) => ({ ...s })) : DEFAULT_PROMPT_ORDER.map((s) => ({ ...s }));

  if (!base.some((s) => s.id === "user_description")) {
    const memIdx = base.findIndex((s) => s.id === "memories");
    const slot: PromptSlot = { id: "user_description", enabled: true };
    if (memIdx >= 0) base.splice(memIdx + 1, 0, slot);
    else base.unshift(slot);
  }

  if (!base.some((s) => s.id === "supervisor")) {
    const chatIdx = base.findIndex((s) => s.id === "chat_history");
    const slot: PromptSlot = {
      id: "supervisor",
      enabled: true,
      template: legacySupervisor?.trim() || undefined,
    };
    if (chatIdx >= 0) base.splice(chatIdx, 0, slot);
    else base.push(slot);
  } else if (legacySupervisor?.trim()) {
    const idx = base.findIndex((s) => s.id === "supervisor");
    if (idx >= 0 && !base[idx].template?.trim()) {
      base[idx] = { ...base[idx], template: legacySupervisor.trim() };
    }
  }

  if (!base.some((s) => s.id === "chat_history")) {
    const postIdx = base.findIndex((s) => s.id === "post_history");
    const slot: PromptSlot = { id: "chat_history", enabled: true };
    if (postIdx >= 0) base.splice(postIdx, 0, slot);
    else base.push(slot);
  }

  // 旧版：有人把 jailbreak 改名成「相关活动」——就地改成 activities，并补回 jailbreak
  const misuseJailbreakIdx = base.findIndex(
    (s) => s.id === "jailbreak" && /相关活动/.test(s.label || "")
  );
  if (misuseJailbreakIdx >= 0 && !base.some((s) => s.id === "activities")) {
    const old = base[misuseJailbreakIdx];
    base[misuseJailbreakIdx] = {
      id: "activities",
      enabled: old.enabled,
      label: old.label?.trim() || "【相关活动】",
      template: old.template,
    };
    base.push({ id: "jailbreak", enabled: false });
  } else if (!base.some((s) => s.id === "activities")) {
    const memIdx = base.findIndex((s) => s.id === "memories");
    const slot: PromptSlot = { id: "activities", enabled: true, label: "【相关活动】" };
    if (memIdx >= 0) base.splice(memIdx + 1, 0, slot);
    else base.push(slot);
  }

  return base;
}

/** 兼容旧版 preset（含 model 字段） */
export function normalizePreset(raw?: Partial<CharacterPreset> & { model?: string }): CharacterPreset {
  if (!raw) {
    return {
      ...DEFAULT_CHARACTER_PRESET,
      promptOrder: normalizePromptOrder(DEFAULT_PROMPT_ORDER),
    };
  }
  return {
    name: raw.name ?? DEFAULT_CHARACTER_PRESET.name,
    promptOrder: normalizePromptOrder(raw.promptOrder, raw.supervisorCapabilitiesPrompt),
    mainPrompt: raw.mainPrompt ?? DEFAULT_CHARACTER_PRESET.mainPrompt,
    jailbreakPrompt: raw.jailbreakPrompt ?? DEFAULT_CHARACTER_PRESET.jailbreakPrompt,
    postHistoryInstructions: raw.postHistoryInstructions ?? DEFAULT_CHARACTER_PRESET.postHistoryInstructions,
    temperature: raw.temperature ?? DEFAULT_CHARACTER_PRESET.temperature,
    topP: raw.topP ?? DEFAULT_CHARACTER_PRESET.topP,
    topK: raw.topK ?? DEFAULT_CHARACTER_PRESET.topK,
    frequencyPenalty: raw.frequencyPenalty ?? DEFAULT_CHARACTER_PRESET.frequencyPenalty,
    presencePenalty: raw.presencePenalty ?? DEFAULT_CHARACTER_PRESET.presencePenalty,
    maxTokens: typeof raw.maxTokens === "number" ? raw.maxTokens : DEFAULT_CHARACTER_PRESET.maxTokens,
    maxContext: typeof raw.maxContext === "number" ? raw.maxContext : DEFAULT_CHARACTER_PRESET.maxContext,
    ttsSpeaker: raw.ttsSpeaker,
    supervisorCapabilitiesPrompt: raw.supervisorCapabilitiesPrompt,
  };
}

/** 合并全局设置与角色预设；模型仅来自全局设置 */
export function getEffectiveGeneration(
  character: StoredCharacter,
  global?: ReturnType<typeof loadSettings>
): GenerationSettings {
  const g = global ?? loadSettings();
  const p = normalizePreset(character.preset);
  return {
    model: g.model,
    temperature: p.temperature ?? g.temperature,
    topP: p.topP ?? g.topP,
    topK: p.topK ?? g.topK,
    frequencyPenalty: p.frequencyPenalty ?? g.frequencyPenalty,
    presencePenalty: p.presencePenalty ?? g.presencePenalty,
    maxTokens: typeof p.maxTokens === "number" ? p.maxTokens : g.maxTokens,
    maxContext: typeof p.maxContext === "number" ? p.maxContext : g.maxContext,
    mainPrompt: p.mainPrompt ?? "",
    jailbreakPrompt: p.jailbreakPrompt ?? "",
    postHistoryInstructions: p.postHistoryInstructions ?? "",
    promptOrder: p.promptOrder,
    memorySummarizePrompt: g.memorySummarizePrompt,
    memorySelectPrompt: g.memorySelectPrompt,
    memoryInsertPrompt: g.memoryInsertPrompt,
    memoryChunkSize: g.memoryChunkSize,
    memoryChunkOverlap: g.memoryChunkOverlap,
    memoryRetrieveCount: g.memoryRetrieveCount,
    memoryScoreThreshold: g.memoryScoreThreshold,
    autoSummarizeChat: g.autoSummarizeChat,
    deepseekThinking: g.deepseekThinking,
    deepseekReasoningEffort: g.deepseekReasoningEffort,
  };
}
