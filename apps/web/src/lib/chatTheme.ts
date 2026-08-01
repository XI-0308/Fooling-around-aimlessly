import { clearThemeImages, loadThemeImages, saveThemeImages } from "./themeImages";
import { apiFetch } from "./api";

export interface ChatTheme {
  inputBg: string;
  userBubble: string;
  assistantBubble: string;
  userText: string;
  assistantText: string;
  /** 聊天输入框内文字 */
  inputText: string;
  /** 系统界面文字（聊天消息正文除外） */
  systemText: string;
  userBubbleOpacity: number;
  assistantBubbleOpacity: number;
  messageFontSize: number;
  /** 角色名 / 用户名 */
  nameFontSize: number;
  /** 提示、徽章、时间等 */
  metaFontSize: number;
  /** 内心戏 / 思维链 */
  reasoningFontSize: number;
  /** 界面按钮、侧栏等 */
  uiFontSize: number;
  /** 界面背景 */
  appBg: string;
  /** 卡片、输入区等表面色 */
  appSurface: string;
  /** 边框色 */
  appBorder: string;
  /** 侧栏背景 */
  sidebarBg: string;
  /** 顶栏背景 */
  topbarBg: string;
  /** 主题强调色 */
  accent: string;
  /** 主按钮填充 */
  buttonPrimaryBg: string;
  /** 主按钮文字 */
  buttonPrimaryText: string;
  /** 线框按钮边框 */
  buttonOutlineBorder: string;
  /** 线框按钮文字 */
  buttonOutlineText: string;
  /** 次要按钮边框 */
  buttonGhostBorder: string;
  /** 次要按钮文字 */
  buttonGhostText: string;
  /** 登录页 / 侧栏品牌字渐变：起点 */
  brandGradientStart: string;
  /** 登录页 / 侧栏品牌字渐变：中间色 */
  brandGradientMid: string;
  /** 登录页 / 侧栏品牌字渐变：终点 */
  brandGradientEnd: string;
  messagesBgImage: string;
  loginBgImage: string;
  /** 桌面 / PWA 应用图标（data URL 或 /api/theme/icon） */
  appIconImage: string;
}

export const DEFAULT_CHAT_THEME: ChatTheme = {
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
  brandGradientStart: "#ddd6fe",
  brandGradientMid: "#a78bfa",
  brandGradientEnd: "#7c3aed",
  messagesBgImage: "",
  loginBgImage: "",
  appIconImage: "",
};

export const MOBILE_AI_ASSISTANT_THEME: ChatTheme = {
  inputBg: "#1a1d28",
  userBubble: "#3062ff",
  assistantBubble: "#252936",
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
  accent: "#3062ff",
  buttonPrimaryBg: "#3062ff",
  buttonPrimaryText: "#ffffff",
  buttonOutlineBorder: "#5b8cff",
  buttonOutlineText: "#93c5fd",
  buttonGhostBorder: "#2a2f3a",
  buttonGhostText: "#b0b8c4",
  brandGradientStart: "#bfdbfe",
  brandGradientMid: "#5b8cff",
  brandGradientEnd: "#3062ff",
  messagesBgImage: "",
  loginBgImage: "",
  appIconImage: "",
};

export const CHAT_THEME_PRESETS: {
  id: string;
  name: string;
  description: string;
  previewImage?: string;
  theme: ChatTheme;
}[] = [
  {
    id: "default",
    name: "默认紫",
    description: "项目原有深色紫调",
    theme: DEFAULT_CHAT_THEME,
  },
  {
    id: "js-mobile-ai",
    name: "移动 AI 助手",
    description: "js.design「移动AI助手 页面设计」· 深蓝气泡",
    previewImage: "/themes/mobile-ai-assistant-ref.png",
    theme: MOBILE_AI_ASSISTANT_THEME,
  },
];

const STORAGE_KEY = "rp-agent-chat-theme";
const STORAGE_KEY_V2 = "rp-agent-chat-theme-v2";
const THEME_UPDATED_AT_KEY = "rp-agent-chat-theme-updated-at";
export const CHAT_THEME_EVENT = "rp-agent-chat-theme";

