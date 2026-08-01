import { anyKeyMatches } from "../triggerMatch.js";
import { loadSettings } from "../config.js";
import { partitionTriggeredMemories } from "./triggers.js";
import { retrieveMemories } from "./retrieval.js";
import { loadMemoryChunks, tokenize, type MemoryChunk } from "./store.js";
import { feedbackHintsForQuery } from "./feedback.js";
import {
  isLeannIndexed,
  loadLeannCollections,
  type LeannCollection,
} from "../leann/collections.js";
import { searchLeannIndex, type LeannSearchHit } from "../leann/client.js";
import {
  formatCoreadForInjection,
  resolveCoreadDiscussionForChat,
  type CoreadPickResult,
} from "../coread/resolve.js";
import { formatRelativeTimeSpan } from "./timeSpan.js";


export interface RelatedMemoriesForChat {
  /** 事件记忆：最多 1 条（关键词或主动检索） */
  eventChunks: MemoryChunk[];
  /** 读书讨论：0 或 1 条 */
  coreadPick: CoreadPickResult | null;
  /** LEANN 段落（独立） */
  leannChunks: MemoryChunk[];
}

function leannStubByCollectionId(): Map<string, MemoryChunk> {
  const map = new Map<string, MemoryChunk>();
  for (const c of loadMemoryChunks()) {
    if (c.sourceType === "leann" && c.leannCollectionId) {
      map.set(c.leannCollectionId, c);
    }
  }
  return map;
}

export function filterSearchableCollections(
  scanText: string,
  caseSensitive: boolean
): LeannCollection[] {
  const stubs = leannStubByCollectionId();
  return loadLeannCollections().filter((coll) => {
    if (!isLeannIndexed(coll)) return false;
    const stub = stubs.get(coll.id);
    if (!stub) return true;
    if (stub.constant) return true;
    const keys = stub.keys ?? [];
    if (keys.length === 0) return true;
    return anyKeyMatches(keys, scanText, caseSensitive);
  });
}

function hitToMemoryChunk(hit: LeannSearchHit): MemoryChunk {
  const now = new Date().toISOString();
  return {
    id: `leann:${hit.collectionId}:${hit.idx}`,
    sourceType: "leann",
    sourceName: hit.collectionName,
    leannCollectionId: hit.collectionId,
    leannChunkIndex: hit.idx,
    leannScore: hit.score,
    text: hit.text,
    tokens: tokenize(hit.text),
    createdAt: now,
    updatedAt: now,
  };
}

function dedupeChunks(chunks: MemoryChunk[]): MemoryChunk[] {
  const seen = new Set<string>();
  const out: MemoryChunk[] = [];
  for (const c of chunks) {
    const key = c.sourceType === "leann" ? c.text.slice(0, 200) : c.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(c);
  }
  return out;
}

async function resolveLeannMemories(
  scanText: string,
  caseSensitive: boolean,
  queryText: string
): Promise<MemoryChunk[]> {
  const settings = loadSettings();
  if (!settings.leannEnabled) return [];

  const q = queryText.trim();
  if (!q) return [];

  const collections = filterSearchableCollections(scanText, caseSensitive);
  if (collections.length === 0) return [];

  const topK = Math.max(1, settings.leannRetrieveCount || settings.memoryRetrieveCount || 5);
  const minScore = settings.leannScoreThreshold ?? 0;

  const vectorChunks: MemoryChunk[] = [];
  for (const coll of collections) {
    try {
      const hits = await searchLeannIndex(coll, q, topK);
      for (const hit of hits) {
        if (hit.score < minScore) continue;
        vectorChunks.push(hitToMemoryChunk(hit));
      }
    } catch {
      // 单本书检索失败不阻断整轮对话
    }
  }

  vectorChunks.sort((a, b) => Number(b.leannScore ?? 0) - Number(a.leannScore ?? 0));
  return vectorChunks.slice(0, topK);
}

/**
 * 相关记忆双槽：
 * - 事件：有关键词 → 不用主动检索，最多 1 条；无关键词 → 主动检索 NONE 或 1 条
 * - 读书：书名命中 → 挑 1 条论点或 NONE
 * - 全空合法
 */
