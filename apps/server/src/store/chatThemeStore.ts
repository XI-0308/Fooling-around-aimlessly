import fs from "fs";
import path from "path";
import { DATA_DIR, ensureDataDir, ROOT_DIR } from "../config.js";

/** 正确路径：项目 data/chat-theme（与角色/聊天等一致） */
export const THEME_DIR = path.join(DATA_DIR, "chat-theme");

/** 历史误写路径 apps/data/chat-theme，启动时迁移一次 */
const LEGACY_THEME_DIR = path.join(ROOT_DIR, "apps", "data", "chat-theme");

const META_PATH = path.join(THEME_DIR, "meta.json");
const MESSAGES_BG = path.join(THEME_DIR, "messages-bg.jpg");
const LOGIN_BG = path.join(THEME_DIR, "login-bg.jpg");
const APP_ICON = path.join(THEME_DIR, "app-icon.png");

export interface StoredChatThemeColors {
  inputBg: string;
  userBubble: string;
  assistantBubble: string;
  userText: string;
  assistantText: string;
  inputText: string;
  systemText: string;
  userBubbleOpacity: number;
  assistantBubbleOpacity: number;
  messageFontSize: number;
  nameFontSize: number;
  metaFontSize: number;
  reasoningFontSize: number;
  uiFontSize: number;
  appBg: string;
  appSurface: string;
  appBorder: string;
  sidebarBg: string;
  topbarBg: string;
  accent: string;
  buttonPrimaryBg: string;
  buttonPrimaryText: string;
  buttonOutlineBorder: string;
  buttonOutlineText: string;
  buttonGhostBorder: string;
  buttonGhostText: string;
}

/** 与前端 DEFAULT_CHAT_THEME 配色一致，用于拒绝「默认壳」覆盖自定义 */
export const DEFAULT_THEME_COLORS: StoredChatThemeColors = {
  inputBg: "#12151c",
  userBubble: "#6d28d9",
  assistantBubble: "#1a1d28",
  userText: "#ffffff",
  assistantText: "#e8eaed",
  inputText: "#e8eaed",
  systemText: "#e8eaed",
  userBubbleOpacity: 100,
  assistantBubbleOpacity: 100,
  messageFontSize: 16,
  nameFontSize: 13,
  metaFontSize: 12,
  reasoningFontSize: 14,
  uiFontSize: 14,
  appBg: "#0f1117",
  appSurface: "#161922",
  appBorder: "#2a2f3a",
  sidebarBg: "#161922",
  topbarBg: "#12151c",
  accent: "#7c3aed",
  buttonPrimaryBg: "#7c3aed",
  buttonPrimaryText: "#ffffff",
  buttonOutlineBorder: "#a78bfa",
  buttonOutlineText: "#c4b5fd",
  buttonGhostBorder: "#2a2f3a",
  buttonGhostText: "#b0b8c4",
};

export interface ChatThemePayload {
  updatedAt: number;
  colors: StoredChatThemeColors;
  hasMessagesBg: boolean;
  hasLoginBg: boolean;
  hasAppIcon: boolean;
}

export interface ChatThemeSaveInput extends StoredChatThemeColors {
  messagesBgImage?: string;
  loginBgImage?: string;
  appIconImage?: string;
  /** 为 true 时允许用默认配色覆盖已有自定义（仅「重置装饰」使用） */
  forceReplaceColors?: boolean;
  /** 为 true 时才允许用空字符串删除已有图片（仅「重置装饰」使用） */
  forceClearImages?: boolean;
}

/** 浏览器 localStorage / IndexedDB 装饰快照（备份用） */
export interface BrowserThemeSnapshot {
  updatedAt: number;
  theme: Record<string, unknown>;
}

const BROWSER_THEME_BACKUP = path.join(THEME_DIR, "browser-theme.json");

