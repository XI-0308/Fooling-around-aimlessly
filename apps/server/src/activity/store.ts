import fs from "fs";
import path from "path";
import crypto from "crypto";
import { ACTIVITY_DIR, ensureDataDir } from "../config.js";
import type {
  ActivityItem,
  ActivityKind,
  ActivityPartOfDay,
  ActivityRemind,
  ActivityRepeat,
  ActivityStatus,
} from "./types.js";
import { resolveActivityKind } from "./types.js";
import { todayYmd } from "./time.js";
import { expirePastPending } from "./window.js";

const LEDGER_PATH = path.join(ACTIVITY_DIR, "ledger.json");

function ensureActivityDir(): void {
  ensureDataDir();
  if (!fs.existsSync(ACTIVITY_DIR)) fs.mkdirSync(ACTIVITY_DIR, { recursive: true });
}

function loadRaw(): ActivityItem[] {
  ensureActivityDir();
  if (!fs.existsSync(LEDGER_PATH)) return [];
  try {
    const rows = JSON.parse(fs.readFileSync(LEDGER_PATH, "utf-8")) as ActivityItem[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  }
}

function saveRaw(rows: ActivityItem[]): void {
  ensureActivityDir();
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(rows, null, 2), "utf-8");
}

/** 读取并自动把过期未勾选标为 missed */
export function listActivities(): ActivityItem[] {
  const rows = loadRaw();
  const today = todayYmd();
  const { changed, items } = expirePastPending(rows, today);
  if (changed) saveRaw(items);
  return items;
}

export function getActivity(id: string): ActivityItem | null {
  return listActivities().find((a) => a.id === id) || null;
}

export function createActivity(input: {
  title: string;
  date: string;
  time?: string;
  partOfDay?: ActivityPartOfDay | null;
  repeat?: ActivityRepeat;
  remind?: ActivityRemind;
  kind?: ActivityKind;
  status?: ActivityStatus;
  note?: string;
}): ActivityItem {
  const now = new Date().toISOString();
  const title = input.title.trim();
  if (!title) throw new Error("标题不能为空");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) throw new Error("日期格式应为 YYYY-MM-DD");

  let kind: ActivityKind = input.kind || "plan";
  let status: ActivityStatus = input.status || "pending";
  if (kind === "record") status = "done";
  if (kind === "plan" || kind === "promise") {
    if (status === "done") status = "pending";
  }
  if (!input.kind && input.status === "done") kind = "record";

  const item: ActivityItem = {
    id: crypto.randomUUID(),
    title,
    date: input.date,
    time: input.time?.trim() || undefined,
    partOfDay: input.partOfDay ?? null,
    repeat: input.repeat || "none",
    remind: input.remind || "mention",
    kind,
    status,
    note: input.note?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  if (item.repeat !== "none") {
    item.occurrenceStatus = {};
    if (item.status === "done") {
      item.occurrenceStatus[item.date] = "done";
    }
  }
  const rows = loadRaw();
  rows.push(item);
  saveRaw(rows);
  return item;
}

export function updateActivity(
  id: string,
  patch: Partial<{
    title: string;
    date: string;
    time: string | null;
    partOfDay: ActivityPartOfDay | null;
    repeat: ActivityRepeat;
    remind: ActivityRemind;
    kind: ActivityKind;
    status: ActivityStatus;
    note: string | null;
  }>
): ActivityItem | null {
  const rows = loadRaw();
  const idx = rows.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  const cur = rows[idx];
  const next: ActivityItem = { ...cur, updatedAt: new Date().toISOString() };
  if (patch.title !== undefined) {
    const t = patch.title.trim();
    if (!t) throw new Error("标题不能为空");
    next.title = t;
  }
  if (patch.date !== undefined) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(patch.date)) throw new Error("日期格式应为 YYYY-MM-DD");
    next.date = patch.date;
  }
  if (patch.time !== undefined) next.time = patch.time?.trim() || undefined;
  if (patch.partOfDay !== undefined) next.partOfDay = patch.partOfDay;
  if (patch.repeat !== undefined) {
    next.repeat = patch.repeat;
    if (next.repeat === "none") delete next.occurrenceStatus;
    else if (!next.occurrenceStatus) next.occurrenceStatus = {};
  }
  if (patch.remind !== undefined) next.remind = patch.remind;
  if (patch.kind !== undefined) {
    next.kind = patch.kind;
    if (patch.kind === "record") next.status = "done";
    if ((patch.kind === "plan" || patch.kind === "promise") && next.status === "done") {
      next.status = "pending";
    }
  }
  if (patch.status !== undefined) {
    next.status = patch.status;
    if (next.repeat !== "none") {
      next.occurrenceStatus = { ...(next.occurrenceStatus || {}), [next.date]: patch.status };
    }
    if (patch.status === "done") next.kind = "record";
  }
  if (patch.note !== undefined) next.note = patch.note?.trim() || undefined;
  // 补全旧数据缺 kind
  if (!next.kind) next.kind = resolveActivityKind(next);
  rows[idx] = next;
  saveRaw(rows);
  return next;
}

export function deleteActivity(id: string): boolean {
  const rows = loadRaw();
  const next = rows.filter((a) => a.id !== id);
  if (next.length === rows.length) return false;
  saveRaw(next);
  return true;
}

/** 将某发生日标为已完成（仅用户点卡片或管理页） */
export function markOccurrenceDone(activityId: string, occurrenceDate: string): ActivityItem | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(occurrenceDate)) throw new Error("日期格式应为 YYYY-MM-DD");
  const rows = loadRaw();
  const idx = rows.findIndex((a) => a.id === activityId);
  if (idx < 0) return null;
  const cur = rows[idx];
  const next: ActivityItem = { ...cur, updatedAt: new Date().toISOString() };
  if (next.repeat === "none") {
    next.status = "done";
    next.kind = "record";
  } else {
    next.occurrenceStatus = { ...(next.occurrenceStatus || {}), [occurrenceDate]: "done" };
    // 锚点日若刚好是该发生日，同步顶层 status 便于列表展示
    if (next.date === occurrenceDate) {
      next.status = "done";
      next.kind = "record";
    }
  }
  rows[idx] = next;
  saveRaw(rows);
  return next;
}

export function saveActivities(items: ActivityItem[]): void {
  saveRaw(items);
}
