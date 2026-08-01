/** 与 server chatTimeMarkers 对齐（跨天分隔已取消，每条消息自带时钟进 prompt） */

export type TimelineItem = { kind: "day"; text: string };

type MsgLike = { id: string; createdAt?: string };

/** 聊天界面不再插入跨天条；时间已写进发给角色的每条历史前缀 */
export function buildMessageTimeMarkers(_prev: MsgLike | null, _curr: MsgLike): TimelineItem[] {
  return [];
}

export function collectTimeMarkersBeforeMessage(_messages: MsgLike[], _index: number): TimelineItem[] {
  return [];
}
