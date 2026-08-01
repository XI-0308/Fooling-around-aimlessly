import { loadSettings } from "../config.js";
import { appendAssistantMessage, getChat, listChats } from "../store/chats.js";
import { generateProactiveMessage } from "./generate.js";
import { getProactiveConfig, isProactiveActiveHour } from "./config.js";
import {
  clearProactiveSchedule,
  getChatNextProactiveAt,
  hasProactiveAfterLastUser,
  lastUserMessageAt,
  scheduleProactiveForChat,
} from "./state.js";
import { sendWebPushToAll } from "../push/send.js";

const TICK_MS = 5 * 60 * 1000;
let ticking = false;

function ensureSchedule(chatId: string): string | null {
  const chat = getChat(chatId);
  if (!chat) return null;
  const lastUser = lastUserMessageAt(chat);
  if (!lastUser) return null;

  let nextAt = getChatNextProactiveAt(chatId);
  if (!nextAt && !hasProactiveAfterLastUser(chat)) {
    scheduleProactiveForChat(chatId, lastUser);
    nextAt = getChatNextProactiveAt(chatId);
  }
  return nextAt;
}

async function trySendProactive(chatId: string): Promise<boolean> {
  const settings = loadSettings();
  if (settings.proactiveMessagingEnabled === false) return false;

  const chat = getChat(chatId);
  if (!chat) return false;

  const lastUser = lastUserMessageAt(chat);
  if (!lastUser) return false;
  if (hasProactiveAfterLastUser(chat)) return false;

  const nextAt = ensureSchedule(chatId);
  if (!nextAt) return false;
  if (Date.now() < new Date(nextAt).getTime()) return false;
  if (!isProactiveActiveHour(getProactiveConfig(settings))) return false;

  try {
    const { content, contextLog, reasoning } = await generateProactiveMessage(chatId);
    appendAssistantMessage(chatId, content, contextLog, reasoning, undefined, undefined, {
      proactive: true,
    });
    clearProactiveSchedule(chatId);
    console.log(`[proactive] ${chat.characterName} → 主动消息已发送 (${chatId.slice(0, 8)}…)`);
    const preview = content.replace(/\s+/g, " ").trim().slice(0, 100);
    void sendWebPushToAll({
      // iOS PWA 固定插一行「from 应用名」；标题再写 WE-E 会叠成两遍。
      // 标题用零宽字符占位，视觉上就是：from WE-E → 角色：正文
      title: "\u200b",
      body: `${chat.characterName || "角色"}：${preview || "点开看看"}`,
      url: `/chat/${chatId}`,
      tag: "ef-heartbeat",
      unreadCount: 1,
    }).catch((err) => {
      console.warn("[push] heartbeat 推送失败:", err instanceof Error ? err.message : err);
    });
    return true;
  } catch (err) {
    console.error("[proactive] 发送失败:", err instanceof Error ? err.message : err);
    return false;
  }
}

async function tick(): Promise<void> {
  if (ticking) return;
  ticking = true;
  try {
    const settings = loadSettings();
    if (settings.proactiveMessagingEnabled === false) return;
    if (!isProactiveActiveHour(getProactiveConfig(settings))) return;

    const chats = listChats();
    for (const chat of chats) {
      await trySendProactive(chat.id);
    }
  } finally {
    ticking = false;
  }
}

export function startProactiveScheduler(): void {
  void tick().catch((err) =>
    console.error("[proactive] tick 未捕获:", err instanceof Error ? err.message : err)
  );
  setInterval(() => {
    void tick().catch((err) =>
      console.error("[proactive] tick 未捕获:", err instanceof Error ? err.message : err)
    );
  }, TICK_MS);
  console.log("[proactive] heartbeat 调度已启动（每 5 分钟检查）");
}

export { scheduleProactiveForChat } from "./state.js";