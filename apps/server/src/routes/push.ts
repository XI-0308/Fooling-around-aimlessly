import type { Request, Response } from "express";
import { ensureWebPushConfigured } from "../push/vapid.js";
import {
  listPushSubscriptions,
  removePushSubscription,
  upsertPushSubscription,
} from "../push/store.js";
import { sendWebPushToAll } from "../push/send.js";

export function getPushVapidPublicKeyHandler(_req: Request, res: Response): void {
  const keys = ensureWebPushConfigured();
  res.json({
    publicKey: keys.publicKey,
    subscriptionCount: listPushSubscriptions().length,
  });
}

export function subscribePushHandler(req: Request, res: Response): void {
  try {
    const body = req.body as {
      endpoint?: string;
      expirationTime?: number | null;
      keys?: { p256dh?: string; auth?: string };
    };
    if (!body?.endpoint || !body.keys?.p256dh || !body.keys?.auth) {
      res.status(400).json({ error: "缺少 subscription 字段" });
      return;
    }
    upsertPushSubscription({
      endpoint: body.endpoint,
      expirationTime: body.expirationTime ?? null,
      keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
      userAgent: String(req.headers["user-agent"] || "").slice(0, 200),
    });
    res.json({ success: true, subscriptionCount: listPushSubscriptions().length });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "订阅失败" });
  }
}

export function unsubscribePushHandler(req: Request, res: Response): void {
  const endpoint = String((req.body as { endpoint?: string })?.endpoint || "").trim();
  if (!endpoint) {
    res.status(400).json({ error: "缺少 endpoint" });
    return;
  }
  const removed = removePushSubscription(endpoint);
  res.json({ success: true, removed, subscriptionCount: listPushSubscriptions().length });
}

export async function testPushHandler(_req: Request, res: Response): Promise<void> {
  const result = await sendWebPushToAll({
    title: "\u200b",
    body: "角色：这是一条锁屏推送测试。若你看到这条，真·推送已打通。",
    url: "/settings",
    tag: "ef-push-test",
  });
  if (result.sent === 0 && listPushSubscriptions().length === 0) {
    res.status(400).json({
      error: "还没有推送订阅。请先点「开启锁屏推送」完成授权与订阅。",
      ...result,
    });
    return;
  }
  if (result.sent === 0) {
    res.status(502).json({
      error:
        `已有订阅但推送未送达（failed=${result.failed}）。` +
        (result.lastError ? `原因：${result.lastError}` : "请再点一次「开启锁屏推送」后重试。"),
      ...result,
    });
    return;
  }
  res.json({ success: true, ...result });
}
