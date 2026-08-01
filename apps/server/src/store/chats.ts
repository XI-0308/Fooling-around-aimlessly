import fs from "fs";
import path from "path";
import crypto from "crypto";
import { CHATS_DIR, ensureDataDir } from "../config.js";
import type { MemoryCitation } from "../memoryCitationFormat.js";
import type { InjectedMemorySnap } from "../memory/injectedSnap.js";
import type { InjectedActivitySnap } from "../activity/types.js";
import { formatMusicShareNote } from "../tools/enrichMarkers.js";


export type AttachmentKind = "image" | "document" | "audio" | "other";

export interface MessageAttachment {
  id: string;
  name: string;
  mimeType: string;
  kind: AttachmentKind;
  size: number;
  /** 语音时长（秒），可选 */
  durationSec?: number;
}

export interface MusicCard {
  songId: number;
  name: string;
  artists: string;
  album?: string;
  coverUrl: string;
  webUrl: string;
  appUrl: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  /** DeepSeek 思维链 / reasoning（deepseek-reasoner 等） */
  reasoning?: string;
  contextLog?: Record<string, unknown>;
  attachments?: MessageAttachment[];
  /** 网易云歌曲卡片（点歌 follow-up） */
  musicCard?: MusicCard;
  /** 角色主动找用户（定时发消息） */
  proactive?: boolean;
  /** 发送时引用的记忆（界面显示原文，prompt 历史里扩写） */
  memoryCitation?: MemoryCitation;
  /** 本轮自动注入的事件记忆（回复下方可打 ♥/×） */
  injectedMemories?: InjectedMemorySnap[];
  /** 本轮需提醒的活动（回复下方可 √ 完成） */
  injectedActivities?: InjectedActivitySnap[];
}

/** 滚动对话摘要：覆盖「刚被 TOKEN 裁掉的最近一段」；每 5 轮刷新一次 */
export interface ChatHistorySummary {
  coveredCount: number;
  fromMessageId: string;
  throughMessageId: string;
  /** 生成摘要时聊天总消息数；用于判断是否已满 5 轮该刷新 */
  atMessageCount: number;
  text: string;
  updatedAt: string;
}

export interface ChatSession {
  id: string;
  characterId: string;
  characterName: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
  /** 前 N 条消息的流水账摘要，插入聊天历史块 */
  historySummary?: ChatHistorySummary;
}

function chatPath(id: string): string {
  return path.join(CHATS_DIR, `${id}.json`);
}

export function getChatAttachmentsDir(chatId: string): string {
  return path.join(CHATS_DIR, "attachments", chatId);
}

export function listChats(): ChatSession[] {
  ensureDataDir();
  if (!fs.existsSync(CHATS_DIR)) return [];
  return fs
    .readdirSync(CHATS_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readJsonFile<ChatSession>(path.join(CHATS_DIR, f), null as unknown as ChatSession))
    .filter(Boolean)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getChat(id: string): ChatSession | null {
  const file = chatPath(id);
  if (!fs.existsSync(file)) return null;
  return readJsonFile<ChatSession>(file, null as unknown as ChatSession);
}

export function saveChat(chat: ChatSession): void {
  ensureDataDir();
  if (!fs.existsSync(CHATS_DIR)) fs.mkdirSync(CHATS_DIR, { recursive: true });
  chat.updatedAt = new Date().toISOString();
  // 紧凑写入：美化缩进会把 640 条含 contextLog 的会话撑到近 7MB，每次编辑都极慢
  fs.writeFileSync(chatPath(chat.id), JSON.stringify(chat), "utf-8");
}

export function updateChatMeta(id: string, patch: { title?: string }): ChatSession | null {
  const chat = getChat(id);
  if (!chat) return null;
  if (patch.title !== undefined) {
    const trimmed = patch.title.trim();
    chat.title = trimmed || chat.characterName;
  }
  saveChat(chat);
  return chat;
}

export function createChat(characterId: string, characterName: string, firstMessage: string): ChatSession {
  const now = new Date().toISOString();
  const chat: ChatSession = {
    id: crypto.randomUUID(),
    characterId,
    characterName,
    title: characterName,
    messages: firstMessage
      ? [
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: firstMessage,
            createdAt: now,
          },
        ]
      : [],
    createdAt: now,
    updatedAt: now,
  };
  saveChat(chat);
  return chat;
}

export function appendUserMessage(
  chatId: string,
  content: string,
  attachments?: MessageAttachment[],
  memoryCitation?: MemoryCitation
): ChatMessage {
  const chat = getChat(chatId);
  if (!chat) throw new Error("聊天不存在");
  const msg: ChatMessage = {
    id: crypto.randomUUID(),
    role: "user",
    content,
    createdAt: new Date().toISOString(),
    attachments: attachments?.length ? attachments : undefined,
    memoryCitation: memoryCitation?.text?.trim() ? memoryCitation : undefined,
  };
  chat.messages.push(msg);
  saveChat(chat);
  return msg;
}

