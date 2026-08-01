import type { NewApiChannelConn } from "../config.js";
import { enrichVisionApiError } from "./newApiClient.js";

function normalizeBaseUrl(url: string): string {
  let base = url.trim().replace(/\/+$/, "");
  base = base.replace(/\/v1\/chat\/completions\/?$/i, "");
  base = base.replace(/\/v1\/models\/?$/i, "");
  base = base.replace(/\/v1\/images\/generations\/?$/i, "");
  base = base.replace(/\/v1\/?$/i, "");
  return base.replace(/\/+$/, "");
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey.trim()}`,
  };
}

/** 使用 base64 data URL 描述图片（本地附件无需公网 URL） */
export async function describeImageBuffer(
  conn: NewApiChannelConn,
  buffer: Buffer,
  mimeType: string,
  prompt = "请客观描述这张图片的内容、人物、场景与文字，供对话 AI 理解。中文，200字以内。"
): Promise<string> {
  if (!conn.baseUrl?.trim() || !conn.apiKey?.trim()) {
    throw new Error("看图接口未配置");
  }
  const model = conn.defaultModel?.trim() || "gpt-4o-mini";
  const base = normalizeBaseUrl(conn.baseUrl.trim());
  const dataUrl = `data:${mimeType || "image/jpeg"};base64,${buffer.toString("base64")}`;

  const res = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: authHeaders(conn.apiKey),
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 512,
    }),
  });

  const raw = (await res.json()) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
  };
  if (!res.ok) {
    const msg = raw.error?.message || `HTTP ${res.status}`;
    throw new Error(await enrichVisionApiError(conn, model, msg));
  }
  const content = raw.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`模型「${model}」未返回描述`);
  return content;
}

export { describeImage, generateImage, testImageGenConn, testNewApiConn, testVisionConn } from "./newApiClient.js";