export async function resolveMemoriesForChat(
  scanText: string,
  chatId: string | undefined,
  caseSensitive: boolean,
  queryText: string
): Promise<RelatedMemoriesForChat> {
  const settings = loadSettings();
  const { keyword } = partitionTriggeredMemories(scanText, chatId, caseSensitive);

  let eventChunks: MemoryChunk[] = [];

  if (keyword.length > 0) {
    const hints = feedbackHintsForQuery(queryText);
    eventChunks = dedupeChunks(keyword)
      .filter((c) => {
        const hint = hints.get(c.id);
        if (hint?.multiplier === 0) {
          console.log(
            `[memory-feedback] 关键词命中已排除 chunk=${c.id.slice(0, 8)}… (${hint.reason})`
          );
          return false;
        }
        return true;
      })
      .slice(0, 1);
  } else if (settings.memoryProactiveRetrieveEnabled !== false) {
    const maxPick = Math.max(1, settings.memoryProactiveRetrieveMax ?? 1);
    eventChunks = await retrieveMemories(queryText, chatId, maxPick);
  }

  let coreadPick: CoreadPickResult | null = null;
  try {
    coreadPick = await resolveCoreadDiscussionForChat(scanText, queryText, caseSensitive);
  } catch (err) {
    console.error("[coread] 召回失败:", err instanceof Error ? err.message : err);
  }

  const leannChunks = await resolveLeannMemories(scanText, caseSensitive, queryText);

  return { eventChunks, coreadPick, leannChunks };
}

/** 注入时不展示的泛化来源名（手动添加等） */
const HIDDEN_EVENT_SOURCE_NAMES = new Set(["手动事件", "手动添加", "事件记忆"]);

function formatEventMemoryLine(c: {
  text: string;
  memoryAt?: string;
  includeTimeInPrompt?: boolean;
  sourceName?: string;
}): string {
  const src = c.sourceName?.trim() || "";
  const showSource = Boolean(src) && !HIDDEN_EVENT_SOURCE_NAMES.has(src);
  const body = showSource ? `〔${src}〕${c.text}` : c.text;
  if (c.includeTimeInPrompt && c.memoryAt) {
    const d = new Date(c.memoryAt);
    if (!Number.isNaN(d.getTime())) {
      const stamp = d.toLocaleString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      const span = formatRelativeTimeSpan(c.memoryAt);
      const when = span ? `${stamp} · ${span}` : stamp;
      return `[${when}] ${body}`;
    }
  }
  return body;
}

function wrapWithInsertTemplate(template: string, body: string): string {
  const tpl = template.trim();
  if (!tpl) return body;
  if (tpl.includes("{{memories}}") || tpl.includes("{{text}}")) {
    return tpl.replace(/\{\{memories\}\}/g, body).replace(/\{\{text\}\}/g, body);
  }
  return `${tpl}\n${body}`;
}

/**
 * 拼成「相关记忆」槽正文（可全空）：
 * - 事件/资料：套用 memoryInsertPrompt
 * - 共读：只套用 coreadInsertPrompt（不再嵌进【相关记忆】）
 */
export function buildRelatedMemoriesBody(related: RelatedMemoriesForChat): string {
  const settings = loadSettings();
  const blocks: string[] = [];

  const eventLines: string[] = [];
  for (const c of related.eventChunks) {
    eventLines.push(formatEventMemoryLine(c));
  }
  for (const c of related.leannChunks) {
    eventLines.push(
      formatEventMemoryLine({
        text: c.text,
        sourceName: c.sourceName,
        memoryAt: c.memoryAt,
        includeTimeInPrompt: c.includeTimeInPrompt,
      })
    );
  }
  if (eventLines.length > 0) {
    const eventBody = eventLines.join("\n");
    blocks.push(wrapWithInsertTemplate(settings.memoryInsertPrompt || "", eventBody));
  }

  if (related.coreadPick) {
    blocks.push(formatCoreadForInjection(related.coreadPick, settings.coreadInsertPrompt));
  }

  return blocks.join("\n\n").trim();
}
