import type { Request, Response } from "express";
import { digestPersonaPortrait } from "../persona/digest.js";
import {
  loadPersonaDigestState,
  recordPersonaDigestResult,
} from "../persona/digestState.js";
import {
  createPersonaEntry,
  deletePersonaEntry,
  ensurePersonaDirs,
  getPersonaEntry,
  loadAllPersonaEntries,
  loadPersonaCategory,
  updatePersonaEntry,
} from "../persona/store.js";
import {
  PERSONA_CATEGORIES,
  PERSONA_CATEGORY_LABELS,
  isPersonaCategory,
  type PersonaCategory,
} from "../persona/types.js";

export function listPersonaHandler(_req: Request, res: Response): void {
  ensurePersonaDirs();
  const byCategory = Object.fromEntries(
    PERSONA_CATEGORIES.map((c) => [c, loadPersonaCategory(c)])
  );
  const digest = loadPersonaDigestState();
  res.json({
    categories: PERSONA_CATEGORIES.map((id) => ({
      id,
      label: PERSONA_CATEGORY_LABELS[id],
    })),
    byCategory,
    entries: loadAllPersonaEntries(),
    lastDigest: digest.lastResult || null,
    lastRunAt: digest.lastRunAt,
    nextRunAt: digest.nextRunAt,
  });
}

export function listPersonaCategoryHandler(req: Request, res: Response): void {
  const cat = req.params.category;
  if (!isPersonaCategory(cat)) {
    res.status(400).json({ error: "未知目录" });
    return;
  }
  res.json({
    category: cat,
    label: PERSONA_CATEGORY_LABELS[cat],
    entries: loadPersonaCategory(cat),
  });
}

export function createPersonaEntryHandler(req: Request, res: Response): void {
  try {
    const cat = req.params.category;
    if (!isPersonaCategory(cat)) {
      res.status(400).json({ error: "未知目录" });
      return;
    }
    const { content, evidence } = req.body as { content?: string; evidence?: string };
    const entry = createPersonaEntry(cat, {
      content: String(content || ""),
      evidence: evidence != null ? String(evidence) : "",
    });
    res.json({ entry });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "创建失败" });
  }
}

export function updatePersonaEntryHandler(req: Request, res: Response): void {
  try {
    const cat = req.params.category;
    const id = req.params.id;
    if (!isPersonaCategory(cat)) {
      res.status(400).json({ error: "未知目录" });
      return;
    }
    const { content, evidence, category } = req.body as {
      content?: string;
      evidence?: string;
      category?: PersonaCategory;
    };
    if (category != null && !isPersonaCategory(category)) {
      res.status(400).json({ error: "目标目录无效" });
      return;
    }
    const entry = updatePersonaEntry(cat, id, { content, evidence, category });
    if (!entry) {
      res.status(404).json({ error: "条目不存在" });
      return;
    }
    res.json({ entry });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "更新失败" });
  }
}

export function deletePersonaEntryHandler(req: Request, res: Response): void {
  const cat = req.params.category;
  const id = req.params.id;
  if (!isPersonaCategory(cat)) {
    res.status(400).json({ error: "未知目录" });
    return;
  }
  if (!getPersonaEntry(cat, id)) {
    res.status(404).json({ error: "条目不存在" });
    return;
  }
  deletePersonaEntry(cat, id);
  res.json({ ok: true });
}

export async function digestPersonaHandler(_req: Request, res: Response): Promise<void> {
  try {
    const result = await digestPersonaPortrait({ manual: true });
    const lastDigest = recordPersonaDigestResult({
      wrote: result.wrote,
      reason: result.reason,
      source: "manual",
    });
    res.json({
      wrote: result.wrote,
      observations: result.observations,
      dialogueChars: result.dialogueChars,
      reason: result.reason,
      lastDigest,
      byCategory: Object.fromEntries(
        PERSONA_CATEGORIES.map((c) => [c, loadPersonaCategory(c)])
      ),
    });
  } catch (err) {
    console.error("[persona] 立刻整理失败:", err instanceof Error ? err.message : err);
    res.status(500).json({
      error: err instanceof Error ? err.message : "整理失败",
    });
  }
}
