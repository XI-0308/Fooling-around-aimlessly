const TZ = "Asia/Shanghai";

export type Ymd = string; // YYYY-MM-DD

/** 日=0 … 六=6，与 Date#getUTCDay 对齐 */
const WEEKDAY_CN = ["日", "一", "二", "三", "四", "五", "六"] as const;

function shanghaiParts(d: Date): { y: number; m: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || "0";
  return { y: Number(get("year")), m: Number(get("month")), day: Number(get("day")) };
}

export function todayYmd(now: Date = new Date()): Ymd {
  const { y, m, day } = shanghaiParts(now);
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseYmd(ymd: Ymd): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return null;
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** 上海日历日加减；返回 YYYY-MM-DD */
export function addDaysYmd(ymd: Ymd, delta: number): Ymd {
  const p = parseYmd(ymd);
  if (!p) return ymd;
  // 用 UTC 正午避免 DST；上海无 DST，仍足够稳
  const utc = Date.UTC(p.y, p.m - 1, p.d + delta, 12, 0, 0);
  const { y, m, day } = shanghaiParts(new Date(utc));
  return `${y}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function diffDaysYmd(a: Ymd, b: Ymd): number {
  const pa = parseYmd(a);
  const pb = parseYmd(b);
  if (!pa || !pb) return 0;
  const ua = Date.UTC(pa.y, pa.m - 1, pa.d);
  const ub = Date.UTC(pb.y, pb.m - 1, pb.d);
  return Math.round((ua - ub) / 86_400_000);
}

/** 该日历日的星期字：一…日（按公历日期，与上海账本 YYYY-MM-DD 一致） */
export function weekdayCharYmd(ymd: Ymd): string {
  const p = parseYmd(ymd);
  if (!p) return "";
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  return WEEKDAY_CN[dow] ?? "";
}

/** 以周一起算的周序号（用于这周/上周） */
function mondayWeekKey(ymd: Ymd): number {
  const p = parseYmd(ymd);
  if (!p) return 0;
  const utcDays = Math.floor(Date.UTC(p.y, p.m - 1, p.d) / 86_400_000);
  const dow = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
  const fromMonday = (dow + 6) % 7;
  return utcDays - fromMonday;
}

/**
 * 活动账本 / 相对日：
 * 明天/今天/昨天/前天 → 固定词；
 * 再远 → 这周X / 上周X / 下周X；更远回退 M月D日
 */
export function formatDayLabel(ymd: Ymd, today: Ymd): string {
  const diff = diffDaysYmd(ymd, today);
  if (diff === -2) return "前天";
  if (diff === -1) return "昨天";
  if (diff === 0) return "今天";
  if (diff === 1) return "明天";
  if (diff === 2) return "后天";

  const w = weekdayCharYmd(ymd);
  const weekDiff = Math.round((mondayWeekKey(ymd) - mondayWeekKey(today)) / 7);
  if (w) {
    if (weekDiff === 0) return `这周${w}`;
    if (weekDiff === -1) return `上周${w}`;
    if (weekDiff === 1) return `下周${w}`;
    if (weekDiff === -2) return `上上周${w}`;
    if (weekDiff === 2) return `下下周${w}`;
  }

  const p = parseYmd(ymd);
  if (!p) return ymd;
  return `${p.m}月${p.d}日`;
}

/**
 * 对话历史时钟日标签：
 * 昨天 （周一） / 今天 （周二） / 上周三 / 7月10日（周五）
 */
export function formatClockDayLabel(ymd: Ymd, today: Ymd): string {
  const diff = diffDaysYmd(ymd, today);
  const w = weekdayCharYmd(ymd);
  if (diff === 0) return `今天 （周${w}）`;
  if (diff === -1) return `昨天 （周${w}）`;
  if (diff === -2) return `前天 （周${w}）`;
  if (diff === 1) return `明天 （周${w}）`;
  if (diff === 2) return `后天 （周${w}）`;

  const label = formatDayLabel(ymd, today);
  if (/^(这周|上周|下周|上上周|下下周)/.test(label)) return label;
  return w ? `${label}（周${w}）` : label;
}

export function partOfDayLabel(
  part?: "morning" | "afternoon" | "evening" | null,
  time?: string
): string {
  if (time?.trim()) return time.trim();
  if (part === "morning") return "早上";
  if (part === "afternoon") return "下午";
  if (part === "evening") return "晚间";
  return "";
}
