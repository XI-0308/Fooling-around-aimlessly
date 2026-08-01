import type { Request, Response } from "express";
import {
  deleteEntry,
  importStWorldInfo,
  loadWorldInfoBook,
  newEmptyEntry,
  saveWorldInfoBook,
  updateBookSettings,
  upsertEntry,
} from "../worldInfo/store.js";
import type { WorldInfoEntry } from "../worldInfo/types.js";

export function getWorldInfoHandler(_req: Request, res: Response): void {
  res.json({ book: loadWorldInfoBook() });
}

export function updateWorldInfoSettingsHandler(req: Request, res: Response): void {
  const body = req.body as {
    scanDepth?: number;
    tokenBudget?: number;
    recursiveScanning?: boolean;
    caseSensitive?: boolean;
    recursionLimit?: number;
    name?: string;
  };
  const book = updateBookSettings(body);
  res.json({ book });
}

export function upsertWorldInfoEntryHandler(req: Request, res: Response): void {
  const entry = req.body as WorldInfoEntry;
  if (!entry.id) entry.id = newEmptyEntry().id;
  const book = upsertEntry(entry);
  res.json({ book });
}

export function deleteWorldInfoEntryHandler(req: Request, res: Response): void {
  const book = deleteEntry(req.params.id);
  res.json({ book });
}

export function importWorldInfoHandler(req: Request, res: Response): void {
  try {
    const book = importStWorldInfo(req.body);
    res.json({ success: true, book });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "导入失败" });
  }
}

export function newWorldInfoEntryHandler(_req: Request, res: Response): void {
  res.json({ entry: newEmptyEntry() });
}
