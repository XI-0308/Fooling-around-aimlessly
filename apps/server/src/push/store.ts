import fs from "fs";
import path from "path";
import { DATA_DIR, ensureDataDir } from "../config.js";

const SUBS_PATH = path.join(DATA_DIR, "push-subscriptions.json");

/** 浏览器 PushSubscription.toJSON() 形状 */
export interface StoredPushSubscription {
  endpoint: string;
  expirationTime?: number | null;
  keys: {
    p256dh: string;
    auth: string;
  };
  /** 订阅创建/更新时间 */
  updatedAt: string;
  userAgent?: string;
}

interface StoreFile {
  subscriptions: StoredPushSubscription[];
}

function readStore(): StoreFile {
  ensureDataDir();
  if (!fs.existsSync(SUBS_PATH)) return { subscriptions: [] };
  try {
    const raw = JSON.parse(fs.readFileSync(SUBS_PATH, "utf-8")) as StoreFile;
    return { subscriptions: Array.isArray(raw.subscriptions) ? raw.subscriptions : [] };
  } catch {
    return { subscriptions: [] };
  }
}

function writeStore(store: StoreFile): void {
  ensureDataDir();
  fs.writeFileSync(SUBS_PATH, JSON.stringify(store, null, 2), "utf-8");
}

export function listPushSubscriptions(): StoredPushSubscription[] {
  return readStore().subscriptions;
}

export function upsertPushSubscription(
  sub: Omit<StoredPushSubscription, "updatedAt"> & { updatedAt?: string }
): void {
  if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    throw new Error("无效的推送订阅");
  }
  const store = readStore();
  const next: StoredPushSubscription = {
    endpoint: sub.endpoint,
    expirationTime: sub.expirationTime ?? null,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
    updatedAt: sub.updatedAt || new Date().toISOString(),
    userAgent: sub.userAgent,
  };
  const idx = store.subscriptions.findIndex((s) => s.endpoint === next.endpoint);
  if (idx >= 0) store.subscriptions[idx] = { ...store.subscriptions[idx], ...next };
  else store.subscriptions.push(next);
  writeStore(store);
}

export function removePushSubscription(endpoint: string): boolean {
  const store = readStore();
  const before = store.subscriptions.length;
  store.subscriptions = store.subscriptions.filter((s) => s.endpoint !== endpoint);
  writeStore(store);
  return store.subscriptions.length < before;
}

export function removePushSubscriptionByEndpoints(endpoints: string[]): void {
  if (endpoints.length === 0) return;
  const drop = new Set(endpoints);
  const store = readStore();
  store.subscriptions = store.subscriptions.filter((s) => !drop.has(s.endpoint));
  writeStore(store);
}
