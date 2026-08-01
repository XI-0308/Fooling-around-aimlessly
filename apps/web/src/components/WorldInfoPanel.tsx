"use client";

import { useEffect, useRef, useState } from "react";
import { FileAddOutlined, ScanOutlined } from "@ant-design/icons";
import EncoreBlockTitle from "@/components/EncoreBlockTitle";
import ImportBackupPackage from "@/components/ImportBackupPackage";
import MemoryListPager from "@/components/MemoryListPager";
import { apiFetch } from "@/lib/api";
import { usePagedList } from "@/lib/usePagedList";

type WiPosition = "before_char_defs" | "after_char_defs" | "before_examples" | "after_examples" | "at_depth";

interface WorldInfoEntry {
  id: string;
  memo: string;
  keys: string[];
  secondaryKeys: string[];
  selectiveLogic: string;
  content: string;
  order: number;
  position: WiPosition;
  depth: number;
  depthRole: string;
  constant: boolean;
  enabled: boolean;
  probability: number;
  scanDepth: number;
}

interface WorldInfoBook {
  name: string;
  entries: WorldInfoEntry[];
  scanDepth: number;
  tokenBudget: number;
  recursiveScanning: boolean;
  caseSensitive: boolean;
  recursionLimit: number;
}

const POSITIONS: { value: Exclude<WiPosition, "at_depth">; label: string }[] = [
  { value: "before_char_defs", label: "角色定义前" },
  { value: "after_char_defs", label: "角色定义后" },
  { value: "before_examples", label: "示例对话前" },
  { value: "after_examples", label: "示例对话后" },
];

function normalizePosition(position: WiPosition): Exclude<WiPosition, "at_depth"> {
  if (position === "at_depth") return "after_char_defs";
  return position;
}

function positionLabel(position: WiPosition): string {
  return POSITIONS.find((p) => p.value === normalizePosition(position))?.label ?? "角色定义后";
}

function clampScanDepth(n: number): number {
  if (!Number.isFinite(n)) return 2;
  return Math.min(20, Math.max(1, Math.round(n)));
}

