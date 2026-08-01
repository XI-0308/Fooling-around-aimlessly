/** 用户消息上主动引用的记忆（发送时选定，prompt 扩写用） */
export interface MemoryCitation {
  chunkId: string;
  /** 引用时的记忆快照 */
  text: string;
}

/** 引用记忆在聊天历史中的标记行 */
export function formatMemoryCitationLine(text: string): string {
  return `*引用了一条系统存储记录：${text.trim()}*`;
}

/** 将引用记忆合并进单条用户消息正文（仍是一条，换行分隔） */
export function expandUserMessageForPrompt(
  content: string,
  _userName: string,
  citation?: MemoryCitation
): string {
  if (!citation?.text?.trim()) return content;
  const citeLine = formatMemoryCitationLine(citation.text);
  const body = content.trim();
  if (!body) return citeLine;
  return `${body}\n${citeLine}`;
}
