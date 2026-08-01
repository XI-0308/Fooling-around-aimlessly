"use client";

import { useCallback, useRef, useState } from "react";

export type VoiceRecorderState = "idle" | "starting" | "recording" | "stopping";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((ev: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
};

function isMobileUa(): boolean {
  if (typeof navigator === "undefined") return false;
  return /Android|iPhone|iPad|iPod|Mobile|EdgA|EdgiOS/i.test(navigator.userAgent);
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  // 手机上 SpeechRecognition 容易反复弹权限；改走服务端 WAV ASR
  if (isMobileUa()) return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/ogg;codecs=opus",
    "audio/mp4",
    "audio/mp4;codecs=mp4a.40.2",
    "audio/aac",
  ];
  for (const c of candidates) {
    if (MediaRecorder.isTypeSupported(c)) return c;
  }
  return "";
}

function isSecurePage(): boolean {
  return (
    typeof window !== "undefined" &&
    (window.isSecureContext ||
      location.hostname === "localhost" ||
      location.hostname === "127.0.0.1")
  );
}

/** 在点击手势里预授权麦克风，避免按住说话时弹窗打断手势 */
export async function prefetchMicrophonePermission(): Promise<{ ok: boolean; error?: string }> {
  if (!isSecurePage() || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      error: "当前页面不是 HTTPS，浏览器禁止使用麦克风。请用 https://itbelongstoxi.com 打开",
    };
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    stream.getTracks().forEach((t) => t.stop());
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "无法打开麦克风",
    };
  }
}

export function useVoiceRecorder() {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const recordingReadyAtRef = useRef(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const transcriptRef = useRef("");
  /** 手指仍按在「按住说话」上 */
  const pressActiveRef = useRef(false);
  /** 每次 start 递增；松手或取消时作废进行中的 start */
  const startGenRef = useRef(0);

  const cleanup = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    recognitionRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRef.current = null;
    chunksRef.current = [];
  }, []);

  const armPress = useCallback(() => {
    pressActiveRef.current = true;
  }, []);

  const disarmPress = useCallback(() => {
    pressActiveRef.current = false;
    startGenRef.current += 1;
  }, []);

  const start = useCallback(async () => {
    setError("");
    transcriptRef.current = "";
    recordingReadyAtRef.current = 0;

    if (!isSecurePage() || typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError(
        "当前页面不是 HTTPS，浏览器禁止使用麦克风。请用 https://itbelongstoxi.com 打开，不要用 http://100.x.x.x"
      );
      return false;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("当前浏览器不支持 MediaRecorder，可换手机 Edge / Chrome 再试");
      return false;
    }
    if (!pressActiveRef.current) return false;

    const gen = ++startGenRef.current;
    setState("starting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // 授权弹窗期间用户已松手 → 丢弃，绝不进入录音/发送
      if (!pressActiveRef.current || gen !== startGenRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        setState("idle");
        return false;
      }

      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      mediaRef.current = recorder;
      startedAtRef.current = Date.now();
      recordingReadyAtRef.current = Date.now();
      setSeconds(0);
      timerRef.current = window.setInterval(() => {
        setSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 200);

      const Recog = getSpeechRecognitionCtor();
      if (Recog) {
        try {
          const recog = new Recog();
          recog.lang = "zh-CN";
          recog.continuous = true;
          recog.interimResults = true;
          recog.onresult = (ev) => {
            const parts: string[] = [];
            for (let i = 0; i < ev.results.length; i++) {
              const alt = ev.results[i]?.[0]?.transcript;
              if (alt) parts.push(alt);
            }
            transcriptRef.current = parts.join("").trim();
          };
          recog.onerror = () => {
            /* 浏览器识别失败时仍可走服务端 ASR */
          };
          recognitionRef.current = recog;
          recog.start();
        } catch {
          recognitionRef.current = null;
        }
      }

      // 再次确认：授权点「允许」时浏览器可能补发 pointerup，此时若已松手则立刻停
      if (!pressActiveRef.current || gen !== startGenRef.current) {
        try {
          recorder.stop();
        } catch {
          /* ignore */
        }
        cleanup();
        setState("idle");
        return false;
      }

      recorder.start(200);
      setState("recording");
      return true;
    } catch (err) {
      cleanup();
      setState("idle");
      setError(err instanceof Error ? err.message : "无法打开麦克风");
      return false;
    }
  }, [cleanup]);

  const stop = useCallback(async (): Promise<{
    blob: Blob;
    durationSec: number;
    transcript: string;
    mimeType: string;
  } | null> => {
    const recorder = mediaRef.current;
    if (!recorder || recorder.state === "inactive") {
      cleanup();
      setState("idle");
      return null;
    }
    setState("stopping");
    const durationSec = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    const blob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const parts = chunksRef.current;
        resolve(parts.length ? new Blob(parts, { type }) : null);
      };
      try {
        recorder.stop();
      } catch {
        resolve(null);
      }
    });
    const transcript = transcriptRef.current.trim();
    const mimeType = blob?.type || recorder.mimeType || "audio/webm";
    cleanup();
    setState("idle");
    if (!blob || blob.size < 64 || durationSec < 1) return null;
    return { blob, durationSec, transcript, mimeType };
  }, [cleanup]);

  const cancel = useCallback(async () => {
    startGenRef.current += 1;
    pressActiveRef.current = false;
    const recorder = mediaRef.current;
    if (recorder && recorder.state !== "inactive") {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    cleanup();
    setState("idle");
    setSeconds(0);
    transcriptRef.current = "";
    recordingReadyAtRef.current = 0;
  }, [cleanup]);

  /** 真正开始录音后不足该毫秒数则视为误触（含授权弹窗竞态），不发送 */
  const heldLongEnough = useCallback((minMs = 400) => {
    if (!recordingReadyAtRef.current) return false;
    return Date.now() - recordingReadyAtRef.current >= minMs;
  }, []);

  return {
    state,
    seconds,
    error,
    start,
    stop,
    cancel,
    armPress,
    disarmPress,
    heldLongEnough,
    isPressActive: () => pressActiveRef.current,
  };
}
