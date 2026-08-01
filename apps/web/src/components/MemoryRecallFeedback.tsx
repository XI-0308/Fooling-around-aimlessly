"use client";

import { useState } from "react";

export type InjectedMemorySnapView = {
  chunkId: string;
  text: string;
  query: string;
  rating?: "up" | "down";
};

function preview14(text: string): string {
  const chars = Array.from((text || "").trim());
  if (chars.length <= 14) return chars.join("");
  return `${chars.slice(0, 14).join("")}…`;
}

type Props = {
  items: InjectedMemorySnapView[];
  busy?: boolean;
  onRate: (chunkId: string, rating: "up" | "down" | null) => void | Promise<void>;
};

export default function MemoryRecallFeedback({ items, busy, onRate }: Props) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [flash, setFlash] = useState<Record<string, string>>({});
  if (!items.length) return null;

  async function handleRate(
    chunkId: string,
    next: "up" | "down" | null,
    current?: "up" | "down"
  ) {
    const rating = current === next ? null : next;
    try {
      await onRate(chunkId, rating);
      const tip =
        rating === "up" ? "已记为准确" : rating === "down" ? "已记为不准" : "已取消评价";
      setFlash((prev) => ({ ...prev, [chunkId]: tip }));
      window.setTimeout(() => {
        setFlash((prev) => {
          if (prev[chunkId] !== tip) return prev;
          const { [chunkId]: _, ...rest } = prev;
          return rest;
        });
      }, 2200);
    } catch {
      setFlash((prev) => ({ ...prev, [chunkId]: "保存失败，请重试" }));
    }
  }

  return (
    <div className="msg-memory-recall">
      {items.map((item) => {
        const open = Boolean(expanded[item.chunkId]);
        const label = preview14(item.text);
        const tip = flash[item.chunkId];
        return (
          <div key={item.chunkId} className="msg-memory-recall-row">
            <button
              type="button"
              className="msg-memory-recall-summary"
              title={open ? "收起全文" : "展开全文"}
              onClick={() =>
                setExpanded((prev) => ({ ...prev, [item.chunkId]: !open }))
              }
            >
              记忆〔{label}〕
            </button>
            <span className="msg-memory-recall-actions" role="group" aria-label="记忆是否准确">
              <button
                type="button"
                className={`msg-memory-recall-btn msg-memory-recall-btn-up${
                  item.rating === "up" ? " is-on" : ""
                }`}
                disabled={busy}
                title="准"
                aria-label="准"
                aria-pressed={item.rating === "up"}
                onClick={() => void handleRate(item.chunkId, "up", item.rating)}
              >
                ♥
              </button>
              <button
                type="button"
                className={`msg-memory-recall-btn msg-memory-recall-btn-down${
                  item.rating === "down" ? " is-on" : ""
                }`}
                disabled={busy}
                title="不准"
                aria-label="不准"
                aria-pressed={item.rating === "down"}
                onClick={() => void handleRate(item.chunkId, "down", item.rating)}
              >
                ♡
              </button>
            </span>
            {tip ? <span className="msg-memory-recall-flash">{tip}</span> : null}
            {open ? (
              <div className="msg-memory-recall-full">{item.text}</div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
