import type { NetEaseMusicConn } from "../config.js";
import { normalizeNetEaseCookie } from "./cookieUtil.js";
import { isCookieCloudReady, resolveCookieFromCloudOrManual } from "../cookieCloud/shared.js";
export interface NetEaseSongResult {
  songId: number;
  name: string;
  artists: string;
  album?: string;
  coverUrl: string;
  webUrl: string;
  appUrl: string;
}

const NETEASE_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Referer: "https://music.163.com",
};

interface NetEaseArtist {
  name?: string;
}

interface NetEaseAlbum {
  name?: string;
  picUrl?: string;
}

export { normalizeNetEaseCookie } from "./cookieUtil.js";

interface NetEaseSongRaw {
  id?: number;
  name?: string;
  /** 旧字段 */
  artists?: NetEaseArtist[];
  /** 现行搜索/歌单常用字段 */
  ar?: NetEaseArtist[];
  album?: NetEaseAlbum;
  al?: NetEaseAlbum;
}

function songArtists(raw: NetEaseSongRaw): NetEaseArtist[] {
  return raw.ar?.length ? raw.ar : raw.artists || [];
}

function songAlbum(raw: NetEaseSongRaw): NetEaseAlbum | undefined {
  return raw.al || raw.album;
}

function buildHeaders(cookie?: string): Record<string, string> {
  const headers = { ...NETEASE_HEADERS };
  const normalized = normalizeNetEaseCookie(cookie || "");
  if (normalized) {
    headers.Cookie = normalized;
  }
  return headers;
}

export async function resolveNetEaseCookie(conn?: NetEaseMusicConn): Promise<string> {
  if (!conn) return "";
  if (isCookieCloudReady(conn.cookieCloud)) {
    return normalizeNetEaseCookie(
      await resolveCookieFromCloudOrManual(
        conn.cookie,
        conn.cookieCloud,
        ["music.163.com", "163.com"],
        "网易云音乐"
      )
    );
  }
  if (conn.cookie?.trim()) return normalizeNetEaseCookie(conn.cookie);
  return "";
}

async function buildHeadersAsync(conn?: NetEaseMusicConn): Promise<Record<string, string>> {
  const cookie = await resolveNetEaseCookie(conn);
  return buildHeaders(cookie);
}

export function parsePlaylistIdFromInput(input: string): string {
  const t = input.trim();
  if (/^\d+$/.test(t)) return t;
  const m = t.match(/[?&]id=(\d+)/) || t.match(/playlist\/(\d+)/);
  return m?.[1] || "";
}

async function resolvePlaylistId(conn?: NetEaseMusicConn): Promise<string | null> {
  if (!conn) return null;
  if (conn.playlistId?.trim()) return conn.playlistId.trim();
  const fromUrl = parsePlaylistIdFromInput(conn.playlistUrl || "");
  if (fromUrl) return fromUrl;
  const url = conn.playlistUrl?.trim();
  if (url?.startsWith("http")) {
    try {
      const res = await fetch(url, { redirect: "follow" });
      const id = parsePlaylistIdFromInput(res.url || url);
      if (id) return id;
    } catch {
      /* 短链解析失败则回退全局搜索 */
    }
  }
  return null;
}

async function fetchPlaylistSongs(
  playlistId: string,
  conn?: NetEaseMusicConn
): Promise<NetEaseSongRaw[]> {
  const headers = await buildHeadersAsync(conn);
  const res = await fetch(
    `https://music.163.com/api/v6/playlist/detail?id=${encodeURIComponent(playlistId)}&n=5000`,
    { headers }
  );
  if (!res.ok) throw new Error(`歌单详情请求失败 HTTP ${res.status}`);
  const json = (await res.json()) as {
    code?: number;
    playlist?: { tracks?: NetEaseSongRaw[] };
  };
  if (json.code !== 200 && json.code !== undefined) {
    throw new Error(`歌单 API 返回 code=${json.code}，请检查 Cookie / 歌单 ID`);
  }
  const tracks = json.playlist?.tracks || [];
  const cookie = await resolveNetEaseCookie(conn);
  if (tracks.length === 0 && !cookie) {
    throw new Error(
      "无法读取歌单：未配置 Cookie。请在「设置 → CookieCloud」同步 music.163.com 后保存，或填写手动 Cookie。"
    );
  }
  return tracks;
}
function normalizeCoverUrl(url?: string): string {
  if (!url) return "";
  const base = url.replace(/(\?.*)?$/, "");
  return `${base}?param=200y200`;
}

function parseKeyword(keyword: string): { songHint: string; artistHint: string | null } {
  const q = keyword.trim();
  const book = q.match(/[《「『]([^》」』]+)[》」』]/);
  if (book?.[1]) {
    const inner = book[1].trim();
    const rest = q.replace(book[0], " ").trim();
    const artist = rest.replace(/^(的|by)\s*/i, "").trim();
    return { songHint: inner, artistHint: artist || null };
  }
  const parts = q.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return { songHint: parts[0], artistHint: parts.slice(1).join(" ") };
  }
  return { songHint: q, artistHint: null };
}

function isSuspiciousSong(name: string, artists: string): boolean {
  if (/DJ|翻唱|cover|原唱|钢琴|女声|男生|R&B|伤感|正式版|版\)|版）/i.test(name)) return true;
  if (/周杰伦[-.、]|周杰伦、/.test(artists)) return true;
  return false;
}

