import { loadMemoryChunks, type MemoryChunk } from "./store.js";
import { anyKeyMatches } from "../triggerMatch.js";

/** 事件记忆是否参与当前聊天的触发扫描 */
export function isMemoryInScope(chunk: MemoryChunk, chatId?: string): boolean {
  if (!chatId || chunk.sourceType !== "chat" || !chunk.chatId) return true;
  // 已设关键词或常驻：跨聊天生效（关键词即用户显式召回意图）
  if (chunk.constant || (chunk.keys?.length ?? 0) > 0) return true;
  return chunk.chatId === chatId;
}

export function evaluateMemoryTriggers(
  scanText: string,
  chatId?: string,
  caseSensitive = false
): MemoryChunk[] {
  const { constant, keyword } = partitionTriggeredMemories(scanText, chatId, caseSensitive);
  return [...constant, ...keyword];
}

/** 常驻 vs 本轮关键词命中（不含 LEANN 书目占位条目） */
export function partitionTriggeredMemories(
  scanText: string,
  chatId?: string,
  caseSensitive = false
): { constant: MemoryChunk[]; keyword: MemoryChunk[] } {
  const all = loadMemoryChunks();
  if (all.length === 0 || !scanText.trim()) {
    return { constant: [], keyword: [] };
  }

  const scoped = all.filter((c) => isMemoryInScope(c, chatId));
  const constant: MemoryChunk[] = [];
  const keyword: MemoryChunk[] = [];

  for (const chunk of scoped) {
    if (chunk.sourceType === "leann") continue;
    if (chunk.constant) {
      constant.push(chunk);
      continue;
    }
    const keys = chunk.keys ?? [];
    if (keys.length === 0) continue;
    if (anyKeyMatches(keys, scanText, caseSensitive)) {
      keyword.push(chunk);
    }
  }

  return { constant, keyword };
}
