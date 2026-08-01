import { loadSettings, type BilibiliConn } from "../config.js";
import { getChat, updateMessage, type ChatMessage } from "../store/chats.js";
import { BILIBILI_ENRICH_MARKER, stripBilibiliEnrichFromContent } from "../tools/enrichMarkers.js";
import { isBilibiliConfigured, SERVICE_AUTH_HINT } from "../tools/serviceAuth.js";
import { extractBilibiliUrls, hasBilibiliIntent } from "./intent.js";
import { fetchBilibiliContext, resolveBilibiliCookie } from "./client.js";

function buildBlock(status: "成功" | "失败", body: string): string {
  return `\n\n${BILIBILI_ENRICH_MARKER}\n状态：${status}\n${body}`;
}

function hasBilibiliAuth(conn: BilibiliConn): boolean {
  return isBilibiliConfigured(conn);
}

export async function enrichUserMessageBilibili(
  chatId: string,
  message: ChatMessage
): Promise<ChatMessage> {
  if (message.role !== "user") return message;

  const baseContent = stripBilibiliEnrichFromContent(message.content);
  if (!hasBilibiliIntent(baseContent)) return message;

  const settings = loadSettings();
  if (settings.bilibiliEnabled === false) {
    const block = buildBlock("失败", "原因：已在设置中关闭「Bilibili 字幕」能力。");
    const enriched = `${baseContent}${block}`;
    const updated = updateMessage(chatId, message.id, { content: enriched });
    return updated || { ...message, content: enriched };
  }

  const urls = extractBilibiliUrls(baseContent);
  if (urls.length === 0) {
    const block = buildBlock("失败", "原因：未找到 B 站视频链接。请粘贴 bilibili.com/video/… 或 b23.tv 短链。");
    const enriched = `${baseContent}${block}`;
    const updated = updateMessage(chatId, message.id, { content: enriched });
    return updated || { ...message, content: enriched };
  }

  let cookie: string | undefined;
  if (hasBilibiliAuth(settings.bilibili)) {
    try {
      cookie = await resolveBilibiliCookie(settings.bilibili);
    } catch {
      cookie = settings.bilibili.cookie?.trim() || undefined;
    }
  }

  try {
    const parts: string[] = [];
    for (const url of urls.slice(0, 2)) {
      parts.push(await fetchBilibiliContext(url, cookie));
    }
    const block = buildBlock("成功", `数据：\n${parts.join("\n\n---\n\n")}`);
    const enriched = `${baseContent}${block}`;
    const updated = updateMessage(chatId, message.id, { content: enriched });
    const finalMsg = updated || { ...message, content: enriched };
    try {
      const { extractBilibiliBodiesForLeann, queueLeannOffer } = await import(
        "../leann/ingestFromText.js"
      );
      for (const body of extractBilibiliBodiesForLeann(finalMsg.content)) {
        queueLeannOffer(chatId, { title: body.title, text: body.text, source: "bilibili" });
      }
    } catch {
      // LEANN 可选，失败不影响字幕注入
    }
    return finalMsg;
  } catch (err) {
    const errText = err instanceof Error ? err.message : "未知错误";
    const hint = hasBilibiliAuth(settings.bilibili) ? "" : ` ${SERVICE_AUTH_HINT}`;
    const block = buildBlock("失败", `原因：${errText}${hint}`);
    const enriched = `${baseContent}${block}`;
    const updated = updateMessage(chatId, message.id, { content: enriched });
    return updated || { ...message, content: enriched };
  }
}

export async function enrichLatestUserMessageBilibili(chatId: string): Promise<void> {
  const chat = getChat(chatId);
  if (!chat) return;
  const last = chat.messages[chat.messages.length - 1];
  if (!last || last.role !== "user") return;
  await enrichUserMessageBilibili(chatId, last);
}
