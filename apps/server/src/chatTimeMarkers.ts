import type { ChatMessage } from "./store/chats.js";
import { formatClockDayLabel, todayYmd } from "./activity/time.js";

const TZ = "Asia/Shanghai";

function shanghaiYmdHm(d: Date): { ymd: string; hm: string; y: number; m: number; day: number } | null {
  if (Number.isNaN(d.getTime())) return null;
  const raw = d.toLocaleString("sv-SE", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  // 2026-07-26 10:37
  const m = /^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})/.exec(raw);
  if (!m) return null;
  return {
    ymd: `${m[1]}-${m[2]}-${m[3]}`,
    hm: m[4],
    y: Number(m[1]),
    m: Number(m[2]),
    day: Number(m[3]),
  };
}

/** 上海时区绝对时间：2026-07-26 10:37 */
export function formatShanghaiDateTime(iso: string): string {
  const d = new Date(iso);
  const parts = shanghaiYmdHm(d);
  if (!parts) return "";
  return `${parts.ymd} ${parts.hm}`;
}

/** @deprecated 历史相对「多久以前」已不再注入 prompt；保留供其它调用 */
export function formatRelativeAgo(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "未知";
  let ms = now.getTime() - then.getTime();
  if (ms < 0) ms = 0;
  if (ms < 60_000) return "刚刚";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    const rem = mins % 60;
    return rem > 0 ? `${hours} 小时 ${rem} 分钟前` : `${hours} 小时前`;
  }
  const days = Math.floor(hours / 24);
  if (days < 30) {
    const remH = hours % 24;
    return remH > 0 ? `${days} 天 ${remH} 小时前` : `${days} 天前`;
  }
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} 个月前`;
  const years = Math.floor(days / 365);
  return `${years} 年前`;
}

/**
 * 每条历史消息前的时钟行（给模型读）：
 * 今天 （周二）10:37 / 昨天 （周一）22:01 / 上周三 09:15
 */
export function formatMessageClock(iso: string, now: Date = new Date()): string {
  const then = shanghaiYmdHm(new Date(iso));
  if (!then) return "";
  const today = todayYmd(now);
  const dayLabel = formatClockDayLabel(then.ymd, today);
  return `${dayLabel} ${then.hm}`;
}

/**
 * @deprecated 跨天分隔已取消；保留函数签名以免外部引用炸掉。
 * 现改为每条消息自带时钟，不再插入 system 时间线行。
 */
export function buildChatTimeMarkers(
  _prev: ChatMessage | null,
  curr: ChatMessage,
  _depthFromEnd?: number,
  now: Date = new Date()
): { systemLines: string[]; clockPrefix: string | null } {
  const clock = curr.createdAt ? formatMessageClock(curr.createdAt, now) : null;
  return { systemLines: [], clockPrefix: clock || null };
}

export function isNewChatDay(prev: ChatMessage | null, curr: ChatMessage): boolean {
  if (!prev?.createdAt || !curr.createdAt) return Boolean(curr.createdAt);
  const a = formatShanghaiDateTime(prev.createdAt).slice(0, 10);
  const b = formatShanghaiDateTime(curr.createdAt).slice(0, 10);
  return a !== b;
}
