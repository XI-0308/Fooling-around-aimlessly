import { loadSettings } from "../config.js";
import { loadObsidianState, saveObsidianState } from "./state.js";
import { runObsidianNightly } from "./nightly.js";

const TICK_MS = 15 * 60 * 1000;
let ticking = false;

function scheduleNext(from = Date.now()): string {
  const settings = loadSettings();
  const hour = Math.min(23, Math.max(0, settings.obsidianNightlyHour ?? 21));
  const next = new Date(from);
  next.setHours(hour, 0, 0, 0);
  if (next.getTime() <= from) {
    next.setDate(next.getDate() + 1);
  }
  return next.toISOString();
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const settings = loadSettings();
    if (!settings.obsidianEnabled || !settings.obsidianNightlyEnabled) return;

    const state = loadObsidianState();
    const now = Date.now();
    if (!state.nextRunAt) {
      state.nextRunAt = scheduleNext(now);
      saveObsidianState(state);
      return;
    }
    if (now < new Date(state.nextRunAt).getTime()) return;

    const targetHour = Math.min(23, Math.max(0, settings.obsidianNightlyHour ?? 21));
    const hour = new Date().getHours();
    // 目标小时起 3 小时窗口内执行
    const inWindow =
      hour === targetHour ||
      hour === (targetHour + 1) % 24 ||
      hour === (targetHour + 2) % 24;
    if (!inWindow) {
      state.nextRunAt = scheduleNext(now);
      saveObsidianState(state);
      return;
    }

    console.log("[obsidian] 开始夜间留言…");
    const result = await runObsidianNightly();
    state.lastRunAt = new Date().toISOString();
    state.nextRunAt = scheduleNext(now);
    saveObsidianState(state);
    console.log(
      `[obsidian] 完成：留言 ${result.commented.length} 篇，错误 ${result.errors.length}；下次 ${state.nextRunAt}`
    );
  } catch (err) {
    console.error("[obsidian] 调度失败:", err instanceof Error ? err.message : err);
  } finally {
    ticking = false;
  }
}

export function startObsidianNightlyScheduler(): void {
  void tick().catch((err) =>
    console.error("[obsidian] tick 未捕获:", err instanceof Error ? err.message : err)
  );
  setInterval(() => {
    void tick().catch((err) =>
      console.error("[obsidian] tick 未捕获:", err instanceof Error ? err.message : err)
    );
  }, TICK_MS);
  console.log("[obsidian] 夜间留言调度已启动（每 15 分钟检查）");
}

/** 设置变更后重算下次时间 */
export function rescheduleObsidianNightly(): void {
  const state = loadObsidianState();
  state.nextRunAt = scheduleNext(Date.now());
  saveObsidianState(state);
}
