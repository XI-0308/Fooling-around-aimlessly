"use client";

import { useState } from "react";

export type InjectedActivitySnapView = {
  activityId: string;
  occurrenceDate: string;
  title: string;
  completed?: boolean;
};

type Props = {
  items: InjectedActivitySnapView[];
  busy?: boolean;
  onComplete: (activityId: string, occurrenceDate: string) => void | Promise<void>;
};

export default function ActivityRemindFeedback({ items, busy, onComplete }: Props) {
  const [flash, setFlash] = useState<Record<string, string>>({});
  if (!items.length) return null;

  async function handleComplete(activityId: string, occurrenceDate: string, done?: boolean) {
    if (done) return;
    const key = `${activityId}|${occurrenceDate}`;
    try {
      await onComplete(activityId, occurrenceDate);
      setFlash((prev) => ({ ...prev, [key]: "已标记完成" }));
      window.setTimeout(() => {
        setFlash((prev) => {
          if (prev[key] !== "已标记完成") return prev;
          const { [key]: _, ...rest } = prev;
          return rest;
        });
      }, 2200);
    } catch {
      setFlash((prev) => ({ ...prev, [key]: "保存失败，请重试" }));
    }
  }

  return (
    <div className="msg-activity-remind">
      {items.map((item) => {
        const key = `${item.activityId}|${item.occurrenceDate}`;
        const tip = flash[key];
        return (
          <div key={key} className="msg-activity-remind-row">
            <span className="msg-activity-remind-label" title={item.title}>
              活动〔{item.title}〕
            </span>
            <button
              type="button"
              className={`msg-activity-remind-btn${item.completed ? " is-on" : ""}`}
              disabled={busy || item.completed}
              title={item.completed ? "已完成" : "标记完成"}
              aria-label={item.completed ? "已完成" : "标记完成"}
              aria-pressed={Boolean(item.completed)}
              onClick={() => void handleComplete(item.activityId, item.occurrenceDate, item.completed)}
            >
              √
            </button>
            {tip ? <span className="msg-activity-remind-flash">{tip}</span> : null}
          </div>
        );
      })}
    </div>
  );
}
