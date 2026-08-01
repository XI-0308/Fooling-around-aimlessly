"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { apiFetch } from "@/lib/api";

export interface CoreadBookOption {
  id: string;
  title: string;
  draftCount: number;
  pendingDraftCount: number;
  discussionCount: number;
}

interface CoreadPickModalProps {
  open: boolean;
  messageCount: number;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (bookId: string) => void;
}

function displayTitle(title: string): string {
  const t = title.trim();
  if (!t) return "未命名";
  if (/^《[\s\S]*》$/.test(t)) return t;
  return `《${t}》`;
}

export default function CoreadPickModal({
  open,
  messageCount,
  saving = false,
  onClose,
  onConfirm,
}: CoreadPickModalProps) {
  const [books, setBooks] = useState<CoreadBookOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSelectedId("");
    setNewTitle("");
    setLoading(true);
    apiFetch<{ books: CoreadBookOption[] }>("/coread")
      .then((d) => {
        const list = d.books || [];
        setBooks(list);
        if (list.length === 1) setSelectedId(list[0].id);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "加载共读卡失败"))
      .finally(() => setLoading(false));
  }, [open]);

  async function createBook() {
    const title = newTitle.trim();
    if (!title) {
      setError("请填写书名");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await apiFetch<{ book: CoreadBookOption }>("/coread", {
        method: "POST",
        body: JSON.stringify({ title }),
      });
      setBooks((prev) => [...prev, res.book]);
      setSelectedId(res.book.id);
      setNewTitle("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreating(false);
    }
  }

  if (!open || !mounted) return null;

  const body = (
    <div className="modal-overlay coread-pick-overlay" onClick={onClose}>
      <div
        className="modal-card coread-pick-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="coread-pick-title"
      >
        <h2 id="coread-pick-title" style={{ marginTop: 0 }}>
          记入共读
        </h2>
        <p className="hint">已选 {messageCount} 条消息，将按原文追加进所选共读卡的【草稿】。</p>

        {loading ? (
          <p className="hint">加载共读卡…</p>
        ) : (
          <>
            <p className="coread-pick-section-label">选择共读卡</p>
            {books.length === 0 ? (
              <p className="hint">还没有共读卡。请先在下方新建一本（一书一卡）。</p>
            ) : (
              <div className="coread-pick-list" role="listbox" aria-label="共读卡列表">
                {books.map((b) => {
                  const active = selectedId === b.id;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      role="option"
                      aria-selected={active}
                      className={`coread-pick-item${active ? " is-selected" : ""}`}
                      onClick={() => setSelectedId(b.id)}
                    >
                      <span className="coread-pick-item-title">{displayTitle(b.title)}</span>
                      <span className="coread-pick-item-meta hint">
                        草稿 {b.draftCount}
                        {b.pendingDraftCount > 0 ? ` · 待整理 ${b.pendingDraftCount}` : ""}
                        {" · "}讨论 {b.discussionCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="field coread-pick-create">
              <label>或新建共读卡（书名）</label>
              <div className="coread-pick-create-row">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="例如：夜晚的潜水艇"
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  disabled={creating || !newTitle.trim()}
                  onClick={() => void createBook()}
                >
                  {creating ? "创建中…" : "新建"}
                </button>
              </div>
            </div>
          </>
        )}

        {error && (
          <p className="hint" style={{ color: "var(--danger, #f87171)" }}>
            {error}
          </p>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" disabled={saving} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || loading || !selectedId}
            onClick={() => onConfirm(selectedId)}
          >
            {saving ? "写入中…" : "记入草稿"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(body, document.body);
}
