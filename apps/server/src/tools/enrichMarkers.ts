/** 用户界面隐藏、模型仍可见的后端注入块前缀 */
export const URL_ENRICH_MARKER = "[用户分享的网页 — 正文摘要]";
/** @deprecated 旧版看图注入，仍用于剥离历史消息 */
export const VISION_ENRICH_MARKER = "[工具 · 看图]";
export const VISION_ENRICH_PREFIX = "图片上是：";
/** 看图失败时注入给模型的自然表述（无「状态：失败」） */
export const VISION_ENRICH_FAILURE_TEXT = "没能看清这张图。";
export const WEREAD_ENRICH_MARKER = "[工具 · 微信读书]";
export const BILIBILI_ENRICH_MARKER = "[工具 · Bilibili 字幕]";
export const ZHIHU_ENRICH_MARKER = "[工具 · 知乎]";
export const UV_ENRICH_MARKER = "[工具 · 紫外线指数]";
export const KEEP_ENRICH_MARKER = "[工具 · Keep 健康]";
export const LEGACY_VISION_MARKER = "[用户发送的图片 — Vision 转述]";

const ALL_MARKERS = [
  URL_ENRICH_MARKER,
  VISION_ENRICH_MARKER,
  WEREAD_ENRICH_MARKER,
  BILIBILI_ENRICH_MARKER,
  ZHIHU_ENRICH_MARKER,
  UV_ENRICH_MARKER,
  KEEP_ENRICH_MARKER,
  LEGACY_VISION_MARKER,
];

export function buildVisionEnrichBlock(description: string): string {
  let body = description.trim();
  if (!body.endsWith("。") && !body.endsWith("！") && !body.endsWith("？")) {
    body = `${body}。`;
  }
  return `\n\n${VISION_ENRICH_PREFIX}【${body}】`;
}

export function stripWeReadEnrichFromContent(content: string): string {
  let text = content;
  const idx = text.indexOf(`\n\n${WEREAD_ENRICH_MARKER}`);
  if (idx >= 0) text = text.slice(0, idx);
  return text.trimEnd();
}

export function stripBilibiliEnrichFromContent(content: string): string {
  let text = content;
  const idx = text.indexOf(`\n\n${BILIBILI_ENRICH_MARKER}`);
  if (idx >= 0) text = text.slice(0, idx);
  return text.trimEnd();
}

export function stripZhihuEnrichFromContent(content: string): string {
  let text = content;
  const idx = text.indexOf(`\n\n${ZHIHU_ENRICH_MARKER}`);
  if (idx >= 0) text = text.slice(0, idx);
  return text.trimEnd();
}

export function stripUvEnrichFromContent(content: string): string {
  let text = content;
  const idx = text.indexOf(`\n\n${UV_ENRICH_MARKER}`);
  if (idx >= 0) text = text.slice(0, idx);
  return text.trimEnd();
}

export function stripKeepEnrichFromContent(content: string): string {
  let text = content;
  const idx = text.indexOf(`\n\n${KEEP_ENRICH_MARKER}`);
  if (idx >= 0) text = text.slice(0, idx);
  return text.trimEnd();
}

export function stripVisionEnrichFromContent(content: string): string {
  let text = content;
  const visionIdx = text.indexOf(`\n\n${VISION_ENRICH_PREFIX}`);
  if (visionIdx >= 0) text = text.slice(0, visionIdx);
  for (const marker of [VISION_ENRICH_MARKER, LEGACY_VISION_MARKER]) {
    const idx = text.indexOf(`\n\n${marker}`);
    if (idx >= 0) text = text.slice(0, idx);
  }
  return text.trimEnd();
}

export const VOICE_ENRICH_MARKER = "[工具 · 语音识别]";

export function stripEnrichBlocksFromDisplay(content: string): string {
  let text = stripVisionEnrichFromContent(content);
  for (const marker of [
    URL_ENRICH_MARKER,
    WEREAD_ENRICH_MARKER,
    BILIBILI_ENRICH_MARKER,
    ZHIHU_ENRICH_MARKER,
    UV_ENRICH_MARKER,
    KEEP_ENRICH_MARKER,
    VOICE_ENRICH_MARKER,
  ]) {
    const idx = text.indexOf(`\n\n${marker}`);
    if (idx >= 0) text = text.slice(0, idx);
  }
  return text.trim();
}

/** 点歌后写入正文、进模型上下文；界面可隐藏方括号部分 */
export const MUSIC_SHARE_NOTE_RE = /\[(?:分享来自|来自).+?的单曲《.+?》\]/g;

