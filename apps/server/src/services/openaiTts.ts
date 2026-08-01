import type { OpenAiCompatConn } from "../config.js";
import { getPrimaryCharacter } from "../store/characters.js";

export interface OpenAiTtsResult {
  audioBase64: string;
  format: string;
  speaker: string;
  model: string;
  mode: "speech" | "chat-audio";
}

const DEFAULT_TTS_MODEL = "gpt-4o-mini-tts";
const DEFAULT_TTS_VOICE = "alloy";

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

/** 兼容 base 已含 /v1 的中转站 */
export function openAiApiUrl(baseUrl: string, apiPath: string): string {
  const base = normalizeBaseUrl(baseUrl.trim());
  const path = apiPath.startsWith("/") ? apiPath : `/${apiPath}`;
  if (base.endsWith("/v1") && path.startsWith("/v1/")) {
    return `${base}${path.slice(3)}`;
  }
  return `${base}${path}`;
}

/** gpt-4o-audio-preview 等：走 chat/completions 音频输出，不是 /audio/speech */
export function isChatAudioTtsModel(model: string): boolean {
  const m = model.toLowerCase();
  return m.includes("audio-preview") || (m.includes("realtime") && m.includes("audio"));
}

async function readErrorDetail(res: Response): Promise<string> {
  const errText = await res.text().catch(() => "");
  if (!errText.trim()) {
    if (res.status === 404) {
      return "接口不存在（中转站可能未开通该路径）";
    }
    if (res.status === 503) {
      return "服务暂时不可用（模型在列表里，但通道当前无上游）";
    }
    return "无详情";
  }
  try {
    const json = JSON.parse(errText) as { error?: { message?: string }; message?: string };
    return json.error?.message || json.message || errText.slice(0, 240);
  } catch {
    return errText.slice(0, 240);
  }
}

async function synthesizeViaSpeechApi(
  conn: OpenAiCompatConn,
  text: string,
  model: string,
  voice: string
): Promise<OpenAiTtsResult> {
  const url = openAiApiUrl(conn.baseUrl, "/v1/audio/speech");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${conn.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model,
      input: text.slice(0, 4000),
      voice,
      response_format: "mp3",
    }),
  });

  if (!res.ok) {
    const detail = await readErrorDetail(res);
    throw new Error(
      `OpenAI /audio/speech 失败（${res.status}）：${detail}` +
        (res.status === 404
          ? "。你的中转站多半未开通标准 TTS；请换支持 tts-1 / gpt-4o-mini-tts 的站点，或改用 chat 音频模型。"
          : "")
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 32) {
    throw new Error("OpenAI TTS 响应过短，可能不是音频数据");
  }

  return {
    audioBase64: buf.toString("base64"),
    format: "mp3",
    speaker: voice,
    model,
    mode: "speech",
  };
}

async function synthesizeViaChatAudio(
  conn: OpenAiCompatConn,
  text: string,
  model: string,
  voice: string
): Promise<OpenAiTtsResult> {
  const url = openAiApiUrl(conn.baseUrl, "/v1/chat/completions");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${conn.apiKey.trim()}`,
    },
    body: JSON.stringify({
      model,
      modalities: ["text", "audio"],
      audio: { voice, format: "mp3" },
      messages: [
        {
          role: "system",
          content:
            "你是朗读器。请一字不差地朗读用户给出的文本，不要添加称呼、解释或额外句子。",
        },
        { role: "user", content: text.slice(0, 2000) },
      ],
    }),
  });

  if (!res.ok) {
    const detail = await readErrorDetail(res);
    throw new Error(
      `OpenAI chat 音频失败（${res.status}）：${detail}` +
        (res.status === 503
          ? "。模型虽在列表中，但中转站当前没有可用上游（gpt-4o-audio-preview 常见）。"
          : "")
    );
  }

  const json = (await res.json()) as {
    choices?: {
      message?: {
        audio?: { data?: string; id?: string };
        content?: string | null;
      };
    }[];
  };

  const data = json.choices?.[0]?.message?.audio?.data;
  if (!data?.trim()) {
    throw new Error(
      "对话返回了文本但没有 audio.data。该中转站可能不支持 modalities=audio 输出。"
    );
  }

  return {
    audioBase64: data,
    format: "mp3",
    speaker: voice,
    model,
    mode: "chat-audio",
  };
}

export async function synthesizeOpenAiSpeech(
  conn: OpenAiCompatConn,
  text: string,
  options?: { model?: string; voice?: string }
): Promise<OpenAiTtsResult> {
  if (!conn.baseUrl?.trim() || !conn.apiKey?.trim()) {
    throw new Error("OpenAI 兼容接口未配置 Base URL 或 API Key（请到设置 → OpenAI 兼容）");
  }

  const model = options?.model?.trim() || DEFAULT_TTS_MODEL;
  const voice = options?.voice?.trim() || DEFAULT_TTS_VOICE;

  if (isChatAudioTtsModel(model)) {
    return synthesizeViaChatAudio(conn, text, model, voice);
  }

  try {
    return await synthesizeViaSpeechApi(conn, text, model, voice);
  } catch (speechErr) {
    const msg = speechErr instanceof Error ? speechErr.message : String(speechErr);
    // 中转无 /audio/speech 时，若模型名像音频模型，再试 chat 路径
    if (msg.includes("404") || msg.includes("接口不存在")) {
      try {
        return await synthesizeViaChatAudio(conn, text, model, voice);
      } catch {
        throw speechErr;
      }
    }
    throw speechErr;
  }
}

export async function testOpenAiTtsConn(
  conn: OpenAiCompatConn,
  options?: { model?: string; voice?: string }
): Promise<{ message: string; audioBase64: string; format: string }> {
  const charName = getPrimaryCharacter()?.data?.name?.trim() || "角色";
  const result = await synthesizeOpenAiSpeech(conn, `音色试听：你好，我是${charName}。`, options);
  const kb = Math.round((result.audioBase64.length * 3) / 4 / 1024);
  const modeLabel = result.mode === "chat-audio" ? "对话音频" : "标准 TTS";
  return {
    message: `OpenAI TTS 成功（${modeLabel} · 模型 ${result.model} · 音色 ${result.speaker} · 约 ${kb} KB）`,
    audioBase64: result.audioBase64,
    format: result.format,
  };
}
