import type { InvisibleAgentOutcome } from "./types.js";

const outcomes = new Map<string, InvisibleAgentOutcome>();

export function setInvisibleOutcome(chatId: string, outcome: InvisibleAgentOutcome): void {
  outcomes.set(chatId, outcome);
}

export function getInvisibleOutcome(chatId: string): InvisibleAgentOutcome | null {
  return outcomes.get(chatId) ?? null;
}

export function takeInvisibleOutcome(chatId: string): InvisibleAgentOutcome | null {
  const v = outcomes.get(chatId) ?? null;
  outcomes.delete(chatId);
  return v;
}

export function clearInvisibleOutcome(chatId: string): void {
  outcomes.delete(chatId);
}

/** 组进 RP 的 system 注入（不 take，generateReply 只读） */
export function peekInvisibleInjections(chatId: string): {
  systemInjections: string[];
  toolSummaryForPrompt: string;
  outcome: InvisibleAgentOutcome | null;
} {
  const outcome = outcomes.get(chatId) ?? null;
  if (!outcome) {
    return { systemInjections: [], toolSummaryForPrompt: "", outcome: null };
  }
  return {
    systemInjections: outcome.systemInjections,
    toolSummaryForPrompt: outcome.toolSummaryForPrompt,
    outcome,
  };
}
