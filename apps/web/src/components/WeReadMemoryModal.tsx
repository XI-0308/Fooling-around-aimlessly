"use client";

import { useEffect, useState } from "react";

export interface WeReadMemoryPayload {
  text: string;
  keysText: string;
  syncProgress: boolean;
}

interface WeReadMemoryModalProps {
  open: boolean;
  chatTitle: string;
  messageCount: number;
  bookTitle?: string | null;
  progress?: number | null;
  initialSummary: string;
  suggestedKeysText?: string;
  loading?: boolean;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (payload: WeReadMemoryPayload) => void;
}

export default function WeReadMemoryModal({
  open,
  chatTitle,
  messageCount,
  bookTitle,
  progress,
  initialSummary,
  suggestedKeysText,
  loading = false,
  saving = false,
  onClose,
  onConfirm,
}: WeReadMemoryModalProps) {
  const [text, setText] = useState("");
  const [keysText, setKeysText] = useState("");
  const [syncProgress, setSyncProgress] = useState(true);

  useEffect(() => {
    if (open) {
      setText(initialSummary);
      setKeysText(suggestedKeysText || "");
      setSyncProgress(progress != null);
    }
  }, [open, initialSummary, suggestedKeysText, progress]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card event-summary-modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>读书摘抄 · 审核入库</h2>
        <p className="hint">
          来自「{chatTitle}」· 已选 {messageCount} 条含微信读书数据的消息
          {bookTitle ? ` · 《${bookTitle}》` : ""}
          {progress != null ? ` · 进度 ${progress}%` : ""}
        </p>

        {loading ? (
          <p className="hint">DeepSeek 正在整理摘抄…</p>
        ) : (
          <>
            <div className="field">
              <label>记忆内容</label>
              <textarea
                rows={7}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="读书摘抄正文"
              />
            </div>

            <div className="field">
              <label>触发关键词（逗号分隔）</label>
              <input
                type="text"
                value={keysText}
                onChange={(e) => setKeysText(e.target.value)}
                placeholder="例如：书名, 划线, 笔记"
              />
              <p className="hint" style={{ marginTop: 6, marginBottom: 0 }}>
                聊到书名或关键词时，本条摘抄会注入角色的上下文（与语意记忆规则相同）。
              </p>
            </div>

            {progress != null && (
              <label className="memory-checkbox-row">
                <input
                  type="checkbox"
                  checked={syncProgress}
                  onChange={(e) => setSyncProgress(e.target.checked)}
                />
                同时更新「阅读进度」记忆（每本书仅保留一条，可覆盖）
              </label>
            )}
          </>
        )}

        <div className="modal-actions">
          <button type="button" className="btn btn-ghost" disabled={saving || loading} onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={saving || loading || !text.trim()}
            onClick={() =>
              onConfirm({
                text: text.trim(),
                keysText,
                syncProgress: syncProgress && progress != null,
              })
            }
          >
            {saving ? "存入中…" : "确认存入记忆库"}
          </button>
        </div>
      </div>
    </div>
  );
}