function scoreSong(raw: NetEaseSongRaw, keyword: string): number {
  const name = raw.name?.trim() || "";
  const artistNames = songArtists(raw).map((a) => a.name?.trim() || "").filter(Boolean);
  const artists = artistNames.join(" / ");
  const { songHint, artistHint } = parseKeyword(keyword);
  let score = 0;

  if (!name) return -999;

  if (name === songHint || name.includes(songHint)) score += 30;
  if (songHint && name.replace(/\s/g, "") === songHint.replace(/\s/g, "")) score += 20;

  if (artistHint) {
    for (const part of artistHint.split(/\s+/)) {
      if (part.length >= 2 && artists.includes(part)) score += 25;
    }
    if (artistNames.some((a) => a === artistHint)) score += 40;
  }

  if (artistNames.length === 1 && artistNames[0] === "周杰伦") score += 35;

  if (isSuspiciousSong(name, artists)) score -= 80;
  if (/\(.*\)|（.*）/.test(name)) score -= 15;

  return score;
}

function toSongResult(raw: NetEaseSongRaw): NetEaseSongResult | null {
  const songId = raw.id;
  const name = raw.name?.trim();
  if (!songId || !name) return null;
  const artists =
    songArtists(raw)
      .map((a) => a.name?.trim())
      .filter(Boolean)
      .join(" / ") || "未知歌手";
  const album = songAlbum(raw)?.name?.trim();
  const coverUrl = normalizeCoverUrl(songAlbum(raw)?.picUrl);
  return {
    songId,
    name,
    artists,
    album,
    coverUrl,
    webUrl: `https://music.163.com/song?id=${songId}`,
    appUrl: `orpheus://song/${songId}`,
  };
}

/** 搜索歌曲：已配置歌单时只从歌单选曲，未配置歌单时才全库搜索 */
export async function searchNetEaseSong(
  keyword: string,
  conn?: NetEaseMusicConn
): Promise<NetEaseSongResult | null> {
  const q = keyword.trim();
  const playlistId = await resolvePlaylistId(conn);

  if (playlistId) {
    const songs = await fetchPlaylistSongs(playlistId, conn);
    if (songs.length === 0) {
      throw new Error("指定歌单为空或无法读取，请检查歌单链接与 Cookie");
    }
    if (!q) {
      const pick = songs[Math.floor(Math.random() * songs.length)];
      return toSongResult(pick);
    }
    const ranked = songs
      .map((raw) => ({ raw, score: scoreSong(raw, q) }))
      .sort((a, b) => b.score - a.score);
    const best = ranked[0];
    if (!best || best.score < 10) {
      throw new Error(`你的歌单里没有找到与「${q}」足够匹配的歌，请换一首歌名或把歌加入歌单。`);
    }
    const song = toSongResult(best.raw);
    if (!song) return null;
    return song;
  }

  if (!q) return null;

  const url = `https://music.163.com/api/search/get/web?s=${encodeURIComponent(q)}&type=1&limit=30&offset=0`;
  const headers = await buildHeadersAsync(conn);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`网易云搜索失败 HTTP ${res.status}`);
  }

  const json = (await res.json()) as {
    code?: number;
    result?: { songs?: NetEaseSongRaw[] };
  };

  if (json.code !== 200 && json.code !== undefined) {
    throw new Error(`网易云 API 返回 code=${json.code}`);
  }

  const songs = json.result?.songs || [];
  if (songs.length === 0) return null;

  const ranked = songs
    .map((raw) => ({ raw, score: scoreSong(raw, q) }))
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) return null;

  const song = toSongResult(best.raw);
  if (!song) return null;

  const cookie = await resolveNetEaseCookie(conn);
  if (!cookie && isSuspiciousSong(song.name, song.artists)) {
    throw new Error(
      "未登录状态下搜歌结果可能不准。请在「设置 → 点歌 · 网易云音乐」填写 Cookie 或 CookieCloud 后保存，再试一次。"
    );
  }

  if (cookie && isSuspiciousSong(song.name, song.artists)) {
    throw new Error(
      `搜歌结果异常「${song.name} · ${song.artists}」，请检查 Cookie 是否过期，或在设置页点「测试网易云连接」。`
    );
  }

  return song;
}
export async function testNetEaseMusicConn(conn?: NetEaseMusicConn): Promise<string> {
  const playlistId = await resolvePlaylistId(conn);
  if (playlistId) {
    const songs = await fetchPlaylistSongs(playlistId, conn);
    if (songs.length === 0) {
      throw new Error("歌单为空或无法读取，请检查歌单链接与 Cookie");
    }
    const sample = toSongResult(songs[0]);
    if (!sample) throw new Error("歌单曲目解析失败");
    return `歌单连接成功：共 ${songs.length} 首，示例 ${sample.name} · ${sample.artists}`;
  }

  const song = await searchNetEaseSong("晴天 周杰伦", conn);
  if (!song) {
    throw new Error("搜索无结果，请检查网络或 Cookie");
  }
  if (isSuspiciousSong(song.name, song.artists)) {
    throw new Error(
      `搜到可疑结果「${song.name} · ${song.artists}」。请填写网易云 Cookie 以获得准确匹配。`
    );
  }
  return `搜歌成功：${song.name} · ${song.artists}（ID ${song.songId}）`;
}
