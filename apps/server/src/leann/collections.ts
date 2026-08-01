import fs from "fs";
import path from "path";
import crypto from "crypto";
import { LEANN_DIR, ensureDataDir } from "../config.js";

export type LeannCollectionStatus = "draft" | "indexed";

export interface LeannCollection {
  id: string;
  /** 原始文件名 */
  name: string;
  /** .leann 索引文件路径（绝对） */
  indexPath: string;
  /** chunks.json 路径（绝对） */
  chunksPath: string;
  /** source.txt 路径（绝对） */
  sourcePath: string;
  chunkCount: number;
  /** 文件大小（字节）——通常指原文 */
  byteSize: number;
  /** draft = 未向量化；缺省/旧数据视为 indexed */
  status: LeannCollectionStatus;
  /** 来源格式 */
  sourceFormat?: "text" | "pdf";
  /** PDF 页数（仅 pdf） */
  pageCount?: number;
  createdAt: string;
  updatedAt: string;
}

const REGISTRY_PATH = path.join(LEANN_DIR, "collections.json");

export function ensureLeannDir(): void {
  ensureDataDir();
  if (!fs.existsSync(LEANN_DIR)) {
    fs.mkdirSync(LEANN_DIR, { recursive: true });
  }
}

function normalizeCollection(raw: Partial<LeannCollection> & { id: string }): LeannCollection {
  const dir = collectionDir(raw.id);
  const sourcePath = raw.sourcePath || path.join(dir, "source.txt");
  const chunksPath = raw.chunksPath || path.join(dir, "chunks.json");
  const indexPath = raw.indexPath || path.join(dir, "index.leann");
  const status: LeannCollectionStatus =
    raw.status === "draft" || raw.status === "indexed"
      ? raw.status
      : "indexed";
  return {
    id: raw.id,
    name: raw.name || "未命名",
    indexPath,
    chunksPath,
    sourcePath,
    chunkCount: typeof raw.chunkCount === "number" ? raw.chunkCount : 0,
    byteSize: typeof raw.byteSize === "number" ? raw.byteSize : 0,
    status,
    sourceFormat: raw.sourceFormat,
    pageCount: raw.pageCount,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString(),
  };
}

export function loadLeannCollections(): LeannCollection[] {
  ensureLeannDir();
  if (!fs.existsSync(REGISTRY_PATH)) return [];
  try {
    const list = JSON.parse(fs.readFileSync(REGISTRY_PATH, "utf-8")) as Partial<LeannCollection>[];
    if (!Array.isArray(list)) return [];
    return list
      .filter((c): c is Partial<LeannCollection> & { id: string } => Boolean(c?.id))
      .map(normalizeCollection);
  } catch {
    return [];
  }
}

function saveRegistry(collections: LeannCollection[]): void {
  ensureLeannDir();
  fs.writeFileSync(REGISTRY_PATH, JSON.stringify(collections, null, 2), "utf-8");
}

export function getLeannCollection(id: string): LeannCollection | null {
  return loadLeannCollections().find((c) => c.id === id) ?? null;
}

export function collectionDir(id: string): string {
  return path.join(LEANN_DIR, "collections", id);
}

export function isLeannIndexed(collection: LeannCollection): boolean {
  return collection.status !== "draft";
}

export function updateLeannCollection(
  id: string,
  patch: Partial<
    Pick<
      LeannCollection,
      | "name"
      | "chunkCount"
      | "byteSize"
      | "status"
      | "sourceFormat"
      | "pageCount"
      | "updatedAt"
    >
  >
): LeannCollection | null {
  const all = loadLeannCollections();
  const idx = all.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  all[idx] = {
    ...all[idx],
    ...patch,
    updatedAt: patch.updatedAt || new Date().toISOString(),
  };
  saveRegistry(all);
  return all[idx];
}

export function readCollectionSource(collection: LeannCollection): string {
  if (fs.existsSync(collection.sourcePath)) {
    try {
      return fs.readFileSync(collection.sourcePath, "utf-8");
    } catch {
      /* fall through */
    }
  }
  // 旧书目无 source.txt：用 chunks 拼回全文，便于编辑
  const pieces = loadCollectionChunks(collection);
  return pieces.join("\n\n");
}

