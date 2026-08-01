import type { MemorySourceType } from "./store.js";

/** 界面展示分类 */
export type MemoryDisplayType = "event" | "file" | "weread" | "leann";

export function getMemoryDisplayType(sourceType: MemorySourceType): MemoryDisplayType {
  if (sourceType === "file") return "file";
  if (sourceType === "weread") return "weread";
  if (sourceType === "leann") return "leann";
  return "event";
}

export const MEMORY_TYPE_LABELS: Record<MemoryDisplayType, string> = {
  event: "事件记忆",
  file: "资料记忆",
  weread: "读书摘抄",
  leann: "电子书索引",
};

export function getMemoryTypeLabel(
  sourceType: MemorySourceType,
  wereadKind?: "highlights" | "progress"
): string {
  if (sourceType === "weread" && wereadKind === "progress") return "阅读进度";
  return MEMORY_TYPE_LABELS[getMemoryDisplayType(sourceType)];
}

export function isEventMemory(sourceType: MemorySourceType): boolean {
  return sourceType === "chat" || sourceType === "manual";
}

export function isWeReadMemory(sourceType: MemorySourceType): boolean {
  return sourceType === "weread";
}
