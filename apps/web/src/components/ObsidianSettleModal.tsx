"use client";

import { useEffect, useState } from "react";

interface ObsidianSettleModalProps {
  open: boolean;
  loading?: boolean;
  saving?: boolean;
  initialTitle: string;
  initialSummary: string;
  sourceLinks: string[];
  onClose: () => void;
  onConfirm: (payload: {
    title: string;
    summary: string;
    sourceLinks: string[];
    efSu: boolean;
  }) => void;
}

export default function ObsidianSettleModal({
  open,
  loading,
  saving,
  initialTitle,
  initialSummary,
  sourceLinks,
  onClose,
  onConfirm,
}: ObsidianSettleModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState(initialSummary);
  const [efSu, setEfSu] = useState(true);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setSummary(initialSummary);
      setEfSu(true);
    }
  }, [open, initialTitle, initialSummary]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 520 }}>
        <h2 style={{ marginTop: 0 }}>沉淀到 Obsidian</h2>
        {loading ? (
          <p className="hint">正在整理讨论摘要…</p>
        ) : (
          <>
            <div className="field">
              <label>标题</label>
              <input value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="field">
              <label>摘要（将写入 EF/Topics）</label>
              <textarea
                rows={12}
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
              />
            </div>
            {sourceLinks.length > 0 && (
              <p className="hint">将附带 {sourceLinks.length} 个来源链接</p>
            )}
            <label className="memory-checkbox-row">
              <input
                type="checkbox"
                checked={efSu}
                onChange={(e) => setEfSu(e.target.checked)}
              />
              允许角色之后在此笔记留言（ef_comment）
            </label>
          </>
        )}
        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={loading || saving || !title.trim() || !summary.trim()}
            onClick={() =>
              onConfirm({
                title: title.trim(),
                summary: summary.trim(),
                sourceLinks,
                efSu,
              })
            }
          >
            {saving ? "写入中…" : "写入 Obsidian"}
          </button>
        </div>
      </div>
    </div>
  );
}
