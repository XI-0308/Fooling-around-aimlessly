import fs from "fs";
import path from "path";
import type { Archiver } from "archiver";
import {
  ACTIVITY_DIR,
  CHARACTERS_DIR,
  CHATS_DIR,
  DATA_DIR,
  LEANN_DIR,
  MEMORY_DIR,
  PERSONA_DIR,
  SETTINGS_PATH,
  WORLD_INFO_DIR,
  loadSettings,
} from "../config.js";

import {
  API_CONNECTION_KEYS,
  BACKUP_FORMAT,
  BACKUP_VERSION,
  GENERATION_SYSTEM_KEYS,
  PACKAGE_DEFINITIONS,
  type BackupManifest,
  type BackupPackageId,
  type PackageMeta,
  PACKAGE_FORMAT,
} from "./manifest.js";
import { appendDirIfExists, appendFileIfExists, bufferFromArchive } from "./zipUtil.js";
import {
  chatThemeDirHasContent,
  THEME_DIR,
  type BrowserThemeSnapshot,
} from "../store/chatThemeStore.js";

const USER_PERSONA_PATH = path.join(DATA_DIR, "user-persona.json");
const USER_DIR = path.join(DATA_DIR, "user");
const OBSIDIAN_STATE_PATH = path.join(DATA_DIR, "obsidian-state.json");
const PROACTIVE_STATE_PATH = path.join(DATA_DIR, "proactive-state.json");

export interface ExportOptions {
  includeApiKeys: boolean;
  browserTheme?: BrowserThemeSnapshot | null;
}

function pickSettingsKeys(
  settings: Record<string, unknown>,
  keys: readonly string[]
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (settings[key] !== undefined) out[key] = settings[key];
  }
  return out;
}

function buildPackageMeta(id: BackupPackageId, label: string): PackageMeta {
  return {
    format: PACKAGE_FORMAT,
    version: BACKUP_VERSION,
    id,
    label,
    createdAt: new Date().toISOString(),
  };
}

async function buildMemoryPackage(): Promise<Buffer> {
  return bufferFromArchive((archive) => {
    const def = PACKAGE_DEFINITIONS.find((p) => p.id === "memory")!;
    archive.append(JSON.stringify(buildPackageMeta(def.id, def.label), null, 2), {
      name: "package-meta.json",
    });
    appendFileIfExists(archive, path.join(MEMORY_DIR, "chunks.json"), "memory/chunks.json");
    appendFileIfExists(
      archive,
      path.join(MEMORY_DIR, "coread-books.json"),
      "memory/coread-books.json"
    );
    appendFileIfExists(
      archive,
      path.join(MEMORY_DIR, "coread-digest-state.json"),
      "memory/coread-digest-state.json"
    );
    appendFileIfExists(archive, path.join(MEMORY_DIR, "feedback.json"), "memory/feedback.json");
    appendDirIfExists(archive, ACTIVITY_DIR, "activity");
    // LEANN 可能在 ProgramData（中文用户名路径规避），不在 data/ 下
    appendDirIfExists(archive, LEANN_DIR, "leann");
  });
}

async function buildWorldinfoPackage(): Promise<Buffer> {
  return bufferFromArchive((archive) => {
    const def = PACKAGE_DEFINITIONS.find((p) => p.id === "worldinfo")!;
    archive.append(JSON.stringify(buildPackageMeta(def.id, def.label), null, 2), {
      name: "package-meta.json",
    });
    appendDirIfExists(archive, WORLD_INFO_DIR, "worldinfo");
  });
}

async function buildChatsPackage(): Promise<Buffer> {
  return bufferFromArchive((archive) => {
    const def = PACKAGE_DEFINITIONS.find((p) => p.id === "chats")!;
    archive.append(JSON.stringify(buildPackageMeta(def.id, def.label), null, 2), {
      name: "package-meta.json",
    });
    if (!fs.existsSync(CHATS_DIR)) return;
    for (const name of fs.readdirSync(CHATS_DIR)) {
      const full = path.join(CHATS_DIR, name);
      const stat = fs.statSync(full);
      if (stat.isFile() && name.endsWith(".json")) {
        archive.file(full, { name: `chats/${name}` });
      }
    }
    appendDirIfExists(archive, path.join(CHATS_DIR, "attachments"), "chats/attachments");
  });
}

async function buildProfilePackage(): Promise<Buffer> {
  return bufferFromArchive((archive) => {
    const def = PACKAGE_DEFINITIONS.find((p) => p.id === "profile")!;
    archive.append(JSON.stringify(buildPackageMeta(def.id, def.label), null, 2), {
      name: "package-meta.json",
    });
    if (fs.existsSync(CHARACTERS_DIR)) {
      for (const name of fs.readdirSync(CHARACTERS_DIR)) {
        const full = path.join(CHARACTERS_DIR, name);
        if (fs.statSync(full).isFile()) {
          archive.file(full, { name: `characters/${name}` });
        }
      }
      appendDirIfExists(archive, path.join(CHARACTERS_DIR, "avatars"), "characters/avatars");
    }
    appendFileIfExists(archive, USER_PERSONA_PATH, "user-persona.json");
    appendDirIfExists(archive, USER_DIR, "user");
    appendDirIfExists(archive, PERSONA_DIR, "persona");
  });
}


