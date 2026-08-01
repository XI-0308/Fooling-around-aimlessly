import type {
  ActivityItem,
  ActivityOccurrence,
  ActivityStatus,
  InjectedActivitySnap,
} from "./types.js";
import { resolveActivityKind } from "./types.js";
import {
  addDaysYmd,
  diffDaysYmd,
  formatDayLabel,
  partOfDayLabel,
  todayYmd,
  type Ymd,
} from "./time.js";

function occStatus(item: ActivityItem, date: Ymd): ActivityStatus {
  if (item.repeat === "none") return item.status;
  return item.occurrenceStatus?.[date] || "pending";
}

function setOccStatus(item: ActivityItem, date: Ymd, status: ActivityStatus): ActivityItem {
  if (item.repeat === "none") {
    return { ...item, status, updatedAt: new Date().toISOString() };
  }
  return {
    ...item,
    occurrenceStatus: { ...(item.occurrenceStatus || {}), [date]: status },
    updatedAt: new Date().toISOString(),
  };
}

/** 过期未勾选 → missed（昨天及更早仍 pending 的） */
export function expirePastPending(
  items: ActivityItem[],
  today: Ymd
): { changed: boolean; items: ActivityItem[] } {
  let changed = false;
  const out = items.map((item) => {
    if (item.repeat === "none") {
      if (item.status === "pending" && diffDaysYmd(item.date, today) < 0) {
        changed = true;
        return { ...item, status: "missed" as const, updatedAt: new Date().toISOString() };
      }
      return item;
    }

    // 重复：把「今天之前」已展开过的发生日里仍 pending 的标 missed
    // daily：从锚点日走到昨天；月/年：只检查窗内可能出现过的点（下面按日扫近 400 天上限）
    let next = item;
    const start = item.date;
    if (diffDaysYmd(start, today) > 0) return item; // 尚未开始

    const last = addDaysYmd(today, -1);
    const cursorLimit = 400;
    let cursor = start;
    for (let i = 0; i < cursorLimit; i++) {
      if (diffDaysYmd(cursor, last) > 0) break;
      if (occursOn(item, cursor)) {
        const st = occStatus(next, cursor);
        if (st === "pending" && diffDaysYmd(cursor, today) < 0) {
          next = setOccStatus(next, cursor, "missed");
          changed = true;
        }
      }
      if (item.repeat === "daily") {
        cursor = addDaysYmd(cursor, 1);
      } else if (item.repeat === "monthly") {
        cursor = nextMonthSameDay(cursor, item.date);
        if (diffDaysYmd(cursor, start) <= 0 && i > 0) break;
      } else if (item.repeat === "yearly") {
        cursor = nextYearSameDay(cursor, item.date);
        if (diffDaysYmd(cursor, start) <= 0 && i > 0) break;
      } else break;
      if (diffDaysYmd(cursor, last) > 0) break;
    }
    return next;
  });
  return { changed, items: out };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function nextMonthSameDay(from: Ymd, anchor: Ymd): Ymd {
  const a = anchor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const f = from.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!a || !f) return addDaysYmd(from, 30);
  let y = Number(f[1]);
  let m = Number(f[2]) + 1;
  if (m > 12) {
    m = 1;
    y += 1;
  }
  const day = Number(a[3]);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad2(m)}-${pad2(Math.min(day, dim))}`;
}

function nextYearSameDay(from: Ymd, anchor: Ymd): Ymd {
  const a = anchor.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const f = from.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!a || !f) return addDaysYmd(from, 365);
  const y = Number(f[1]) + 1;
  const m = Number(a[2]);
  const day = Number(a[3]);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad2(m)}-${pad2(Math.min(day, dim))}`;
}

export function occursOn(item: ActivityItem, date: Ymd): boolean {
  if (item.repeat === "none") return item.date === date;
  if (diffDaysYmd(date, item.date) < 0) return false;
  if (item.repeat === "daily") return true;
  const a = item.date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!a || !d) return false;
  if (item.repeat === "monthly") return a[3] === d[3] || isClampedMonthEnd(date, Number(a[3]));
  if (item.repeat === "yearly") {
    return a[2] === d[2] && (a[3] === d[3] || isClampedMonthEnd(date, Number(a[3])));
  }
  return false;
}

