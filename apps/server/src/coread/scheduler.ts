import fs from "fs";
import path from "path";
import { MEMORY_DIR, ensureDataDir } from "../config.js";
import { digestAllCoreadDrafts } from "./digest.js";

const STATE_PATH = path.join(MEMORY_DIR, "coread-digest-state.json");
/** 每 2 日一次 */
const INTERVAL_MS = 2 * 24 * 60 * 60 * 1000;
const TICK_MS = 30 * 60 * 1000;
let ticking = false;

interface DigestState {
  lastRunAt: string | null;
  nextRunAt: string | null;
}

function loadState(): DigestState {
  ensureDataDir();
  if (!fs.existsSync(STATE_PATH)) {
    return { lastRunAt: null, nextRunAt: null };
  }
  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) as DigestState;
  } catch {
    return { lastRunAt: null, nextRunAt: null };
  }
}

function saveState(state: DigestState): void {
  ensureDataDir();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

function scheduleNext(from = Date.now()): string {
  // 落在安静凌晨窗口 1:30 附近，避免整点扎堆
  const next = new Date(from + INTERVAL_MS);
  next.setHours(1, 30, 0, 0);
  if (next.getTime() <= from) {
    next.setTime(next.getTime() + INTERVAL_MS);
  }
  return next.toISOString();
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const state = loadState();
    const now = Date.now();
    if (!state.nextRunAt) {
      state.nextRunAt = scheduleNext(now);
      saveState(state);
      return;
    }
    if (now < new Date(state.nextRunAt).getTime()) return;

    const hour = new Date().getHours();
    // 仅在 0–5 点窗口执行，避免白天占算力
    if (hour >= 5) {
      const tonight = new Date();
      tonight.setHours(1, 30, 0, 0);
      if (tonight.getTime() <= now) tonight.setDate(tonight.getDate() + 1);
      state.nextRunAt = tonight.toISOString();
      saveState(state);
      return;
    }

    console.log("[coread] 开始扫描共读草稿…");
    const result = await digestAllCoreadDrafts();
    state.lastRunAt = new Date().toISOString();
    state.nextRunAt = scheduleNext(now);
    saveState(state);
    console.log(
      `[coread] 整理完成：${result.books} 本书，新增/更新 ${result.points} 条论点；下次 ${state.nextRunAt}`
    );
  } catch (err) {
    console.error("[coread] 调度失败:", err instanceof Error ? err.message : err);
  } finally {
    ticking = false;
  }
}

export function startCoreadDigestScheduler(): void {
  void tick().catch((err) =>
    console.error("[coread] tick 未捕获:", err instanceof Error ? err.message : err)
  );
  setInterval(() => {
    void tick().catch((err) =>
      console.error("[coread] tick 未捕获:", err instanceof Error ? err.message : err)
    );
  }, TICK_MS);
}
