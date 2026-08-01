import type { GenerationSettings } from "./config.js";

/** 当前 DeepSeek API 支持的对话模型（2026） */
export const DEEPSEEK_MODEL_OPTIONS = [
  { id: "deepseek-v4-flash", label: "deepseek-v4-flash（推荐 · 快速）" },
  { id: "deepseek-v4-pro", label: "deepseek-v4-pro（更强）" },
  { id: "deepseek-chat", label: "deepseek-chat（旧版 · 无思维链，2026/7 弃用）" },
  { id: "deepseek-reasoner", label: "deepseek-reasoner（旧版 · 思维链，2026/7 弃用）" },
] as const;

export type DeepSeekThinkingMode = "enabled" | "disabled";
export type DeepSeekReasoningEffort = "low" | "high" | "max";

/** 旧版模型名与 v4 思维链的对应关系 */
export function isDeepSeekThinkingMode(
  settings: Pick<GenerationSettings, "model" | "deepseekThinking">
): boolean {
  const model = settings.model || "deepseek-v4-flash";
  if (model === "deepseek-reasoner") return true;
  if (model === "deepseek-chat") return false;
  if (settings.deepseekThinking === "enabled") return true;
  if (settings.deepseekThinking === "disabled") return false;
  // v4 系列官方默认开启 thinking
  if (model.startsWith("deepseek-v4")) return true;
  return false;
}

export function resolveDeepSeekModel(model: string): string {
  return model?.trim() || "deepseek-v4-flash";
}

/** 从旧版设置迁移：reasoner → 开思维链；chat → 关 */
export function normalizeDeepSeekThinking(
  model: string,
  thinking?: DeepSeekThinkingMode
): DeepSeekThinkingMode {
  if (thinking === "enabled" || thinking === "disabled") return thinking;
  if (model === "deepseek-reasoner") return "enabled";
  if (model === "deepseek-chat") return "disabled";
  return "enabled";
}
