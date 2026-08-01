import fs from "fs";
import path from "path";
import { loadSettings } from "../config.js";
import {
  LEGACY_CHAR,
  LEGACY_CHAR_THOUGHT_PREFIX_RE,
  LEGACY_USER,
  LEGACY_USER_THOUGHT_PREFIX_RE,
} from "../text/legacyNames.js";
import {
  COMMENT_SECTION_HEADING,
  DEFAULT_CHAR_NAME,
  DEFAULT_USER_NAME,
  DEFAULT_WHITELIST,
  commentSectionHeading,
  findCommentSectionIndex,
  type ObsidianNoteRef,
} from "./types.js";

export function parseWhitelistDirs(raw?: string): string[] {
  const text = (raw || "").trim();
  if (!text) return [...DEFAULT_WHITELIST];
  const parts = text
    .split(/[,，\n]/)
    .map((s) => s.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .map((s) => (s === "." || s === "./" ? "." : s));
  if (parts.length === 0 || parts.some((p) => p === "*")) return ["*"];
  return parts;
}

export function normalizeVaultPathInput(raw: string): string {
  let p = (raw || "").trim().replace(/^["']|["']$/g, "");
  // 常见粘贴问题：全角冒号 D：\ → D:\
  p = p.replace(/^([A-Za-z])：[\\/]/, "$1:\\");
  p = p.replace(/\uFF1A/g, ":");
  return p;
}

export function getVaultRoot(): string | null {
  const settings = loadSettings();
  const p = normalizeVaultPathInput(settings.obsidianVaultPath || "");
  if (!p) return null;
  try {
    const resolved = path.resolve(p);
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) return null;
    return resolved;
  } catch {
    return null;
  }
}

/** 防止路径逃出 vault */
export function resolveVaultPath(relPath: string): string {
  const root = getVaultRoot();
  if (!root) throw new Error("未配置有效的 Obsidian vault 路径");
  const normalized = relPath.replace(/\\/g, "/").replace(/^\/+/, "");
  if (normalized.includes("..")) throw new Error("非法路径");
  const abs = path.resolve(root, ...normalized.split("/"));
  const rootWithSep = root.endsWith(path.sep) ? root : root + path.sep;
  if (abs !== root && !abs.startsWith(rootWithSep)) {
    throw new Error("路径超出 vault");
  }
  return abs;
}

export function ensureWhitelistDirs(): void {
  const root = getVaultRoot();
  if (!root) return;
  const settings = loadSettings();
  for (const dir of parseWhitelistDirs(settings.obsidianWhitelistDirs)) {
    if (dir === "*" || dir === ".") continue;
    const abs = path.join(root, ...dir.split("/"));
    fs.mkdirSync(abs, { recursive: true });
  }
}

function parseFrontmatter(raw: string): { data: Record<string, string>; body: string } {
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
    return { data: {}, body: raw };
  }
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return { data: {}, body: raw };
  const fm = raw.slice(4, end).replace(/\r/g, "");
  const body = raw.slice(end + 4).replace(/^\r?\n/, "");
  const data: Record<string, string> = {};
  for (const line of fm.split("\n")) {
    const m = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (m) data[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { data, body };
}

/** 显式退出：ef_comment / ef_su: false / #ef/su-off */
export function noteIsOptedOut(content: string): boolean {
  const { data, body } = parseFrontmatter(content);
  const v = (data.ef_comment || data.efComment || data.ef_su || data.efSu || "").toLowerCase();
  if (v === "false" || v === "no" || v === "0" || v === "off") return true;
  if (/#ef\/su-off\b|#ef_su_off\b/i.test(body) || /#ef\/su-off\b/i.test(content)) return true;
  return false;
}

/** @deprecated 整库默认可留言后仅作兼容；请用 !noteIsOptedOut */
export function noteHasEfSu(content: string): boolean {
  return !noteIsOptedOut(content);
}

export function titleFromNote(relPath: string, content: string): string {
  const { body } = parseFrontmatter(content);
  const m = body.match(/^#\s+(.+)$/m);
  if (m) return m[1].trim();
  return path.basename(relPath, path.extname(relPath));
}

function walkMdFiles(dirAbs: string, rootAbs: string, out: string[], recursive: boolean): void {
  if (!fs.existsSync(dirAbs)) return;
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.name.startsWith(".")) continue;
    const abs = path.join(dirAbs, ent.name);
    if (ent.isDirectory()) {
      if (recursive) walkMdFiles(abs, rootAbs, out, true);
    } else if (ent.isFile() && /\.md$/i.test(ent.name)) {
      out.push(abs);
    }
  }
}

/**
 * 列出白名单内笔记。
 * 默认整库（`*`）递归；跳过 opt-out。
 * 只读本地文件/mtime，不调模型。
 */
export function listWhitelistNotes(opts?: {
  /** 默认 true：排除 ef_comment/ef_su:false */
  excludeOptOut?: boolean;
}): ObsidianNoteRef[] {
  const root = getVaultRoot();
  if (!root) return [];
  const settings = loadSettings();
  const dirs = parseWhitelistDirs(settings.obsidianWhitelistDirs);
  const absFiles: string[] = [];
  const seen = new Set<string>();

  if (dirs.includes("*")) {
    walkMdFiles(root, root, absFiles, true);
  } else {
    for (const dir of dirs) {
      if (dir === ".") {
        walkMdFiles(root, root, absFiles, false);
      } else {
        walkMdFiles(path.join(root, ...dir.split("/")), root, absFiles, true);
      }
    }
  }

  const excludeOptOut = opts?.excludeOptOut !== false;
  const out: ObsidianNoteRef[] = [];
  for (const abs of absFiles) {
    if (seen.has(abs)) continue;
    seen.add(abs);
    let content = "";
    try {
      content = fs.readFileSync(abs, "utf-8");
    } catch {
      continue;
    }
    const optedOut = noteIsOptedOut(content);
    if (excludeOptOut && optedOut) continue;
    const relPath = path.relative(root, abs).split(path.sep).join("/");
    const st = fs.statSync(abs);
    out.push({
      relPath,
      title: titleFromNote(relPath, content),
      absPath: abs,
      mtimeMs: st.mtimeMs,
      hasEfSu: !optedOut,
    });
  }
  return out;
}

export function readNote(relPath: string): { content: string; title: string } {
  const abs = resolveVaultPath(relPath);
  const content = fs.readFileSync(abs, "utf-8");
  return { content, title: titleFromNote(relPath, content) };
}

export function noteExists(relPath: string): boolean {
  try {
    const abs = resolveVaultPath(relPath);
    return fs.existsSync(abs) && fs.statSync(abs).isFile();
  } catch {
    return false;
  }
}

/** 从 vault 扫描有留言线程的笔记（慢思考页真源，不依赖 state 缓存） */
export function listThoughtFeed(limit = 40): {
  relPath: string;
  title: string;
  excerpt: string;
  at: string;
  thread: ThoughtMessage[];
  /** 从前言 ef_chat_id 解析；聊天「沉淀」写入的话题可回原对话 */
  chatId?: string;
}[] {
  if (!getVaultRoot()) return [];
  const items: {
    relPath: string;
    title: string;
    excerpt: string;
    at: string;
    atMs: number;
    thread: ThoughtMessage[];
    chatId?: string;
  }[] = [];

  for (const n of listWhitelistNotes({ excludeOptOut: false })) {
    let content: string;
    let title = n.title;
    try {
      const migrated = readAndMigrateNote(n.relPath);
      content = migrated.content;
      title = migrated.title;
    } catch {
      continue;
    }
    const thread = parseCommentThread(content);
    const hasSection = findCommentSectionIndex(content) >= 0;
    if (thread.length === 0 && !hasSection) continue;
    const last = thread.length ? thread[thread.length - 1] : null;
    let atMs = n.mtimeMs;
    if (last?.at || last?.date) {
      const raw = (last.at || last.date || "").replace(" ", "T");
      const d = new Date(raw.length <= 10 ? `${raw}T12:00:00` : raw);
      if (!Number.isNaN(d.getTime())) atMs = Math.max(atMs, d.getTime());
    }
    const { data: fm } = parseFrontmatter(content);
    const chatId = (fm.ef_chat_id || fm.efChatId || "").trim() || undefined;
    items.push({
      relPath: n.relPath,
      title,
      excerpt: last ? last.text.slice(0, 120) : "（新话题，还没有思考）",
      at: new Date(atMs).toISOString(),
      atMs,
      thread,
      chatId,
    });
  }

  items.sort((a, b) => b.atMs - a.atMs);
  return items.slice(0, limit).map(({ atMs: _a, ...rest }) => rest);
}

export function writeNote(relPath: string, content: string): void {
  const abs = resolveVaultPath(relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content, "utf-8");
}

/** 解析留言区中最后一个 ### YYYY-MM-DD */
export function extractLastCommentDate(content: string): Date | null {
  const idx = findCommentSectionIndex(content);
  if (idx < 0) return null;
  const section = content.slice(idx);
  const dates = [...section.matchAll(/^###\s+(\d{4}-\d{2}-\d{2})\s*$/gm)];
  if (dates.length === 0) return null;
  const last = dates[dates.length - 1][1];
  const d = new Date(`${last}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function contentAfterLastComment(content: string): string {
  const idx = findCommentSectionIndex(content);
  if (idx < 0) return content;
  const section = content.slice(idx);
  const dates = [...section.matchAll(/^###\s+(\d{4}-\d{2}-\d{2})\s*$/gm)];
  if (dates.length === 0) return "";
  const lastMatch = dates[dates.length - 1];
  const start = (lastMatch.index ?? 0) + lastMatch[0].length;
  return section.slice(start);
}

export function todayYmdLocal(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 是否已在今天留过言 */
export function commentedToday(content: string): boolean {
  const today = todayYmdLocal();
  const idx = findCommentSectionIndex(content);
  if (idx < 0) return false;
  return new RegExp(`^###\\s+${today}\\s*$`, "m").test(content.slice(idx));
}

/**
 * 是否需要再留言（本地规则，不调模型）：
 * - 未 opt-out
 * - 留言线程末条是用户的思考 → 角色接上（即使今天已留过也要回）
 * - 末条已是角色的思考 → 不再续写（用户未跟进就不跟）
 * - 尚无留言线程 → 允许首轮留言
 *
 * 注意：不再用「日标题后全文长度 / 粗 mtime」判断，避免把角色自己的长留言误判成用户更新。
 */
export function noteNeedsComment(content: string, _mtimeMs?: number): boolean {
  if (noteIsOptedOut(content)) return false;
  const thread = parseCommentThread(content);
  if (thread.length === 0) return true;
  return thread[thread.length - 1]!.role === "user";
}

export type ThoughtRole = "user" | "char";

/** 旧笔记/线程里的 legacy 角色值 */
export type LegacyThoughtRole = "xi" | "su";

export function normalizeThoughtRole(role: string): ThoughtRole {
  if (role === "user" || role === "char") return role;
  if (role === "xi") return "user";
  if (role === "su") return "char";
  return role.startsWith(LEGACY_USER) || role.startsWith("你") ? "user" : "char";
}

/** 解析留言区标签 → 内部 role（兼容 legacy personal names、xi/su） */
const THOUGHT_TAG_RE = new RegExp(
  `^(${LEGACY_USER}的思考|${LEGACY_CHAR}的思考|你的思考|角色的思考|${LEGACY_USER}|${LEGACY_CHAR}|user的思考|char的思考|user|char|xi的思考|su的思考|xi|su)(?:\\s*[·・]\\s*(\\d{4}-\\d{2}-\\d{2}(?:\\s+\\d{1,2}:\\d{2})?))?\\s*[：:]\\s*(.*)$`,
  "u"
);

function roleFromThoughtTag(tag: string): ThoughtRole {
  const t = tag.trim();
  if (new RegExp(`^(${LEGACY_USER}|你|user|xi)`, "i").test(t) || t.startsWith("你的")) return "user";
  return "char";
}

/** 写入 vault 时的思考标签 */
export function thoughtLabel(
  role: ThoughtRole,
  userName = DEFAULT_USER_NAME,
  charName = DEFAULT_CHAR_NAME
): string {
  if (role === "user") {
    return userName === DEFAULT_USER_NAME ? "你的思考" : `${userName}的思考`;
  }
  return charName === DEFAULT_CHAR_NAME ? "角色的思考" : `${charName}的思考`;
}

export interface ThoughtMessage {
  role: ThoughtRole;
  text: string;
  /** YYYY-MM-DD（来自 ### 日标题或时间戳） */
  date?: string;
  /** 显示用时间戳，如 2026-07-30 17:04 */
  at?: string;
}

export function nowStampLocal(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  const hh = String(n.getHours()).padStart(2, "0");
  const mm = String(n.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function stampDay(stamp: string | undefined): string {
  if (!stamp) return todayYmdLocal();
  const m = stamp.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : todayYmdLocal();
}

/** 解析「EF · 角色的留言」区为线程（兼容旧版无前缀正文＝角色） */
export function parseCommentThread(content: string): ThoughtMessage[] {
  const idx = findCommentSectionIndex(content);
  if (idx < 0) return [];
  const headingEnd = content.indexOf("\n", idx);
  const sectionStart = headingEnd >= 0 ? headingEnd + 1 : idx + COMMENT_SECTION_HEADING.length;
  const section = content.slice(sectionStart).replace(/^\s*\n/, "");
  const messages: ThoughtMessage[] = [];
  let currentDate: string | undefined;
  let buf: { role: ThoughtRole; parts: string[]; at?: string } | null = null;

  const flush = () => {
    if (!buf) return;
    const text = buf.parts.join("\n").trim();
    if (text) {
      messages.push({
        role: buf.role,
        text,
        date: stampDay(buf.at || currentDate),
        at: buf.at || currentDate,
      });
    }
    buf = null;
  };

  for (const line of section.split(/\r?\n/)) {
    const day = line.match(/^###\s+(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?\s*$/);
    if (day) {
      flush();
      currentDate = day[2] ? `${day[1]} ${day[2].padStart(5, "0")}` : day[1];
      continue;
    }
    const tagged = line.match(THOUGHT_TAG_RE);
    if (tagged) {
      flush();
      const role = roleFromThoughtTag(tagged[1]);
      const at = tagged[2]?.replace(/\s+(\d):/, " 0$1:") || currentDate;
      buf = { role, parts: [tagged[3] ?? ""], at };
      continue;
    }
    if (!buf) {
      if (!line.trim()) continue;
      buf = { role: "char", parts: [line], at: currentDate };
    } else {
      buf.parts.push(line);
    }
  }
  flush();
  return messages;
}

/** 用线程重写留言区（保留笔记正文） */
export function replaceCommentThread(
  content: string,
  thread: ThoughtMessage[],
  opts?: { userName?: string; charName?: string }
): string {
  const userName = opts?.userName?.trim() || DEFAULT_USER_NAME;
  const charName = opts?.charName?.trim() || DEFAULT_CHAR_NAME;
  const idx = findCommentSectionIndex(content);
  const head = idx >= 0 ? content.slice(0, idx).replace(/\s*$/, "\n\n") : content.replace(/\s*$/, "\n\n");
  if (thread.length === 0) {
    return head.replace(/\s*$/, "\n");
  }
  let out = `${commentSectionHeading(charName)}\n\n`;
  let lastDay = "";
  for (const m of thread) {
    const stamp = m.at || m.date || nowStampLocal();
    const day = stampDay(stamp);
    if (day !== lastDay) {
      out += `### ${day}\n`;
      lastDay = day;
    }
    const who = thoughtLabel(m.role, userName, charName);
    out += `${who} · ${stamp}：${m.text.trim()}\n\n`;
  }
  return head + out;
}

export function appendSuComment(
  content: string,
  commentBody: string,
  dateYmd?: string,
  opts?: { userName?: string; charName?: string }
): string {
  const charName = opts?.charName?.trim() || DEFAULT_CHAR_NAME;
  const migrated = migrateLeadThoughtsIntoSection(content, opts).content;
  const stamp = dateYmd
    ? dateYmd.length <= 10
      ? `${dateYmd} ${nowStampLocal().slice(11)}`
      : dateYmd
    : nowStampLocal();
  const charLabel = charName === DEFAULT_CHAR_NAME ? "角色" : charName;
  const cleaned = commentBody
    .trim()
    .replace(/\r\n/g, "\n")
    // legacy compat: 旧笔记/模型输出可能带 legacy char 思考前缀
    .replace(LEGACY_CHAR_THOUGHT_PREFIX_RE, "")
    .replace(new RegExp(`^${charLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[：:]\\s*`, "u"), "");
  const thread = parseCommentThread(migrated);
  thread.push({ role: "char", text: cleaned, date: stampDay(stamp), at: stamp });
  return replaceCommentThread(migrated, thread, opts);
}

/** 用户在留言区追加思考（写入本地 vault） */
export function appendXiThought(
  content: string,
  body: string,
  opts?: { userName?: string; charName?: string }
): string {
  const userName = opts?.userName?.trim() || DEFAULT_USER_NAME;
  const migrated = migrateLeadThoughtsIntoSection(content, opts).content;
  const userLabel = userName === DEFAULT_USER_NAME ? "你" : userName;
  const cleaned = body
    .trim()
    .replace(/\r\n/g, "\n")
    // legacy compat: 旧笔记可能带 legacy user 思考前缀
    .replace(LEGACY_USER_THOUGHT_PREFIX_RE, "")
    .replace(new RegExp(`^${userLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[：:]\\s*`, "u"), "");
  if (!cleaned) throw new Error("回复不能为空");
  const stamp = nowStampLocal();
  const thread = parseCommentThread(migrated);
  thread.push({ role: "user", text: cleaned, date: stampDay(stamp), at: stamp });
  return replaceCommentThread(migrated, thread, opts);
}

/** 修改用户的某一条思考（index 为 parseCommentThread 下标） */
export function updateXiThought(
  content: string,
  index: number,
  body: string,
  opts?: { userName?: string; charName?: string }
): string {
  const userName = opts?.userName?.trim() || DEFAULT_USER_NAME;
  const migrated = migrateLeadThoughtsIntoSection(content, opts).content;
  const userLabel = userName === DEFAULT_USER_NAME ? "你" : userName;
  const cleaned = body
    .trim()
    .replace(/\r\n/g, "\n")
    .replace(LEGACY_USER_THOUGHT_PREFIX_RE, "")
    .replace(new RegExp(`^${userLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[：:]\\s*`, "u"), "");
  if (!cleaned) throw new Error("内容不能为空");
  const thread = parseCommentThread(migrated);
  const target = thread[index];
  if (!target) throw new Error("找不到这条思考");
  if (target.role !== "user") throw new Error("只能修改用户的思考");
  thread[index] = { ...target, text: cleaned };
  return replaceCommentThread(migrated, thread, opts);
}

function splitFrontmatter(raw: string): { prefix: string; rest: string } {
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) {
    return { prefix: "", rest: raw };
  }
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return { prefix: "", rest: raw };
  const after = end + 4;
  const prefix = raw.slice(0, after).replace(/\r?\n?$/, "") + "\n\n";
  const rest = raw.slice(after).replace(/^\r?\n/, "");
  return { prefix, rest };
}

function normalizeBracketDate(text: string): { text: string; at?: string } {
  const m = text.match(/【\s*(\d{4})[.\-/年](\d{1,2})[.\-/月](\d{1,2})日?\s*】\s*$/u);
  if (!m || m.index == null) return { text: text.trim() };
  const at = `${m[1]}-${String(m[2]).padStart(2, "0")}-${String(m[3]).padStart(2, "0")}`;
  return { text: text.slice(0, m.index).trim(), at };
}

/**
 * 解析留言区之前正文里的用户/角色思考
 *（例如《幻觉》把第一条写在正文而不是留言区）
 */
export function parseLeadThoughts(content: string): {
  thoughts: ThoughtMessage[];
  headWithoutLeads: string;
} {
  const idx = findCommentSectionIndex(content);
  const before = idx >= 0 ? content.slice(0, idx) : content;
  const { prefix, rest } = splitFrontmatter(before);
  const body = rest.replace(/\s*$/, "");
  if (!body.trim()) {
    return { thoughts: [], headWithoutLeads: prefix };
  }

  if (
    !new RegExp(
      `^\\s*(${LEGACY_USER}的思考|${LEGACY_CHAR}的思考|你的思考|角色的思考|${LEGACY_USER}|${LEGACY_CHAR}|user的思考|char的思考|user|char|xi的思考|su的思考|xi|su)\\s*[：:]`,
      "u"
    ).test(body)
  ) {
    return { thoughts: [], headWithoutLeads: before.replace(/\s*$/, "\n\n") };
  }

  const thoughts: ThoughtMessage[] = [];
  let buf: { role: ThoughtRole; parts: string[]; at?: string } | null = null;
  const flush = () => {
    if (!buf) return;
    let text = buf.parts.join("\n").trim();
    if (!text) {
      buf = null;
      return;
    }
    const norm = normalizeBracketDate(text);
    text = norm.text;
    const at = buf.at || norm.at;
    if (text) {
      thoughts.push({
        role: buf.role,
        text,
        date: stampDay(at),
        at: at || stampDay(at),
      });
    }
    buf = null;
  };

  for (const line of body.split(/\r?\n/)) {
    const tagged = line.match(THOUGHT_TAG_RE);
    if (tagged) {
      flush();
      const role = roleFromThoughtTag(tagged[1]);
      const at = tagged[2]?.replace(/\s+(\d):/, " 0$1:");
      buf = { role, parts: [tagged[3] ?? ""], at };
      continue;
    }
    if (!buf) {
      if (!line.trim()) continue;
      continue;
    }
    buf.parts.push(line);
  }
  flush();

  return { thoughts, headWithoutLeads: prefix };
}

/** 把正文 lead 思考迁入留言区开头（去重） */
export function migrateLeadThoughtsIntoSection(
  content: string,
  opts?: { userName?: string; charName?: string }
): {
  content: string;
  changed: boolean;
} {
  const { thoughts: leads, headWithoutLeads } = parseLeadThoughts(content);
  if (leads.length === 0) return { content, changed: false };

  const section = parseCommentThread(content);
  const sectionTexts = new Set(section.map((m) => m.text.replace(/\s+/g, "").slice(0, 80)));
  const uniqueLeads = leads.filter((l) => !sectionTexts.has(l.text.replace(/\s+/g, "").slice(0, 80)));

  const idx = findCommentSectionIndex(content);
  const tail =
    idx >= 0 ? content.slice(idx) : `${commentSectionHeading(opts?.charName)}\n\n`;
  const withCleanHead = headWithoutLeads.replace(/\s*$/, "\n\n") + tail.replace(/^\s*/, "");

  if (uniqueLeads.length === 0) {
    return { content: withCleanHead, changed: withCleanHead !== content };
  }

  const merged = [...uniqueLeads, ...section];
  const next = replaceCommentThread(withCleanHead, merged, opts);
  return { content: next, changed: true };
}

/** 读取并必要时迁移 lead 思考 */
export function readAndMigrateNote(relPath: string): {
  content: string;
  title: string;
  migrated: boolean;
} {
  const note = readNote(relPath);
  const { content, changed } = migrateLeadThoughtsIntoSection(note.content);
  if (changed) writeNote(relPath, content);
  return { content, title: note.title, migrated: changed };
}

/** 在 vault 根目录新建一篇慢思考笔记 */
export function createThoughtNote(opts: {
  title: string;
  text?: string;
  userName?: string;
  charName?: string;
}): { relPath: string; title: string; thread: ThoughtMessage[] } {
  const title = opts.title.trim();
  if (!title) throw new Error("需要标题");
  const nameOpts = { userName: opts.userName, charName: opts.charName };
  const base = sanitizeTopicFilename(title);
  let relPath = `${base}.md`;
  let n = 2;
  while (noteExists(relPath)) {
    relPath = `${base}-${n}.md`;
    n += 1;
  }

  const stamp = nowStampLocal();
  const thread: ThoughtMessage[] = [];
  const first = opts.text?.trim();
  if (first) {
    thread.push({
      role: "user",
      text: first,
      date: stampDay(stamp),
      at: stamp,
    });
  }

  let content =
    `---\n` +
    `ef_comment: true\n` +
    `ef_source: slowthink\n` +
    `ef_created_at: ${new Date().toISOString()}\n` +
    `---\n\n`;

  if (thread.length > 0) {
    content = replaceCommentThread(content, thread, nameOpts);
  } else {
    content = ensureCommentSection(content, opts.charName);
  }
  writeNote(relPath, content);
  return { relPath, title: titleFromNote(relPath, content), thread: parseCommentThread(content) };
}

export function ensureCommentSection(content: string, charName?: string): string {
  if (findCommentSectionIndex(content) >= 0) return content;
  return content.replace(/\s*$/, "\n\n") + `${commentSectionHeading(charName)}\n\n`;
}

export function sanitizeTopicFilename(title: string): string {
  const t = title
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 60);
  return t || `话题-${todayYmdLocal()}`;
}

export function buildObsidianOpenUri(relPath: string): string | null {
  const settings = loadSettings();
  const vaultName =
    settings.obsidianVaultName?.trim() ||
    (settings.obsidianVaultPath ? path.basename(settings.obsidianVaultPath) : "");
  if (!vaultName) return null;
  const file = relPath.replace(/\.md$/i, "");
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(file)}`;
}