export function appendAssistantMessage(
  chatId: string,
  content: string,
  contextLog?: Record<string, unknown>,
  reasoning?: string,
  attachments?: MessageAttachment[],
  musicCard?: MusicCard,
  meta?: {
    proactive?: boolean;
    injectedMemories?: InjectedMemorySnap[];
    injectedActivities?: InjectedActivitySnap[];
  }
): ChatMessage {
  const chat = getChat(chatId);
  if (!chat) throw new Error("聊天不存在");
  const msg: ChatMessage = {
    id: crypto.randomUUID(),
    role: "assistant",
    content,
    createdAt: new Date().toISOString(),
    contextLog,
    reasoning: reasoning || undefined,
    attachments: attachments?.length ? attachments : undefined,
    musicCard,
    proactive: meta?.proactive || undefined,
    injectedMemories: meta?.injectedMemories?.length ? meta.injectedMemories : undefined,
    injectedActivities: meta?.injectedActivities?.length ? meta.injectedActivities : undefined,
  };
  chat.messages.push(msg);
  saveChat(chat);
  return msg;
}

/** @deprecated 使用 appendUserMessage */
export function appendMessage(chatId: string, role: "user" | "assistant", content: string): ChatMessage {
  if (role === "user") return appendUserMessage(chatId, content);
  return appendAssistantMessage(chatId, content);
}

export function replaceLastAssistant(
  chatId: string,
  content: string,
  contextLog?: Record<string, unknown>,
  reasoning?: string,
  extras?: {
    musicCard?: MusicCard;
    attachments?: MessageAttachment[];
    injectedMemories?: InjectedMemorySnap[];
    injectedActivities?: InjectedActivitySnap[];
  }
): ChatMessage | null {
  const chat = getChat(chatId);
  if (!chat) return null;
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    if (chat.messages[i].role === "assistant") {
      chat.messages[i].content = content;
      chat.messages[i].createdAt = new Date().toISOString();
      if (contextLog) chat.messages[i].contextLog = contextLog;
      if (reasoning !== undefined) chat.messages[i].reasoning = reasoning || undefined;
      if (extras?.musicCard) chat.messages[i].musicCard = extras.musicCard;
      if (extras?.attachments?.length) {
        const prev = chat.messages[i].attachments || [];
        chat.messages[i].attachments = [...prev, ...extras.attachments];
      }
      if (extras?.injectedMemories !== undefined) {
        chat.messages[i].injectedMemories = extras.injectedMemories.length
          ? extras.injectedMemories
          : undefined;
      }
      if (extras?.injectedActivities !== undefined) {
        chat.messages[i].injectedActivities = extras.injectedActivities.length
          ? extras.injectedActivities
          : undefined;
      }
      saveChat(chat);
      return chat.messages[i];
    }
  }
  return null;
}

/** 更新某条助手消息上的记忆评分 */
export function patchMessageInjectedMemoryRating(
  chatId: string,
  messageId: string,
  chunkId: string,
  rating: "up" | "down" | null
): ChatMessage | null {
  const chat = getChat(chatId);
  if (!chat) return null;
  const msg = chat.messages.find((m) => m.id === messageId);
  if (!msg?.injectedMemories?.length) return null;
  const snap = msg.injectedMemories.find((s) => s.chunkId === chunkId);
  if (!snap) return null;
  if (rating) snap.rating = rating;
  else delete snap.rating;
  saveChat(chat);
  return msg;
}

/** 助手消息上的活动 √ 完成标记 */
export function patchMessageInjectedActivityCompleted(
  chatId: string,
  messageId: string,
  activityId: string,
  occurrenceDate: string,
  completed: boolean
): ChatMessage | null {
  const chat = getChat(chatId);
  if (!chat) return null;
  const msg = chat.messages.find((m) => m.id === messageId);
  if (!msg?.injectedActivities?.length) return null;
  const snap = msg.injectedActivities.find(
    (s) => s.activityId === activityId && s.occurrenceDate === occurrenceDate
  );
  if (!snap) return null;
  if (completed) snap.completed = true;
  else delete snap.completed;
  saveChat(chat);
  return msg;
}

/** 给最后一条助手消息附加音乐卡片或图片；点歌时追加分享备注进正文供上下文回顾 */
export function patchLastAssistantExtras(
  chatId: string,
  extras: { musicCard?: MusicCard; attachments?: MessageAttachment[] }
): ChatMessage | null {
  const chat = getChat(chatId);
  if (!chat) return null;
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    if (chat.messages[i].role === "assistant") {
      if (extras.musicCard) {
        chat.messages[i].musicCard = extras.musicCard;
        const note = formatMusicShareNote(
          extras.musicCard.artists,
          extras.musicCard.name
        );
        const raw = chat.messages[i].content || "";
        const escaped = note.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        if (!new RegExp(escaped).test(raw)) {
          const trimmed = raw.trim();
          if (!trimmed || /^\[.+ 为你点的歌\]$/.test(trimmed)) {
            chat.messages[i].content = note;
          } else {
            chat.messages[i].content = `${trimmed}\n\n${note}`;
          }
        }
      }
      if (extras.attachments?.length) {
        const prev = chat.messages[i].attachments || [];
        chat.messages[i].attachments = [...prev, ...extras.attachments];
      }
      chat.messages[i].createdAt = new Date().toISOString();
      saveChat(chat);
      return chat.messages[i];
    }
  }
  return null;
}

