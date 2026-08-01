import { listActivities } from "../activity/store.js";
import { loadCoreadBooks } from "../coread/store.js";
import {
  getLeannCollection,
  loadLeannCollections,
  readCollectionSource,
} from "../leann/collections.js";
import { getMemoryTypeLabel, isEventMemory, isWeReadMemory } from "./labels.js";
import { loadMemoryChunks, type MemorySourceType } from "./store.js";
import { loadWorldInfoBook } from "../worldInfo/store.js";
import type { WorldInfoEntry } from "../worldInfo/types.js";

export type GlobalSearchKind =
  | "worldinfo"
  | "memory"
  | "coread_book"
  | "coread_discussion"
  | "coread_draft"
  | "activity";

export interface GlobalSearchHit {
  /** 列表唯一键 */
  uid: string;
  kind: GlobalSearchKind;
  categoryLabel: string;
  title: string;
  preview: string;
  /** 可编辑全文（电子书过长时仍截断到合理长度） */
  body?: string;
  keys: string[];
  /** memory chunk */
  memoryId?: string;
  sourceType?: string;
  leannCollectionId?: string;
  leannStatus?: "draft" | "indexed";
  /** worldinfo */
  worldInfoId?: string;
  worldInfoMemo?: string;
  worldInfoContent?: string;
  worldInfoConstant?: boolean;
  /** 完整条目，保存时回写以免冲掉其它字段 */
  worldInfoEntry?: WorldInfoEntry;
  /** coread */
  coreadBookId?: string;
  coreadDraftId?: string;
  coreadDiscussionId?: string;
  coreadClaim?: string;
  coreadUserView?: string;
  coreadCharView?: string;
  /** activity */
  activityId?: string;
  activityTitle?: string;
  activityNote?: string;
  activityDate?: string;
}

function norm(s: string): string {
  return s.toLowerCase();
}

function matches(q: string, ...parts: Array<string | undefined | null>): boolean {
  return parts.some((p) => p && norm(p).includes(q));
}