export const MESSAGE_FONT_SIZE_OPTIONS = [12, 13, 14, 15, 16, 18, 20, 22, 24] as const;
export const UI_FONT_SIZE_OPTIONS = [12, 13, 14, 15, 16, 18] as const;

function clampOpacity(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 100;
  return Math.min(100, Math.max(5, Math.round(n)));
}

function pickFontSize(value: unknown, allowed: readonly number[], fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  let best = allowed[0];
  for (const size of allowed) {
    if (Math.abs(size - n) < Math.abs(best - n)) best = size;
  }
  return best;
}

function clampFontSize(value: unknown): number {
  return pickFontSize(value, MESSAGE_FONT_SIZE_OPTIONS, DEFAULT_CHAT_THEME.messageFontSize);
}

export function normalizeChatTheme(raw: Partial<ChatTheme> | null | undefined): ChatTheme {
  const base = { ...DEFAULT_CHAT_THEME, ...raw };
  return {
    ...base,
    userBubbleOpacity: clampOpacity(raw?.userBubbleOpacity ?? base.userBubbleOpacity),
    assistantBubbleOpacity: clampOpacity(raw?.assistantBubbleOpacity ?? base.assistantBubbleOpacity),
    messageFontSize: clampFontSize(raw?.messageFontSize ?? base.messageFontSize),
    nameFontSize: pickFontSize(
      raw?.nameFontSize ?? base.nameFontSize,
      UI_FONT_SIZE_OPTIONS,
      DEFAULT_CHAT_THEME.nameFontSize
    ),
    metaFontSize: pickFontSize(
      raw?.metaFontSize ?? base.metaFontSize,
      UI_FONT_SIZE_OPTIONS,
      DEFAULT_CHAT_THEME.metaFontSize
    ),
    reasoningFontSize: pickFontSize(
      raw?.reasoningFontSize ?? base.reasoningFontSize,
      MESSAGE_FONT_SIZE_OPTIONS,
      DEFAULT_CHAT_THEME.reasoningFontSize
    ),
    uiFontSize: pickFontSize(
      raw?.uiFontSize ?? base.uiFontSize,
      UI_FONT_SIZE_OPTIONS,
      DEFAULT_CHAT_THEME.uiFontSize
    ),
    messagesBgImage: String(raw?.messagesBgImage ?? base.messagesBgImage ?? ""),
    loginBgImage: String(raw?.loginBgImage ?? base.loginBgImage ?? ""),
    appIconImage: String(raw?.appIconImage ?? base.appIconImage ?? ""),
  };
}

/** 仅合并预设中的配色与 UI 色，保留字体、背景图等用户自定义项 */
export function mergePresetColors(current: ChatTheme, preset: ChatTheme): ChatTheme {
  return normalizeChatTheme({
    ...current,
    inputBg: preset.inputBg,
    userBubble: preset.userBubble,
    assistantBubble: preset.assistantBubble,
    userText: preset.userText,
    assistantText: preset.assistantText,
    inputText: preset.inputText,
    systemText: preset.systemText,
    userBubbleOpacity: preset.userBubbleOpacity,
    assistantBubbleOpacity: preset.assistantBubbleOpacity,
    appBg: preset.appBg,
    appSurface: preset.appSurface,
    appBorder: preset.appBorder,
    sidebarBg: preset.sidebarBg,
    topbarBg: preset.topbarBg,
    accent: preset.accent,
    buttonPrimaryBg: preset.buttonPrimaryBg,
    buttonPrimaryText: preset.buttonPrimaryText,
    buttonOutlineBorder: preset.buttonOutlineBorder,
    buttonOutlineText: preset.buttonOutlineText,
    buttonGhostBorder: preset.buttonGhostBorder,
    buttonGhostText: preset.buttonGhostText,
    brandGradientStart: preset.brandGradientStart,
    brandGradientMid: preset.brandGradientMid,
    brandGradientEnd: preset.brandGradientEnd,
  });
}

