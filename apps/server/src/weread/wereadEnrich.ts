import { loadUserPersona } from "../store/userPersona.js";
import { loadSettings, type WeReadConn } from "../config.js";
import { getChat, updateMessage } from "../store/chats.js";
import type { ChatMessage } from "../store/chats.js";
import {
  WEREAD_ENRICH_MARKER,
  stripWeReadEnrichFromContent,
} from "../tools/enrichMarkers.js";
import {
  extractBookTitle,
  extractChapterHint,
  hasWeReadIntent,
  inferWeReadFetchModes,
  type WeReadFetchMode,
} from "./intent.js";
import {
  filterChaptersByHint,
  getBestBookmarks,
  getBestReviews,
  getBookmarkList,
  getBookInfo,
  getBookProgress,
  getChapterInfos,
  getEntireShelf,
  getNotebookBooks,
  getReviewList,
  getSimilarBooks,
  organizeByChapter,
  resolveWeReadCookie,
  prepareWeReadCookie,
  searchBooksByKeyword,
  type WeReadChapterBlock,
  type WeReadShelfBook,
} from "./client.js";

const MAX_BLOCK_CHARS = 14000;
const SHELF_DISPLAY_LIMIT = 10;

function buildBlock(status: "成功" | "失败", body: string): string {
  return `\n\n${WEREAD_ENRICH_MARKER}\n状态：${status}\n${body}`;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…（已截断，共 ${text.length} 字）`;
}

function formatShelfOverview(books: WeReadShelfBook[]): string {
  const sorted = [...books].sort((a, b) => (b.readUpdateTime || 0) - (a.readUpdateTime || 0));
  const lines = sorted.slice(0, SHELF_DISPLAY_LIMIT).map((b, i) => {
    const prog = b.progress != null ? ` 进度${b.progress}%` : "";
    const notes =
      b.noteCount != null && b.noteCount > 0
        ? ` 笔记${b.noteCount} 划线${b.bookmarkCount || 0}`
        : "";
    const finished = b.finishReading ? " [已读完]" : "";
    return `${i + 1}. 《${b.title}》${b.author}${prog}${notes}${finished}`;
  });
  return `书架共 ${books.length} 本（按最近阅读排序，展示前 ${lines.length} 本）：\n${lines.join("\n")}`;
}

function formatReadingNow(books: WeReadShelfBook[]): string {
  const recent = [...books]
    .filter((b) => b.readUpdateTime)
    .sort((a, b) => (b.readUpdateTime || 0) - (a.readUpdateTime || 0))
    .slice(0, 5);
  if (recent.length === 0) return "暂无最近阅读记录。";
  return recent
    .map((b, i) => {
      const prog = b.progress != null ? `${b.progress}%` : "进度未知";
      const ts = b.readUpdateTime
        ? new Date(b.readUpdateTime * 1000).toISOString().slice(0, 10)
        : "";
      return `${i + 1}. 《${b.title}》${b.author} — ${prog}${ts ? `（${ts}）` : ""}`;
    })
    .join("\n");
}

function formatChapterBlocks(blocks: WeReadChapterBlock[], chapterHint: number | null): string {
  let list = blocks;
  if (chapterHint != null) {
    list = filterChaptersByHint(blocks, chapterHint);
    if (list.length === 0) {
      return `（未找到第 ${chapterHint} 章的笔记/划线；以下为全书按章汇总）\n${formatChapterBlocks(blocks, null)}`;
    }
  }

  const lines: string[] = [];
  const maxChapters = chapterHint != null ? list.length : 15;
  for (const ch of list.slice(0, maxChapters)) {
    lines.push(`\n## ${ch.title}`);
    if (ch.highlights.length > 0) {
      lines.push("【划线】");
      for (const h of ch.highlights.slice(0, 10)) {
        lines.push(`- ${h.markText}`);
      }
      if (ch.highlights.length > 10) lines.push(`…另有 ${ch.highlights.length - 10} 条划线`);
    }
    if (ch.notes.length > 0) {
      lines.push("【笔记/想法】");
      for (const n of ch.notes.slice(0, 8)) {
        lines.push(`- ${n.content}`);
      }
      if (ch.notes.length > 8) lines.push(`…另有 ${ch.notes.length - 8} 条笔记`);
    }
  }
  if (chapterHint == null && list.length > maxChapters) {
    lines.push(`\n…另有 ${list.length - maxChapters} 个章节未展示`);
  }
  return lines.join("\n");
}

