import type { Request, Response } from "express";
import { loadSettings } from "../config.js";
import { getCharacter } from "../store/characters.js";
import { loadUserPersona } from "../store/userPersona.js";
import { synthesizeSpeech } from "../services/volcanoTts.js";
import { synthesizeOpenAiSpeech } from "../services/openaiTts.js";
import { stripTextForTts } from "../tts/stripForSpeech.js";

export async function speakTtsHandler(req: Request, res: Response): Promise<void> {
  const { text, speaker, characterId } = req.body as {
    text?: string;
    speaker?: string;
    characterId?: string;
  };

  const char = characterId ? getCharacter(characterId) : null;
  const userName = loadUserPersona().name?.trim() || "你";
  const spoken = stripTextForTts(text || "", [
    char?.data?.name?.trim() || "",
    userName,
  ]);
  if (!spoken) {
    res.status(400).json({ error: "朗读内容为空（可能全是括号内的动作描写）" });
    return;
  }

  const settings = loadSettings();
  if (settings.volcanoTtsEnabled === false) {
    res.status(400).json({ error: "语音朗读已在设置中关闭" });
    return;
  }

  let voice = speaker?.trim();
  if (!voice) {
    voice = char?.preset?.ttsSpeaker?.trim();
  }

  const provider = settings.ttsProvider === "openai" ? "openai" : "volcano";

  try {
    if (provider === "openai") {
      const result = await synthesizeOpenAiSpeech(settings.openaiCompat, spoken, {
        model: settings.openaiTtsModel,
        voice: voice || settings.openaiTtsVoice,
      });
      res.json({
        audioBase64: result.audioBase64,
        format: result.format,
        speaker: result.speaker,
        model: result.model,
        provider: "openai",
      });
      return;
    }

    const result = await synthesizeSpeech(settings.volcanoTts, spoken, voice);
    res.json({
      audioBase64: result.audioBase64,
      format: result.format,
      speaker: result.speaker,
      resourceId: result.resourceId,
      provider: "volcano",
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "TTS 失败" });
  }
}