export function formatMusicShareNote(artists: string, name: string): string {
  const n = (name || "未知曲目").trim() || "未知曲目";
  const a = (artists || "").trim();
  const spoken = "(说完我同时给你分享了一首音乐)";
  if (!a || a === "未知歌手" || a === "未知艺人") {
    return `${spoken}《${n}》`;
  }
  return `${spoken}[来自${a}的单曲《${n}》]`;
}

export function stripMusicShareNotes(content: string): string {
  return content.replace(MUSIC_SHARE_NOTE_RE, "").replace(/\n{3,}/g, "\n\n").trimEnd();
}

/** 生图分享：独立消息正文；括号外口语可见，方括号描述进上下文、界面隐藏 */
export const IMAGE_SHARE_NOTE_RE = /\[分享一张图：[\s\S]*?\]/g;

export function formatImageShareNote(prompt: string): string {
  const p = prompt.replace(/\s+/g, " ").trim().slice(0, 500) || "（无描述）";
  return `(说完我画了一张图片给你)[分享一张图：${p}]`;
}

/** 网页找图分享：与生图同为附件消息，文案区分来源 */
export function formatWebImageShareNote(note: string): string {
  const n = note.replace(/\s+/g, " ").trim().slice(0, 500) || "（网上的图）";
  return `(说完我找了一张图给你)[分享一张图：${n}]`;
}

export function stripImageShareNotes(content: string): string {
  return content.replace(IMAGE_SHARE_NOTE_RE, "").replace(/\n{3,}/g, "\n\n").trimEnd();
}

/** 点歌/生图 follow-up 纯占位消息：存聊天记录与界面，但不送入模型上下文 */
export function isToolFollowUpPlaceholder(
  msg: { role: string; content: string; musicCard?: unknown; attachments?: { kind: string }[] },
  charName: string
): boolean {
  if (msg.role !== "assistant") return false;
  // 新版分享消息必须进上下文；删消息即消失
  if (/\[分享一张图：/.test(msg.content)) return false;
  if (/说完我同时给你分享了一首音乐/.test(msg.content)) return false;
  if (/\[来自.+?的单曲《/.test(msg.content)) return false;
  const t = stripImageShareNotes(stripMusicShareNotes(msg.content)).trim();
  const escaped = charName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // 仅跳过「只有占位文案」的旧 follow-up；含分享备注或正文的同条仍送入上下文
  if (new RegExp(`^\\[${escaped}\\s+为你点的歌\\]$`).test(t)) return true;
  if (!t && msg.musicCard) return false;
  if (
    msg.attachments?.some((a) => a.kind === "image") &&
    new RegExp(`^\\[${escaped}\\s+生成的图片\\]$`).test(t)
  ) {
    return true;
  }
  return false;
}

/** 构建 prompt 时：历史轮次的用户消息去掉工具注入，仅保留用户可见原文 */
export const stripEnrichBlocksForPromptHistory = stripEnrichBlocksFromDisplay;

/** 意图检测 / follow-up 等：只看用户写的原文 */
export function stripUserVisibleText(content: string): string {
  return stripEnrichBlocksFromDisplay(content);
}

export function hasVisionEnrich(content: string): boolean {
  return (
    content.includes(VISION_ENRICH_PREFIX) ||
    content.includes(VISION_ENRICH_MARKER) ||
    content.includes(LEGACY_VISION_MARKER)
  );
}

export function hasVisionEnrichFailure(content: string): boolean {
  if (!hasVisionEnrich(content)) return false;
  if (/状态：失败/.test(content)) return true;
  return content.includes(`${VISION_ENRICH_PREFIX}【${VISION_ENRICH_FAILURE_TEXT}】`);
}

export function hasWeReadEnrichFailure(content: string): boolean {
  return content.includes(WEREAD_ENRICH_MARKER) && /状态：失败/.test(content);
}

export function hasBilibiliEnrichFailure(content: string): boolean {
  return content.includes(BILIBILI_ENRICH_MARKER) && /状态：失败/.test(content);
}

export function hasZhihuEnrichFailure(content: string): boolean {
  return content.includes(ZHIHU_ENRICH_MARKER) && /状态：失败/.test(content);
}

export function hasUvEnrichFailure(content: string): boolean {
  return content.includes(UV_ENRICH_MARKER) && /状态：失败/.test(content);
}

export function hasKeepEnrichFailure(content: string): boolean {
  return content.includes(KEEP_ENRICH_MARKER) && /状态：失败/.test(content);
}
