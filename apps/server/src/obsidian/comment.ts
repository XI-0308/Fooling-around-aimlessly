import { LEGACY_CHAR_THOUGHT_LINE_RE } from "../text/legacyNames.js";
import { loadSettings } from "../config.js";
import { getEffectiveGeneration, getPromptSlotLabel, normalizePreset } from "../characterPreset.js";
import type { PromptSlot } from "../characterPreset.js";
import { completeRoleplayChat } from "../deepseek.js";
import { expandPromptMacros } from "../promptMacros.js";
import { getPrimaryCharacter } from "../store/characters.js";
import type { StoredCharacter } from "../store/characters.js";
import { loadUserPersona } from "../store/userPersona.js";
import {
  commentSectionHeading,
  DEFAULT_CHAR_NAME,
  DEFAULT_USER_NAME,
  findCommentSectionIndex,
} from "./types.js";
import { parseCommentThread, thoughtLabel } from "./vault.js";

/** 慢思考留言：读角色卡这三段（与聊天预设槽位一致） */
const IDENTITY_SLOT_IDS = ["description", "user_description", "personality"] as const;

export const DEFAULT_OBSIDIAN_PROMPT = `[慢思考留言 · 仅本轮]
你正在给 {{user}} 的个人知识库笔记留一句慢思考灵感。
要求：
1. 2–5 句即可，像便签留言，不要长文、不要列大纲
2. 给一点新角度或轻轻追问即可；不强迫她马上回复，不催促
3. 不要提 Obsidian、工具、系统、AI、提示词
4. 不要假装你已替她做完调研；只基于笔记与已有往来
5. 只输出留言正文，不要标题、不要「{{char}}：」或「角色的思考：」前缀、不要 markdown 一级标题
6. 若已有用户/角色的思考往来，请接上话，不要重复说过的点`;

function substitute(text: string, charName: string, userName: string): string {
  return text
    .replace(/\{\{char\}\}/g, charName)
    .replace(/\{\{user\}\}/g, userName)
    .replace(/<BOT>/g, charName)
    .replace(/<USER>/g, userName);
}

function wrapWithContent(template: string, content: string, charName: string, userName: string): string {
  const tpl = template.replace(/\{\{char\}\}/g, charName).replace(/\{\{user\}\}/g, userName);
  return tpl.replace(/\{\{content\}\}/g, content);
}

function isDirectTemplate(template?: string): boolean {
  const t = template?.trim();
  return Boolean(t && !t.includes("{{content}}"));
}

function renderIdentitySlot(
  slot: PromptSlot,
  fieldText: string,
  charName: string,
  userName: string
): string | null {
  const tpl = slot.template?.trim() ?? "";
  const macroCtx = { charName, userName, chatMessages: [] };
  const field = expandPromptMacros(substitute(fieldText.trim(), charName, userName), macroCtx);
  if (isDirectTemplate(tpl)) {
    return expandPromptMacros(substitute(tpl, charName, userName), macroCtx);
  }
  if (!field) return null;
  if (tpl.includes("{{content}}")) {
    return expandPromptMacros(wrapWithContent(tpl, field, charName, userName), macroCtx);
  }
  return field;
}

/** 取出【关于你自己】【关于用户】【相处方式】对应槽位正文 */
export function buildObsidianIdentityBlocks(
  character: StoredCharacter,
  userName: string,
  userDescription: string
): { label: string; content: string }[] {
  const preset = normalizePreset(character.preset);
  const d = character.data;
  const charName = d.name?.trim() || DEFAULT_CHAR_NAME;
  const fieldById: Record<(typeof IDENTITY_SLOT_IDS)[number], string> = {
    description: d.description || "",
    user_description: userDescription || "",
    personality: d.personality || "",
  };
  const blocks: { label: string; content: string }[] = [];
  for (const id of IDENTITY_SLOT_IDS) {
    const slot = preset.promptOrder.find((s) => s.id === id);
    if (!slot || slot.enabled === false) continue;
    const content = renderIdentitySlot(slot, fieldById[id], charName, userName);
    if (!content?.trim()) continue;
    blocks.push({ label: getPromptSlotLabel(slot), content: content.trim() });
  }
  return blocks;
}

function parseFrontmatterLocal(raw: string): { body: string } {
  if (!raw.startsWith("---\n") && !raw.startsWith("---\r\n")) return { body: raw };
  const end = raw.indexOf("\n---", 3);
  if (end < 0) return { body: raw };
  return { body: raw.slice(end + 4).replace(/^\r?\n/, "") };
}

function stripCommentSection(content: string, charName?: string): string {
  const idx = findCommentSectionIndex(content);
  if (idx < 0) return content.trim();
  return content.slice(0, idx).trim();
}

function formatThreadForPrompt(content: string, userName: string, charName: string): string {
  const thread = parseCommentThread(content);
  if (thread.length === 0) return "";
  return thread
    .map((m) => {
      const who = thoughtLabel(m.role, userName, charName);
      const when = m.at || m.date;
      const day = when ? `（${when}）` : "";
      return `${who}${day}：\n${m.text}`;
    })
    .join("\n\n");
}

/** 生成角色对笔记的短留言（灵感式，不强求回复） */
export async function generateSuCommentForNote(opts: {
  title: string;
  content: string;
}): Promise<string> {
  const settings = loadSettings();
  if (!settings.deepseekApiKey?.trim()) {
    throw new Error("未配置 DeepSeek API Key");
  }
  const character = getPrimaryCharacter();
  if (!character) throw new Error("没有可用角色");
  const charName = character.data?.name?.trim() || DEFAULT_CHAR_NAME;
  const persona = loadUserPersona();
  const userName = persona.name?.trim() || DEFAULT_USER_NAME;
  const genSettings = getEffectiveGeneration(character, settings);

  const identity = buildObsidianIdentityBlocks(character, userName, persona.description || "");
  const identityText = identity.map((b) => b.content).join("\n\n");

  const promptTemplate = settings.obsidianPrompt?.trim() || DEFAULT_OBSIDIAN_PROMPT;
  const taskPrompt = expandPromptMacros(substitute(promptTemplate, charName, userName), {
    charName,
    userName,
    chatMessages: [],
  });

  const { body } = parseFrontmatterLocal(opts.content);
  const main = stripCommentSection(body, charName).slice(0, 8000);
  const threadText = formatThreadForPrompt(opts.content, userName, charName).slice(0, 6000);

  const systemParts = [
    `你是「${charName}」。以下是关于你自己、关于${userName}、以及相处方式的设定，请完整内化后再留言。`,
    identityText || `（角色卡身份段为空，仍以「${charName}」身份留言）`,
    taskPrompt,
  ].filter(Boolean);

  const user =
    `笔记标题：${opts.title}\n\n` +
    `笔记正文：\n${main || "（几乎是空白，可以轻轻邀请她写下此刻的想法）"}` +
    (threadText ? `\n\n已有慢思考往来：\n${threadText}` : "");

  const { content } = await completeRoleplayChat(
    settings.deepseekApiKey,
    [
      { role: "system", content: systemParts.join("\n\n") },
      { role: "user", content: user },
    ],
    {
      ...genSettings,
      deepseekThinking: "disabled",
      temperature: Math.min(1, (genSettings.temperature ?? 0.8) + 0.05),
    },
    800
  );
  return (content || "")
    .trim()
    // legacy compat: 旧模型输出可能带 legacy char 思考前缀
    .replace(LEGACY_CHAR_THOUGHT_LINE_RE, "")
    .replace(new RegExp(`^${charName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[：:]\\s*`, "u"), "");
}
