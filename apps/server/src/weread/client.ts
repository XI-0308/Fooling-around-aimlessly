import type { WeReadConn } from "../config.js";
import { isCookieCloudReady } from "../cookieCloud/shared.js";
import { resolveWeReadCookie } from "./cookieCloud.js";

const BASE = "https://weread.qq.com";

const HEADERS_BASE: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

export interface WeReadShelfBook {
  bookId: string;
  title: string;
  author: string;
  category?: string;
  progress?: number;
  finishReading?: boolean;
  readUpdateTime?: number;
  noteCount?: number;
  bookmarkCount?: number;
  reviewCount?: number;
}

export interface WeReadHighlight {
  chapterUid: number;
  chapterTitle?: string;
  markText: string;
  createTime?: number;
}

export interface WeReadNote {
  chapterUid?: number;
  content: string;
  highlightText?: string;
  createTime?: number;
}

export interface WeReadChapterInfo {
  chapterUid: number;
  chapterIdx: number;
  title: string;
  level: number;
}

export interface WeReadChapterBlock {
  chapterUid: number;
  chapterIdx: number;
  title: string;
  highlights: WeReadHighlight[];
  notes: WeReadNote[];
}

function buildHeaders(cookie: string): Record<string, string> {
  return { ...HEADERS_BASE, Cookie: cookie };
}

function parseCookieJar(cookie: string): Record<string, string> {
  const jar: Record<string, string> = {};
  for (const part of cookie.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    jar[trimmed.slice(0, eq)] = trimmed.slice(eq + 1);
  }
  return jar;
}

function serializeCookieJar(jar: Record<string, string>): string {
  return Object.entries(jar)
    .filter(([, value]) => value && value !== "undefined" && value !== "NaN")
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

/** 网页版打开时会自动调用 renewal；CookieCloud 静态 Cookie 可先尝试续期。
 * 注意：续期接口偶发返回「微信登录授权已过期，继续购买…」(-12013)，
 * 此时书架/笔记 API 往往仍可用——续期失败不得直接当作整站登录失效。 */
async function renewWeReadSession(cookie: string): Promise<{ cookie: string; ok: boolean; errMsg?: string }> {
  const res = await fetch(`${BASE}/web/login/renewal`, {
    method: "POST",
    headers: {
      ...buildHeaders(cookie),
      "Content-Type": "application/json;charset=UTF-8",
      Origin: BASE,
      Referer: `${BASE}/`,
    },
    // 用书架路径，避免绑到「阅读/购买」续期语义
    body: JSON.stringify({ rq: "%2Fweb%2Fshelf", ql: false }),
  });
  const raw = (await res.json()) as { succ?: number; errCode?: number; errMsg?: string };
  const jar = parseCookieJar(cookie);
  const setCookies =
    typeof res.headers.getSetCookie === "function" ? res.headers.getSetCookie() : [];
  for (const line of setCookies) {
    const [nv] = line.split(";");
    const eq = nv.indexOf("=");
    if (eq <= 0) continue;
    const name = nv.slice(0, eq);
    const value = nv.slice(eq + 1);
    if (value && value !== "undefined" && value !== "NaN") jar[name] = value;
  }
  const next = serializeCookieJar(jar);
  if (raw.succ === 1) return { cookie: next, ok: true };
  return {
    cookie: next,
    ok: false,
    errMsg: raw.errMsg || `续期失败 code=${raw.errCode ?? "?"}`,
  };
}

/** 从 CookieCloud / 手动 Cookie 解析后，尽量续期；失败仍用原 Cookie 继续查书架 */
export async function prepareWeReadCookie(cookie: string): Promise<string> {
  try {
    const renewed = await renewWeReadSession(cookie);
    if (!renewed.ok) {
      console.warn(`[weread] renewal soft-fail: ${renewed.errMsg}（仍尝试用现有 Cookie 拉书架）`);
    }
    return renewed.cookie;
  } catch (err) {
    console.warn(
      "[weread] renewal request failed:",
      err instanceof Error ? err.message : err,
      "（仍尝试用现有 Cookie）"
    );
    return cookie;
  }
}

function isSessionTimeoutCode(code: number | undefined): boolean {
  return code === -2012 || code === -2010;
}

function formatWeReadApiError(errcode: number | undefined, errmsg?: string): string {
  const msg = (errmsg || "").trim();
  // 续期/购买口吻的 -12013：书架往往仍可用，不应让用户以为整站登录挂了
  if (errcode === -12013 || /继续购买|微信登录授权已过期/.test(msg)) {
    return (
      "微信读书某接口需要重新授权（多与购买/阅读页有关），书架登录可能仍有效。" +
      "若书架也读不到，请在 Edge 打开 weread.qq.com 后点 CookieCloud「手动同步」。"
    );
  }
  if (isSessionTimeoutCode(errcode)) {
    return "微信读书登录已超时。请在 Edge 打开 weread.qq.com 确认能正常使用，再点 CookieCloud「手动同步」";
  }
  return msg || `微信读书 API 错误 code=${errcode}`;
}

async function wereadGet<T>(
  cookie: string,
  path: string,
  params: Record<string, string | number> = {},
  retried = false
): Promise<T> {
  const url = new URL(path.startsWith("http") ? path : `${BASE}${path}`);
  url.searchParams.set("_", String(Date.now()));
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), { headers: buildHeaders(cookie) });
  if (!res.ok) {
    throw new Error(`微信读书 API HTTP ${res.status}`);
  }
  const data = (await res.json()) as T & {
    errcode?: number;
    errmsg?: string;
    errCode?: number;
    errMsg?: string;
  };
  const errcode = data.errcode ?? data.errCode;
  if (errcode !== undefined && errcode !== 0) {
    if (isSessionTimeoutCode(errcode) && !retried) {
      const renewed = await renewWeReadSession(cookie);
      return wereadGet<T>(renewed.cookie, path, params, true);
    }
    throw new Error(formatWeReadApiError(errcode, data.errmsg || data.errMsg));
  }
  return data;
}

