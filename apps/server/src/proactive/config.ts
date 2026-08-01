import type { AppSettings } from "../config.js";
import type { ChatMessage } from "../store/chats.js";
import { expandPromptMacros } from "../promptMacros.js";

export const PROACTIVE_TZ = "Asia/Shanghai";

export const DEFAULT_PROACTIVE_PROMPT = `[主动消息 · 仅本轮]
{{user}}已经有一阵子没回你了。请以{{char}}的身份，主动发一条自然的消息来「找{{user}}」——可以是关心、撒娇、拌嘴或随意聊天，符合你的人设。
要求：
1. 只输出一条可直接发送的消息正文，不要 meta 说明
2. 若本轮有「工具 · 活动提醒 / Keep」系统块，可自然用上这些事实；不要假装调用了未给出的工具、图片或音乐卡片
3. 简短自然，1–3 句即可
4. 不要重复你上一条说过的话`;

export type ProactiveTimingMode = "random" | "fixed";

export interface ProactiveConfig {
  minGapHours: number;
  maxRandomHours: number;
  timingMode: ProactiveTimingMode;
  fixedTime: string;
  quietStartHour: number;
  quietEndHour: number;
  prompt: string;
}

export function getProactiveConfig(settings: AppSettings): ProactiveConfig {
  const mode = settings.proactiveTimingMode === "fixed" ? "fixed" : "random";
  return {
    minGapHours: clampHours(settings.proactiveMinGapHours, 1, 72, 3),
    maxRandomHours: clampHours(settings.proactiveMaxRandomHours, 0, 72, 0),
    timingMode: mode,
    fixedTime: normalizeTime(settings.proactiveFixedTime, "20:00"),
    quietStartHour: clampHour(settings.proactiveQuietStartHour, 0, 23, 22),
    quietEndHour: clampHour(settings.proactiveQuietEndHour, 0, 23, 10),
    prompt: settings.proactivePrompt?.trim() || DEFAULT_PROACTIVE_PROMPT,
  };
}

/** 展开 {{char}} {{user}} {{idle_duration}} {{time}} {{date}} {{weekday}} 等 */
export function renderProactivePrompt(
  template: string,
  charName: string,
  userName: string,
  chatMessages: ChatMessage[] = []
): string {
  return expandPromptMacros(template, {
    charName,
    userName,
    chatMessages,
  });
}

function clampHours(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, v));
}

function clampHour(n: unknown, min: number, max: number, fallback: number): number {
  return clampHours(n, min, max, fallback);
}

function normalizeTime(raw: unknown, fallback: string): string {
  const t = String(raw || "").trim();
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return fallback;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23 || min < 0 || min > 59) return fallback;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function shanghaiParts(date: Date): { y: number; m: number; d: number; h: number; min: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: PROACTIVE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(date);
  const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  return {
    y: pick("year"),
    m: pick("month"),
    d: pick("day"),
    h: pick("hour"),
    min: pick("minute"),
  };
}

function zonedDateTimeMs(y: number, m: number, d: number, h: number, min = 0): number {
  const guess = new Date(Date.UTC(y, m - 1, d, h - 8, min, 0, 0));
  const parts = shanghaiParts(guess);
  const deltaH = h - parts.h;
  const deltaD = d - parts.d;
  return guess.getTime() + deltaD * 86400000 + deltaH * 3600000 + (min - parts.min) * 60000;
}

function isHourInActiveWindow(h: number, cfg: ProactiveConfig): boolean {
  if (cfg.quietStartHour === cfg.quietEndHour) return true;
  if (cfg.quietStartHour > cfg.quietEndHour) {
    return h >= cfg.quietEndHour && h < cfg.quietStartHour;
  }
  return h < cfg.quietStartHour || h >= cfg.quietEndHour;
}

/** 当前是否在允许主动消息的时间段内 */
export function isProactiveActiveHour(cfg: ProactiveConfig, now = new Date()): boolean {
  const { h } = shanghaiParts(now);
  return isHourInActiveWindow(h, cfg);
}

function sameDayQuietStartMs(from: Date, cfg: ProactiveConfig): number {
  const { y, m, d } = shanghaiParts(from);
  return zonedDateTimeMs(y, m, d, cfg.quietStartHour);
}

