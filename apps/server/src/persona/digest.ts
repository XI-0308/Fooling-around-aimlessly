import { deepseekComplete } from "../memory/summarizer.js";
import { listChats } from "../store/chats.js";
import { loadUserPersona } from "../store/userPersona.js";
import { getPrimaryCharacter } from "../store/characters.js";
import { stripEnrichBlocksFromDisplay } from "../tools/enrichMarkers.js";
import {
  ensurePersonaDirs,
  loadPersonaCategory,
  upsertPersonaEntry,
} from "./store.js";
import { findSimilarPersonaEntry } from "./resolve.js";
import {
  PERSONA_CATEGORIES,
  PERSONA_CATEGORY_LABELS,
  isPersonaCategory,
  type PersonaCategory,
} from "./types.js";

interface ParsedObservation {
  category: PersonaCategory;
  content: string;
  evidence: string;
  /** 若指向已有条目指针则合并到该条 */
  mergeWithId?: string;
}

export interface PersonaDigestResult {
  wrote: number;
  observations: ParsedObservation[];
  dialogueChars: number;
  reason?: string;
}

const LABEL_TO_CATEGORY = Object.fromEntries(
  PERSONA_CATEGORIES.map((id) => [PERSONA_CATEGORY_LABELS[id], id])
) as Record<string, PersonaCategory>;

function resolveCategory(raw: string): PersonaCategory | null {
  const t = raw.trim();
  if (isPersonaCategory(t)) return t;
  if (LABEL_TO_CATEGORY[t]) return LABEL_TO_CATEGORY[t];
  for (const id of PERSONA_CATEGORIES) {
    if (t.includes(id) || t.includes(PERSONA_CATEGORY_LABELS[id])) return id;
  }
  return null;
}

function speakerNames(): { userName: string; charName: string } {
  const persona = loadUserPersona();
  const character = getPrimaryCharacter();
  return {
    userName: persona.name?.trim() || "你",
    charName: character?.data?.name?.trim() || "角色",
  };
}

function collectRecentDialogue(sinceMs: number, maxChars = 14000): string {
  const { userName, charName } = speakerNames();
  const chats = listChats();
  const lines: string[] = [];
  for (const chat of chats) {
    for (const m of chat.messages) {
      if (m.role !== "user" && m.role !== "assistant") continue;
      const t = new Date(m.createdAt).getTime();
      if (Number.isNaN(t) || t < sinceMs) continue;
      const raw = stripEnrichBlocksFromDisplay(m.content || "").trim();
      if (!raw) continue;
      const who = m.role === "user" ? userName : charName;
      lines.push(`${who}: ${raw}`);
    }
  }
  const joined = lines.join("\n");
  return joined.length > maxChars ? joined.slice(-maxChars) : joined;
}

/** 立刻整理：只取全局最近 N 条消息（按时间），聚焦刚说过的性格线索 */
const MANUAL_DIGEST_MESSAGE_COUNT = 14;
/** 定时/手动每轮最多写入条数 */
const MAX_OBSERVATIONS_PER_RUN = 4;

function collectLatestMessages(limit = MANUAL_DIGEST_MESSAGE_COUNT): string {
  const { userName, charName } = speakerNames();
  type Row = { at: number; line: string };
  const rows: Row[] = [];
  for (const chat of listChats()) {
    for (const m of chat.messages) {
      if (m.role !== "user" && m.role !== "assistant") continue;
      const at = new Date(m.createdAt).getTime();
      if (Number.isNaN(at)) continue;
      const raw = stripEnrichBlocksFromDisplay(m.content || "").trim();
      if (!raw) continue;
      const who = m.role === "user" ? userName : charName;
      rows.push({ at, line: `${who}: ${raw}` });
    }
  }
  rows.sort((a, b) => a.at - b.at);
  return rows
    .slice(-Math.max(8, Math.min(20, limit)))
    .map((r) => r.line)
    .join("\n");
}

function extractJsonText(raw: string): string {
  const trimmed = raw.trim();
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();
  const brace = trimmed.match(/\{[\s\S]*\}/);
  if (brace) return brace[0];
  return trimmed;
}

function parseObservations(raw: string): ParsedObservation[] {
  const jsonText = extractJsonText(raw);
  try {
    const data = JSON.parse(jsonText) as
      | { observations?: Array<Record<string, unknown>> }
      | Array<Record<string, unknown>>;
    const list = Array.isArray(data) ? data : data.observations || [];
    const out: ParsedObservation[] = [];
    for (const row of list) {
      const cat = resolveCategory(String(row.category || ""));
      if (!cat) continue;
      const content = String(row.content || "").trim();
      const evidence = String(row.evidence || "").trim();
      if (!content) continue;
      const mergeRaw = String(row.mergeWithId || row.merge_with_id || "").trim();
      out.push({
        category: cat,
        content,
        evidence,
        mergeWithId: mergeRaw || undefined,
      });
      if (out.length >= MAX_OBSERVATIONS_PER_RUN) break;
    }
    return out;
  } catch {
    return [];
  }
}

