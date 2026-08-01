import { loadSettings } from "../config.js";
import { digestPersonaPortrait } from "./digest.js";
import {
  loadPersonaDigestState,
  recordPersonaDigestResult,
  savePersonaDigestState,
} from "./digestState.js";
import { ensurePersonaDirs } from "./store.js";

/** 每日一次 */
const INTERVAL_MS = 24 * 60 * 60 * 1000;
const TICK_MS = 30 * 60 * 1000;
let ticking = false;

/** 下一轮落在 ~02:00 */
function scheduleNext(from = Date.now()): string {
  const next = new Date(from);
  next.setHours(2, 0, 0, 0);
  if (next.getTime() <= from) {
    next.setTime(next.getTime() + INTERVAL_MS);
  }
  return next.toISOString();
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const state = loadPersonaDigestState();
    const now = Date.now();
    if (!state.nextRunAt) {
      state.nextRunAt = scheduleNext(now);
      savePersonaDigestState(state);
      return;
    }
    if (now < new Date(state.nextRunAt).getTime()) return;

    // 关闭夜间归纳：到期只推下一轮，不调模型
    if (loadSettings().personaDigestEnabled === false) {
      state.nextRunAt = scheduleNext(now);
      savePersonaDigestState(state);
      return;
    }

    const hour = new Date().getHours();
    // 仅在 1–4 点窗口执行
    if (hour < 1 || hour >= 5) {
      const tonight = new Date();
      tonight.setHours(2, 0, 0, 0);
      if (tonight.getTime() <= now) tonight.setDate(tonight.getDate() + 1);
      state.nextRunAt = tonight.toISOString();
      savePersonaDigestState(state);
      return;
    }

    console.log("[persona] 开始整理人格画像…");
    const sinceMs = state.lastRunAt
      ? new Date(state.lastRunAt).getTime()
      : now - 36 * 60 * 60 * 1000;
    const result = await digestPersonaPortrait({ sinceMs });
    recordPersonaDigestResult({
      wrote: result.wrote,
      reason: result.reason,
      source: "scheduled",
    });
    const next = loadPersonaDigestState();
    next.nextRunAt = scheduleNext(now);
    savePersonaDigestState(next);
    console.log(
      `[persona] 整理完成：写入 ${result.wrote} 条；下次 ${next.nextRunAt}`
    );
  } catch (err) {
    console.error("[persona] 调度失败:", err instanceof Error ? err.message : err);
  } finally {
    ticking = false;
  }
}

export function startPersonaDigestScheduler(): void {
  ensurePersonaDirs();
  void tick().catch((err) =>
    console.error("[persona] tick 未捕获:", err instanceof Error ? err.message : err)
  );
  setInterval(() => {
    void tick().catch((err) =>
      console.error("[persona] tick 未捕获:", err instanceof Error ? err.message : err)
    );
  }, TICK_MS);
}