function loadColorsFromStorage(): Partial<ChatTheme> | null {
  if (typeof window === "undefined") return null;
  try {
    const v2 = localStorage.getItem(STORAGE_KEY_V2);
    if (v2) return JSON.parse(v2) as Partial<ChatTheme>;
    const legacy = localStorage.getItem(STORAGE_KEY);
    if (!legacy) return null;
    const parsed = JSON.parse(legacy) as Partial<ChatTheme>;
    const { messagesBgImage, loginBgImage, ...colors } = parsed;
    void saveThemeImages({
      messagesBgImage: String(messagesBgImage ?? ""),
      loginBgImage: String(loginBgImage ?? ""),
    });
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(colors));
    localStorage.removeItem(STORAGE_KEY);
    return colors;
  } catch {
    return null;
  }
}

export function loadChatTheme(): ChatTheme {
  const colors = loadColorsFromStorage();
  return normalizeChatTheme(colors);
}

type ThemePullResult =
  | { status: "ok"; theme: ChatTheme; updatedAt: number }
  | { status: "empty" }
  | { status: "unavailable" };

/** 推送时：空图片字段省略（勿发 ""），避免服务端误清；重置时显式 forceClearImages */
async function pushChatThemeToServer(
  theme: ChatTheme,
  options?: { forceReplaceColors?: boolean; forceClearImages?: boolean }
): Promise<number | null> {
  try {
    const existingImages = await loadThemeImages();
    const body: Record<string, unknown> = { ...theme };

    if (options?.forceClearImages) {
      body.forceClearImages = true;
      body.messagesBgImage = theme.messagesBgImage || "";
      body.loginBgImage = theme.loginBgImage || "";
      body.appIconImage = theme.appIconImage || "";
    } else {
      const msg =
        isThemeImageDataUrl(theme.messagesBgImage) || theme.messagesBgImage.startsWith("/api/")
          ? theme.messagesBgImage
          : theme.messagesBgImage || existingImages.messagesBgImage;
      const login =
        isThemeImageDataUrl(theme.loginBgImage) || theme.loginBgImage.startsWith("/api/")
          ? theme.loginBgImage
          : theme.loginBgImage || existingImages.loginBgImage;
      const icon = theme.appIconImage || "";

      if (isThemeImageDataUrl(msg) || msg.startsWith("/api/")) body.messagesBgImage = msg;
      else delete body.messagesBgImage;

      if (isThemeImageDataUrl(login) || login.startsWith("/api/")) body.loginBgImage = login;
      else delete body.loginBgImage;

      if (isThemeImageDataUrl(icon) || icon.startsWith("/api/") || icon.startsWith("/pwa-icon/")) {
        body.appIconImage = icon;
      } else {
        delete body.appIconImage;
      }
    }

    if (options?.forceReplaceColors) body.forceReplaceColors = true;

    const data = await apiFetch<{ updatedAt: number }>("/theme", {
      method: "PUT",
      body: JSON.stringify(body),
    });
    return data.updatedAt ?? null;
  } catch {
    return null;
  }
}

async function pullChatThemeFromServer(): Promise<ThemePullResult> {
  try {
    const data = await apiFetch<{
      updatedAt: number;
      theme: Partial<ChatTheme> | null;
      browserBackup?: { updatedAt: number; theme: Partial<ChatTheme> } | null;
    }>("/theme");

    const metaTheme = data.theme ? normalizeChatTheme(data.theme) : null;
    const backupTheme = data.browserBackup?.theme
      ? normalizeChatTheme(data.browserBackup.theme)
      : null;
    const metaTs = data.updatedAt || 0;
    const backupTs = data.browserBackup?.updatedAt || 0;

    if (!metaTheme && !backupTheme) return { status: "empty" };

    // 优先「非默认配色」；两边都自定义或都默认时取较新，并合并图片字段
    const metaCustom = metaTheme ? !themeColorsMatchDefault(metaTheme) : false;
    const backupCustom = backupTheme ? !themeColorsMatchDefault(backupTheme) : false;

    let primary: ChatTheme;
    let secondary: ChatTheme | null;
    let updatedAt: number;

    if (metaCustom && !backupCustom) {
      primary = metaTheme!;
      secondary = backupTheme;
      updatedAt = metaTs;
    } else if (backupCustom && !metaCustom) {
      primary = backupTheme!;
      secondary = metaTheme;
      updatedAt = backupTs;
    } else if (backupTs > metaTs && backupTheme) {
      primary = backupTheme;
      secondary = metaTheme;
      updatedAt = backupTs;
    } else {
      primary = metaTheme || backupTheme!;
      secondary = metaTheme && backupTheme ? (metaTheme === primary ? backupTheme : metaTheme) : null;
      updatedAt = Math.max(metaTs, backupTs);
    }

    return {
      status: "ok",
      updatedAt,
      theme: normalizeChatTheme({
        ...primary,
        messagesBgImage: primary.messagesBgImage || secondary?.messagesBgImage || "",
        loginBgImage: primary.loginBgImage || secondary?.loginBgImage || "",
        appIconImage: primary.appIconImage || secondary?.appIconImage || "",
      }),
    };
  } catch {
    // 401 / 网络失败：绝不能当作「本地应推送覆盖服务端」
    return { status: "unavailable" };
  }
}

