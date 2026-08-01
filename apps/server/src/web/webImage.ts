import {
  appendAssistantMessage,
  saveChatAttachment,
  type ChatMessage,
} from "../store/chats.js";
import { formatWebImageShareNote } from "../tools/enrichMarkers.js";

const FETCH_TIMEOUT_MS = 20000;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MIN_IMAGE_BYTES = 8 * 1024;

const FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "*/*",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
};

const IMAGE_EXT_RE = /\.(avif|bmp|gif|jpe?g|png|webp)(\?|#|$)/i;
const SHARE_IMAGE_MARKER_RE = /\[\[SHARE_IMAGE:\s*([\s\S]*?)\]\]/gi;

export function stripShareImageMarker(text: string): {
  cleanText: string;
  source: string | null;
} {
  let source: string | null = null;
  const cleanText = text
    .replace(SHARE_IMAGE_MARKER_RE, (_, raw: string) => {
      const t = String(raw).trim();
      if (t && !source) source = t;
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { cleanText, source };
}

/** 用户明确要「找/发网上的图」（不是让角色画画，也不是自己发图让角色看） */
export function hasWebImageIntent(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  if (/画给我|画出来|绘制|生成.{0,6}图|seedream|dall/i.test(t) && !/找|搜|网上|图片链接/.test(t)) {
    return false;
  }
  // 看自己发的图 / 描述照片 ≠ 网页找图
  if (
    /看看这|看下这|这张图|这张照片|我发的|发给你|帮我看(?:看|下)|这是什么|图里|照片里|附件/.test(t) &&
    !/网上|搜图|找图|找一张|搜一张|图片链接/.test(t)
  ) {
    return false;
  }
  return /找.{0,8}图|搜.{0,6}图|找一张|搜一张|网上.{0,6}图|网页.{0,6}图|图链|图片链接|找图给我|搜图给我|发网上的图/i.test(
    t
  );
}

export function assistantClaimedWebImage(text: string): boolean {
  return /找(?:到|来|了)?.{0,8}图|发(?:来|你)?.{0,6}图|给你(?:找|下|搜).{0,8}图|图片(?:如下|在这)|share.?image/i.test(
    text
  );
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function absolutizeUrl(base: string, maybeRelative: string): string | null {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

/** 从 HTML 抽出候选图链（优先 og:image） */
export function extractImageUrlsFromHtml(html: string, pageUrl: string): string[] {
  const out: string[] = [];
  const push = (raw: string | undefined) => {
    if (!raw) return;
    const abs = absolutizeUrl(pageUrl, decodeHtmlEntities(raw.trim()));
    if (!abs || !/^https?:\/\//i.test(abs)) return;
    if (out.includes(abs)) return;
    out.push(abs);
  };

  const og =
    html.match(
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i
    ) ||
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i
    );
  push(og?.[1]);

  const tw =
    html.match(
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i
    ) ||
    html.match(
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
    );
  push(tw?.[1]);

  const imgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = imgRe.exec(html)) && out.length < 12) {
    const src = m[1];
    if (/sprite|icon|logo|avatar|emoji|1x1|pixel/i.test(src)) continue;
    push(src);
  }
  return out;
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...init,
      headers: { ...FETCH_HEADERS, ...(init?.headers || {}) },
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
  }
}

async function downloadImageBuffer(
  url: string
): Promise<{ buffer: Buffer; mimeType: string; filename: string }> {
  const res = await fetchWithTimeout(url, {
    headers: { ...FETCH_HEADERS, Accept: "image/*,*/*;q=0.8", Referer: url },
  });
  if (!res.ok) throw new Error(`下载图片失败 HTTP ${res.status}`);
  const ct = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (ct && !ct.startsWith("image/") && !IMAGE_EXT_RE.test(url)) {
    throw new Error(`不是图片：${ct || "unknown"}`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length < MIN_IMAGE_BYTES) {
    throw new Error("图片过小，可能是图标或占位图");
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error("图片过大");
  }
  let mimeType = ct.startsWith("image/") ? ct : "image/jpeg";
  if (!ct.startsWith("image/")) {
    const ext = url.match(IMAGE_EXT_RE)?.[1]?.toLowerCase();
    if (ext === "png") mimeType = "image/png";
    else if (ext === "webp") mimeType = "image/webp";
    else if (ext === "gif") mimeType = "image/gif";
  }
  const ext = mimeType.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  return { buffer, mimeType, filename: `web-image.${ext}` };
}

async function resolveFromPageUrl(pageUrl: string): Promise<string> {
  const res = await fetchWithTimeout(pageUrl, {
    headers: {
      ...FETCH_HEADERS,
      Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`打开网页失败 HTTP ${res.status}`);
  const ct = res.headers.get("content-type") || "";
  if (ct.startsWith("image/")) return pageUrl;
  const html = await res.text();
  const candidates = extractImageUrlsFromHtml(html, res.url || pageUrl);
  if (candidates.length === 0) {
    throw new Error("网页上没有找到可用图片");
  }
  return candidates[0];
}

/** 维基百科摘要缩略图（中文主题找图兜底） */
async function resolveFromWikipedia(topic: string): Promise<string | null> {
  const title = topic.trim().replace(/\s+/g, " ").slice(0, 80);
  if (title.length < 2) return null;
  const tryTitles = [title, title.replace(/的|图片|照片|图/g, "").trim()].filter(
    (t, i, arr) => t.length >= 2 && arr.indexOf(t) === i
  );
  for (const lang of ["zh", "en"] as const) {
    for (const t of tryTitles) {
      try {
        const url = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(t)}`;
        const res = await fetchWithTimeout(url, {
          headers: { ...FETCH_HEADERS, Accept: "application/json" },
        });
        if (!res.ok) continue;
        const data = (await res.json()) as {
          originalimage?: { source?: string };
          thumbnail?: { source?: string };
        };
        const src = data.originalimage?.source || data.thumbnail?.source;
        if (src) return src;
      } catch {
        // 试下一个
      }
    }
  }
  return null;
}

function firstHttpUrl(text: string): string | null {
  const m = text.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/i);
  return m?.[0]?.replace(/[),.;!?，。！？；：]+$/g, "") || null;
}

/**
 * 把 source 解析成可下载的图片 URL：
 * - 直接图片链接 / 网页链接
 * - 纯主题词 → 维基缩略图
 */
export async function resolveWebImageUrl(source: string): Promise<{
  imageUrl: string;
  note: string;
}> {
  const raw = source.trim();
  if (!raw) throw new Error("未指定图片来源");

  const url = firstHttpUrl(raw);
  if (url) {
    if (IMAGE_EXT_RE.test(url)) {
      return { imageUrl: url, note: url };
    }
    // 先当网页解析；若本身是图会在 resolveFromPageUrl 里直接返回
    try {
      const imageUrl = await resolveFromPageUrl(url);
      return { imageUrl, note: raw.slice(0, 200) };
    } catch (err) {
      // 有些 CDN 无扩展名，直接当下图试一次
      try {
        await downloadImageBuffer(url);
        return { imageUrl: url, note: url };
      } catch {
        throw err;
      }
    }
  }

  const wiki = await resolveFromWikipedia(raw);
  if (wiki) return { imageUrl: wiki, note: raw.slice(0, 200) };
  throw new Error(`没能根据「${raw.slice(0, 40)}」找到可下载的图片`);
}

export async function runWebImageShareFollowUp(
  chatId: string,
  source: string
): Promise<
  | { ok: true; message: ChatMessage }
  | { ok: false; error: string; message?: ChatMessage }
> {
  try {
    const { imageUrl, note } = await resolveWebImageUrl(source);
    const { buffer, mimeType, filename } = await downloadImageBuffer(imageUrl);
    const attachment = saveChatAttachment(chatId, filename, mimeType, buffer);
    const msg = appendAssistantMessage(
      chatId,
      formatWebImageShareNote(note),
      undefined,
      undefined,
      [attachment]
    );
    return { ok: true, message: msg };
  } catch (err) {
    const errText = err instanceof Error ? err.message : "未知错误";
    return { ok: false, error: errText };
  }
}
