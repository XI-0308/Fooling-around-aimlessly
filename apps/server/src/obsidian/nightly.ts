import { getPrimaryCharacter } from "../store/characters.js";
import { loadSettings } from "../config.js";
import { sendWebPushToAll } from "../push/send.js";
import { generateSuCommentForNote } from "./comment.js";
import { pushRecentComment, loadObsidianState, saveObsidianState } from "./state.js";
import {
  appendSuComment,
  ensureWhitelistDirs,
  getVaultRoot,
  listWhitelistNotes,
  noteNeedsComment,
  readNote,
  writeNote,
} from "./vault.js";

export interface NightlyRunResult {
  ok: boolean;
  skippedReason?: string;
  commented: { relPath: string; title: string }[];
  errors: string[];
}

/** 执行一轮夜间留言（可手动触发） */
export async function runObsidianNightly(opts?: {
  force?: boolean;
}): Promise<NightlyRunResult> {
  const settings = loadSettings();
  if (!settings.obsidianEnabled) {
    return { ok: false, skippedReason: "Obsidian 未启用", commented: [], errors: [] };
  }
  if (!opts?.force && !settings.obsidianNightlyEnabled) {
    return { ok: false, skippedReason: "夜间留言未启用", commented: [], errors: [] };
  }
  if (!getVaultRoot()) {
    const raw = loadSettings().obsidianVaultPath?.trim() || "(空)";
    return {
      ok: false,
      skippedReason: `vault 路径无效：请确认是真实文件夹，盘符用英文冒号如 D:\\Ob\\库名（当前：${raw}）`,
      commented: [],
      errors: [],
    };
  }

  ensureWhitelistDirs();
  const maxN = Math.min(10, Math.max(1, settings.obsidianMaxCommentsPerNight ?? 3));
  // 本地扫库 + mtime/留言日筛选；只有入选的几篇才送模型读正文写留言
  const candidates = listWhitelistNotes({ excludeOptOut: true })
    .map((n) => {
      const { content } = readNote(n.relPath);
      return { note: n, content, needs: noteNeedsComment(content, n.mtimeMs) };
    })
    .filter((x) => x.needs)
    .sort((a, b) => b.note.mtimeMs - a.note.mtimeMs)
    .slice(0, maxN);

  const commented: { relPath: string; title: string }[] = [];
  const errors: string[] = [];

  for (const c of candidates) {
    try {
      const text = await generateSuCommentForNote({
        title: c.note.title,
        content: c.content,
      });
      if (!text.trim()) {
        errors.push(`${c.note.relPath}: 空留言`);
        continue;
      }
      const next = appendSuComment(c.content, text);
      writeNote(c.note.relPath, next);
      commented.push({ relPath: c.note.relPath, title: c.note.title });
      pushRecentComment({
        relPath: c.note.relPath,
        title: c.note.title,
        excerpt: text.slice(0, 120),
        at: new Date().toISOString(),
      });
    } catch (err) {
      errors.push(
        `${c.note.relPath}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const state = loadObsidianState();
  state.lastRunAt = new Date().toISOString();
  saveObsidianState(state);

  if (commented.length > 0 && settings.obsidianPushNotify !== false) {
    const first = commented[0];
    const more = commented.length > 1 ? ` 等 ${commented.length} 篇` : "";
    const charName = getPrimaryCharacter()?.data?.name?.trim() || "角色";
    void sendWebPushToAll({
      title: "\u200b",
      body: `${charName}：在「${first.title}」留了言${more}`,
      url: "/settings",
      tag: "ef-obsidian",
      unreadCount: 1,
    }).catch(() => {
      /* ignore */
    });
  }

  return { ok: true, commented, errors };
}
