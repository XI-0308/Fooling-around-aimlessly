import { loadUserPersona } from "../store/userPersona.js";
import { WEREAD_ENRICH_MARKER } from "../tools/enrichMarkers.js";
import {
  addMemoryChunk,
  loadMemoryChunks,
  saveMemoryChunks,
  tokenize,
  type MemoryChunk,
} from "../memory/store.js";
import { deepseekComplete } from "../memory/summarizer.js";
import { parseKeysInput } from "../triggerMatch.js";

export type WeReadMemoryKind = "highlights" | "progress";

export function hasWeReadEnrichSuccess(content: string): boolean {
  return content.includes(WEREAD_ENRICH_MARKER) && /状态：成功/.test(content);
}

export function extractWeReadEnrichData(content: string): string | null {
  const marker = `\n\n${WEREAD_ENRICH_MARKER}`;
  const idx = content.indexOf(marker);
  if (idx < 0) return null;
  const block = content.slice(idx);
  if (!/状态：成功/.test(block)) return null;
  const dataMatch = block.match(/数据：\n([\s\S]*)/);
  return dataMatch?.[1]?.trim() || null;
}

/** 注入数据里是否含可摘抄的划线/笔记正文（排除仅书架、在读列表等） */
export function hasWeReadExcerptableData(dataBody: string): boolean {
  if (!dataBody.trim()) return false;

  if (/【划线】[\s\S]*?\n-\s+\S/.test(dataBody)) return true;
  if (/【笔记\/想法】[\s\S]*?\n-\s+\S/.test(dataBody)) return true;

  const counts = dataBody.match(/划线\s+(\d+)\s*条[，,]\s*笔记\/想法\s+(\d+)\s*条/);
  if (counts && (Number(counts[1]) > 0 || Number(counts[2]) > 0)) return true;

  if (/【热门划线/.test(dataBody)) {
    const section = (dataBody.split("【热门划线")[1] || "").split("\n【")[0] || "";
    if (/\n-\s+\S/.test(section)) return true;
  }

  return false;
}

export function hasWeReadExcerptableContent(content: string): boolean {
  if (!hasWeReadEnrichSuccess(content)) return false;
  const data = extractWeReadEnrichData(content);
  return data ? hasWeReadExcerptableData(data) : false;
}

export function parseWeReadMeta(dataBody: string): {
  bookTitle: string | null;
  author: string | null;
  progress: number | null;
} {
  const titleMatch = dataBody.match(/《([^》\n]+)》/);
  const progressMatch = dataBody.match(/阅读进度[：:]\s*(\d+)\s*%/);
  let author: string | null = null;
  const headerLine = dataBody.split("\n")[0] || "";
  const afterTitle = headerLine.replace(/《[^》]+》/, "").trim();
  if (afterTitle && !afterTitle.startsWith("阅读进度")) {
    author = afterTitle;
  }
  return {
    bookTitle: titleMatch?.[1]?.trim() || null,
    author,
    progress: progressMatch?.[1] != null ? Number(progressMatch[1]) : null,
  };
}

export function buildSuggestedWeReadKeys(meta: {
  bookTitle: string | null;
  author: string | null;
}): string[] {
  const keys = new Set<string>();
  if (meta.bookTitle) keys.add(meta.bookTitle);
  if (meta.author) keys.add(meta.author);
  keys.add("划线");
  keys.add("笔记");
  keys.add("读书");
  return [...keys];
}

export async function summarizeWeReadForMemory(
  dataBodies: string[],
  userQuestions: string[]
): Promise<{ summary: string; meta: ReturnType<typeof parseWeReadMeta> }> {
  const combinedData = dataBodies.join("\n\n---\n\n").slice(0, 14000);
  const meta = parseWeReadMeta(combinedData);
  const bookLabel = meta.bookTitle ? `《${meta.bookTitle}》` : "未知书名";
  const userCtx = userQuestions.filter(Boolean).join("\n").slice(0, 2000);

  const summary = await deepseekComplete(
    [
      {
        role: "system",
        content: `你是「读书摘抄整理器」，不是角色。将微信读书的划线、笔记整理为可长期检索的记忆条目。
规则：
1. 只输出一段连续文字，不要列表编号
2. 保留用户关心的摘抄要点与章节信息；可合并重复，但不要丢掉具体句子
3. 严格只根据提供的微信读书数据总结，不要编造
4. 80–500 字，中文`,
      },
      {
        role: "user",
        content: `书名：${bookLabel}${meta.author ? ` · ${meta.author}` : ""}${
          meta.progress != null ? ` · 进度 ${meta.progress}%` : ""
        }

用户当时的问题（仅供参考，勿编造）：
${userCtx || "（无）"}

微信读书数据：
${combinedData}`,
      },
    ],
    800
  );

  return { summary: summary.trim(), meta };
}

function progressMemoryText(bookTitle: string, progress: number): string {
  const userName = loadUserPersona().name?.trim() || "你";
  const date = new Date().toISOString().slice(0, 10);
  return `${userName}在读《${bookTitle}》，阅读进度 ${progress}%。最后从微信读书同步：${date}。`;
}

export function upsertWeReadProgressMemory(
  bookTitle: string,
  progress: number,
  keysText?: string
): MemoryChunk {
  const chunks = loadMemoryChunks();
  const idx = chunks.findIndex(
    (c) =>
      c.sourceType === "weread" &&
      c.wereadKind === "progress" &&
      c.wereadBookTitle === bookTitle
  );
  const keys = keysText
    ? parseKeysInput(keysText)
    : [bookTitle, "阅读进度", "在读", "读书"];
  const now = new Date().toISOString();
  const text = progressMemoryText(bookTitle, progress);

  if (idx >= 0) {
    chunks[idx].text = text;
    chunks[idx].tokens = tokenize(text);
    chunks[idx].keys = keys;
    chunks[idx].updatedAt = now;
    saveMemoryChunks(chunks);
    return chunks[idx];
  }

  return addMemoryChunk({
    sourceType: "weread",
    sourceName: `《${bookTitle}》·阅读进度`,
    text,
    keys,
    constant: false,
    wereadBookTitle: bookTitle,
    wereadKind: "progress",
  });
}

export function ingestWeReadHighlightsMemory(input: {
  text: string;
  keysText?: string;
  bookTitle?: string | null;
  chatId?: string;
  messageIds?: string[];
}): MemoryChunk {
  const bookTitle = input.bookTitle?.trim() || "未知书名";
  return addMemoryChunk({
    sourceType: "weread",
    sourceName: `《${bookTitle}》·摘抄`,
    chatId: input.chatId,
    sourceMessageIds: input.messageIds?.length ? input.messageIds : undefined,
    text: input.text.trim(),
    keys: input.keysText ? parseKeysInput(input.keysText) : buildSuggestedWeReadKeys({ bookTitle, author: null }),
    constant: false,
    wereadBookTitle: bookTitle,
    wereadKind: "highlights",
  });
}
