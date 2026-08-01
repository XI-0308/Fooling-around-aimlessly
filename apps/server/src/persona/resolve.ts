import { tokenize } from "../memory/store.js";
import { loadSettings } from "../config.js";
import { loadAllPersonaEntries, loadPersonaCategory } from "./store.js";
import {
  PERSONA_CATEGORIES,
  type PersonaCategory,
  type PersonaEntry,
} from "./types.js";

const SOFT_PREFIXES = ["在你看来，", "你觉得，", "你认为，"] as const;

/** 对话关键词 → 优先检索的画像目录（可多选） */
const CATEGORY_HINTS: { category: PersonaCategory; keys: string[] }[] = [
  {
    category: "emotions",
    keys: ["累", "烦", "难过", "开心", "焦虑", "压力", "情绪", "心情", "哭", "郁闷", "委屈", "害怕", "紧张"],
  },
  {
    category: "behaviors",
    keys: ["习惯", "总是", "每次", "熬夜", "拖延", "工作", "加班", "逃避", "憋着", "忍不住"],
  },
  {
    category: "social",
    keys: ["同事", "朋友", "家人", "领导", "吵架", "关系", "讨厌他", "讨厌她", "暧昧", "分手", "人际"],
  },
  {
    category: "values",
    keys: ["应该", "原则", "值得", "不对", "公平", "道德", "底线", "无所谓", "介意"],
  },
  {
    category: "cognition",
    keys: ["分析", "逻辑", "想不通", "理性", "过度思考", "脑补", "钻牛角尖", "道理"],
  },
  {
    category: "motives",
    keys: ["怕", "恐惧", "想要", "渴望", "动机", "逃避", "控制", "认可", "被需要"],
  },
  {
    category: "expressions",
    keys: ["哈哈", "呵呵", "笑死", "随便", "没事", "口癖", "语气", "阴阳"],
  },
  {
    category: "traits",
    keys: ["性格", "脾气", "内向", "外向", "敏感", "倔", "拧", "温柔", "冷淡"],
  },
];

function tfIdfScore(
  queryTokens: string[],
  docTokens: string[],
  df: Map<string, number>,
  N: number
): number {
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

export function hintPersonaCategories(text: string): PersonaCategory[] {
  const hit = new Set<PersonaCategory>();
  for (const row of CATEGORY_HINTS) {
    if (row.keys.some((k) => text.includes(k))) hit.add(row.category);
  }
  return [...hit];
}

/**
 * 语义检索：相关目录内 TF-IDF，最多 2 条；不够相关则 NONE（空）。
 * 暂不做置信度打分体系。
 */
export function resolvePersonaForChat(
  scanText: string,
  queryText: string
): PersonaEntry[] {
  const settings = loadSettings();
  const threshold = settings.memoryScoreThreshold ?? 0.01;
  const all = loadAllPersonaEntries();
  if (all.length === 0) return [];

  const hinted = hintPersonaCategories(`${scanText}\n${queryText}`);
  let pool =
    hinted.length > 0
      ? hinted.flatMap((c) => loadPersonaCategory(c))
      : all;
  if (pool.length === 0) pool = all;

  const queryTokens = tokenize(`${queryText}\n${scanText}`.slice(-4000));
  if (queryTokens.length === 0) return [];

  const docs = pool.map((e) => ({
    entry: e,
    tokens: tokenize(`${e.content}\n${e.evidence}`),
  }));

  const df = new Map<string, number>();
  for (const d of docs) {
    for (const t of new Set(d.tokens)) {
      df.set(t, (df.get(t) || 0) + 1);
    }
  }

  const scored = docs
    .map((d) => ({
      entry: d.entry,
      score: tfIdfScore(queryTokens, d.tokens, df, docs.length),
    }))
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return [];
  const top = scored[0]!.score;
  // 顶尖也偏弱 → NONE（宁可空，也不硬塞）
  if (top < threshold * 1.5) return [];

  const picked: PersonaEntry[] = [];
  const seen = new Set<string>();
  for (const s of scored) {
    if (picked.length >= 2) break;
    if (seen.has(s.entry.id)) continue;
    seen.add(s.entry.id);
    picked.push(s.entry);
  }
  return picked;
}

/** 注入正文：仅条目内容 + 软归因前缀；不含证据与时间 */
export function formatPersonaInjection(entries: PersonaEntry[]): string {
  if (entries.length === 0) return "";
  return entries
    .map((e, i) => `${SOFT_PREFIXES[i % SOFT_PREFIXES.length]}${e.content.trim()}`)
    .filter((line) => line.length > SOFT_PREFIXES[0].length)
    .join("\n\n");
}

/** 同目录下找最相似旧条，供消化合并 */
export function findSimilarPersonaEntry(
  category: PersonaCategory,
  content: string,
  minScore = 0.08
): PersonaEntry | null {
  const list = loadPersonaCategory(category);
  if (list.length === 0) return null;
  const queryTokens = tokenize(content);
  if (queryTokens.length === 0) return null;
  const docs = list.map((e) => ({
    entry: e,
    tokens: tokenize(e.content),
  }));
  const df = new Map<string, number>();
  for (const d of docs) {
    for (const t of new Set(d.tokens)) df.set(t, (df.get(t) || 0) + 1);
  }
  let best: { entry: PersonaEntry; score: number } | null = null;
  for (const d of docs) {
    const score = tfIdfScore(queryTokens, d.tokens, df, docs.length);
    if (!best || score > best.score) best = { entry: d.entry, score };
  }
  if (!best || best.score < minScore) return null;
  return best.entry;
}

export function listPersonaCategories() {
  return PERSONA_CATEGORIES;
}
