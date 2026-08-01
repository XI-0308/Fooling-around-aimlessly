import fs from "fs";
import path from "path";
import unzipper from "unzipper";
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
  ensureDataDir,
  loadSettings,
  saveSettings,
} from "../config.js";

import type { AppSettings } from "../config.js";
import {
  BACKUP_FORMAT,
  PACKAGE_FORMAT,
  PACKAGE_DEFINITIONS,
  type BackupManifest,
  type BackupPackageId,
  type PackageMeta,
} from "./manifest.js";
import { createPreImportSnapshot } from "./snapshot.js";
import {
  extractZipBuffer,
  listZipEntries,
  readZipEntryText,
  replaceDirContents,
} from "./zipUtil.js";
import {
  saveBrowserThemeBackup,
  THEME_DIR,
  chatThemeDirHasContent,
  type BrowserThemeSnapshot,
} from "../store/chatThemeStore.js";

const USER_PERSONA_PATH = path.join(DATA_DIR, "user-persona.json");
const USER_DIR = path.join(DATA_DIR, "user");
const OBSIDIAN_STATE_PATH = path.join(DATA_DIR, "obsidian-state.json");
const PROACTIVE_STATE_PATH = path.join(DATA_DIR, "proactive-state.json");

function copyFileIfPresent(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.copyFileSync(src, dest);
}

export interface ImportPreviewPackage {
  id: BackupPackageId;
  label: string;
  category: "soul" | "settings";
  description: string;
  importOrder: number;
  filename: string;
  available: boolean;
}

export interface ImportPreview {
  kind: "bundle" | "single";
  manifest?: BackupManifest;
  packages: ImportPreviewPackage[];
  bundleCreatedAt?: string;
  includeApiKeys?: boolean;
}

export interface ImportResult {
  snapshotName: string;
  imported: BackupPackageId[];
  skipped: BackupPackageId[];
  messages: string[];
}

async function readPackageMeta(buffer: Buffer): Promise<PackageMeta | null> {
  const text = await readZipEntryText(buffer, "package-meta.json");
  if (!text) return null;
  try {
    const meta = JSON.parse(text) as PackageMeta;
    if (meta.format !== PACKAGE_FORMAT) return null;
    return meta;
  } catch {
    return null;
  }
}

async function detectUpload(buffer: Buffer): Promise<{
  kind: "bundle" | "single";
  manifest?: BackupManifest;
  singleMeta?: PackageMeta;
  packageBuffers: Map<BackupPackageId, Buffer>;
}> {
  const entries = await listZipEntries(buffer);
  const hasManifest = entries.some((e) => e === "manifest.json" || e.endsWith("/manifest.json"));

  const packageBuffers = new Map<BackupPackageId, Buffer>();

  if (hasManifest) {
    const manifestText = await readZipEntryText(buffer, "manifest.json");
    if (!manifestText) throw new Error("备份包内 manifest.json 无法读取");
    const manifest = JSON.parse(manifestText) as BackupManifest;
    if (manifest.format !== BACKUP_FORMAT) {
      throw new Error("不是 RP-Agent 备份格式");
    }

    const directory = await unzipper.Open.buffer(buffer);
    for (const pkg of manifest.packages.filter((p) => p.included)) {
      const file = directory.files.find((f) => f.path === pkg.filename);
      if (file) {
        packageBuffers.set(pkg.id, await file.buffer());
      }
    }
    return { kind: "bundle", manifest, packageBuffers };
  }

  const meta = await readPackageMeta(buffer);
  if (meta) {
    packageBuffers.set(meta.id, buffer);
    return { kind: "single", singleMeta: meta, packageBuffers };
  }

  throw new Error("无法识别备份文件，请上传 RP-Agent 导出的 zip 或分包 zip");
}

export async function previewImport(buffer: Buffer): Promise<ImportPreview> {
  const detected = await detectUpload(buffer);

  if (detected.kind === "bundle" && detected.manifest) {
    const manifest = detected.manifest;
    return {
      kind: "bundle",
      manifest,
      bundleCreatedAt: manifest.createdAt,
      includeApiKeys: manifest.includeApiKeys,
      packages: manifest.packages.map((p) => ({
        id: p.id,
        label: p.label,
        category: p.category,
        description: p.description,
        importOrder: p.importOrder,
        filename: p.filename,
        available: detected.packageBuffers.has(p.id),
      })),
    };
  }

  const meta = detected.singleMeta!;
  const def = PACKAGE_DEFINITIONS.find((p) => p.id === meta.id)!;
  return {
    kind: "single",
    packages: PACKAGE_DEFINITIONS.map((p) => ({
      id: p.id,
      label: p.label,
      category: p.category,
      description: p.description,
      importOrder: p.importOrder,
      filename: p.filename,
      available: p.id === meta.id,
    })),
  };
}

