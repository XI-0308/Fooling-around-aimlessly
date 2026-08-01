import type { Request, Response } from "express";
import {
  getAppIconPath,
  getChatThemeBgPath,
  loadChatThemePayload,
  loadBrowserThemeBackup,
  saveBrowserThemeBackup,
  saveChatThemePayload,
  type ChatThemeSaveInput,
} from "../store/chatThemeStore.js";

function themeUrls(payload: NonNullable<ReturnType<typeof loadChatThemePayload>>) {
  const t = payload.updatedAt;
  return {
    ...payload.colors,
    messagesBgImage: payload.hasMessagesBg ? `/api/theme/bg/messages?t=${t}` : "",
    loginBgImage: payload.hasLoginBg ? `/api/theme/bg/login?t=${t}` : "",
    appIconImage: payload.hasAppIcon ? `/api/theme/icon?t=${t}` : "",
  };
}

export function getChatThemeHandler(_req: Request, res: Response): void {
  const payload = loadChatThemePayload();
  const browserBackup = loadBrowserThemeBackup();
  if (!payload && !browserBackup) {
    res.json({ updatedAt: 0, theme: null, browserBackup: null });
    return;
  }
  res.json({
    updatedAt: payload?.updatedAt ?? browserBackup?.updatedAt ?? 0,
    theme: payload ? themeUrls(payload) : null,
    browserBackup,
  });
}

export function putChatThemeHandler(req: Request, res: Response): void {
  const body = req.body as ChatThemeSaveInput & {
    messagesBgImage?: string;
    loginBgImage?: string;
    appIconImage?: string;
  };
  if (!body || typeof body !== "object") {
    res.status(400).json({ error: "无效的主题数据" });
    return;
  }
  const payload = saveChatThemePayload(body);
  // 备份只存路径引用，不把大图 data URL 再塞进 JSON（图标已在 app-icon.png）
  saveBrowserThemeBackup({
    updatedAt: payload.updatedAt,
    theme: {
      ...payload.colors,
      messagesBgImage: payload.hasMessagesBg
        ? `/api/theme/bg/messages?t=${payload.updatedAt}`
        : "",
      loginBgImage: payload.hasLoginBg ? `/api/theme/bg/login?t=${payload.updatedAt}` : "",
      appIconImage: payload.hasAppIcon ? `/api/theme/icon?t=${payload.updatedAt}` : "",
    },
  });
  res.json({
    updatedAt: payload.updatedAt,
    theme: themeUrls(payload),
  });
}

export function getChatThemeBgHandler(req: Request, res: Response): void {
  const kind = req.params.kind === "login" ? "login" : "messages";
  const file = getChatThemeBgPath(kind);
  if (!file) {
    res.status(404).end();
    return;
  }
  res.setHeader("Cache-Control", "private, max-age=3600");
  res.sendFile(file);
}

export function getLoginChatThemeBgHandler(req: Request, res: Response): void {
  (req.params as { kind: string }).kind = "login";
  getChatThemeBgHandler(req, res);
}

/** 桌面 / PWA 图标（公开，安装页与未登录也需可读） */
export function getAppIconHandler(_req: Request, res: Response): void {
  const file = getAppIconPath();
  if (!file) {
    res.status(404).json({ error: "未设置应用图标" });
    return;
  }
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.type("png");
  res.sendFile(file);
}
