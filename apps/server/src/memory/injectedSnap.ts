import { stripUserVisibleText } from "../tools/enrichMarkers.js";
import type { RelatedMemoriesForChat } from "./resolveMemories.js";

/** 本轮注入并展示给用户打分的事件记忆快照（挂在 assistant 消息上） */
export interface InjectedMemorySnap {
  chunkId: string;
  text: string;
  /** 触发召回的用户侧 query（与 chunk 成对） */
  query: string;
  /** up=准 ♥，down=不准 × */
  rating?: "up" | "down";
}

export function buildInjectedMemorySnaps(
  related: RelatedMemoriesForChat,
  rawQuery: string
): InjectedMemorySnap[] {
  const query = stripUserVisibleText(rawQuery || "").trim().slice(0, 800);
  return related.eventChunks.map((c) => ({
    chunkId: c.id,
    text: c.text,
    query,
  }));
}
