/** 用户的近期活动账本 */

export type ActivityRepeat = "none" | "daily" | "monthly" | "yearly";

/** 仅提及 = 进列表不挂卡；需提醒 = 进列表且消息尾可 √ 完成 */
export type ActivityRemind = "mention" | "remind";

/** pending=未完成；done=已完成；missed=过期未勾选 */
export type ActivityStatus = "pending" | "done" | "missed";

/** 形态：计划 / 记录 / 约定 */
export type ActivityKind = "plan" | "record" | "promise";

export type ActivityPartOfDay = "morning" | "afternoon" | "evening";

export interface ActivityItem {
  id: string;
  title: string;
  /** 锚点日 YYYY-MM-DD（上海时区）；重复项以此为起点 */
  date: string;
  /** 细化到钟点时用 HH:mm */
  time?: string;
  partOfDay?: ActivityPartOfDay | null;
  repeat: ActivityRepeat;
  remind: ActivityRemind;
  /** 计划 | 记录 | 约定；缺省由 status 推断 */
  kind?: ActivityKind;
  /** 非重复：整条状态；重复：见 occurrenceStatus */
  status: ActivityStatus;
  /** 重复项各发生日状态 YYYY-MM-DD → status */
  occurrenceStatus?: Record<string, ActivityStatus>;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ActivityOccurrence {
  activityId: string;
  title: string;
  /** 发生日 YYYY-MM-DD */
  date: string;
  time?: string;
  partOfDay?: ActivityPartOfDay | null;
  remind: ActivityRemind;
  kind: ActivityKind;
  status: ActivityStatus;
  note?: string;
  repeat: ActivityRepeat;
}

/** 挂在助手消息上，供 √ 完成 */
export interface InjectedActivitySnap {
  activityId: string;
  occurrenceDate: string;
  title: string;
  /** 本条消息上是否已点 √ */
  completed?: boolean;
}

export function resolveActivityKind(item: Pick<ActivityItem, "kind" | "status">): ActivityKind {
  if (item.kind === "plan" || item.kind === "record" || item.kind === "promise") {
    return item.kind;
  }
  return item.status === "done" ? "record" : "plan";
}
