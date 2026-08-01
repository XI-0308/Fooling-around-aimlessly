import type { ChatMessage } from "../store/chats.js";

/** 调度员本轮意图（null/false = 不调用） */
export interface ToolDispatchIntent {
  /** 搜歌关键词；空字符串表示由后端从语境推断 */
  music: string | null;
  voice: boolean;
  /** 绘画描述（Seedream 生图） */
  image: string | null;
  /** 网页找图：图片 URL / 网页 URL / 主题词 */
  shareImage: string | null;
  /** Keep 查询用语；空字符串表示用用户最近一句话 */
  keep: string | null;
}

export interface TurnToolPlan {
  musicQuery: string | null;
  wantsVoice: boolean;
  imagePrompt: string | null;
  /** 网页找图来源 */
  shareImageSource: string | null;
  /** Keep 已在 pass1 执行则不再重复 */
  keepDone: boolean;
}

export const EMPTY_INTENT: ToolDispatchIntent = {
  music: null,
  voice: false,
  image: null,
  shareImage: null,
  keep: null,
};

/** 最近 3 条：上一轮对话 + 当前用户/角色句（被动兜底够用，不必塞满近 3 轮） */
export function buildDispatcherHistory(
  messages: ChatMessage[],
  opts: { pass: 1 | 2; userName: string; charName: string }
): { role: "user" | "assistant"; content: string }[] {
  const usable = messages.filter((m) => m.role === "user" || m.role === "assistant");
  const window = usable.slice(-3);
  return window.map((m) => {
    const who = m.role === "user" ? opts.userName : opts.charName;
    const text = (m.content || "").replace(/\s+/g, " ").trim().slice(0, 500);
    return {
      role: m.role as "user" | "assistant",
      content: `[${who}] ${text || "（空）"}`,
    };
  });
}
