import type { ChatMessage } from "../store/chats.js";
import type { WorldInfoBook, WorldInfoEntry, WiPosition } from "./types.js";
import { matchTriggerKey } from "../triggerMatch.js";
import { buildPromptScanText, type PromptScanContext } from "../promptScan.js";

export type WiScanContext = PromptScanContext;

export interface ActivatedEntry {
  entry: WorldInfoEntry;
  via: "constant" | "keyword" | "recursive";
}

export interface WiInjectionResult {
  /** 按插入位置分组的内容 */
  byPosition: Partial<Record<WiPosition, string[]>>;
  /** @D 深度注入 */
  atDepth: { depth: number; role: WorldInfoEntry["depthRole"]; content: string }[];
  activated: ActivatedEntry[];
  tokensUsed: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

function matchKey(key: string, haystack: string, caseSensitive: boolean): boolean {
  return matchTriggerKey(key, haystack, caseSensitive);
}

function countKeyMatches(keys: string[], text: string, caseSensitive: boolean): number {
  return keys.filter((k) => matchKey(k, text, caseSensitive)).length;
}

function passesSelectiveLogic(
  entry: WorldInfoEntry,
  text: string,
  caseSensitive: boolean
): boolean {
  const primaryHit = entry.keys.some((k) => matchKey(k, text, caseSensitive));
  if (entry.constant) return true;
  if (!primaryHit) return false;
  if (entry.secondaryKeys.length === 0) return true;

  const secMatches = entry.secondaryKeys.filter((k) => matchKey(k, text, caseSensitive));
  switch (entry.selectiveLogic) {
    case "and_any":
      return secMatches.length >= 1;
    case "and_all":
      return secMatches.length === entry.secondaryKeys.length;
    case "not_any":
      return secMatches.length === 0;
    case "not_all":
      return secMatches.length < entry.secondaryKeys.length;
    default:
      return true;
  }
}

function buildScanText(ctx: WiScanContext, scanDepth: number): string {
  return buildPromptScanText(ctx, scanDepth);
}

function rollProbability(probability: number): boolean {
  if (probability >= 100) return true;
  if (probability <= 0) return false;
  return Math.random() * 100 < probability;
}

function tryActivateEntry(
  entry: WorldInfoEntry,
  scanText: string,
  book: WorldInfoBook,
  via: ActivatedEntry["via"]
): boolean {
  if (!entry.enabled) return false;
  if (!rollProbability(entry.probability)) return false;
  if (entry.constant) return true;
  return passesSelectiveLogic(entry, scanText, book.caseSensitive);
}

export function evaluateWorldInfo(book: WorldInfoBook, ctx: WiScanContext): WiInjectionResult {
  const activatedMap = new Map<string, ActivatedEntry>();
  const injectedForRecursion: string[] = [];

  const globalDepth = book.scanDepth;

  function scanRound(injectedTexts: string[], via: ActivatedEntry["via"]) {
    for (const entry of book.entries) {
      if (activatedMap.has(entry.id)) continue;
      const depth = entry.scanDepth > 0 ? entry.scanDepth : globalDepth;
      const scanText = buildScanText({ ...ctx, injectedTexts }, depth);
      if (tryActivateEntry(entry, scanText, book, via)) {
        activatedMap.set(entry.id, { entry, via });
        injectedForRecursion.push(entry.content);
      }
    }
  }

  scanRound([], "keyword");

  for (const entry of book.entries) {
    if (entry.constant && entry.enabled && !activatedMap.has(entry.id)) {
      if (rollProbability(entry.probability)) {
        activatedMap.set(entry.id, { entry, via: "constant" });
        injectedForRecursion.push(entry.content);
      }
    }
  }

  if (book.recursiveScanning) {
    let round = 0;
    let prevSize = 0;
    while (round < book.recursionLimit) {
      const batch = injectedForRecursion.slice(prevSize);
      if (batch.length === 0) break;
      prevSize = injectedForRecursion.length;
      scanRound(injectedForRecursion, "recursive");
      round++;
    }
  }

  const activated = [...activatedMap.values()].sort(
    (a, b) => a.entry.order - b.entry.order
  );

  const byPosition: Partial<Record<WiPosition, string[]>> = {};
  const atDepth: WiInjectionResult["atDepth"] = [];
  let tokensUsed = 0;

  for (const { entry } of activated) {
    const t = estimateTokens(entry.content);
    if (tokensUsed + t > book.tokenBudget) break;
    tokensUsed += t;

    if (entry.position === "at_depth") {
      atDepth.push({
        depth: entry.depth,
        role: entry.depthRole,
        content: entry.content,
      });
    } else {
      if (!byPosition[entry.position]) byPosition[entry.position] = [];
      byPosition[entry.position]!.push(entry.content);
    }
  }

  return { byPosition, atDepth, activated, tokensUsed };
}

export function formatWiBlock(entries: string[]): string {
  return entries.filter(Boolean).join("\n\n");
}
