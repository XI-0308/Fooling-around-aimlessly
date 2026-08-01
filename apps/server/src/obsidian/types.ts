/** Obsidian 慢思考知识库 · 类型 */

import { LEGACY_CHAR } from "../text/legacyNames.js";

export const DEFAULT_CHAR_NAME = "角色";
export const DEFAULT_USER_NAME = "你";

/** 新笔记默认留言区标题（写入时用运行时角色名） */
export function commentSectionHeading(charName = DEFAULT_CHAR_NAME): string {
  return `## EF · ${charName}的留言`;
}

/** 兼容旧常量引用 */
export const COMMENT_SECTION_HEADING = commentSectionHeading();

/** 历史 vault 里可能出现的留言区标题 */
const LEGACY_COMMENT_HEADINGS = [`## EF · ${LEGACY_CHAR}的留言`, COMMENT_SECTION_HEADING];

/** 定位留言区起始下标（兼容旧标题与动态角色名） */
export function findCommentSectionIndex(content: string): number {
  for (const h of LEGACY_COMMENT_HEADINGS) {
    const idx = content.indexOf(h);
    if (idx >= 0) return idx;
  }
  const m = content.match(/^## EF · .+的留言/m);
  return m?.index ?? -1;
}

/** 留言区标题行长度（用于 slice） */
export function commentSectionHeadingAt(content: string): { index: number; length: number } | null {
  const idx = findCommentSectionIndex(content);
  if (idx < 0) return null;
  const lineEnd = content.indexOf("\n", idx);
  const length = lineEnd >= 0 ? lineEnd - idx : content.length - idx;
  return { index: idx, length };
}

/** `*` = 整库递归；也可用具体子目录限制范围 */
export const DEFAULT_WHITELIST = ["*"];
export const TOPICS_DIR = "EF/Topics";

export interface ObsidianNoteRef {
  /** vault 相对路径，正斜杠 */
  relPath: string;
  title: string;
  absPath: string;
  mtimeMs: number;
  hasEfSu: boolean;
}

export interface RecentCommentEntry {
  relPath: string;
  title: string;
  excerpt: string;
  at: string;
}

export interface ObsidianRunState {
  lastRunAt: string | null;
  nextRunAt: string | null;
  recentComments: RecentCommentEntry[];
}
