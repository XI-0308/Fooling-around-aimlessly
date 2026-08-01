import fs from "fs";
import path from "path";
import { PERSONA_DIR, ensureDataDir } from "../config.js";
import { ensurePersonaDirs } from "./store.js";

const STATE_PATH = path.join(PERSONA_DIR, "digest-state.json");

export interface PersonaDigestLastResult {
  at: string;
  wrote: number;
  reason?: string;
  source: "manual" | "scheduled";
}

export interface PersonaDigestState {
  lastRunAt: string | null;
  nextRunAt: string | null;
  lastResult?: PersonaDigestLastResult | null;
}

export function loadPersonaDigestState(): PersonaDigestState {
  ensureDataDir();
  ensurePersonaDirs();
  if (!fs.existsSync(STATE_PATH)) {
    return { lastRunAt: null, nextRunAt: null, lastResult: null };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) as PersonaDigestState;
    return {
      lastRunAt: raw.lastRunAt ?? null,
      nextRunAt: raw.nextRunAt ?? null,
      lastResult: raw.lastResult ?? null,
    };
  } catch {
    return { lastRunAt: null, nextRunAt: null, lastResult: null };
  }
}

export function savePersonaDigestState(state: PersonaDigestState): void {
  ensurePersonaDirs();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

/** 记录一次整理结果（立刻整理 / 夜间自动） */
export function recordPersonaDigestResult(input: {
  wrote: number;
  reason?: string;
  source: "manual" | "scheduled";
}): PersonaDigestLastResult {
  const state = loadPersonaDigestState();
  const at = new Date().toISOString();
  const lastResult: PersonaDigestLastResult = {
    at,
    wrote: input.wrote,
    reason: input.reason,
    source: input.source,
  };
  state.lastRunAt = at;
  state.lastResult = lastResult;
  savePersonaDigestState(state);
  return lastResult;
}
