import type { OpenAiCompatConn } from "../config.js";
import type { DeepSeekMessage } from "../promptBuilder.js";

function normalizeBaseUrl(url: string): string {
  // 兼容用户填 https://host 或 https://host/v1（避免拼成 /v1/v1/...）
  return url.replace(/\/+$/, "").replace(/\/v1$/i, "");
}

/** OpenAI 兼容 /v1/chat/completions（用于 Agent 等扩展模型） */
export async function openAiChatCompletion(
  conn: OpenAiCompatConn,
  messages: DeepSeekMessage[],
  options?: { model?: string; maxTokens?: number; temperature?: number }
): Promise<{ content: string; raw: unknown }> {
  if (!conn.baseUrl?.trim() || !conn.apiKey?.trim()) {
    throw new Error("OpenAI 兼容接口未配置 Base URL 或 API Key");
  }
  const base = normalizeBaseUrl(conn.baseUrl.trim());
  const url = `${base}/v1/chat/completions`;
  const body: Record<string, unknown> = {
    model: options?.model || conn.defaultModel || "gpt-4o-mini",
    messages,
    temperature: options?.temperature ?? 0.7,
  };
  if (options?.maxTokens && options.maxTokens > 0) body.max_tokens = options.maxTokens;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${conn.apiKey.trim()}`,
    },
    body: JSON.stringify(body),
  });

  const raw = (await res.json()) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
  };

  if (!res.ok) {
    throw new Error(raw.error?.message || `HTTP ${res.status}`);
  }

  const content = raw.choices?.[0]?.message?.content || "";
  return { content, raw };
}

/** 连通性测试：拉取模型列表 */
export async function testOpenAiCompatConn(conn: OpenAiCompatConn): Promise<string> {
  if (!conn.baseUrl?.trim() || !conn.apiKey?.trim()) {
    throw new Error("请先填写 Base URL 与 API Key");
  }
  const base = normalizeBaseUrl(conn.baseUrl.trim());
  const res = await fetch(`${base}/v1/models`, {
    headers: { Authorization: `Bearer ${conn.apiKey.trim()}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { data?: { id: string }[] };
  const count = json.data?.length ?? 0;
  const sample = json.data?.slice(0, 3).map((m) => m.id).join(", ") || "（无列表）";
  return `连接成功，可见 ${count} 个模型（示例：${sample}）`;
}
