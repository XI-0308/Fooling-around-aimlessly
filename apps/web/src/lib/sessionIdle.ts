/** 无操作超过此时间需重新登录（与后端 SESSION_IDLE_MINUTES 保持一致） */
export const SESSION_IDLE_MS =
  (Number(process.env.NEXT_PUBLIC_SESSION_IDLE_MINUTES) || 30) * 60 * 1000;

export const LAST_ACTIVITY_KEY = "rp-agent-last-activity";

export function touchLocalActivity(): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
}

export function clearLocalActivity(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LAST_ACTIVITY_KEY);
}

export function isLocallyIdle(): boolean {
  if (typeof window === "undefined") return false;
  const raw = localStorage.getItem(LAST_ACTIVITY_KEY);
  if (!raw) return false;
  const last = Number(raw);
  if (!Number.isFinite(last)) return false;
  return Date.now() - last > SESSION_IDLE_MS;
}
