import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PERSONA_DIR, ensureDataDir } from "../config.js";
import {
  PERSONA_CATEGORIES,
  isPersonaCategory,
  type PersonaCategory,
  type PersonaEntry,
} from "./types.js";

export { PERSONA_DIR };


function categoryDir(category: PersonaCategory): string {
  return path.join(PERSONA_DIR, category);
}

function entriesPath(category: PersonaCategory): string {
  return path.join(categoryDir(category), "entries.json");
}

export function ensurePersonaDirs(): void {
  ensureDataDir();
  if (!fs.existsSync(PERSONA_DIR)) fs.mkdirSync(PERSONA_DIR, { recursive: true });
  for (const cat of PERSONA_CATEGORIES) {
    const dir = categoryDir(cat);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const file = entriesPath(cat);
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, "[]", "utf-8");
    }
  }
}

export function loadPersonaCategory(category: PersonaCategory): PersonaEntry[] {
  ensurePersonaDirs();
  try {
    const raw = JSON.parse(fs.readFileSync(entriesPath(category), "utf-8")) as PersonaEntry[];
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

export function savePersonaCategory(category: PersonaCategory, entries: PersonaEntry[]): void {
  ensurePersonaDirs();
  fs.writeFileSync(entriesPath(category), JSON.stringify(entries, null, 2), "utf-8");
}

export function loadAllPersonaEntries(): PersonaEntry[] {
  return PERSONA_CATEGORIES.flatMap((c) => loadPersonaCategory(c));
}

export function getPersonaEntry(
  category: PersonaCategory,
  id: string
): PersonaEntry | null {
  return loadPersonaCategory(category).find((e) => e.id === id) || null;
}

export function createPersonaEntry(
  category: PersonaCategory,
  patch: { content: string; evidence?: string }
): PersonaEntry {
  const content = patch.content.trim();
  if (!content) throw new Error("条目内容不能为空");
  const now = new Date().toISOString();
  const entry: PersonaEntry = {
    id: crypto.randomUUID(),
    category,
    content,
    evidence: (patch.evidence || "").trim(),
    createdAt: now,
    updatedAt: now,
  };
  const list = loadPersonaCategory(category);
  list.push(entry);
  savePersonaCategory(category, list);
  return entry;
}

export function updatePersonaEntry(
  category: PersonaCategory,
  id: string,
  patch: { content?: string; evidence?: string; category?: PersonaCategory }
): PersonaEntry | null {
  const fromCat = category;
  const list = loadPersonaCategory(fromCat);
  const idx = list.findIndex((e) => e.id === id);
  if (idx < 0) return null;

  const now = new Date().toISOString();
  const entry = { ...list[idx] };
  if (typeof patch.content === "string") {
    const t = patch.content.trim();
    if (!t) throw new Error("条目内容不能为空");
    entry.content = t;
  }
  if (typeof patch.evidence === "string") entry.evidence = patch.evidence.trim();
  entry.updatedAt = now;

  const toCat = patch.category && isPersonaCategory(patch.category) ? patch.category : fromCat;
  if (toCat !== fromCat) {
    list.splice(idx, 1);
    savePersonaCategory(fromCat, list);
    entry.category = toCat;
    const dest = loadPersonaCategory(toCat);
    dest.push(entry);
    savePersonaCategory(toCat, dest);
  } else {
    list[idx] = entry;
    savePersonaCategory(fromCat, list);
  }
  return entry;
}

/** 合并证据：追加新证，不覆盖旧证；完全重复则跳过 */
export function mergePersonaEvidence(oldEvidence: string, newEvidence: string): string {
  const a = (oldEvidence || "").trim();
  const b = (newEvidence || "").trim();
  if (!b) return a;
  if (!a) return b;
  if (a.includes(b)) return a;
  if (b.includes(a)) return b;
  return `${a}\n---\n${b}`;
}

/** 角色侧：增量或合并更新（同 category 近似则更新旧条；证据追加） */
export function upsertPersonaEntry(
  category: PersonaCategory,
  content: string,
  evidence: string,
  similarToId?: string
): PersonaEntry {
  const now = new Date().toISOString();
  const list = loadPersonaCategory(category);
  if (similarToId) {
    const idx = list.findIndex((e) => e.id === similarToId);
    if (idx >= 0) {
      list[idx] = {
        ...list[idx],
        content: content.trim() || list[idx].content,
        evidence: mergePersonaEvidence(list[idx].evidence, evidence),
        updatedAt: now,
      };
      savePersonaCategory(category, list);
      return list[idx];
    }
  }
  const entry: PersonaEntry = {
    id: crypto.randomUUID(),
    category,
    content: content.trim(),
    evidence: evidence.trim(),
    createdAt: now,
    updatedAt: now,
  };
  list.push(entry);
  savePersonaCategory(category, list);
  return entry;
}

export function deletePersonaEntry(category: PersonaCategory, id: string): boolean {
  const list = loadPersonaCategory(category);
  const next = list.filter((e) => e.id !== id);
  if (next.length === list.length) return false;
  savePersonaCategory(category, next);
  return true;
}
