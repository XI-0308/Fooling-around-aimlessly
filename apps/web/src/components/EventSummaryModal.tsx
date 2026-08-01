"use client";

import { useEffect, useState } from "react";

export interface EventSummaryPayload {
  text: string;
  keysText: string;
  memoryAt: string;
  includeTimeInPrompt: boolean;
}

interface EventSummaryModalProps {
  open: boolean;
  chatTitle: string;
  messageCount: number;
  initialSummary: string;
  suggestedMemoryAt?: string;
  loading?: boolean;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (payload: EventSummaryPayload) => void;
}

function toDatetimeLocalValue(iso?: string): string {
  if (!iso) {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  }
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return toDatetimeLocalValue();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function EventSummaryModal({
  open,
  chatTitle,
  messageCount,
  initialSummary,
  suggestedMemoryAt,
  loading = false,
  saving = false,
  onClose,
  onConfirm,
}: EventSummaryModalProps) {
  const [text, setText] = useState("");
  const [keysText, setKeysText] = useState("");
  const [memoryAt, setMemoryAt] = useState("");
  const [includeTimeInPrompt, setIncludeTimeInPrompt] = useState(false);

  useEffect(() => {
    if (open) {
      setText(initialSummary);
      setKeysText("");
      setMemoryAt(toDatetimeLocalValue(suggestedMemoryAt));
      setIncludeTimeInPrompt(false);
    }
  }, [open, initialSummary, suggestedMemoryAt]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card event-summary-modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>事件记忆 · 审核入库</h2>
        <p className="hint">
          来自「{chatTitle}」· 已选 {messageCount} 条消息，已合并为一条事件记忆。请确认内容并设置关键词。
        </p>

        {loading ? (
          <p className="hint">DeepSeek 正在总结…</p>
        ) : (
          <>
            <div className="field">
              <label>记忆内容</label>
              <textarea
                rows={6}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="事件记忆正文"
              />
            </div>

            <div className="field">
              <label>触发关键词（逗号分隔）</label>
              <input
                type="text"
                value={keysText}
                onChange={(e) => setKeysText(e.target.value)}
                placeholder="例如：角色, 你, 婚礼"
              />
              <p className="hint" style={{ marginTop: 6, marginBottom: 0 }}>
                关键词会在最近对话的<strong>用户与角色消息</strong>中匹配；命中后才注入本条记忆。
              </p>
            </div>

            <div className="field event-summary-datetime-field">
              <label>记忆时间（可选）</label>
              <input
                type="datetime-local"
                value={memoryAt}
                onChange={(e) => setMemoryAt(e.target.value)}
              />
            </div>

            <label className="memory-checkbox-row">
              <input
                type="checkbox"
                checked={includeTimeInPrompt}
                onChange={(e) => setIncludeTimeInPrompt(e.target.checked)}
              />
              注入模型上下文时带上记忆时间
            </label>
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
                memoryAt: memoryAt ? new Date(memoryAt).toISOString() : "",
                includeTimeInPrompt,
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
