import type { ZhihuConn } from "../config.js";

const DEFAULT_BASE = "https://developer.zhihu.com";
const MAX_SUMMARY_CHARS = 1200;

export type ZhihuOpenItem = {
  title: string;
  url: string;
  contentType: string;
  contentText: string;
  authorName: string;
  voteUpCount: number;
  commentCount: number;
};

type RawItem = {
  Title?: string;
  Url?: string;
  ContentType?: string;
  ContentText?: string;
  AuthorName?: string;
  VoteUpCount?: number;
  CommentCount?: number;
};

function headers(accessSecret: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessSecret.trim()}`,
    "X-Request-Timestamp": String(Math.floor(Date.now() / 1000)),
    Accept: "application/json",
  };
}

function normalizeItem(raw: RawItem): ZhihuOpenItem {
  return {
    title: String(raw.Title || "（无标题）").trim(),
    url: String(raw.Url || "").trim(),
    contentType: String(raw.ContentType || "").trim(),
    contentText: String(raw.ContentText || "").trim(),
    authorName: String(raw.AuthorName || "未知").trim(),
    voteUpCount: Number(raw.VoteUpCount) || 0,
    commentCount: Number(raw.CommentCount) || 0,
  };
}

async function requestJson(
  accessSecret: string,
  path: string,
  params?: Record<string, string>
): Promise<Record<string, unknown>> {
  const base = process.env.ZHIHU_API_BASE?.trim() || DEFAULT_BASE;
  const url = new URL(path, base.endsWith("/") ? base : `${base}/`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  let res: Response;
  try {
    res = await fetch(url.toString(), { headers: headers(accessSecret) });
  } catch (err) {
    const { formatZhihuNetworkError } = await import("./client.js");
    throw new Error(formatZhihuNetworkError(err, "知乎开放平台请求"));
  }
  const json = (await res.json()) as {
    Code?: number;
    Message?: string;
    Data?: { Items?: RawItem[]; Total?: number };
  };
  if (!res.ok || (json.Code !== undefined && json.Code !== 0)) {
    throw new Error(json.Message || `知乎开放平台 HTTP ${res.status}`);
  }
  return json as Record<string, unknown>;
}

export function resolveZhihuAccessSecret(conn?: ZhihuConn): string {
  const fromConn = conn?.accessSecret?.trim() || "";
  if (fromConn) return fromConn;
  return process.env.ZHIHU_ACCESS_SECRET?.trim() || "";
}

export function isZhihuOpenConfigured(conn?: ZhihuConn): boolean {
  return Boolean(resolveZhihuAccessSecret(conn));
}

export async function zhihuOpenSearch(
  accessSecret: string,
  query: string,
  count = 5
): Promise<ZhihuOpenItem[]> {
  const q = query.trim();
  if (q.length < 2) throw new Error("搜索词过短");
  const bounded = Math.min(10, Math.max(1, count));
  const json = await requestJson(accessSecret, "/api/v1/content/zhihu_search", {
    Query: q,
    Count: String(bounded),
  });
  const items = (json.Data as { Items?: RawItem[] } | undefined)?.Items || [];
  return items.map(normalizeItem);
}

export async function zhihuOpenHotList(accessSecret: string): Promise<ZhihuOpenItem[]> {
  const json = await requestJson(accessSecret, "/api/v1/content/hot_list");
  const items = (json.Data as { Items?: RawItem[] } | undefined)?.Items || [];
  return items.slice(0, 10).map(normalizeItem);
}

/** 知乎直答：把链接丢给官方模型，要标题+要点（Cookie 抓不到正文时的兜底） */
export async function zhihuOpenAskUrl(
  accessSecret: string,
  sourceUrl: string
): Promise<string> {
  const base = process.env.ZHIHU_API_BASE?.trim() || DEFAULT_BASE;
  const url = new URL("/v1/chat/completions", base.endsWith("/") ? base : `${base}/`);
  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: "POST",
      headers: {
        ...headers(accessSecret),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.ZHIHU_ZHIDA_MODEL?.trim() || "zhida-fast-1p5",
        stream: false,
        messages: [
          {
            role: "user",
            content:
              `请阅读这篇知乎内容并输出中文摘要（不要编造链接外信息）：\n` +
              `1. 第一行：标题\n` +
              `2. 作者（若可知）\n` +
              `3. 核心要点 5–10 条，或分段概括\n` +
              `链接：${sourceUrl}`,
          },
        ],
      }),
    });
  } catch (err) {
    const { formatZhihuNetworkError } = await import("./client.js");
    throw new Error(formatZhihuNetworkError(err, "知乎直答"));
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    error?: { message?: string };
    Message?: string;
    Code?: number;
  };
  if (!res.ok || (json.Code !== undefined && json.Code !== 0 && !json.choices)) {
    throw new Error(json.error?.message || json.Message || `知乎直答 HTTP ${res.status}`);
  }
  if (json.error?.message) {
    throw new Error(json.error.message);
  }
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("知乎直答未返回内容");
  return [
    `原链接：${sourceUrl}`,
    `来源：知乎开放平台 · 直答（摘要，非 Cookie 全文）`,
    `\n【摘要】\n${clip(content, 3500)}`,
  ].join("\n");
}

function clip(text: string, max = MAX_SUMMARY_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…（摘要已截断）`;
}

function contentTypeLabel(type: string): string {
  switch (type) {
    case "Article":
      return "专栏文章";
    case "Answer":
      return "回答";
    case "Question":
      return "问题";
    default:
      return type || "内容";
  }
}

