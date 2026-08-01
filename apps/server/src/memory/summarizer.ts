import { loadSettings } from "../config.js";
import type { DeepSeekMessage } from "../promptBuilder.js";

const DEEPSEEK_URL = "https://api.deepseek.com/chat/completions";

/** 非流式 DeepSeek 调用（用于总结/筛选，不对用户展示） */
export async function deepseekComplete(
  messages: DeepSeekMessage[],
  maxTokens = 1024
): Promise<string> {
  const settings = loadSettings();
  if (!settings.deepseekApiKey) {
    throw new Error("未配置 DeepSeek API Key");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 90_000);
  try {
    const res = await fetch(DEEPSEEK_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${settings.deepseekApiKey}`,
      },
      body: JSON.stringify({
        model: settings.model || "deepseek-chat",
        messages,
        temperature: 0.3,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`DeepSeek 错误 (${res.status}): ${err}`);
    }

    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    return json.choices?.[0]?.message?.content?.trim() || "";
  } catch (err) {
    if (err instanceof Error && (err.name === "AbortError" || /timeout|fetch failed/i.test(err.message))) {
      throw new Error("DeepSeek 连接超时，请稍后再试");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function summarizeEventAsOne(rawDialogue: string, sourceName: string): Promise<string> {
  const content = await deepseekComplete(
    [
      {
        role: "system",
        content: `你是「事件记忆整理器」，不是角色。将对话总结为一条独立的事件记忆。
规则：
1. 只输出一段连续文字，不要列表、不要分条、不要编号
2. 只写客观事实与发生的事，15–300 字，中文
3. 严格只根据对话总结，不要编造、不要补充对话外内容`,
      },
      {
        role: "user",
        content: `来源「${sourceName}」\n\n${rawDialogue.slice(0, 12000)}`,
      },
    ],
    512
  );
  return content.trim();
}

export async function summarizeForMemory(
  rawText: string,
  sourceName: string
): Promise<string[]> {
  const settings = loadSettings();
  const prompt = settings.memorySummarizePrompt.replace(/\{\{source\}\}/g, sourceName);

  const content = await deepseekComplete([
    { role: "system", content: prompt },
    {
      role: "user",
      content: `以下是你需要处理的【唯一原文】，请仅据此总结，不要引用或假设其他上下文：\n\n来源「${sourceName}」\n\n${rawText.slice(0, 12000)}`,
    },
  ]);

  return parseMemoryBlocks(content);
}

export async function selectMemoriesWithDeepSeek(
  query: string,
  candidates: { id: string; text: string }[],
  maxPick: number
): Promise<string[]> {
  if (candidates.length === 0) return [];
  const settings = loadSettings();

  const list = candidates
    .map((c, i) => `[${i}] id=${c.id}\n${c.text.slice(0, 400)}`)
    .join("\n\n");

  const prompt = settings.memorySelectPrompt
    .replace(/\{\{max\}\}/g, String(maxPick))
    .replace(/\{\{query\}\}/g, query);

  const content = await deepseekComplete([
    { role: "system", content: prompt },
    { role: "user", content: `对话上下文：\n${query}\n\n候选记忆：\n${list}` },
  ]);

  const trimmed = content.trim();
  if (/^NONE\b/i.test(trimmed)) return [];

  const ids: string[] = [];
  for (const c of candidates) {
    if (content.includes(c.id)) ids.push(c.id);
  }
  if (ids.length > 0) return ids.slice(0, maxPick);

  const indices = content.match(/\d+/g)?.map(Number) ?? [];
  if (indices.length === 0) return [];

  return indices
    .filter((i) => i >= 0 && i < candidates.length)
    .slice(0, maxPick)
    .map((i) => candidates[i].id);
}

/** 解析 DeepSeek 输出的记忆块（支持 - 条目 或编号列表） */
export function parseMemoryBlocks(text: string): string[] {
  const lines = text.split("\n");
  const blocks: string[] = [];
  let current = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(-|\*|•|\d+[.)])\s+/.test(trimmed)) {
      if (current.trim()) blocks.push(current.trim());
      current = trimmed.replace(/^(-|\*|•|\d+[.)])\s+/, "");
    } else if (trimmed === "---" || trimmed === "") {
      if (current.trim()) blocks.push(current.trim());
      current = "";
    } else {
      current += (current ? "\n" : "") + trimmed;
    }
  }
  if (current.trim()) blocks.push(current.trim());

  if (blocks.length === 0 && text.trim()) {
    return [text.trim()];
  }
  return blocks.filter((b) => b.length >= 8);
}