interface ShelfSyncRaw {
  books?: Array<{
    bookId: string;
    title: string;
    author: string;
    category?: string;
    finishReading?: number;
    readUpdateTime?: number;
  }>;
}

interface NotebookRaw {
  books?: Array<{
    bookId: string;
    book?: { title?: string; author?: string };
    noteCount?: number;
    bookmarkCount?: number;
    reviewCount?: number;
  }>;
}

interface ProgressRaw {
  book?: { progress?: number };
}

interface BookInfoRaw {
  title?: string;
  author?: string;
  intro?: string;
}

interface BookmarkRaw {
  updated?: Array<{ chapterUid?: number; markText?: string; createTime?: number }>;
}

interface ReviewListRaw {
  reviews?: Array<{
    review?: {
      content?: string;
      abstract?: string;
      chapterUid?: number;
      createTime?: number;
      type?: number;
    };
  }>;
}

interface BestReviewRaw {
  reviews?: Array<{ review?: { content?: string; user?: { name?: string }; likeCount?: number } }>;
}

interface BestBookmarkRaw {
  items?: Array<{ markText?: string; count?: number }>;
}

interface SimilarRaw {
  books?: Array<{ title?: string; author?: string; newRating?: number }>;
}

interface ChapterInfoRaw {
  data?: Array<{ updated?: WeReadChapterInfo[] }>;
  updated?: WeReadChapterInfo[];
}

export async function getEntireShelf(cookie: string): Promise<WeReadShelfBook[]> {
  const data = await wereadGet<ShelfSyncRaw>(cookie, "/web/shelf/sync", {
    synckey: 0,
    lectureSynckey: 0,
  });
  return (data.books || []).map((b) => ({
    bookId: b.bookId,
    title: b.title || "（无标题）",
    author: b.author || "未知作者",
    category: b.category,
    finishReading: b.finishReading === 1,
    readUpdateTime: b.readUpdateTime,
  }));
}

