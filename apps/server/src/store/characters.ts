import fs from "fs";
import path from "path";
import crypto from "crypto";
import { CHARACTERS_DIR, ensureDataDir } from "../config.js";
import type { CharacterData, ParsedCharacterCard } from "../characterCard.js";
import { DEFAULT_CHARACTER_PRESET, normalizePreset, type CharacterPreset } from "../characterPreset.js";

export interface StoredCharacter {
  id: string;
  createdAt: string;
  updatedAt: string;
  spec: string;
  avatarPath?: string;
  data: CharacterData;
  /** 角色绑定的聊天预设（仿 ST） */
  preset?: CharacterPreset;
}

function charPath(id: string): string {
  return path.join(CHARACTERS_DIR, `${id}.json`);
}

export function listCharacters(): StoredCharacter[] {
  ensureDataDir();
  if (!fs.existsSync(CHARACTERS_DIR)) return [];
  return fs
    .readdirSync(CHARACTERS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJsonFile<StoredCharacter>(path.join(CHARACTERS_DIR, f), null as unknown as StoredCharacter))
    .filter(Boolean)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getCharacter(id: string): StoredCharacter | null {
  const file = charPath(id);
  if (!fs.existsSync(file)) return null;
  const char = readJsonFile<StoredCharacter>(file, null as unknown as StoredCharacter);
  if (char) char.preset = normalizePreset(char.preset);
  return char;
}

export function getPrimaryCharacter(): StoredCharacter | null {
  const list = listCharacters();
  return list[0] ?? null;
}

export function importOrReplacePrimaryCharacter(
  card: ParsedCharacterCard,
  avatarBuffer?: Buffer,
  avatarExt?: string
): StoredCharacter {
  const existing = getPrimaryCharacter();
  if (!existing) {
    return saveCharacterFromCard(card, avatarBuffer, avatarExt);
  }

  const now = new Date().toISOString();
  let avatarPath = existing.avatarPath;

  if (avatarBuffer && avatarExt) {
    const avatarsDir = path.join(CHARACTERS_DIR, "avatars");
    if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });
    if (existing.avatarPath) {
      const oldPath = path.join(CHARACTERS_DIR, existing.avatarPath);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
    }
    avatarPath = path.join("avatars", `${existing.id}${avatarExt}`);
    fs.writeFileSync(path.join(CHARACTERS_DIR, avatarPath), avatarBuffer);
  }

  const updated: StoredCharacter = {
    ...existing,
    updatedAt: now,
    spec: card.spec,
    avatarPath,
    data: card.data,
    preset: existing.preset ?? { ...DEFAULT_CHARACTER_PRESET },
  };

  fs.writeFileSync(charPath(existing.id), JSON.stringify(updated, null, 2), "utf-8");
  return updated;
}

export function saveCharacterFromCard(
  card: ParsedCharacterCard,
  avatarBuffer?: Buffer,
  avatarExt?: string
): StoredCharacter {
  ensureDataDir();
  if (!fs.existsSync(CHARACTERS_DIR)) fs.mkdirSync(CHARACTERS_DIR, { recursive: true });

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  let avatarPath: string | undefined;

  if (avatarBuffer && avatarExt) {
    const avatarsDir = path.join(CHARACTERS_DIR, "avatars");
    if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });
    avatarPath = path.join("avatars", `${id}${avatarExt}`);
    fs.writeFileSync(path.join(CHARACTERS_DIR, avatarPath), avatarBuffer);
  }

  const character: StoredCharacter = {
    id,
    createdAt: now,
    updatedAt: now,
    spec: card.spec,
    avatarPath,
    data: card.data,
    preset: { ...DEFAULT_CHARACTER_PRESET },
  };

  fs.writeFileSync(charPath(id), JSON.stringify(character, null, 2), "utf-8");
  return character;
}

export function saveCharacterAvatar(
  id: string,
  buffer: Buffer,
  ext: string
): StoredCharacter | null {
  const char = getCharacter(id);
  if (!char) return null;

  const avatarsDir = path.join(CHARACTERS_DIR, "avatars");
  if (!fs.existsSync(avatarsDir)) fs.mkdirSync(avatarsDir, { recursive: true });

  if (char.avatarPath) {
    const oldPath = path.join(CHARACTERS_DIR, char.avatarPath);
    if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
  }

  const normalizedExt = ext.startsWith(".") ? ext : `.${ext}`;
  char.avatarPath = path.join("avatars", `${id}${normalizedExt}`);
  fs.writeFileSync(path.join(CHARACTERS_DIR, char.avatarPath), buffer);
  char.updatedAt = new Date().toISOString();
  fs.writeFileSync(charPath(id), JSON.stringify(char, null, 2), "utf-8");
  return char;
}

export function updateCharacter(
  id: string,
  patch: { data?: Partial<CharacterData>; preset?: Partial<CharacterPreset> }
): StoredCharacter | null {
  const char = getCharacter(id);
  if (!char) return null;
  if (patch.data) {
    char.data = { ...char.data, ...patch.data };
  }
  if (patch.preset) {
    char.preset = normalizePreset({ ...char.preset, ...patch.preset });
  }
  char.updatedAt = new Date().toISOString();
  fs.writeFileSync(charPath(id), JSON.stringify(char, null, 2), "utf-8");
  return char;
}

export function deleteCharacter(id: string): boolean {
  const file = charPath(id);
  if (!fs.existsSync(file)) return false;
  const char = getCharacter(id);
  fs.unlinkSync(file);
  if (char?.avatarPath) {
    const av = path.join(CHARACTERS_DIR, char.avatarPath);
    if (fs.existsSync(av)) fs.unlinkSync(av);
  }
  return true;
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}
