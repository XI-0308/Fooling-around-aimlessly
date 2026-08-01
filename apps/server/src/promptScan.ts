import type { ChatMessage } from "./store/chats.js";
import type { CharacterData } from "./characterCard.js";

export interface PromptScanContext {
  chatMessages: ChatMessage[];
  character?: CharacterData;
  userName?: string;
  userDescription?: string;
  injectedTexts?: string[];
}

/** 构建用于世界书 / 记忆触发的扫描文本（含角色与用户侧信息） */
export function buildPromptScanText(ctx: PromptScanContext, scanDepth: number): string {
  const parts: string[] = [];
  if (ctx.userName?.trim()) parts.push(ctx.userName.trim());
  if (ctx.userDescription?.trim()) parts.push(ctx.userDescription.trim());
  if (ctx.character) {
    parts.push(ctx.character.name, ctx.character.description, ctx.character.personality, ctx.character.scenario);
  }
  const msgs = ctx.chatMessages.slice(-scanDepth);
  for (const m of msgs) {
    parts.push(m.content);
  }
  if (ctx.injectedTexts?.length) {
    parts.push(...ctx.injectedTexts);
  }
  return parts.filter(Boolean).join("\n");
}
