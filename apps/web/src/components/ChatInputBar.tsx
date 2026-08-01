"use client";

import {
  AudioOutlined,
  BookOutlined,
  BulbOutlined,
  CloseOutlined,
  EditOutlined,
  FileTextOutlined,
  PaperClipOutlined,
  PlusOutlined,
  PushpinOutlined,
  SendOutlined,
} from "@ant-design/icons";
import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import { blobToWavBlob } from "@/lib/audioToWav";
import MemoryPickerModal, { type MemoryPickResult } from "@/components/MemoryPickerModal";
import { prefetchMicrophonePermission, useVoiceRecorder } from "@/hooks/useVoiceRecorder";

export interface PendingAttachment {
  id: string;
  name: string;
  mimeType: string;
  kind: string;
  size: number;
  previewUrl?: string;
  durationSec?: number;
}

export interface PendingMemoryCitation {
  chunkId: string;
  text: string;
}

interface ChatInputBarProps {
  chatId: string;
  disabled: boolean;
  loading: boolean;
  selectMode: boolean;
  selectModeHint?: string;
  onSend: (
    content: string,
    attachments: PendingAttachment[],
    memoryCitation?: PendingMemoryCitation | null,
    visionPrompt?: string | null
  ) => void;
  onStartEventSummary?: () => void;
  onStartCoread?: () => void;
  onStartObsidianSettle?: () => void;
}

function truncate(text: string, max = 48): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

function guessMimeFromName(name: string): string | null {
  const n = name.toLowerCase();
  if (/\.jpe?g$/.test(n)) return "image/jpeg";
  if (/\.png$/.test(n)) return "image/png";
  if (/\.gif$/.test(n)) return "image/gif";
  if (/\.webp$/.test(n)) return "image/webp";
  if (/\.heic$/.test(n)) return "image/heic";
  if (/\.heif$/.test(n)) return "image/heif";
  if (/\.bmp$/.test(n)) return "image/bmp";
  if (/\.avif$/.test(n)) return "image/avif";
  return null;
}

