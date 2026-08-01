/** 记忆时间戳 → 「距今约X天/月/年」 */
export function formatRelativeTimeSpan(iso: string, nowMs = Date.now()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diffMs = nowMs - t;
  const past = diffMs >= 0;
  const abs = Math.abs(diffMs);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  let span: string;
  if (abs < hour) {
    const m = Math.max(1, Math.floor(abs / minute));
    span = `${m}分钟`;
  } else if (abs < day) {
    const h = Math.floor(abs / hour);
    span = `${h}小时`;
  } else if (abs < 30 * day) {
    const d = Math.floor(abs / day);
    span = `${d}天`;
  } else if (abs < 365 * day) {
    const months = Math.floor(abs / (30 * day));
    span = `${Math.max(1, months)}个月`;
  } else {
    const years = Math.floor(abs / (365 * day));
    const remDays = Math.floor((abs % (365 * day)) / day);
    const remMonths = Math.floor(remDays / 30);
    span = remMonths > 0 ? `${years}年${remMonths}个月` : `${years}年`;
  }
  return past ? `距今约${span}` : `约${span}后`;
}
