import type { Request, Response } from "express";
import { loadSettings } from "../config.js";
import { getPrimaryCharacter } from "../store/characters.js";
import { loadUserPersona } from "../store/userPersona.js";
import { runObsidianNightly } from "./nightly.js";
import { previewObsidianSettle, settleToObsidian } from "./settle.js";
import {
  appendXiThought,
  buildObsidianOpenUri,
  createThoughtNote,
  ensureWhitelistDirs,
  getVaultRoot,
  listThoughtFeed,
  listWhitelistNotes,
  noteExists,
  parseCommentThread,
  parseWhitelistDirs,
  readAndMigrateNote,
  readNote,
  updateXiThought,
  writeNote,
} from "./vault.js";
import { loadObsidianState, pushRecentComment, saveObsidianState } from "./state.js";

export function getObsidianStatusHandler(_req: Request, res: Response): void {
  const settings = loadSettings();
  const root = getVaultRoot();
  let efSuCount = 0;
  if (root && settings.obsidianEnabled) {
    try {
      efSuCount = listWhitelistNotes({ excludeOptOut: true }).length;
    } catch {
      efSuCount = 0;
    }
  }
  const state = loadObsidianState();
  res.json({
    enabled: settings.obsidianEnabled === true,
    nightlyEnabled: settings.obsidianNightlyEnabled === true,
    vaultConfigured: Boolean(root),
    vaultPath: settings.obsidianVaultPath || "",
    whitelistDirs: parseWhitelistDirs(settings.obsidianWhitelistDirs),
    efSuNoteCount: efSuCount,
    lastRunAt: state.lastRunAt,
    nextRunAt: state.nextRunAt,
    recentComments: state.recentComments.slice(0, 20),
  });
}

export function getObsidianRecentHandler(_req: Request, res: Response): void {
  // 以 vault 为准：已删笔记不再出现；有留言区的笔记都会列出
  const feed = listThoughtFeed(40);
  const state = loadObsidianState();
  const kept = state.recentComments.filter((e) => noteExists(e.relPath));
  if (kept.length !== state.recentComments.length) {
    state.recentComments = kept;
    saveObsidianState(state);
  }
  res.json({
    recentComments: feed.map((e) => ({
      ...e,
      openUri: buildObsidianOpenUri(e.relPath),
    })),
  });
}

export function obsidianReplyHandler(req: Request, res: Response): void {
  try {
    if (!getVaultRoot()) {
      res.status(400).json({ error: "vault 路径无效" });
      return;
    }
    const body = req.body as { relPath?: string; text?: string };
    const relPath = body.relPath?.trim().replace(/\\/g, "/");
    const text = body.text?.trim();
    if (!relPath || !text) {
      res.status(400).json({ error: "需要 relPath 与 text" });
      return;
    }
    if (relPath.includes("..")) {
      res.status(400).json({ error: "非法路径" });
      return;
    }
    const persona = loadUserPersona();
    const character = getPrimaryCharacter();
    const nameOpts = {
      userName: persona.name?.trim() || "你",
      charName: character?.data?.name?.trim() || "角色",
    };
    const note = readAndMigrateNote(relPath);
    const next = appendXiThought(note.content, text, nameOpts);
    writeNote(relPath, next);
    const thread = parseCommentThread(next);
    const lastUser = [...thread].reverse().find((m) => m.role === "user");
    pushRecentComment({
      relPath,
      title: note.title,
      excerpt: (lastUser?.text || text).slice(0, 120),
      at: new Date().toISOString(),
    });
    res.json({
      success: true,
      thread,
      openUri: buildObsidianOpenUri(relPath),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "回复失败" });
  }
}

export function obsidianCreateThoughtHandler(req: Request, res: Response): void {
  try {
    if (!getVaultRoot()) {
      res.status(400).json({ error: "vault 路径无效" });
      return;
    }
    const body = req.body as { title?: string; text?: string };
    const title = body.title?.trim();
    if (!title) {
      res.status(400).json({ error: "需要标题" });
      return;
    }
    const created = createThoughtNote({ title, text: body.text });
    pushRecentComment({
      relPath: created.relPath,
      title: created.title,
      excerpt: (created.thread[0]?.text || "（新话题）").slice(0, 120),
      at: new Date().toISOString(),
    });
    res.json({
      success: true,
      relPath: created.relPath,
      title: created.title,
      thread: created.thread,
      openUri: buildObsidianOpenUri(created.relPath),
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "创建失败" });
  }
}

export function obsidianEditThoughtHandler(req: Request, res: Response): void {
  try {
    if (!getVaultRoot()) {
      res.status(400).json({ error: "vault 路径无效" });
      return;
    }
    const body = req.body as { relPath?: string; index?: number; text?: string };
    const relPath = body.relPath?.trim().replace(/\\/g, "/");
    const text = body.text?.trim();
    const index = body.index;
    if (!relPath || text == null || typeof index !== "number" || index < 0) {
      res.status(400).json({ error: "需要 relPath、index 与 text" });
      return;
    }
    if (relPath.includes("..")) {
      res.status(400).json({ error: "非法路径" });
      return;
    }
    const note = readAndMigrateNote(relPath);
    const next = updateXiThought(note.content, Math.floor(index), text);
    writeNote(relPath, next);
    const thread = parseCommentThread(next);
    res.json({ success: true, thread, openUri: buildObsidianOpenUri(relPath) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "修改失败" });
  }
}

export async function runObsidianNightlyHandler(
  _req: Request,
  res: Response
): Promise<void> {
  try {
    ensureWhitelistDirs();
    const result = await runObsidianNightly({ force: true });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "执行失败" });
  }
}

export async function obsidianSettlePreviewHandler(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const chatId = req.params.id;
    const body = req.body as { messageIds?: string[] };
    const preview = await previewObsidianSettle(chatId, body.messageIds);
    res.json(preview);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "预览失败" });
  }
}

export async function obsidianSettleHandler(req: Request, res: Response): Promise<void> {
  try {
    const chatId = req.params.id;
    const body = req.body as {
      title?: string;
      summary?: string;
      sourceLinks?: string[];
      messageIds?: string[];
      efSu?: boolean;
    };
    if (!body.title?.trim() || !body.summary?.trim()) {
      res.status(400).json({ error: "需要 title 与 summary" });
      return;
    }
    const result = await settleToObsidian(chatId, {
      title: body.title,
      summary: body.summary,
      sourceLinks: body.sourceLinks,
      messageIds: body.messageIds,
      efSu: body.efSu,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "沉淀失败" });
  }
}

export function ensureObsidianDirsHandler(_req: Request, res: Response): void {
  try {
    if (!getVaultRoot()) {
      res.status(400).json({ error: "vault 路径无效" });
      return;
    }
    ensureWhitelistDirs();
    res.json({ success: true, dirs: parseWhitelistDirs(loadSettings().obsidianWhitelistDirs) });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "创建失败" });
  }
}
