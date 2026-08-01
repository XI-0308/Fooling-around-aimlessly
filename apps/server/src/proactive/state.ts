import fs from "fs";
import path from "path";
import { DATA_DIR, ensureDataDir } from "../config.js";
import type { ChatMessage, ChatSession } from "../store/chats.js";
import { listChats } from "../store/chats.js";
import { computeNextProactiveAt, getProactiveConfig } from "./config.js";
import { loadSettings } from "../config.js";

const STATE_PATH = path.join(DATA_DIR, "proactive-state.json");

export interface ProactiveChatState {
  nextProactiveAt?: string;
}

export interface ProactiveState {
  /** 用户最后一次「已读主动消息」的时间 */
  lastSeenAt: string;
  chats: Record<string, ProactiveChatState>;
}

const DEFAULT_STATE: ProactiveState = {
  lastSeenAt: new Date(0).toISOString(),
  chats: {},
};

function readState(): ProactiveState {
  ensureDataDir();
  if (!fs.existsSync(STATE_PATH)) return { ...DEFAULT_STATE, chats: {} };
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) as ProactiveState;
    return {
      lastSeenAt: raw.lastSeenAt || DEFAULT_STATE.lastSeenAt,
      chats: raw.chats || {},
    };
  } catch {
    return { ...DEFAULT_STATE, chats: {} };
  }
}

function writeState(state: ProactiveState): void {
  ensureDataDir();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

export function getProactiveState(): ProactiveState {
  return readState();
}

export function markProactiveSeen(at = new Date()): void {
  const state = readState();
  state.lastSeenAt = at.toISOString();
  writeState(state);
}

export function scheduleProactiveForChat(chatId: string, lastUserAt: Date): void {
  const cfg = getProactiveConfig(loadSettings());
  const state = readState();
  state.chats[chatId] = {
    ...state.chats[chatId],
    nextProactiveAt: computeNextProactiveAt(lastUserAt, cfg),
  };
  writeState(state);
}

export function clearProactiveSchedule(chatId: string): void {
  const state = readState();
  if (!state.chats[chatId]) return;
  delete state.chats[chatId].nextProactiveAt;
  writeState(state);
}

export function getChatNextProactiveAt(chatId: string): string | null {
  const state = readState();
  return state.chats[chatId]?.nextProactiveAt ?? null;
}

export function lastUserMessageAt(chat: ChatSession): Date | null {
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    if (chat.messages[i].role === "user") {
      return new Date(chat.messages[i].createdAt);
    }
  }
  return null;
}

export function hasProactiveAfterLastUser(chat: ChatSession): boolean {
  let lastUserIdx = -1;
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    if (chat.messages[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx < 0) return false;
  for (let i = lastUserIdx + 1; i < chat.messages.length; i++) {
    if (chat.messages[i].role === "assistant" && chat.messages[i].proactive) {
      return true;
    }
  }
  return false;
}

export function listUnreadProactive(chat: ChatSession, lastSeenAt: string): ChatMessage[] {
  const seenMs = new Date(lastSeenAt).getTime();
  return chat.messages.filter(
    (m) => m.role === "assistant" && m.proactive && new Date(m.createdAt).getTime() > seenMs
  );
}

export function countAllUnreadProactive(chats: ChatSession[]): {
  total: number;
  byChat: { chatId: string; count: number; preview: string; latestAt: string }[];
} {
  const state = readState();
  const byChat: { chatId: string; count: number; preview: string; latestAt: string }[] = [];
  let total = 0;
  for (const chat of chats) {
    const unread = listUnreadProactive(chat, state.lastSeenAt);
    if (unread.length === 0) continue;
    total += unread.length;
    const latest = unread[unread.length - 1];
    byChat.push({
      chatId: chat.id,
      count: unread.length,
      preview: latest.content.slice(0, 80),
      latestAt: latest.createdAt,
    });
  }
  return { total, byChat };
}

export function rescheduleAllProactiveChats(): number {
  let count = 0;
  for (const chat of listChats()) {
    const lastUser = lastUserMessageAt(chat);
    if (!lastUser || hasProactiveAfterLastUser(chat)) continue;
    scheduleProactiveForChat(chat.id, lastUser);
    count++;
  }
  return count;
}

export function getProactiveScheduleSummary(): {
  nextAt: string | null;
  nextAtLabel: string | null;
  items: { chatId: string; characterName: string; nextAt: string; nextAtLabel: string }[];
} {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  const items: { chatId: string; characterName: string; nextAt: string; nextAtLabel: string }[] = [];
  for (const chat of listChats()) {
    if (hasProactiveAfterLastUser(chat)) continue;
    const nextAt = getChatNextProactiveAt(chat.id);
    if (!nextAt) continue;
    items.push({
      chatId: chat.id,
      characterName: chat.characterName,
      nextAt,
      nextAtLabel: fmt(nextAt),
    });
  }
  items.sort((a, b) => a.nextAt.localeCompare(b.nextAt));
  const first = items[0];
  return {
    nextAt: first?.nextAt ?? null,
    nextAtLabel: first?.nextAtLabel ?? null,
    items,
  };
}
