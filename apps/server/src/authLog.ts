import fs from "fs";
import path from "path";
import type { Request } from "express";
import { DATA_DIR, ensureDataDir } from "./config.js";

const LOG_PATH = path.join(DATA_DIR, "logs", "auth.log");
const MAX_LINES = 500;

function clientMeta(req: Request) {
  const forwarded = req.headers["x-forwarded-for"];
  const ip =
    (typeof forwarded === "string" ? forwarded.split(",")[0]?.trim() : "") ||
    req.socket.remoteAddress ||
    "";
  return {
    ip,
    ua: String(req.headers["user-agent"] || "").slice(0, 180),
  };
}

export function logAuthEvent(req: Request, event: string, detail?: Record<string, unknown>): void {
  try {
    ensureDataDir();
    const dir = path.dirname(LOG_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      event,
      ...clientMeta(req),
      ...detail,
    });
    fs.appendFileSync(LOG_PATH, `${line}\n`, "utf-8");
    trimLogIfNeeded();
  } catch {
    /* 日志失败不影响主流程 */
  }
}

function trimLogIfNeeded(): void {
  if (!fs.existsSync(LOG_PATH)) return;
  const lines = fs.readFileSync(LOG_PATH, "utf-8").split("\n").filter(Boolean);
  if (lines.length <= MAX_LINES) return;
  fs.writeFileSync(LOG_PATH, `${lines.slice(-MAX_LINES).join("\n")}\n`, "utf-8");
}

export function readRecentAuthLogs(limit = 80): string[] {
  if (!fs.existsSync(LOG_PATH)) return [];
  const lines = fs.readFileSync(LOG_PATH, "utf-8").split("\n").filter(Boolean);
  return lines.slice(-limit);
}
