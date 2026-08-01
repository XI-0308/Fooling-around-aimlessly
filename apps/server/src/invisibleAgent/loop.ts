import { decideInvisibleTools } from "./decide.js";
import { executeInvisibleCalls } from "./execute.js";
import { buildInjectionsFromResults } from "./inject.js";
import { clearInvisibleOutcome, setInvisibleOutcome } from "./state.js";
import type { InvisibleAgentOutcome, InvisibleMode } from "./types.js";

/**
 * Invisible Agent 主回路：decide → execute → inject（写入 state，供 generateReply / heartbeat 读取）
 * 副作用工具只写入 TurnToolPlan，仍由 followUp 在 RP 后执行。
 */
export async function runInvisibleAgentBeforeReply(
  chatId: string,
  mode: InvisibleMode = "chat"
): Promise<InvisibleAgentOutcome> {
  clearInvisibleOutcome(chatId);
  const { calls, decidedBy } = await decideInvisibleTools(chatId, mode);
  const { results } = await executeInvisibleCalls(chatId, mode, calls);
  const { systemInjections, toolSummaryForPrompt } = buildInjectionsFromResults(results);

  const outcome: InvisibleAgentOutcome = {
    mode,
    calls,
    results,
    systemInjections,
    toolSummaryForPrompt,
    decidedBy,
  };
  setInvisibleOutcome(chatId, outcome);

  if (calls.length > 0) {
    console.log(
      `[invisibleAgent] mode=${mode} by=${decidedBy} tools=${calls.map((c) => c.tool).join(",") || "(none)"}`
    );
  }
  return outcome;
}
