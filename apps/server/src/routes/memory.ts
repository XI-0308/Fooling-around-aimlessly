import type { Request, Response } from "express";
import { loadSettings } from "../config.js";
import { getMemoryTypeLabel, isEventMemory, isWeReadMemory } from "../memory/labels.js";
import {
  addMemoryChunk,
  deleteMemoryChunk,
  loadMemoryChunks,
  readTextFile,
  splitTextIntoChunks,
  updateMemoryChunk,
  type MemorySourceType,
} from "../memory/store.js";
import { summarizeForMemory } from "../memory/summarizer.js";
import {
  ingestWeReadHighlightsMemory,
  upsertWeReadProgressMemory,
} from "../weread/wereadMemory.js";
import { getChat } from "../store/chats.js";
import { deleteLeannCollection, getLeannCollection } from "../leann/collections.js";
import { searchMemoryGlobal } from "../memory/globalSearch.js";
import { parseKeysInput } from "../triggerMatch.js";

function serializeChunk(c: ReturnType<typeof loadMemoryChunks>[0]) {
  const leannStatus =
    c.sourceType === "leann" && c.leannCollectionId
      ? getLeannCollection(c.leannCollectionId)?.status
      : undefined;
  return {
    id: c.id,
    sourceType: c.sourceType,
    typeLabel: getMemoryTypeLabel(c.sourceType, c.wereadKind),
    sourceName: c.sourceName,
    chatId: c.chatId,
    sourceChatTitle: c.sourceChatTitle,
    wereadBookTitle: c.wereadBookTitle,
    wereadKind: c.wereadKind,
    text: c.text,
    keys: c.keys ?? [],
    constant: Boolean(c.constant),
    memoryAt: c.memoryAt,
    includeTimeInPrompt: Boolean(c.includeTimeInPrompt),
    leannCollectionId: c.leannCollectionId,
    leannStatus,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export function listMemoryHandler(req: Request, res: Response): void {
  const typeFilter = req.query.type as string | undefined;
  let chunks = loadMemoryChunks();
  if (typeFilter === "event") {
    chunks = chunks.filter((c) => isEventMemory(c.sourceType));
  } else if (typeFilter === "file") {
    chunks = chunks.filter((c) => c.sourceType === "file");
  } else if (typeFilter === "weread") {
    chunks = chunks.filter((c) => isWeReadMemory(c.sourceType));
  } else if (typeFilter === "leann") {
    chunks = chunks.filter((c) => c.sourceType === "leann");
  }
  res.json({ chunks: chunks.map(serializeChunk) });
}

/** 记忆库全局搜索：语意 / 事件 / 读书 / 资料 / LEANN 全文 / 活动 */
export function searchMemoryGlobalHandler(req: Request, res: Response): void {
  const q = String(req.query.q || "").trim();
  if (q.length < 1) {
    res.json({ query: "", hits: [], total: 0 });
    return;
  }
  const limitRaw = Number(req.query.limit);
  const limit = Number.isFinite(limitRaw) ? limitRaw : 80;
  const hits = searchMemoryGlobal(q, limit);
  res.json({ query: q, hits, total: hits.length });
}

export function updateMemoryHandler(req: Request, res: Response): void {
  const { text, keys, constant, keysText, memoryAt, includeTimeInPrompt } = req.body as {
    text?: string;
    keys?: string[];
    keysText?: string;
    constant?: boolean;
    memoryAt?: string | null;
    includeTimeInPrompt?: boolean;
  };

  const patch: {
    text?: string;
    keys?: string[];
    constant?: boolean;
    memoryAt?: string | null;
    includeTimeInPrompt?: boolean;
  } = {};
  if (text !== undefined) {
    if (!text.trim()) {
      res.status(400).json({ error: "内容不能为空" });
      return;
    }
    patch.text = text.trim();
  }
  if (keys !== undefined) patch.keys = keys;
  if (keysText !== undefined) patch.keys = parseKeysInput(keysText);
  if (constant !== undefined) patch.constant = constant;
  if (memoryAt !== undefined) patch.memoryAt = memoryAt;
  if (includeTimeInPrompt !== undefined) patch.includeTimeInPrompt = includeTimeInPrompt;

  if (Object.keys(patch).length === 0) {
    res.status(400).json({ error: "没有可更新的内容" });
    return;
  }

  const chunk = updateMemoryChunk(req.params.id, patch);
  if (!chunk) {
    res.status(404).json({ error: "记忆不存在" });
    return;
  }
  res.json({ chunk: serializeChunk(chunk) });
}

export function deleteMemoryHandler(req: Request, res: Response): void {
  const chunk = loadMemoryChunks().find((c) => c.id === req.params.id);
  if (!chunk) {
    res.status(404).json({ error: "记忆不存在" });
    return;
  }
  if (chunk.sourceType === "leann" && chunk.leannCollectionId) {
    deleteLeannCollection(chunk.leannCollectionId);
  }
  deleteMemoryChunk(req.params.id);
  res.json({ success: true });
}

/** 事件记忆：审核确认后入库（单条） */
export async function ingestEventHandler(req: Request, res: Response): Promise<void> {
  const { chatId, messageIds, text, keysText, memoryAt, includeTimeInPrompt, items } = req.body as {
    chatId?: string;
    messageIds?: string[];
    text?: string;
    keysText?: string;
    memoryAt?: string;
    includeTimeInPrompt?: boolean;
    items?: { text?: string; keysText?: string }[];
  };

  const content =
    text?.trim() ||
    items
      ?.map((i) => i.text?.trim())
      .filter(Boolean)
      .join("\n\n");

  if (!content) {
    res.status(400).json({ error: "请提供记忆内容" });
    return;
  }

  const chat = chatId ? getChat(chatId) : null;
  const keys = keysText ? parseKeysInput(keysText) : [];
  const msgIds = messageIds ?? [];

  const chunk = addMemoryChunk({
    sourceType: "chat",
    sourceName: chat ? "事件记忆" : "手动事件",
    chatId: chat?.id,
    sourceChatTitle: chat?.title,
    sourceMessageIds: msgIds.length ? msgIds : undefined,
    text: content,
    keys,
    constant: false,
    memoryAt: memoryAt || undefined,
    includeTimeInPrompt: Boolean(includeTimeInPrompt && memoryAt),
  });

  res.json({ success: true, count: 1, chunks: [serializeChunk(chunk)] });
}

export async function ingestFileHandler(req: Request, res: Response): Promise<void> {
  try {
    const { filename, dataBase64 } = req.body as { filename?: string; dataBase64?: string };
    if (!filename || !dataBase64) {
      res.status(400).json({ error: "缺少文件" });
      return;
    }

    const settings = loadSettings();
    const buffer = Buffer.from(dataBase64, "base64");
    const raw = readTextFile(buffer, filename);
    const pieces = splitTextIntoChunks(raw, settings.memoryChunkSize, settings.memoryChunkOverlap);

    const created = [];
    for (let i = 0; i < pieces.length; i++) {
      const summaries = await summarizeForMemory(pieces[i], `${filename}#${i + 1}`);
      for (const text of summaries) {
        created.push(
          addMemoryChunk({
            sourceType: "file",
            sourceName: filename,
            text,
            keys: [],
            constant: false,
          })
        );
      }
    }

    res.json({ success: true, count: created.length, chunks: created.map(serializeChunk) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "导入失败" });
  }
}

export async function ingestManualHandler(req: Request, res: Response): Promise<void> {
  const { text, sourceName, keysText } = req.body as {
    text?: string;
    sourceName?: string;
    keysText?: string;
  };
  if (!text?.trim()) {
    res.status(400).json({ error: "内容不能为空" });
    return;
  }

  try {
    const summaries = await summarizeForMemory(text.trim(), sourceName || "手动添加");
    const keys = keysText ? parseKeysInput(keysText) : [];
    const created = summaries.map((t) =>
      addMemoryChunk({
        sourceType: "chat",
        sourceName: "手动事件",
        text: t,
        keys,
        constant: false,
      })
    );
    res.json({ success: true, count: created.length, chunks: created.map(serializeChunk) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "处理失败" });
  }
}

/** 微信读书摘抄：审核确认后入库 */
export async function ingestWeReadHandler(req: Request, res: Response): Promise<void> {
  const { chatId, messageIds, text, keysText, bookTitle, progress, syncProgress } = req.body as {
    chatId?: string;
    messageIds?: string[];
    text?: string;
    keysText?: string;
    bookTitle?: string;
    progress?: number;
    syncProgress?: boolean;
  };

  if (!text?.trim()) {
    res.status(400).json({ error: "请提供记忆内容" });
    return;
  }

  const title = bookTitle?.trim() || "未知书名";
  const chunk = ingestWeReadHighlightsMemory({
    text: text.trim(),
    keysText,
    bookTitle: title,
    chatId,
    messageIds,
  });

  let progressChunk = null;
  if (syncProgress && typeof progress === "number" && progress >= 0) {
    progressChunk = upsertWeReadProgressMemory(title, progress, keysText);
  }

  res.json({
    success: true,
    count: progressChunk ? 2 : 1,
    chunks: [serializeChunk(chunk), ...(progressChunk ? [serializeChunk(progressChunk)] : [])],
  });
}

export async function ingestChatHandler(req: Request, res: Response): Promise<void> {
  const { chatId, text, keysText } = req.body as {
    chatId?: string;
    text?: string;
    keysText?: string;
  };
  if (!text?.trim()) {
    res.status(400).json({ error: "内容不能为空" });
    return;
  }

  try {
    const chat = chatId ? getChat(chatId) : null;
    const summaries = await summarizeForMemory(text.trim(), `聊天${chatId?.slice(0, 8) || ""}`);
    const keys = keysText ? parseKeysInput(keysText) : [];
    const created = summaries.map((t) =>
      addMemoryChunk({
        sourceType: "chat",
        sourceName: "事件记忆",
        chatId,
        sourceChatTitle: chat?.title,
        text: t,
        keys,
        constant: false,
      })
    );
    res.json({ success: true, count: created.length, chunks: created.map(serializeChunk) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "处理失败" });
  }
}
