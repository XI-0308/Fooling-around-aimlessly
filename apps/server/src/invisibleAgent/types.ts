/** Invisible Agent：统一工具类型（角色即 Agent 升级时可复用 Registry + Exec） */

export type InvisibleToolName =
  | "keep"
  | "activity_remind"
  | "music"
  | "voice"
  | "image"
  | "shareImage";

export type InvisibleMode = "chat" | "heartbeat";

export interface InvisibleToolCall {
  tool: InvisibleToolName;
  /** 查询语 / 搜歌词 / 生图描述 / 找图来源；voice 可忽略 */
  arg?: string;
}

export interface InvisibleToolResult {
  tool: InvisibleToolName;
  ok: boolean;
  summary: string;
  /** 注入 RP 前的 system 块（事实型） */
  inject?: string;
}

export interface InvisibleAgentOutcome {
  mode: InvisibleMode;
  calls: InvisibleToolCall[];
  results: InvisibleToolResult[];
  systemInjections: string[];
  /** 本轮实际做了什么，给角色读，防瞎编 */
  toolSummaryForPrompt: string;
  decidedBy: "llm" | "heuristic";
}

export const SIDE_EFFECT_TOOLS: InvisibleToolName[] = [
  "music",
  "voice",
  "image",
  "shareImage",
];

export const FACT_TOOLS: InvisibleToolName[] = ["keep", "activity_remind"];