export function updateMessage(
  chatId: string,
  messageId: string,
  patch: { content?: string; reasoning?: string }
): ChatMessage | null {
  const chat = getChat(chatId);
  if (!chat) return null;
  const msg = chat.messages.find((m) => m.id === messageId);
  if (!msg) return null;
  if (patch.content !== undefined) msg.content = patch.content;
  if (patch.reasoning !== undefined) msg.reasoning = patch.reasoning || undefined;
  saveChat(chat);
  return msg;
}

export function deleteMessage(chatId: string, messageId: string): boolean {
  const chat = getChat(chatId);
  if (!chat) return false;
  const before = chat.messages.length;
  chat.messages = chat.messages.filter((m) => m.id !== messageId);
  if (chat.messages.length === before) return false;
  saveChat(chat);
  return true;
}

/** 从指定用户消息之后删除所有消息（保留该条用户消息），用于重新发送 */
export function truncateAfterUserMessage(chatId: string, userMessageId: string): boolean {
  const chat = getChat(chatId);
  if (!chat) return false;
  const idx = chat.messages.findIndex((m) => m.id === userMessageId && m.role === "user");
  if (idx < 0) return false;
  chat.messages = chat.messages.slice(0, idx + 1);
  saveChat(chat);
  return true;
}

/** 从指定角色消息起删除该条及之后所有消息，用于重新生成 */
export function truncateFromAssistantMessage(chatId: string, assistantMessageId: string): boolean {
  const chat = getChat(chatId);
  if (!chat) return false;
  const idx = chat.messages.findIndex((m) => m.id === assistantMessageId && m.role === "assistant");
  if (idx < 0) return false;
  chat.messages = chat.messages.slice(0, idx);
  saveChat(chat);
  return true;
}

export function removeLastAssistant(chatId: string): boolean {
  const chat = getChat(chatId);
  if (!chat) return false;
  for (let i = chat.messages.length - 1; i >= 0; i--) {
    if (chat.messages[i].role === "assistant") {
      chat.messages.splice(i, 1);
      saveChat(chat);
      return true;
    }
  }
  return false;
}

export function removeLastUserAndAssistant(chatId: string): void {
  const chat = getChat(chatId);
  if (!chat) return;
  if (chat.messages.length > 0 && chat.messages[chat.messages.length - 1].role === "assistant") {
    chat.messages.pop();
  }
  if (chat.messages.length > 0 && chat.messages[chat.messages.length - 1].role === "user") {
    chat.messages.pop();
  }
  saveChat(chat);
}

export function deleteChat(id: string): boolean {
  const file = chatPath(id);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  const attDir = getChatAttachmentsDir(id);
  if (fs.existsSync(attDir)) {
    fs.rmSync(attDir, { recursive: true, force: true });
  }
  return true;
}

function mimeFromImageExt(filename: string): string | null {
  if (/\.jpe?g$/i.test(filename)) return "image/jpeg";
  if (/\.png$/i.test(filename)) return "image/png";
  if (/\.gif$/i.test(filename)) return "image/gif";
  if (/\.webp$/i.test(filename)) return "image/webp";
  if (/\.bmp$/i.test(filename)) return "image/bmp";
  if (/\.avif$/i.test(filename)) return "image/avif";
  if (/\.heic$/i.test(filename)) return "image/heic";
  if (/\.heif$/i.test(filename)) return "image/heif";
  return null;
}

export function saveChatAttachment(
  chatId: string,
  filename: string,
  mimeType: string,
  buffer: Buffer,
  meta?: { durationSec?: number }
): MessageAttachment {
  const dir = getChatAttachmentsDir(chatId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const id = crypto.randomUUID();
  const ext = path.extname(filename);
  const storedName = `${id}${ext}`;
  fs.writeFileSync(path.join(dir, storedName), buffer);

  const lowerName = filename.toLowerCase();
  const looksLikeImage =
    mimeType.startsWith("image/") ||
    /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(lowerName);
  const looksLikeAudio =
    mimeType.startsWith("audio/") ||
    /\.(mp3|wav|m4a|aac|ogg|flac|webm|mp4)$/i.test(lowerName);

  let kind: AttachmentKind = "other";
  if (looksLikeImage) kind = "image";
  else if (looksLikeAudio) kind = "audio";
  else if (
    mimeType.includes("text") ||
    mimeType.includes("pdf") ||
    mimeType.includes("document") ||
    /\.(txt|md|pdf|doc|docx)$/i.test(filename)
  ) {
    kind = "document";
  }

  const resolvedMime =
    looksLikeImage && !mimeType.startsWith("image/")
      ? mimeFromImageExt(lowerName) || mimeType
      : mimeType;

  return {
    id,
    name: filename,
    mimeType: resolvedMime,
    kind,
    size: buffer.length,
    durationSec: meta?.durationSec,
  };
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}