async function enrichBookNotes(
  cookie: string,
  book: WeReadShelfBook,
  chapterHint: number | null
): Promise<string> {
  const [info, progress, bookmarks, reviews, chapters] = await Promise.all([
    getBookInfo(cookie, book.bookId).catch(() => null),
    getBookProgress(cookie, book.bookId).catch(() => 0),
    getBookmarkList(cookie, book.bookId).catch(() => []),
    getReviewList(cookie, book.bookId).catch(() => []),
    getChapterInfos(cookie, book.bookId).catch(() => []),
  ]);

  const title = info?.title || book.title;
  const blocks = organizeByChapter(chapters, bookmarks, reviews);
  const header = [
    `《${title}》${info?.author || book.author}`,
    `阅读进度：${progress}%`,
    `划线 ${bookmarks.length} 条，笔记/想法 ${reviews.length} 条（以下按章节组织）`,
  ];
  if (info?.intro) header.push(`简介：${info.intro.slice(0, 200)}…`);
  if (chapterHint != null) {
    const userName = loadUserPersona().name?.trim() || "你";
    header.push(`${userName}提到的章节：第 ${chapterHint} 章`);
  }

  return `${header.join("\n")}\n${formatChapterBlocks(blocks, chapterHint)}`;
}

async function enrichBookReviews(cookie: string, book: WeReadShelfBook): Promise<string> {
  const [best, similar, popularMarks] = await Promise.all([
    getBestReviews(cookie, book.bookId, 5).catch(() => []),
    getSimilarBooks(cookie, book.bookId, 5).catch(() => []),
    getBestBookmarks(cookie, book.bookId, 8).catch(() => []),
  ]);
  const lines: string[] = [`《${book.title}》热门书评、热门划线与推荐`];
  if (popularMarks.length > 0) {
    lines.push("\n【热门划线（书友高频）】");
    for (const m of popularMarks) lines.push(`- ${m}`);
  }
  if (best.length > 0) {
    lines.push("\n【热门书评】");
    for (const r of best) lines.push(`- ${r}`);
  } else {
    lines.push("\n（暂无热门书评数据）");
  }
  if (similar.length > 0) {
    lines.push("\n【同类/推荐】");
    for (const s of similar) lines.push(`- ${s}`);
  }
  return lines.join("\n");
}

async function resolveTargetBook(
  cookie: string,
  shelf: WeReadShelfBook[],
  titleHint: string | null
): Promise<WeReadShelfBook | null> {
  if (!titleHint) return null;
  const matched = searchBooksByKeyword(shelf, titleHint);
  if (matched.length === 0) {
    const notebooks = await getNotebookBooks(cookie).catch(() => []);
    const nbMatch = notebooks.filter(
      (b) =>
        b.title.toLowerCase().includes(titleHint.toLowerCase()) ||
        titleHint.toLowerCase().includes(b.title.toLowerCase())
    );
    if (nbMatch.length === 0) return null;
    const nb = nbMatch[0];
    return {
      bookId: nb.bookId,
      title: nb.title,
      author: nb.author,
      noteCount: nb.noteCount,
      bookmarkCount: nb.bookmarkCount,
      reviewCount: nb.reviewCount,
    };
  }
  return matched[0];
}

