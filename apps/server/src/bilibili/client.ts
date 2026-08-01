import type { BilibiliConn } from "../config.js";
import { resolveCookieFromCloudOrManual } from "../cookieCloud/shared.js";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
const REFERER = "https://www.bilibili.com";
const MAX_SUBTITLE_CHARS = 14000;

interface VideoView {
  bvid: string;
  aid: number;
  title: string;
  desc: string;
  ownerName: string;
  cid: number;
  duration: number;
}

interface SubtitleTrack {
  lan: string;
  lan_doc: string;
  subtitle_url: string;
}

export async function resolveBilibiliCookie(conn: BilibiliConn): Promise<string> {
  return resolveCookieFromCloudOrManual(
    conn.cookie,
    conn.cookieCloud,
    ["bilibili.com", "bilibili"],
    "Bilibili"
  );
}

async function bilibiliFetch(url: string, cookie?: string): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": UA,
    Referer: REFERER,
    Accept: "application/json, text/plain, */*",
  };
  if (cookie?.trim()) headers.Cookie = cookie.trim();
  return fetch(url, { headers });
}

export async function resolveShortBilibiliUrl(url: string): Promise<string> {
  if (!/b23\.tv/i.test(url)) return url;
  const res = await fetch(url, {
    redirect: "follow",
    headers: { "User-Agent": UA },
  });
  return res.url || url;
}

export function extractBvidFromUrl(url: string): string | null {
  const match = url.match(/BV[a-zA-Z0-9]+/i);
  return match ? match[0] : null;
}

async function getVideoView(bvid: string, cookie?: string): Promise<VideoView> {
  const res = await bilibiliFetch(
    `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(bvid)}`,
    cookie
  );
  const json = (await res.json()) as {
    code?: number;
    message?: string;
    data?: {
      bvid?: string;
      aid?: number;
      title?: string;
      desc?: string;
      cid?: number;
      duration?: number;
      owner?: { name?: string };
      pages?: { cid?: number }[];
    };
  };
  if (json.code !== 0 || !json.data) {
    throw new Error(json.message || "获取 B 站视频信息失败");
  }
  const d = json.data;
  const cid = d.cid ?? d.pages?.[0]?.cid;
  if (!cid || !d.aid) throw new Error("未能解析视频 cid");
  return {
    bvid: d.bvid || bvid,
    aid: d.aid,
    title: d.title || "（无标题）",
    desc: d.desc || "",
    ownerName: d.owner?.name || "未知 UP 主",
    cid,
    duration: d.duration || 0,
  };
}

async function getSubtitleTracks(
  aid: number,
  cid: number,
  bvid: string,
  cookie?: string
): Promise<SubtitleTrack[]> {
  const res = await bilibiliFetch(
    `https://api.bilibili.com/x/player/v2?aid=${aid}&cid=${cid}&bvid=${encodeURIComponent(bvid)}`,
    cookie
  );
  const json = (await res.json()) as {
    code?: number;
    data?: { subtitle?: { subtitles?: SubtitleTrack[] } };
  };
  if (json.code !== 0) return [];
  return json.data?.subtitle?.subtitles || [];
}

const SUB_LANG_PRIORITY = ["zh-CN", "ai-zh", "zh-Hans", "zh", "zh-Hant", "en-US", "en"];

function pickSubtitleTrack(tracks: SubtitleTrack[]): SubtitleTrack | null {
  if (tracks.length === 0) return null;
  for (const lang of SUB_LANG_PRIORITY) {
    const found = tracks.find((t) => t.lan === lang);
    if (found) return found;
  }
  const zhTrack = tracks.find((t) => /中文|简体|繁体/i.test(t.lan_doc || ""));
  return zhTrack || tracks[0];
}

async function fetchSubtitleText(subtitleUrl: string): Promise<string> {
  let fullUrl = subtitleUrl.trim();
  if (fullUrl.startsWith("//")) fullUrl = `https:${fullUrl}`;
  const res = await fetch(fullUrl, { headers: { "User-Agent": UA, Referer: REFERER } });
  if (!res.ok) throw new Error(`字幕下载失败 HTTP ${res.status}`);
  const json = (await res.json()) as { body?: { content?: string }[] };
  const lines = (json.body || [])
    .map((item) => item.content?.trim())
    .filter(Boolean);
  return lines.join("\n");
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m} 分 ${s} 秒`;
}

export async function fetchBilibiliContext(videoUrl: string, cookie?: string): Promise<string> {
  const resolved = await resolveShortBilibiliUrl(videoUrl);
  const bvid = extractBvidFromUrl(resolved);
  if (!bvid) throw new Error("未能识别 B 站视频 BV 号");

  const view = await getVideoView(bvid, cookie);
  const tracks = await getSubtitleTracks(view.aid, view.cid, view.bvid, cookie);
  const lines = [
    `链接：${videoUrl}`,
    `标题：${view.title}`,
    `UP主：${view.ownerName}`,
    `时长：${formatDuration(view.duration)}`,
  ];
  if (view.desc.trim()) {
    const desc = view.desc.trim();
    lines.push(`简介：${desc.length > 600 ? `${desc.slice(0, 600)}…` : desc}`);
  }

  const track = pickSubtitleTrack(tracks);
  if (track?.subtitle_url) {
    const text = await fetchSubtitleText(track.subtitle_url);
    if (text.trim()) {
      const clipped =
        text.length > MAX_SUBTITLE_CHARS
          ? `${text.slice(0, MAX_SUBTITLE_CHARS)}\n…（字幕已截断）`
          : text;
      lines.push(`\n【字幕 · ${track.lan_doc || track.lan}】\n${clipped}`);
      return lines.join("\n");
    }
  }

  if (!cookie?.trim()) {
    lines.push(
      "\n（未找到字幕。若视频有 CC/AI 字幕，请在设置 → Bilibili 配置 Cookie 或 CookieCloud（域名 bilibili.com）后重试）"
    );
  } else {
    lines.push("\n（该视频暂无可用字幕，已提供标题与简介供参考）");
  }
  return lines.join("\n");
}

export async function testBilibiliConn(conn: BilibiliConn): Promise<string> {
  let cookie = "";
  try {
    cookie = await resolveBilibiliCookie(conn);
  } catch {
    cookie = conn.cookie?.trim() || "";
  }
  const view = await getVideoView("BV1GJ411x7h7", cookie || undefined);
  const tracks = await getSubtitleTracks(view.aid, view.cid, view.bvid, cookie || undefined);
  const subHint = tracks.length > 0 ? `检测到 ${tracks.length} 条字幕轨` : "当前测试视频无字幕轨";
  const cookieHint = cookie ? "已配置 Cookie" : "未配置 Cookie（视频信息可用，字幕可能受限）";
  return `B 站连接正常：《${view.title}》· ${subHint} · ${cookieHint}`;
}