function existingCatalogSnippet(): string {
  const parts: string[] = [];
  for (const cat of PERSONA_CATEGORIES) {
    const list = loadPersonaCategory(cat).slice(0, 16);
    if (list.length === 0) continue;
    parts.push(
      `【抽屉 · ${PERSONA_CATEGORY_LABELS[cat]} / ${cat}】\n` +
        list
          .map((e, i) => {
            const ev = e.evidence.trim() || "（暂无证据）";
            return `${i + 1}. id=${e.id}\n   条目：${e.content}\n   证据：${ev}`;
          })
          .join("\n")
    );
  }
  return parts.join("\n\n").slice(0, 9000) || "（库为空）";
}

/**
 * 从近期对话抽取人格画像观察；近似条目合并更新，不删除。
 * @param options.manual 立刻整理：只看最近若干条消息，聚焦刚暴露的性格点
 */
export async function digestPersonaPortrait(options?: {
  sinceMs?: number;
  manual?: boolean;
}): Promise<PersonaDigestResult> {
  ensurePersonaDirs();
  const manual = Boolean(options?.manual);
  const dialogue = manual
    ? collectLatestMessages(MANUAL_DIGEST_MESSAGE_COUNT)
    : collectRecentDialogue(
        options?.sinceMs ?? Date.now() - 36 * 60 * 60 * 1000
      );
  const dialogueChars = dialogue.trim().length;
  const minChars = manual ? 12 : 40;
  if (dialogueChars < minChars) {
    return {
      wrote: 0,
      observations: [],
      dialogueChars,
      reason: manual
        ? "最近几条消息太少，暂无法整理"
        : `近期可整理对话太少（不足约 ${minChars} 字）`,
    };
  }

  const catalog = existingCatalogSnippet();
  const catList = PERSONA_CATEGORIES.map(
    (c) => `${c}=${PERSONA_CATEGORY_LABELS[c]}`
  ).join("；");

  const { userName } = speakerNames();
  const emptyRule = manual
    ? `2. 本轮最多 ${MAX_OBSERVATIONS_PER_RUN} 条。下列片段是用户刚点「立刻整理」时圈定的最近几句：优先从中提炼性格特征；有线索就尽量写满不同抽屉（尤其是空抽屉），只有完全没有人格层面线索才 {"observations":[]}`
    : `2. 本轮最多 ${MAX_OBSERVATIONS_PER_RUN} 条。有稳定或重复出现的性格线索就写；优先补全仍为空或条目很少的抽屉；仅当对话几乎没有人格线索时才 {"observations":[]}`;

  const focusNote = manual
    ? `（本轮是「立刻整理」：资料仅为最近约 ${MANUAL_DIGEST_MESSAGE_COUNT} 条消息，请紧扣片段里暴露的性格点，不要发散到未出现的话题）`
    : "（本轮是夜间自动整理：可覆盖稍长窗口，尽量从对话里挖出可入库的人格线索）";

  const systemPrompt = `你是「人格画像整理器」，不是角色。根据用户与角色的近期对话，为用户「${userName}」提炼人格层面的稳定认识（不是单次事件流水账）。${focusNote}
每个分类是一个「抽屉」：抽屉里每条都是「条目（总结）+ 证据」成对存放。你整理前必须先读已有抽屉里的条目与证据，再决定新增、合并或写张力。
规则：
1. 只输出 JSON：{"observations":[{"category":"目录英文id","content":"画像认识一句到三句","evidence":"本轮新增对话证据摘录","mergeWithId":"可选，要合并的已有条目完整id"}]}
${emptyRule}
3. category 必须用英文 id：${catList}（不要用中文目录名）；同一轮尽量覆盖多个不同 category，不要全挤在一类
4. content 只写「${userName}是怎样的人」的概括，不要把「因为：…」写进 content（证据单独放 evidence）
5. 读旧证据：同义 → 改写更完整的 content，并填 mergeWithId，evidence 只写本轮新证（系统会追加旧证）；证据矛盾 → 可 content 写成「存在张力：…」并 mergeWithId，或新开一条；不要删除旧条
6. 可适度概括反复出现的习惯、偏好、沟通方式、情绪模式；仍须能在对话里找到对应证据，不要凭空编造；中文`;

  const raw = await deepseekComplete(
    [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: `已有画像抽屉（条目+证据，合并时请填 mergeWithId）：
${catalog}

${manual ? "立刻整理 · 最近几条消息（请紧扣）" : "近期对话"}：
${dialogue}`,
      },
    ],
    1400
  );

  const observations = parseObservations(raw);
  if (observations.length === 0) {
    console.warn(
      "[persona] 整理未产出条目。dialogueChars=",
      dialogueChars,
      "rawPreview=",
      raw.slice(0, 280)
    );
    return {
      wrote: 0,
      observations: [],
      dialogueChars,
      reason: raw.trim()
        ? "模型返回无结果（无可新增条目）"
        : "模型返回无结果",
    };
  }

  let wrote = 0;
  for (const obs of observations) {
    const byId =
      obs.mergeWithId &&
      loadPersonaCategory(obs.category).find((e) => e.id === obs.mergeWithId);
    const similar = byId || findSimilarPersonaEntry(obs.category, obs.content);
    upsertPersonaEntry(obs.category, obs.content, obs.evidence, similar?.id);
    wrote += 1;
  }
  console.log(
    `[persona] 整理写入 ${wrote} 条：`,
    observations.map((o) => o.category).join(", ")
  );
  return { wrote, observations, dialogueChars };
}
