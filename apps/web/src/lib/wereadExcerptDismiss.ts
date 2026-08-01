const KEY_PREFIX = "ef-weread-excerpt-dismiss:";

export function getDismissedExcerptMessageIds(chatId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${chatId}`);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as unknown;
    return new Set(Array.isArray(arr) ? arr.filter((id): id is string => typeof id === "string") : []);
  } catch {
    return new Set();
  }
}

export function dismissExcerptMessages(chatId: string, messageIds: string[]): void {
  if (typeof window === "undefined" || messageIds.length === 0) return;
  const set = getDismissedExcerptMessageIds(chatId);
  for (const id of messageIds) set.add(id);
  localStorage.setItem(`${KEY_PREFIX}${chatId}`, JSON.stringify([...set]));
}