export default function WorldInfoPanel() {
  const newEntryRef = useRef<HTMLDivElement>(null);
  const [book, setBook] = useState<WorldInfoBook | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<WorldInfoEntry | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [message, setMessage] = useState("");
  const [scanDepthDraft, setScanDepthDraft] = useState("2");
  const [scanDepthSaving, setScanDepthSaving] = useState(false);
  const entriesPager = usePagedList(book?.entries ?? []);

  function load() {
    apiFetch<{ book: WorldInfoBook }>("/worldinfo")
      .then((d) => {
        setBook(d.book);
        setScanDepthDraft(String(d.book.scanDepth ?? 2));
      })
      .catch((e) => setMessage(e.message));
  }

  useEffect(() => {
    load();
  }, []);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function startEdit(entry: WorldInfoEntry) {
    setExpandedIds((prev) => new Set(prev).add(entry.id));
    setEditingId(entry.id);
    setDraft({
      ...entry,
      position: normalizePosition(entry.position),
    });
  }

  function cancelEdit() {
    setEditingId(null);
    setDraft(null);
  }

  async function saveScanDepth() {
    if (!book) return;
    const next = clampScanDepth(Number(scanDepthDraft));
    setScanDepthDraft(String(next));
    if (next === book.scanDepth) return;
    setScanDepthSaving(true);
    try {
      const data = await apiFetch<{ book: WorldInfoBook }>("/worldinfo/settings", {
        method: "PUT",
        body: JSON.stringify({ scanDepth: next }),
      });
      setBook(data.book);
      setScanDepthDraft(String(data.book.scanDepth));
      setMessage("已保存扫描深度");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setScanDepthSaving(false);
    }
  }

  async function saveEntry() {
    if (!draft) return;
    const keys = draft.keys.length ? draft.keys : draft.memo.split(",").map((k) => k.trim()).filter(Boolean);
    const payload = {
      ...draft,
      keys,
      position: normalizePosition(draft.position),
    };
    const data = await apiFetch<{ book: WorldInfoBook }>("/worldinfo/entries", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    setBook(data.book);
    cancelEdit();
    setMessage("已保存条目");
  }

  async function removeEntry(id: string) {
    if (!confirm("删除此条目？")) return;
    const data = await apiFetch<{ book: WorldInfoBook }>(`/worldinfo/entries/${id}`, { method: "DELETE" });
    setBook(data.book);
    if (editingId === id) cancelEdit();
  }

  async function newEntry() {
    const data = await apiFetch<{ entry: WorldInfoEntry }>("/worldinfo/entries/new");
    startEdit(data.entry);
    requestAnimationFrame(() => {
      newEntryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function renderEditForm(entry: WorldInfoEntry) {
    const editing = draft && draft.id === entry.id ? draft : null;
    if (!editing) return null;

    return (
      <div className="worldinfo-edit">
        <div className="field">
          <label>备注名</label>
          <input value={editing.memo} onChange={(e) => setDraft({ ...editing, memo: e.target.value })} />
        </div>
        <div className="field">
          <label>关键词（逗号分隔）</label>
          <input
            value={editing.keys.join(", ")}
            onChange={(e) =>
              setDraft({ ...editing, keys: e.target.value.split(",").map((k) => k.trim()) })
            }
          />
        </div>
        <div className="field">
          <label>内容</label>
          <textarea
            rows={5}
            value={editing.content}
            onChange={(e) => setDraft({ ...editing, content: e.target.value })}
          />
        </div>
        <div className="field">
          <label>插入位置</label>
          <select
            value={normalizePosition(editing.position)}
            onChange={(e) =>
              setDraft({ ...editing, position: e.target.value as Exclude<WiPosition, "at_depth"> })
            }
          >
            {POSITIONS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <label className="worldinfo-check-row">
          <input
            type="checkbox"
            checked={editing.enabled}
            onChange={(e) => setDraft({ ...editing, enabled: e.target.checked })}
          />
          启用
        </label>
        <label className="worldinfo-check-row">
          <input
            type="checkbox"
            checked={editing.constant}
            onChange={(e) => setDraft({ ...editing, constant: e.target.checked })}
          />
          恒定（无需关键词）
        </label>
        <div className="worldinfo-edit-actions">
          <button type="button" className="btn btn-primary btn-sm" onClick={() => void saveEntry()}>
            保存
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={cancelEdit}>
            取消
          </button>
        </div>
      </div>
    );
  }

  if (!book) {
    return (
      <div className="card memory-empty">
        <p className="hint">加载语意记忆…</p>
      </div>
    );
  }

  const isNewDraft = draft && !book.entries.some((e) => e.id === draft.id);

  return (
    <div className="worldinfo-embedded">
      <div className="card memory-import-section">
        <EncoreBlockTitle icon={<ScanOutlined />} color="#60a5fa">
          触发扫描深度
        </EncoreBlockTitle>
        <p className="hint" style={{ marginBottom: 12 }}>
          语意记忆与记忆库中所有<strong>关键词触发</strong>的条目（事件 / 读书摘抄 / 资料短篇）共用此设置：在「最近
          N 条聊天消息」+ 角色与用户档案中匹配关键词。电子书<strong>向量检索</strong>仍主要依据当前用户消息。
        </p>
        <div className="worldinfo-scan-row">
          <div className="field worldinfo-scan-field">
            <label>扫描深度（最近消息条数）</label>
            <input
              type="number"
              min={1}
              max={20}
              value={scanDepthDraft}
              onChange={(e) => setScanDepthDraft(e.target.value)}
              onBlur={() => void saveScanDepth()}
              disabled={scanDepthSaving}
            />
          </div>
          <div className="worldinfo-scan-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={scanDepthSaving}
              onClick={() => void saveScanDepth()}
            >
              {scanDepthSaving ? "保存中…" : "保存"}
            </button>
            {book.scanDepth === clampScanDepth(Number(scanDepthDraft)) && (
              <span className="hint worldinfo-scan-saved">当前已生效：{book.scanDepth}</span>
            )}
          </div>
          <p className="hint worldinfo-scan-hint">
            默认 2。聊得多、话题跨度大时可试 3–4；过大易误触发且略增开销。离开输入框也会自动保存。
          </p>
        </div>
      </div>

      <div className="card memory-import-section">
        <EncoreBlockTitle icon={<FileAddOutlined />} color="#a78bfa">
          条目管理
        </EncoreBlockTitle>
        <div className="worldinfo-entry-actions">
          <button type="button" className="btn btn-outline" onClick={() => void newEntry()}>
            新建条目
          </button>
          <ImportBackupPackage
            packageId="worldinfo"
            buttonLabel="从备份导入"
            compact
            onSuccess={(msg) => {
              setMessage(msg);
              load();
            }}
          />
        </div>
      </div>

      {message && (
        <p className={`hint worldinfo-message ${message.startsWith("✅") || message.includes("已") ? "" : "error-text"}`}>
          {message}
        </p>
      )}

      <MemoryListPager
        page={entriesPager.page}
        totalPages={entriesPager.totalPages}
        total={entriesPager.total}
        rangeStart={entriesPager.rangeStart}
        rangeEnd={entriesPager.rangeEnd}
        onPageChange={entriesPager.setPage}
      />

      {isNewDraft && draft && (
        <div
          ref={newEntryRef}
          className="card memory-item worldinfo-item worldinfo-item-editing worldinfo-item-expanded"
        >
          <div className="worldinfo-item-head">
            <span className="worldinfo-badge worldinfo-badge-key">新建</span>
          </div>
          <h3 className="worldinfo-item-title">新条目</h3>
          {renderEditForm(draft)}
        </div>
      )}

      {entriesPager.pageItems.map((entry) => {
        const isEditing = editingId === entry.id;
        const isExpanded = isEditing || expandedIds.has(entry.id);
        const memoLabel = entry.memo.trim() || "未命名";

        return (
          <div
            key={entry.id}
            className={`card memory-item worldinfo-item ${isEditing ? "worldinfo-item-editing" : ""} ${!entry.enabled ? "worldinfo-item-disabled" : ""} ${isExpanded ? "worldinfo-item-expanded" : "worldinfo-item-collapsed"}`}
          >
            <button
              type="button"
              className="worldinfo-item-summary"
              aria-expanded={isExpanded}
              disabled={isEditing}
              onClick={() => toggleExpand(entry.id)}
            >
              <span className={`worldinfo-chevron ${isExpanded ? "worldinfo-chevron-open" : ""}`} aria-hidden>
                ›
              </span>
              <span className="worldinfo-item-memo">{memoLabel}</span>
            </button>

            {isExpanded && (
              <div className="worldinfo-item-body">
                <div className="worldinfo-item-head">
                  <span
                    className={
                      entry.constant
                        ? "worldinfo-badge worldinfo-badge-constant"
                        : "worldinfo-badge worldinfo-badge-key"
                    }
                  >
                    {entry.constant ? "恒定" : "关键词"}
                  </span>
                  <span className="worldinfo-badge worldinfo-badge-pos">{positionLabel(entry.position)}</span>
                  {!entry.enabled && <span className="worldinfo-badge worldinfo-badge-off">已禁用</span>}
                </div>
                {entry.keys.length > 0 && (
                  <p className="hint worldinfo-keys">关键词：{entry.keys.join("、")}</p>
                )}
                {!isEditing && (
                  <p className="worldinfo-text">
                    {entry.content.slice(0, 200)}
                    {entry.content.length > 200 ? "…" : ""}
                  </p>
                )}
                {isEditing && draft && renderEditForm(entry)}
                {!isEditing && (
                  <div className="worldinfo-item-actions">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(entry)}>
                      编辑
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void removeEntry(entry.id)}
                    >
                      删除
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {book.entries.length === 0 && !isNewDraft && (
        <div className="card memory-empty">
          <div className="empty-state">
            <p>暂无语意条目</p>
            <p className="hint">点击上方「新建条目」，或从备份导入。</p>
          </div>
        </div>
      )}
    </div>
  );
}
