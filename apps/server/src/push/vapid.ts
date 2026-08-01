import fs from "fs";
import path from "path";
import webpush from "web-push";
import { DATA_DIR, ensureDataDir } from "../config.js";

const VAPID_PATH = path.join(DATA_DIR, "vapid-keys.json");

/** Apple 会拒绝 mailto:…@localhost（BadJwtToken）；须用真实感域名或 https 主体 */
export const DEFAULT_VAPID_SUBJECT = "mailto:push@encoreflow.app";

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string;
}

let cached: VapidKeys | null = null;
let configured = false;

function isBadAppleSubject(subject: string): boolean {
  const s = (subject || "").trim().toLowerCase();
  if (!s) return true;
  if (s.includes("localhost") || s.includes("127.0.0.1")) return true;
  if (!(s.startsWith("mailto:") || s.startsWith("https://"))) return true;
  return false;
}

export function loadOrCreateVapidKeys(): VapidKeys {
  if (cached) return cached;
  ensureDataDir();
  if (fs.existsSync(VAPID_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(VAPID_PATH, "utf-8")) as VapidKeys;
      if (raw.publicKey && raw.privateKey) {
        let subject = raw.subject || DEFAULT_VAPID_SUBJECT;
        if (isBadAppleSubject(subject)) {
          subject = DEFAULT_VAPID_SUBJECT;
          const fixed = { ...raw, subject };
          fs.writeFileSync(VAPID_PATH, JSON.stringify(fixed, null, 2), "utf-8");
          console.log(`[push] 已修正 VAPID subject → ${subject}（Apple 不接受 localhost mailto）`);
        }
        cached = {
          publicKey: raw.publicKey,
          privateKey: raw.privateKey,
          subject,
        };
        return cached;
      }
    } catch {
      /* regenerate */
    }
  }
  const generated = webpush.generateVAPIDKeys();
  cached = {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    subject: DEFAULT_VAPID_SUBJECT,
  };
  fs.writeFileSync(VAPID_PATH, JSON.stringify(cached, null, 2), "utf-8");
  console.log("[push] 已生成 VAPID 密钥 → data/vapid-keys.json");
  return cached;
}

export function ensureWebPushConfigured(): VapidKeys {
  const keys = loadOrCreateVapidKeys();
  // 每次调用都 set，保证 subject 修正后立即生效（进程内重启前也安全）
  webpush.setVapidDetails(keys.subject, keys.publicKey, keys.privateKey);
  configured = true;
  return keys;
}
