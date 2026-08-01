import { loadMemoryChunks, tokenize, type MemoryChunk } from "./store.js";
import { selectMemoriesWithDeepSeek } from "./summarizer.js";
import { loadSettings } from "../config.js";
import { isMemoryInScope } from "./triggers.js";
import { feedbackHintsForQuery } from "./feedback.js";

function tfIdfScore(queryTokens: string[], docTokens: string[], df: Map<string, number>, N: number): number {
  if (queryTokens.length === 0 || docTokens.length === 0) return 0;
  const tf = new Map<string, number>();
  for (const t of docTokens) tf.set(t, (tf.get(t) || 0) + 1);
  let score = 0;
  for (const qt of queryTokens) {
    const termFreq = tf.get(qt) || 0;
    if (termFreq === 0) continue;
    const docFreq = df.get(qt) || 1;
    const idf = Math.log((N + 1) / (docFreq + 1)) + 1;
    score += (termFreq / docTokens.length) * idf;
  }
  return score;
}

export async function retrieveMemories(
  queryText: string,
  chatId?: string,
  maxPick?: number
): Promise<MemoryChunk[]> {
  const settings = loadSettings();
  const all = loadMemoryChunks();
  if (all.length === 0) return [];

  const pickLimit = Math.max(
    1,
    maxPick ?? settings.memoryProactiveRetrieveMax ?? 1
  );

  const scoped = all.filter(
    (c) =>
      isMemoryInScope(c, chatId) &&
      c.sourceType !== "leann" &&
      !c.constant &&
      (c.keys?.length ?? 0) === 0
  );

  const queryTokens = tokenize(queryText);
  const df = new Map<string, number>();
  for (const c of scoped) {
    for (const t of new Set(c.tokens)) {
      df.set(t, (df.get(t) || 0) + 1);
    }
  }

  const hints = feedbackHintsForQuery(queryText);
  for (const [chunkId, hint] of hints) {
    if (hint.multiplier === 0) {
      console.log(`[memory-feedback] 排除 chunk=${chunkId.slice(0, 8)}… (${hint.reason})`);
    }
  }

  const scored = scoped
    .map((c) => {
      const base = tfIdfScore(queryTokens, c.tokens, df, scoped.length);
      const hint = hints.get(c.id);
      if (hint && hint.multiplier === 0) {
        return { chunk: c, score: 0, excluded: true as const };
      }
      const mult = hint?.multiplier ?? 1;
      return { chunk: c, score: base * mult, excluded: false as const };
    })
    .filter((s) => !s.excluded && s.score >= settings.memoryScoreThreshold)
    .sort((a, b) => b.score - a.score);

  const topN = scored.slice(0, Math.max(pickLimit * 3, settings.memoryRetrieveCount * 3));

  if (topN.length === 0) return [];

  const topScore = topN[0]?.score ?? 0;
  if (topScore < settings.memoryScoreThreshold * 1.5) return [];

  const candidates = topN.map((s) => ({ id: s.chunk.id, text: s.chunk.text }));

  let selectedIds: string[];
  try {
    selectedIds = await selectMemoriesWithDeepSeek(queryText, candidates, pickLimit);
  } catch {
    selectedIds =
      topScore >= settings.memoryScoreThreshold * 2
        ? candidates.slice(0, pickLimit).map((c) => c.id)
        : [];
  }

  if (selectedIds.length === 0) return [];
  const idSet = new Set(selectedIds);
  return scoped.filter((c) => idSet.has(c.id));
}

export function formatMemoryInjection(
  chunks: MemoryChunk[],
  template: string
): string {
  const body = chunks.map((c) => c.text).join("\n");
  return template.replace(/\{\{memories\}\}/g, body).replace(/\{\{text\}\}/g, body);
}
