/** 模型在回复末尾输出的隐形生图标记（用户不可见） */
import { getChat } from "../store/chats.js";
import { LEGACY_CHAR, LEGACY_USER } from "../text/legacyNames.js";

export const IMAGE_GEN_MARKER_RE = /\[\[IMAGE:\s*([\s\S]*?)\]\]/gi;

export const WANTS_IMAGE_RE =
  /生成.{0,8}图|画.{0,8}图|绘制.{0,8}图|出.{0,4}图|场景图片|的图片|给.{0,8}看.{0,8}图|来.{0,4}图|画给我|画出来|再画给|想.{0,6}看.{0,4}图|看看.{0,12}什么样|看一下.{0,8}什么样|空间.{0,6}什么样|draw|generate.{0,12}image|picture|illustration/i;

/** 注入 prompt，教模型用 [[IMAGE:…]] 触发后端生图 */
export function buildImageGenMarkerHint(userName = "你"): string {
  return (
    `【生图调用规则】当${userName}要求你画画、出图、或要看场景图时：\n` +
    "1. 正文用简短口语回复即可，不要写「调出界面/画面显现/推到你面前」等假装已出图的描写。\n" +
    "2. 在回复最末尾单独一行输出：[[IMAGE: 具体绘画描述]]（中英文均可，描述场景、光线、物品、氛围）。\n" +
    "3. 实际图片由后端根据该标记自动生成。"
  );
}

/** @deprecated 请用 buildImageGenMarkerHint(userName) */
export const IMAGE_GEN_MARKER_HINT = buildImageGenMarkerHint();

const ROLEPLAYED_IMAGE_RE =
  /Image Gen|生成.{0,8}图|渲染.{0,12}图|投射.{0,12}图|调出.{0,12}图|画面.{0,12}显现/i;