function applyProfileFromExtract(extractRoot: string): void {
  ensureDataDir();
  const srcChars = path.join(extractRoot, "characters");
  if (fs.existsSync(srcChars)) {
    replaceDirContents(srcChars, CHARACTERS_DIR);
  }
  const personaSrc = path.join(extractRoot, "user-persona.json");
  if (fs.existsSync(personaSrc)) {
    fs.copyFileSync(personaSrc, USER_PERSONA_PATH);
  }
  const userSrc = path.join(extractRoot, "user");
  if (fs.existsSync(userSrc)) {
    replaceDirContents(userSrc, USER_DIR);
  }
  const portraitSrc = path.join(extractRoot, "persona");
  if (fs.existsSync(portraitSrc)) {
    replaceDirContents(portraitSrc, PERSONA_DIR);
  }
}


function applyChatsFromExtract(extractRoot: string): void {
  ensureDataDir();
  if (!fs.existsSync(CHATS_DIR)) fs.mkdirSync(CHATS_DIR, { recursive: true });

  for (const name of fs.readdirSync(CHATS_DIR)) {
    const full = path.join(CHATS_DIR, name);
    if (fs.statSync(full).isFile() && name.endsWith(".json")) {
      fs.unlinkSync(full);
    }
  }
  const attDir = path.join(CHATS_DIR, "attachments");
  if (fs.existsSync(attDir)) fs.rmSync(attDir, { recursive: true, force: true });

  const srcChats = path.join(extractRoot, "chats");
  if (!fs.existsSync(srcChats)) return;

  for (const name of fs.readdirSync(srcChats)) {
    const from = path.join(srcChats, name);
    const to = path.join(CHATS_DIR, name);
    if (fs.statSync(from).isDirectory()) {
      replaceDirContents(from, to);
    } else if (name.endsWith(".json")) {
      fs.copyFileSync(from, to);
    }
  }
}

function applyWorldinfoFromExtract(extractRoot: string): void {
  ensureDataDir();
  const src = path.join(extractRoot, "worldinfo");
  if (fs.existsSync(src)) {
    replaceDirContents(src, WORLD_INFO_DIR);
  }
}

function applyMemoryFromExtract(extractRoot: string): void {
  ensureDataDir();
  if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true });

  copyFileIfPresent(
    path.join(extractRoot, "memory", "chunks.json"),
    path.join(MEMORY_DIR, "chunks.json")
  );
  copyFileIfPresent(
    path.join(extractRoot, "memory", "coread-books.json"),
    path.join(MEMORY_DIR, "coread-books.json")
  );
  copyFileIfPresent(
    path.join(extractRoot, "memory", "coread-digest-state.json"),
    path.join(MEMORY_DIR, "coread-digest-state.json")
  );
  copyFileIfPresent(
    path.join(extractRoot, "memory", "feedback.json"),
    path.join(MEMORY_DIR, "feedback.json")
  );

  const activitySrc = path.join(extractRoot, "activity");
  if (fs.existsSync(activitySrc)) {
    replaceDirContents(activitySrc, ACTIVITY_DIR);
  }

  const leannSrc = path.join(extractRoot, "leann");
  if (fs.existsSync(leannSrc)) {
    if (!fs.existsSync(LEANN_DIR)) fs.mkdirSync(LEANN_DIR, { recursive: true });
    replaceDirContents(leannSrc, LEANN_DIR);
  }
}

function applyApiConnectionsFromExtract(extractRoot: string): void {
  const src = path.join(extractRoot, "settings-api.json");
  if (!fs.existsSync(src)) return;
  const patch = JSON.parse(fs.readFileSync(src, "utf-8")) as Partial<AppSettings>;
  const current = loadSettings();
  saveSettings({ ...current, ...patch });
}

function applyGenerationSystemFromExtract(extractRoot: string): void {
  const src = path.join(extractRoot, "settings-generation.json");
  if (fs.existsSync(src)) {
    const patch = JSON.parse(fs.readFileSync(src, "utf-8")) as Partial<AppSettings>;
    const current = loadSettings();
    saveSettings({ ...current, ...patch });
  }
  ensureDataDir();
  copyFileIfPresent(path.join(extractRoot, "obsidian-state.json"), OBSIDIAN_STATE_PATH);
  copyFileIfPresent(path.join(extractRoot, "proactive-state.json"), PROACTIVE_STATE_PATH);
}

