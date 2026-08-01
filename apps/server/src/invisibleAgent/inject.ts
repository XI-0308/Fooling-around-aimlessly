import type { InvisibleToolResult } from "./types.js";

/**
 * 组装 RP 前注入：只给「干净事实」，不把工具元信息喂给角色。
 * decidedBy / 调用列表只进 contextLog（由 loop 写入），不进 systemInjections。
 */
export function buildInjectionsFromResults(results: InvisibleToolResult[]): {
  systemInjections: string[];
  /** 仅供日志 / 分析面板，不注入模型 */
  toolSummaryForPrompt: string;
} {
  const systemInjections: string[] = [];
  const summaryLines: string[] = [];

  for (const r of results) {
    if (r.inject) systemInjections.push(r.inject);
    const flag = r.ok ? "成功" : "未成功";
    summaryLines.push(`- ${r.tool}：${flag}（${r.summary.slice(0, 120)}）`);
  }

  const toolSummaryForPrompt =
    summaryLines.length > 0 ? summaryLines.join("\n") : "";

  return { systemInjections, toolSummaryForPrompt };
}
