import type { ZhihuConn } from "../config.js";
import { resolveCookieFromCloudOrManual } from "../cookieCloud/shared.js";
import { parseZhihuUrl } from "./intent.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const MAX_BODY_CHARS = 14000;

type ZhihuArticleEntity = {
  title?: string;
  excerpt?: string;
  content?: string;
  author?: { name?: string };
};

export async function resolveZhihuCookie(conn: ZhihuConn): Promise<string> {
  return resolveCookieFromCloudOrManual(
    conn.cookie,
    conn.cookieCloud,
    ["zhihu.com", "zhihu"],
    "知乎"
  );
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function htmlToPlain(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<\/div>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim()
  );
}

function clip(text: string, max = MAX_BODY_CHARS): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…（已截断）`;
}

/** 把 Node fetch 的底层网络错误说成人话（避免模型误报成「Cookie 验证失败」） */
export function formatZhihuNetworkError(err: unknown, action: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  const cause = err instanceof Error ? (err as Error & { cause?: { code?: string; message?: string } }).cause : undefined;
  const code = cause?.code || "";
  const detail = [msg, cause?.message, code].filter(Boolean).join(" ");
  if (/ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|cert|TLS|SSL|socket|network|fetch failed/i.test(detail)) {
    return (
      `${action}失败：连不上知乎服务器（网络/TLS 被重置，不是 Cookie 失效）。` +
      `本机浏览器若能打开知乎，多半是 Node 出口被拦或未走代理；可开系统代理/VPN 后重试，或把正文要点贴过来。` +
      (code ? `（${code}）` : "")
    );
  }
  return `${action}失败：${msg}`;
}

async function zhihuFetch(url: string, cookie: string, referer: string): Promise<Response> {
  try {
    return await fetch(url, {
      headers: {
        "User-Agent": UA,
        Cookie: cookie,
        Referer: referer,
        Accept: "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    });
  } catch (err) {
    throw new Error(formatZhihuNetworkError(err, "知乎接口请求"));
  }
}

function formatArticleBlock(
  sourceUrl: string,
  title: string,
  author: string,
  body: string
): string {
  return [
    `链接：${sourceUrl}`,
    `标题：${title || "（无标题）"}`,
    `作者：${author || "未知"}`,
    `\n【正文】\n${clip(body || "（未能提取正文）")}`,
  ].join("\n");
}

function parseInitialData(html: string): Record<string, unknown> | null {
  const m = html.match(/<script id="js-initialData" type="text\/json">([\s\S]*?)<\/script>/);
  if (!m?.[1]) return null;
  try {
    return JSON.parse(m[1]) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function articleFromInitialData(data: Record<string, unknown>, id: string): ZhihuArticleEntity | null {
  const initialState = data.initialState as
    | { entities?: { articles?: Record<string, ZhihuArticleEntity> } }
    | undefined;
  const articles = initialState?.entities?.articles ?? {};
  return articles[id] || Object.values(articles)[0] || null;
}

async function fetchHtmlPage(url: string, cookie: string, referer: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Cookie: cookie,
        Referer: referer,
        Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
    });
  } catch (err) {
    throw new Error(formatZhihuNetworkError(err, "获取知乎页面"));
  }
  if (!res.ok) {
    if (res.status === 403) {
      throw new Error(
        "获取页面失败 HTTP 403（知乎拦截了正文抓取；CookieCloud「在线」/「测试登录」通过只代表账号可用，专栏/回答正文仍可能被拦。可改粘贴正文段落，或在浏览器重新登录知乎后同步 Cookie）"
      );
    }
    throw new Error(`获取页面失败 HTTP ${res.status}`);
  }
  return res.text();
}


/** 专栏文章：API 常返回 10003，改从 zhuanlan 页面 js-initialData 读取 */
async function fetchArticleFromPage(id: string, cookie: string, sourceUrl: string): Promise<string> {
  const html = await fetchHtmlPage(
    `https://zhuanlan.zhihu.com/p/${id}`,
    cookie,
    `https://zhuanlan.zhihu.com/p/${id}`
  );
  const data = parseInitialData(html);
  if (!data) {
    throw new Error("未能从专栏页面解析正文（可能需登录或页面结构已变）");
  }
  const article = articleFromInitialData(data, id);
  if (!article) {
    throw new Error("专栏页面无文章数据");
  }
  const body = htmlToPlain(article.content || article.excerpt || "");
  return formatArticleBlock(
    sourceUrl,
    article.title || "（无标题）",
    article.author?.name || "未知",
    body
  );
}

async function fetchArticle(id: string, cookie: string, sourceUrl: string): Promise<string> {
  const res = await zhihuFetch(
    `https://www.zhihu.com/api/v4/articles/${id}`,
    cookie,
    `https://zhuanlan.zhihu.com/p/${id}`
  );
  const json = (await res.json()) as ZhihuArticleEntity & { error?: { message?: string } };
  if (res.ok && !json.error && (json.content || json.excerpt)) {
    const body = htmlToPlain(json.content || json.excerpt || "");
    return formatArticleBlock(
      sourceUrl,
      json.title || "（无标题）",
      json.author?.name || "未知",
      body
    );
  }
  return fetchArticleFromPage(id, cookie, sourceUrl);
}