function applyDecorateFromExtract(extractRoot: string): void {
  ensureDataDir();
  if (!fs.existsSync(THEME_DIR)) fs.mkdirSync(THEME_DIR, { recursive: true });

  const srcTheme = path.join(extractRoot, "chat-theme");
  if (fs.existsSync(srcTheme)) {
    for (const name of fs.readdirSync(srcTheme)) {
      const from = path.join(srcTheme, name);
      const to = path.join(THEME_DIR, name);
      if (fs.statSync(from).isDirectory()) {
        replaceDirContents(from, to);
      } else {
        fs.copyFileSync(from, to);
      }
    }
  }

  const browserSrc = path.join(extractRoot, "browser-theme.json");
  if (fs.existsSync(browserSrc)) {
    const snapshot = JSON.parse(fs.readFileSync(browserSrc, "utf-8")) as BrowserThemeSnapshot;
    if (snapshot?.theme && typeof snapshot.theme === "object") {
      saveBrowserThemeBackup(snapshot);
    }
  }
}

const PACKAGE_APPLIERS: Record<BackupPackageId, (extractRoot: string) => void> = {
  profile: applyProfileFromExtract,
  chats: applyChatsFromExtract,
  worldinfo: applyWorldinfoFromExtract,
  memory: applyMemoryFromExtract,
  "api-connections": applyApiConnectionsFromExtract,
  "generation-system": applyGenerationSystemFromExtract,
  decorate: applyDecorateFromExtract,
};

async function applyPackageBuffer(id: BackupPackageId, buffer: Buffer): Promise<void> {
  const tmpRoot = path.join(DATA_DIR, ".backups", `.import-tmp-${Date.now()}`);
  try {
    await extractZipBuffer(buffer, tmpRoot);
    PACKAGE_APPLIERS[id](tmpRoot);
  } finally {
    if (fs.existsSync(tmpRoot)) {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  }
}

export async function runImport(
  buffer: Buffer,
  selectedIds: BackupPackageId[],
  createSnapshot = true
): Promise<ImportResult> {
  const detected = await detectUpload(buffer);
  const messages: string[] = [];
  const imported: BackupPackageId[] = [];
  const skipped: BackupPackageId[] = [];

  const ordered = [...selectedIds].sort(
    (a, b) =>
      (PACKAGE_DEFINITIONS.find((p) => p.id === a)?.importOrder ?? 99) -
      (PACKAGE_DEFINITIONS.find((p) => p.id === b)?.importOrder ?? 99)
  );

  for (const id of ordered) {
    if (!detected.packageBuffers.has(id)) {
      skipped.push(id);
      messages.push(`跳过「${PACKAGE_DEFINITIONS.find((p) => p.id === id)?.label}」：备份中无此包`);
      continue;
    }
  }

  const toImport = ordered.filter((id) => detected.packageBuffers.has(id));
  if (toImport.length === 0) {
    throw new Error("没有可导入的包，请检查所选项目");
  }

  const snapshotName = createSnapshot ? createPreImportSnapshot() : "";

  for (const id of toImport) {
    const pkgBuffer = detected.packageBuffers.get(id)!;
    await applyPackageBuffer(id, pkgBuffer);
    imported.push(id);
    messages.push(`已导入：${PACKAGE_DEFINITIONS.find((p) => p.id === id)?.label}`);
  }

  return {
    snapshotName,
    imported,
    skipped,
    messages,
  };
}

/** 列出当前 data 中各包是否有内容（供 UI 展示导出预期） */
export function getDataPresence(): Record<BackupPackageId, boolean> {
  const hasFiles = (dir: string, ext?: string) => {
    if (!fs.existsSync(dir)) return false;
    return fs.readdirSync(dir).some((n) => !ext || n.endsWith(ext));
  };

  return {
    profile:
      hasFiles(CHARACTERS_DIR, ".json") ||
      fs.existsSync(USER_PERSONA_PATH) ||
      (fs.existsSync(PERSONA_DIR) &&
        fs.readdirSync(PERSONA_DIR).some((n) => {
          const p = path.join(PERSONA_DIR, n);
          return fs.statSync(p).isDirectory();
        })),

    chats: hasFiles(CHATS_DIR, ".json"),
    worldinfo: hasFiles(WORLD_INFO_DIR, ".json"),
    memory:
      fs.existsSync(path.join(MEMORY_DIR, "chunks.json")) ||
      fs.existsSync(path.join(MEMORY_DIR, "feedback.json")) ||
      fs.existsSync(path.join(MEMORY_DIR, "coread-books.json")) ||
      (fs.existsSync(ACTIVITY_DIR) &&
        fs.readdirSync(ACTIVITY_DIR).some((n) => n.endsWith(".json"))) ||
      (fs.existsSync(LEANN_DIR) &&
        (fs.existsSync(path.join(LEANN_DIR, "collections.json")) ||
          fs.existsSync(path.join(LEANN_DIR, "collections")))),
    "generation-system": fs.existsSync(SETTINGS_PATH),
    "api-connections": fs.existsSync(SETTINGS_PATH),
    decorate: chatThemeDirHasContent(),
  };
}
