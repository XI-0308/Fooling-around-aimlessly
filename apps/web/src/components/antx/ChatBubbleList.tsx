"use client";

import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { Bubble } from "@ant-design/x";
import type { ItemType } from "@ant-design/x/es/actions/interface";
import ChatMessageActions from "@/components/antx/ChatMessageActions";
import ChatReasoningChain from "@/components/antx/ChatReasoningChain";
import ChatMessageAttachments, {
  ChatVoiceAttachments,
  hasNonAudioExtras,
} from "@/components/ChatMessageAttachments";
import ChatMessageContent from "@/components/ChatMessageContent";
import ChatMusicCard, { type MusicCardData } from "@/components/ChatMusicCard";
import ChatSpeakerBlock from "@/components/antx/ChatSpeakerBlock";
import { ChatTimeMarker, collectTimeMarkersBeforeMessage } from "@/components/ChatTimeMarker";
import MemoryRecallFeedback from "@/components/MemoryRecallFeedback";
import ActivityRemindFeedback from "@/components/ActivityRemindFeedback";
import { hasWeReadExcerptableContent } from "@/lib/enrichDisplay";

export type ChatBubbleMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: string;
  reasoning?: string;
  attachments?: { id: string; name: string; kind: string; durationSec?: number }[];
  musicCard?: MusicCardData;
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
};

type Props = {
  messages: ChatBubbleMessage[];
  chatId: string;
  characterId?: string;
  characterName: string;
  userName: string;
  characterHasAvatar: boolean;
  userHasAvatar: boolean;
  characterAvatarVersion?: number;
  userAvatarVersion?: number;
  actionBusy: boolean;
  editingId: string | null;
  displayContent: (m: ChatBubbleMessage) => string;
  shouldShowReasoning: (m: ChatBubbleMessage) => boolean;
  isReasoningExpanded: (messageId: string) => boolean;
  onReasoningExpandedChange: (messageId: string, expanded: boolean) => void;
  getActionItems: (m: ChatBubbleMessage) => ItemType[];
  onSaveEdit: (messageId: string, text: string) => void;
  onCancelEdit: () => void;
  onResendEdit: (messageId: string, text: string) => void;
  landedMessageId?: string | null;
  onMemoryFeedback?: (
    messageId: string,
    chunkId: string,
    rating: "up" | "down" | null
  ) => void | Promise<void>;
  memoryFeedbackBusyId?: string | null;
  onActivityComplete?: (
    messageId: string,
    activityId: string,
    occurrenceDate: string
  ) => void | Promise<void>;
  activityCompleteBusyId?: string | null;
};

const BUBBLE_ROLE = {
  ai: { placement: "start" as const, variant: "filled" as const, shape: "round" as const },
  user: { placement: "end" as const, variant: "filled" as const, shape: "round" as const },
};

function MessageEditForm({
  initialText,
  busy,
  showResend,
  onSave,
  onCancel,
  onResend,
}: {
  initialText: string;
  busy: boolean;
  showResend: boolean;
  onSave: (text: string) => void;
  onCancel: () => void;
  onResend?: (text: string) => void;
}) {
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    // 等父级藏起底部输入栏 / 加完 padding 后再聚焦，减少 iPhone 乱顶整页
    const timer = window.setTimeout(() => {
      ta.focus({ preventScroll: true });
      const len = ta.value.length;
      try {
        ta.setSelectionRange(len, len);
      } catch {
        /* ignore */
      }
      window.dispatchEvent(new CustomEvent("rp-edit-focused"));
    }, 60);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="msg-edit">
      <textarea
        ref={textareaRef}
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        enterKeyHint="done"
      />
      <div className="msg-edit-actions">
        <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => onSave(text)}>
          保存
        </button>
        {showResend && onResend && (
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => onResend(text)}>
            重新发送
          </button>
        )}
        <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}

function hasAudioAttachment(m: ChatBubbleMessage): boolean {
  return Boolean(m.attachments?.some((a) => a.kind === "audio"));
}

type RowProps = {
  m: ChatBubbleMessage;
  index: number;
  messages: ChatBubbleMessage[];
  chatId: string;
  characterId?: string;
  characterName: string;
  userName: string;
  characterHasAvatar: boolean;
  userHasAvatar: boolean;
  characterAvatarVersion?: number;
  userAvatarVersion?: number;
  actionBusy: boolean;
  isEditing: boolean;
  displayContent: (m: ChatBubbleMessage) => string;
  shouldShowReasoning: (m: ChatBubbleMessage) => boolean;
  isReasoningExpanded: (messageId: string) => boolean;
  onReasoningExpandedChange: (messageId: string, expanded: boolean) => void;
  actionItems: ItemType[];
  onSaveEdit: (messageId: string, text: string) => void;
  onCancelEdit: () => void;
  onResendEdit: (messageId: string, text: string) => void;
  landedMessageId?: string | null;
  onMemoryFeedback?: (
    messageId: string,
    chunkId: string,
    rating: "up" | "down" | null
  ) => void | Promise<void>;
  memoryFeedbackBusyId?: string | null;
  onActivityComplete?: (
    messageId: string,
    activityId: string,
    occurrenceDate: string
  ) => void | Promise<void>;
  activityCompleteBusyId?: string | null;
};

