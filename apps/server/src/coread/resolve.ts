import { loadSettings } from "../config.js";
import { tokenize } from "../memory/store.js";
import { deepseekComplete } from "../memory/summarizer.js";
import { findCoreadBooksByScan, type CoreadDiscussion } from "./store.js";

export interface CoreadPickResult {
  bookTitle: string;
  discussion: CoreadDiscussion;
}

function coreadDisplayTitle(title: string): string {
  const t = title.trim();
  const m = t.match(/^《(.+)》$/);
  return (m?.[1] || t).trim() || t;
}

function scoreDiscussion(queryText: string, d: CoreadDiscussion): number {
  const queryTokens = tokenize(queryText);
  if (queryTokens.length === 0) return 0;
  const docTokens = tokenize(`${d.claim}\n${d.text}`);
  if (docTokens.length === 0) return 0;
  const docSet = new Set(docTokens);
  let hit = 0;
  for (const t of queryTokens) {
    if (docSet.has(t)) hit += 1;
  }
  return hit / queryTokens.length;
}

/** 书名已命中时的回退：按对话词重合挑最相关论点，否则取最近更新 */
function pickDiscussionFallback(
  queryText: string,
  discussions: CoreadDiscussion[]
): CoreadDiscussion | null {
  if (discussions.length === 0) return null;
  let best: CoreadDiscussion | null = null;
  let bestScore = 0;
  for (const d of discussions) {
    const score = scoreDiscussion(queryText, d);
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  if (best && bestScore > 0) return best;
  return [...discussions].sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )[0];
}

function parsePick(
  raw: string,
  discussions: CoreadDiscussion[]
): CoreadDiscussion | null {
  const trimmed = raw.trim();
  if (!trimmed || /^NONE\b/i.test(trimmed)) return null;

  for (const d of discussions) {
    if (trimmed.includes(d.id)) return d;
  }

  const idx = Number(trimmed.match(/\d+/)?.[0]);
  if (!Number.isNaN(idx) && idx >= 0 && idx < discussions.length) {
    return discussions[idx]!;
  }
  return null;
}

/** 书名开门 → 挑 1 条最有用论点；筛选失败时回退，避免书名命中却整段丢失 */
export async function resolveCoreadDiscussionForChat(
  scanText: string,
  queryText: string,
  caseSensitive: boolean
): Promise<CoreadPickResult | null> {
  const books = findCoreadBooksByScan(scanText, caseSensitive);
  if (books.length === 0) return null;

  // 一书一卡承诺；若多张命中，取讨论最多的一张
  const book = [...books].sort((a, b) => b.discussions.length - a.discussions.length)[0]!;
  if (!book.discussions.length) return null;

  const settings = loadSettings();
  const maxClaimChars = 200;
  const list = book.discussions
    .map((d, i) => `[${i}] id=${d.id}\n论点：${d.claim}\n${d.text.slice(0, maxClaimChars)}`)
    .join("\n\n");

  const displayTitle = coreadDisplayTitle(book.title);
  const selectPrompt =
    settings.coreadSelectPrompt?.trim() ||
    `你是「共读讨论检索器」。用户对话已提到本书，请从本书讨论论点中选出最有助于回复的 1 条。
规则：
1. 最多选 1 条，只返回该条 id（或序号）
2. 用户提到书名、共读或书中意象时，应选出最能承接的论点，不要轻易 NONE
3. 仅当对话与本书完全无关时才返回 NONE
4. 不要输出解释`;

  let picked: CoreadDiscussion | null = null;
  try {
    const content = await deepseekComplete(
      [
        { role: "system", content: selectPrompt },
        {
          role: "user",
          content: `书名：${displayTitle}
对话上下文：
${queryText.slice(0, 2000)}

候选论点：
${list}`,
        },
      ],
      256
    );
    picked = parsePick(content, book.discussions);
    if (!picked) {
      console.warn(
        `[coread] 书名命中《${displayTitle}》但筛选无结果，回退。raw=`,
        JSON.stringify(content.trim().slice(0, 120))
      );
    }
  } catch (err) {
    console.warn(
      `[coread] 筛选调用失败，回退：`,
      err instanceof Error ? err.message : err
    );
  }

  if (!picked) {
    picked = pickDiscussionFallback(queryText, book.discussions);
  }
  if (!picked) return null;
  return { bookTitle: book.title, discussion: picked };
}

export function formatCoreadForInjection(pick: CoreadPickResult, template?: string): string {
  const tpl =
    template?.trim() ||
    `【共读讨论 · 《{{title}}》】\n{{claim}}`;
  const title = coreadDisplayTitle(pick.bookTitle);
  return tpl
    .replace(/\{\{title\}\}/g, title)
    .replace(/\{\{claim\}\}/g, pick.discussion.text)
    .replace(/\{\{text\}\}/g, pick.discussion.text);
}
