import crypto from "crypto";
import type { VolcanoTtsConn } from "../config.js";

export interface VolcanoAsrOptions {
  endpoint?: string;
  resourceId?: string;
  /** wav / mp3 / ogg / raw / webm 等，写入请求体帮助上游识别 */
  format?: string;
}

const DEFAULT_ASR_ENDPOINT =
  "https://openspeech.bytedance.com/api/v3/auc/bigmodel/recognize/flash";
const DEFAULT_ASR_RESOURCE = "volc.bigasr.auc_turbo";

function pickText(json: Record<string, unknown>): string {
  const result = json.result;
  if (typeof result === "string" && result.trim()) return result.trim();
  if (result && typeof result === "object") {
    const t = (result as { text?: string }).text;
    if (t?.trim()) return t.trim();
  }
  const data = json.data;
  if (typeof data === "string" && data.trim()) return data.trim();
  if (data && typeof data === "object") {
    const d = data as { text?: string; result?: { text?: string } | string };
    if (d.text?.trim()) return d.text.trim();
    if (typeof d.result === "string" && d.result.trim()) return d.result.trim();
    if (d.result && typeof d.result === "object" && d.result.text?.trim()) {
      return d.result.text.trim();
    }
  }
  if (typeof json.text === "string" && json.text.trim()) return json.text.trim();
  return "";
}

/**
 * 火山豆包语音 · 录音文件极速识别（flash）。
 * 凭证复用火山 TTS 的 appId + accessToken；资源 ID 需在控制台开通 ASR。
 */
export async function transcribeWithVolcanoAsr(
  conn: VolcanoTtsConn,
  audio: Buffer,
  options?: VolcanoAsrOptions
): Promise<string> {
  if (!conn.appId?.trim() || !conn.accessToken?.trim()) {
    throw new Error("火山语音识别未配置：请先在设置 → 语音填写火山 APP ID 与 Access Token");
  }

  const endpoint = (options?.endpoint || DEFAULT_ASR_ENDPOINT).trim();
  const resourceId = (options?.resourceId || DEFAULT_ASR_RESOURCE).trim();
  const requestId = crypto.randomUUID();
  const format = (options?.format || "raw").toLowerCase();

  const audioBody: Record<string, string> = {
    data: audio.toString("base64"),
  };
  // 官方常用 wav/mp3/ogg；webm 也带上，便于网关识别
  if (format && format !== "raw") {
    audioBody.format = format === "mp4" || format === "m4a" || format === "aac" ? "mp4" : format;
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-App-Key": conn.appId.trim(),
      "X-Api-Access-Key": conn.accessToken.trim(),
      "X-Api-Resource-Id": resourceId,
      "X-Api-Request-Id": requestId,
      "X-Api-Sequence": "-1",
    },
    body: JSON.stringify({
      user: { uid: conn.appId.trim() },
      audio: audioBody,
      request: { model_name: "bigmodel" },
    }),
  });

  const statusHeader = res.headers.get("X-Api-Status-Code") || "";
  const msgHeader = res.headers.get("X-Api-Message") || "";
  const rawText = await res.text();

  let json: Record<string, unknown> = {};
  try {
    json = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : {};
  } catch {
    throw new Error(
      `火山 ASR 响应无法解析（HTTP ${res.status}${statusHeader ? ` / ${statusHeader}` : ""}）：${rawText.slice(0, 180) || msgHeader}`
    );
  }

  const code = json.code;
  if (code !== undefined && code !== 0 && code !== "0" && Number(code) !== 20000000) {
    throw new Error(
      String(json.message || json.msg || msgHeader || `火山 ASR 错误 code=${code}`)
    );
  }
  if (statusHeader && statusHeader !== "20000000" && statusHeader !== "0") {
    throw new Error(msgHeader || `火山 ASR 状态 ${statusHeader}`);
  }
  if (!res.ok) {
    throw new Error(String(json.message || json.msg || msgHeader || `火山 ASR HTTP ${res.status}`));
  }

  const trimmed = pickText(json);
  if (!trimmed) {
    throw new Error(
      "火山 ASR 未返回识别文本（请确认已开通 volc.bigasr.auc_turbo；手机录音建议用 mp4，webm 可能不被支持）"
    );
  }
  return trimmed;
}
