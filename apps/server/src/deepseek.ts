import type { DeepSeekMessage } from "./promptBuilder.js";
import type { GenerationSettings } from "./config.js";
import { apiMaxTokens } from "./tokenLimits.js";
import {
  isDeepSeekThinkingMode,
  resolveDeepSeekModel,
  type DeepSeekReasoningEffort,
} from "./deepseekModels.js";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

export { isDeepSeekThinkingMode } from "./deepseekModels.js";

export interface StreamUsage {
  completion_tokens?: number;
  prompt_tokens?: number;
  total_tokens?: number;
  completion_tokens_details?: {
    reasoning_tokens?: number;
  };
}

export interface StreamCallbacks {
  onToken: (token: string) => void;
  onReasoningToken?: (token: string) => void;
  onDone: (fullText: string, reasoning?: string, usage?: StreamUsage) => void;
  onError: (error: string) => void;
}

/** 构建 DeepSeek 请求体（v4 思维链 + 采样参数） */
export function buildDeepSeekRequestBody(
  messages: DeepSeekMessage[],
  settings: GenerationSettings
): Record<string, unknown> {
  const thinking = isDeepSeekThinkingMode(settings);
  const body: Record<string, unknown> = {
    model: resolveDeepSeekModel(settings.model),
    messages,
    stream: true,
    stream_options: { include_usage: true },
    thinking: { type: thinking ? "enabled" : "disabled" },
  };

  if (thinking) {
    const effort = (settings.deepseekReasoningEffort || "high") as DeepSeekReasoningEffort;
    body.reasoning_effort = effort;
  } else {
    body.temperature = settings.temperature;
    body.top_p = settings.topP;
    body.frequency_penalty = settings.frequencyPenalty;
    body.presence_penalty = settings.presencePenalty;
  }

  const maxTok = apiMaxTokens(settings.maxTokens);
  if (maxTok !== undefined) body.max_tokens = maxTok;
  return body;
}

export async function streamChatCompletion(
  apiKey: string,
  messages: DeepSeekMessage[],
  settings: GenerationSettings,
  callbacks: StreamCallbacks
): Promise<void> {
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(buildDeepSeekRequestBody(messages, settings)),
  });

  if (!res.ok) {
    const errText = await res.text();
    callbacks.onError(`DeepSeek API 错误 (${res.status}): ${errText}`);
    return;
  }

  if (!res.body) {
    callbacks.onError("DeepSeek 未返回流式数据");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let fullText = "";
  let fullReasoning = "";
  let lastUsage: StreamUsage | undefined;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (data === "[DONE]") {
        callbacks.onDone(fullText, fullReasoning || undefined, lastUsage);
        return;
      }
      try {
        const json = JSON.parse(data) as {
          usage?: StreamUsage;
          choices?: {
            delta?: { content?: string; reasoning_content?: string };
            message?: { content?: string; reasoning_content?: string };
          }[];
        };
        if (json.usage) lastUsage = json.usage;

        const choice = json.choices?.[0];
        const delta = choice?.delta;
        const message = choice?.message;
        const token = delta?.content || "";
        const reasoningToken = delta?.reasoning_content || "";
        const messageReasoning = message?.reasoning_content || "";
        if (reasoningToken) {
          fullReasoning += reasoningToken;
          callbacks.onReasoningToken?.(reasoningToken);
        } else if (messageReasoning && !fullReasoning) {
          fullReasoning = messageReasoning;
        }
        if (token) {
          fullText += token;
          callbacks.onToken(token);
        } else if (message?.content && !fullText) {
          fullText = message.content;
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }

  callbacks.onDone(fullText, fullReasoning || undefined, lastUsage);
}

/** 非流式角色对话（heartbeat 等场景，与 buildDeepSeekRequestBody 参数一致） */
export async function completeRoleplayChat(
  apiKey: string,
  messages: DeepSeekMessage[],
  settings: GenerationSettings,
  maxTokensOverride?: number
): Promise<{ content: string; reasoning?: string }> {
  const body: Record<string, unknown> = {
    ...buildDeepSeekRequestBody(messages, settings),
    stream: false,
  };
  delete body.stream_options;
  if (maxTokensOverride !== undefined) {
    body.max_tokens = maxTokensOverride;
  }

  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`DeepSeek API 错误 (${res.status}): ${errText}`);
  }

  const json = (await res.json()) as {
    choices?: {
      message?: { content?: string; reasoning_content?: string };
    }[];
  };
  const message = json.choices?.[0]?.message;
  return {
    content: message?.content?.trim() || "",
    reasoning: message?.reasoning_content?.trim() || undefined,
  };
}

/** 测试 DeepSeek 角色对话 API 是否可用 */
export async function testDeepSeekConn(apiKey: string, model: string): Promise<string> {
  if (!apiKey.trim()) {
    throw new Error("DeepSeek API Key 未配置（请在设置页填写，或配置 .env 的 DEEPSEEK_API_KEY）");
  }
  const res = await fetch(DEEPSEEK_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: resolveDeepSeekModel(model || "deepseek-v4-flash"),
      messages: [{ role: "user", content: "回复 OK 两个字母即可" }],
      max_tokens: 8,
      stream: false,
      thinking: { type: "disabled" },
      temperature: 0,
    }),
  });
  const raw = (await res.json()) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
  };
  if (!res.ok) {
    const msg = raw.error?.message || `HTTP ${res.status}`;
    if (res.status === 401) {
      throw new Error(`DeepSeek API Key 无效或已过期：${msg}`);
    }
    throw new Error(msg);
  }
  const reply = raw.choices?.[0]?.message?.content?.trim();
  if (!reply) throw new Error("DeepSeek 未返回内容");
  return `连接成功（模型 ${resolveDeepSeekModel(model || "deepseek-v4-flash")}，回复：${reply.slice(0, 40)}）`;
}
