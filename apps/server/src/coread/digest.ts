import crypto from "crypto";
import { deepseekComplete } from "../memory/summarizer.js";
import { loadSettings } from "../config.js";
import {
  formatDiscussionText,
  loadCoreadBooks,
  saveCoreadBooks,
  type CoreadBook,
  type CoreadDiscussion,
  type CoreadDraft,
} from "./store.js";

interface ParsedPoint {
  claim: string;
  userView: string;
  charView: string;
}

function pendingDrafts(book: CoreadBook): CoreadDraft[] {
  return book.drafts.filter((d) => !d.digestedAt && d.text.trim());
}

function parseDigestJson(raw: string): ParsedPoint[] {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonText = fence?.[1]?.trim() || trimmed;
  try {
    const data = JSON.parse(jsonText) as
      | { points?: Array<Record<string, unknown>> }
      | Array<Record<string, unknown>>;
    const list = Array.isArray(data) ? data : data.points || [];
    return list
      .map((p) => ({
        claim: String(p.claim || "").trim(),
        userView: String(p.userView || p.xiView || "").trim(),
        charView: String(p.charView || p.suView || "").trim(),
      }))
      .filter((p) => p.claim && (p.userView || p.charView));
  } catch {
    return [];
  }
}

function mergePoints(book: CoreadBook, points: ParsedPoint[]): void {
  const now = new Date().toISOString();
  for (const p of points) {
    const existing = book.discussions.find(
      (d) => d.claim.replace(/\s+/g, "") === p.claim.replace(/\s+/g, "")
    );
    if (existing) {
      existing.userView = p.userView || existing.userView;
      existing.charView = p.charView || existing.charView;
      existing.text = formatDiscussionText(existing.claim, existing.userView, existing.charView);
      existing.updatedAt = now;
    } else {
      const item: CoreadDiscussion = {
        id: crypto.randomUUID(),
        claim: p.claim,
        userView: p.userView,
        charView: p.charView,
        text: formatDiscussionText(p.claim, p.userView, p.charView),
        createdAt: now,
        updatedAt: now,
      };
      book.discussions.push(item);
    }
  }
}

async function digestBook(book: CoreadBook): Promise<number> {
  const pending = pendingDrafts(book);
  if (pending.length === 0) return 0;

  const settings = loadSettings();
  const draftBody = pending
    .map((d) => `【草稿 ${d.createdAt}】\n${d.text}`)
    .join("\n\n")
    .slice(0, 14000);

  const existingClaims = book.discussions.map((d) => d.claim).slice(0, 40);
  const systemPrompt =
    settings.coreadDigestPrompt?.trim() ||
    `你是「共读讨论整理器」，不是角色。根据草稿中的对话，提炼用户与角色围绕本书的讨论论点。
规则：
1. 只输出 JSON：{"points":[{"claim":"论点","userView":"用户的观点","charView":"角色的观点"}]}
2. 每个论点对应一个独立讨论点；可与已有论点合并更新，不要重复同义论点
3. 严格依据草稿，不要编造未出现的观点
4. 中文；论点简洁，观点各 1–4 句`;

  const content = await deepseekComplete(
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `书名：《${book.title}》
已有论点标题（避免重复，可更新同题）：
${existingClaims.length ? existingClaims.map((c, i) => `${i + 1}. ${c}`).join("\n") : "（无）"}

新增草稿：
${draftBody}`,
      },
    ],
    1200
  );

  const points = parseDigestJson(content);
  if (points.length === 0) return 0;

  mergePoints(book, points);
  const now = new Date().toISOString();
  for (const d of pending) d.digestedAt = now;
  book.updatedAt = now;
  return points.length;
}

/** 整理所有有未消化草稿的共读卡 */
export async function digestAllCoreadDrafts(): Promise<{
  books: number;
  points: number;
}> {
  const books = loadCoreadBooks();
  let touched = 0;
  let points = 0;
  for (const book of books) {
    if (pendingDrafts(book).length === 0) continue;
    try {
      const n = await digestBook(book);
      if (n > 0) {
        touched += 1;
        points += n;
      } else {
        // 即使解析失败也不清草稿，留给下次
      }
    } catch (err) {
      console.error(
        `[coread] 整理失败《${book.title}》:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  if (touched > 0) saveCoreadBooks(books);

  return { books: touched, points };
}

export async function digestCoreadBookById(bookId: string): Promise<number> {
  const books = loadCoreadBooks();
  const book = books.find((b) => b.id === bookId);
  if (!book) throw new Error("共读卡不存在");
  const n = await digestBook(book);
  saveCoreadBooks(books);
  return n;
}
