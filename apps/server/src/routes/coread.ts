import type { Request, Response } from "express";
import { getChat } from "../store/chats.js";
import { loadUserPersona } from "../store/userPersona.js";
import { getPrimaryCharacter } from "../store/characters.js";
import { stripEnrichBlocksFromDisplay } from "../tools/enrichMarkers.js";
import { digestCoreadBookById } from "../coread/digest.js";
import {
  appendCoreadDraft,
  createCoreadBook,
  deleteCoreadBook,
  deleteCoreadDiscussion,
  deleteCoreadDraft,
  getCoreadBook,
  loadCoreadBooks,
  updateCoreadBook,
  updateCoreadDiscussion,
  updateCoreadDraft,
} from "../coread/store.js";

function serializeBook(b: ReturnType<typeof loadCoreadBooks>[0], lite = false) {
  const base = {
    id: b.id,
    title: b.title,
    keys: b.keys,
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
    draftCount: b.drafts.length,
    pendingDraftCount: b.drafts.filter((d) => !d.digestedAt).length,
    discussionCount: b.discussions.length,
  };
  if (lite) return base;
  return {
    ...base,
    drafts: b.drafts,
    discussions: b.discussions,
  };
}

export function listCoreadHandler(req: Request, res: Response): void {
  /** 默认轻量列表（选卡弹窗）；记忆库页传 ?detail=1 拿完整草稿/讨论 */
  const detail =
    req.query.detail === "1" ||
    req.query.detail === "true" ||
    req.query.full === "1";
  res.json({ books: loadCoreadBooks().map((b) => serializeBook(b, !detail)) });
}

export function createCoreadHandler(req: Request, res: Response): void {
  try {
    const { title, keysText } = req.body as { title?: string; keysText?: string };
    const book = createCoreadBook(String(title || ""), keysText);
    res.json({ book: serializeBook(book) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "创建失败" });
  }
}

export function getCoreadHandler(req: Request, res: Response): void {
  const book = getCoreadBook(req.params.id);
  if (!book) {
    res.status(404).json({ error: "共读卡不存在" });
    return;
  }
  res.json({ book: serializeBook(book) });
}

export function updateCoreadHandler(req: Request, res: Response): void {
  try {
    const { title, keysText, keys } = req.body as {
      title?: string;
      keysText?: string;
      keys?: string[];
    };
    const keyList =
      keys ??
      (typeof keysText === "string"
        ? keysText
            .split(/[,，;；\n]/)
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined);
    const book = updateCoreadBook(req.params.id, { title, keys: keyList });
    if (!book) {
      res.status(404).json({ error: "共读卡不存在" });
      return;
    }
    res.json({ book: serializeBook(book) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "更新失败" });
  }
}

export function deleteCoreadHandler(req: Request, res: Response): void {
  if (!deleteCoreadBook(req.params.id)) {
    res.status(404).json({ error: "共读卡不存在" });
    return;
  }
  res.json({ ok: true });
}

/** 聊天日记入：勾选消息原文进入草稿 */
export function appendCoreadDraftHandler(req: Request, res: Response): void {
  const bookId = req.params.id;
  const { chatId, messageIds, text } = req.body as {
    chatId?: string;
    messageIds?: string[];
    text?: string;
  };

  let body = (text || "").trim();
  if (!body && chatId && messageIds?.length) {
    const chat = getChat(chatId);
    if (!chat) {
      res.status(404).json({ error: "聊天不存在" });
      return;
    }
    const idSet = new Set(messageIds);
    const parts: string[] = [];
    const persona = loadUserPersona();
    const character = getPrimaryCharacter();
    const userName = persona.name?.trim() || "你";
    const charName = character?.data?.name?.trim() || "角色";
    for (const m of chat.messages) {
      if (!idSet.has(m.id)) continue;
      const role = m.role === "user" ? userName : m.role === "assistant" ? charName : m.role;
      const content = stripEnrichBlocksFromDisplay(m.content || "").trim();
      if (!content) continue;
      parts.push(`${role}：${content}`);
    }
    body = parts.join("\n\n");
  }

  if (!body) {
    res.status(400).json({ error: "没有可记入的正文" });
    return;
  }

  const stamp = new Date().toISOString();
  const draftText = `—— ${stamp.slice(0, 16).replace("T", " ")} 记入 ——\n${body}`;
  const book = appendCoreadDraft(bookId, {
    text: draftText,
    chatId,
    messageIds,
  });
  if (!book) {
    res.status(404).json({ error: "共读卡不存在" });
    return;
  }
  res.json({ book: serializeBook(book) });
}

export function deleteCoreadDraftHandler(req: Request, res: Response): void {
  const book = deleteCoreadDraft(req.params.id, req.params.draftId);
  if (!book) {
    res.status(404).json({ error: "草稿不存在" });
    return;
  }
  res.json({ book: serializeBook(book) });
}

export function updateCoreadDraftHandler(req: Request, res: Response): void {
  try {
    const { text, clearDigested } = req.body as {
      text?: string;
      clearDigested?: boolean;
    };
    const book = updateCoreadDraft(req.params.id, req.params.draftId, {
      text,
      clearDigested: Boolean(clearDigested),
    });
    if (!book) {
      res.status(404).json({ error: "草稿不存在" });
      return;
    }
    res.json({ book: serializeBook(book) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "更新失败" });
  }
}

export function updateCoreadDiscussionHandler(req: Request, res: Response): void {
  const { claim, userView, charView, xiView, suView, text } = req.body as {
    claim?: string;
    userView?: string;
    charView?: string;
    xiView?: string;
    suView?: string;
    text?: string;
  };
  const book = updateCoreadDiscussion(req.params.id, req.params.discussionId, {
    claim,
    userView: userView ?? xiView,
    charView: charView ?? suView,
    text,
  });
  if (!book) {
    res.status(404).json({ error: "论点不存在" });
    return;
  }
  res.json({ book: serializeBook(book) });
}

export function deleteCoreadDiscussionHandler(req: Request, res: Response): void {
  const book = deleteCoreadDiscussion(req.params.id, req.params.discussionId);
  if (!book) {
    res.status(404).json({ error: "论点不存在" });
    return;
  }
  res.json({ book: serializeBook(book) });
}

export async function digestCoreadHandler(req: Request, res: Response): Promise<void> {
  try {
    const n = await digestCoreadBookById(req.params.id);
    const book = getCoreadBook(req.params.id);
    res.json({ points: n, book: book ? serializeBook(book) : null });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "整理失败" });
  }
}
