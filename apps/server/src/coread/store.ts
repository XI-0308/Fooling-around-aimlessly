import fs from "fs";
import path from "path";
import crypto from "crypto";
import { MEMORY_DIR, ensureDataDir } from "../config.js";
import { anyKeyMatches } from "../triggerMatch.js";

export interface CoreadDraft {
  id: string;
  text: string;
  chatId?: string;
  messageIds?: string[];
  createdAt: string;
  /** 已参与过夜间/双日整理后打标；用户可删草稿，未删则不再重复整理 */
  digestedAt?: string;
}

export interface CoreadDiscussion {
  id: string;
  claim: string;
  userView: string;
  charView: string;
  /** 注入用完整条文 */
  text: string;
  createdAt: string;
  updatedAt: string;
}

/** 读取旧 data/ 里的 xiView/suView 字段 */
function normalizeDiscussion(raw: CoreadDiscussion & { xiView?: string; suView?: string }): CoreadDiscussion {
  return {
    ...raw,
    userView: raw.userView ?? raw.xiView ?? "",
    charView: raw.charView ?? raw.suView ?? "",
  };
}

function normalizeBook(book: CoreadBook & { discussions?: Array<CoreadDiscussion & { xiView?: string; suView?: string }> }): CoreadBook {
  return {
    ...book,
    discussions: (book.discussions || []).map(normalizeDiscussion),
  };
}

export interface CoreadBook {
  id: string;
  title: string;
  keys: string[];
  drafts: CoreadDraft[];
  discussions: CoreadDiscussion[];
  createdAt: string;
  updatedAt: string;
}

const BOOKS_PATH = path.join(MEMORY_DIR, "coread-books.json");

export function loadCoreadBooks(): CoreadBook[] {
  ensureDataDir();
  if (!fs.existsSync(BOOKS_PATH)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(BOOKS_PATH, "utf-8")) as CoreadBook[];
    return Array.isArray(raw) ? raw.map(normalizeBook) : [];
  } catch {
    return [];
  }
}

export function saveCoreadBooks(books: CoreadBook[]): void {
  ensureDataDir();
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.writeFileSync(BOOKS_PATH, JSON.stringify(books, null, 2), "utf-8");
}

export function getCoreadBook(id: string): CoreadBook | null {
  return loadCoreadBooks().find((b) => b.id === id) || null;
}

export function createCoreadBook(title: string, keysText?: string): CoreadBook {
  const trimmed = title.trim();
  if (!trimmed) throw new Error("请填写共读卡片标题（书名）");
  const books = loadCoreadBooks();
  if (books.some((b) => b.title === trimmed)) {
    throw new Error(`已存在同名共读卡「${trimmed}」，请勿重复创建`);
  }
  const now = new Date().toISOString();
  const keys = (keysText || "")
    .split(/[,，;；\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!keys.includes(trimmed)) keys.unshift(trimmed);
  const bare = trimmed.replace(/[《》〈〉「」『』]/g, "").trim();
  if (bare && !keys.includes(bare)) keys.push(bare);
  const book: CoreadBook = {
    id: crypto.randomUUID(),
    title: trimmed,
    keys,
    drafts: [],
    discussions: [],
    createdAt: now,
    updatedAt: now,
  };
  books.push(book);
  saveCoreadBooks(books);
  return book;
}

export function updateCoreadBook(
  id: string,
  patch: {
    title?: string;
    keys?: string[];
    discussions?: CoreadDiscussion[];
    drafts?: CoreadDraft[];
  }
): CoreadBook | null {
  const books = loadCoreadBooks();
  const idx = books.findIndex((b) => b.id === id);
  if (idx < 0) return null;
  const now = new Date().toISOString();
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) throw new Error("标题不能为空");
    if (books.some((b, i) => i !== idx && b.title === t)) {
      throw new Error(`已存在同名共读卡「${t}」`);
    }
    books[idx].title = t;
  }
  if (patch.keys !== undefined) books[idx].keys = patch.keys;
  if (patch.discussions !== undefined) books[idx].discussions = patch.discussions;
  if (patch.drafts !== undefined) books[idx].drafts = patch.drafts;
  books[idx].updatedAt = now;
  saveCoreadBooks(books);
  return books[idx];
}

export function deleteCoreadBook(id: string): boolean {
  const books = loadCoreadBooks();
  const next = books.filter((b) => b.id !== id);
  if (next.length === books.length) return false;
  saveCoreadBooks(next);
  return true;
}