function clip(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/** 编辑用正文：电子书全文过大时截断，避免响应爆炸 */
function editBody(text: string, max = 120_000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n\n…（正文过长，完整内容请用「编辑电子书」）`;
}

function memoryCategoryLabel(sourceType: string): string {
  const st = sourceType as MemorySourceType;
  if (st === "leann") return "电子书索引";
  if (st === "file") return "资料短篇";
  if (isWeReadMemory(st)) return "读书记忆";
  if (isEventMemory(st)) return "事件记忆";
  return getMemoryTypeLabel(st);
}

/** 全库关键词检索（语意 / 事件 / 读书 / 资料 / LEANN 全文 / 活动） */
export function searchMemoryGlobal(query: string, limit = 80): GlobalSearchHit[] {
  const q = norm(query.trim());
  if (q.length < 1) return [];

  const hits: GlobalSearchHit[] = [];

  // 语意记忆（世界书）
  for (const e of loadWorldInfoBook().entries) {
    if (
      !matches(
        q,
        e.memo,
        e.content,
        ...(e.keys || []),
        ...(e.secondaryKeys || [])
      )
    ) {
      continue;
    }
    hits.push({
      uid: `worldinfo:${e.id}`,
      kind: "worldinfo",
      categoryLabel: "语意记忆",
      title: e.memo?.trim() || (e.keys?.[0] ? e.keys.join("、") : "语意记忆条目"),
      preview: clip(e.content || ""),
      body: e.content || "",
      keys: e.keys || [],
      worldInfoId: e.id,
      worldInfoMemo: e.memo,
      worldInfoContent: e.content,
      worldInfoConstant: e.constant,
      worldInfoEntry: e,
    });
  }

  // 记忆壳（含 LEANN 书目壳）
  const seenLeann = new Set<string>();
  for (const c of loadMemoryChunks()) {
    const keys = c.keys ?? [];
    let matched = matches(q, c.text, c.sourceName, c.wereadBookTitle, ...keys);
    let sourceExtra = "";
    if (c.sourceType === "leann" && c.leannCollectionId) {
      const col = getLeannCollection(c.leannCollectionId);
      if (col) {
        const full = readCollectionSource(col);
        if (matches(q, full, col.name)) {
          matched = true;
          sourceExtra = full;
        }
        seenLeann.add(c.leannCollectionId);
      }
    }
    if (!matched) continue;
    const previewBase = sourceExtra || c.text;
    hits.push({
      uid: `memory:${c.id}`,
      kind: "memory",
      categoryLabel: memoryCategoryLabel(c.sourceType),
      title:
        c.sourceType === "leann"
          ? c.sourceName || "电子书"
          : keys.length
            ? keys.join("、")
            : clip(c.text, 40),
      preview: clip(previewBase),
      body: editBody(c.sourceType === "leann" ? c.text : previewBase),
      keys,
      memoryId: c.id,
      sourceType: c.sourceType,
      leannCollectionId: c.leannCollectionId,
      leannStatus:
        c.sourceType === "leann" && c.leannCollectionId
          ? getLeannCollection(c.leannCollectionId)?.status
          : undefined,
    });
  }

  // LEANN 孤儿书目（有索引无记忆壳）
  for (const col of loadLeannCollections()) {
    if (seenLeann.has(col.id)) continue;
    const full = readCollectionSource(col);
    if (!matches(q, full, col.name)) continue;
    hits.push({
      uid: `leann:${col.id}`,
      kind: "memory",
      categoryLabel: "电子书索引",
      title: col.name,
      preview: clip(full),
      body: editBody(full),
      keys: [],
      leannCollectionId: col.id,
      leannStatus: col.status,
    });
  }

  // 读书共读
  for (const book of loadCoreadBooks()) {
    if (matches(q, book.title, ...book.keys)) {
      hits.push({
        uid: `coread_book:${book.id}`,
        kind: "coread_book",
        categoryLabel: "读书记忆 · 书目",
        title: book.title || "未命名书目",
        preview: clip(`关键词：${book.keys.join("、") || "（无）"} · 讨论 ${book.discussions.length} · 草稿 ${book.drafts.length}`),
        keys: book.keys,
        coreadBookId: book.id,
      });
    }
    for (const d of book.discussions) {
      if (!matches(q, d.claim, d.userView, d.charView, d.text)) continue;
      hits.push({
        uid: `coread_discussion:${book.id}:${d.id}`,
        kind: "coread_discussion",
        categoryLabel: "读书记忆 · 讨论",
        title: `${book.title || "书目"} · ${clip(d.claim || d.text, 36)}`,
        preview: clip(d.text || `${d.claim}\n${d.userView}\n${d.charView}`),
        body: d.text || "",
        keys: book.keys,
        coreadBookId: book.id,
        coreadDiscussionId: d.id,
        coreadClaim: d.claim,
        coreadUserView: d.userView,
        coreadCharView: d.charView,
      });
    }
    for (const dr of book.drafts) {
      if (!matches(q, dr.text)) continue;
      hits.push({
        uid: `coread_draft:${book.id}:${dr.id}`,
        kind: "coread_draft",
        categoryLabel: "读书记忆 · 草稿",
        title: `${book.title || "书目"} · 草稿`,
        preview: clip(dr.text),
        body: dr.text,
        keys: book.keys,
        coreadBookId: book.id,
        coreadDraftId: dr.id,
      });
    }
  }

  // 近期活动
  for (const a of listActivities()) {
    if (!matches(q, a.title, a.note)) continue;
    hits.push({
      uid: `activity:${a.id}`,
      kind: "activity",
      categoryLabel: "近期活动",
      title: a.title,
      preview: clip([a.date, a.time, a.note].filter(Boolean).join(" · ")),
      keys: [],
      activityId: a.id,
      activityTitle: a.title,
      activityNote: a.note || "",
      activityDate: a.date,
    });
  }

  return hits.slice(0, Math.max(1, Math.min(200, limit)));
}
