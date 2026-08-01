import fs from "fs";
import path from "path";
import crypto from "crypto";
import { MEMORY_DIR, ensureDataDir } from "../config.js";

export type MemorySourceType = "file" | "chat" | "manual" | "weread" | "leann";

export interface MemoryChunk {
  id: string;
  sourceType: MemorySourceType;
  sourceName: string;
  chatId?: string;
  /** 事件记忆：来源聊天标题 */
  sourceChatTitle?: string;
  /** 事件记忆：被总结的消息 id（内部追溯，界面不展示回溯） */
  sourceMessageIds?: string[];
  /** 事件发生/记忆时间（可选） */
  memoryAt?: string;
  /** 注入 prompt 时是否带上 memoryAt */
  includeTimeInPrompt?: boolean;
  /** 经 DeepSeek 总结后的可检索文本 */
  text: string;
  /** 触发关键词（逗号分隔录入）；无关键词且非常驻则不注入 */
  keys?: string[];
  /** 常驻：每轮都注入（慎用） */
  constant?: boolean;
  /** 微信读书：书名 */
  wereadBookTitle?: string;
  /** 微信读书：摘抄 / 阅读进度 */
  wereadKind?: "highlights" | "progress";
  /** LEANN 书目索引 id（sourceType=leann 时） */
  leannCollectionId?: string;
  /** LEANN 段落序号（运行时检索结果） */
  leannChunkIndex?: number;
  /** LEANN 相似度分数（运行时检索结果） */
  leannScore?: number;
  /** 本地 TF-IDF 索引用的分词缓存 */
  tokens: string[];
  createdAt: string;
  updatedAt: string;
}

const CHUNKS_PATH = path.join(MEMORY_DIR, "chunks.json");

export function loadMemoryChunks(): MemoryChunk[] {
  ensureDataDir();
  if (!fs.existsSync(CHUNKS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(CHUNKS_PATH, "utf-8")) as MemoryChunk[];
  } catch {
    return [];
  }
}

export function saveMemoryChunks(chunks: MemoryChunk[]): void {
  ensureDataDir();
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });
  fs.writeFileSync(CHUNKS_PATH, JSON.stringify(chunks, null, 2), "utf-8");
}

export function addMemoryChunk(
  partial: Omit<MemoryChunk, "id" | "createdAt" | "updatedAt" | "tokens"> & {
    tokens?: string[];
  }
): MemoryChunk {
  const chunks = loadMemoryChunks();
  const now = new Date().toISOString();
  const chunk: MemoryChunk = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    tokens: partial.tokens ?? tokenize(partial.text),
    ...partial,
  };
  chunks.push(chunk);
  saveMemoryChunks(chunks);
  return chunk;
}

export function updateMemoryChunk(
  id: string,
  patch: {
    text?: string;
    keys?: string[];
    constant?: boolean;
    memoryAt?: string | null;
    includeTimeInPrompt?: boolean;
  }
): MemoryChunk | null {
  const chunks = loadMemoryChunks();
  const idx = chunks.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  if (patch.text !== undefined) {
    chunks[idx].text = patch.text;
    chunks[idx].tokens = tokenize(patch.text);
  }
  if (patch.keys !== undefined) chunks[idx].keys = patch.keys;
  if (patch.constant !== undefined) chunks[idx].constant = patch.constant;
  if (patch.memoryAt !== undefined) {
    chunks[idx].memoryAt = patch.memoryAt || undefined;
  }
  if (patch.includeTimeInPrompt !== undefined) {
    chunks[idx].includeTimeInPrompt = patch.includeTimeInPrompt;
  }
  chunks[idx].updatedAt = new Date().toISOString();
  saveMemoryChunks(chunks);
  return chunks[idx];
}

export function deleteMemoryChunk(id: string): boolean {
  const chunks = loadMemoryChunks();
  const next = chunks.filter((c) => c.id !== id);
  if (next.length === chunks.length) return false;
  saveMemoryChunks(next);
  return true;
}

export function getMemoryChunk(id: string): MemoryChunk | null {
  return loadMemoryChunks().find((c) => c.id === id) ?? null;
}

/** 简易分词：中文逐字 + 英文单词 */
export function tokenize(text: string): string[] {
  const lower = text.toLowerCase();
  const tokens: string[] = [];
  const en = lower.match(/[a-z0-9]+/g);
  if (en) tokens.push(...en);
  const zh = lower.match(/[\u4e00-\u9fff]/g);
  if (zh) tokens.push(...zh);
  return [...new Set(tokens)];
}

export function splitTextIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let i = 0;
  while (i < text.length) {
    chunks.push(text.slice(i, i + chunkSize));
    i += Math.max(1, chunkSize - overlap);
  }
  return chunks.filter((c) => c.trim().length > 0);
}

export function readTextFile(buffer: Buffer, filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".json")) {
    return buffer.toString("utf-8");
  }
  throw new Error(`暂不支持 ${path.extname(filename)}，里程碑 3 首批支持 .txt / .md`);
}
