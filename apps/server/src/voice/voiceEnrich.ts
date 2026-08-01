import fs from "fs";
import path from "path";
import { loadSettings } from "../config.js";
import { getChat, getChatAttachmentsDir, saveChat, type ChatMessage } from "../store/chats.js";
import { transcribeWithVolcanoAsr } from "../services/volcanoAsr.js";

/** 旧版曾写入；新消息不再注入，遇到则剥掉 */
const LEGACY_VOICE_ENRICH_MARKER = "[工具 · 语音识别]";

function findAttachmentFile(chatId: string, attachmentId: string): string | null {
  const dir = getChatAttachmentsDir(chatId);
  if (!fs.existsSync(dir)) return null;
  const hit = fs.readdirSync(dir).find((name) => name.startsWith(attachmentId));
  return hit ? path.join(dir, hit) : null;
}

function hasAudioAttachment(msg: ChatMessage): boolean {
  return Boolean(msg.attachments?.some((a) => a.kind === "audio"));
}

/** [语音]、[语音 7″]、[语音消息] 等都算占位 */
function isVoicePlaceholder(content: string): boolean {
  const visible = content.replace(/\s+/g, " ").trim();
  if (!visible) return true;
  if (visible === "[语音消息]") return true;
  return /^\[语音[^\]]*\]$/i.test(visible);
}

/** 从「[语音] xxx」或「[语音消息] xxx」取出转写（不含工具块） */
function extractClientTranscript(content: string): string {
  const withoutLegacy = content.includes(LEGACY_VOICE_ENRICH_MARKER)
    ? content.slice(0, content.indexOf(LEGACY_VOICE_ENRICH_MARKER)).trim()
    : content;
  const visible = withoutLegacy.replace(/\s+/g, " ").trim();
  const m = visible.match(/^\[语音(?:消息)?[^\]]*\]\s*(.+)$/i);
  if (!m?.[1]) return "";
  const t = m[1].trim();
  if (/^\d+[″"']?$/.test(t)) return "";
  return t;
}

function stripLegacyVoiceEnrich(content: string): string {
  const idx = content.indexOf(`\n\n${LEGACY_VOICE_ENRICH_MARKER}`);
  if (idx >= 0) return content.slice(0, idx).trim();
  const idx2 = content.indexOf(LEGACY_VOICE_ENRICH_MARKER);
  if (idx2 >= 0) return content.slice(0, idx2).trim();
  return content.trim();
}

function guessAudioFormat(filePath: string, mimeType?: string): string {
  const lower = `${filePath} ${mimeType || ""}`.toLowerCase();
  if (lower.includes("wav")) return "wav";
  if (lower.includes("mp3") || lower.includes("mpeg")) return "mp3";
  if (lower.includes("m4a") || lower.includes("mp4") || lower.includes("aac")) return "mp4";
  if (lower.includes("ogg") || lower.includes("opus")) return "ogg";
  if (lower.includes("webm")) return "webm";
  return "raw";
}

/**
 * 用户语音：保证正文里有转写文字供角色理解。
 * 不再注入「[工具 · 语音识别]」块（提示词面板也不再出现）。
 */
export async function enrichLatestUserMessageVoice(chatId: string): Promise<void> {
  const settings = loadSettings();
  if (settings.voiceMessagesEnabled === false) return;

  const chat = getChat(chatId);
  if (!chat?.messages.length) return;
  const last = chat.messages[chat.messages.length - 1];
  if (last.role !== "user" || !hasAudioAttachment(last)) return;

  // 清掉旧版工具注入
  if (last.content.includes(LEGACY_VOICE_ENRICH_MARKER)) {
    const cleaned = stripLegacyVoiceEnrich(last.content);
    const t = extractClientTranscript(cleaned);
    last.content = t ? `[语音消息] ${t}` : cleaned || "[语音消息]";
    saveChat(chat);
    return;
  }

  const visible = (last.content || "").replace(/\s+/g, " ").trim();
  const clientTranscript = extractClientTranscript(visible);

  // 已有转写：不动（浏览器或此前 ASR 已写好）
  if (clientTranscript) return;

  // 不是语音占位，别瞎改
  if (!isVoicePlaceholder(visible)) return;

  const audioAtt = last.attachments!.find((a) => a.kind === "audio");
  if (!audioAtt) return;

  const filePath = findAttachmentFile(chatId, audioAtt.id);
  if (!filePath || !fs.existsSync(filePath)) return;

  try {
    if (settings.volcanoAsrEnabled === false) return;

    const buf = fs.readFileSync(filePath);
    const format = guessAudioFormat(filePath, audioAtt.mimeType);
    const transcript = await transcribeWithVolcanoAsr(settings.volcanoTts, buf, {
      endpoint: settings.volcanoAsrEndpoint,
      resourceId: settings.volcanoAsrResourceId,
      format,
    });
    if (!transcript.trim()) return;

    last.content = `[语音消息] ${transcript.trim()}`;
    saveChat(chat);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.warn("[voice] ASR 失败:", reason);
    // 失败不写工具块、不改正文，避免带偏角色；下轮若仍是占位会再试
  }
}
