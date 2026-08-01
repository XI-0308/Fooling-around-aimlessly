import fs from "fs";
import path from "path";
import crypto from "crypto";
import { MEMORY_DIR, ensureDataDir } from "../config.js";

export type MemoryRating = "up" | "down";

export interface MemoryFeedbackRecord {
  id: string;
  chatId: string;
  messageId: string;
  chunkId: string;
  query: string;
  rating: MemoryRating;
  createdAt: string;
  updatedAt: string;
}

const FEEDBACK_PATH = path.join(MEMORY_DIR, "feedback.json");

function loadAll(): MemoryFeedbackRecord[] {
  ensureDataDir();
  if (!fs.existsSync(FEEDBACK_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(FEEDBACK_PATH, "utf-8")) as MemoryFeedbackRecord[];
  } catch {
    return [];
  }
}

function saveAll(rows: MemoryFeedbackRecord[]): void {
  ensureDataDir();
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.writeFileSync(FEEDBACK_PATH, JSON.stringify(rows, null, 2));
}

/** 同一 (messageId, chunkId) 只保留一条；rating 为空则删除 */
export function upsertMemoryFeedback(input: {
  chatId: string;
  messageId: string;
  chunkId: string;
  query: string;
  rating: MemoryRating | null;
}): MemoryFeedbackRecord | null {
  const rows = loadAll();
  const idx = rows.findIndex(
    (r) => r.messageId === input.messageId && r.chunkId === input.chunkId
  );
  const now = new Date().toISOString();

  if (!input.rating) {
    if (idx >= 0) {
      rows.splice(idx, 1);
      saveAll(rows);
    }
    return null;
  }

  if (idx >= 0) {
    rows[idx] = {
      ...rows[idx],
      query: input.query || rows[idx].query,
      rating: input.rating,
      updatedAt: now,
    };
    saveAll(rows);
    return rows[idx];
  }

  const row: MemoryFeedbackRecord = {
    id: crypto.randomUUID(),
    chatId: input.chatId,
    messageId: input.messageId,
    chunkId: input.chunkId,
    query: input.query,
    rating: input.rating,
    createdAt: now,
    updatedAt: now,
  };
  rows.push(row);
  saveAll(rows);
  return row;
}

/** 某 chunk 被标「不准」的次数（后续检索可降权用） */
export function countDownVotesForChunk(chunkId: string): number {
  return loadAll().filter((r) => r.chunkId === chunkId && r.rating === "down").length;
}

function tokenizeLoose(text: string): Set<string> {
  return new Set(
    (text || "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\u4e00-\u9fff]+/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length >= 2)
  );
}

/** 粗略 query 相似度：共享词比例 */
function queryOverlap(a: string, b: string): number {
  const ta = tokenizeLoose(a);
  const tb = tokenizeLoose(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  return inter / Math.min(ta.size, tb.size);
}

export type FeedbackScoreHint = {
  /** 乘到 TF-IDF 分上；0 = 直接排除 */
  multiplier: number;
  reason?: string;
};

/**
 * 用历史 ♥/♡ 调整本轮候选分。
 * - 相近 query 上标过不准 → 排除（multiplier=0）
 * - 相近 query 上标过准 → 略加分
 */
export function feedbackHintsForQuery(queryText: string): Map<string, FeedbackScoreHint> {
  const rows = loadAll();
  const out = new Map<string, FeedbackScoreHint>();
  if (!queryText.trim() || rows.length === 0) return out;

  for (const row of rows) {
    const overlap = queryOverlap(queryText, row.query || "");
    if (overlap < 0.35) continue;

    const prev = out.get(row.chunkId);
    if (row.rating === "down") {
      // 不准优先：直接排除
      out.set(row.chunkId, {
        multiplier: 0,
        reason: `prior-down overlap=${overlap.toFixed(2)}`,
      });
    } else if (row.rating === "up" && (!prev || prev.multiplier > 0)) {
      out.set(row.chunkId, {
        multiplier: Math.max(prev?.multiplier ?? 1, 1.35),
        reason: `prior-up overlap=${overlap.toFixed(2)}`,
      });
    }
  }
  return out;
}