function nextActiveDayStartMs(from: Date, cfg: ProactiveConfig): number {
  const { y, m, d, h } = shanghaiParts(from);
  if (cfg.quietStartHour > cfg.quietEndHour && h < cfg.quietEndHour) {
    return zonedDateTimeMs(y, m, d, cfg.quietEndHour);
  }
  let day = d;
  let month = m;
  let year = y;
  if (!isHourInActiveWindow(h, cfg)) {
    const next = new Date(from.getTime() + 86400000);
    const p = shanghaiParts(next);
    year = p.y;
    month = p.m;
    day = p.d;
  }
  return zonedDateTimeMs(year, month, day, cfg.quietEndHour);
}

/** 若落在静默时段，推到当前或下一个活跃窗口起点 */
export function alignToActiveWindowStart(at: Date, cfg: ProactiveConfig): Date {
  const { h, y, m, d } = shanghaiParts(at);
  if (isHourInActiveWindow(h, cfg)) return at;
  if (cfg.quietStartHour > cfg.quietEndHour && h < cfg.quietEndHour) {
    return new Date(zonedDateTimeMs(y, m, d, cfg.quietEndHour));
  }
  return new Date(nextActiveDayStartMs(at, cfg));
}

function parseFixedTime(cfg: ProactiveConfig): { h: number; min: number } {
  const [h, min] = cfg.fixedTime.split(":").map(Number);
  return { h, min };
}

function fixedTimeMsOnDay(y: number, m: number, d: number, cfg: ProactiveConfig): number {
  const { h, min } = parseFixedTime(cfg);
  return zonedDateTimeMs(y, m, d, h, min);
}

function computeFixedNext(lastUserAt: Date, cfg: ProactiveConfig): string {
  const now = Date.now();
  const { h: fh } = parseFixedTime(cfg);
  if (!isHourInActiveWindow(fh, cfg)) {
    throw new Error("固定发送时间落在免打扰时段内，请调整 heartbeat 设置");
  }

  // 定点模式：按「下一个尚未到达的钟点」预约（今天未过用今天，已过用明天）
  // 不再用「最小间隔」把今天的点顶到明天——否则刚聊完再设「10 分钟后」会永远落到次日
  const { y, m, d } = shanghaiParts(new Date(Math.max(now, lastUserAt.getTime())));
  let candidateMs = fixedTimeMsOnDay(y, m, d, cfg);
  // 已过该点（含刚好踩点正在聊）→ 下一天同一时刻；留 30 秒缓冲避免边设边触发
  if (candidateMs <= now + 30_000) {
    const nextDay = new Date(candidateMs + 86400000);
    const p = shanghaiParts(nextDay);
    candidateMs = fixedTimeMsOnDay(p.y, p.m, p.d, cfg);
  }
  return new Date(candidateMs).toISOString();
}

function computeRandomNext(lastUserAt: Date, cfg: ProactiveConfig): string {
  const now = Date.now();
  let earliest = new Date(lastUserAt.getTime() + cfg.minGapHours * 3600000);
  earliest = alignToActiveWindowStart(earliest, cfg);
  if (earliest.getTime() < now) {
    earliest = alignToActiveWindowStart(new Date(now), cfg);
  }

  const quietStart = sameDayQuietStartMs(earliest, cfg);
  let latestMs = quietStart;
  const spreadHours = cfg.maxRandomHours > 0 ? cfg.maxRandomHours : 4;
  latestMs = Math.min(quietStart, earliest.getTime() + spreadHours * 3600000);

  if (earliest.getTime() >= latestMs) {
    earliest = alignToActiveWindowStart(new Date(latestMs + 60_000), cfg);
    const end = sameDayQuietStartMs(earliest, cfg);
    const span = Math.max(end - earliest.getTime(), 60_000);
    return new Date(earliest.getTime() + Math.random() * span).toISOString();
  }

  const span = Math.max(latestMs - earliest.getTime(), 60_000);
  return new Date(earliest.getTime() + Math.random() * span).toISOString();
}

/** 用户发消息后，预约下一次主动消息时间 */
export function computeNextProactiveAt(lastUserAt: Date, cfg: ProactiveConfig): string {
  if (cfg.timingMode === "fixed") return computeFixedNext(lastUserAt, cfg);
  return computeRandomNext(lastUserAt, cfg);
}