export function formatZhihuOpenItem(item: ZhihuOpenItem, sourceUrl?: string): string {
  const lines = [
    sourceUrl ? `原链接：${sourceUrl}` : `链接：${item.url}`,
    `标题：${item.title}`,
    `作者：${item.authorName} · ${item.voteUpCount} 赞 · ${item.commentCount} 评论`,
    `类型：${contentTypeLabel(item.contentType)}`,
    item.url !== sourceUrl ? `匹配链接：${item.url}` : "",
    `\n【摘要（开放平台，非全文）】\n${clip(item.contentText || "（无摘要）")}`,
  ];
  return lines.filter(Boolean).join("\n");
}

export function formatZhihuOpenItems(
  items: ZhihuOpenItem[],
  preamble: string
): string {
  if (items.length === 0) {
    return `${preamble}\n（未找到相关结果）`;
  }
  const blocks = items.map((item, i) => {
    const head = `--- 结果 ${i + 1} ---`;
    return `${head}\n${formatZhihuOpenItem(item)}`;
  });
  return `${preamble}\n\n${blocks.join("\n\n")}`;
}

function normalizeUrlForMatch(url: string): string {
  try {
    const u = new URL(url);
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "");
  } catch {
    return url.replace(/\?.*$/, "").replace(/\/$/, "");
  }
}

function urlNeedleFromTarget(url: string): string | null {
  const article = url.match(/\/p\/(\d+)/i);
  if (article?.[1]) return `/p/${article[1]}`;
  const answer = url.match(/\/answer\/(\d+)/i);
  if (answer?.[1]) return `/answer/${answer[1]}`;
  const question = url.match(/\/question\/(\d+)/i);
  if (question?.[1]) return `/question/${question[1]}`;
  return null;
}

function pickBestMatch(items: ZhihuOpenItem[], sourceUrl: string): ZhihuOpenItem | null {
  const needle = urlNeedleFromTarget(sourceUrl);
  if (!needle) return null;
  const normalized = normalizeUrlForMatch(sourceUrl);
  for (const item of items) {
    const itemUrl = normalizeUrlForMatch(item.url);
    if (itemUrl.includes(needle) || normalized.includes(urlNeedleFromTarget(item.url) || "___")) {
      return item;
    }
    if (item.url.includes(needle)) return item;
  }
  return null;
}

/** 从用户消息里去掉链接后，提取可用于搜索的短语 */
export function extractQueryFromUserText(text: string, urls: string[]): string {
  let t = text;
  for (const url of urls) t = t.split(url).join(" ");
  t = t
    .replace(/\[工具 · 知乎\][\s\S]*/g, "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/知乎|zhihu|看看|这篇|文章|专栏|链接|url/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (t.length >= 2 && t.length <= 100) return t;
  return "";
}

export async function searchZhihuForUrl(
  accessSecret: string,
  sourceUrl: string,
  userTextQuery?: string
): Promise<string> {
  // 1) 用户消息里若有可用关键词，站内搜并只在 URL 对得上时采用
  if (userTextQuery?.trim() && userTextQuery.trim().length >= 2) {
    try {
      const items = await zhihuOpenSearch(accessSecret, userTextQuery.trim(), 5);
      const match = pickBestMatch(items, sourceUrl);
      if (match) {
        return formatZhihuOpenItem(match, sourceUrl).replace(
          "【摘要（开放平台，非全文）】",
          "【摘要 · 开放平台匹配到该链接，非 Cookie 全文】"
        );
      }
    } catch {
      // fall through
    }
  }

  // 2) 直答：官方模型按链接读文（比用文章 ID 乱搜靠谱得多）
  try {
    return await zhihuOpenAskUrl(accessSecret, sourceUrl);
  } catch (err) {
    const askErr = err instanceof Error ? err.message : "直答失败";
    const quota =
      /day limit|rate_limit|quota|额度|超限/i.test(askErr)
        ? "（今日直答调用次数可能已用尽）"
        : "";
    // 3) 明确失败，不要塞无关站内搜索结果误导角色
    throw new Error(
      `Cookie 正文抓取失败，知乎直答也未读到该文${quota}：${askErr}` +
        (/连不上知乎|ECONNRESET|网络\/TLS/i.test(askErr)
          ? ""
          : "。请把标题或正文要点粘贴过来，我就能和你一起看。")
    );
  }
}

/** 联网搜索轮次：决定是否附加知乎站内搜索 */
export function shouldAttachZhihuOpenSearch(userContent: string): boolean {
  const t = userContent.trim();
  if (/知乎|zhihu/i.test(t)) return true;
  if (/zhuanlan\.zhihu\.com|zhihu\.com\/question/i.test(t)) return true;
  return false;
}

export function buildZhihuOpenSearchHint(query: string, body: string): string {
  return (
    `[知乎开放平台 · 站内搜索]\n` +
    `搜索词：「${query}」\n` +
    `说明：以下为官方 API 返回的摘要，可与 DeepSeek 联网搜索互补；若用户贴了具体知乎链接，优先参考工具块中的链接摘要。\n\n` +
    body
  );
}

export async function testZhihuOpenConn(conn?: ZhihuConn): Promise<string> {
  const secret = resolveZhihuAccessSecret(conn);
  if (!secret) throw new Error("未配置知乎开放平台 Access Secret");
  const items = await zhihuOpenHotList(secret);
  const sample = items[0]?.title || "（无条目）";
  return `知乎开放平台连接正常，热榜首条：${sample}`;
}
