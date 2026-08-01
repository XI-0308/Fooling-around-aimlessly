import fs from "fs";
import path from "path";
import { DATA_DIR, ensureDataDir } from "../config.js";

export interface UserPersona {
  name: string;
  description: string;
  avatarPath?: string;
}

const PERSONA_PATH = path.join(DATA_DIR, "user-persona.json");
const USER_DIR = path.join(DATA_DIR, "user");

const DEFAULT_PERSONA: UserPersona = {
  name: "用户",
  description: "",
};

export function loadUserPersona(): UserPersona {
  ensureDataDir();
  if (!fs.existsSync(PERSONA_PATH)) return { ...DEFAULT_PERSONA };
  try {
    return { ...DEFAULT_PERSONA, ...JSON.parse(fs.readFileSync(PERSONA_PATH, "utf-8")) };
  } catch {
    return { ...DEFAULT_PERSONA };
  }
}

export function saveUserPersona(persona: UserPersona): UserPersona {
  ensureDataDir();
  if (!fs.existsSync(USER_DIR)) fs.mkdirSync(USER_DIR, { recursive: true });
  fs.writeFileSync(PERSONA_PATH, JSON.stringify(persona, null, 2), "utf-8");
  return persona;
}

export function saveUserAvatar(buffer: Buffer, ext: string): string {
  ensureDataDir();
  if (!fs.existsSync(USER_DIR)) fs.mkdirSync(USER_DIR, { recursive: true });
  const avatarPath = `avatar${ext}`;
  fs.writeFileSync(path.join(USER_DIR, avatarPath), buffer);
  const persona = loadUserPersona();
  persona.avatarPath = avatarPath;
  saveUserPersona(persona);
  return avatarPath;
}

export function getUserAvatarFile(): string | null {
  const persona = loadUserPersona();
  if (!persona.avatarPath) return null;
  const file = path.join(USER_DIR, persona.avatarPath);
  return fs.existsSync(file) ? file : null;
}
