import type { Response } from "express";
import { loadSettings } from "../config.js";
import { getCharacter } from "../store/characters.js";
import { getChat, patchLastAssistantExtras, saveChatAttachment } from "../store/chats.js";
import { synthesizeSpeech } from "../services/volcanoTts.js";
import { synthesizeOpenAiSpeech } from "../services/openaiTts.js";
import { stripTextForTts } from "../tts/stripForSpeech.js";
import { loadUserPersona } from "../store/userPersona.js";

export async function runAssistantVoiceFollowUp(
  res: Response,
  chatId: string,
  characterId: string,
  assistantText: string
): Promise<void> {
  const settings = loadSettings();
  if (settings.voiceMessagesEnabled === false) return;
  if (settings.assistantVoiceReplyEnabled === false) return;
  if (settings.volcanoTtsEnabled === false) return;

  const character = getCharacter(characterId);
  const charName = character?.data?.name?.trim() || "";
  const userName = loadUserPersona().name?.trim() || "你";
  const spoken = stripTextForTts(assistantText, [charName, userName]);
  if (spoken.trim().length < 2) return;

  res.write(`data: ${JSON.stringify({ type: "voice_generating" })}\n\n`);

  try {
    const speaker = character?.preset?.ttsSpeaker?.trim();

    let audioBase64: string;
    let format = "mp3";

    if (settings.ttsProvider === "openai") {
      const result = await synthesizeOpenAiSpeech(settings.openaiCompat, spoken, {
        model: settings.openaiTtsModel,
        voice: speaker || settings.openaiTtsVoice,
      });
      audioBase64 = result.audioBase64;
      format = result.format || "mp3";
    } else {
      const result = await synthesizeSpeech(settings.volcanoTts, spoken, speaker);
      audioBase64 = result.audioBase64;
      format = result.format || "mp3";
    }

    const buffer = Buffer.from(audioBase64, "base64");
    if (buffer.length < 32) {
      throw new Error("语音合成结果过短");
    }

    const ext = format === "wav" ? "wav" : "mp3";
    const mime = format === "wav" ? "audio/wav" : "audio/mpeg";
    const durationSec = Math.max(1, Math.round(buffer.length / 16000));

    const att = saveChatAttachment(chatId, `voice-${Date.now()}.${ext}`, mime, buffer, {
      durationSec,
    });
    const patched = patchLastAssistantExtras(chatId, { attachments: [att] });
    const message =
      (patched && getChat(chatId)?.messages.find((m) => m.id === patched.id)) || patched;

    res.write(
      `data: ${JSON.stringify({
        type: "voice_done",
        message,
      })}\n\n`
    );
  } catch (err) {
    const error = err instanceof Error ? err.message : "语音合成失败";
    console.warn("[voice] 助手语音失败:", error);
    res.write(
      `data: ${JSON.stringify({
        type: "voice_error",
        error,
      })}\n\n`
    );
  }
}
