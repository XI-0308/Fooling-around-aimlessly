"use client";

import type { TimelineItem } from "@/lib/chatTimeDisplay";

export function ChatTimeMarker({ item }: { item: TimelineItem }) {
  return (
    <div className="chat-time-marker chat-time-marker-day" title="（已停用）跨天分隔">
      <span>{item.text}</span>
    </div>
  );
}

export { collectTimeMarkersBeforeMessage } from "@/lib/chatTimeDisplay";
