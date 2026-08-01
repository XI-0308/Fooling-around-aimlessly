import type { DeepSeekMessage } from "../../promptBuilder.js";
import type { GenerationSettings } from "../../config.js";
import { apiMaxTokens } from "../../tokenLimits.js";
import {
  isDeepSeekThinkingMode,
  resolveDeepSeekModel,
  type DeepSeekReasoningEffort,
} from "../../deepseekModels.js";
import type { StreamCallbacks } from "../../deepseek.js";

const ANTHROPIC_URL = "https://api.deepseek.com/anthropic/v1/messages";

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

function splitPromptMessages(messages: DeepSeekMessage[]): {
  system: string;
  messages: AnthropicMessage[];
} {
  const systemParts: string[] = [];
  const anthropicMessages: AnthropicMessage[] = [];

  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
      continue;
    }
    anthropicMessages.push({ role: m.role, content: m.content });
  }

  // Anthropic 要求 user/assistant 交替；若第一条是 assistant，前插简短 user
  if (anthropicMessages.length > 0 && anthropicMessages[0].role === "assistant") {
    anthropicMessages.unshift({ role: "user", content: "（继续）" });
  }

  return { system: systemParts.join("\n\n"), messages: anthropicMessages };
}

function buildAnthropicBody(
  messages: DeepSeekMessage[],
  settings: GenerationSettings
): Record<string, unknown> {
  const thinking = isDeepSeekThinkingMode(settings);
  const { system, messages: anthropicMessages } = splitPromptMessages(messages);
  const body: Record<string, unknown> = {
    model: resolveDeepSeekModel(settings.model),
    max_tokens: apiMaxTokens(settings.maxTokens) ?? 4096,
    stream: true,
    messages: anthropicMessages,
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    thinking: { type: thinking ? "enabled" : "disabled" },
  };

  if (system) body.system = system;

  if (thinking) {
    body.output_config = {
      effort: (settings.deepseekReasoningEffort || "high") as DeepSeekReasoningEffort,
    };
  } else {
    body.temperature = settings.temperature;
    body.top_p = settings.topP;
  }

  return body;
}

export interface WebSearchStreamCallbacks extends StreamCallbacks {
  onWebSearching?: () => void;
}

export async function streamAnthropicChatWithWebSearch(
  apiKey: string,
  messages: DeepSeekMessage[],
  settings: GenerationSettings,
  callbacks: WebSearchStreamCallbacks
): Promise<void> {
  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(buildAnthropicBody(messages, settings)),
  });

  if (!res.ok) {
    const errText = await res.text();
    callbacks.onError(`DeepSeek Anthropic API 错误 (${res.status}): ${errText.slice(0, 500)}`);
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
  let webSearchingNotified = false;

  const notifyWebSearching = () => {
    if (webSearchingNotified) return;
    webSearchingNotified = true;
    callbacks.onWebSearching?.();
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    for (const chunk of chunks) {
      let eventType = "";
      let dataLine = "";
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) eventType = line.slice(6).trim();
        if (line.startsWith("data:")) dataLine = line.slice(5).trim();
      }
      if (!dataLine) continue;

      try {
        const json = JSON.parse(dataLine) as Record<string, unknown>;
        const type = String(json.type || eventType || "");

        if (type === "content_block_start") {
          const block = json.content_block as { type?: string } | undefined;
          if (block?.type === "server_tool_use" || block?.type === "web_search_tool_result") {
            notifyWebSearching();
          }
        }

        if (type === "content_block_delta") {
          const delta = json.delta as Record<string, unknown> | undefined;
          if (!delta) continue;
          const deltaType = String(delta.type || "");
          if (deltaType === "text_delta" && typeof delta.text === "string") {
            fullText += delta.text;
            callbacks.onToken(delta.text);
          } else if (deltaType === "thinking_delta" && typeof delta.thinking === "string") {
            fullReasoning += delta.thinking;
            callbacks.onReasoningToken?.(delta.thinking);
          } else if (deltaType === "input_json_delta") {
            notifyWebSearching();
          }
        }

        if (type === "message_stop" || type === "message_delta") {
          const delta = json.delta as { stop_reason?: string } | undefined;
          if (delta?.stop_reason === "tool_use") notifyWebSearching();
        }
      } catch {
        // ignore malformed chunks
      }
    }
  }

  callbacks.onDone(fullText, fullReasoning || undefined);
}
