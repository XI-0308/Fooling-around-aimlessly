"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import type { ItemType } from "@ant-design/x/es/actions/interface";
import AppShell from "@/components/AppShell";
import ChatBubbleList from "@/components/antx/ChatBubbleList";
import ChatMessageActions, {
  BulbOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  ReloadOutlined,
  SendOutlined,
  SoundOutlined,
} from "@/components/antx/ChatMessageActions";
import ChatReasoningChain from "@/components/antx/ChatReasoningChain";
import ToolWaitingBubble from "@/components/antx/ToolWaitingBubble";
import ThinkingDots from "@/components/ThinkingDots";
import ChatInputBar, { type PendingAttachment, type PendingMemoryCitation } from "@/components/ChatInputBar";
import ChatMessageAttachments, {
  ChatVoiceAttachments,
  hasAudioInAttachments,
  hasNonAudioExtras,
} from "@/components/ChatMessageAttachments";
import ChatMessageContent from "@/components/ChatMessageContent";
import ChatMusicCard, { type MusicCardData } from "@/components/ChatMusicCard";
import EventSummaryModal, { type EventSummaryPayload } from "@/components/EventSummaryModal";
import ObsidianSettleModal from "@/components/ObsidianSettleModal";
import ChatSpeakerBlock from "@/components/antx/ChatSpeakerBlock";
import CoreadPickModal from "@/components/CoreadPickModal";
import WeReadMemoryModal, { type WeReadMemoryPayload } from "@/components/WeReadMemoryModal";
import PromptAnalysisPanel from "@/components/PromptAnalysisPanel";
import { useProactiveUnread } from "@/components/ProactiveUnreadProvider";
import { apiFetch, apiStream, isTransientFetchError, type StreamEvent } from "@/lib/api";
import { hasWeReadExcerptableContent, stripEnrichBlocksFromDisplay } from "@/lib/enrichDisplay";
import {
  dismissExcerptMessages,
  getDismissedExcerptMessageIds,
} from "@/lib/wereadExcerptDismiss";
import {
  chatThemeToCssVars,
  DEFAULT_CHAT_THEME,
  loadFullChatTheme,
  subscribeChatTheme,
  type ChatTheme,
} from "@/lib/chatTheme";
import { useMobileKeyboardLayout } from "@/hooks/useMobileKeyboardLayout";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 去掉模型可能模仿的「角色名：」前缀，界面已有头像与名称 */
function stripSpeakerPrefix(content: string, names: string[]): string {
  const trimmed = content.trimStart();
  for (const name of names) {
    if (!name?.trim()) continue;
    const re = new RegExp(`^${escapeRegExp(name.trim())}\\s*[:：]\\s*`, "i");
    if (re.test(trimmed)) return trimmed.replace(re, "");
  }
  return content;
}

interface MessageAttachment {
  id: string;
  name: string;
  kind: string;
  durationSec?: number;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  reasoning?: string;
  contextLog?: Record<string, unknown>;
  attachments?: MessageAttachment[];
  musicCard?: MusicCardData;
  proactive?: boolean;
  memoryCitation?: { chunkId: string; text: string };
  injectedMemories?: {
    chunkId: string;
    text: string;
    query: string;
    rating?: "up" | "down";
  }[];
  injectedActivities?: {
    activityId: string;
    occurrenceDate: string;
    title: string;
    completed?: boolean;
  }[];
}

interface ChatSession {
  id: string;
  characterId?: string;
  characterName: string;
  messages: ChatMessage[];
}

const MESSAGE_BATCH = 30;

/** 后台刷新时保留尚未对上的 temp- 乐观用户消息，避免气泡被旧快照冲掉 */
function mergeServerChatPreservingTemps(
  prev: ChatSession | null,
  server: ChatSession
): ChatSession {
  if (!prev) return server;
  const temps = prev.messages.filter(
    (m) => m.role === "user" && String(m.id).startsWith("temp-")
  );
  if (temps.length === 0) return server;

  const keep = temps.filter((t) => {
    const recent = server.messages.slice(-6);
    return !recent.some(
      (m) =>
        m.role === "user" &&
        m.content === t.content &&
        (m.attachments?.length ?? 0) === (t.attachments?.length ?? 0)
    );
  });
  if (keep.length === 0) return server;
  return { ...server, messages: [...server.messages, ...keep] };
}

