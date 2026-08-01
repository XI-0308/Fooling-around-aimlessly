import { loadSettings } from "../config.js";
import { getChat, updateMessage, type ChatMessage } from "../store/chats.js";
import { ZHIHU_ENRICH_MARKER, stripZhihuEnrichFromContent } from "../tools/enrichMarkers.js";
import {
  isZhihuConfigured,
  isZhihuOpenConfigured,
  isZhihuServiceConfigured,
  SERVICE_AUTH_HINT,
} from "../tools/serviceAuth.js";
import { extractZhihuUrls, hasZhihuIntent } from "./intent.js";
import { fetchZhihuContext, resolveZhihuCookie } from "./client.js";
import {
  extractQueryFromUserText,
  resolveZhihuAccessSecret,
  searchZhihuForUrl,
} from "./openPlatform.js";

function buildBlock(status: "成功" | "失败", body: string): string {
  return `\n\n${ZHIHU_ENRICH_MARKER}\n状态：${status}\n${body}`;
}

async function fetchOneUrl(
  url: string,
  cookie: string | null,
  accessSecret: string | null,
  userTextQuery: string
): Promise<{ text: string; fullText: boolean }> {
  if (cookie) {
    try {
      const text = await fetchZhihuContext(url, cookie);
      return { text, fullText: true };
    } catch (err) {
      if (!accessSecret) throw err;
      const fallback = await searchZhihuForUrl(accessSecret, url, userTextQuery);
      return {
        text: `${fallback}\n\n（Cookie 正文抓取失败，已改用知乎开放平台摘要回退）`,
        fullText: false,
      };
    }
  }
  if (!accessSecret) {
    throw new Error("未配置知乎 Cookie 或开放平台 Access Secret");
  }
  const fallback = await searchZhihuForUrl(accessSecret, url, userTextQuery);
  return {
    text: `${fallback}\n\n（未配置 Cookie，仅使用知乎开放平台摘要）`,
    fullText: false,
  };
}

export async function enrichUserMessageZhihu(
  chatId: string,
  message: ChatMessage
): Promise<ChatMessage> {
  if (message.role !== "user") return message;

  const baseContent = stripZhihuEnrichFromContent(message.content);
  if (!hasZhihuIntent(baseContent)) return message;

  const settings = loadSettings();
  if (settings.zhihuEnabled === false) {
    const block = buildBlock("失败", "原因：已在设置中关闭「知乎文章」能力。");
    const enriched = `${baseContent}${block}`;
    const updated = updateMessage(chatId, message.id, { content: enriched });
    return updated || { ...message, content: enriched };
  }

  if (!isZhihuServiceConfigured(settings.zhihu)) {
    const block = buildBlock(
      "失败",
      `原因：未配置知乎 Cookie / CookieCloud，也未配置开放平台 Access Secret。${SERVICE_AUTH_HINT}`
    );
    const enriched = `${baseContent}${block}`;
    const updated = updateMessage(chatId, message.id, { content: enriched });
    return updated || { ...message, content: enriched };
  }

  const urls = extractZhihuUrls(baseContent);
  if (urls.length === 0) {
    const block = buildBlock(
      "失败",
      "原因：未找到知乎链接。请直接粘贴专栏/问题/回答的 URL（如 https://zhuanlan.zhihu.com/p/… 或 https://www.zhihu.com/question/…）。仅说「看看知乎」不够，需要带链接。"
    );
    const enriched = `${baseContent}${block}`;
    const updated = updateMessage(chatId, message.id, { content: enriched });
    return updated || { ...message, content: enriched };
  }

  try {
    const cookie = isZhihuConfigured(settings.zhihu)
      ? await resolveZhihuCookie(settings.zhihu)
      : null;
    const accessSecret = isZhihuOpenConfigured(settings.zhihu)
      ? resolveZhihuAccessSecret(settings.zhihu)
      : null;
    const userTextQuery = extractQueryFromUserText(baseContent, urls);

    const parts: string[] = [];
    for (const url of urls.slice(0, 2)) {
      const one = await fetchOneUrl(url, cookie, accessSecret, userTextQuery);
      parts.push(one.text);
    }
    const block = buildBlock("成功", `数据：\n${parts.join("\n\n---\n\n")}`);
    const enriched = `${baseContent}${block}`;
    const updated = updateMessage(chatId, message.id, { content: enriched });
    const finalMsg = updated || { ...message, content: enriched };
    // 仅 Cookie 全文可建电子书；开放平台摘要跳过
    try {
      const { extractZhihuBodiesForLeann, queueLeannOffer } = await import(
        "../leann/ingestFromText.js"
      );
      for (const body of extractZhihuBodiesForLeann(finalMsg.content)) {
        queueLeannOffer(chatId, { title: body.title, text: body.text, source: "zhihu" });
      }
    } catch {
      // LEANN 可选，失败不影响知乎 enrich
    }
    return finalMsg;
  } catch (err) {
    const errText = err instanceof Error ? err.message : "未知错误";
    const block = buildBlock("失败", `原因：${errText}`);
    const enriched = `${baseContent}${block}`;
    const updated = updateMessage(chatId, message.id, { content: enriched });
    return updated || { ...message, content: enriched };
  }
}

export async function enrichLatestUserMessageZhihu(chatId: string): Promise<void> {
  const chat = getChat(chatId);
  if (!chat) return;
  const last = chat.messages[chat.messages.length - 1];
  if (!last || last.role !== "user") return;
  await enrichUserMessageZhihu(chatId, last);
}