function isThemeImageDataUrl(value: string): boolean {
  return value.startsWith("data:image/");
}

function themeColorsMatchDefault(theme: ChatTheme): boolean {
  const keys = Object.keys(DEFAULT_CHAT_THEME).filter(
    (k) => k !== "messagesBgImage" && k !== "loginBgImage" && k !== "appIconImage"
  ) as (keyof ChatTheme)[];
  return keys.every((k) => String(theme[k]) === String(DEFAULT_CHAT_THEME[k]));
}

function isLocalThemeCustomized(theme: ChatTheme): boolean {
  if (!themeColorsMatchDefault(theme)) return true;
  if (theme.messagesBgImage || theme.loginBgImage || theme.appIconImage) return true;
  return false;
}

function isRemoteThemeBareDefault(theme: ChatTheme): boolean {
  if (!themeColorsMatchDefault(theme)) return false;
  // 仅有应用图标、背景仍空/仅占位路径 → 仍视为「配色默认壳」，不可冲掉本地自定义配色
  const msg = theme.messagesBgImage || "";
  const login = theme.loginBgImage || "";
  if (isThemeImageDataUrl(msg) || isThemeImageDataUrl(login)) return false;
  const msgEmpty = !msg || msg.startsWith("/api/theme/bg/");
  const loginEmpty = !login || login.startsWith("/api/theme/bg/");
  // 注意：有 appIcon 也仍算 bare default（图标可单独存，不该据此覆盖配色）
  return msgEmpty && loginEmpty;
}

function resolveThemeImageForStorage(value: string, fallback: string): string {
  if (isThemeImageDataUrl(value)) return value;
  if (value.startsWith("/api/theme/bg/")) return fallback;
  // 空字符串不要清空 IndexedDB 里已有背景
  if (!value.trim()) return fallback;
  return value;
}

async function persistThemeLocally(theme: ChatTheme, updatedAt?: number): Promise<void> {
  const normalized = normalizeChatTheme(theme);
  const { messagesBgImage, loginBgImage, appIconImage, ...colors } = normalized;
  const existing = await loadThemeImages();
  localStorage.setItem(
    STORAGE_KEY_V2,
    JSON.stringify({
      ...colors,
      appIconImage: isThemeImageDataUrl(appIconImage) ? "" : appIconImage,
    })
  );
  if (updatedAt) localStorage.setItem(THEME_UPDATED_AT_KEY, String(updatedAt));
  await saveThemeImages({
    messagesBgImage: resolveThemeImageForStorage(messagesBgImage, existing.messagesBgImage),
    loginBgImage: resolveThemeImageForStorage(loginBgImage, existing.loginBgImage),
  });
  applyThemeToDocument({
    ...normalized,
    messagesBgImage: isThemeImageDataUrl(messagesBgImage)
      ? messagesBgImage
      : messagesBgImage || existing.messagesBgImage,
    loginBgImage: isThemeImageDataUrl(loginBgImage)
      ? loginBgImage
      : loginBgImage || existing.loginBgImage,
  });
}

