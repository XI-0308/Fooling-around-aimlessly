export const API_BASE =
  typeof window !== "undefined"
    ? resolveApiBase()
    : "/api";

function resolveApiBase(): string {
  const direct = process.env.NEXT_PUBLIC_API_URL;
  const host = window.location.hostname;
  // 仅本机 localhost 开发时可直连 3001；Tailscale / 局域网走 Next 代理 /api
  if (direct && (host === "localhost" || host === "127.0.0.1")) {
    return `${direct}/api`;
  }
  return "/api";
}

/** iOS Safari 等环境在 fetch / 读响应体失败时常抛出 "Load failed" */
export function isTransientFetchError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes("无法连接") ||
    m.includes("网络请求失败") ||
    m === "请求失败" ||
    m.includes("fetch") ||
    m.includes("load failed") ||
    m.includes("network") ||
    m.includes("后端")
  );
}

function toFetchError(err: unknown, fallback: string): Error {
  if (err instanceof Error) {
    const m = err.message.toLowerCase();
    if (
      m === "load failed" ||
      m.includes("failed to fetch") ||
      m.includes("networkerror") ||
      m.includes("network error")
    ) {
      return new Error("网络请求失败，请检查连接后刷新");
    }
    return err;
  }
  return new Error(fallback);
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    throw toFetchError(
      err,
      "无法连接服务器。请在项目文件夹打开终端，运行 npm run dev，看到前后端都启动后再刷新本页。"
    );
  }

  let raw: string;
  try {
    raw = await res.text();
  } catch (err) {
    throw toFetchError(err, "网络请求失败，请检查连接后刷新");
  }
  let data: unknown = {};
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      if (!res.ok) {
        const looksHtml = /^\s*<(!DOCTYPE|html|!--)/i.test(raw);
        throw new Error(
          looksHtml
            ? `服务暂时不可用（HTTP ${res.status}），请稍后再试`
            : raw.slice(0, 160) || "请求失败"
        );
      }
      throw new Error("服务器返回了无法解析的响应");
    }
  }
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || "请求失败");
  }
  return data as T;
}

export async function apiDownloadPost(
  path: string,
  body: unknown,
  fallbackFilename = "download.zip"
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("无法连接服务器，请确认已运行 npm run dev");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "下载失败");
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match ? decodeURIComponent(match[1]) : fallbackFilename;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** 下载二进制（如备份 zip） */
export async function apiDownload(path: string, fallbackFilename = "download.zip"): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { credentials: "include" });
  } catch {
    throw new Error("无法连接服务器，请确认已运行 npm run dev");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "下载失败");
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") || "";
  const match = disposition.match(/filename="?([^";]+)"?/i);
  const filename = match ? decodeURIComponent(match[1]) : fallbackFilename;

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export interface StreamEvent {
  type:
    | "token"
    | "reasoning"
    | "done"
    | "error"
    | "context"
    | "user_message"
    | "image_generating"
    | "image_done"
    | "image_error"
    | "music_searching"
    | "music_done"
    | "music_error"
    | "voice_generating"
    | "voice_done"
    | "voice_error"
    | "web_searching"
    | "leann_offer"
    | "ping";
  token?: string;
  content?: string;
  reasoning?: string;
  error?: string;
  contextLog?: Record<string, unknown>;
  message?: unknown;
  offer?: {
    id: string;
    title: string;
    source: "bilibili" | "web" | "zhihu";
    charCount: number;
  };
}

export async function apiStream(
  path: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("无法连接服务器，请确认已运行 npm run dev");
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || "请求失败");
  }

  if (!res.body) throw new Error("无流式响应");

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";

    for (const part of parts) {
      const line = part.trim();
      if (!line.startsWith("data:")) continue;
      try {
        const event = JSON.parse(line.slice(5).trim()) as StreamEvent;
        if (event.type === "ping") continue;
        onEvent(event);
      } catch {
        // ignore
      }
    }
  }
}
