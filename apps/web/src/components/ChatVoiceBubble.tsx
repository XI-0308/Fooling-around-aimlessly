"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/api";

type Props = {
  chatId: string;
  attachmentId: string;
  name?: string;
  durationSec?: number;
  side?: "user" | "assistant";
};

/** 气泡内语音：仅显示「[语音]…」，点击播放 */
export default function ChatVoiceBubble({
  chatId,
  attachmentId,
  name,
  side = "assistant",
}: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const src = `${API_BASE}/chats/${chatId}/attachments/${attachmentId}`;

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
      audioRef.current = null;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, []);

  async function ensureAudio(): Promise<HTMLAudioElement> {
    if (audioRef.current) return audioRef.current;

    setLoading(true);
    try {
      const res = await fetch(src, { credentials: "include" });
      if (!res.ok) {
        throw new Error(`下载语音失败（${res.status}）`);
      }
      const blob = await res.blob();
      if (blob.size < 32) {
        throw new Error("语音文件为空");
      }
      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;
      const audio = new Audio(objectUrl);
      audio.preload = "auto";
      audio.onended = () => {
        setPlaying(false);
      };
      audio.onerror = () => {
        setPlaying(false);
      };
      audioRef.current = audio;
      await new Promise<void>((resolve, reject) => {
        const onReady = () => {
          cleanup();
          resolve();
        };
        const onFail = () => {
          cleanup();
          reject(new Error("音频格式可能不被当前浏览器支持（可再发一条语音试试）"));
        };
        const cleanup = () => {
          audio.removeEventListener("canplaythrough", onReady);
          audio.removeEventListener("error", onFail);
        };
        audio.addEventListener("canplaythrough", onReady, { once: true });
        audio.addEventListener("error", onFail, { once: true });
        audio.load();
        window.setTimeout(() => {
          cleanup();
          resolve();
        }, 1500);
      });
      return audio;
    } finally {
      setLoading(false);
    }
  }

  async function togglePlay() {
    if (playing && audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
      return;
    }
    try {
      const audio = await ensureAudio();
      await audio.play();
      setPlaying(true);
    } catch (err) {
      setPlaying(false);
      const msg = err instanceof Error ? err.message : "无法播放语音";
      const tip =
        /NotAllowedError|autoplay/i.test(msg)
          ? "请再点一次语音条（需要你手动点一下才能播放）"
          : msg;
      alert(tip);
    }
  }

  return (
    <button
      type="button"
      className={`chat-voice-bubble chat-voice-bubble-${side}${playing ? " is-playing" : ""}${
        loading ? " is-loading" : ""
      }`}
      onClick={() => void togglePlay()}
      aria-label={playing ? "暂停语音" : "播放语音"}
      title={name || "语音消息"}
      disabled={loading}
    >
      [语音]…
    </button>
  );
}