export async function loadFullChatTheme(): Promise<ChatTheme> {
  const colors = loadChatTheme();
  const images = await loadThemeImages();
  const localUpdatedAt = Number(localStorage.getItem(THEME_UPDATED_AT_KEY) || 0);
  let merged = normalizeChatTheme({ ...colors, ...images });

  if (!images.messagesBgImage && !images.loginBgImage && colors.messagesBgImage) {
    const legacyImages = {
      messagesBgImage: String(colors.messagesBgImage),
      loginBgImage: String(colors.loginBgImage || ""),
    };
    await saveThemeImages(legacyImages);
    merged = normalizeChatTheme({ ...colors, ...legacyImages });
  }

  // 本地有自定义但缺时间戳时先补上，避免被服务端默认壳的新时间戳冲掉
  if (!localUpdatedAt && isLocalThemeCustomized(merged)) {
    localStorage.setItem(THEME_UPDATED_AT_KEY, String(Date.now()));
  }
  const localTs = Number(localStorage.getItem(THEME_UPDATED_AT_KEY) || 0);

  const remote = await pullChatThemeFromServer();

  // 未登录 / 网络失败：只读本地，绝不 push、绝不抬时间戳
  if (remote.status === "unavailable") {
    return merged;
  }

  // 服务端尚无主题：仅在本地确有自定义时上传（已登录）
  if (remote.status === "empty") {
    if (isLocalThemeCustomized(merged)) {
      const ts = await pushChatThemeToServer(merged);
      if (ts) localStorage.setItem(THEME_UPDATED_AT_KEY, String(ts));
    }
    return merged;
  }

  const localCustomColors = !themeColorsMatchDefault(merged);
  const remoteDefaultColors = themeColorsMatchDefault(remote.theme);

  // 硬规则：本地自定义配色永远不被「服务端默认紫壳」覆盖（含只改了图标的情况）
  if (localCustomColors && remoteDefaultColors) {
    const keep = normalizeChatTheme({
      ...merged,
      appIconImage: merged.appIconImage || remote.theme.appIconImage,
      messagesBgImage: merged.messagesBgImage || remote.theme.messagesBgImage,
      loginBgImage: merged.loginBgImage || remote.theme.loginBgImage,
    });
    const ts = await pushChatThemeToServer(keep);
    if (ts) localStorage.setItem(THEME_UPDATED_AT_KEY, String(ts));
    return keep;
  }

  const localCustom = isLocalThemeCustomized(merged);
  const remoteBareDefault = isRemoteThemeBareDefault(remote.theme);
  if (localCustom && remoteBareDefault) {
    const ts = await pushChatThemeToServer(merged);
    if (ts) localStorage.setItem(THEME_UPDATED_AT_KEY, String(ts));
    return merged;
  }
  if (remote.updatedAt >= localTs) {
    merged = normalizeChatTheme({
      ...remote.theme,
      // 优先用服务端 /api/theme/bg 路径，避免 IndexedDB 里的大 data URL 拖慢每次进聊天
      messagesBgImage:
        remote.theme.messagesBgImage?.startsWith("/api/")
          ? remote.theme.messagesBgImage
          : isThemeImageDataUrl(images.messagesBgImage) && images.messagesBgImage
            ? images.messagesBgImage
            : remote.theme.messagesBgImage || images.messagesBgImage,
      loginBgImage:
        remote.theme.loginBgImage?.startsWith("/api/")
          ? remote.theme.loginBgImage
          : isThemeImageDataUrl(images.loginBgImage) && images.loginBgImage
            ? images.loginBgImage
            : remote.theme.loginBgImage || images.loginBgImage,
      appIconImage:
        isThemeImageDataUrl(merged.appIconImage) && merged.appIconImage
          ? merged.appIconImage
          : remote.theme.appIconImage || merged.appIconImage,
    });
    await persistThemeLocally(merged, remote.updatedAt);
    // 已有 API 背景时，把 IDB 里的大图换成路径引用，减小下次读取成本
    if (
      merged.messagesBgImage.startsWith("/api/") ||
      merged.loginBgImage.startsWith("/api/")
    ) {
      await saveThemeImages({
        messagesBgImage: merged.messagesBgImage.startsWith("/api/")
          ? merged.messagesBgImage
          : images.messagesBgImage,
        loginBgImage: merged.loginBgImage.startsWith("/api/")
          ? merged.loginBgImage
          : images.loginBgImage,
      });
    }
    return merged;
  }
  const ts = await pushChatThemeToServer(merged);
  if (ts) localStorage.setItem(THEME_UPDATED_AT_KEY, String(ts));
  return merged;
}

