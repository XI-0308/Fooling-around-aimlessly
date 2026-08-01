/** 0 或负数表示「不限制」 */
export function isUnlimited(n: number): boolean {
  return !Number.isFinite(n) || n <= 0;
}

/** API max_tokens：不限制时不发送该字段 */
export function apiMaxTokens(maxTokens: number): number | undefined {
  return isUnlimited(maxTokens) ? undefined : maxTokens;
}

/** 聊天历史 TOKEN 预算（仅限制聊天历史，与系统板块 / 最长回复无关） */
export function chatHistoryTokenBudget(chatHistoryLimit: number): number {
  if (isUnlimited(chatHistoryLimit)) return Number.POSITIVE_INFINITY;
  return Math.max(0, chatHistoryLimit);
}

/** @deprecated 旧逻辑：整段上下文 − 回复预留。现聊天历史与系统板块分开计费。 */
export function inputTokenBudget(maxContext: number, maxTokens: number): number {
  if (isUnlimited(maxContext)) return Number.POSITIVE_INFINITY;
  const reserve = isUnlimited(maxTokens) ? 0 : maxTokens;
  return Math.max(0, maxContext - reserve);
}

export function formatTokenLimit(n: number): string {
  return isUnlimited(n) ? "不限制" : String(n);
}