function isImageFile(file: File, mime: string): boolean {
  return mime.startsWith("image/") || Boolean(guessMimeFromName(file.name));
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function ToolIconButton({
  icon,
  label,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="btn btn-ghost input-tool-btn input-tool-icon-btn"
      disabled={disabled}
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      {icon}
      <span className="input-tool-label">{label}</span>
    </button>
  );
}

export default function ChatInputBar({
  chatId,
  disabled,
  loading,
  selectMode,
  selectModeHint,
  onSend,
  onStartEventSummary,
  onStartCoread,
  onStartObsidianSettle,
}: ChatInputBarProps) {
  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [memoryCitation, setMemoryCitation] = useState<PendingMemoryCitation | null>(null);
  const [visionPrompt, setVisionPrompt] = useState("");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState(false);
  const [cancelHint, setCancelHint] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pressOriginY = useRef(0);
  const voice = useVoiceRecorder();

  function adjustTextareaHeight() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  useEffect(() => {
    adjustTextareaHeight();
  }, [input]);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        const mimeType = file.type || guessMimeFromName(file.name) || "application/octet-stream";
        const res = await apiFetch<{ attachment: PendingAttachment }>(`/chats/${chatId}/attachments`, {
          method: "POST",
          body: JSON.stringify({
            filename: file.name,
            mimeType,
            dataBase64: btoa(binary),
          }),
        });
        const att = res.attachment;
        if (isImageFile(file, mimeType)) {
          att.previewUrl = URL.createObjectURL(file);
        }
        setAttachments((prev) => [...prev, att]);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "附件上传失败");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function removeAttachment(id: string) {
    setAttachments((prev) => {
      const item = prev.find((a) => a.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  }

  function handlePickMemory(item: MemoryPickResult) {
    setMemoryCitation(item);
    setToolsOpen(false);
  }

  function trySubmit() {
    if (disabled || loading || selectMode || uploading) return;
    if (!input.trim() && attachments.length === 0) return;
    const hasImage = attachments.some((a) => a.kind === "image");
    onSend(
      input.trim(),
      attachments,
      memoryCitation,
      hasImage ? visionPrompt.trim() || null : null
    );
    setInput("");
    requestAnimationFrame(adjustTextareaHeight);
    setMemoryCitation(null);
    setVisionPrompt("");
    attachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl);
    });
    setAttachments([]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    trySubmit();
  }

  async function finishVoice(send: boolean) {
    voice.disarmPress();
    if (!send) {
      await voice.cancel();
      setCancelHint(false);
      return;
    }
    // 授权弹窗竞态：录音刚开始就「松开」→ 当误触，不发送
    if (voice.state !== "recording" || !voice.heldLongEnough(400)) {
      await voice.cancel();
      setCancelHint(false);
      return;
    }
    const result = await voice.stop();
    setCancelHint(false);
    if (!result) {
      if (voice.error) alert(voice.error);
      return;
    }
    setUploading(true);
    try {
      // 转成 WAV：火山极速 ASR 只稳吃 wav/mp3/ogg，手机 mp4/webm 常转码失败
      let uploadBlob = result.blob;
      let mimeType = "audio/wav";
      let ext = "wav";
      try {
        uploadBlob = await blobToWavBlob(result.blob);
      } catch {
        mimeType = result.mimeType || result.blob.type || "audio/webm";
        ext = /mp4|aac|m4a/i.test(mimeType)
          ? "m4a"
          : /ogg/i.test(mimeType)
            ? "ogg"
            : "webm";
      }
      const dataBase64 = await blobToBase64(uploadBlob);
      const res = await apiFetch<{ attachment: PendingAttachment }>(`/chats/${chatId}/attachments`, {
        method: "POST",
        body: JSON.stringify({
          filename: `voice-${Date.now()}.${ext}`,
          mimeType,
          dataBase64,
          durationSec: result.durationSec,
        }),
      });
      // 有浏览器即时转写就带上；没有则靠服务端 ASR（WAV）
      const text = result.transcript
        ? `[语音] ${result.transcript}`
        : `[语音 ${result.durationSec}″]`;
      onSend(text, [res.attachment], null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "语音发送失败");
    } finally {
      setUploading(false);
    }
  }

  function onVoicePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || loading || selectMode || uploading) return;
    e.preventDefault();
    pressOriginY.current = e.clientY;
    setCancelHint(false);
    voice.armPress();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    void voice.start();
  }

  function onVoicePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    if (voice.state !== "recording") return;
    const dy = pressOriginY.current - e.clientY;
    setCancelHint(dy > 56);
  }

  function onVoicePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    // starting：还在等授权弹窗，松手只取消，绝不发送
    if (voice.state === "idle" || voice.state === "starting") {
      void finishVoice(false);
      return;
    }
    if (voice.state !== "recording" && voice.state !== "stopping") return;
    const dy = pressOriginY.current - e.clientY;
    void finishVoice(dy <= 56);
  }

  function onVoicePointerCancel() {
    void finishVoice(false);
  }

  async function enterVoiceMode() {
    setVoiceMode(true);
    // 用「点麦克风」这次点击手势预授权，避免第一次按住说话时弹窗导致误发
    const result = await prefetchMicrophonePermission();
    if (!result.ok && result.error) {
      // 不阻断进入语音模式；按住时还会再试并显示错误
      console.warn("[voice] 预授权麦克风:", result.error);
    }
  }

  const sending = loading || uploading;
  const busy = disabled || loading || selectMode;

  return (
    <div className="chat-input-wrap">
      {attachments.length > 0 && (
        <div className="attachment-chips">
          {attachments.map((a) => (
            <span key={a.id} className="attachment-chip">
              {a.kind === "image" && a.previewUrl ? (
                <img src={a.previewUrl} alt="" className="attachment-thumb" />
              ) : null}
              <span>{a.name}</span>
              <button type="button" onClick={() => removeAttachment(a.id)} aria-label="移除">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      {attachments.some((a) => a.kind === "image") && (
        <div className="vision-prompt-field">
          <label className="vision-prompt-label" htmlFor="vision-prompt-input">
            看图提示（可选）
          </label>
          <textarea
            id="vision-prompt-input"
            className="vision-prompt-input"
            rows={2}
            placeholder="不填则全面描述；例如：看看图里的文字 / 小狗是什么颜色"
            value={visionPrompt}
            disabled={disabled || loading}
            onChange={(e) => setVisionPrompt(e.target.value)}
          />
        </div>
      )}
      {memoryCitation && (
        <div className="attachment-chips">
          <span className="attachment-chip memory-cite-chip">
            <span title={memoryCitation.text}>引用：{truncate(memoryCitation.text)}</span>
            <button type="button" onClick={() => setMemoryCitation(null)} aria-label="取消引用">
              ×
            </button>
          </span>
        </div>
      )}

      {toolsOpen && (
        <div className="chat-input-tools-expanded">
          <ToolIconButton
            icon={<PaperClipOutlined />}
            label="附件"
            disabled={disabled || uploading}
            onClick={() => fileRef.current?.click()}
          />
          <ToolIconButton
            icon={<PushpinOutlined />}
            label="引用"
            disabled={disabled || selectMode}
            onClick={() => setPickerOpen(true)}
          />
          {onStartEventSummary && (
            <ToolIconButton
              icon={<FileTextOutlined />}
              label="总结"
              disabled={disabled || selectMode}
              onClick={() => {
                onStartEventSummary();
                setToolsOpen(false);
              }}
            />
          )}
          {onStartCoread && (
            <ToolIconButton
              icon={<BookOutlined />}
              label="记入共读"
              disabled={disabled || selectMode}
              onClick={() => {
                onStartCoread();
                setToolsOpen(false);
              }}
            />
          )}
          {onStartObsidianSettle && (
            <ToolIconButton
              icon={<BulbOutlined />}
              label="沉淀"
              disabled={disabled || selectMode}
              onClick={() => {
                onStartObsidianSettle();
                setToolsOpen(false);
              }}
            />
          )}
        </div>
      )}

      <form className="chat-input-bar" onSubmit={handleSubmit}>
        <input
          ref={fileRef}
          type="file"
          multiple
          accept="image/*,audio/*,.txt,.md,.pdf,.doc,.docx"
          style={{ display: "none" }}
          onChange={handleFiles}
        />
        <button
          type="button"
          className={`btn btn-ghost chat-tools-toggle${toolsOpen ? " open" : ""}`}
          aria-label={toolsOpen ? "收起工具栏" : "展开工具栏"}
          aria-expanded={toolsOpen}
          onClick={() => setToolsOpen((v) => !v)}
        >
          {toolsOpen ? <CloseOutlined /> : <PlusOutlined />}
        </button>

        <div className={`chat-composer-field${voiceMode ? " is-voice" : ""}`}>
          {voiceMode ? (
            <button
              type="button"
              className={`chat-voice-hold${voice.state === "recording" ? " is-recording" : ""}${
                cancelHint ? " is-cancel" : ""
              }`}
              disabled={busy || uploading}
              onPointerDown={onVoicePointerDown}
              onPointerMove={onVoicePointerMove}
              onPointerUp={onVoicePointerUp}
              onPointerCancel={onVoicePointerCancel}
            >
              {voice.state === "starting"
                ? "正在打开麦克风…"
                : voice.state === "recording"
                  ? cancelHint
                    ? "松开取消"
                    : `录音中 ${voice.seconds}″ · 上滑取消`
                  : voice.error
                    ? voice.error
                    : "按住 说话"}
            </button>
          ) : (
            <textarea
              ref={textareaRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={selectMode ? (selectModeHint || "请先完成选择或点取消") : "输入消息…"}
              disabled={disabled || loading}
              enterKeyHint="send"
              autoComplete="off"
              autoCorrect="off"
              onFocus={() => {
                window.dispatchEvent(new CustomEvent("rp-composer-focus"));
              }}
              onBlur={() => {
                window.requestAnimationFrame(() => window.scrollTo(0, 0));
              }}
            />
          )}

          <button
            type="button"
            className="btn btn-ghost chat-voice-mode-btn"
            disabled={busy}
            aria-label={voiceMode ? "切换到键盘" : "切换到语音"}
            title={voiceMode ? "键盘" : "语音"}
            onClick={() => {
              void voice.cancel();
              setCancelHint(false);
              if (voiceMode) {
                setVoiceMode(false);
              } else {
                void enterVoiceMode();
              }
            }}
          >
            {voiceMode ? <EditOutlined /> : <AudioOutlined />}
          </button>
        </div>

        {!voiceMode && (
          <button
            type="submit"
            className={`btn btn-ghost chat-send-btn${sending ? " is-sending" : ""}`}
            disabled={
              disabled ||
              loading ||
              uploading ||
              selectMode ||
              (!input.trim() && attachments.length === 0)
            }
            aria-label={uploading ? "上传中" : sending ? "发送中" : "发送"}
          >
            <SendOutlined className="chat-send-icon" />
          </button>
        )}
      </form>

      <MemoryPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={handlePickMemory}
      />
    </div>
  );
}