/** 登录页专用：优先本地缓存；未登录时仍可用公开接口拉取登录背景 */
export async function loadLoginPageTheme(): Promise<ChatTheme> {
  const colors = loadChatTheme();
  const images = await loadThemeImages();
  let merged = normalizeChatTheme({ ...colors, ...images });

  if (merged.loginBgImage && isThemeImageDataUrl(merged.loginBgImage)) {
    applyThemeToDocument(merged);
    return merged;
  }

  // 公开接口；存在才挂上，并带 cache buster（避免手机 Edge 缓存 404）
  if (!merged.loginBgImage || merged.loginBgImage.startsWith("/api/theme/bg/login")) {
    const url = `/api/theme/bg/login?t=${Date.now()}`;
    try {
      const res = await fetch(url, { credentials: "include" });
      merged = normalizeChatTheme({
        ...merged,
        loginBgImage: res.ok ? url : "",
      });
    } catch {
      // 网络失败时保留本地已有
    }
  }

  applyThemeToDocument(merged);
  return merged;
}

export function saveChatTheme(theme: ChatTheme): void {
  const normalized = normalizeChatTheme(theme);
  const { messagesBgImage, loginBgImage, appIconImage, ...colors } = normalized;
  try {
    const colorsForLs = {
      ...colors,
      appIconImage: isThemeImageDataUrl(appIconImage) ? "" : appIconImage,
    };
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(colorsForLs));
    localStorage.setItem(THEME_UPDATED_AT_KEY, String(Date.now()));
    void saveThemeImages({ messagesBgImage, loginBgImage });
    applyThemeToDocument(normalized);
    window.dispatchEvent(new Event(CHAT_THEME_EVENT));
    void (async () => {
      // 推送前再拼一次 IndexedDB 背景，避免草稿里空字符串把服务器背景清掉
      const existingImages = await loadThemeImages();
      const toPush = normalizeChatTheme({
        ...normalized,
        messagesBgImage:
          isThemeImageDataUrl(messagesBgImage) || messagesBgImage.startsWith("/api/")
            ? messagesBgImage
            : messagesBgImage || existingImages.messagesBgImage,
        loginBgImage:
          isThemeImageDataUrl(loginBgImage) || loginBgImage.startsWith("/api/")
            ? loginBgImage
            : loginBgImage || existingImages.loginBgImage,
      });
      const ts = await pushChatThemeToServer(toPush);
      if (ts) {
        localStorage.setItem(THEME_UPDATED_AT_KEY, String(ts));
        if (appIconImage || toPush.appIconImage) {
          const next = {
            ...colorsForLs,
            appIconImage: `/api/theme/icon?t=${ts}`,
          };
          localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(next));
        }
      }
    })();
  } catch {
    throw new Error("保存失败：请尝试清除部分背景图或换较小的图片");
  }
}