async function fetchAnswer(
  questionId: string,
  answerId: string,
  cookie: string,
  sourceUrl: string
): Promise<string> {
  const res = await zhihuFetch(
    `https://www.zhihu.com/api/v4/answers/${answerId}?include=content,author,question`,
    cookie,
    sourceUrl
  );
  const json = (await res.json()) as {
    content?: string;
    author?: { name?: string };
    question?: { title?: string };
    error?: { message?: string; code?: string | number };
  };
  if (!res.ok || json.error) {
    const msg = json.error?.message || "";
    if (res.status === 403 || /10003/.test(String(json.error?.code ?? "")) || /升级客户端|请求参数异常/.test(msg)) {
      throw new Error(
        msg ||
          `获取回答失败 HTTP ${res.status}（知乎正文接口被拦，与手机分享无直接关系；可粘贴正文）`
      );
    }
    throw new Error(msg || `获取回答失败 HTTP ${res.status}`);
  }
  const body = htmlToPlain(json.content || "");
  const lines = [
    `链接：${sourceUrl}`,
    `问题：${json.question?.title || questionId}`,
    `回答者：${json.author?.name || "匿名"}`,
    `\n【回答正文】\n${clip(body || "（未能提取正文）")}`,
  ];
  return lines.join("\n");
}

async function fetchQuestionTopAnswers(
  questionId: string,
  cookie: string,
  sourceUrl: string
): Promise<string> {
  const qRes = await zhihuFetch(
    `https://www.zhihu.com/api/v4/questions/${questionId}?include=title`,
    cookie,
    sourceUrl
  );
  const qJson = (await qRes.json()) as { title?: string; error?: { message?: string } };
  if (!qRes.ok || qJson.error) {
    throw new Error(qJson.error?.message || `获取问题失败 HTTP ${qRes.status}`);
  }

  const aRes = await zhihuFetch(
    `https://www.zhihu.com/api/v4/questions/${questionId}/answers?include=content,author,voteup_count&limit=3&offset=0`,
    cookie,
    sourceUrl
  );
  const aJson = (await aRes.json()) as {
    data?: Array<{
      content?: string;
      voteup_count?: number;
      author?: { name?: string };
    }>;
    error?: { message?: string };
  };
  if (!aRes.ok || aJson.error) {
    throw new Error(aJson.error?.message || `获取回答列表失败 HTTP ${aRes.status}`);
  }

  const answers = aJson.data || [];
  const lines = [`链接：${sourceUrl}`, `问题：${qJson.title || questionId}`, ""];

  if (answers.length === 0) {
    lines.push("（该问题暂无可见回答，或需要登录后查看）");
    return lines.join("\n");
  }

  answers.forEach((ans, i) => {
    const body = htmlToPlain(ans.content || "");
    lines.push(
      `--- 回答 ${i + 1} · ${ans.author?.name || "匿名"} · ${ans.voteup_count ?? 0} 赞 ---`,
      clip(body, 4500)
    );
  });
  return clip(lines.join("\n"));
}

async function resolveZhihuUrl(url: string, cookie: string): Promise<string> {
  let current = url.trim();
  // 手机分享常带 share_code / utm_*，抓取前去掉，落到干净专栏/问答 URL
  try {
    const u = new URL(current);
    if (/zhihu\.com$/i.test(u.hostname) || /\.zhihu\.com$/i.test(u.hostname)) {
      u.search = "";
      u.hash = "";
      current = u.toString().replace(/\/$/, "") || current;
    }
  } catch {
    // keep raw
  }
  if (!/link\.zhihu\.com/i.test(current)) return current;
  const res = await fetch(current, {
    redirect: "follow",
    headers: {
      "User-Agent": UA,
      Cookie: cookie,
      Referer: "https://www.zhihu.com/",
    },
  });
  const finalUrl = res.url && /zhihu\.com/i.test(res.url) ? res.url : current;
  try {
    const u = new URL(finalUrl);
    u.search = "";
    u.hash = "";
    return u.toString().replace(/\/$/, "") || finalUrl;
  } catch {
    return finalUrl;
  }
}


export async function fetchZhihuContext(url: string, cookie: string): Promise<string> {
  const resolved = await resolveZhihuUrl(url, cookie);
  const target = parseZhihuUrl(resolved);
  if (!target) throw new Error("未能识别知乎链接类型，请粘贴专栏/问题/回答的完整链接");

  switch (target.kind) {
    case "article":
      return fetchArticle(target.id, cookie, resolved);
    case "answer":
      return fetchAnswer(target.questionId, target.answerId, cookie, resolved);
    case "question":
      return fetchQuestionTopAnswers(target.id, cookie, resolved);
    default:
      throw new Error("不支持的知乎链接");
  }
}

export async function testZhihuConn(conn: ZhihuConn): Promise<string> {
  const cookie = await resolveZhihuCookie(conn);
  let res: Response;
  try {
    res = await zhihuFetch("https://www.zhihu.com/api/v4/me", cookie, "https://www.zhihu.com");
  } catch (err) {
    // zhihuFetch 已格式化网络错误
    throw err instanceof Error ? err : new Error(String(err));
  }
  const json = (await res.json()) as { name?: string; error?: { message?: string } };
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || "知乎 Cookie 无效或未登录");
  }
  return (
    `知乎登录 Cookie 可用，当前账号：${json.name || "已登录"}。` +
    `说明：这只验证「已登录」；抓专栏/回答正文时若仍失败，多半是知乎拦正文或本机网络/TLS 问题，不一定是 Cookie。`
  );
}
