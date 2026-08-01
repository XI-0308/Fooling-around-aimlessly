import type { InvisibleMode, InvisibleToolName } from "./types.js";

export interface ToolRegistryEntry {
  name: InvisibleToolName;
  /** 给决策模型看 */
  description: string;
  /** chat / heartbeat 是否允许 */
  modes: InvisibleMode[];
  /** 事实型：RP 前执行并注入；副作用型：只写入 plan，RP 后 followUp */
  kind: "fact" | "sideEffect";
}

/** 统一工具注册表——升级「角色即 Agent」时复用同一描述与执行器 */
export const TOOL_REGISTRY: ToolRegistryEntry[] = [
  {
    name: "keep",
    kind: "fact",
    modes: ["chat", "heartbeat"],
    description:
      "查阅用户的 Keep 健康数据（运动/睡眠/体重/心率等，只读）。" +
      "仅在她已结束运动/明确要看本人数据时调用；出发、打算去练、正在练、走廊快走、点歌时不要调。" +
      "arg 为查询用语（第一人称「我」）。",
  },
  {
    name: "activity_remind",
    kind: "fact",
    modes: ["chat", "heartbeat"],
    description:
      "主动提醒用户账本里标记「需提醒」且尚未完成的近期活动/约定。无需 arg。仅当确有待提醒项且语境适合叮嘱时调用。",
  },
  {
    name: "music",
    kind: "sideEffect",
    modes: ["chat"],
    description: "为用户点播网易云歌曲。arg 为搜歌词（歌名/歌手）；不确定可传空字符串。",
  },
  {
    name: "voice",
    kind: "sideEffect",
    modes: ["chat"],
    description: "本轮回复后附加一条角色语音条。arg 忽略。",
  },
  {
    name: "image",
    kind: "sideEffect",
    modes: ["chat"],
    description: "AI 生图发给用户。arg 为画面描述。与 shareImage 互斥。",
  },
  {
    name: "shareImage",
    kind: "sideEffect",
    modes: ["chat"],
    description: "从网页找现成图发给用户。arg 为 URL 或主题词。与 image 互斥。",
  },
];

export function registryForMode(mode: InvisibleMode): ToolRegistryEntry[] {
  return TOOL_REGISTRY.filter((t) => t.modes.includes(mode));
}

export function formatRegistryForDecide(mode: InvisibleMode): string {
  return registryForMode(mode)
    .map((t) => `- ${t.name} (${t.kind}): ${t.description}`)
    .join("\n");
}