export default function ChatDetailPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = params.id as string;
  const { markSeen, refresh, chats: unreadChats, ensureNotifyPermission } = useProactiveUnread();
  const messagesScrollRef = useRef<HTMLDivElement>(null);
  const stickBottomRef = useRef(true);
  const proactiveSeenRef = useRef(false);
  const streamingRef = useRef(false);
  const scrollRafRef = useRef<number | null>(null);
  const [chat, setChat] = useState<ChatSession | null>(null);
  const [generating, setGenerating] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [streaming, setStreaming] = useState("");
  const [streamingReasoning, setStreamingReasoning] = useState("");
  /** 流式结束过渡：暂藏已入库消息，避免与流式气泡同时闪现 */
  const [streamHoldId, setStreamHoldId] = useState<string | null>(null);
  const [streamSettling, setStreamSettling] = useState(false);
  const [landedMessageId, setLandedMessageId] = useState<string | null>(null);
  const streamSettleTimerRef = useRef<number | null>(null);
  const characterNameRef = useRef("");
  const messagesBottomRef = useRef<HTMLDivElement>(null);
  const lastKnownMsgCountRef = useRef(0);
  const lastKnownTailIdRef = useRef<string | null>(null);
  /** 忽略过期的 loadChat 响应，避免盖掉正在发送的乐观消息 */
  const loadChatSeqRef = useRef(0);
  const generatingRef = useRef(false);
  /** 每条角色消息的思维链是否收起，key=messageId；未设置时默认折叠（流式中默认展开） */
  const [reasoningCollapsed, setReasoningCollapsed] = useState<Record<string, boolean>>({});
  const [error, setError] = useState("");
  const [selectPurpose, setSelectPurpose] = useState<
    "event" | "coread" | "weread" | "obsidian" | null
  >(null);
  const selectMode = selectPurpose !== null;
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [summarizing, setSummarizing] = useState(false);
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [coreadModalOpen, setCoreadModalOpen] = useState(false);
  const [coreadSaving, setCoreadSaving] = useState(false);
  const [wereadModalOpen, setWeReadModalOpen] = useState(false);
  const [obsidianModalOpen, setObsidianModalOpen] = useState(false);
  const [obsidianPreviewLoading, setObsidianPreviewLoading] = useState(false);
  const [obsidianSaving, setObsidianSaving] = useState(false);
  const [obsidianTitle, setObsidianTitle] = useState("");
  const [obsidianSummary, setObsidianSummary] = useState("");
  const [obsidianLinks, setObsidianLinks] = useState<string[]>([]);
  const [eventPreviewLoading, setEventPreviewLoading] = useState(false);
  const [wereadPreviewLoading, setWeReadPreviewLoading] = useState(false);
  const [eventSaving, setEventSaving] = useState(false);
  const [wereadSaving, setWeReadSaving] = useState(false);
  const [excerptDismissTick, setExcerptDismissTick] = useState(0);
  const [eventSummaries, setEventSummaries] = useState("");
  const [wereadSummary, setWeReadSummary] = useState("");
  const [eventMeta, setEventMeta] = useState<{
    chatTitle: string;
    messageCount: number;
    messageIds: string[];
    suggestedMemoryAt?: string;
  } | null>(null);
  const [wereadMeta, setWeReadMeta] = useState<{
    chatTitle: string;
    messageCount: number;
    messageIds: string[];
    bookTitle?: string | null;
    progress?: number | null;
    suggestedKeysText?: string;
  } | null>(null);
  const [analysisLog, setAnalysisLog] = useState<unknown>(null);
  const [analysisMeta, setAnalysisMeta] = useState<{
    messageId: string;
    createdAt?: string;
    isLatestAssistant: boolean;
    replyContent?: string;
    reasoningContent?: string;
  } | null>(null);
  const [regeneratingId, setRegeneratingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [memoryFeedbackBusyId, setMemoryFeedbackBusyId] = useState<string | null>(null);
  const [activityCompleteBusyId, setActivityCompleteBusyId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [apiModel, setApiModel] = useState("deepseek-v4-flash");
  const [deepseekThinkingEnabled, setDeepseekThinkingEnabled] = useState(true);
  const [characterId, setCharacterId] = useState<string>("");
  const [characterHasAvatar, setCharacterHasAvatar] = useState(false);
  const [userHasAvatar, setUserHasAvatar] = useState(false);
  const [characterAvatarVersion, setCharacterAvatarVersion] = useState(0);
  const [userAvatarVersion, setUserAvatarVersion] = useState(0);
  const [userName, setUserName] = useState("你");
  const [chatTheme, setChatTheme] = useState<ChatTheme>(DEFAULT_CHAT_THEME);
  const [imageGenerating, setImageGenerating] = useState(false);
  const [musicSearching, setMusicSearching] = useState(false);
  const [voiceGenerating, setVoiceGenerating] = useState(false);
  const [webSearching, setWebSearching] = useState(false);
  const [leannOffers, setLeannOffers] = useState<
    Array<{ id: string; title: string; source: "bilibili" | "web" | "zhihu"; charCount: number }>
  >([]);
  const [leannOfferBusyId, setLeannOfferBusyId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(MESSAGE_BATCH);

  const isReasonerModel = deepseekThinkingEnabled;

  useMobileKeyboardLayout(true);

  useEffect(() => {
    function onComposerFocus() {
      // 键盘顶起整页时，不要滚动消息列表（内容不移送）
      if (document.querySelector(".chat-layout-editing")) return;
      stickBottomRef.current = false;
    }
    function onKeyboardLayout(ev: Event) {
      if (document.querySelector(".chat-layout-editing")) return;
      const detail = (ev as CustomEvent<{ keyboardOpen?: boolean; closing?: boolean }>).detail;
      if (detail?.closing || detail?.keyboardOpen === false) {
        // 收起后回正即可，不强制把聊天内容拽到底
        window.scrollTo(0, 0);
        return;
      }
      // 升起时保持当前消息滚动位置，不 scrollToBottom
      stickBottomRef.current = false;
    }
    window.addEventListener("rp-composer-focus", onComposerFocus);
    window.addEventListener("rp-keyboard-layout", onKeyboardLayout);
    return () => {
      window.removeEventListener("rp-composer-focus", onComposerFocus);
      window.removeEventListener("rp-keyboard-layout", onKeyboardLayout);
    };
  }, []);

  useEffect(() => {
    if (typeof history !== "undefined" && "scrollRestoration" in history) {
      history.scrollRestoration = "manual";
    }
  }, []);

  useEffect(() => {
    setLeannOffers([]);
    setLeannOfferBusyId(null);
  }, [chatId]);

  useEffect(() => {
    streamingRef.current = Boolean(streaming) || Boolean(streamingReasoning);
  }, [streaming, streamingReasoning]);

  useEffect(() => {
    return () => {
      if (streamSettleTimerRef.current !== null) {
        window.clearTimeout(streamSettleTimerRef.current);
      }
      if (scrollRafRef.current !== null) {
        window.cancelAnimationFrame(scrollRafRef.current);
      }
    };
  }, []);

  function isMessagesAtBottom(): boolean {
    const el = messagesScrollRef.current;
    if (!el) return false;
    return el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }

  function scheduleMarkProactiveSeenWhenViewing() {
    const delays = [0, 120, 400, 900, 1500];
    for (const ms of delays) {
      window.setTimeout(() => {
        if (proactiveSeenRef.current) return;
        if (!stickBottomRef.current && !isMessagesAtBottom()) return;
        proactiveSeenRef.current = true;
        void markSeen();
      }, ms);
    }
  }

  function tryMarkProactiveSeen(force = false) {
    if (proactiveSeenRef.current) return;
    if (!force && !stickBottomRef.current && !isMessagesAtBottom()) return;
    proactiveSeenRef.current = true;
    void markSeen();
  }

  function scrollToBottom(behavior: ScrollBehavior = "auto") {
    const el = messagesScrollRef.current;
    if (!el) return;
    const streamingNow = generatingRef.current || streamingRef.current;
    // 流式期间合并到每帧一次，避免跟手滑动时被疯狂拽回底部导致「半屏错位」
    if (behavior === "auto" && streamingNow) {
      if (scrollRafRef.current !== null) return;
      scrollRafRef.current = window.requestAnimationFrame(() => {
        scrollRafRef.current = null;
        if (!stickBottomRef.current) return;
        const box = messagesScrollRef.current;
        if (!box) return;
        messagesBottomRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
        box.scrollTop = box.scrollHeight;
      });
      return;
    }
    messagesBottomRef.current?.scrollIntoView({ block: "end", behavior });
    el.scrollTop = el.scrollHeight;
  }

  /** 修改消息时：把该条顶到消息区靠上位置（iPhone 键盘场景） */
  function scrollEditingMessageIntoView(messageId: string) {
    const box = messagesScrollRef.current;
    if (!box) return;
    const row = box.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`) as HTMLElement | null;
    if (!row) return;

    stickBottomRef.current = false;
    window.scrollTo(0, 0);

    const focusEl = (row.querySelector(".msg-edit") as HTMLElement | null) || row;
    const boxRect = box.getBoundingClientRect();
    const elRect = focusEl.getBoundingClientRect();

    // 把编辑框顶到消息区顶部附近，给键盘留出下方空间
    const targetTop = boxRect.top + 10;
    box.scrollTop += elRect.top - targetTop;

    requestAnimationFrame(() => {
      const r2 = focusEl.getBoundingClientRect();
      const b2 = box.getBoundingClientRect();
      if (r2.bottom > b2.bottom - 8) {
        box.scrollTop += r2.bottom - (b2.bottom - 8);
      }
      // 仍看不见时用原生 scrollIntoView 兜底（只滚内部可滚动祖先）
      if (r2.top < b2.top || r2.bottom > b2.bottom) {
        focusEl.scrollIntoView({ block: "start", inline: "nearest", behavior: "instant" as ScrollBehavior });
        window.scrollTo(0, 0);
      }
    });
  }

  function scheduleScrollEditingMessage(messageId: string) {
    const run = () => scrollEditingMessageIntoView(messageId);
    requestAnimationFrame(() => {
      requestAnimationFrame(run);
    });
    window.setTimeout(run, 80);
    window.setTimeout(run, 180);
    window.setTimeout(run, 360);
    window.setTimeout(run, 560);
    window.setTimeout(run, 900);
  }

  function loadMoreHistory() {
    const el = messagesScrollRef.current;
    if (!el || !chat) return;
    const prevHeight = el.scrollHeight;
    const prevTop = el.scrollTop;
    stickBottomRef.current = false;
    setVisibleCount((prev) => Math.min(chat.messages.length, prev + MESSAGE_BATCH));
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const box = messagesScrollRef.current;
        if (!box) return;
        box.scrollTop = prevTop + (box.scrollHeight - prevHeight);
      });
    });
  }

  /** 展开全部历史并保持当前可视区域（总结/摘抄/共读用；旧消息插在上方需补偿高度） */
  function preserveScrollExpandAll(then?: () => void) {
    const el = messagesScrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    const prevTop = el?.scrollTop ?? 0;
    stickBottomRef.current = false;
    setVisibleCount(chat?.messages.length ?? MESSAGE_BATCH);
    then?.();
    const restore = () => {
      const box = messagesScrollRef.current;
      if (!box) return;
      box.scrollTop = prevTop + (box.scrollHeight - prevHeight);
    };
    requestAnimationFrame(() => {
      requestAnimationFrame(restore);
    });
    window.setTimeout(restore, 80);
    window.setTimeout(restore, 200);
  }

  useEffect(() => {
    loadFullChatTheme().then(setChatTheme);
    return subscribeChatTheme(() => {
      void loadFullChatTheme().then(setChatTheme);
    });
  }, []);

  function loadChat(silent = false) {
    const seq = ++loadChatSeqRef.current;
    return apiFetch<{
      chat: ChatSession;
      characterId?: string;
      characterHasAvatar?: boolean;
      userHasAvatar?: boolean;
      characterAvatarVersion?: number;
      userAvatarVersion?: number;
      userName?: string;
    }>(`/chats/${chatId}`)
      .then((d) => {
        // 过期请求 / 发送中：绝不能用旧快照盖掉 temp 用户气泡
        if (seq !== loadChatSeqRef.current) return;
        if (generatingRef.current) return;

        setChat((prev) => mergeServerChatPreservingTemps(prev, d.chat));
        setCharacterId(d.characterId || d.chat.characterId || "");
        setCharacterHasAvatar(Boolean(d.characterHasAvatar));
        setUserHasAvatar(Boolean(d.userHasAvatar));
        setCharacterAvatarVersion(Number(d.characterAvatarVersion) || 0);
        setUserAvatarVersion(Number(d.userAvatarVersion) || 0);
        setUserName(d.userName || "你");
        stickBottomRef.current = true;
        const msgs = d.chat.messages;
        const tail = msgs[msgs.length - 1];
        if (
          tail?.role === "assistant" &&
          tail.proactive &&
          tail.id !== lastKnownTailIdRef.current &&
          msgs.length > lastKnownMsgCountRef.current
        ) {
          setLandedMessageId(tail.id);
          window.setTimeout(() => setLandedMessageId(null), 280);
        }
        lastKnownMsgCountRef.current = msgs.length;
        lastKnownTailIdRef.current = tail?.id ?? null;
        void refresh();
        scheduleMarkProactiveSeenWhenViewing();
        setError((prev) => (isTransientFetchError(prev) ? "" : prev));
      })
      .catch((e) => {
        if (silent) return;
        const msg = e instanceof Error ? e.message : "请求失败";
        setError(msg);
      });
  }

  useEffect(() => {
    proactiveSeenRef.current = false;
    setError("");
    loadChat();
    setSelectPurpose(null);
    setSelectedIds(new Set());
    setVisibleCount(MESSAGE_BATCH);
    stickBottomRef.current = true;
    void ensureNotifyPermission();
    apiFetch<{ model?: string; deepseekThinkingEnabled?: boolean }>("/settings")
      .then((d) => {
        setApiModel(String(d.model || "deepseek-v4-flash"));
        setDeepseekThinkingEnabled(Boolean(d.deepseekThinkingEnabled));
      })
      .catch(() => {});
  }, [chatId]);

  useEffect(() => {
    const el = messagesScrollRef.current;
    if (!el) return;
    const onScroll = () => {
      stickBottomRef.current = isMessagesAtBottom();
      if (isMessagesAtBottom()) tryMarkProactiveSeen();
    };
    /** 手指一碰上就解除吸底，不要等 scroll 事件（流式时否则会跟手抢滚动） */
    const onUserScrollIntent = () => {
      if (generatingRef.current || streamingRef.current) {
        stickBottomRef.current = false;
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("touchstart", onUserScrollIntent, { passive: true });
    el.addEventListener("wheel", onUserScrollIntent, { passive: true });
    el.addEventListener("pointerdown", onUserScrollIntent, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("touchstart", onUserScrollIntent);
      el.removeEventListener("wheel", onUserScrollIntent);
      el.removeEventListener("pointerdown", onUserScrollIntent);
    };
  }, [chatId, chat?.messages.length]);

  useLayoutEffect(() => {
    if (selectMode || !stickBottomRef.current) return;
    scrollToBottom("auto");
  }, [
    selectMode,
    chat?.messages.length,
    visibleCount,
    generating,
    streaming,
    streamingReasoning,
    streamSettling,
    streamHoldId,
    imageGenerating,
    musicSearching,
    webSearching,
    landedMessageId,
  ]);

  useEffect(() => {
    if (generating || streaming) return;
    const timer = window.setInterval(() => {
      loadChat(true);
      void refresh().catch(() => {});
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [generating, streaming, chatId, refresh]);

  useEffect(() => {
    const unread = unreadChats.find((c) => c.chatId === chatId)?.count ?? 0;
    if (!chat || selectMode || unread === 0) return;
    scheduleMarkProactiveSeenWhenViewing();
  }, [chat, chatId, chat?.messages.length, unreadChats, selectMode]);

  useEffect(() => {
    if (!chat?.messages.length) return;
    const count = getWeReadEligibleMessages(chat.messages).length;
    if (count > 0) {
      setError((prev) => (prev.includes("可摘抄") ? "" : prev));
    }
  }, [chat?.messages]);

  function toggleSelect(id: string, message?: ChatMessage) {
    if (selectPurpose === "weread") {
      if (!message || message.role !== "user" || !hasWeReadExcerptableContent(message.content)) {
        return;
      }
    }
    if (selectPurpose === "coread") {
      if (!message) return;
      const content = stripEnrichBlocksFromDisplay(message.content || "").trim();
      if (!content) return;
    }
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectPurpose(null);
    setSelectedIds(new Set());
    setCoreadModalOpen(false);
    setError((prev) =>
      prev.includes("可摘抄") || prev.includes("总结") || prev.includes("共读") ? "" : prev
    );
  }

  function getWeReadEligibleMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.filter((m) => m.role === "user" && hasWeReadExcerptableContent(m.content));
  }

  function startCoreadMode(preselectIds?: string[]) {
    const msgs = chat?.messages ?? [];
    const pickable = msgs.filter(
      (m) => stripEnrichBlocksFromDisplay(m.content || "").trim().length > 0
    );
    if (pickable.length === 0) {
      setError("本聊天还没有可记入共读的消息。");
      return;
    }
    setError("");
    preserveScrollExpandAll(() => {
      setSelectPurpose("coread");
      if (preselectIds?.length) {
        const valid = preselectIds.filter((id) => pickable.some((m) => m.id === id));
        setSelectedIds(new Set(valid.length ? valid : [pickable[pickable.length - 1].id]));
      } else {
        setSelectedIds(new Set([pickable[pickable.length - 1].id]));
      }
    });
  }

  function startWeReadMemoryMode(preselectIds?: string[]) {
    const eligible = getWeReadEligibleMessages(chat?.messages ?? []);
    if (eligible.length === 0) {
      setError(
        "本聊天还没有可摘抄的消息。请先发送涉及某本书划线/笔记的问题，待角色拉取成功后再点「摘抄」。"
      );
      return;
    }
    setError("");
    preserveScrollExpandAll(() => {
      setSelectPurpose("weread");
      if (preselectIds?.length) {
        const valid = preselectIds.filter((id) => eligible.some((m) => m.id === id));
        setSelectedIds(new Set(valid.length ? valid : [eligible[eligible.length - 1].id]));
      } else {
        const latest = eligible[eligible.length - 1];
        setSelectedIds(new Set([latest.id]));
      }
    });
  }

  async function commitCoreadDraft(bookId: string) {
    if (selectedIds.size === 0) {
      setError("请至少选择一条消息");
      return;
    }
    setCoreadSaving(true);
    setError("");
    try {
      await apiFetch(`/coread/${bookId}/drafts`, {
        method: "POST",
        body: JSON.stringify({
          chatId,
          messageIds: Array.from(selectedIds),
        }),
      });
      setCoreadModalOpen(false);
      exitSelectMode();
      alert("已记入共读草稿。可在「记忆库 → 读书记忆」查看；双日会整理成讨论论点。");
    } catch (err) {
      setError(err instanceof Error ? err.message : "记入共读失败");
    } finally {
      setCoreadSaving(false);
    }
  }

  async function previewObsidianSelected() {
    if (selectedIds.size === 0) {
      setError("请至少选择一条消息");
      return;
    }
    setSummarizing(true);
    setObsidianPreviewLoading(true);
    setObsidianModalOpen(true);
    setObsidianTitle("");
    setObsidianSummary("");
    setObsidianLinks([]);
    setError("");
    try {
      const res = await apiFetch<{
        title: string;
        summary: string;
        sourceLinks: string[];
      }>(`/chats/${chatId}/obsidian/settle/preview`, {
        method: "POST",
        body: JSON.stringify({ messageIds: [...selectedIds] }),
      });
      setObsidianTitle(res.title);
      setObsidianSummary(res.summary);
      setObsidianLinks(res.sourceLinks || []);
    } catch (err) {
      setObsidianModalOpen(false);
      setError(err instanceof Error ? err.message : "沉淀预览失败");
    } finally {
      setSummarizing(false);
      setObsidianPreviewLoading(false);
    }
  }

  async function commitObsidianSettle(payload: {
    title: string;
    summary: string;
    sourceLinks: string[];
    efSu: boolean;
  }) {
    setObsidianSaving(true);
    setError("");
    try {
      const res = await apiFetch<{ relPath: string; openUri?: string | null }>(
        `/chats/${chatId}/obsidian/settle`,
        {
          method: "POST",
          body: JSON.stringify({
            title: payload.title,
            summary: payload.summary,
            sourceLinks: payload.sourceLinks,
            messageIds: [...selectedIds],
            efSu: payload.efSu,
          }),
        }
      );
      setObsidianModalOpen(false);
      exitSelectMode();
      const openHint = res.openUri ? "可用 Obsidian 链接打开。" : "可在慢思考页查看。";
      alert(`已写入 ${res.relPath}。${openHint}`);
      if (res.openUri) {
        try {
          window.location.href = res.openUri;
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "写入 Obsidian 失败");
    } finally {
      setObsidianSaving(false);
    }
  }

  async function summarizeSelected() {
    if (selectedIds.size === 0) {
      setError("请至少选择一条消息");
      return;
    }
    setSummarizing(true);
    setEventPreviewLoading(true);
    setEventModalOpen(true);
    setEventSummaries("");
    setEventMeta(null);
    setError("");
    try {
      const res = await apiFetch<{
        summary: string;
        messageIds: string[];
        chatTitle: string;
        messageCount: number;
        suggestedMemoryAt: string;
      }>(`/chats/${chatId}/summarize-event/preview`, {
        method: "POST",
        body: JSON.stringify({ messageIds: [...selectedIds] }),
      });
      setEventSummaries(res.summary);
      setEventMeta({
        chatTitle: res.chatTitle,
        messageCount: res.messageCount,
        messageIds: res.messageIds,
        suggestedMemoryAt: res.suggestedMemoryAt,
      });
    } catch (err) {
      setEventModalOpen(false);
      setError(err instanceof Error ? err.message : "总结失败");
    } finally {
      setSummarizing(false);
      setEventPreviewLoading(false);
    }
  }

  async function previewWeReadSelected() {
    if (selectedIds.size === 0) {
      setError("请至少选择一条含微信读书数据的消息");
      return;
    }
    setSummarizing(true);
    setWeReadPreviewLoading(true);
    setWeReadModalOpen(true);
    setWeReadSummary("");
    setWeReadMeta(null);
    setError("");
    try {
      const res = await apiFetch<{
        summary: string;
        messageIds: string[];
        chatTitle: string;
        messageCount: number;
        bookTitle?: string | null;
        progress?: number | null;
        suggestedKeysText?: string;
      }>(`/chats/${chatId}/weread-memory/preview`, {
        method: "POST",
        body: JSON.stringify({ messageIds: [...selectedIds] }),
      });
      setWeReadSummary(res.summary);
      setWeReadMeta({
        chatTitle: res.chatTitle,
        messageCount: res.messageCount,
        messageIds: res.messageIds,
        bookTitle: res.bookTitle,
        progress: res.progress,
        suggestedKeysText: res.suggestedKeysText,
      });
    } catch (err) {
      setWeReadModalOpen(false);
      setError(err instanceof Error ? err.message : "摘抄总结失败");
    } finally {
      setSummarizing(false);
      setWeReadPreviewLoading(false);
    }
  }

  async function commitEventMemory(payload: EventSummaryPayload) {
    if (!eventMeta) return;
    setEventSaving(true);
    setError("");
    try {
      const res = await apiFetch<{ count: number }>("/memory/ingest/event", {
        method: "POST",
        body: JSON.stringify({
          chatId,
          messageIds: eventMeta.messageIds,
          text: payload.text,
          keysText: payload.keysText,
          memoryAt: payload.memoryAt || undefined,
          includeTimeInPrompt: payload.includeTimeInPrompt,
        }),
      });
      setEventModalOpen(false);
      exitSelectMode();
      setEventMeta(null);
      setEventSummaries("");
      alert(`已存入记忆库（${res.count} 条）。可在「记忆库 → 事件记忆」查看并修改关键词。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "存入失败");
    } finally {
      setEventSaving(false);
    }
  }

  function closeEventModal() {
    if (eventSaving) return;
    setEventModalOpen(false);
    setEventSummaries("");
    setEventMeta(null);
  }

  async function commitWeReadMemory(payload: WeReadMemoryPayload) {
    if (!wereadMeta) return;
    setWeReadSaving(true);
    setError("");
    try {
      const res = await apiFetch<{ count: number }>("/memory/ingest/weread", {
        method: "POST",
        body: JSON.stringify({
          chatId,
          messageIds: wereadMeta.messageIds,
          text: payload.text,
          keysText: payload.keysText,
          bookTitle: wereadMeta.bookTitle,
          progress: wereadMeta.progress,
          syncProgress: payload.syncProgress,
        }),
      });
      setWeReadModalOpen(false);
      exitSelectMode();
      dismissExcerptMessages(chatId, wereadMeta.messageIds);
      setExcerptDismissTick((t) => t + 1);
      setWeReadMeta(null);
      setWeReadSummary("");
      alert(`已存入记忆库（${res.count} 条）。可在「记忆库 → 读书记忆」查看并修改关键词。`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "存入失败");
    } finally {
      setWeReadSaving(false);
    }
  }

  function closeWeReadModal() {
    if (wereadSaving) return;
    setWeReadModalOpen(false);
    setWeReadSummary("");
    setWeReadMeta(null);
  }

  async function confirmLeannOffer(offerId: string) {
    if (leannOfferBusyId) return;
    setLeannOfferBusyId(offerId);
    setError("");
    try {
      const res = await apiFetch<{
        draft?: boolean;
        collection?: { name: string; chunkCount: number; status?: string };
      }>(`/chats/${chatId}/leann-offer/confirm`, {
        method: "POST",
        body: JSON.stringify({ offerId }),
      });
      setLeannOffers((prev) => prev.filter((o) => o.id !== offerId));
      const name = res.collection?.name || "资料";
      alert(
        `《${name.replace(/\.txt$/i, "")}》已存为电子书草稿（未向量化）。` +
          "请到「记忆库 → 资料记忆 → 电子书索引」编辑全文/切块后再点向量化。"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "写入 LEANN 失败");
    } finally {
      setLeannOfferBusyId(null);
    }
  }

  async function dismissLeannOffer(offerId: string) {
    if (leannOfferBusyId) return;
    setLeannOfferBusyId(offerId);
    try {
      await apiFetch(`/chats/${chatId}/leann-offer/dismiss`, {
        method: "POST",
        body: JSON.stringify({ offerId }),
      });
      setLeannOffers((prev) => prev.filter((o) => o.id !== offerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "操作失败");
    } finally {
      setLeannOfferBusyId(null);
    }
  }

  function mergeStreamMessage(msg: unknown) {
    if (!msg || typeof msg !== "object" || !("id" in msg)) return;
    const incoming = msg as ChatMessage;
    setChat((prev) => {
      if (!prev) return prev;
      const idx = prev.messages.findIndex((m) => m.id === incoming.id);
      const messages =
        idx >= 0
          ? prev.messages.map((m, i) => (i === idx ? { ...m, ...incoming } : m))
          : [...prev.messages, incoming];
      return { ...prev, messages };
    });
  }

  /** 用服务端真实用户消息替换本地 temp- 乐观气泡 */
  function replaceTempUserMessage(msg: unknown) {
    if (!msg || typeof msg !== "object" || !("id" in msg)) return;
    const incoming = msg as ChatMessage;
    if (incoming.role !== "user") return;
    setChat((prev) => {
      if (!prev) return prev;
      const byId = prev.messages.findIndex((m) => m.id === incoming.id);
      if (byId >= 0) {
        const messages = prev.messages.map((m, i) =>
          i === byId ? { ...m, ...incoming } : m
        );
        return { ...prev, messages };
      }
      const tempIdx = prev.messages.findIndex(
        (m) => m.role === "user" && String(m.id).startsWith("temp-")
      );
      if (tempIdx >= 0) {
        const messages = [...prev.messages];
        messages[tempIdx] = {
          ...messages[tempIdx],
          ...incoming,
          id: incoming.id,
        };
        return { ...prev, messages };
      }
      return { ...prev, messages: [...prev.messages, incoming] };
    });
  }

  function clearStreamSettleTimer() {
    if (streamSettleTimerRef.current !== null) {
      window.clearTimeout(streamSettleTimerRef.current);
      streamSettleTimerRef.current = null;
    }
  }

  /** 流式结束后：先保留流式气泡，再平滑切到列表中的正式消息 */
  function settleStreamIntoList(msg: ChatMessage) {
    mergeStreamMessage(msg);
    const charName = characterNameRef.current;
    setStreamHoldId(msg.id);
    setStreamSettling(true);
    setStreaming((prev) => {
      if (prev.trim()) return prev;
      return stripSpeakerPrefix(msg.content, [charName]);
    });
    setStreamingReasoning((prev) => prev || msg.reasoning || "");
    setReasoningCollapsed((prev) => {
      const next = { ...prev };
      if ("streaming" in next) delete next.streaming;
      next[msg.id] = true;
      return next;
    });
    clearStreamSettleTimer();
    streamSettleTimerRef.current = window.setTimeout(() => {
      streamSettleTimerRef.current = null;
      setStreamSettling(false);
      setStreaming("");
      setStreamingReasoning("");
      setStreamHoldId(null);
      setLandedMessageId(msg.id);
      window.setTimeout(() => setLandedMessageId(null), 280);
    }, 220);
  }

  function resetStreamUi() {
    clearStreamSettleTimer();
    setStreamHoldId(null);
    setStreamSettling(false);
    setLandedMessageId(null);
    setStreaming("");
    setStreamingReasoning("");
  }

  function patchFollowUpMessage(msg: ChatMessage) {
    mergeStreamMessage(msg);
    setLandedMessageId(msg.id);
    window.setTimeout(() => setLandedMessageId(null), 280);
  }

  async function handleStream(path: string, body?: unknown) {
    stickBottomRef.current = true;
    flushSync(() => {
      generatingRef.current = true;
      setGenerating(true);
      setError("");
      resetStreamUi();
      setImageGenerating(false);
      setMusicSearching(false);
      setWebSearching(false);
      setVoiceGenerating(false);
    });

    try {
      await apiStream(path, body ?? {}, (event: StreamEvent) => {
        if (event.type === "user_message" && event.message) {
          replaceTempUserMessage(event.message);
        }
        if (event.type === "token" && event.token) {
          flushSync(() => {
            setStreaming((s) => s + event.token);
          });
          setWebSearching(false);
        }
        if (event.type === "reasoning" && event.token) {
          flushSync(() => {
            setStreamingReasoning((s) => s + event.token);
          });
        }
        if (event.type === "error") {
          setError(event.error || "生成失败");
          resetStreamUi();
        }
        if (event.type === "done") {
          if (event.message) settleStreamIntoList(event.message as ChatMessage);
          else resetStreamUi();
        }
        if (event.type === "image_generating") {
          setImageGenerating(true);
        }
        if (event.type === "image_done") {
          setImageGenerating(false);
          if (event.message) patchFollowUpMessage(event.message as ChatMessage);
        }
        if (event.type === "image_error") {
          setImageGenerating(false);
        }
        if (event.type === "music_searching") {
          setMusicSearching(true);
        }
        if (event.type === "music_done") {
          setMusicSearching(false);
          if (event.message) patchFollowUpMessage(event.message as ChatMessage);
        }
        if (event.type === "music_error") {
          setMusicSearching(false);
        }
        if (event.type === "voice_generating") {
          setVoiceGenerating(true);
        }
        if (event.type === "voice_done") {
          setVoiceGenerating(false);
          if (event.message) patchFollowUpMessage(event.message as ChatMessage);
        }
        if (event.type === "voice_error") {
          setVoiceGenerating(false);
        }
        if (event.type === "web_searching") {
          setWebSearching(true);
        }
        if (event.type === "leann_offer" && event.offer) {
          const offer = event.offer;
          setLeannOffers((prev) => {
            if (prev.some((o) => o.id === offer.id)) return prev;
            return [...prev, offer];
          });
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "请求失败");
      resetStreamUi();
    } finally {
      generatingRef.current = false;
      setGenerating(false);
      setImageGenerating(false);
      setRegeneratingId(null);
      setMusicSearching(false);
      setVoiceGenerating(false);
      setWebSearching(false);
    }
  }

  async function sendMessage(
    content: string,
    attachments: PendingAttachment[],
    memoryCitation?: PendingMemoryCitation | null,
    visionPrompt?: string | null
  ) {
    stickBottomRef.current = true;
    // 与 generating 同帧写入，减少被并发 loadChat 冲掉的窗口
    flushSync(() => {
      generatingRef.current = true;
      setGenerating(true);
      setChat((prev) =>
        prev
          ? {
              ...prev,
              messages: [
                ...prev.messages,
                {
                  id: `temp-${Date.now()}`,
                  role: "user",
                  content: content || `[附件 ${attachments.length} 个]`,
                  attachments,
                  memoryCitation: memoryCitation ?? undefined,
                },
              ],
            }
          : prev
      );
    });

    await handleStream(`/chats/${chatId}/messages`, {
      content,
      attachments: attachments.map((a) => ({
        id: a.id,
        name: a.name,
        mimeType: a.mimeType,
        kind: a.kind,
        size: a.size,
      })),
      memoryCitation: memoryCitation ?? undefined,
      visionPrompt: visionPrompt?.trim() || undefined,
    });
  }

  async function regenerateMessage(messageId: string) {
    if (selectMode || generating) return;
    if (!confirm("将删除此条及之后的对话，并重新生成该回复。继续？")) return;
    setRegeneratingId(messageId);
    // 先本地去掉该条及之后，避免与流式新回复叠成两条
    flushSync(() => {
      setChat((prev) => {
        if (!prev) return prev;
        const idx = prev.messages.findIndex(
          (m) => m.id === messageId && m.role === "assistant"
        );
        if (idx < 0) return prev;
        return { ...prev, messages: prev.messages.slice(0, idx) };
      });
    });
    await handleStream(`/chats/${chatId}/regenerate/${messageId}`, {});
  }

  async function resendUserMessage(messageId: string, content?: string) {
    if (selectMode || generating) return;
    if (!confirm("将删除此条之后的对话，并使用当前内容重新发送。继续？")) return;
    const body = content?.trim() ? { content: content.trim() } : {};
    cancelEdit();
    flushSync(() => {
      setChat((prev) => {
        if (!prev) return prev;
        const idx = prev.messages.findIndex(
          (m) => m.id === messageId && m.role === "user"
        );
        if (idx < 0) return prev;
        const kept = prev.messages.slice(0, idx + 1);
        if (content?.trim()) {
          kept[idx] = { ...kept[idx]!, content: content.trim() };
        }
        return { ...prev, messages: kept };
      });
    });
    await handleStream(`/chats/${chatId}/messages/${messageId}/resend`, body);
  }

  function startEdit(m: ChatMessage) {
    stickBottomRef.current = false;
    // 若该条不在当前可见窗口，先展开到足够条数
    if (chat) {
      const idxFromEnd = chat.messages.length - 1 - chat.messages.findIndex((x) => x.id === m.id);
      if (idxFromEnd >= 0) {
        setVisibleCount((prev) => Math.max(prev, Math.min(chat.messages.length, idxFromEnd + 5)));
      }
    }
    setEditingId(m.id);
    setEditDraft(m.content);
    scheduleScrollEditingMessage(m.id);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft("");
  }

  useEffect(() => {
    if (!editingId) return;
    const onKeyboard = () => scheduleScrollEditingMessage(editingId);
    const onFocused = () => scheduleScrollEditingMessage(editingId);
    window.addEventListener("rp-keyboard-layout", onKeyboard);
    window.addEventListener("rp-edit-focused", onFocused);
    scheduleScrollEditingMessage(editingId);
    return () => {
      window.removeEventListener("rp-keyboard-layout", onKeyboard);
      window.removeEventListener("rp-edit-focused", onFocused);
    };
  }, [editingId]);

  async function saveEdit(messageId: string, text?: string) {
    const nextContent = (text ?? editDraft).trim();
    if (!nextContent) {
      setError("消息内容不能为空");
      return;
    }
    setEditSaving(true);
    setError("");
    try {
      const res = await apiFetch<{ message: ChatMessage }>(`/chats/${chatId}/messages/${messageId}`, {
        method: "PUT",
        body: JSON.stringify({ content: nextContent }),
      });
      setChat((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          updatedAt: new Date().toISOString(),
          messages: prev.messages.map((m) =>
            m.id === messageId
              ? {
                  ...m,
                  content: res.message.content,
                  // 保留本地已有的分析占位，避免被 omitted stub 冲掉观感
                  contextLog: m.contextLog ?? res.message.contextLog,
                }
              : m
          ),
        };
      });
      cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "修改失败");
    } finally {
      setEditSaving(false);
    }
  }

  async function deleteMessage(messageId: string) {
    if (!confirm("确定删除这条消息？")) return;
    setDeletingId(messageId);
    setError("");
    const snapshot = chat;
    setChat((prev) =>
      prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== messageId) } : prev
    );
    if (editingId === messageId) cancelEdit();
    try {
      await apiFetch<{ ok: boolean }>(`/chats/${chatId}/messages/${messageId}`, {
        method: "DELETE",
      });
    } catch (err) {
      if (snapshot) setChat(snapshot);
      setError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingId(null);
    }
  }

  async function rateInjectedMemory(
    messageId: string,
    chunkId: string,
    rating: "up" | "down" | null
  ) {
    setMemoryFeedbackBusyId(messageId);
    setError("");
    try {
      const res = await apiFetch<{ message: ChatMessage }>(
        `/chats/${chatId}/messages/${messageId}/memory-feedback`,
        {
          method: "POST",
          body: JSON.stringify({ chunkId, rating }),
        }
      );
      if (res.message) {
        setChat((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) => (m.id === messageId ? { ...m, ...res.message } : m)),
          };
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "记忆评分失败");
      throw err;
    } finally {
      setMemoryFeedbackBusyId(null);
    }
  }

  async function completeInjectedActivity(
    messageId: string,
    activityId: string,
    occurrenceDate: string
  ) {
    setActivityCompleteBusyId(messageId);
    setError("");
    try {
      const res = await apiFetch<{ message: ChatMessage }>(
        `/chats/${chatId}/messages/${messageId}/activity-complete`,
        {
          method: "POST",
          body: JSON.stringify({ activityId, occurrenceDate }),
        }
      );
      if (res.message) {
        setChat((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            messages: prev.messages.map((m) => (m.id === messageId ? { ...m, ...res.message } : m)),
          };
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "标记活动完成失败");
      throw err;
    } finally {
      setActivityCompleteBusyId(null);
    }
  }

  async function speakText(text: string) {
    try {
      const res = await apiFetch<{ audioBase64: string; format: string; speaker: string }>(
        "/tts/speak",
        {
          method: "POST",
          body: JSON.stringify({ text, characterId }),
        }
      );
      const mime = res.format === "wav" ? "audio/wav" : "audio/mpeg";
      const audio = new Audio(`data:${mime};base64,${res.audioBase64}`);
      await audio.play();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "TTS 失败";
      alert(
        `语音朗读失败：${msg}\n\n` +
          "请到「设置 → 语音」确认：已启用朗读、供应商与模型/音色已保存；OpenAI 需先在「OpenAI 兼容」填好 Base URL 与 Key。"
      );
    }
  }

  function toggleReasoning(messageId: string) {
    setReasoningCollapsed((prev) => ({
      ...prev,
      [messageId]: prev[messageId] === false,
    }));
  }

  function isReasoningExpanded(messageId: string) {
    return reasoningCollapsed[messageId] === false;
  }

  function renderReasoningBlock(text: string, messageId: string, streaming = false) {
    return (
      <ChatReasoningChain
        messageId={messageId}
        text={text}
        streaming={streaming}
        expanded={isReasoningExpanded(messageId)}
        onExpandedChange={(open) =>
          setReasoningCollapsed((prev) => ({ ...prev, [messageId]: open ? false : true }))
        }
      />
    );
  }

  function shouldShowReasoning(m: ChatMessage) {
    return isReasonerModel || Boolean(m.reasoning?.trim()) || Boolean(streamingReasoning);
  }

  function displayContent(m: ChatMessage): string {
    if (m.role === "user") {
      let text = stripEnrichBlocksFromDisplay(m.content).trim();
      const hasAudio = m.attachments?.some((a) => a.kind === "audio");
      if (hasAudio && (/^\[语音[^\]]*\]$/i.test(text) || text === "[语音消息]")) {
        return "";
      }
      // 有语音时正文只保留转写（去掉前缀占位）
      if (hasAudio) {
        text = text
          .replace(/^\[语音[^\]]*\]\s*/i, "")
          .replace(/^\[语音消息\]\s*/i, "")
          .trim();
      }
      return text;
    }
    if (m.role === "assistant") {
      let text = stripSpeakerPrefix(m.content, [chat?.characterName || ""]);
      text = text
        .replace(/\[分享来自.+?的单曲《.+?》\]/g, "")
        .replace(/\[来自.+?的单曲《.+?》\]/g, "")
        .replace(/\[分享一张图：[\s\S]*?\]/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
      if (m.musicCard && (!text || /^\[.+ 为你点的歌\]$/.test(text))) return "";
      if (
        m.attachments?.some((a) => a.kind === "image") &&
        /^\[.+ 生成的图片\]$/.test(text)
      ) {
        return "";
      }
      return text;
    }
    return m.content;
  }

  function renderAssistantContent(m: ChatMessage, isEditing: boolean) {
    const hasReasoningArea = shouldShowReasoning(m);
    const reasoningText = m.reasoning || "";
    const hasAudio = hasAudioInAttachments(m.attachments);
    return (
      <div className="msg-assistant-inner">
        {hasReasoningArea && !isEditing && renderReasoningBlock(reasoningText, m.id)}
        {hasReasoningArea && !isEditing && isReasoningExpanded(m.id) && <div className="msg-reasoning-divider" />}
        {isEditing ? (
          <div className="msg-edit">
            <textarea
              rows={5}
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              disabled={editSaving || generating}
            />
            <div className="msg-edit-actions">
              <button type="button" className="btn btn-primary btn-sm" disabled={editSaving || generating} onClick={() => saveEdit(m.id, editDraft)}>
                保存
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={editSaving || generating} onClick={cancelEdit}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <>
            {hasAudio && m.attachments ? (
              <div className="msg-voice-only">
                <ChatVoiceAttachments chatId={chatId} attachments={m.attachments} side="assistant" />
              </div>
            ) : null}
            {!hasAudio && displayContent(m) ? (
              <div className="msg-content">
                <ChatMessageContent text={displayContent(m)} />
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  }

  function getMessageActionItems(m: ChatMessage): ItemType[] {
    if (selectMode) return [];
    const isAssistant = m.role === "assistant";
    const isEditing = editingId === m.id;
    if (isEditing) return [];

    const items: ItemType[] = [
      {
        key: "edit",
        icon: <EditOutlined />,
        label: "修改",
        onItemClick: () => startEdit(m),
      },
      {
        key: "del",
        icon: <DeleteOutlined />,
        label: "删除",
        danger: true,
        onItemClick: () => deleteMessage(m.id),
      },
    ];

    if (isAssistant && shouldShowReasoning(m)) {
      items.push({
        key: "reason",
        icon: isReasoningExpanded(m.id) ? <EyeInvisibleOutlined /> : <EyeOutlined />,
        label: isReasoningExpanded(m.id) ? "隐藏内心戏" : "显示内心戏",
        onItemClick: () => toggleReasoning(m.id),
      });
    }

    if (isAssistant) {
      // 已有语音条时不必再「朗读」；要看字用语音条下的「转文字」
      if (!m.attachments?.some((a) => a.kind === "audio")) {
        items.push({
          key: "speak",
          icon: <SoundOutlined />,
          label: "朗读",
          onItemClick: () => speakText(displayContent(m)),
        });
      }
      items.push(
        {
          key: "regen",
          icon: <ReloadOutlined />,
          label: regeneratingId === m.id ? "生成中…" : "重新生成",
          onItemClick: () => regenerateMessage(m.id),
        },
        {
          key: "analysis",
          icon: <BulbOutlined />,
          label: "提示词分析",
          onItemClick: () => {
            const lastAssistant = [...(chat?.messages ?? [])]
              .reverse()
              .find((x) => x.role === "assistant");
            setAnalysisMeta({
              messageId: m.id,
              createdAt: m.createdAt,
              isLatestAssistant: lastAssistant?.id === m.id,
              replyContent: m.content,
              reasoningContent: m.reasoning,
            });
            const stub =
              m.contextLog &&
              typeof m.contextLog === "object" &&
              (m.contextLog as { omitted?: boolean }).omitted === true;
            if (stub || !m.contextLog) {
              setAnalysisLog({ 说明: "正在加载提示词分析…" });
              void apiFetch<{ contextLog: unknown }>(
                `/chats/${chatId}/messages/${m.id}/context-log`
              )
                .then((res) => setAnalysisLog(res.contextLog))
                .catch(() =>
                  setAnalysisLog({
                    说明: "无法加载提示词分析，请稍后重试。",
                  })
                );
            } else {
              setAnalysisLog(m.contextLog);
            }
          },
        }
      );
    } else {
      items.push({
        key: "resend",
        icon: <SendOutlined />,
        label: "重新发送",
        onItemClick: () => resendUserMessage(m.id),
      });
    }

    return items;
  }

  if (!chat) {
    return (
      <AppShell title="聊天">
        <div className="chat-empty">
          <p>{error || "加载中…"}</p>
        </div>
      </AppShell>
    );
  }

  const wereadEligibleMessages = getWeReadEligibleMessages(chat.messages);
  const wereadEligibleCount = wereadEligibleMessages.length;
  void excerptDismissTick;
  const pendingExcerptMessages = wereadEligibleMessages.filter(
    (m) => !getDismissedExcerptMessageIds(chatId).has(m.id)
  );
  const proactiveUnreadCount = unreadChats.find((c) => c.chatId === chatId)?.count ?? 0;
  const displayCount = selectMode ? chat.messages.length : visibleCount;
  const hiddenCount = selectMode ? 0 : Math.max(0, chat.messages.length - visibleCount);
  const visibleMessages = chat.messages
    .slice(-displayCount)
    .filter((m) => !streamHoldId || m.id !== streamHoldId);
  const inToolWait = imageGenerating || musicSearching || webSearching || voiceGenerating;
  const streamSettled =
    !streaming && !streamingReasoning && !streamHoldId && !streamSettling;
  const showStreamBlock =
    Boolean(streaming || streamingReasoning) ||
    streamHoldId ||
    streamSettling ||
    (generating && !streamSettled && !inToolWait);

  return (
    <AppShell title={chat.characterName}>
      <div
        className={`chat-layout${editingId ? " chat-layout-editing" : ""}`}
        style={chatThemeToCssVars(chatTheme) as CSSProperties}
      >
        <button
          type="button"
          className="chat-back-fab"
          aria-label="返回会话列表"
          title="返回会话列表"
          onClick={() => router.push("/chat")}
        >
          ‹
        </button>
        {pendingExcerptMessages.length > 0 && !selectMode && (
          <div className="chat-proactive-banner chat-weread-excerpt-banner">
            <span>
              📚{" "}
              {pendingExcerptMessages.length === 1
                ? "本条对话含微信读书划线/笔记，可记入共读草稿"
                : `有 ${pendingExcerptMessages.length} 条消息含划线/笔记，可记入共读草稿`}
            </span>
            <div className="chat-proactive-banner-actions">
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => startCoreadMode(pendingExcerptMessages.map((m) => m.id))}
              >
                记入共读
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  dismissExcerptMessages(
                    chatId,
                    pendingExcerptMessages.map((m) => m.id)
                  );
                  setExcerptDismissTick((t) => t + 1);
                }}
              >
                忽略
              </button>
            </div>
          </div>
        )}
        {leannOffers.length > 0 && !selectMode &&
          leannOffers.map((offer) => (
            <div
              key={offer.id}
              className="chat-proactive-banner chat-leann-offer-banner"
            >
              <span>
                {offer.source === "bilibili" ? "🎬" : offer.source === "zhihu" ? "📌" : "🌐"}{" "}
                已解析《{offer.title}》
                （约 {offer.charCount} 字），要存成电子书草稿吗？（可到记忆库编辑后再向量化）
              </span>
              <div className="chat-proactive-banner-actions">
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={leannOfferBusyId === offer.id}
                  onClick={() => void confirmLeannOffer(offer.id)}
                >
                  {leannOfferBusyId === offer.id ? "保存中…" : "存为草稿"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={leannOfferBusyId === offer.id}
                  onClick={() => void dismissLeannOffer(offer.id)}
                >
                  跳过
                </button>
              </div>
            </div>
          ))}
        {proactiveUnreadCount > 0 && !selectMode && (
          <div className="chat-proactive-banner">
            <span>💬 {chat.characterName}发来 {proactiveUnreadCount} 条新消息</span>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                stickBottomRef.current = true;
                scrollToBottom("smooth");
                window.setTimeout(() => tryMarkProactiveSeen(true), 500);
              }}
            >
              查看
            </button>
          </div>
        )}
        {selectMode && (
          <div className="chat-toolbar">
            <span className="hint chat-select-hint">
              {selectPurpose === "coread"
                ? `勾选要记入共读的消息（已选 ${selectedIds.size} 条）`
                : selectPurpose === "weread"
                  ? `勾选带 📚 标记的消息（本聊天共 ${wereadEligibleCount} 条可摘抄，已选 ${selectedIds.size} 条）`
                  : selectPurpose === "obsidian"
                    ? `勾选要沉淀到 Obsidian 的讨论（已选 ${selectedIds.size} 条）`
                    : `勾选要总结的消息（已选 ${selectedIds.size} 条）`}
            </span>
            <button
              type="button"
              className="btn btn-primary"
              disabled={
                summarizing ||
                coreadSaving ||
                selectedIds.size === 0
              }
              onClick={() => {
                if (selectPurpose === "coread") {
                  setCoreadModalOpen(true);
                  return;
                }
                if (selectPurpose === "weread") {
                  void previewWeReadSelected();
                  return;
                }
                if (selectPurpose === "obsidian") {
                  void previewObsidianSelected();
                  return;
                }
                void summarizeSelected();
              }}
            >
              {summarizing
                ? "整理中…"
                : selectPurpose === "coread"
                  ? "选择共读卡"
                  : selectPurpose === "weread"
                    ? "预览摘抄"
                    : selectPurpose === "obsidian"
                      ? "预览沉淀"
                      : "预览总结"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={summarizing || coreadSaving}
              onClick={exitSelectMode}
            >
              取消
            </button>
          </div>
        )}

        <div
          className={`chat-messages-area${chatTheme.messagesBgImage ? " has-bg-image" : ""}`}
          style={
            chatTheme.messagesBgImage
              ? { backgroundImage: `url(${chatTheme.messagesBgImage})` }
              : undefined
          }
        >
          <div
            ref={messagesScrollRef}
            className={`chat-messages${selectMode ? "" : " chat-messages-antx"}${editingId ? " chat-messages-is-editing" : ""}`}
          >
          {hiddenCount > 0 && (
            <button type="button" className="btn btn-outline btn-sm chat-load-history" onClick={loadMoreHistory}>
              历史消息（还有 {hiddenCount} 条）
            </button>
          )}
          {!selectMode ? (
            <>
              <ChatBubbleList
                messages={visibleMessages}
                chatId={chatId}
                characterId={characterId}
                characterName={chat.characterName}
                userName={userName}
                characterHasAvatar={characterHasAvatar}
                userHasAvatar={userHasAvatar}
                characterAvatarVersion={characterAvatarVersion}
                userAvatarVersion={userAvatarVersion}
                actionBusy={editSaving || generating || Boolean(deletingId)}
                editingId={editingId}
                landedMessageId={landedMessageId}
                displayContent={displayContent}
                shouldShowReasoning={shouldShowReasoning}
                isReasoningExpanded={isReasoningExpanded}
                onReasoningExpandedChange={(messageId, expanded) =>
                  setReasoningCollapsed((prev) => ({ ...prev, [messageId]: expanded ? false : true }))
                }
                getActionItems={getMessageActionItems}
                onSaveEdit={saveEdit}
                onCancelEdit={cancelEdit}
                onResendEdit={resendUserMessage}
                onMemoryFeedback={rateInjectedMemory}
                memoryFeedbackBusyId={memoryFeedbackBusyId}
                onActivityComplete={completeInjectedActivity}
                activityCompleteBusyId={activityCompleteBusyId}
              />
              {showStreamBlock && (
                <div className={`chat-stream-block${streamSettling ? " chat-stream-settling" : ""}`}>
                  {(isReasonerModel || Boolean(streamingReasoning.trim())) &&
                    renderReasoningBlock(streamingReasoning, "streaming", !streamSettling)}
                  {(isReasonerModel || Boolean(streamingReasoning.trim())) &&
                    isReasoningExpanded("streaming") && <div className="msg-reasoning-divider" />}
                  <div className="chat-stream-row">
                    <ChatSpeakerBlock
                      role="assistant"
                      displayName={chat.characterName}
                      characterId={characterId}
                      characterName={chat.characterName}
                      userName={userName}
                      characterHasAvatar={characterHasAvatar}
                      userHasAvatar={userHasAvatar}
                      characterAvatarVersion={characterAvatarVersion}
                      userAvatarVersion={userAvatarVersion}
                    />
                    <div className="chat-stream-bubble-shell">
                      {streaming ? (
                        <div className="msg-content msg-content-streaming">
                          <ChatMessageContent
                            text={stripSpeakerPrefix(streaming, [chat.characterName])}
                          />
                        </div>
                      ) : (
                        <ThinkingDots />
                      )}
                    </div>
                  </div>
                </div>
              )}
              {imageGenerating && (
                <ToolWaitingBubble
                  text="正在生成图片，请稍候…"
                  characterId={characterId}
                  characterName={chat.characterName}
                  userName={userName}
                  characterHasAvatar={characterHasAvatar}
                  userHasAvatar={userHasAvatar}
                  characterAvatarVersion={characterAvatarVersion}
                  userAvatarVersion={userAvatarVersion}
                />
              )}
              {voiceGenerating && (
                <ToolWaitingBubble
                  text="正在生成语音，请稍候…"
                  characterId={characterId}
                  characterName={chat.characterName}
                  userName={userName}
                  characterHasAvatar={characterHasAvatar}
                  userHasAvatar={userHasAvatar}
                  characterAvatarVersion={characterAvatarVersion}
                  userAvatarVersion={userAvatarVersion}
                />
              )}
              {musicSearching && (
                <ToolWaitingBubble
                  text="正在为你找歌，请稍候…"
                  characterId={characterId}
                  characterName={chat.characterName}
                  userName={userName}
                  characterHasAvatar={characterHasAvatar}
                  userHasAvatar={userHasAvatar}
                  characterAvatarVersion={characterAvatarVersion}
                  userAvatarVersion={userAvatarVersion}
                />
              )}
              {webSearching && (
                <ToolWaitingBubble
                  text="正在联网搜索，请稍候…"
                  characterId={characterId}
                  characterName={chat.characterName}
                  userName={userName}
                  characterHasAvatar={characterHasAvatar}
                  userHasAvatar={userHasAvatar}
                  characterAvatarVersion={characterAvatarVersion}
                  userAvatarVersion={userAvatarVersion}
                />
              )}
            </>
          ) : (
            visibleMessages.map((m) => {
              const selected = selectedIds.has(m.id);
              const isEditing = editingId === m.id;
              const coreadEligible =
                selectPurpose !== "coread" ||
                stripEnrichBlocksFromDisplay(m.content || "").trim().length > 0;
              const wereadEligible =
                selectPurpose !== "weread" ||
                (m.role === "user" && hasWeReadExcerptableContent(m.content));
              const selectable = coreadEligible && wereadEligible;
              return (
                <div
                  key={m.id}
                  className={`msg msg-${m.role} ${selectable ? "msg-selectable" : ""} ${!selectable ? "msg-select-disabled" : ""} ${selected ? "msg-selected" : ""}`}
                  onClick={selectable ? () => toggleSelect(m.id, m) : undefined}
                >
                  {selectable && (
                    <input
                      type="checkbox"
                      className="msg-checkbox"
                      checked={selected}
                      onChange={() => toggleSelect(m.id, m)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  )}
                  <div className="msg-body">
                    <div className="msg-header">
                      <div className="msg-role">
                        {m.role === "user" ? userName : chat.characterName}
                        {m.role === "user" && hasWeReadExcerptableContent(m.content) && (
                          <span className="msg-weread-badge" title="此消息含微信读书划线/笔记">
                            📚 划线
                          </span>
                        )}
                      </div>
                    </div>
                    {m.attachments && hasNonAudioExtras(m.attachments) && (
                      <ChatMessageAttachments
                        chatId={chatId}
                        attachments={m.attachments}
                        side={m.role === "user" ? "user" : "assistant"}
                      />
                    )}
                    {m.musicCard && <ChatMusicCard card={m.musicCard} />}
                    {m.role === "assistant" ? (
                      renderAssistantContent(m, isEditing)
                    ) : isEditing ? (
                      <div className="msg-edit">
                        <textarea
                          rows={5}
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          disabled={editSaving || generating}
                        />
                        <div className="msg-edit-actions">
                          <button type="button" className="btn btn-primary btn-sm" disabled={editSaving || generating} onClick={() => saveEdit(m.id, editDraft)}>
                            保存
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={editSaving || generating}
                            onClick={() => resendUserMessage(m.id, editDraft)}
                          >
                            重新发送
                          </button>
                          <button type="button" className="btn btn-ghost btn-sm" disabled={editSaving || generating} onClick={cancelEdit}>
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {hasAudioInAttachments(m.attachments) && m.attachments ? (
                          <div className="msg-voice-only">
                            <ChatVoiceAttachments chatId={chatId} attachments={m.attachments} side="user" />
                          </div>
                        ) : null}
                        {!hasAudioInAttachments(m.attachments) && displayContent(m) ? (
                          <div className="msg-content">
                            <ChatMessageContent text={displayContent(m)} />
                          </div>
                        ) : null}
                        {m.role === "user" && m.memoryCitation?.text && (
                          <p className="msg-memory-cite hint">
                            📌 引用记忆：{m.memoryCitation.text.length > 60
                              ? `${m.memoryCitation.text.slice(0, 60)}…`
                              : m.memoryCitation.text}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesBottomRef} className="chat-messages-bottom-anchor" aria-hidden />
          </div>
        </div>

        {error && <div className="chat-error">{error}</div>}

        {analysisLog ? (
          <PromptAnalysisPanel
            contextLog={analysisLog}
            messageMeta={analysisMeta}
            onClose={() => {
              setAnalysisLog(null);
              setAnalysisMeta(null);
            }}
          />
        ) : null}

        {/* 编辑中藏起底部发送栏，避免 iPhone 键盘叠两层输入 */}
        {!editingId ? (
          <ChatInputBar
            chatId={chatId}
            disabled={generating || editSaving || Boolean(deletingId)}
            loading={generating}
            selectMode={selectMode}
            selectModeHint={
              selectPurpose === "coread"
                ? "请先完成记入共读或点取消"
                : selectPurpose === "weread"
                  ? "请先完成读书摘抄或点取消"
                  : selectPurpose === "obsidian"
                    ? "请先完成沉淀或点取消"
                    : "请先完成事件总结或点取消"
            }
            onSend={sendMessage}
            onStartEventSummary={() => preserveScrollExpandAll(() => setSelectPurpose("event"))}
            onStartCoread={() => startCoreadMode()}
            onStartObsidianSettle={() =>
              preserveScrollExpandAll(() => setSelectPurpose("obsidian"))
            }
          />
        ) : (
          <div className="chat-edit-mode-hint" role="status">
            正在修改消息 · 保存或取消后继续聊天
          </div>
        )}

        <EventSummaryModal
          open={eventModalOpen}
          chatTitle={eventMeta?.chatTitle || chat.characterName}
          messageCount={eventMeta?.messageCount ?? selectedIds.size}
          initialSummary={eventSummaries}
          suggestedMemoryAt={eventMeta?.suggestedMemoryAt}
          loading={eventPreviewLoading}
          saving={eventSaving}
          onClose={closeEventModal}
          onConfirm={commitEventMemory}
        />

        <ObsidianSettleModal
          open={obsidianModalOpen}
          loading={obsidianPreviewLoading}
          saving={obsidianSaving}
          initialTitle={obsidianTitle}
          initialSummary={obsidianSummary}
          sourceLinks={obsidianLinks}
          onClose={() => setObsidianModalOpen(false)}
          onConfirm={commitObsidianSettle}
        />

        <CoreadPickModal
          open={coreadModalOpen}
          messageCount={selectedIds.size}
          saving={coreadSaving}
          onClose={() => setCoreadModalOpen(false)}
          onConfirm={(bookId) => void commitCoreadDraft(bookId)}
        />

        <WeReadMemoryModal
          open={wereadModalOpen}
          chatTitle={wereadMeta?.chatTitle || chat.characterName}
          messageCount={wereadMeta?.messageCount ?? selectedIds.size}
          bookTitle={wereadMeta?.bookTitle}
          progress={wereadMeta?.progress}
          initialSummary={wereadSummary}
          suggestedKeysText={wereadMeta?.suggestedKeysText}
          loading={wereadPreviewLoading}
          saving={wereadSaving}
          onClose={closeWeReadModal}
          onConfirm={commitWeReadMemory}
        />
      </div>
    </AppShell>
  );
}
