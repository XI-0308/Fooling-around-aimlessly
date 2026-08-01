import crypto from "crypto";
import { loadSettings } from "../config.js";
import { addMemoryChunk } from "../memory/store.js";
import { parseKeysInput } from "../triggerMatch.js";
import { createLeannDraftRecord, type LeannCollection } from "./collections.js";

export interface LeannDraftResult {
  collectionId: string;
  name: string;
  chunkCount: number;
  memoryChunkId: string;
  status: "draft";
}

function sanitizeLeannTitle(title: string): string {
  return title.trim().replace(/[\\/:*?"<>|]+/g, "_").slice(0, 120) || "未命名资料";
}

/** 存草稿全文 + 记忆壳（不向量化）；到记忆库编辑切块后再向量化 */
export function createLeannDraft(input: {
  title: string;
  text: string;
  keys?: string[];
  constant?: boolean;
  sourceFormat?: "text" | "pdf";
  pageCount?: number;
}): LeannDraftResult {
  const settings = loadSettings();
  if (!settings.leannEnabled) {
    throw new Error("请先在设置中启用 LEANN 向量索引");
  }

  const title = sanitizeLeannTitle(input.title);
  const text = input.text.replace(/\u0000/g, "").trim();
  if (text.length < 80) {
    throw new Error("正文太短，不适合建成电子书");
  }

  const filename = /\.(txt|md|pdf)$/i.test(title) ? title : `${title}.txt`;
  const record = createLeannDraftRecord(filename, text, {
    sourceFormat: input.sourceFormat || "text",
    pageCount: input.pageCount,
  });

  const stub = addMemoryChunk({
    sourceType: "leann",
    sourceName: filename,
    leannCollectionId: record.id,
    text: `《${title}》草稿 · 未向量化（${text.length} 字）。请到记忆库编辑全文/切块后再向量化。`,
    keys: input.keys?.length ? input.keys : parseKeysInput(title),
    constant: Boolean(input.constant),
  });

  return {
    collectionId: record.id,
    name: record.name,
    chunkCount: record.chunkCount,
    memoryChunkId: stub.id,
    status: "draft",
  };
}

/** @deprecated 旧一键入库；现改为 createLeannDraft */
export function ingestTextAsLeannBook(input: {
  title: string;
  text: string;
  keys?: string[];
  constant?: boolean;
}): LeannDraftResult {
  return createLeannDraft(input);
}

export function displayTitleFromCollection(collection: LeannCollection): string {
  return collection.name.replace(/\.txt$/i, "");
}

export interface PendingLeannOffer {
  id: string;
  chatId: string;
  title: string;
  text: string;
  source: "bilibili" | "web" | "zhihu";
  charCount: number;
  createdAt: string;
}

const pendingByChat = new Map<string, PendingLeannOffer[]>();

export function queueLeannOffer(
  chatId: string,
  offer: Omit<PendingLeannOffer, "id" | "chatId" | "createdAt" | "charCount"> & {
    text: string;
    title: string;
  }
): PendingLeannOffer | null {
  const settings = loadSettings();
  if (!settings.leannEnabled) return null;
  const text = offer.text.trim();
  const title = offer.title.trim();
  if (text.length < 80 || !title) return null;
  const row: PendingLeannOffer = {
    id: crypto.randomUUID(),
    chatId,
    title: title.slice(0, 120),
    text,
    source: offer.source,
    charCount: text.length,
    createdAt: new Date().toISOString(),
  };
  const list = pendingByChat.get(chatId) || [];
  // 同标题去重
  const next = list.filter((o) => o.title !== row.title);
  next.push(row);
  pendingByChat.set(chatId, next.slice(-5));
  return row;
}

export function listPendingLeannOffers(chatId: string): PendingLeannOffer[] {
  return pendingByChat.get(chatId) || [];
}

export function getPendingLeannOffer(
  chatId: string,
  offerId: string
): PendingLeannOffer | null {
  return (pendingByChat.get(chatId) || []).find((o) => o.id === offerId) || null;
}

export function takePendingLeannOffer(
  chatId: string,
  offerId: string
): PendingLeannOffer | null {
  const list = pendingByChat.get(chatId) || [];
  const found = list.find((o) => o.id === offerId) || null;
  if (!found) return null;
  pendingByChat.set(
    chatId,
    list.filter((o) => o.id !== offerId)
  );
  return found;
}

export function dismissPendingLeannOffer(chatId: string, offerId: string): boolean {
  const list = pendingByChat.get(chatId) || [];
  const next = list.filter((o) => o.id !== offerId);
  if (next.length === list.length) return false;
  pendingByChat.set(chatId, next);
  return true;
}

/** 从 B 站 enrich 成功块抽出标题+正文（简介+字幕） */
export function extractBilibiliBodiesForLeann(
  enrichedContent: string
): { title: string; text: string }[] {
  const marker = "\n\n[工具 · Bilibili 字幕]";
  const idx = enrichedContent.indexOf(marker);
  if (idx < 0) return [];
  const block = enrichedContent.slice(idx);
  if (!/状态：成功/.test(block)) return [];
  const dataIdx = block.indexOf("数据：\n");
  if (dataIdx < 0) return [];
  const data = block.slice(dataIdx + "数据：\n".length);
  const parts = data.split(/\n\n---\n\n/);
  const out: { title: string; text: string }[] = [];
  for (const part of parts) {
    const title = part.match(/标题：(.+)/)?.[1]?.trim() || "B站视频";
    const body = part.trim();
    if (body.length >= 80) out.push({ title, text: body });
  }
  return out;
}

/** 从网页 enrich 成功块抽出各链接正文 */
export function extractWebBodiesForLeann(
  enrichedContent: string
): { title: string; text: string }[] {
  const marker = "\n\n[用户分享的网页 — 正文摘要]";
  const idx = enrichedContent.indexOf(marker);
  if (idx < 0) return [];
  const data = enrichedContent.slice(idx + marker.length).trim();
  const parts = data.split(/\n\n---\n\n/);
  const out: { title: string; text: string }[] = [];
  for (const part of parts) {
    if (/抓取失败/.test(part)) continue;
    const title =
      part.match(/标题：(.+)/)?.[1]?.trim() ||
      part.match(/链接：(https?:\/\/\S+)/)?.[1] ||
      "网页文章";
    const bodyMatch = part.match(/正文摘要：\n([\s\S]*)/);
    const body = (bodyMatch?.[1] || part).trim();
    if (body.length >= 80 && title !== "（无标题）") {
      out.push({ title: title === "（无标题）" ? "网页文章" : title, text: `标题：${title}\n\n${body}` });
    } else if (body.length >= 80) {
      out.push({ title: "网页文章", text: body });
    }
  }
  return out;
}

/**
 * 从知乎 enrich 成功块抽出「Cookie 全文」正文。
 * 开放平台摘要 / 回退摘要一律跳过（太薄，不适合建电子书）。
 */
export function extractZhihuBodiesForLeann(
  enrichedContent: string
): { title: string; text: string }[] {
  const marker = "\n\n[工具 · 知乎]";
  const idx = enrichedContent.indexOf(marker);
  if (idx < 0) return [];
  const block = enrichedContent.slice(idx);
  if (!/状态：成功/.test(block)) return [];
  const dataIdx = block.indexOf("数据：\n");
  if (dataIdx < 0) return [];
  const data = block.slice(dataIdx + "数据：\n".length);
  const parts = data.split(/\n\n---\n\n/);
  const out: { title: string; text: string }[] = [];
  for (const part of parts) {
    if (
      /开放平台摘要|非全文|摘要回退|仅使用知乎开放平台摘要|Cookie 正文抓取失败/.test(
        part
      )
    ) {
      continue;
    }
    // 全文：专栏【正文】、单答【回答正文】、问题页多答列表
    const looksFull =
      /【正文】|【回答正文】/.test(part) ||
      (/链接：/.test(part) &&
        (/作者：|回答者：|--- 回答\s+\d+/.test(part) || /问题：/.test(part)));
    if (!looksFull) continue;
    const title =
      part.match(/标题：(.+)/)?.[1]?.trim() ||
      part.match(/问题：(.+)/)?.[1]?.trim() ||
      "知乎文章";
    const body = part.trim();
    if (body.length >= 80) out.push({ title: title || "知乎文章", text: body });
  }
  return out;
}