function migrateLegacyThemeDir(): void {
  if (!fs.existsSync(LEGACY_THEME_DIR)) return;
  ensureDataDir();
  if (!fs.existsSync(THEME_DIR)) fs.mkdirSync(THEME_DIR, { recursive: true });
  const legacyNames = fs.readdirSync(LEGACY_THEME_DIR);
  if (legacyNames.length === 0) return;

  const destHasMeta = fs.existsSync(META_PATH);
  for (const name of legacyNames) {
    const from = path.join(LEGACY_THEME_DIR, name);
    const to = path.join(THEME_DIR, name);
    if (!fs.existsSync(from)) continue;
    if (fs.existsSync(to)) {
      if (name === "meta.json" && destHasMeta) continue;
      if (name !== "meta.json") continue;
    }
    try {
      fs.copyFileSync(from, to);
    } catch (err) {
      console.warn("[theme] 迁移旧目录失败:", name, err instanceof Error ? err.message : err);
    }
  }
}

function ensureDir() {
  ensureDataDir();
  migrateLegacyThemeDir();
  if (!fs.existsSync(THEME_DIR)) fs.mkdirSync(THEME_DIR, { recursive: true });
}

function dataUrlToBuffer(dataUrl: string): Buffer | null {
  const m = String(dataUrl).match(/^data:image\/\w+;base64,(.+)$/);
  if (!m) return null;
  try {
    return Buffer.from(m[1], "base64");
  } catch {
    return null;
  }
}

export function isDefaultThemeColors(colors: Partial<StoredChatThemeColors> | null | undefined): boolean {
  if (!colors) return true;
  const keys = Object.keys(DEFAULT_THEME_COLORS) as (keyof StoredChatThemeColors)[];
  return keys.every((k) => String(colors[k] ?? "") === String(DEFAULT_THEME_COLORS[k]));
}

function pickStoredColors(input: ChatThemeSaveInput): StoredChatThemeColors {
  const colors: StoredChatThemeColors = { ...DEFAULT_THEME_COLORS };
  for (const key of Object.keys(DEFAULT_THEME_COLORS) as (keyof StoredChatThemeColors)[]) {
    const value = input[key];
    if (value !== undefined && value !== null) {
      (colors as unknown as Record<string, unknown>)[key] = value;
    }
  }
  return colors;
}

/**
 * 写入图片：
 * - undefined/null → 保留已有
 * - 空字符串 → 仅 forceClear 时删除；否则保留（防未登录 sync 误清）
 * - /api/… /pwa-icon/… → 保留已有文件
 * - data URL → 覆盖写入
 * - 非法/无法解析 → 保留已有
 */
function writeImageFile(target: string, dataUrl?: string, forceClear = false): boolean {
  if (dataUrl === undefined || dataUrl === null) {
    return fs.existsSync(target);
  }
  if (!dataUrl.trim()) {
    if (forceClear) {
      if (fs.existsSync(target)) fs.unlinkSync(target);
      return false;
    }
    if (fs.existsSync(target)) {
      console.warn("[theme] 忽略空图片字段，保留已有文件:", path.basename(target));
    }
    return fs.existsSync(target);
  }
  if (
    dataUrl.startsWith("/api/theme/bg/") ||
    dataUrl.startsWith("/api/theme/icon") ||
    dataUrl.startsWith("/pwa-icon/")
  ) {
    return fs.existsSync(target);
  }
  const buf = dataUrlToBuffer(dataUrl);
  if (!buf) return fs.existsSync(target);
  fs.writeFileSync(target, buf);
  return true;
}

export function loadChatThemePayload(): ChatThemePayload | null {
  ensureDir();
  if (!fs.existsSync(META_PATH)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(META_PATH, "utf8")) as ChatThemePayload;
    if (!raw?.colors) return null;
    return {
      updatedAt: Number(raw.updatedAt) || 0,
      colors: { ...DEFAULT_THEME_COLORS, ...raw.colors },
      hasMessagesBg: fs.existsSync(MESSAGES_BG),
      hasLoginBg: fs.existsSync(LOGIN_BG),
      hasAppIcon: fs.existsSync(APP_ICON),
    };
  } catch {
    return null;
  }
}