export function stripImageGenMarker(text: string): { cleanText: string; prompt: string | null } {
  let prompt: string | null = null;
  const cleanText = text
    .replace(IMAGE_GEN_MARKER_RE, (_, raw: string) => {
      prompt = String(raw).trim();
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { cleanText, prompt };
}

export function hasImageGenIntent(content: string): boolean {
  const t = content.trim();
  if (!t) return false;
  return WANTS_IMAGE_RE.test(t);
}

function cleanImagePrompt(raw: string, userName?: string, charName?: string): string {
  const legacyPrefix = ["你", "帮我", "给我", "请", "选择要", "选择了", "选择", "要"];
  if (userName && userName !== "你") legacyPrefix.unshift(userName);
  if (charName && charName !== "角色") legacyPrefix.unshift(charName);
  // legacy compat: 旧聊天记录 speaker 前缀可能含 legacy personal names
  legacyPrefix.push(LEGACY_USER, LEGACY_CHAR);
  const prefixRe = new RegExp(`^(${legacyPrefix.join("|")}|方案[A-Za-z0-9]+的?)+`, "gi");
  return raw
    .trim()
    .replace(/^[「『"'"\s]+|[」』"'"\s]+$/g, "")
    .replace(prefixRe, "")
    .trim();
}

const FALLBACK_PATTERNS: RegExp[] = [
  /(?:帮我|请|能不能|可以|麻烦)?(?:生成|画|绘制|做|来)(?:一张|一幅|一个|张)?[\s「『"'"]*([^」』"'\n]{2,800}?)[\s」』"'"]*(?:的)?(?:图|图片|插画|照片|画)/i,
  /(?:画给我|画出来|再画给)(?:吧|呀|呢|啊|嘛|呗|了)?[，。！？\s]*/i,
  /场景图片[：:]\s*([\s\S]{2,800})/i,
  /(?:的)?图片[：:]\s*([\s\S]{2,800})/i,
  /(?:选择(?:要|了)?[^：:\n]{0,48}[：:]\s*)([\s\S]{2,800})/i,
  /(?:draw|generate|create|make)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|illustration|photo)\s+(?:of\s+)?(.{2,800})/i,
];

/** 模型未输出标记时，从用户的消息兜底提取绘画描述 */
export function fallbackImagePromptFromUserMessage(content: string): string | null {
  const t = content.trim();
  if (!t) return null;

  for (const re of FALLBACK_PATTERNS) {
    const m = t.match(re);
    if (!m) continue;
    if (m[1]) {
      const p = cleanImagePrompt(m[1]);
      if (p.length >= 2) return p;
    }
    if (hasImageGenIntent(t)) return null;
  }

  if (hasImageGenIntent(t)) {
    const colonTail = t.match(/[：:]\s*([\s\S]{8,800})$/);
    if (colonTail?.[1]) {
      const p = cleanImagePrompt(colonTail[1]);
      if (p.length >= 8) return p;
    }
  }

  return null;
}

/** legacy compat: 剥掉旧聊天记录里的 speaker 前缀（legacy personal names 等） */
function stripSpeakerPrefix(text: string, names: string[] = [LEGACY_USER, LEGACY_CHAR]): string {
  for (const name of names) {
    if (!name) continue;
    const re = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[：:]\\s*`, "i");
    if (re.test(text)) return text.replace(re, "").trim();
  }
  return text.trim();
}

function extractSceneDescriptionFromAssistant(text: string, charName?: string): string {
  let t = stripSpeakerPrefix(text, charName ? [charName, LEGACY_USER, LEGACY_CHAR] : [LEGACY_USER, LEGACY_CHAR]);
  t = t.replace(/（[^）\n]*）/g, "\n").replace(/\([^)\n]*\)/g, "\n");
  const lines = t
    .split(/\n+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 10);
  const joined = lines.join(" ").replace(/\s+/g, " ").trim();
  if (joined.length < 20) return "";
  return joined.slice(0, 800);
}

/** 从角色本轮/近期正文抽出可作生图 prompt 的场景描写 */
export function imagePromptFromAssistantText(text: string, charName?: string): string | null {
  const prompt = extractSceneDescriptionFromAssistant(text, charName);
  if (prompt.length < 20) return null;
  const cleaned = cleanImagePrompt(prompt, undefined, charName);
  return cleaned.length >= 20 ? cleaned : prompt;
}

/** 用户说「画给我」但未给描述时，取上一条角色的场景描写作为 prompt */
export function fallbackImagePromptFromRecentAssistant(chatId: string): string | null {
  const chat = getChat(chatId);
  if (!chat) return null;

  let i = chat.messages.length - 1;
  while (i >= 0 && chat.messages[i].role === "user") i -= 1;

  for (; i >= 0; i -= 1) {
    const msg = chat.messages[i];
    if (msg.role !== "assistant") continue;
    const content = msg.content?.trim() || "";
    if (!content) continue;
    if (assistantRoleplayedImageWithoutMarker(content) && !msg.attachments?.length) continue;
    const prompt = imagePromptFromAssistantText(content, chat.characterName);
    if (prompt) return prompt;
  }

  return null;
}

export function assistantRoleplayedImageWithoutMarker(text: string): boolean {
  return ROLEPLAYED_IMAGE_RE.test(text);
}

/** 去掉模型在正文里「假装已出图 / 投射画面」的描写 */
export function stripRoleplayedImageArtifacts(text: string): string {
  return text
    .replace(/\n*（[^）\n]*(?:发来一张图|发来一张|生成.{0,8}图|渲染.{0,12}图|投射.{0,12}图|调出.{0,12}图)[^）\n]*）\n*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function resolveImageGenPrompt(
  assistantRaw: string,
  userContent: string
): { prompt: string | null; cleanAssistantText: string } {
  const { cleanText, prompt: markerPrompt } = stripImageGenMarker(assistantRaw);
  if (markerPrompt) {
    return { prompt: markerPrompt, cleanAssistantText: cleanText || "好，我去画。" };
  }
  const fallback = fallbackImagePromptFromUserMessage(userContent);
  return { prompt: fallback, cleanAssistantText: cleanText || assistantRaw.trim() };
}
