import type { ChatMessage } from "./store/chats.js";

export interface MacroContext {
  charName: string;
  userName: string;
  chatMessages: ChatMessage[];
}

const WEEKDAYS = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatTime(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatIdle(ms: number): string {
  if (ms < 60_000) return "不到 1 分钟";
  const mins = Math.floor(ms / 60_000);
  if (mins < 60) return `${mins} 分钟`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时 ${mins % 60} 分钟`;
  const days = Math.floor(hours / 24);
  return `${days} 天 ${hours % 24} 小时`;
}

function formatTimeDiff(startIso: string, end: Date): string {
  const start = new Date(startIso);
  if (Number.isNaN(start.getTime())) return "未知";
  const ms = end.getTime() - start.getTime();
  if (ms < 0) return "0 天";
  const days = Math.floor(ms / 86_400_000);
  if (days >= 1) return `${days} 天`;
  const hours = Math.floor(ms / 3_600_000);
  if (hours >= 1) return `${hours} 小时`;
  return formatIdle(ms);
}


function computeIdleDuration(messages: ChatMessage[], now: Date): string {
  const userMsgs = messages.filter((m) => m.role === "user");
  if (userMsgs.length === 0) return "（首次对话）";

  const lastUser = userMsgs[userMsgs.length - 1];
  const lastUserAt = new Date(lastUser.createdAt);
  const lastMsg = messages[messages.length - 1];

  // 正在回复用户刚发的消息：用「上一条用户消息 → 本条用户消息」的间隔
  if (lastMsg?.role === "user") {
    if (userMsgs.length === 1) return "（首次对话）";
    const prevUser = userMsgs[userMsgs.length - 2];
    const prevAt = new Date(prevUser.createdAt);
    return formatIdle(lastUserAt.getTime() - prevAt.getTime());
  }

  // 主动消息等场景：距用户最后一次发言至今
  return formatIdle(now.getTime() - lastUserAt.getTime());
}

/** 扩展 {{time}} {{date}} {{weekday}} {{idle_duration}} {{timeDiff::…::…}} */
export function expandPromptMacros(text: string, ctx: MacroContext): string {
  const now = new Date();
  const idleText = computeIdleDuration(ctx.chatMessages, now);

  let out = text
    .replace(/\{\{char\}\}/g, ctx.charName)
    .replace(/\{\{user\}\}/g, ctx.userName)
    .replace(/\{\{time\}\}/g, formatTime(now))
    .replace(/\{\{date\}\}/g, formatDate(now))
    .replace(/\{\{weekday\}\}/g, WEEKDAYS[now.getDay()] ?? "")
    .replace(/\{\{idle_duration\}\}/g, idleText);

  out = out.replace(/\{\{timeDiff::([^:}]+)::([^}]+)\}\}/g, (_m, startRaw, endRaw) => {
    const endStr = endRaw.trim().replace(/\{\{date\}\}/g, formatDate(now));
    const end = endStr.match(/^\d{4}-\d{2}-\d{2}$/) ? new Date(endStr) : now;
    return formatTimeDiff(startRaw.trim(), end);
  });

  return out;
}
