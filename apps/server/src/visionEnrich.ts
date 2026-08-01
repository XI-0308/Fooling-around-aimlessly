import fs from "fs";
import { loadSettings } from "./config.js";
import { getChatAttachmentsDir, getChat, updateMessage } from "./store/chats.js";
import type { ChatMessage, MessageAttachment } from "./store/chats.js";
import { describeImageBuffer } from "./services/vision.js";
import {
  buildVisionEnrichBlock,
  stripVisionEnrichFromContent,
  VISION_ENRICH_FAILURE_TEXT,
} from "./tools/enrichMarkers.js";

const DEFAULT_VISION_PROMPT =
  "请客观描述这张图片的内容（人物外貌、动作、场景、物品、文字、氛围等），供角色扮演对话 AI 理解。不要编造图片外信息。中文，200字以内。";

export function findAttachmentFilePath(chatId: string, attachment: MessageAttachment): string | null {
  const dir = getChatAttachmentsDir(chatId);
  if (!fs.existsSync(dir)) return null;
  const match = fs.readdirSync(dir).find((f) => f.startsWith(attachment.id));
  if (!match) return null;
  return `${dir}/${match}`;
}

function resolveVisionPrompt(custom?: string): string {
  const trimmed = custom?.trim();
  if (!trimmed) return DEFAULT_VISION_PROMPT;
  // 用户指定主题时，仍约束中文与勿编造，避免跑偏
  return (
    `${trimmed}\n\n` +
    `请据此观察图片并回答；只依据图中可见内容，不要编造。中文，尽量简洁（约 200 字内）。`
  );
}

export async function enrichUserMessageImages(
  chatId: string,
  message: ChatMessage,
  options?: { visionPrompt?: string }
): Promise<ChatMessage> {
  if (message.role !== "user" || !message.attachments?.length) return message;

  const images = message.attachments.filter((a) => a.kind === "image");
  if (images.length === 0) return message;

  const settings = loadSettings();
  const baseContent = stripVisionEnrichFromContent(message.content);
  const visionPrompt = resolveVisionPrompt(options?.visionPrompt);

  if (settings.imageViewEnabled === false) {
    const enriched = `${baseContent}${buildVisionEnrichBlock(VISION_ENRICH_FAILURE_TEXT)}`;
    const updated = updateMessage(chatId, message.id, { content: enriched });
    return updated || { ...message, content: enriched };
  }

  if (!settings.imageViewConn.baseUrl?.trim() || !settings.imageViewConn.apiKey?.trim()) {
    const enriched = `${baseContent}${buildVisionEnrichBlock(VISION_ENRICH_FAILURE_TEXT)}`;
    const updated = updateMessage(chatId, message.id, { content: enriched });
    return updated || { ...message, content: enriched };
  }

  const descriptions: string[] = [];
  let failedCount = 0;

  for (const att of images) {
    const filePath = findAttachmentFilePath(chatId, att);
    if (!filePath) {
      failedCount += 1;
      continue;
    }
    try {
      const buffer = fs.readFileSync(filePath);
      const desc = await describeImageBuffer(
        settings.imageViewConn,
        buffer,
        att.mimeType,
        visionPrompt
      );
      descriptions.push(desc.trim());
    } catch {
      failedCount += 1;
    }
  }

  if (descriptions.length === 0) {
    const enriched = `${baseContent}${buildVisionEnrichBlock(VISION_ENRICH_FAILURE_TEXT)}`;
    const updated = updateMessage(chatId, message.id, { content: enriched });
    return updated || { ...message, content: enriched };
  }

  let body = descriptions.join("");
  if (failedCount > 0) {
    body += failedCount === images.length ? "" : "其余图片没能看清。";
  }

  const enriched = `${baseContent}${buildVisionEnrichBlock(body)}`;
  const updated = updateMessage(chatId, message.id, { content: enriched });
  return updated || { ...message, content: enriched };
}

export async function enrichLatestUserMessageImages(
  chatId: string,
  options?: { visionPrompt?: string }
): Promise<void> {
  const chat = getChat(chatId);
  if (!chat) return;
  const last = chat.messages[chat.messages.length - 1];
  if (!last || last.role !== "user") return;
  await enrichUserMessageImages(chatId, last, options);
}
