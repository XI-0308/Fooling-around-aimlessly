import { getChat } from "../store/chats.js";
import {
  LEGACY_PERSONAL_NAME_RE,
  LEGACY_SPEAKER_PREFIX_RE,
} from "../text/legacyNames.js";

/** 模型在回复末尾输出的点歌标记（用户不可见，后备路径） */
export const MUSIC_MARKER_RE = /\[\[MUSIC:\s*([\s\S]*?)\]\]/gi;

export function stripMusicMarker(text: string): { cleanText: string; query: string | null } {
  let query: string | null = null;
  const cleanText = text
    .replace(MUSIC_MARKER_RE, (_, raw: string) => {
      query = String(raw).trim();
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { cleanText, query };
}

function normalizeUserMessage(content: string): string {
  return content.trim().replace(/[～~]+$/g, "").trim();
}

/** 仅用户可见原文，排除 URL 正文注入 */
function userTextForMusicFallback(content: string): string {
  const withoutEnrich = content.split(/\n\n\[用户分享的网页 — 正文摘要\]/)[0] ?? content;
  return normalizeUserMessage(withoutEnrich);
}

const WANTS_MUSIC_RE =
  /想听|想.{0,12}听|听听|播放|网易云|音乐卡片|歌曲卡片|点歌|(?:来|放|点)(?:一首|首|个|歌)|play|listen\s+to/i;

/** 用户或角色的文本是否表达点歌 / 发网易云卡片意图 */
export function hasMusicIntent(content: string): boolean {
  const t = userTextForMusicFallback(content);
  if (!t) return false;
  if (/调用.*工具.*(?:网易云|歌曲|音乐|点歌)|发送.*网易云|发.*音乐卡片|发.*歌曲卡片/.test(t)) {
    return true;
  }
  return WANTS_MUSIC_RE.test(t);
}

function cleanQuery(raw: string): string {
  return raw
    .trim()
    .replace(/^[「『"'"\s《]+|[」』"'"\s》]+$/g, "")
    // legacy compat: 旧聊天记录 speaker 前缀可能含 legacy personal names
    .replace(LEGACY_SPEAKER_PREFIX_RE, "")
    .replace(/^(的|by)\s+/i, "")
    .trim();
}

/** 过滤模型误输出的 [[MUSIC: )]] 等无效搜词 */
export function sanitizeMusicQuery(query: string | null | undefined): string | null {
  if (!query) return null;
  const q = cleanQuery(query);
  if (q.length < 2) return null;
  if (/^[^\u4e00-\u9fffA-Za-z0-9]+$/.test(q)) return null;
  if (/^[的之了在里吧吗呢呀啊嘛呗]+$/u.test(q)) return null;
  return q;
}

/** 是否有明确歌名（用于区分模糊点歌与指定歌名） */
export function isExplicitSongQuery(keyword: string): boolean {
  const q = keyword.trim();
  if (!q || q.length < 2) return false;
  const vague =
    /^(一首|首|音乐|歌曲|网易云|卡片|随便|随机|任意|歌单|来首|放点|放首|好听的|我的歌单|你的歌单|点歌|播放|想听|听听|来一首|放一首)$/i;
  if (vague.test(q)) return false;
  if (/[《「『][^》」』]{1,80}[》」』]/.test(q)) return true;
  if (/[\u4e00-\u9fa5A-Za-z0-9·.]{2,}/.test(q)) return true;
  return false;
}

/** 从单条消息提取搜歌关键词（需已有点歌意图或歌名信息） */
export function extractMusicQueryFromText(content: string): string | null {
  const t = userTextForMusicFallback(content);
  if (!t) return null;

  const skipOnly =
    /^(好|嗯|行|可以|谢谢|继续|暂停|停止|下一首|换一首|别放了)[，。！？!?～~]*$/i.test(t);
  if (skipOnly) return null;

  const artistSong = t.match(/网易云(?:音乐)?里?\s*([\u4e00-\u9fa5A-Za-z]{2,6})的歌/);
  if (artistSong?.[1] && hasMusicIntent(t)) {
    return artistSong[1].trim();
  }

  const strictArtistTitle = t.match(
    /(?:想.{0,12}听|听|放|点|来|播放)[^《]*?([\u4e00-\u9fa5A-Za-z0-9·.]{2,10})的《([^》\n]{1,80})》/
  );
  if (strictArtistTitle) {
    return `${strictArtistTitle[2].trim()} ${strictArtistTitle[1].trim()}`;
  }

  const artistTitle = t.match(/([\u4e00-\u9fa5A-Za-z0-9·.]{2,10})的《([^》\n]{1,80})》/);
  if (artistTitle) {
    const title = artistTitle[2].trim();
    const artist = artistTitle[1].trim();
    if (title.length >= 1) return `${title} ${artist}`;
  }

  const titleInBook = t.match(/《([^》\n]{1,80})》/);
  if (titleInBook) {
    const title = titleInBook[1].trim();
    const beforeTitle = t.slice(0, titleInBook.index ?? 0);
    const artistBeforeTitle = beforeTitle.match(
      /(?:搜索|选|找|放)(?:了|一首)?\s*([\u4e00-\u9fa5A-Za-z0-9·.]{2,10})[,，]/
    );
    // legacy compat: 过滤误识别的说话人名（含 legacy personal names）
    if (artistBeforeTitle?.[1] && !LEGACY_PERSONAL_NAME_RE.test(artistBeforeTitle[1])) {
      return `${title} ${artistBeforeTitle[1].trim()}`;
    }
    const artistMatch = beforeTitle.match(
      /(?:想听|想.{0,12}听|听听|放|播|点|来|在网易云[^《]*?听)[^《]*?(?:一首|首|个)?([\u4e00-\u9fa5A-Za-z0-9·.]{2,15})的\s*$/
    );
    if (artistMatch) {
      return `${title} ${artistMatch[1].trim()}`;
    }
    if (hasMusicIntent(t) && title.length >= 1) return title;
  }

  if (!hasMusicIntent(t)) return null;

  const FALLBACK_PATTERNS: RegExp[] = [
    /(?:想听|想.{0,12}听|听听|来(?:首|一首|个)?|放(?:首|一首|个)?|播(?:放|个)?|点(?:首|一首|个)?|在网易云[^，。！？]*?听)[\s「『"'《]*([^」』"'》\n，。！？!?]{1,80}?)[\s」』"'》]*(?:吧|吗|呢|呀|啊|嘛|呗)?[，。！？!?～~]*$/i,
    /(?:帮我|请)?(?:放|播(?:放)?|点|来)(?:一首|首|个)?[\s「『"'《]*([^」』"'》\n]{1,80}?)[\s」』"'》]*/i,
    /(?:play|listen\s+to)\s+(.{2,80})/i,
  ];

  for (const re of FALLBACK_PATTERNS) {
    const m = t.match(re);
    if (!m?.[1]) continue;
    const q = cleanQuery(m[1]);
    if (q.length >= 1 && q.length <= 80) return q;
  }

  return null;
}

/** 从最近聊天记录回溯歌名（用户只说「发网易云卡片」时用） */
export function extractMusicQueryFromChatHistory(chatId: string): string | null {
  const chat = getChat(chatId);
  if (!chat) return null;

  for (let i = chat.messages.length - 1; i >= 0; i--) {
    const msg = chat.messages[i];
    if (msg.role !== "user") continue;
    const body = userTextForMusicFallback(msg.content);
    const q = extractMusicQueryFromText(body);
    if (q) return q;
    const artistTitle = body.match(
      /(?:想.{0,12}听|听|放|点|来)[^《]*?([\u4e00-\u9fa5A-Za-z0-9·.]{2,10})的《([^》\n]{1,80})》/
    );
    if (artistTitle) {
      return `${artistTitle[2].trim()} ${artistTitle[1].trim()}`;
    }
    const looseTitle = body.match(/([\u4e00-\u9fa5A-Za-z0-9·.]{2,10})的《([^》\n]{1,80})》/);
    if (looseTitle) {
      return `${looseTitle[2].trim()} ${looseTitle[1].trim()}`;
    }
    const titleOnly = body.match(/《([^》\n]{1,80})》/);
    if (titleOnly?.[1]?.trim()) return titleOnly[1].trim();
  }
  return null;
}

/** 模型未输出标记时，从用户的消息兜底提取搜歌关键词 */
export function fallbackMusicQueryFromUserMessage(content: string): string | null {
  return extractMusicQueryFromText(content);
}

/** 去掉模型在正文里「假装发卡片/发图」的描写（系统会另发真实卡片） */
export function stripRoleplayedAgentArtifacts(text: string): string {
  return text
    .replace(/\n*（[^）\n]*(?:音乐卡片|网易云链接|发来一张图|发来一张)[^）\n]*）\n*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function resolveMusicQuery(
  assistantRaw: string,
  userContent: string,
  chatId?: string
): { query: string | null; cleanAssistantText: string } {
  const { cleanText, query: markerQuery } = stripMusicMarker(assistantRaw);

  const userQuery = sanitizeMusicQuery(extractMusicQueryFromText(userContent));
  const marker = sanitizeMusicQuery(markerQuery);
  const userWantsMusic = hasMusicIntent(userContent);
  const assistantWantsMusic = hasMusicIntent(assistantRaw) || marker !== null;

  let query: string | null = null;
  if (userQuery) {
    query = userQuery;
  } else if (marker) {
    query = marker;
  } else if (userWantsMusic && chatId) {
    query = sanitizeMusicQuery(extractMusicQueryFromChatHistory(chatId)) ?? "";
  } else if (assistantWantsMusic) {
    query = "";
  }

  return {
    query,
    cleanAssistantText: cleanText || (query !== null ? "好，我去放。" : assistantRaw.trim()),
  };
}
