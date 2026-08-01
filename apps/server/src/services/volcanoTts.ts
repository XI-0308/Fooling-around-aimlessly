import type { VolcanoTtsConn } from "../config.js";

export interface TtsResult {
  audioBase64: string;
  format: string;
  speaker: string;
  resourceId: string;
}

export function resolveTtsResourceId(speaker: string, configured?: string): string {
  if (speaker.startsWith("S_")) return "seed-icl-2.0";
  if (speaker.includes("uranus_bigtts") || speaker.startsWith("saturn_")) return "seed-tts-2.0";
  if (speaker.includes("mars_bigtts") || speaker.includes("moon_bigtts") || speaker.startsWith("ICL_")) {
    return "seed-tts-1.0";
  }
  return configured?.trim() || "seed-tts-2.0";
}

function buildAdditions(speaker: string): string | undefined {
  if (!speaker.startsWith("S_")) return undefined;
  return JSON.stringify({ model_type: 4 });
}

function pickSpeaker(conn: VolcanoTtsConn, override?: string): string {
  const s = override?.trim() || conn.defaultSpeaker?.trim();
  if (s) return s;
  return "zh_female_shuangkuaisisi_uranus_bigtts";
}

function extractAudioBase64(rawText: string): string {
  const chunks: string[] = [];

  for (const line of rawText.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const payload = trimmed.startsWith("data:") ? trimmed.slice(5).trim() : trimmed;
    if (payload === "[DONE]") continue;
    try {
      const json = JSON.parse(payload) as {
        code?: number;
        message?: string;
        data?: string;
        audio?: string;
      };
      if (json.code !== undefined && json.code !== 0 && json.code !== 20000000) {
        throw new Error(json.message || `TTS 错误 code=${json.code}`);
      }
      if (json.data) chunks.push(json.data);
      if (json.audio) chunks.push(json.audio);
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("TTS 错误")) throw e;
    }
  }

  if (chunks.length > 0) return chunks.join("");

  const json = JSON.parse(rawText) as {
    code?: number;
    message?: string;
    data?: string;
    audio?: string;
  };
  if (json.code !== undefined && json.code !== 0 && json.code !== 20000000) {
    throw new Error(json.message || `TTS 错误 code=${json.code}`);
  }
  const b64 = json.data || json.audio;
  if (!b64) throw new Error("TTS 响应无音频数据");
  return b64;
}

export async function synthesizeSpeech(
  conn: VolcanoTtsConn,
  text: string,
  speakerOverride?: string
): Promise<TtsResult> {
  if (!conn.endpoint?.trim() || !conn.appId || !conn.accessToken) {
    throw new Error("火山 TTS 配置不完整");
  }

  const speaker = pickSpeaker(conn, speakerOverride);
  const resourceId = resolveTtsResourceId(speaker, conn.resourceId);
  const additions = buildAdditions(speaker);

  const reqParams: Record<string, unknown> = {
    text: text.slice(0, 500),
    speaker,
    audio_params: {
      format: conn.audioFormat || "mp3",
      sample_rate: conn.sampleRate || 24000,
    },
  };
  if (additions) reqParams.additions = additions;

  const res = await fetch(conn.endpoint.trim(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-App-Id": conn.appId.trim(),
      "X-Api-Access-Key": conn.accessToken.trim(),
      "X-Api-Resource-Id": resourceId,
    },
    body: JSON.stringify({
      user: { uid: "rp-agent" },
      req_params: reqParams,
    }),
  });

  const rawText = await res.text();

  if (!res.ok && !rawText.trim()) {
    throw new Error(`TTS HTTP ${res.status}（speaker=${speaker}, resource=${resourceId}）`);
  }

  let audioBase64: string;
  try {
    audioBase64 = extractAudioBase64(rawText);
  } catch (err) {
    throw new Error(
      err instanceof Error
        ? `${err.message}（speaker=${speaker}, resource=${resourceId}）`
        : `TTS 解析失败（speaker=${speaker}）`
    );
  }

  return {
    audioBase64,
    format: conn.audioFormat || "mp3",
    speaker,
    resourceId,
  };
}

export async function testVolcanoTtsConn(
  conn: VolcanoTtsConn,
  speakerOverride?: string
): Promise<string> {
  const result = await synthesizeSpeech(conn, "音色测试，你好。", speakerOverride);
  const kb = Math.round((result.audioBase64.length * 3) / 4 / 1024);
  return `TTS 成功（音色 ${result.speaker}，Resource ${result.resourceId}，约 ${kb} KB）`;
}
