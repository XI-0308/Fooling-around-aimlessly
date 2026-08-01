import { loadSettings } from "../config.js";
import { getEffectiveGeneration } from "../characterPreset.js";
import { completeRoleplayChat } from "../deepseek.js";
import { getChat } from "../store/chats.js";
import { getCharacter } from "../store/characters.js";
import { loadUserPersona } from "../store/userPersona.js";
import { stripUserVisibleText } from "../tools/enrichMarkers.js";
import { TOPICS_DIR } from "./types.js";
import {
  ensureCommentSection,
  ensureWhitelistDirs,
  getVaultRoot,
  sanitizeTopicFilename,
  writeNote,
  buildObsidianOpenUri,
} from "./vault.js";

function pickMessages(
  chatId: string,
  messageIds?: string[]
): { role: string; content: string }[] {
  const chat = getChat(chatId);
  if (!chat) throw new Error("聊天不存在");
  const idSet = messageIds?.length ? new Set(messageIds) : null;
  const msgs = chat.messages.filter((m) => m.role === "user" || m.role === "assistant");
  const selected = idSet ? msgs.filter((m) => idSet.has(m.id)) : msgs.slice(-12);
  return selected.map((m) => ({
    role: m.role,
    content: stripUserVisibleText(m.content).trim().slice(0, 2000),
  }));
}

export async function previewObsidianSettle(
  chatId: string,
  messageIds?: string[]
): Promise<{ title: string; summary: string; sourceLinks: string[] }> {
  const settings = loadSettings();
  if (!settings.deepseekApiKey?.trim()) throw new Error("未配置 DeepSeek API Key");
  const chat = getChat(chatId);
  if (!chat) throw new Error("聊天不存在");
  const character = getCharacter(chat.characterId);
  if (!character) throw new Error("角色不存在");
  const genSettings = getEffectiveGeneration(character, settings);
  const userName = loadUserPersona().name?.trim() || "你";
  const charName = character.data.name?.trim() || "角色";

  const turns = pickMessages(chatId, messageIds);
  if (turns.length === 0) throw new Error("没有可沉淀的消息");

  const transcript = turns
    .map((t) => `${t.role === "user" ? userName : charName}：${t.content}`)
    .join("\n\n")
    .slice(0, 12000);

  const links = [
    ...new Set(
      [...transcript.matchAll(/https?:\/\/[^\s<>"{}|\\^`[\]]+/gi)].map((m) =>
        m[0].replace(/[),.;!?，。！？]+$/g, "")
      )
    ),
  ].slice(0, 8);

  const { content } = await completeRoleplayChat(
    settings.deepseekApiKey,
    [
      {
        role: "system",
        content:
          `你在整理「${userName}」与「${charName}」的一段讨论，准备写入个人知识库。\n` +
          `输出一个 JSON（不要其它文字）：{"title":"短标题","summary":"markdown 摘要，含要点与未决问题"}\n` +
          `摘要用中文，第三人称或中性口吻均可；保留关键链接与论点；不要写成聊天口气。`,
      },
      { role: "user", content: transcript },
    ],
    { ...genSettings, deepseekThinking: "disabled", temperature: 0.3 },
    1200
  );

  const raw = (content || "").trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  let title = `讨论沉淀 ${new Date().toISOString().slice(0, 10)}`;
  let summary = raw;
  if (start >= 0 && end > start) {
    try {
      const obj = JSON.parse(raw.slice(start, end + 1)) as {
        title?: string;
        summary?: string;
      };
      if (obj.title?.trim()) title = obj.title.trim().slice(0, 80);
      if (obj.summary?.trim()) summary = obj.summary.trim();
    } catch {
      /* keep raw */
    }
  }
  return { title, summary, sourceLinks: links };
}

export async function settleToObsidian(
  chatId: string,
  opts: {
    title: string;
    summary: string;
    sourceLinks?: string[];
    messageIds?: string[];
    efSu?: boolean;
  }
): Promise<{ relPath: string; openUri: string | null }> {
  const settings = loadSettings();
  if (!settings.obsidianEnabled) throw new Error("请先在设置中启用 Obsidian");
  if (!getVaultRoot()) throw new Error("vault 路径无效");

  ensureWhitelistDirs();
  const chat = getChat(chatId);
  const character = chat ? getCharacter(chat.characterId) : null;
  const charName = character?.data.name?.trim() || chat?.characterName?.trim() || "角色";
  const title = opts.title.trim() || "未命名话题";
  const fileBase = sanitizeTopicFilename(title);
  const relPath = `${TOPICS_DIR}/${fileBase}.md`;

  const linkBlock =
    opts.sourceLinks && opts.sourceLinks.length > 0
      ? `\n## 来源链接\n\n${opts.sourceLinks.map((u) => `- ${u}`).join("\n")}\n`
      : "";

  const efComment = opts.efSu !== false;
  const fm =
    `---\n` +
    `ef_comment: ${efComment ? "true" : "false"}\n` +
    `ef_source: chat\n` +
    `ef_chat_id: ${chatId}\n` +
    `ef_settled_at: ${new Date().toISOString()}\n` +
    `---\n\n`;

  let body =
    fm +
    `# ${title}\n\n` +
    `## 讨论摘要\n\n${opts.summary.trim()}\n` +
    linkBlock;

  body = ensureCommentSection(body, charName);
  writeNote(relPath, body);

  return { relPath, openUri: buildObsidianOpenUri(relPath) };
}
