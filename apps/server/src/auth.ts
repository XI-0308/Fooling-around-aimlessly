import bcrypt from "bcryptjs";
import type { Request, Response, NextFunction } from "express";
import { loadSettings } from "./config.js";
import { logAuthEvent, readRecentAuthLogs } from "./authLog.js";

declare module "express-session" {
  interface SessionData {
    authenticated?: boolean;
    lastActivityAt?: number;
  }
}

const SESSION_IDLE_MS =
  (Number(process.env.SESSION_IDLE_MINUTES) || 30) * 60 * 1000;

function isSessionIdle(lastActivityAt: number | undefined): boolean {
  const last = lastActivityAt ?? Date.now();
  return Date.now() - last > SESSION_IDLE_MS;
}

/** 校验会话有效并刷新最后活动时间；超时则销毁会话 */
function touchSession(req: Request): boolean {
  if (!req.session.authenticated) return false;
  if (isSessionIdle(req.session.lastActivityAt)) {
    logAuthEvent(req, "session_expired");
    req.session.destroy(() => {});
    return false;
  }
  req.session.lastActivityAt = Date.now();
  return true;
}

export async function ensurePasswordInitialized(): Promise<void> {
  const settings = loadSettings();
  if (!settings.appPasswordHash) {
    const plain = process.env.APP_PASSWORD || "changeme";
    settings.appPasswordHash = await bcrypt.hash(plain, 10);
    const { saveSettings } = await import("./config.js");
    saveSettings(settings);
    console.log(
      "[auth] 首次启动：已用 APP_PASSWORD 初始化登录密码（默认 changeme，请尽快修改）"
    );
  }
}

export async function loginHandler(req: Request, res: Response): Promise<void> {
  const { password } = req.body as { password?: string };
  if (!password) {
    res.status(400).json({ error: "请输入密码" });
    return;
  }

  const settings = loadSettings();
  const ok = await bcrypt.compare(password, settings.appPasswordHash);
  if (!ok) {
    logAuthEvent(req, "login_failed");
    res.status(401).json({ error: "密码错误" });
    return;
  }

  req.session.authenticated = true;
  req.session.lastActivityAt = Date.now();
  logAuthEvent(req, "login_success");
  res.json({ success: true });
}

export function logoutHandler(req: Request, res: Response): void {
  logAuthEvent(req, "logout");
  req.session.destroy(() => {
    res.json({ success: true });
  });
}

export function authStatusHandler(req: Request, res: Response): void {
  res.json({ authenticated: touchSession(req) });
}

export function authLogsHandler(req: Request, res: Response): void {
  res.json({ logs: readRecentAuthLogs(100) });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (touchSession(req)) {
    next();
    return;
  }
  logAuthEvent(req, "auth_rejected");
  res.status(401).json({ error: "未登录或会话已过期，请重新输入密码" });
}
