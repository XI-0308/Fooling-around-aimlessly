import { stripUserVisibleText } from "../tools/enrichMarkers.js";

/** 用户可见原文，排除看图/工具注入（避免图里的《书名》误触发微信读书） */
function userTextOnly(content: string): string {
  return stripUserVisibleText(content);
}

export type WeReadFetchMode = "shelf" | "book_notes" | "book_reviews" | "reading_now";

const WEREAD_TRIGGER_RE =
  /微信读书|weread|书架|在读|最近读|读什么|读哪本|读到了|读到哪|看书|读书|划线|批注|热门书评|同类书|推荐.*书/i;

const NOTES_TRIGGER_RE = /笔记|划线|批注|高亮|highlight|想法|摘抄|摘录/i;

const REVIEW_TRIGGER_RE = /书评|热门划线|热门高亮|别人怎么评|大家怎么说|推荐.*书|同类|相似/i;

const READING_NOW_RE = /在读|最近读|读什么|读哪本|读到哪|当前看/i;

const SHELF_RE = /书架|有什么书|书单|藏书/i;

/** 瑞幸单向历「书签」等：有《》+看看但不等于要查微信读书 */
const BOOKMARK_CARD_RE = /书签|单向历|宜讲笑话|抽到的书/;

/** 用户的消息是否涉及微信读书 */
export function hasWeReadIntent(content: string): boolean {
  const t = userTextOnly(content);
  if (!t) return false;
  // 咖啡书签 / 日历卡片：别当成要翻书架
  if (BOOKMARK_CARD_RE.test(t) && !/微信读书|weread|书架|划线|笔记|在读/i.test(t)) {
    return false;
  }
  if (WEREAD_TRIGGER_RE.test(t)) return true;
  if (/《[^》\n]{1,80}》/.test(t) && NOTES_TRIGGER_RE.test(t)) return true;
  if (/《[^》\n]{1,80}》/.test(t) && /看看|整理|聊聊|讨论|帮我/.test(t)) return true;
  return false;
}

/** 从消息中提取书名（《》内） */
export function extractBookTitle(content: string): string | null {
  const t = userTextOnly(content);
  const m = t.match(/《([^》\n]{1,80})》/);
  return m?.[1]?.trim() || null;
}

/** 从消息中提取章节序号（如「第三章」→ 3） */
export function extractChapterHint(content: string): number | null {
  const t = userTextOnly(content);
  const cnMap: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  const cnMatch = t.match(/第\s*([一二三四五六七八九十]+)\s*章/);
  if (cnMatch?.[1]) {
    const s = cnMatch[1];
    if (s.length === 1 && cnMap[s] != null) return cnMap[s];
    if (s === "十一") return 11;
    if (s === "十二") return 12;
  }
  const numMatch = t.match(/第\s*(\d{1,3})\s*章/);
  if (numMatch?.[1]) return Number(numMatch[1]);
  return null;
}

/** 推断本轮需要拉取的数据类型 */
export function inferWeReadFetchModes(content: string): WeReadFetchMode[] {
  const t = userTextOnly(content);
  const modes = new Set<WeReadFetchMode>();
  const title = extractBookTitle(content);

  if (SHELF_RE.test(t) || /微信读书|weread/i.test(t)) {
    modes.add("shelf");
  }
  if (READING_NOW_RE.test(t)) {
    modes.add("reading_now");
  }
  if (title && (NOTES_TRIGGER_RE.test(t) || /看看|整理|聊聊|讨论|帮我/.test(t))) {
    modes.add("book_notes");
  }
  if (extractChapterHint(content) != null) {
    modes.add("book_notes");
  }
  if (REVIEW_TRIGGER_RE.test(t)) {
    modes.add("book_reviews");
  }
  if (title && !modes.size) {
    modes.add("book_notes");
  }
  if (!modes.size) {
    modes.add("shelf");
    if (title) modes.add("book_notes");
  }
  return [...modes];
}