export function applyThemeToDocument(theme: ChatTheme): void {
  if (typeof document === "undefined") return;
  const vars = chatThemeToCssVars(theme);
  for (const [key, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(key, value);
  }
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "").trim();
  if (h.length !== 6) return { r: 109, g: 40, b: 217 };
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

export function hexToRgba(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function hexToHue(hex: string): number {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  if (max === min) return 0;
  const d = max - min;
  let h = 0;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return Math.round(h * 360);
}

export function hueToHex(hue: number, saturation = 85, lightness = 48): string {
  const h = ((hue % 360) + 360) % 360;
  const s = saturation / 100;
  const l = lightness / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function chatThemeToCssVars(theme: ChatTheme): Record<string, string> {
  const normalized = normalizeChatTheme(theme);
  const accentSoft = hexToRgba(normalized.accent, 0.18);
  return {
    "--app-bg": normalized.appBg,
    "--app-surface": normalized.appSurface,
    "--app-border": normalized.appBorder,
    "--sidebar-bg": normalized.sidebarBg,
    "--topbar-bg": normalized.topbarBg,
    "--accent": normalized.accent,
    "--accent-soft": accentSoft,
    "--accent-12": hexToRgba(normalized.accent, 0.12),
    "--accent-18": accentSoft,
    "--accent-25": hexToRgba(normalized.accent, 0.25),
    "--accent-35": hexToRgba(normalized.accent, 0.35),
    "--app-text": normalized.systemText,
    "--text": normalized.systemText,
    "--border": normalized.appBorder,
    "--card-bg": normalized.appSurface,
    "--app-link": normalized.buttonOutlineBorder,
    "--app-link-hover": normalized.buttonOutlineText,
    "--chat-input-bg": normalized.inputBg,
    "--chat-input-text": normalized.inputText,
    "--chat-user-bubble": hexToRgba(normalized.userBubble, normalized.userBubbleOpacity / 100),
    "--chat-assistant-bubble": hexToRgba(
      normalized.assistantBubble,
      normalized.assistantBubbleOpacity / 100
    ),
    "--chat-user-text": normalized.userText,
    "--chat-assistant-text": normalized.assistantText,
    "--chat-message-font-size": `${normalized.messageFontSize}px`,
    "--chat-name-font-size": `${normalized.nameFontSize}px`,
    "--chat-meta-font-size": `${normalized.metaFontSize}px`,
    "--chat-reasoning-font-size": `${normalized.reasoningFontSize}px`,
    "--chat-ui-font-size": `${normalized.uiFontSize}px`,
    "--btn-primary-bg": normalized.buttonPrimaryBg,
    "--btn-primary-text": normalized.buttonPrimaryText,
    "--btn-outline-border": normalized.buttonOutlineBorder,
    "--btn-outline-text": normalized.buttonOutlineText,
    "--btn-ghost-border": normalized.buttonGhostBorder,
    "--btn-ghost-text": normalized.buttonGhostText,
    "--brand-gradient-start": normalized.brandGradientStart,
    "--brand-gradient-mid": normalized.brandGradientMid,
    "--brand-gradient-end": normalized.brandGradientEnd,
  };
}

export async function compressImageForTheme(file: File, maxWidth = 1080): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件");
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let w = img.width;
      let h = img.height;
      if (w > maxWidth) {
        h = Math.round((h * maxWidth) / w);
        w = maxWidth;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("无法处理图片"));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片加载失败"));
    };
    img.src = url;
  });
}

/** 聊天头像：正方形裁切，默认边长 256，足够 72px 显示且体积小 */
export async function compressImageForAvatar(file: File, size = 256): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件");
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const sx = Math.floor((img.width - side) / 2);
      const sy = Math.floor((img.height - side) / 2);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("无法处理图片"));
        return;
      }
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片加载失败"));
    };
    img.src = url;
  });
}

/** 应用图标：居中裁成正方形 PNG（默认 512） */
export async function compressImageForAppIcon(file: File, size = 512): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("请选择图片文件");
  }
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const sx = Math.floor((img.width - side) / 2);
      const sy = Math.floor((img.height - side) / 2);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("无法处理图片"));
        return;
      }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, size, size);
      ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片加载失败"));
    };
    img.src = url;
  });
}

