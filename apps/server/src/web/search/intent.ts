import { stripUserVisibleText } from "../../tools/enrichMarkers.js";

/** 用户明确要求「帮我搜索」时提取关键词（功能性词汇） */
const EXPLICIT_SEARCH_PATTERNS: RegExp[] = [
  /帮我搜索[\s:：]*(.{1,120})/i,
  /帮我搜[\s:：]*(.{1,120})/i,
  /搜索一下[\s:：]*(.{1,120})/i,
  /搜一下[\s:：]*(.{1,120})/i,
];

const PROACTIVE_SEARCH_RE =
  /(?:查一下|看看|有没有|最新|今天|明天|天气|气温|下雨|热不热|冷不冷|紫外线|UV\s*指数|晒伤|防晒|新闻|交通|地铁|公交|官网|网址|链接|办法|规定|政策|施行|发文)/i;

export function extractExplicitSearchQuery(userContent: string): string | null {
  const t = userContent.trim().replace(/[～~]+$/g, "");
  if (!t) return null;

  for (const re of EXPLICIT_SEARCH_PATTERNS) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    let q = m[1]
      .trim()
      .replace(/^[「『"'"\s]+|[」』"'"\s]+$/g, "")
      .replace(/[，。！？!?]+$/g, "")
      .trim();
    if (q.length >= 1 && q.length <= 120) return q;
  }
  return null;
}

/** 本轮是否启用联网搜索（按需，非常驻） */
export function shouldEnableWebSearchForTurn(userContent: string): boolean {
  const raw = userContent.trim();
  const t = stripUserVisibleText(raw);

  if (extractExplicitSearchQuery(t)) return true;

  // 用户已分享并成功抓取网页正文，通常不必再搜
  if (raw.includes("[用户分享的网页 — 正文摘要]") && !raw.includes("（抓取失败")) {
    return /(?:帮我搜索|搜一下|搜索一下|帮我搜)/.test(t);
  }

  // 仅发图、无其他检索意图
  if (
    (raw.includes("图片上是：") ||
      /\[工具 · 看图\]|\[用户发送的图片 — Vision 转述\]/.test(raw)) &&
    !PROACTIVE_SEARCH_RE.test(t)
  ) {
    if (!/(?:帮我搜索|搜一下|搜索一下|帮我搜|查一下|搜索)/.test(t)) return false;
  }

  return PROACTIVE_SEARCH_RE.test(t);
}

export function buildExplicitSearchHint(query: string, userName = "你"): string {
  return (
    `[本轮 · 仅一次] ${userName}明确要求搜索：「${query}」。` +
    `请使用联网搜索，并在回复中列出相关 https:// 链接与简要说明。`
  );
}
