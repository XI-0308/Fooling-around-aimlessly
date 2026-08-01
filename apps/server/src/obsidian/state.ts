import fs from "fs";
import path from "path";
import { DATA_DIR, ensureDataDir } from "../config.js";
import type { ObsidianRunState, RecentCommentEntry } from "./types.js";

const STATE_PATH = path.join(DATA_DIR, "obsidian-state.json");
const MAX_RECENT = 40;

export function loadObsidianState(): ObsidianRunState {
  ensureDataDir();
  if (!fs.existsSync(STATE_PATH)) {
    return { lastRunAt: null, nextRunAt: null, recentComments: [] };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, "utf-8")) as ObsidianRunState;
    return {
      lastRunAt: raw.lastRunAt ?? null,
      nextRunAt: raw.nextRunAt ?? null,
      recentComments: Array.isArray(raw.recentComments) ? raw.recentComments : [],
    };
  } catch {
    return { lastRunAt: null, nextRunAt: null, recentComments: [] };
  }
}

export function saveObsidianState(state: ObsidianRunState): void {
  ensureDataDir();
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

export function pushRecentComment(entry: RecentCommentEntry): void {
  const state = loadObsidianState();
  state.recentComments = [entry, ...state.recentComments.filter((e) => e.relPath !== entry.relPath)].slice(
    0,
    MAX_RECENT
  );
  saveObsidianState(state);
}
