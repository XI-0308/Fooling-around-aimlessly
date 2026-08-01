import fs from "fs";
import path from "path";
import crypto from "crypto";
import { WORLD_INFO_DIR, ensureDataDir } from "../config.js";
import { parseKeysInput } from "../triggerMatch.js";
import {
  DEFAULT_WORLD_INFO_BOOK,
  type WorldInfoBook,
  type WorldInfoEntry,
  mapStPosition,
} from "./types.js";

const BOOK_PATH = path.join(WORLD_INFO_DIR, "default.json");

export function loadWorldInfoBook(): WorldInfoBook {
  ensureDataDir();
  if (!fs.existsSync(BOOK_PATH)) {
    return { ...DEFAULT_WORLD_INFO_BOOK, entries: [] };
  }
  try {
    return { ...DEFAULT_WORLD_INFO_BOOK, ...JSON.parse(fs.readFileSync(BOOK_PATH, "utf-8")) };
  } catch {
    return { ...DEFAULT_WORLD_INFO_BOOK, entries: [] };
  }
}

export function saveWorldInfoBook(book: WorldInfoBook): void {
  ensureDataDir();
  if (!fs.existsSync(WORLD_INFO_DIR)) fs.mkdirSync(WORLD_INFO_DIR, { recursive: true });
  fs.writeFileSync(BOOK_PATH, JSON.stringify(book, null, 2), "utf-8");
}

export function upsertEntry(entry: WorldInfoEntry): WorldInfoBook {
  const book = loadWorldInfoBook();
  const normalized = { ...entry };
  if (normalized.position === "at_depth") {
    normalized.position = "after_char_defs";
  }
  const idx = book.entries.findIndex((e) => e.id === normalized.id);
  if (idx >= 0) book.entries[idx] = normalized;
  else book.entries.push(normalized);
  saveWorldInfoBook(book);
  return book;
}

export function deleteEntry(id: string): WorldInfoBook {
  const book = loadWorldInfoBook();
  book.entries = book.entries.filter((e) => e.id !== id);
  saveWorldInfoBook(book);
  return book;
}

export function updateBookSettings(
  partial: Partial<Omit<WorldInfoBook, "id" | "entries">>
): WorldInfoBook {
  const book = loadWorldInfoBook();
  Object.assign(book, partial);
  saveWorldInfoBook(book);
  return book;
}

/** 导入 SillyTavern 世界书 JSON */
export function importStWorldInfo(raw: unknown): WorldInfoBook {
  const book = loadWorldInfoBook();
  const obj = raw as Record<string, unknown>;
  const entriesObj = (obj.entries || obj) as Record<string, Record<string, unknown>>;

  const imported: WorldInfoEntry[] = [];

  for (const key of Object.keys(entriesObj)) {
    const e = entriesObj[key];
    if (!e || typeof e !== "object") continue;

    const keysRaw = e.key ?? e.keys ?? [];
    const keys = flattenImportedKeys(keysRaw);

    const secRaw = e.keysecondary ?? e.secondary_keys ?? [];
    const secondaryKeys = flattenImportedKeys(secRaw);

    imported.push({
      id: crypto.randomUUID(),
      memo: String(e.comment ?? e.name ?? keys[0] ?? "导入条目"),
      keys,
      secondaryKeys,
      selectiveLogic: mapSelectiveLogic(Number(e.selectiveLogic ?? 0)),
      content: String(e.content ?? ""),
      order: Number(e.order ?? e.insertion_order ?? 100),
      position: mapStPosition(Number(e.position ?? e.insertion_position ?? 1)),
      depth: Number(e.depth ?? 0),
      depthRole: mapDepthRole(Number(e.role ?? 0)),
      constant: Boolean(e.constant),
      enabled: !Boolean(e.disable),
      nonRecursable: Boolean(e.excludeRecursion ?? e.nonRecursable ?? false),
      probability: Number(e.probability ?? e.triggerprobability ?? 100),
      scanDepth: Number(e.scanDepth ?? 0),
    });
  }

  book.entries = [...book.entries, ...imported];
  saveWorldInfoBook(book);
  return book;
}

function flattenImportedKeys(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw.map(String) : parseKeysInput(String(raw ?? ""));
  return [...new Set(list.flatMap((k) => parseKeysInput(k)))];
}

function mapSelectiveLogic(n: number): WorldInfoEntry["selectiveLogic"] {
  switch (n) {
    case 1:
      return "and_all";
    case 2:
      return "not_any";
    case 3:
      return "not_all";
    default:
      return "and_any";
  }
}

function mapDepthRole(n: number): WorldInfoEntry["depthRole"] {
  if (n === 1) return "user";
  if (n === 2) return "assistant";
  return "system";
}

export function newEmptyEntry(): WorldInfoEntry {
  return {
    id: crypto.randomUUID(),
    memo: "",
    keys: [],
    secondaryKeys: [],
    selectiveLogic: "and_any",
    content: "",
    order: 100,
    position: "after_char_defs",
    depth: 0,
    depthRole: "system",
    constant: false,
    enabled: true,
    nonRecursable: false,
    probability: 100,
    scanDepth: 0,
  };
}
