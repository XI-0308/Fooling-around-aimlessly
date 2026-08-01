import type { Request, Response } from "express";
import {
  formatKeepQueryForPrompt,
  getKeepAuthStatus,
  keepCheckLogin,
  keepErrorCode,
  keepGetQrcode,
  keepLogout,
  keepQuery,
} from "../keep/client.js";
import { loadSettings } from "../config.js";

export function keepStatusHandler(_req: Request, res: Response): void {
  const auth = getKeepAuthStatus();
  const settings = loadSettings();
  res.json({
    enabled: settings.keepEnabled !== false,
    ...auth,
  });
}

export async function keepQrcodeHandler(_req: Request, res: Response): Promise<void> {
  try {
    const data = await keepGetQrcode();
    res.json(data);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "获取 Keep 登录二维码失败",
    });
  }
}

export async function keepCheckLoginHandler(req: Request, res: Response): Promise<void> {
  try {
    const qrcodeId = String((req.body as { qrcodeId?: string })?.qrcodeId || "").trim();
    if (!qrcodeId) {
      res.status(400).json({ error: "缺少 qrcodeId" });
      return;
    }
    const result = await keepCheckLogin(qrcodeId);
    const auth = getKeepAuthStatus();
    res.json({
      status: result.status,
      authorized: result.status === "authorized" && auth.loggedIn,
      username: auth.username || result.username || "",
    });
  } catch (err) {
    const code = keepErrorCode(err);
    const message = err instanceof Error ? err.message : "检查登录失败";
    if (code === "QRCODE_EXPIRED") {
      res.status(400).json({ error: "二维码已过期，请重新获取", code });
      return;
    }
    res.status(400).json({ error: message, code: code || undefined });
  }
}

export async function keepLogoutHandler(_req: Request, res: Response): Promise<void> {
  try {
    await keepLogout();
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "退出失败" });
  }
}

export async function keepTestQueryHandler(req: Request, res: Response): Promise<void> {
  try {
    const text = String(
      (req.body as { text?: string })?.text || "查一下我最近的运动和体重"
    ).trim();
    const data = await keepQuery(text);
    res.json({
      message: "Keep 查询成功",
      preview: formatKeepQueryForPrompt(data).slice(0, 1200),
    });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : "Keep 查询失败",
      code: keepErrorCode(err) || undefined,
    });
  }
}