async function fetchWeReadContext(
  modes: WeReadFetchMode[],
  titleHint: string | null,
  chapterHint: number | null,
  cookie: string
): Promise<string> {
  const parts: string[] = [];

  const [shelf, notebooks] = await Promise.all([
    getEntireShelf(cookie),
    getNotebookBooks(cookie).catch(() => []),
  ]);
  const notebookMap = new Map(notebooks.map((n) => [n.bookId, n]));

  const shelfWithNotes: WeReadShelfBook[] = shelf.map((b) => {
    const nb = notebookMap.get(b.bookId);
    return {
      ...b,
      noteCount: nb?.noteCount,
      bookmarkCount: nb?.bookmarkCount,
      reviewCount: nb?.reviewCount,
    };
  });

  if (modes.includes("shelf")) {
    parts.push(formatShelfOverview(shelfWithNotes));
  }
  if (modes.includes("reading_now")) {
    const recentIds = [...shelfWithNotes]
      .filter((b) => b.readUpdateTime)
      .sort((a, b) => (b.readUpdateTime || 0) - (a.readUpdateTime || 0))
      .slice(0, 5);
    const withProgress = await Promise.all(
      recentIds.map(async (b) => ({
        ...b,
        progress: await getBookProgress(cookie, b.bookId).catch(() => undefined),
      }))
    );
    parts.push(`【最近在读】\n${formatReadingNow(withProgress)}`);
  }

  let target = await resolveTargetBook(cookie, shelfWithNotes, titleHint);
  if (!target && chapterHint != null && (modes.includes("book_notes") || modes.includes("book_reviews"))) {
    const recent = [...shelfWithNotes]
      .filter((b) => b.readUpdateTime)
      .sort((a, b) => (b.readUpdateTime || 0) - (a.readUpdateTime || 0))[0];
    if (recent) target = recent;
  }

  if (target) {
    target.progress = await getBookProgress(cookie, target.bookId).catch(() => target.progress);
    if (modes.includes("book_notes")) {
      parts.push(await enrichBookNotes(cookie, target, chapterHint));
    }
    if (modes.includes("book_reviews")) {
      parts.push(await enrichBookReviews(cookie, target));
    }
  } else if (titleHint && (modes.includes("book_notes") || modes.includes("book_reviews"))) {
    parts.push(`未在书架找到《${titleHint}》，请确认书名或是否已加入微信读书。`);
  }

  return truncate(parts.join("\n\n---\n\n"), MAX_BLOCK_CHARS);
}

import { isWeReadConfigured, SERVICE_AUTH_HINT } from "../tools/serviceAuth.js";

function hasWeReadAuth(conn: WeReadConn): boolean {
  return isWeReadConfigured(conn);
}

export async function enrichUserMessageWeRead(chatId: string, message: ChatMessage): Promise<ChatMessage> {
  if (message.role !== "user") return message;

  const baseContent = stripWeReadEnrichFromContent(message.content);
  if (!hasWeReadIntent(baseContent)) return message;

  const settings = loadSettings();
  if (settings.wereadEnabled === false) {
    const block = buildBlock("失败", "原因：已在设置中关闭「微信读书」能力。");
    const enriched = `${baseContent}${block}`;
    const updated = updateMessage(chatId, message.id, { content: enriched });
    return updated || { ...message, content: enriched };
  }

  if (!hasWeReadAuth(settings.weread)) {
    const block = buildBlock(
      "失败",
      `原因：未配置微信读书 Cookie 或 CookieCloud。${SERVICE_AUTH_HINT}`
    );
    const enriched = `${baseContent}${block}`;
    const updated = updateMessage(chatId, message.id, { content: enriched });
    return updated || { ...message, content: enriched };
  }

  try {
    const rawCookie = await resolveWeReadCookie(settings.weread);
    const cookie = await prepareWeReadCookie(rawCookie);
    const modes = inferWeReadFetchModes(baseContent);
    const titleHint = extractBookTitle(baseContent);
    const chapterHint = extractChapterHint(baseContent);
    const body = await fetchWeReadContext(modes, titleHint, chapterHint, cookie);
    const block = buildBlock("成功", `数据：\n${body}`);
    const enriched = `${baseContent}${block}`;
    const updated = updateMessage(chatId, message.id, { content: enriched });
    return updated || { ...message, content: enriched };
  } catch (err) {
    const errText = err instanceof Error ? err.message : "未知错误";
    const block = buildBlock("失败", `原因：${errText}`);
    const enriched = `${baseContent}${block}`;
    const updated = updateMessage(chatId, message.id, { content: enriched });
    return updated || { ...message, content: enriched };
  }
}

export async function enrichLatestUserMessageWeRead(chatId: string): Promise<void> {
  const chat = getChat(chatId);
  if (!chat) return;
  const last = chat.messages[chat.messages.length - 1];
  if (!last || last.role !== "user") return;
  await enrichUserMessageWeRead(chatId, last);
}