const ChatBubbleRow = memo(function ChatBubbleRow({
  m,
  index,
  messages,
  chatId,
  characterId,
  characterName,
  userName,
  characterHasAvatar,
  userHasAvatar,
  characterAvatarVersion,
  userAvatarVersion,
  actionBusy,
  isEditing,
  displayContent,
  shouldShowReasoning,
  isReasoningExpanded,
  onReasoningExpandedChange,
  actionItems,
  onSaveEdit,
  onCancelEdit,
  onResendEdit,
  landedMessageId,
  onMemoryFeedback,
  memoryFeedbackBusyId,
  onActivityComplete,
  activityCompleteBusyId,
}: RowProps) {
  const role = m.role === "user" ? "user" : "ai";
  const cfg = BUBBLE_ROLE[role === "user" ? "user" : "ai"];
  const beforeMarkers = collectTimeMarkersBeforeMessage(messages, index);
  const hasVoice = hasAudioAttachment(m);
  // 语音消息：气泡里只放语音条，不显示转写文字
  const bubbleText = hasVoice && !isEditing ? "" : displayContent(m);
  const hasReasoningArea = m.role === "assistant" && shouldShowReasoning(m) && !isEditing;
  const side = m.role === "user" ? "user" : "assistant";
  const hasInjected =
    m.role === "assistant" && !isEditing && Boolean(m.injectedMemories?.length);
  const hasActivityRemind =
    m.role === "assistant" && !isEditing && Boolean(m.injectedActivities?.length);
  const hasBubbleBody =
    isEditing ||
    hasReasoningArea ||
    hasVoice ||
    Boolean(bubbleText.trim()) ||
    Boolean(m.role === "user" && m.memoryCitation?.text);
  const hasExtras =
    !isEditing &&
    (hasNonAudioExtras(m.attachments) ||
      (m.role === "assistant" && Boolean(m.musicCard)) ||
      hasInjected ||
      hasActivityRemind);

  const extra =
    m.role === "user" && hasWeReadExcerptableContent(m.content) ? (
      <span className="msg-weread-badge" title="此消息含可摘抄的划线/笔记">
        📚
      </span>
    ) : null;

  const voiceInside =
    !isEditing && hasVoice && m.attachments ? (
      <ChatVoiceAttachments chatId={chatId} attachments={m.attachments} side={side} />
    ) : null;

  let body: ReactNode;

  if (m.role === "assistant") {
    body = (
      <div className="msg-assistant-inner">
        {shouldShowReasoning(m) && !isEditing && (
          <ChatReasoningChain
            messageId={m.id}
            text={m.reasoning || ""}
            expanded={isReasoningExpanded(m.id)}
            onExpandedChange={(open) => onReasoningExpandedChange(m.id, open)}
          />
        )}
        {shouldShowReasoning(m) && !isEditing && isReasoningExpanded(m.id) && (
          <div className="msg-reasoning-divider" />
        )}
        {isEditing ? (
          <MessageEditForm
            initialText={m.content}
            busy={actionBusy}
            showResend={false}
            onSave={(text) => onSaveEdit(m.id, text)}
            onCancel={onCancelEdit}
          />
        ) : (
          <>
            {voiceInside ? <div className="msg-voice-only">{voiceInside}</div> : null}
            {bubbleText ? (
              <div className="msg-content">
                <ChatMessageContent text={bubbleText} />
              </div>
            ) : null}
          </>
        )}
      </div>
    );
  } else if (isEditing) {
    body = (
      <MessageEditForm
        initialText={m.content}
        busy={actionBusy}
        showResend
        onSave={(text) => onSaveEdit(m.id, text)}
        onResend={(text) => onResendEdit(m.id, text)}
        onCancel={onCancelEdit}
      />
    );
  } else {
    body = (
      <>
        {voiceInside ? <div className="msg-voice-only">{voiceInside}</div> : null}
        {bubbleText ? (
          <div className="msg-content">
            <ChatMessageContent text={bubbleText} />
          </div>
        ) : null}
        {m.memoryCitation?.text ? (
          <p className="msg-memory-cite hint">
            📌 引用记忆：
            {m.memoryCitation.text.length > 60
              ? `${m.memoryCitation.text.slice(0, 60)}…`
              : m.memoryCitation.text}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <div className={`chat-bubble-row${isEditing ? " is-editing-message" : ""}`} data-message-id={m.id}>
      {beforeMarkers.map((item, i) => (
        <ChatTimeMarker key={`${m.id}-marker-${item.kind}-${i}`} item={item} />
      ))}
      {hasBubbleBody ? (
        <Bubble
          className={`chat-bubble-item chat-bubble-item-${role}${hasVoice ? " chat-bubble-item-voice" : ""}${
            landedMessageId === m.id ? " chat-bubble-item-landed" : ""
          }`}
          placement={cfg.placement}
          variant={cfg.variant}
          shape={cfg.shape}
          avatar={
            <ChatSpeakerBlock
              role={m.role === "user" ? "user" : "assistant"}
              displayName={m.role === "user" ? userName : characterName}
              characterId={characterId}
              characterName={characterName}
              userName={userName}
              characterHasAvatar={characterHasAvatar}
              userHasAvatar={userHasAvatar}
              characterAvatarVersion={characterAvatarVersion}
              userAvatarVersion={userAvatarVersion}
              extra={extra}
            />
          }
          header={
            !isEditing && actionItems.length > 0 ? (
              <ChatMessageActions items={actionItems} className="chat-bubble-actions chat-bubble-actions-header" />
            ) : undefined
          }
          content={m.id}
          contentRender={() => <>{body}</>}
        />
      ) : null}
      {hasExtras ? (
        <div
          className={`chat-msg-extras chat-msg-extras-${role}${landedMessageId === m.id ? " chat-msg-extras-landed" : ""}`}
        >
          {hasInjected && m.injectedMemories && onMemoryFeedback ? (
            <MemoryRecallFeedback
              items={m.injectedMemories}
              busy={memoryFeedbackBusyId === m.id}
              onRate={(chunkId, rating) => onMemoryFeedback(m.id, chunkId, rating)}
            />
          ) : null}
          {hasActivityRemind && m.injectedActivities && onActivityComplete ? (
            <ActivityRemindFeedback
              items={m.injectedActivities}
              busy={activityCompleteBusyId === m.id}
              onComplete={(activityId, occurrenceDate) =>
                onActivityComplete(m.id, activityId, occurrenceDate)
              }
            />
          ) : null}
          {m.attachments && hasNonAudioExtras(m.attachments) ? (
            <ChatMessageAttachments chatId={chatId} attachments={m.attachments} side={side} />
          ) : null}
          {m.musicCard ? <ChatMusicCard card={m.musicCard} /> : null}
        </div>
      ) : null}
    </div>
  );
}, rowPropsEqual);

function rowPropsEqual(prev: RowProps, next: RowProps): boolean {
  if (prev.m !== next.m) {
    if (
      prev.m.id !== next.m.id ||
      prev.m.content !== next.m.content ||
      prev.m.reasoning !== next.m.reasoning ||
      prev.m.role !== next.m.role ||
      prev.m.musicCard !== next.m.musicCard ||
      prev.m.attachments !== next.m.attachments ||
      prev.m.memoryCitation !== next.m.memoryCitation ||
      prev.m.injectedMemories !== next.m.injectedMemories ||
      prev.m.injectedActivities !== next.m.injectedActivities
    ) {
      return false;
    }
  }
  return (
    prev.index === next.index &&
    prev.messages === next.messages &&
    prev.isEditing === next.isEditing &&
    prev.actionBusy === next.actionBusy &&
    prev.actionItems === next.actionItems &&
    prev.landedMessageId === next.landedMessageId &&
    prev.memoryFeedbackBusyId === next.memoryFeedbackBusyId &&
    prev.activityCompleteBusyId === next.activityCompleteBusyId &&
    prev.isReasoningExpanded(prev.m.id) === next.isReasoningExpanded(next.m.id)
  );
}

export default function ChatBubbleList({
  messages,
  chatId,
  characterId,
  characterName,
  userName,
  characterHasAvatar,
  userHasAvatar,
  characterAvatarVersion,
  userAvatarVersion,
  actionBusy,
  editingId,
  displayContent,
  shouldShowReasoning,
  isReasoningExpanded,
  onReasoningExpandedChange,
  getActionItems,
  onSaveEdit,
  onCancelEdit,
  onResendEdit,
  landedMessageId,
  onMemoryFeedback,
  memoryFeedbackBusyId,
  onActivityComplete,
  activityCompleteBusyId,
}: Props) {
  return (
    <div className="chat-bubble-list">
      {messages.map((m, index) => (
        <ChatBubbleRow
          key={m.id}
          m={m}
          index={index}
          messages={messages}
          chatId={chatId}
          characterId={characterId}
          characterName={characterName}
          userName={userName}
          characterHasAvatar={characterHasAvatar}
          userHasAvatar={userHasAvatar}
          characterAvatarVersion={characterAvatarVersion}
          userAvatarVersion={userAvatarVersion}
          actionBusy={actionBusy}
          isEditing={editingId === m.id}
          displayContent={displayContent}
          shouldShowReasoning={shouldShowReasoning}
          isReasoningExpanded={isReasoningExpanded}
          onReasoningExpandedChange={onReasoningExpandedChange}
          actionItems={getActionItems(m)}
          onSaveEdit={onSaveEdit}
          onCancelEdit={onCancelEdit}
          onResendEdit={onResendEdit}
          landedMessageId={landedMessageId}
          onMemoryFeedback={onMemoryFeedback}
          memoryFeedbackBusyId={memoryFeedbackBusyId}
          onActivityComplete={onActivityComplete}
          activityCompleteBusyId={activityCompleteBusyId}
        />
      ))}
    </div>
  );
}