export async function getNotebookBooks(cookie: string) {
  const data = await wereadGet<NotebookRaw>(cookie, "/api/user/notebook");
  return (data.books || []).map((b) => ({
    bookId: b.bookId,
    title: b.book?.title || "（无标题）",
    author: b.book?.author || "未知作者",
    noteCount: b.noteCount || 0,
    bookmarkCount: b.bookmarkCount || 0,
    reviewCount: b.reviewCount || 0,
  }));
}

export async function getBookProgress(cookie: string, bookId: string): Promise<number> {
  const data = await wereadGet<ProgressRaw>(cookie, "/web/book/getProgress", { bookId });
  return data.book?.progress ?? 0;
}

export async function getBookInfo(cookie: string, bookId: string): Promise<BookInfoRaw> {
  return wereadGet<BookInfoRaw>(cookie, "/api/book/info", { bookId });
}

export async function getBookmarkList(cookie: string, bookId: string): Promise<WeReadHighlight[]> {
  const data = await wereadGet<BookmarkRaw>(cookie, "/web/book/bookmarklist", { bookId });
  return (data.updated || [])
    .filter((m) => m.markText && m.chapterUid)
    .map((m) => ({
      chapterUid: m.chapterUid!,
      markText: m.markText!,
      createTime: m.createTime,
    }));
}

export async function getReviewList(cookie: string, bookId: string): Promise<WeReadNote[]> {
  const data = await wereadGet<ReviewListRaw>(cookie, "/web/review/list", {
    bookId,
    listType: 4,
    maxIdx: 0,
    count: 0,
    listMode: 2,
    syncKey: 0,
  });
  return (data.reviews || [])
    .map((x) => x.review)
    .filter(Boolean)
    .map((r) => {
      const type = r!.type;
      const chapterUid = type === 4 ? 1_000_000 : r!.chapterUid;
      return {
        chapterUid,
        content: (r!.content || r!.abstract || "").trim(),
        createTime: r!.createTime,
      };
    })
    .filter((n) => n.content);
}

export async function getChapterInfos(cookie: string, bookId: string): Promise<WeReadChapterInfo[]> {
  const url = `${BASE}/web/book/chapterInfos?_=${Date.now()}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...buildHeaders(cookie),
      "Content-Type": "application/json;charset=UTF-8",
      Origin: "https://weread.qq.com",
      Referer: `https://weread.qq.com/web/reader/${bookId}`,
    },
    body: JSON.stringify({ bookIds: [bookId] }),
  });
  if (!res.ok) {
    throw new Error(`章节信息 HTTP ${res.status}`);
  }
  const data = (await res.json()) as ChapterInfoRaw;
  let chapters: WeReadChapterInfo[] = [];
  if (data.data?.[0]?.updated) chapters = data.data[0].updated;
  else if (data.updated) chapters = data.updated;
  chapters.push({
    chapterUid: 1_000_000,
    chapterIdx: 1_000_000,
    title: "点评",
    level: 1,
  });
  return chapters.sort((a, b) => a.chapterIdx - b.chapterIdx);
}

export function organizeByChapter(
  chapters: WeReadChapterInfo[],
  bookmarks: WeReadHighlight[],
  reviews: WeReadNote[]
): WeReadChapterBlock[] {
  const chapterMap = new Map<number, WeReadChapterBlock>();
  for (const ch of chapters) {
    chapterMap.set(ch.chapterUid, {
      chapterUid: ch.chapterUid,
      chapterIdx: ch.chapterIdx,
      title: ch.title,
      highlights: [],
      notes: [],
    });
  }

  const ensureBlock = (uid: number): WeReadChapterBlock => {
    const existing = chapterMap.get(uid);
    if (existing) return existing;
    const orphan: WeReadChapterBlock = {
      chapterUid: uid,
      chapterIdx: 999999,
      title: "（未归类章节）",
      highlights: [],
      notes: [],
    };
    chapterMap.set(uid, orphan);
    return orphan;
  };

  for (const h of bookmarks) {
    const block = ensureBlock(h.chapterUid);
    block.highlights.push({ ...h, chapterTitle: block.title });
  }
  for (const n of reviews) {
    const uid = n.chapterUid ?? 0;
    ensureBlock(uid).notes.push(n);
  }

  return [...chapterMap.values()]
    .filter((b) => b.highlights.length > 0 || b.notes.length > 0)
    .sort((a, b) => a.chapterIdx - b.chapterIdx);
}

