/** ST 兼容的插入位置（里程碑 3 核心 subset） */
export type WiPosition =
  | "before_char_defs"
  | "after_char_defs"
  | "before_examples"
  | "after_examples"
  | "at_depth";

export type WiDepthRole = "system" | "user" | "assistant";

export type SelectiveLogic = "and_any" | "and_all" | "not_any" | "not_all";

export interface WorldInfoEntry {
  id: string;
  memo: string;
  keys: string[];
  secondaryKeys: string[];
  selectiveLogic: SelectiveLogic;
  content: string;
  order: number;
  position: WiPosition;
  /** @D 深度：0 = 最后一条消息前 */
  depth: number;
  depthRole: WiDepthRole;
  /** 恒定条目（ST 蓝圈）：无需关键词 */
  constant: boolean;
  enabled: boolean;
  /** 不可递归：已废弃，保留字段兼容旧数据 */
  nonRecursable?: boolean;
  /** 触发概率 0–100 */
  probability: number;
  /** 单条目扫描深度覆盖（0 = 用全局） */
  scanDepth: number;
}

export interface WorldInfoBook {
  id: string;
  name: string;
  entries: WorldInfoEntry[];
  /** 全局扫描深度（消息条数） */
  scanDepth: number;
  /** 世界书 token 预算 */
  tokenBudget: number;
  /** 是否启用递归扫描 */
  recursiveScanning: boolean;
  /** 关键词大小写敏感 */
  caseSensitive: boolean;
  /** 递归最大轮数 */
  recursionLimit: number;
}

export const DEFAULT_WORLD_INFO_BOOK: WorldInfoBook = {
  id: "default",
  name: "主世界书",
  entries: [],
  scanDepth: 2,
  tokenBudget: 2048,
  recursiveScanning: true,
  caseSensitive: false,
  recursionLimit: 3,
};

/** ST 导出 numeric position → 我们的 position */
export function mapStPosition(n: number): WiPosition {
  switch (n) {
    case 0:
      return "before_char_defs";
    case 1:
      return "after_char_defs";
    case 2:
    case 4:
      return "before_examples";
    case 3:
    case 5:
      return "after_examples";
    default:
      return n >= 6 ? "at_depth" : "after_char_defs";
  }
}