export function writeCollectionSource(collection: LeannCollection, text: string): void {
  const dir = path.dirname(collection.sourcePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(collection.sourcePath, text, "utf-8");
}

export function writeCollectionChunks(collection: LeannCollection, pieces: string[]): void {
  const dir = path.dirname(collection.chunksPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(collection.chunksPath, JSON.stringify(pieces, null, 0), "utf-8");
}

/** 创建草稿书目：写 source.txt，可选预写 chunks；不建向量索引 */
export function createLeannDraftRecord(
  name: string,
  sourceText: string,
  meta?: {
    sourceFormat?: "text" | "pdf";
    pageCount?: number;
    pieces?: string[];
  }
): LeannCollection {
  const id = crypto.randomUUID();
  const dir = collectionDir(id);
  fs.mkdirSync(dir, { recursive: true });

  const sourcePath = path.join(dir, "source.txt");
  const chunksPath = path.join(dir, "chunks.json");
  const indexPath = path.join(dir, "index.leann");
  fs.writeFileSync(sourcePath, sourceText, "utf-8");

  const pieces = (meta?.pieces || []).map((p) => String(p).trim()).filter(Boolean);
  if (pieces.length > 0) {
    fs.writeFileSync(chunksPath, JSON.stringify(pieces, null, 0), "utf-8");
  }

  const now = new Date().toISOString();
  const record: LeannCollection = {
    id,
    name,
    indexPath,
    chunksPath,
    sourcePath,
    chunkCount: pieces.length,
    byteSize: Buffer.byteLength(sourceText, "utf8"),
    status: "draft",
    sourceFormat: meta?.sourceFormat,
    pageCount: meta?.pageCount,
    createdAt: now,
    updatedAt: now,
  };

  const all = loadLeannCollections();
  all.push(record);
  saveRegistry(all);
  return record;
}

/** @deprecated 旧路径：立刻带 chunks 建记录；新流程请用 createLeannDraftRecord */
export function createLeannCollectionRecord(
  name: string,
  chunkTexts: string[],
  byteSize: number,
  meta?: { sourceFormat?: "text" | "pdf"; pageCount?: number; status?: LeannCollectionStatus }
): LeannCollection {
  const id = crypto.randomUUID();
  const dir = collectionDir(id);
  fs.mkdirSync(dir, { recursive: true });

  const chunksPath = path.join(dir, "chunks.json");
  const indexPath = path.join(dir, "index.leann");
  const sourcePath = path.join(dir, "source.txt");
  fs.writeFileSync(chunksPath, JSON.stringify(chunkTexts, null, 0), "utf-8");
  // 兼容：用切块拼一份 source，方便后续编辑
  fs.writeFileSync(sourcePath, chunkTexts.join("\n\n"), "utf-8");

  const now = new Date().toISOString();
  const record: LeannCollection = {
    id,
    name,
    indexPath,
    chunksPath,
    sourcePath,
    chunkCount: chunkTexts.length,
    byteSize,
    status: meta?.status ?? "indexed",
    sourceFormat: meta?.sourceFormat,
    pageCount: meta?.pageCount,
    createdAt: now,
    updatedAt: now,
  };

  const all = loadLeannCollections();
  all.push(record);
  saveRegistry(all);
  return record;
}

export function deleteLeannCollection(id: string): boolean {
  const all = loadLeannCollections();
  const next = all.filter((c) => c.id !== id);
  if (next.length === all.length) return false;
  saveRegistry(next);

  const dir = collectionDir(id);
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return true;
}

export function loadCollectionChunks(collection: LeannCollection): string[] {
  if (!fs.existsSync(collection.chunksPath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(collection.chunksPath, "utf-8"));
    return Array.isArray(raw) ? raw.map(String) : [];
  } catch {
    return [];
  }
}

export function chunkTextAt(collection: LeannCollection, idx: number): string {
  const chunks = loadCollectionChunks(collection);
  if (idx < 0 || idx >= chunks.length) return "";
  return chunks[idx] ?? "";
}
