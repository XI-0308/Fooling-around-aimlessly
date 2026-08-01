import type { Response } from "express";

/** 初始化 SSE 响应头并发送填充包，避免 iOS / 反向代理缓冲整段流 */
export function initSseResponse(res: Response): void {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();
  res.write(`: ${" ".repeat(2048)}\n\n`);
}

export function writeSseEvent(res: Response, payload: unknown): void {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  const flushable = res as Response & { flush?: () => void };
  flushable.flush?.();
}
