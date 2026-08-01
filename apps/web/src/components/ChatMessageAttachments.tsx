"use client";

import { useState } from "react";
import { API_BASE } from "@/lib/api";
import ChatVoiceBubble from "@/components/ChatVoiceBubble";

interface AttachmentMeta {
  id: string;
  name: string;
  kind: string;
  mimeType?: string;
  durationSec?: number;
}

function isImageAttachment(a: AttachmentMeta): boolean {
  if (a.kind === "image") return true;
  if (a.mimeType?.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(a.name || "");
}

function isAudioAttachment(a: AttachmentMeta): boolean {
  if (a.kind === "audio") return true;
  if (a.mimeType?.startsWith("audio/")) return true;
  return /\.(mp3|wav|m4a|aac|ogg|flac|webm)$/i.test(a.name || "");
}

export function ChatVoiceAttachments({
  chatId,
  attachments,
  side = "assistant",
}: {
  chatId: string;
  attachments: AttachmentMeta[];
  side?: "user" | "assistant";
}) {
  const audios = attachments.filter(isAudioAttachment);
  if (audios.length === 0) return null;
  return (
    <>
      {audios.map((att) => (
        <ChatVoiceBubble
          key={att.id}
          chatId={chatId}
          attachmentId={att.id}
          name={att.name}
          durationSec={att.durationSec}
          side={side}
        />
      ))}
    </>
  );
}

/** 图片 / 其它附件（语音走 ChatVoiceAttachments，装进气泡） */
export default function ChatMessageAttachments({
  chatId,
  attachments,
  side = "assistant",
}: {
  chatId: string;
  attachments: AttachmentMeta[];
  side?: "user" | "assistant";
}) {
  const [preview, setPreview] = useState<string | null>(null);
  const images = attachments.filter(isImageAttachment);
  const others = attachments.filter((a) => !isImageAttachment(a) && !isAudioAttachment(a));

  if (images.length === 0 && others.length === 0) return null;

  return (
    <>
      {images.map((att) => {
        const src = `${API_BASE}/chats/${chatId}/attachments/${att.id}`;
        return (
          <div key={att.id} className="msg-image-block">
            <button type="button" className="msg-image-btn" onClick={() => setPreview(src)}>
              <img src={src} alt={att.name} className="msg-image" loading="lazy" />
            </button>
            <a className="msg-image-save" href={src} download={att.name || "image.png"} target="_blank" rel="noreferrer">
              保存图片
            </a>
          </div>
        );
      })}
      {others.length > 0 && (
        <div className="msg-attachments hint">附件：{others.map((a) => a.name).join("、")}</div>
      )}

      {preview && (
        <div className="image-lightbox" onClick={() => setPreview(null)} role="presentation">
          <div className="image-lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <img src={preview} alt="" className="image-lightbox-img" />
            <div className="image-lightbox-actions">
              <a className="btn btn-primary btn-sm" href={preview} download="rp-agent-image.png" target="_blank" rel="noreferrer">
                保存到相册
              </a>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPreview(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function hasAudioInAttachments(attachments?: AttachmentMeta[]): boolean {
  return Boolean(attachments?.some(isAudioAttachment));
}

export function hasNonAudioExtras(attachments?: AttachmentMeta[]): boolean {
  return Boolean(
    attachments?.some((a) => isImageAttachment(a) || (!isImageAttachment(a) && !isAudioAttachment(a)))
  );
}
