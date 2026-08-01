import { getChat, updateMessage, type ChatMessage } from "../store/chats.js";
import { isBilibiliUrl } from "../bilibili/intent.js";
import { isZhihuUrl } from "../zhihu/intent.js";

const URL_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;const MAX_FETCH_CHARS = 8000;
const FETCH_TIMEOUT_MS = 15000;

const FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_RE) || [];
  return [...new Set(matches.map((u) => u.replace(/[),.;!?，。！？；：]+$/g, "")))];
}

/** 点歌/生图兜底只用用户原文，不含 URL 抓取注入块 */
export function stripUrlEnrichFromUserMessage(content: string): string {
  return content.split(/\n\n\[用户分享的网页 — 正文摘要\]/)[0]?.trim() ?? content.trim();
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

function htmlToPlainText(html: string): { title: string; text: string } {
  let title = "";
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) title = decodeHtmlEntities(titleMatch[1].replace(/\s+/g, " ").trim());

  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  const articleMatch = body.match(/<article[\s\S]*?>([\s\S]*?)<\/article>/i);
  if (articleMatch?.[1]) body = articleMatch[1];

  const text = decodeHtmlEntities(
    body
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

  const clipped = text.length > MAX_FETCH_CHARS ? `${text.slice(0, MAX_FETCH_CHARS)}…（已截断）` : text;
  return { title, text: clipped };
}

export async function fetchUrlPlainText(url: string): Promise<{ title: string; text: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: FETCH_HEADERS,
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html") && !ct.includes("application/xhtml")) {
      throw new Error(`不支持的内容类型：${ct.split(";")[0] || "unknown"}`);
    }
    const html = await res.text();
    return htmlToPlainText(html);
  } finally {
    clearTimeout(timer);
  }
}

export async function enrichUserMessageUrls(chatId: string, message: ChatMessage): Promise<ChatMessage> {
  if (message.role !== "user") return message;
  if (message.content.includes("[用户分享的网页")) return message;

  const urls = extractUrls(message.content).filter(
    (url) => !isBilibiliUrl(url) && !isZhihuUrl(url)
  );
  if (urls.length === 0) return message;

  const parts: string[] = [];
  for (const url of urls.slice(0, 3)) {
    try {
      const { title, text } = await fetchUrlPlainText(url);
      parts.push(
        `链接：${url}\n标题：${title || "（无标题）"}\n正文摘要：\n${text || "（未能提取正文）"}`
      );
    } catch (err) {
      parts.push(`链接：${url}\n（抓取失败：${err instanceof Error ? err.message : "未知错误"}）`);
    }
  }

  if (parts.length === 0) return message;

  const block = `\n\n[用户分享的网页 — 正文摘要]\n${parts.join("\n\n---\n\n")}`;
  const enriched = `${message.content}${block}`;
  const updated = updateMessage(chatId, message.id, { content: enriched });
  const finalMsg = updated || { ...message, content: enriched };
  try {
    const { extractWebBodiesForLeann, queueLeannOffer } = await import(
      "../leann/ingestFromText.js"
    );
    for (const body of extractWebBodiesForLeann(finalMsg.content)) {
      queueLeannOffer(chatId, { title: body.title, text: body.text, source: "web" });
    }
  } catch {
    // ignore
  }
  return finalMsg;
}

export async function enrichLatestUserMessageUrls(chatId: string): Promise<void> {
  const chat = getChat(chatId);
  if (!chat) return;
  const last = chat.messages[chat.messages.length - 1];
  if (!last || last.role !== "user") return;
  await enrichUserMessageUrls(chatId, last);
}
