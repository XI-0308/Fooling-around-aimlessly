"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

export interface MemoryPickItem {
  id: string;
  typeLabel: string;
  text: string;
  keys?: string[];
}

export interface MemoryPickResult {
  chunkId: string;
  text: string;
}

interface MemoryPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (item: MemoryPickResult) => void;
}

export default function MemoryPickerModal({ open, onClose, onSelect }: MemoryPickerModalProps) {
  const [chunks, setChunks] = useState<MemoryPickItem[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    apiFetch<{ chunks: MemoryPickItem[] }>("/memory")
      .then((d) => setChunks(d.chunks))
      .catch(() => setChunks([]))
      .finally(() => setLoading(false));
  }, [open]);

  // 锁滚动并补偿滚动条宽度，避免弹窗打开时整页左右晃
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    const prevPadding = document.body.style.paddingRight;
    const sbw = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (sbw > 0) document.body.style.paddingRight = `${sbw}px`;
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPadding;
    };
  }, [open]);

  if (!open) return null;

  const q = filter.trim().toLowerCase();
  const list = q
    ? chunks.filter(
        (c) =>
          c.text.toLowerCase().includes(q) ||
          c.typeLabel.includes(q) ||
          (c.keys ?? []).some((k) => k.toLowerCase().includes(q))
      )
    : chunks;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card memory-picker-modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>引用记忆</h2>
        <p className="hint">选择一条记忆，发送时会换行并入你的消息（仍是一条，不额外占 memories 槽）。</p>
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="搜索记忆内容或关键词…"
          autoFocus
        />
        <div className="memory-picker-list">
          {loading && <p className="hint">加载中…</p>}
          {!loading && list.length === 0 && <p className="hint">暂无记忆，请先在记忆库添加。</p>}
          {!loading &&
            list.map((c) => (
              <button
                key={c.id}
                type="button"
                className="memory-picker-item"
                onClick={() => {
                  onSelect({ chunkId: c.id, text: c.text });
                  onClose();
                }}
              >
                <span className="memory-badge memory-badge-event">{c.typeLabel}</span>
                {(c.keys ?? []).length > 0 ? (
                  <span className="hint memory-picker-keys">关键词：{(c.keys ?? []).join("、")}</span>
                ) : null}
                <span className="memory-picker-text">{c.text}</span>
              </button>
            ))}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