/**
 * 保存主题。硬保护：若磁盘上已有「非默认」配色，而本次提交是默认紫壳，
 * 则保留原配色，只更新图片（避免只改图标 / 同步抖动时冲掉装饰）。
 */
export function saveChatThemePayload(input: ChatThemeSaveInput): ChatThemePayload {
  ensureDir();
  const existing = loadChatThemePayload();
  let colors = pickStoredColors(input);

  if (
    !input.forceReplaceColors &&
    existing &&
    !isDefaultThemeColors(existing.colors) &&
    isDefaultThemeColors(colors)
  ) {
    console.warn("[theme] 拒绝用默认配色覆盖已有自定义，仅更新图片字段");
    colors = existing.colors;
  }

  const clearImages = Boolean(input.forceClearImages);
  const hasMessagesBg = writeImageFile(MESSAGES_BG, input.messagesBgImage, clearImages);
  const hasLoginBg = writeImageFile(LOGIN_BG, input.loginBgImage, clearImages);
  const hasAppIcon = writeImageFile(APP_ICON, input.appIconImage, clearImages);
  const payload: ChatThemePayload = {
    updatedAt: Date.now(),
    colors,
    hasMessagesBg,
    hasLoginBg,
    hasAppIcon,
  };
  fs.writeFileSync(META_PATH, JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

export function getChatThemeBgPath(kind: "messages" | "login"): string | null {
  ensureDir();
  const file = kind === "messages" ? MESSAGES_BG : LOGIN_BG;
  return fs.existsSync(file) ? file : null;
}

export function getAppIconPath(): string | null {
  ensureDir();
  return fs.existsSync(APP_ICON) ? APP_ICON : null;
}

export function loadBrowserThemeBackup(): BrowserThemeSnapshot | null {
  ensureDir();
  if (!fs.existsSync(BROWSER_THEME_BACKUP)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(BROWSER_THEME_BACKUP, "utf8")) as BrowserThemeSnapshot;
    if (!raw?.theme || typeof raw.theme !== "object") return null;
    return {
      updatedAt: Number(raw.updatedAt) || 0,
      theme: raw.theme,
    };
  } catch {
    return null;
  }
}

export function saveBrowserThemeBackup(snapshot: BrowserThemeSnapshot): void {
  ensureDir();
  const existing = loadBrowserThemeBackup();
  const incoming = snapshot.theme || {};
  const incomingColors = incoming as Partial<StoredChatThemeColors>;
  const existingColors = (existing?.theme || {}) as Partial<StoredChatThemeColors>;

  let theme = { ...incoming };
  if (
    existing &&
    !isDefaultThemeColors(existingColors) &&
    isDefaultThemeColors(incomingColors)
  ) {
    console.warn("[theme] browser-theme 备份：保留已有自定义配色");
    theme = {
      ...existing.theme,
      ...Object.fromEntries(
        Object.entries(incoming).filter(([k]) =>
          ["messagesBgImage", "loginBgImage", "appIconImage"].includes(k)
        )
      ),
    };
    // 配色仍用旧的
    for (const key of Object.keys(DEFAULT_THEME_COLORS)) {
      if (existing.theme[key] !== undefined) theme[key] = existing.theme[key];
    }
  }

  // 空图片字段不要冲掉备份里已有的 URL
  if (existing) {
    for (const key of ["messagesBgImage", "loginBgImage", "appIconImage"] as const) {
      const next = String(theme[key] ?? "").trim();
      const prev = String(existing.theme[key] ?? "").trim();
      if (!next && prev) theme[key] = prev;
    }
  }

  fs.writeFileSync(
    BROWSER_THEME_BACKUP,
    JSON.stringify(
      {
        updatedAt: Number(snapshot.updatedAt) || Date.now(),
        theme,
      },
      null,
      2
    ),
    "utf8"
  );
}

export function chatThemeDirHasContent(): boolean {
  ensureDir();
  return fs.readdirSync(THEME_DIR).some((name) => name !== ".gitkeep");
}