export function filterChaptersByHint(blocks: WeReadChapterBlock[], hint: number | null): WeReadChapterBlock[] {
  if (hint == null) return blocks;
  const cn = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  const cnChar = cn[hint] || String(hint);
  const matched = blocks.filter(
    (b) =>
      b.chapterIdx === hint ||
      new RegExp(`第\\s*0*${hint}\\s*章|第\\s*${cnChar}\\s*章|Chapter\\s*0*${hint}`, "i").test(b.title)
  );
  return matched.length > 0 ? matched : blocks;
}

export async function getBestReviews(cookie: string, bookId: string, count = 5): Promise<string[]> {
  const data = await wereadGet<BestReviewRaw>(cookie, "/web/review/list/best", {
    bookId,
    synckey: 0,
    maxIdx: 0,
    count,
  });
  return (data.reviews || [])
    .map((x) => x.review)
    .filter(Boolean)
    .map((r) => {
      const user = r!.user?.name || "书友";
      const likes = r!.likeCount ? `（${r!.likeCount}赞）` : "";
      const text = (r!.content || "").trim().slice(0, 300);
      return text ? `${user}${likes}：${text}` : "";
    })
    .filter(Boolean);
}

export async function getBestBookmarks(cookie: string, bookId: string, limit = 8): Promise<string[]> {
  try {
    const data = await wereadGet<BestBookmarkRaw>(cookie, "https://i.weread.qq.com/book/bestbookmarks", {
      bookId,
    });
    return (data.items || [])
      .slice(0, limit)
      .map((item) => {
        const text = (item.markText || "").trim();
        const count = item.count ? `（${item.count}人划线）` : "";
        return text ? `${text}${count}` : "";
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function getSimilarBooks(cookie: string, bookId: string, limit = 5): Promise<string[]> {
  try {
    const data = await wereadGet<SimilarRaw>(cookie, "https://i.weread.qq.com/book/similar", { bookId });
    return (data.books || [])
      .slice(0, limit)
      .map((b) => {
        const rating = b.newRating ? ` 评分${(b.newRating / 100).toFixed(1)}` : "";
        return `《${b.title || "?"}》${b.author || ""}${rating}`;
      });
  } catch {
    return [];
  }
}

export function searchBooksByKeyword(books: WeReadShelfBook[], keyword: string): WeReadShelfBook[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return [];
  return books.filter(
    (b) =>
      b.title.toLowerCase().includes(kw) ||
      b.author.toLowerCase().includes(kw) ||
      (b.category || "").toLowerCase().includes(kw)
  );
}

export async function testWeReadConn(conn: WeReadConn): Promise<string> {
  const raw = await resolveWeReadCookie(conn);
  const cookie = await prepareWeReadCookie(raw);
  const shelf = await getEntireShelf(cookie);
  const recent = [...shelf]
    .filter((b) => b.readUpdateTime)
    .sort((a, b) => (b.readUpdateTime || 0) - (a.readUpdateTime || 0))[0];
  const recentHint = recent ? `最近在读：《${recent.title}》` : "暂无最近阅读记录";
  const authHint = isCookieCloudReady(conn.cookieCloud)
    ? "（CookieCloud）"
    : conn.cookie?.trim()
      ? "（手动 Cookie）"
      : "";
  return `书架连接成功${authHint}：共 ${shelf.length} 本电子书。${recentHint}`;
}

export { resolveWeReadCookie };
