import type { TurnToolPlan } from "./types.js";

const plans = new Map<string, TurnToolPlan>();

export function clearTurnToolPlan(chatId: string): void {
  plans.delete(chatId);
}

export function getTurnToolPlan(chatId: string): TurnToolPlan | null {
  return plans.get(chatId) ?? null;
}

export function setTurnToolPlan(chatId: string, plan: TurnToolPlan): void {
  plans.set(chatId, plan);
}

export function ensureTurnToolPlan(chatId: string): TurnToolPlan {
  const existing = plans.get(chatId);
  if (existing) return existing;
  const fresh: TurnToolPlan = {
    musicQuery: null,
    wantsVoice: false,
    imagePrompt: null,
    shareImageSource: null,
    keepDone: false,
  };
  plans.set(chatId, fresh);
  return fresh;
}

export function takeTurnToolPlan(chatId: string): TurnToolPlan | null {
  const v = plans.get(chatId) ?? null;
  plans.delete(chatId);
  return v;
}