export function appendCoreadDraft(
  bookId: string,
  draft: Omit<CoreadDraft, "id" | "createdAt"> & { id?: string; createdAt?: string }
): CoreadBook | null {
  const books = loadCoreadBooks();
  const idx = books.findIndex((b) => b.id === bookId);
  if (idx < 0) return null;
  const now = new Date().toISOString();
  books[idx].drafts.push({
    id: draft.id || crypto.randomUUID(),
    text: draft.text,
    chatId: draft.chatId,
    messageIds: draft.messageIds,
    createdAt: draft.createdAt || now,
    digestedAt: draft.digestedAt,
  });
  books[idx].updatedAt = now;
  saveCoreadBooks(books);
  return books[idx];
}

export function deleteCoreadDraft(bookId: string, draftId: string): CoreadBook | null {
  const books = loadCoreadBooks();
  const idx = books.findIndex((b) => b.id === bookId);
  if (idx < 0) return null;
  const before = books[idx].drafts.length;
  books[idx].drafts = books[idx].drafts.filter((d) => d.id !== draftId);
  if (books[idx].drafts.length === before) return null;
  books[idx].updatedAt = new Date().toISOString();
  saveCoreadBooks(books);
  return books[idx];
}

export function updateCoreadDraft(
  bookId: string,
  draftId: string,
  patch: { text?: string; clearDigested?: boolean }
): CoreadBook | null {
  const books = loadCoreadBooks();
  const idx = books.findIndex((b) => b.id === bookId);
  if (idx < 0) return null;
  const draft = books[idx].drafts.find((d) => d.id === draftId);
  if (!draft) return null;
  if (typeof patch.text === "string") {
    const t = patch.text.trim();
    if (!t) throw new Error("草稿内容不能为空");
    draft.text = patch.text;
  }
  if (patch.clearDigested) {
    delete draft.digestedAt;
  }
  books[idx].updatedAt = new Date().toISOString();
  saveCoreadBooks(books);
  return books[idx];
}

export function deleteCoreadDiscussion(bookId: string, discussionId: string): CoreadBook | null {
  const books = loadCoreadBooks();
  const idx = books.findIndex((b) => b.id === bookId);
  if (idx < 0) return null;
  const before = books[idx].discussions.length;
  books[idx].discussions = books[idx].discussions.filter((d) => d.id !== discussionId);
  if (books[idx].discussions.length === before) return null;
  books[idx].updatedAt = new Date().toISOString();
  saveCoreadBooks(books);
  return books[idx];
}

export function updateCoreadDiscussion(
  bookId: string,
  discussionId: string,
  patch: Partial<
    Pick<CoreadDiscussion, "claim" | "userView" | "charView" | "text"> & {
      xiView?: string;
      suView?: string;
    }
  >
): CoreadBook | null {
  const books = loadCoreadBooks();
  const idx = books.findIndex((b) => b.id === bookId);
  if (idx < 0) return null;
  const dIdx = books[idx].discussions.findIndex((d) => d.id === discussionId);
  if (dIdx < 0) return null;
  const now = new Date().toISOString();
  const d = books[idx].discussions[dIdx];
  if (patch.claim !== undefined) d.claim = patch.claim;
  if (patch.userView !== undefined) d.userView = patch.userView;
  else if (patch.xiView !== undefined) d.userView = patch.xiView;
  if (patch.charView !== undefined) d.charView = patch.charView;
  else if (patch.suView !== undefined) d.charView = patch.suView;
  if (patch.text !== undefined) {
    d.text = patch.text;
  } else if (
    patch.claim !== undefined ||
    patch.userView !== undefined ||
    patch.charView !== undefined ||
    patch.xiView !== undefined ||
    patch.suView !== undefined
  ) {
    d.text = formatDiscussionText(d.claim, d.userView, d.charView);
  }
  d.updatedAt = now;
  books[idx].updatedAt = now;
  saveCoreadBooks(books);
  return books[idx];
}

export function formatDiscussionText(
  claim: string,
  userView: string,
  charView: string,
  userName = "你",
  charName = "角色"
): string {
  return `- 论点：${claim.trim()}\n${userName}的观点：${userView.trim()}\n${charName}的观点：${charView.trim()}`;
}

export function findCoreadBooksByScan(
  scanText: string,
  caseSensitive: boolean
): CoreadBook[] {
  return loadCoreadBooks().filter((b) => {
    const keys = b.keys?.length ? b.keys : [b.title];
    return anyKeyMatches(keys, scanText, caseSensitive);
  });
}