function isClampedMonthEnd(date: Ymd, anchorDay: number): boolean {
  const d = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!d) return false;
  const y = Number(d[1]);
  const m = Number(d[2]);
  const day = Number(d[3]);
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return anchorDay > dim && day === dim;
}

/**
 * 窗口：往前 4 天（不含当天）+ 当天起共 3 天（今天/明天/后天）。
 * 每天重复：窗内只展示「今天」那一条。
 * 若今天及未来无任何条目，则再往前补，最多凑满约 7 天有内容或再扩 7 天。
 */
export function buildWindowOccurrences(
  items: ActivityItem[],
  today: Ymd = todayYmd()
): ActivityOccurrence[] {
  const forwardDates: Ymd[] = [today, addDaysYmd(today, 1), addDaysYmd(today, 2)];
  const pastDates: Ymd[] = [
    addDaysYmd(today, -4),
    addDaysYmd(today, -3),
    addDaysYmd(today, -2),
    addDaysYmd(today, -1),
  ];

  const collect = (dates: Ymd[]): ActivityOccurrence[] => {
    const rows: ActivityOccurrence[] = [];
    for (const date of dates) {
      for (const item of items) {
        if (!occursOn(item, date)) continue;
        // 每天：只展示当天
        if (item.repeat === "daily" && date !== today) continue;
        rows.push({
          activityId: item.id,
          title: item.title,
          date,
          time: item.time,
          partOfDay: item.partOfDay,
          remind: item.remind,
          kind: resolveActivityKind(item),
          status: occStatus(item, date),
          note: item.note,
          repeat: item.repeat,
        });
      }
    }
    return rows;
  };

  let rows = [...collect(pastDates), ...collect(forwardDates)];
  const hasTodayOrFuture = rows.some((r) => diffDaysYmd(r.date, today) >= 0);
  if (!hasTodayOrFuture) {
    const extra: Ymd[] = [];
    for (let i = 5; i <= 11; i++) extra.push(addDaysYmd(today, -i));
    // 无未来时，允许把「每天」的最近完成/未完成也带上？按规则每天只展示当天——当天若无则过去也不展 daily。
    const more = collect(extra).filter((r) => r.repeat !== "daily");
    rows = [...more, ...rows];
  }

  rows.sort((a, b) => {
    const dd = diffDaysYmd(a.date, b.date);
    if (dd !== 0) return dd;
    return a.title.localeCompare(b.title, "zh");
  });
  return rows;
}

function morphLabel(kind: ActivityOccurrence["kind"], status: ActivityStatus): string {
  if (status === "done") return "记录";
  if (kind === "promise") return "约定";
  if (kind === "record") return "记录";
  return "计划";
}

/**
 * 注入行规则：
 * - 过去（不含今天）：只写「哪天 + 标题」，不要形态、不要完成状态
 * - 今天及未来：保留 计划/约定/记录 +（未完成/已完成）
 */
export function formatActivityInjection(occs: ActivityOccurrence[], today: Ymd = todayYmd()): string {
  if (!occs.length) return "";
  return occs
    .map((o) => {
      const day = formatDayLabel(o.date, today);
      const when = partOfDayLabel(o.partOfDay, o.time);
      const timeBit = when ? ` ${when}` : "";
      const isPast = diffDaysYmd(o.date, today) < 0;

      if (isPast) {
        return `- ${day}${timeBit}：${o.title}`;
      }

      const morph = morphLabel(o.kind, o.status);
      const base = `- ${day}${timeBit} ${morph}：${o.title}`;
      if (o.status === "done") {
        return `${base}（已完成）`;
      }
      const remindTag = o.remind === "remind" && o.status === "pending" ? "，需提醒" : "";
      return `${base}（未完成${remindTag}）`;
    })
    .join("\n");
}

export function buildRemindSnaps(occs: ActivityOccurrence[]): InjectedActivitySnap[] {
  return occs
    .filter((o) => o.remind === "remind" && o.status === "pending")
    .map((o) => ({
      activityId: o.activityId,
      occurrenceDate: o.date,
      title: o.title,
    }));
}
