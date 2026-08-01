import { loadSettings } from "../config.js";
import { generateImage } from "../services/newApiClient.js";
import {
  appendAssistantMessage,
  saveChatAttachment,
  type ChatMessage,
} from "../store/chats.js";
import { formatImageShareNote } from "../tools/enrichMarkers.js";

export async function runImageGenFollowUp(
  chatId: string,
  prompt: string,
  _characterName: string
): Promise<
  | { ok: true; message: ChatMessage }
  | { ok: false; error: string; message?: ChatMessage }
> {
  const settings = loadSettings();
  try {
    const result = await generateImage(settings.imageGenConn, prompt);
    let buffer: Buffer;
    let mimeType = "image/png";
    let filename = "generated.png";

    if (result.b64) {
      buffer = Buffer.from(result.b64, "base64");
    } else if (result.url) {
      const imgRes = await fetch(result.url);
      if (!imgRes.ok) {
        throw new Error(`下载图片失败 HTTP ${imgRes.status}`);
      }
      buffer = Buffer.from(await imgRes.arrayBuffer());
      const ct = imgRes.headers.get("content-type");
      if (ct?.startsWith("image/")) {
        mimeType = ct.split(";")[0].trim();
        const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "png";
        filename = `generated.${ext}`;
      }
    } else {
      throw new Error("生图 API 未返回 url 或 base64");
    }

    const attachment = saveChatAttachment(chatId, filename, mimeType, buffer);
    // 独立新消息：口语可见 + 方括号描述进上下文；删除该消息后角色不再读到描述
    const msg = appendAssistantMessage(
      chatId,
      formatImageShareNote(prompt),
      undefined,
      undefined,
      [attachment]
    );
    return { ok: true, message: msg };
  } catch (err) {
    const errText = err instanceof Error ? err.message : "未知错误";
    return { ok: false, error: errText };
  }
}
