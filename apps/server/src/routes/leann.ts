import type { Request, Response } from "express";
import { loadSettings } from "../config.js";
import { probeLeann, buildLeannIndex } from "../leann/client.js";
import { extractDocumentForLeann } from "../leann/extractText.js";
import {
  deleteLeannCollection,
  getLeannCollection,
  loadCollectionChunks,
  loadLeannCollections,
  readCollectionSource,
  updateLeannCollection,
  writeCollectionChunks,
  writeCollectionSource,
} from "../leann/collections.js";
import { createLeannDraft, displayTitleFromCollection } from "../leann/ingestFromText.js";
import { getMemoryTypeLabel } from "../memory/labels.js";
import {
  deleteMemoryChunk,
  loadMemoryChunks,
  splitTextIntoChunks,
  updateMemoryChunk,
  type MemoryChunk,
} from "../memory/store.js";
import { parseKeysInput } from "../triggerMatch.js";

function serializeStub(c: MemoryChunk, leannStatus?: string) {
  return {
    id: c.id,
    sourceType: c.sourceType,
    typeLabel: getMemoryTypeLabel(c.sourceType),
    sourceName: c.sourceName,
    text: c.text,
    keys: c.keys ?? [],
    constant: Boolean(c.constant),
    leannCollectionId: c.leannCollectionId,
    leannStatus: leannStatus || undefined,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

function stubForCollection(collectionId: string): MemoryChunk | undefined {
  return loadMemoryChunks().find((c) => c.leannCollectionId === collectionId);
}

function serializeCollectionDetail(id: string) {
  const collection = getLeannCollection(id);
  if (!collection) return null;
  const fullText = readCollectionSource(collection);
  const pieces = loadCollectionChunks(collection);
  return {
    id: collection.id,
    name: collection.name,
    title: displayTitleFromCollection(collection),
    status: collection.status,
    chunkCount: collection.chunkCount || pieces.length,
    byteSize: collection.byteSize,
    sourceFormat: collection.sourceFormat,
    pageCount: collection.pageCount,
    fullText,
    pieces,
    createdAt: collection.createdAt,
    updatedAt: collection.updatedAt,
  };
}

export async function leannStatusHandler(_req: Request, res: Response): Promise<void> {
  const settings = loadSettings();
  const probe = await probeLeann();
  const collections = loadLeannCollections();
  res.json({
    enabled: settings.leannEnabled,
    pythonPath: settings.leannPythonPath,
    embeddingMode: settings.leannEmbeddingMode,
    retrieveCount: settings.leannRetrieveCount,
    probe,
    collections: collections.map((c) => ({
      id: c.id,
      name: c.name,
      chunkCount: c.chunkCount,
      byteSize: c.byteSize,
      status: c.status,
      sourceFormat: c.sourceFormat,
      pageCount: c.pageCount,
      createdAt: c.createdAt,
    })),
  });
}

export async function leannProbeHandler(_req: Request, res: Response): Promise<void> {
  const probe = await probeLeann();
  res.json(probe);
}

export function getLeannCollectionHandler(req: Request, res: Response): void {
  const detail = serializeCollectionDetail(req.params.id);
  if (!detail) {
    res.status(404).json({ error: "书目不存在" });
    return;
  }
  res.json({ collection: detail });
}

export function updateLeannSourceHandler(req: Request, res: Response): void {
  const collection = getLeannCollection(req.params.id);
  if (!collection) {
    res.status(404).json({ error: "书目不存在" });
    return;
  }
  const { text } = req.body as { text?: string };
  const fullText = (text ?? "").replace(/\u0000/g, "");
  if (fullText.trim().length < 80) {
    res.status(400).json({ error: "正文太短（至少约 80 字）" });
    return;
  }
  writeCollectionSource(collection, fullText);
  updateLeannCollection(collection.id, {
    byteSize: Buffer.byteLength(fullText, "utf8"),
  });

  const stub = stubForCollection(collection.id);
  if (stub && collection.status === "draft") {
    const title = displayTitleFromCollection(collection);
    updateMemoryChunk(stub.id, {
      text: `《${title}》草稿 · 未向量化（${fullText.trim().length} 字）。请到记忆库编辑全文/切块后再向量化。`,
    });
  }

  res.json({ collection: serializeCollectionDetail(collection.id) });
}

export function previewLeannChunksHandler(req: Request, res: Response): void {
  const collection = getLeannCollection(req.params.id);
  if (!collection) {
    res.status(404).json({ error: "书目不存在" });
    return;
  }
  const settings = loadSettings();
  const fullText = readCollectionSource(collection).trim();
  if (fullText.length < 80) {
    res.status(400).json({ error: "全文太短，请先保存足够长的正文" });
    return;
  }
  const pieces = splitTextIntoChunks(
    fullText,
    settings.memoryChunkSize,
    settings.memoryChunkOverlap
  ).filter((p) => p.trim());
  if (pieces.length === 0) {
    res.status(400).json({ error: "切块后内容为空" });
    return;
  }
  writeCollectionChunks(collection, pieces);
  updateLeannCollection(collection.id, { chunkCount: pieces.length });
  res.json({ collection: serializeCollectionDetail(collection.id) });
}

export function updateLeannChunksHandler(req: Request, res: Response): void {
  const collection = getLeannCollection(req.params.id);
  if (!collection) {
    res.status(404).json({ error: "书目不存在" });
    return;
  }
  const { pieces: raw } = req.body as { pieces?: unknown };
  if (!Array.isArray(raw)) {
    res.status(400).json({ error: "pieces 必须是字符串数组" });
    return;
  }
  const pieces = raw.map((p) => String(p).trim()).filter(Boolean);
  if (pieces.length === 0) {
    res.status(400).json({ error: "至少保留一段非空切块" });
    return;
  }
  writeCollectionChunks(collection, pieces);
  updateLeannCollection(collection.id, { chunkCount: pieces.length });
  res.json({ collection: serializeCollectionDetail(collection.id) });
}

export async function vectorizeLeannCollectionHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const settings = loadSettings();
    if (!settings.leannEnabled) {
      res.status(400).json({ error: "请先在设置中启用 LEANN 向量索引" });
      return;
    }
    const probe = await probeLeann();
    if (!probe.ok) {
      res.status(400).json({
        error: `LEANN 未就绪：${probe.error || "未知错误"}`,
      });
      return;
    }

    let collection = getLeannCollection(req.params.id);
    if (!collection) {
      res.status(404).json({ error: "书目不存在" });
      return;
    }

    let pieces = loadCollectionChunks(collection).map((p) => p.trim()).filter(Boolean);
    if (pieces.length === 0) {
      const fullText = readCollectionSource(collection).trim();
      if (fullText.length < 80) {
        res.status(400).json({ error: "请先保存全文或切块" });
        return;
      }
      pieces = splitTextIntoChunks(
        fullText,
        settings.memoryChunkSize,
        settings.memoryChunkOverlap
      ).filter((p) => p.trim());
      if (pieces.length === 0) {
        res.status(400).json({ error: "切块后内容为空" });
        return;
      }
      writeCollectionChunks(collection, pieces);
    }

    collection =
      updateLeannCollection(collection.id, { chunkCount: pieces.length }) || collection;

    await buildLeannIndex(collection);
    collection =
      updateLeannCollection(collection.id, {
        status: "indexed",
        chunkCount: pieces.length,
      }) || collection;

    const title = displayTitleFromCollection(collection);
    const preview = pieces[0]?.slice(0, 120).replace(/\s+/g, " ").trim() || title;
    const stub = stubForCollection(collection.id);
    if (stub) {
      updateMemoryChunk(stub.id, {
        text: `《${title}》已建立 LEANN 向量索引（${pieces.length} 段）。节选：${preview}${
          pieces[0] && pieces[0].length > 120 ? "…" : ""
        }`,
      });
    }

    res.json({
      success: true,
      collection: serializeCollectionDetail(collection.id),
      chunk: stub
        ? serializeStub(loadMemoryChunks().find((c) => c.id === stub.id)!, "indexed")
        : undefined,
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "向量化失败",
    });
  }
}