async function buildDecoratePackage(browserTheme?: BrowserThemeSnapshot | null): Promise<Buffer | null> {
  const hasServerTheme = chatThemeDirHasContent();
  const hasBrowserTheme = Boolean(browserTheme?.theme);
  if (!hasServerTheme && !hasBrowserTheme) return null;

  return bufferFromArchive((archive) => {
    const def = PACKAGE_DEFINITIONS.find((p) => p.id === "decorate")!;
    archive.append(JSON.stringify(buildPackageMeta(def.id, def.label), null, 2), {
      name: "package-meta.json",
    });
    appendDirIfExists(archive, THEME_DIR, "chat-theme");
    if (browserTheme) {
      archive.append(JSON.stringify(browserTheme, null, 2), { name: "browser-theme.json" });
    }
  });
}

async function buildApiConnectionsPackage(): Promise<Buffer> {
  const settings = loadSettings() as unknown as Record<string, unknown>;
  const payload = pickSettingsKeys(settings, API_CONNECTION_KEYS);
  return bufferFromArchive((archive) => {
    const def = PACKAGE_DEFINITIONS.find((p) => p.id === "api-connections")!;
    archive.append(JSON.stringify(buildPackageMeta(def.id, def.label), null, 2), {
      name: "package-meta.json",
    });
    archive.append(JSON.stringify(payload, null, 2), { name: "settings-api.json" });
  });
}

async function buildGenerationSystemPackage(): Promise<Buffer> {
  const settings = loadSettings() as unknown as Record<string, unknown>;
  const payload = pickSettingsKeys(settings, GENERATION_SYSTEM_KEYS);
  return bufferFromArchive((archive) => {
    const def = PACKAGE_DEFINITIONS.find((p) => p.id === "generation-system")!;
    archive.append(JSON.stringify(buildPackageMeta(def.id, def.label), null, 2), {
      name: "package-meta.json",
    });
    archive.append(JSON.stringify(payload, null, 2), { name: "settings-generation.json" });
    appendFileIfExists(archive, OBSIDIAN_STATE_PATH, "obsidian-state.json");
    appendFileIfExists(archive, PROACTIVE_STATE_PATH, "proactive-state.json");
  });
}

const PACKAGE_BUILDERS: Record<
  BackupPackageId,
  (options: ExportOptions) => Promise<Buffer | null>
> = {
  memory: async () => buildMemoryPackage(),
  worldinfo: async () => buildWorldinfoPackage(),
  chats: async () => buildChatsPackage(),
  profile: async () => buildProfilePackage(),
  "api-connections": async (options) =>
    options.includeApiKeys ? buildApiConnectionsPackage() : null,
  "generation-system": async () => buildGenerationSystemPackage(),
  decorate: async (options) => buildDecoratePackage(options.browserTheme),
};

export interface ExportResult {
  filename: string;
  buffer: Buffer;
  manifest: BackupManifest;
}

async function collectPackageBuffers(options: ExportOptions): Promise<Partial<Record<BackupPackageId, Buffer>>> {
  const packageBuffers: Partial<Record<BackupPackageId, Buffer>> = {};
  for (const def of PACKAGE_DEFINITIONS) {
    const buf = await PACKAGE_BUILDERS[def.id](options);
    if (buf) packageBuffers[def.id] = buf;
  }
  return packageBuffers;
}

export async function createFullBackup(options: ExportOptions): Promise<ExportResult> {
  const createdAt = new Date().toISOString();
  const dateSlug = createdAt.slice(0, 10);
  const filename = `rp-agent-backup-${dateSlug}.zip`;
  const packageBuffers = await collectPackageBuffers(options);

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt,
    appVersion: "0.4.0",
    includeApiKeys: options.includeApiKeys,
    packages: PACKAGE_DEFINITIONS.map((def) => ({
      id: def.id,
      filename: def.filename,
      label: def.label,
      category: def.category,
      description: def.description,
      importOrder: def.importOrder,
      included: Boolean(packageBuffers[def.id]),
    })),
  };

  const buffer = await bufferFromArchive((archive) => {
    archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
    for (const def of PACKAGE_DEFINITIONS) {
      const buf = packageBuffers[def.id];
      if (buf) archive.append(buf, { name: def.filename });
    }
  });

  return { filename, buffer, manifest };
}

export async function createSinglePackage(
  id: BackupPackageId,
  options: ExportOptions
): Promise<{ filename: string; buffer: Buffer } | null> {
  const buf = await PACKAGE_BUILDERS[id](options);
  if (!buf) return null;
  const def = PACKAGE_DEFINITIONS.find((p) => p.id === id)!;
  return { filename: def.filename, buffer: buf };
}

/** 流式写入 response（供 GET/POST 下载） */
export async function pipeFullBackupToArchive(
  archive: Archiver,
  options: ExportOptions
): Promise<BackupManifest> {
  const createdAt = new Date().toISOString();
  const packageBuffers = await collectPackageBuffers(options);

  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt,
    appVersion: "0.4.0",
    includeApiKeys: options.includeApiKeys,
    packages: PACKAGE_DEFINITIONS.map((def) => ({
      id: def.id,
      filename: def.filename,
      label: def.label,
      category: def.category,
      description: def.description,
      importOrder: def.importOrder,
      included: Boolean(packageBuffers[def.id]),
    })),
  };

  archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
  for (const def of PACKAGE_DEFINITIONS) {
    const buf = packageBuffers[def.id];
    if (buf) archive.append(buf, { name: def.filename });
  }

  return manifest;
}

/** 供测试/调试：确认 settings 路径可读 */
export function settingsPathExists(): boolean {
  return fs.existsSync(SETTINGS_PATH);
}
