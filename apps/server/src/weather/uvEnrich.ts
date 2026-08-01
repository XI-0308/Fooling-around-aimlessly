import { loadUserPersona } from "../store/userPersona.js";
import { getChat, updateMessage, type ChatMessage } from "../store/chats.js";
import { UV_ENRICH_MARKER, stripUvEnrichFromContent } from "../tools/enrichMarkers.js";
import { hasUvIntent } from "./intent.js";
import { fetchGuiyangUvSnapshot, formatUvForPrompt } from "./uvClient.js";

function buildBlock(status: "成功" | "失败", body: string): string {
  return `\n\n${UV_ENRICH_MARKER}\n状态：${status}\n${body}`;
}

export async function enrichUserMessageUv(
  chatId: string,
  message: ChatMessage
): Promise<ChatMessage> {
  if (message.role !== "user") return message;

  const baseContent = stripUvEnrichFromContent(message.content);
  if (!hasUvIntent(baseContent)) return message;

  try {
    const snap = await fetchGuiyangUvSnapshot();
    const block = buildBlock("成功", `数据：\n${formatUvForPrompt(snap)}`);
    const enriched = `${baseContent}${block}`;
    const updated = updateMessage(chatId, message.id, { content: enriched });
    return updated || { ...message, content: enriched };
  } catch (err) {
    const errText = err instanceof Error ? err.message : "未知错误";
    const userName = loadUserPersona().name?.trim() || "你";
    const block = buildBlock(
      "失败",
      `原因：紫外线专用接口暂时不可用（${errText}）。请如实告诉${userName}暂时查不到实时指数，并给出防晒常识建议，不要编造具体数字。`
    );
    const enriched = `${baseContent}${block}`;
    const updated = updateMessage(chatId, message.id, { content: enriched });
    return updated || { ...message, content: enriched };
  }
}

export async function enrichLatestUserMessageUv(chatId: string): Promise<void> {
  const chat = getChat(chatId);
  if (!chat) return;
  const last = chat.messages[chat.messages.length - 1];
  if (!last || last.role !== "user") return;
  await enrichUserMessageUv(chatId, last);
}
