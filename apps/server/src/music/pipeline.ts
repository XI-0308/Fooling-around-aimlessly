import { loadSettings } from "../config.js";
import { isNetEaseConfigured, SERVICE_AUTH_HINT } from "../tools/serviceAuth.js";
import { searchNetEaseSong } from "./neteaseClient.js";
import { appendAssistantMessage, type ChatMessage, type MusicCard } from "../store/chats.js";
import { formatMusicShareNote } from "../tools/enrichMarkers.js";

export async function runMusicFollowUp(
  chatId: string,
  query: string,
  _characterName: string
): Promise<
  | { ok: true; message: ChatMessage }
  | { ok: false; error: string; message?: ChatMessage }
> {
  const settings = loadSettings();
  if (settings.musicEnabled === false) {
    return { ok: false, error: "已在设置中关闭「网易云点歌」能力。" };
  }

  if (!isNetEaseConfigured(settings.neteaseMusic)) {
    return { ok: false, error: `未配置网易云 Cookie 或 CookieCloud。${SERVICE_AUTH_HINT}` };
  }

  try {
    const song = await searchNetEaseSong(query, settings.neteaseMusic);
    if (!song) {
      return {
        ok: false,
        error: query.trim() ? `没在网易云找到「${query}」相关的歌` : "歌单里没有可播放的歌曲",
      };
    }

    const card: MusicCard = {
      songId: song.songId,
      name: song.name,
      artists: song.artists,
      album: song.album,
      coverUrl: song.coverUrl,
      webUrl: song.webUrl,
      appUrl: song.appUrl,
    };

    // 独立新消息：口语可见 + 方括号进上下文；删除该消息后角色不再读到
    const msg = appendAssistantMessage(
      chatId,
      formatMusicShareNote(card.artists, card.name),
      undefined,
      undefined,
      undefined,
      card
    );
    return { ok: true, message: msg };
  } catch (err) {
    const errText = err instanceof Error ? err.message : "未知错误";
    return { ok: false, error: errText };
  }
}