/** 上传文件 → 仅建草稿（不立刻向量化） */
export async function ingestLeannFileHandler(req: Request, res: Response): Promise<void> {
  try {
    const settings = loadSettings();
    if (!settings.leannEnabled) {
      res.status(400).json({ error: "请先在设置中启用 LEANN 向量索引" });
      return;
    }

    const { filename, dataBase64, keysText, constant } = req.body as {
      filename?: string;
      dataBase64?: string;
      keysText?: string;
      constant?: boolean;
    };

    if (!filename || !dataBase64) {
      res.status(400).json({ error: "缺少文件" });
      return;
    }

    const buffer = Buffer.from(dataBase64, "base64");
    const extracted = await extractDocumentForLeann(buffer, filename);

    if (extracted.format === "pdf") {
      const probe = await probeLeann();
      if (probe.pdf !== true) {
        res.status(400).json({
          error: `PDF 解析未就绪：${probe.pdfError || "请执行 pip install pymupdf"}`,
        });
        return;
      }
    }

    const result = createLeannDraft({
      title: filename,
      text: extracted.text,
      keys: keysText ? parseKeysInput(keysText) : [],
      constant: Boolean(constant),
      sourceFormat: extracted.format === "pdf" ? "pdf" : "text",
      pageCount: extracted.pageCount,
    });

    const stub = loadMemoryChunks().find((c) => c.id === result.memoryChunkId);
    res.json({
      success: true,
      draft: true,
      collection: {
        id: result.collectionId,
        name: result.name,
        chunkCount: result.chunkCount,
        status: "draft" as const,
        pageCount: extracted.pageCount,
        sourceFormat: extracted.format === "pdf" ? "pdf" : "text",
      },
      chunk: stub ? serializeStub(stub, "draft") : undefined,
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "LEANN 导入失败" });
  }
}

export function deleteLeannCollectionHandler(req: Request, res: Response): void {
  const id = req.params.id;
  if (!loadLeannCollections().some((c) => c.id === id)) {
    res.status(404).json({ error: "索引不存在" });
    return;
  }

  deleteLeannCollection(id);

  const stub = loadMemoryChunks().find((c) => c.leannCollectionId === id);
  if (stub) deleteMemoryChunk(stub.id);

  res.json({ success: true });
}