export function subscribeChatTheme(onChange: () => void): () => void {
  const handler = () => onChange();
  window.addEventListener(CHAT_THEME_EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(CHAT_THEME_EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

/** 装饰页 · 聊天字体（消息正文 + 思维链） */
export const CHAT_FONT_SIZE_FIELDS: {
  key: "messageFontSize" | "reasoningFontSize";
  label: string;
  options: readonly number[];
  defaultLabel?: string;
}[] = [
  { key: "messageFontSize", label: "消息正文", options: MESSAGE_FONT_SIZE_OPTIONS, defaultLabel: "16px（默认）" },
  { key: "reasoningFontSize", label: "内心戏 / 思维链", options: MESSAGE_FONT_SIZE_OPTIONS },
];

/** 装饰页 · 系统字体（聊天区以外的可见文字） */
export const SYSTEM_FONT_SIZE_FIELDS: {
  key: "metaFontSize" | "uiFontSize";
  label: string;
  options: readonly number[];
}[] = [
  { key: "metaFontSize", label: "提示 / 徽章 / 时间", options: UI_FONT_SIZE_OPTIONS },
  { key: "uiFontSize", label: "界面、侧栏与面板", options: UI_FONT_SIZE_OPTIONS },
];

export const CHAT_THEME_BUBBLE_COLOR_FIELDS: { key: keyof ChatTheme; label: string; withOpacity?: boolean }[] = [
  { key: "userBubble", label: "用户气泡", withOpacity: true },
  { key: "assistantBubble", label: "角色气泡", withOpacity: true },
];

export const CHAT_THEME_UI_COLOR_FIELDS: { key: keyof ChatTheme; label: string }[] = [
  { key: "appBg", label: "界面背景" },
  { key: "appSurface", label: "卡片 / 面板" },
  { key: "appBorder", label: "边框" },
  { key: "sidebarBg", label: "侧栏背景" },
  { key: "topbarBg", label: "顶栏背景" },
  { key: "accent", label: "强调色" },
  { key: "inputBg", label: "输入框背景" },
];

export const CHAT_THEME_TEXT_COLOR_FIELDS: { key: keyof ChatTheme; label: string }[] = [
  { key: "userText", label: "用户消息文字" },
  { key: "assistantText", label: "角色消息文字" },
  { key: "inputText", label: "输入框字体颜色" },
  { key: "systemText", label: "系统字体颜色" },
];

export const CHAT_THEME_BUTTON_COLOR_FIELDS: { key: keyof ChatTheme; label: string }[] = [
  { key: "buttonPrimaryBg", label: "主按钮填充" },
  { key: "buttonPrimaryText", label: "主按钮文字" },
  { key: "buttonOutlineBorder", label: "线框按钮边框" },
  { key: "buttonOutlineText", label: "线框按钮文字" },
  { key: "buttonGhostBorder", label: "次要按钮边框" },
  { key: "buttonGhostText", label: "次要按钮文字" },
];

export const CHAT_THEME_BRAND_COLOR_FIELDS: { key: keyof ChatTheme; label: string }[] = [
  { key: "brandGradientStart", label: "品牌字 · 起点" },
  { key: "brandGradientMid", label: "品牌字 · 中间" },
  { key: "brandGradientEnd", label: "品牌字 · 终点" },
];

export async function resetChatTheme(options?: { keepImages?: boolean }): Promise<ChatTheme> {
  const next = normalizeChatTheme(DEFAULT_CHAT_THEME);
  if (!options?.keepImages) {
    await clearThemeImages();
  } else {
    const images = await loadThemeImages();
    next.messagesBgImage = images.messagesBgImage;
    next.loginBgImage = images.loginBgImage;
  }
  const { messagesBgImage, loginBgImage, appIconImage, ...colors } = next;
  localStorage.setItem(
    STORAGE_KEY_V2,
    JSON.stringify({ ...colors, appIconImage: "" })
  );
  localStorage.setItem(THEME_UPDATED_AT_KEY, String(Date.now()));
  if (!options?.keepImages) {
    await saveThemeImages({ messagesBgImage: "", loginBgImage: "" });
  }
  applyThemeToDocument(next);
  window.dispatchEvent(new Event(CHAT_THEME_EVENT));
  const ts = await pushChatThemeToServer(
    {
      ...next,
      messagesBgImage: options?.keepImages ? messagesBgImage : "",
      loginBgImage: options?.keepImages ? loginBgImage : "",
      appIconImage: "",
    },
    {
      forceReplaceColors: true,
      forceClearImages: !options?.keepImages,
    }
  );
  if (ts) localStorage.setItem(THEME_UPDATED_AT_KEY, String(ts));
  return next;
}

/** 备份导出：抓取浏览器 localStorage + IndexedDB 中的完整装饰 */
export async function captureBrowserThemeForBackup(): Promise<{
  updatedAt: number;
  theme: ChatTheme;
}> {
  const colors = loadChatTheme();
  const images = await loadThemeImages();
  return {
    updatedAt: Number(localStorage.getItem(THEME_UPDATED_AT_KEY) || Date.now()),
    theme: normalizeChatTheme({ ...colors, ...images }),
  };
}

/** 导入装饰包后，从服务器拉取并写回浏览器 */
export async function refreshChatThemeAfterImport(): Promise<void> {
  await loadFullChatTheme();
  window.dispatchEvent(new Event(CHAT_THEME_EVENT));
}
