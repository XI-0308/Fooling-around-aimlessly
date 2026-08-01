"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  BookOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  UploadOutlined,
} from "@ant-design/icons";
import AppShell from "@/components/AppShell";
import EncoreBlockTitle from "@/components/EncoreBlockTitle";
import ImportBackupPackage from "@/components/ImportBackupPackage";
import WorldInfoPanel from "@/components/WorldInfoPanel";
import ActivityPanel from "@/components/ActivityPanel";
import MemoryListPager from "@/components/MemoryListPager";
import MemorySearchPanel from "@/components/MemorySearchPanel";
import { apiFetch } from "@/lib/api";
import { coreadViewsPayload, normalizeCoreadViews } from "@/lib/coreadViews";
import { usePagedList } from "@/lib/usePagedList";

type MemoryPageSection = "semantic" | "event" | "reading" | "file" | "search" | "activity";
/** 资料记忆下的两种导入方式 */
type FileFilter = "summary" | "leann";

interface MemoryItem {
  id: string;
  sourceType: "chat" | "file" | "manual" | "weread" | "leann";
  typeLabel: string;
  sourceName: string;
  wereadBookTitle?: string;
  wereadKind?: "highlights" | "progress";
  leannCollectionId?: string;
  leannStatus?: "draft" | "indexed";
  text: string;
  keys?: string[];
  constant?: boolean;
  memoryAt?: string;
  includeTimeInPrompt?: boolean;
  createdAt: string;
}

interface CoreadDraft {
  id: string;
  text: string;
  createdAt: string;
  digestedAt?: string;
}

interface CoreadDiscussion {
  id: string;
  claim: string;
  userView: string;
  charView: string;
  text: string;
  createdAt: string;
  updatedAt: string;
}

interface CoreadBook {
  id: string;
  title: string;
  keys: string[];
  drafts: CoreadDraft[];
  discussions: CoreadDiscussion[];
  createdAt: string;
  updatedAt: string;
  draftCount: number;
  pendingDraftCount: number;
  discussionCount: number;
}

const SECTION_TABS: { id: MemoryPageSection; label: string }[] = [
  { id: "semantic", label: "语意记忆" },
  { id: "event", label: "事件记忆" },
  { id: "activity", label: "近期活动" },
  { id: "reading", label: "读书记忆" },
  { id: "file", label: "资料记忆" },
  { id: "search", label: "全局搜索" },
];

const FILE_FILTER_TABS: { id: FileFilter; label: string; hint: string }[] = [
  {
    id: "summary",
    label: "短篇总结",
    hint: "DeepSeek 提炼后入库，靠关键词在对话中触发",
  },
  {
    id: "leann",
    label: "电子书索引",
    hint: "先存全文草稿，编辑/切块后再向量化；聊天只检索已向量化的书",
  },
];

function parseSectionParam(raw: string | null): MemoryPageSection {
  if (raw === "worldinfo" || raw === "semantic") return "semantic";
  if (
    raw === "event" ||
    raw === "reading" ||
    raw === "file" ||
    raw === "search" ||
    raw === "activity"
  ) {
    return raw;
  }
  return "semantic";
}

function keysToText(keys?: string[]): string {
  return (keys ?? []).join(", ");
}

function eventEntryTitle(c: MemoryItem): string {
  const keys = (c.keys ?? []).map((k) => k.trim()).filter(Boolean);
  if (keys.length > 0) return keys.join("、");
  if (c.constant) return "常驻事件记忆";
  const preview = c.text.trim().slice(0, 28);
  if (preview) return `${preview}${c.text.length > 28 ? "…" : ""}`;
  return "未设关键词";
}

function toDatetimeLocalValue(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

function typeBadgeClass(sourceType: MemoryItem["sourceType"]): string {
  if (sourceType === "file") return "memory-badge memory-badge-file";
  if (sourceType === "weread") return "memory-badge memory-badge-weread";
  if (sourceType === "leann") return "memory-badge memory-badge-leann";
  return "memory-badge memory-badge-event";
}

interface LeannStatus {
  enabled: boolean;
  probe: { ok: boolean; version?: string; error?: string; pdf?: boolean; pdfError?: string };
  collections: {
    id: string;
    name: string;
    chunkCount: number;
    byteSize: number;
    status?: "draft" | "indexed";
    sourceFormat?: "text" | "pdf";
    pageCount?: number;
  }[];
}

interface LeannCollectionDetail {
  id: string;
  name: string;
  title: string;
  status: "draft" | "indexed";
  chunkCount: number;
  fullText: string;
  pieces: string[];
}

export default function MemoryPageClient() {
  const searchParams = useSearchParams();
  const fileRef = useRef<HTMLInputElement>(null);
  const leannFileRef = useRef<HTMLInputElement>(null);

  const [section, setSection] = useState<MemoryPageSection>(() =>
    parseSectionParam(searchParams.get("section"))
  );
  const [fileFilter, setFileFilter] = useState<FileFilter>("summary");
  const [chunks, setChunks] = useState<MemoryItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [editKeysText, setEditKeysText] = useState("");
  const [editConstant, setEditConstant] = useState(false);
  const [editMemoryAt, setEditMemoryAt] = useState("");
  const [editIncludeTime, setEditIncludeTime] = useState(false);
  const [manualText, setManualText] = useState("");
  const [manualKeysText, setManualKeysText] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [leannStatus, setLeannStatus] = useState<LeannStatus | null>(null);
  const [leannKeysText, setLeannKeysText] = useState("");
  const [leannEditorId, setLeannEditorId] = useState<string | null>(null);
  const [leannDetail, setLeannDetail] = useState<LeannCollectionDetail | null>(null);
  const [leannFullText, setLeannFullText] = useState("");
  const [leannPieces, setLeannPieces] = useState<string[]>([]);
  const [leannBusy, setLeannBusy] = useState(false);
  const [expandedEventIds, setExpandedEventIds] = useState<Set<string>>(new Set());
  const [coreadBooks, setCoreadBooks] = useState<CoreadBook[]>([]);
  const [expandedCoreadIds, setExpandedCoreadIds] = useState<Set<string>>(new Set());
  const [newBookTitle, setNewBookTitle] = useState("");
  const [coreadEditId, setCoreadEditId] = useState<string | null>(null);
  const [coreadEditTitle, setCoreadEditTitle] = useState("");
  const [coreadEditKeys, setCoreadEditKeys] = useState("");
  const [discussionEdit, setDiscussionEdit] = useState<{
    bookId: string;
    discussionId: string;
    claim: string;
    userView: string;
    charView: string;
  } | null>(null);
  const [draftEdit, setDraftEdit] = useState<{
    bookId: string;
    draftId: string;
    text: string;
    wasDigested: boolean;
  } | null>(null);
  const [newDraftBookId, setNewDraftBookId] = useState<string | null>(null);
  const [newDraftText, setNewDraftText] = useState("");

  const chunksPager = usePagedList(chunks, 10, `${section}:${fileFilter}`);
  const coreadPager = usePagedList(coreadBooks, 10, section);

  function formatCoreadTitle(title: string): string {
    const t = title.trim();
    if (!t) return "未命名";
    if (/^《[\s\S]*》$/.test(t)) return t;
    return `《${t}》`;
  }

  function loadMemoryList(
    sec: MemoryPageSection = section,
    docFilter: FileFilter = fileFilter
  ) {
    if (sec === "semantic" || sec === "reading" || sec === "search" || sec === "activity") return;
    let q = "";
    if (sec === "event") q = "?type=event";
    else if (sec === "file") q = docFilter === "leann" ? "?type=leann" : "?type=file";

    apiFetch<{ chunks: MemoryItem[] }>(`/memory${q}`)
      .then((d) => setChunks(d.chunks))
      .catch((e) => setMessage(e.message));
  }

  function loadCoreadBooks() {
    apiFetch<{ books: Array<Omit<CoreadBook, "discussions"> & { discussions: Record<string, unknown>[] }> }>(
      "/coread?detail=1"
    )
      .then((d) =>
        setCoreadBooks(
          (d.books || []).map((book) => ({
            ...book,
            discussions: (book.discussions || []).map((disc) => ({
              ...(disc as Omit<CoreadDiscussion, "userView" | "charView">),
              ...normalizeCoreadViews(disc),
            })),
          }))
        )
      )
      .catch((e) => setMessage(e.message));
  }

  useEffect(() => {
    setSection(parseSectionParam(searchParams.get("section")));
  }, [searchParams]);

  useEffect(() => {
    setEditingId(null);
    setExpandedEventIds(new Set());
    setCoreadEditId(null);
    setDiscussionEdit(null);
    setDraftEdit(null);
    setNewDraftBookId(null);
    setNewDraftText("");
    setMessage("");
    if (section === "reading") loadCoreadBooks();
    else if (section !== "semantic" && section !== "search" && section !== "activity") {
      loadMemoryList(section, fileFilter);
    }
  }, [section, fileFilter]);

  useEffect(() => {
    if (section === "file" && fileFilter === "leann") {
      apiFetch<LeannStatus>("/leann/status")
        .then(setLeannStatus)
        .catch(() => {});
    }
  }, [section, fileFilter]);

  async function ingestLeannFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setMessage("正在解析文件并保存为电子书草稿…");
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const res = await apiFetch<{
        collection: {
          id: string;
          chunkCount: number;
          name: string;
          pageCount?: number;
          sourceFormat?: string;
          status?: string;
        };
      }>("/memory/ingest/leann", {
        method: "POST",
        body: JSON.stringify({
          filename: file.name,
          dataBase64: btoa(binary),
          keysText: leannKeysText,
        }),
      });
      const pageHint =
        res.collection.sourceFormat === "pdf" && res.collection.pageCount
          ? `${res.collection.pageCount} 页 · `
          : "";
      setMessage(
        `✅ 《${res.collection.name}》已存为草稿（${pageHint}未向量化）。请展开编辑全文/切块后再点「向量化」。`
      );
      setLeannKeysText("");
      const status = await apiFetch<LeannStatus>("/leann/status");
      setLeannStatus(status);
      setFileFilter("leann");
      loadMemoryList("file", "leann");
      if (res.collection.id) {
        await openLeannEditor(res.collection.id);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "失败");
    } finally {
      setLoading(false);
      if (leannFileRef.current) leannFileRef.current.value = "";
    }
  }

  async function openLeannEditor(collectionId: string) {
    setLeannBusy(true);
    setMessage("");
    try {
      const res = await apiFetch<{ collection: LeannCollectionDetail }>(
        `/leann/collections/${collectionId}`
      );
      setLeannEditorId(collectionId);
      setLeannDetail(res.collection);
      setLeannFullText(res.collection.fullText || "");
      setLeannPieces(res.collection.pieces || []);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "加载书目失败");
    } finally {
      setLeannBusy(false);
    }
  }

  function closeLeannEditor() {
    setLeannEditorId(null);
    setLeannDetail(null);
    setLeannFullText("");
    setLeannPieces([]);
  }

  async function saveLeannSource() {
    if (!leannEditorId) return;
    setLeannBusy(true);
    setMessage("");
    try {
      const res = await apiFetch<{ collection: LeannCollectionDetail }>(
        `/leann/collections/${leannEditorId}/source`,
        {
          method: "PUT",
          body: JSON.stringify({ text: leannFullText }),
        }
      );
      setLeannDetail(res.collection);
      setLeannFullText(res.collection.fullText || "");
      setMessage("✅ 全文已保存");
      loadMemoryList("file", "leann");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存全文失败");
    } finally {
      setLeannBusy(false);
    }
  }

  async function previewLeannChunks() {
    if (!leannEditorId) return;
    setLeannBusy(true);
    setMessage("");
    try {
      // 先保存全文，避免切块基于旧内容
      await apiFetch(`/leann/collections/${leannEditorId}/source`, {
        method: "PUT",
        body: JSON.stringify({ text: leannFullText }),
      });
      const res = await apiFetch<{ collection: LeannCollectionDetail }>(
        `/leann/collections/${leannEditorId}/preview-chunks`,
        { method: "POST", body: JSON.stringify({}) }
      );
      setLeannDetail(res.collection);
      setLeannFullText(res.collection.fullText || "");
      setLeannPieces(res.collection.pieces || []);
      setMessage(`✅ 已切成 ${res.collection.pieces.length} 段（可逐段修改）`);
      loadMemoryList("file", "leann");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "切块失败");
    } finally {
      setLeannBusy(false);
    }
  }

  async function saveLeannPieces() {
    if (!leannEditorId) return;
    setLeannBusy(true);
    setMessage("");
    try {
      const res = await apiFetch<{ collection: LeannCollectionDetail }>(
        `/leann/collections/${leannEditorId}/chunks`,
        {
          method: "PUT",
          body: JSON.stringify({ pieces: leannPieces }),
        }
      );
      setLeannDetail(res.collection);
      setLeannPieces(res.collection.pieces || []);
      setMessage(`✅ 切块已保存（${res.collection.pieces.length} 段）`);
      loadMemoryList("file", "leann");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存切块失败");
    } finally {
      setLeannBusy(false);
    }
  }

  function mergeLeannPieceWithNext(index: number) {
    setLeannPieces((prev) => {
      if (index < 0 || index >= prev.length - 1) return prev;
      const next = [...prev];
      const merged = `${next[index].trim()}\n\n${next[index + 1].trim()}`.trim();
      next.splice(index, 2, merged);
      return next;
    });
  }

  async function vectorizeLeann() {
    if (!leannEditorId) return;
    setLeannBusy(true);
    setMessage("正在向量化，请稍候…");
    try {
      if (leannPieces.some((p) => p.trim())) {
        await apiFetch(`/leann/collections/${leannEditorId}/chunks`, {
          method: "PUT",
          body: JSON.stringify({ pieces: leannPieces }),
        });
      } else {
        await apiFetch(`/leann/collections/${leannEditorId}/source`, {
          method: "PUT",
          body: JSON.stringify({ text: leannFullText }),
        });
      }
      const res = await apiFetch<{ collection: LeannCollectionDetail }>(
        `/leann/collections/${leannEditorId}/vectorize`,
        { method: "POST", body: JSON.stringify({}) }
      );
      setLeannDetail(res.collection);
      setLeannFullText(res.collection.fullText || "");
      setLeannPieces(res.collection.pieces || []);
      setMessage(
        `✅ 已向量化（${res.collection.pieces.length} 段），聊天时可语义检索`
      );
      const status = await apiFetch<LeannStatus>("/leann/status");
      setLeannStatus(status);
      loadMemoryList("file", "leann");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "向量化失败");
    } finally {
      setLeannBusy(false);
    }
  }

  async function ingestFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setMessage("正在用 DeepSeek 总结…");
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const res = await apiFetch<{ count: number }>("/memory/ingest/file", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, dataBase64: btoa(binary) }),
      });
      setMessage(`✅ 已存入 ${res.count} 条短篇资料（请设置触发关键词）`);
      setFileFilter("summary");
      loadMemoryList("file", "summary");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "失败");
    } finally {
      setLoading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function addManualEvent() {
    if (!manualText.trim()) return;
    setLoading(true);
    try {
      await apiFetch("/memory/ingest/event", {
        method: "POST",
        body: JSON.stringify({
          text: manualText.trim(),
          keysText: manualKeysText,
        }),
      });
      setMessage("✅ 已添加事件记忆");
      setManualText("");
      setManualKeysText("");
      loadMemoryList("event");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "失败");
    } finally {
      setLoading(false);
    }
  }

  function startEdit(c: MemoryItem) {
    if (section === "event") {
      setExpandedEventIds((prev) => new Set(prev).add(c.id));
    }
    setEditingId(c.id);
    setEditText(c.text);
    setEditKeysText(keysToText(c.keys));
    setEditConstant(Boolean(c.constant));
    setEditMemoryAt(toDatetimeLocalValue(c.memoryAt));
    setEditIncludeTime(Boolean(c.includeTimeInPrompt));
  }

  async function saveEdit(id: string) {
    await apiFetch(`/memory/${id}`, {
      method: "PUT",
      body: JSON.stringify({
        text: editText,
        keysText: editKeysText,
        constant: editConstant,
        memoryAt: editMemoryAt ? new Date(editMemoryAt).toISOString() : null,
        includeTimeInPrompt: editIncludeTime,
      }),
    });
    setEditingId(null);
    loadMemoryList();
  }

  async function remove(id: string) {
    if (!confirm("删除此记忆？此操作不可撤销。")) return;
    await apiFetch(`/memory/${id}`, { method: "DELETE" });
    loadMemoryList();
  }

  function toggleEventExpand(id: string) {
    setExpandedEventIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderEventEditForm(c: MemoryItem) {
    return (
      <>
        <textarea
          rows={4}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          style={{ width: "100%" }}
        />
        <div className="field" style={{ marginTop: 8 }}>
          <label>触发关键词（逗号分隔）</label>
          <input
            type="text"
            value={editKeysText}
            onChange={(e) => setEditKeysText(e.target.value)}
            style={{ width: "100%" }}
          />
        </div>
        <div className="field">
          <label>记忆时间（可选）</label>
          <input
            type="datetime-local"
            value={editMemoryAt}
            onChange={(e) => setEditMemoryAt(e.target.value)}
          />
        </div>
        <label className="memory-checkbox-row">
          <input
            type="checkbox"
            checked={editIncludeTime}
            onChange={(e) => setEditIncludeTime(e.target.checked)}
          />
          注入模型上下文时带上记忆时间
        </label>
        <label className="memory-checkbox-row">
          <input
            type="checkbox"
            checked={editConstant}
            onChange={(e) => setEditConstant(e.target.checked)}
          />
          常驻（始终注入，不依赖关键词）
        </label>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button type="button" className="btn btn-primary" onClick={() => saveEdit(c.id)}>
            保存
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => setEditingId(null)}>
            取消
          </button>
        </div>
      </>
    );
  }

  function renderEventMemoryList(emptyHint: string) {
    return (
      <>
        <MemoryListPager
          page={chunksPager.page}
          totalPages={chunksPager.totalPages}
          total={chunksPager.total}
          rangeStart={chunksPager.rangeStart}
          rangeEnd={chunksPager.rangeEnd}
          onPageChange={chunksPager.setPage}
        />

        {chunksPager.pageItems.map((c) => {
          const isEditing = editingId === c.id;
          const isExpanded = isEditing || expandedEventIds.has(c.id);

          return (
            <div
              key={c.id}
              className={`card memory-item worldinfo-item ${isEditing ? "worldinfo-item-editing" : ""} ${isExpanded ? "worldinfo-item-expanded" : "worldinfo-item-collapsed"}`}
            >
              <button
                type="button"
                className="worldinfo-item-summary"
                aria-expanded={isExpanded}
                disabled={isEditing}
                onClick={() => toggleEventExpand(c.id)}
              >
                <span className={`worldinfo-chevron ${isExpanded ? "worldinfo-chevron-open" : ""}`} aria-hidden>
                  ›
                </span>
                <span className="worldinfo-item-memo">{eventEntryTitle(c)}</span>
              </button>

              {isExpanded && (
                <div className="worldinfo-item-body">
                  <div className="memory-item-head">
                    <span className={typeBadgeClass(c.sourceType)}>{c.typeLabel}</span>
                    <span className="hint">{new Date(c.createdAt).toLocaleString("zh-CN")}</span>
                    {c.constant && <span className="memory-badge memory-badge-constant">常驻</span>}
                  </div>
                  {c.memoryAt && (
                    <p className="hint memory-source">
                      记忆时间：{new Date(c.memoryAt).toLocaleString("zh-CN")}
                      {c.includeTimeInPrompt ? " · 会注入上下文" : ""}
                    </p>
                  )}
                  {!c.constant && c.keys && c.keys.length > 0 && (
                    <p className="hint">关键词：{c.keys.join("、")}</p>
                  )}
                  {!c.constant && (!c.keys || c.keys.length === 0) && (
                    <p className="memory-warn">⚠ 未设关键词（对话中不会自动注入）</p>
                  )}

                  {isEditing ? (
                    renderEventEditForm(c)
                  ) : (
                    <>
                      <p className="memory-text">{c.text}</p>
                      <div className="worldinfo-item-actions">
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>
                          编辑
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(c.id)}>
                          删除
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {chunks.length === 0 && (
          <div className="card memory-empty">
            <p className="hint">{emptyHint}</p>
          </div>
        )}

        {message && (
          <p className={message.startsWith("✅") ? "hint" : "error"} style={{ marginTop: 8 }}>
            {message}
          </p>
        )}
      </>
    );
  }

  function renderLeannList(emptyHint: string) {
    return (
      <>
        <MemoryListPager
          page={chunksPager.page}
          totalPages={chunksPager.totalPages}
          total={chunksPager.total}
          rangeStart={chunksPager.rangeStart}
          rangeEnd={chunksPager.rangeEnd}
          unit="本"
          onPageChange={chunksPager.setPage}
        />
        <p className="hint" style={{ marginTop: 0 }}>
          草稿不会进入聊天检索；编辑全文 → 预览切块（可改段、合并）→ 向量化后才会被语义召回。
        </p>

        {chunksPager.pageItems.map((c) => {
          const collectionId = c.leannCollectionId;
          const status = c.leannStatus || "indexed";
          const open = Boolean(collectionId && leannEditorId === collectionId);
          return (
            <div key={c.id} className="card memory-item">
              <div className="memory-item-head">
                <span className={typeBadgeClass(c.sourceType)}>{c.typeLabel}</span>
                <span
                  className={
                    status === "draft"
                      ? "memory-badge memory-badge-draft"
                      : "memory-badge memory-badge-indexed"
                  }
                >
                  {status === "draft" ? "草稿" : "已索引"}
                </span>
                <span className="hint">{new Date(c.createdAt).toLocaleString("zh-CN")}</span>
              </div>
              {c.keys && c.keys.length > 0 && (
                <p className="hint">关键词：{c.keys.join("、")}</p>
              )}
              <p className="memory-text">{c.text}</p>
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                {collectionId && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={leannBusy}
                    onClick={() => (open ? closeLeannEditor() : openLeannEditor(collectionId))}
                  >
                    {open ? "收起编辑" : "编辑全文 / 切块"}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => remove(c.id)}
                  disabled={leannBusy}
                >
                  删除
                </button>
              </div>

              {open && leannDetail && (
                <div className="memory-leann-editor">
                  <div className="field" style={{ marginTop: 12 }}>
                    <label>全文（可删减无关内容后保存）</label>
                    <textarea
                      rows={14}
                      value={leannFullText}
                      onChange={(e) => setLeannFullText(e.target.value)}
                      disabled={leannBusy}
                      style={{ width: "100%", fontFamily: "inherit" }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      disabled={leannBusy}
                      onClick={() => saveLeannSource()}
                    >
                      保存全文
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      disabled={leannBusy}
                      onClick={() => previewLeannChunks()}
                    >
                      预览 / 重新切块
                    </button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={leannBusy}
                      onClick={() => vectorizeLeann()}
                    >
                      {leannDetail.status === "indexed" ? "重新向量化" : "向量化"}
                    </button>
                  </div>

                  {leannPieces.length > 0 ? (
                    <>
                      <p className="hint">
                        共 {leannPieces.length} 段。若某段从中间断开，可改文字或点「与下一段合并」。
                      </p>
                      <div className="memory-leann-pieces">
                        {leannPieces.map((piece, idx) => (
                          <div key={idx} className="memory-leann-piece">
                            <div className="memory-leann-piece-head">
                              <strong>第 {idx + 1} 段</strong>
                              <span className="hint">{piece.length} 字</span>
                              {idx < leannPieces.length - 1 && (
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  disabled={leannBusy}
                                  onClick={() => mergeLeannPieceWithNext(idx)}
                                >
                                  与下一段合并
                                </button>
                              )}
                            </div>
                            <textarea
                              rows={5}
                              value={piece}
                              disabled={leannBusy}
                              onChange={(e) => {
                                const v = e.target.value;
                                setLeannPieces((prev) => {
                                  const next = [...prev];
                                  next[idx] = v;
                                  return next;
                                });
                              }}
                              style={{ width: "100%", fontFamily: "inherit" }}
                            />
                          </div>
                        ))}
                      </div>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        disabled={leannBusy}
                        onClick={() => saveLeannPieces()}
                        style={{ marginTop: 8 }}
                      >
                        保存切块
                      </button>
                    </>
                  ) : (
                    <p className="hint">尚未切块。点「预览 / 重新切块」生成可编辑段落。</p>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {chunks.length === 0 && (
          <div className="card memory-empty">
            <p className="hint">{emptyHint}</p>
          </div>
        )}

        {message && (
          <p className={message.startsWith("✅") ? "hint" : "error"} style={{ marginTop: 8 }}>
            {message}
          </p>
        )}
      </>
    );
  }

  function renderMemoryList(emptyHint: string) {
    return (
      <>
        <MemoryListPager
          page={chunksPager.page}
          totalPages={chunksPager.totalPages}
          total={chunksPager.total}
          rangeStart={chunksPager.rangeStart}
          rangeEnd={chunksPager.rangeEnd}
          onPageChange={chunksPager.setPage}
        />

        {chunksPager.pageItems.map((c) => (
          <div key={c.id} className="card memory-item">
            <div className="memory-item-head">
              <span className={typeBadgeClass(c.sourceType)}>{c.typeLabel}</span>
              <span className="hint">{new Date(c.createdAt).toLocaleString("zh-CN")}</span>
              {c.constant && <span className="memory-badge memory-badge-constant">常驻</span>}
            </div>
            {c.wereadBookTitle && (
              <p className="hint memory-source">书名：{c.wereadBookTitle}</p>
            )}
            {c.memoryAt && (
              <p className="hint memory-source">
                记忆时间：{new Date(c.memoryAt).toLocaleString("zh-CN")}
                {c.includeTimeInPrompt ? " · 会注入上下文" : ""}
              </p>
            )}
            {!c.constant && c.keys && c.keys.length > 0 && (
              <p className="hint">关键词：{c.keys.join("、")}</p>
            )}
            {!c.constant && (!c.keys || c.keys.length === 0) && c.sourceType !== "leann" && (
              <p className="memory-warn">⚠ 未设关键词（对话中不会自动注入）</p>
            )}

            {editingId === c.id ? (
              <>
                <textarea
                  rows={4}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  style={{ width: "100%" }}
                />
                <div className="field" style={{ marginTop: 8 }}>
                  <label>触发关键词（逗号分隔）</label>
                  <input
                    type="text"
                    value={editKeysText}
                    onChange={(e) => setEditKeysText(e.target.value)}
                    style={{ width: "100%" }}
                  />
                </div>
                <div className="field">
                  <label>记忆时间（可选）</label>
                  <input
                    type="datetime-local"
                    value={editMemoryAt}
                    onChange={(e) => setEditMemoryAt(e.target.value)}
                  />
                </div>
                <label className="memory-checkbox-row">
                  <input
                    type="checkbox"
                    checked={editIncludeTime}
                    onChange={(e) => setEditIncludeTime(e.target.checked)}
                  />
                  注入模型上下文时带上记忆时间
                </label>
                <label className="memory-checkbox-row">
                  <input
                    type="checkbox"
                    checked={editConstant}
                    onChange={(e) => setEditConstant(e.target.checked)}
                  />
                  常驻（始终注入，不依赖关键词）
                </label>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn btn-primary" onClick={() => saveEdit(c.id)}>
                    保存
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => setEditingId(null)}>
                    取消
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="memory-text">{c.text}</p>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button type="button" className="btn btn-ghost" onClick={() => startEdit(c)}>
                    编辑
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => remove(c.id)}>
                    删除
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {chunks.length === 0 && (
          <div className="card memory-empty">
            <p className="hint">{emptyHint}</p>
          </div>
        )}

        {message && (
          <p className={message.startsWith("✅") ? "hint" : "error"} style={{ marginTop: 8 }}>
            {message}
          </p>
        )}
      </>
    );
  }

  function renderSemanticSection() {
    return <WorldInfoPanel />;
  }

  function renderEventSection() {
    return (
      <div className="memory-event-stack">
        <div className="card memory-import-section memory-panel-card">
          <ImportBackupPackage
            packageId="memory"
            buttonLabel="从备份导入记忆库"
            hint="可选择备份总 zip 或「记忆库.zip」，仅恢复记忆条目，不影响聊天记录。"
            onSuccess={(msg) => {
              setMessage(msg);
              loadMemoryList("event");
            }}
          />
        </div>

        <div className="card memory-import-section memory-panel-card">
          <EncoreBlockTitle icon={<FileTextOutlined />} color="#a78bfa">
            手动添加事件记忆
          </EncoreBlockTitle>
          <div className="field">
            <label>记忆内容</label>
            <textarea rows={4} value={manualText} onChange={(e) => setManualText(e.target.value)} />
          </div>
          <div className="field">
            <label>触发关键词（逗号分隔，可选）</label>
            <input type="text" value={manualKeysText} onChange={(e) => setManualKeysText(e.target.value)} />
          </div>
          <button type="button" className="btn btn-outline" disabled={loading} onClick={addManualEvent}>
            添加事件记忆
          </button>
        </div>

        {renderEventMemoryList("暂无事件记忆。在聊天中使用「事件总结」，或在上方手动添加。")}
      </div>
    );
  }

  function toggleCoreadExpand(id: string) {
    setExpandedCoreadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function createCoreadBook() {
    const title = newBookTitle.trim();
    if (!title) return;
    setLoading(true);
    try {
      await apiFetch("/coread", {
        method: "POST",
        body: JSON.stringify({ title }),
      });
      setNewBookTitle("");
      setMessage("✅ 已创建共读卡");
      loadCoreadBooks();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "创建失败");
    } finally {
      setLoading(false);
    }
  }

  async function saveCoreadMeta(id: string) {
    setLoading(true);
    try {
      await apiFetch(`/coread/${id}`, {
        method: "PUT",
        body: JSON.stringify({ title: coreadEditTitle, keysText: coreadEditKeys }),
      });
      setCoreadEditId(null);
      setMessage("✅ 已保存");
      loadCoreadBooks();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  async function removeCoreadBook(id: string) {
    if (!confirm("删除此共读卡？草稿与讨论将一并删除，不可撤销。")) return;
    await apiFetch(`/coread/${id}`, { method: "DELETE" });
    loadCoreadBooks();
  }

  async function removeCoreadDraft(bookId: string, draftId: string) {
    if (!confirm("删除这条草稿？")) return;
    await apiFetch(`/coread/${bookId}/drafts/${draftId}`, { method: "DELETE" });
    if (draftEdit?.bookId === bookId && draftEdit.draftId === draftId) setDraftEdit(null);
    loadCoreadBooks();
  }

  async function saveDraftEdit() {
    if (!draftEdit) return;
    setLoading(true);
    try {
      await apiFetch(`/coread/${draftEdit.bookId}/drafts/${draftEdit.draftId}`, {
        method: "PUT",
        body: JSON.stringify({
          text: draftEdit.text,
          clearDigested: draftEdit.wasDigested,
        }),
      });
      setDraftEdit(null);
      setMessage(
        draftEdit.wasDigested
          ? "✅ 草稿已更新，已重新标为待整理"
          : "✅ 草稿已更新"
      );
      loadCoreadBooks();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  async function createManualDraft(bookId: string) {
    const text = newDraftText.trim();
    if (!text) return;
    setLoading(true);
    try {
      await apiFetch(`/coread/${bookId}/drafts`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
      setNewDraftText("");
      setNewDraftBookId(null);
      setMessage("✅ 已新增草稿");
      loadCoreadBooks();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "新增失败");
    } finally {
      setLoading(false);
    }
  }

  async function removeCoreadDiscussion(bookId: string, discussionId: string) {
    if (!confirm("删除这条讨论论点？")) return;
    await apiFetch(`/coread/${bookId}/discussions/${discussionId}`, { method: "DELETE" });
    loadCoreadBooks();
  }

  async function saveDiscussionEdit() {
    if (!discussionEdit) return;
    setLoading(true);
    try {
      await apiFetch(
        `/coread/${discussionEdit.bookId}/discussions/${discussionEdit.discussionId}`,
        {
          method: "PUT",
          body: JSON.stringify({
            claim: discussionEdit.claim,
            ...coreadViewsPayload({
              userView: discussionEdit.userView,
              charView: discussionEdit.charView,
            }),
          }),
        }
      );
      setDiscussionEdit(null);
      setMessage("✅ 论点已更新");
      loadCoreadBooks();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  async function digestCoreadBook(id: string) {
    setLoading(true);
    setMessage("正在整理草稿为讨论论点…");
    try {
      const res = await apiFetch<{ points: number }>(`/coread/${id}/digest`, { method: "POST" });
      setMessage(
        res.points > 0 ? `✅ 已整理出 ${res.points} 条论点（草稿仍保留，可自行删除）` : "✅ 无新论点（可能无未消化草稿）"
      );
      loadCoreadBooks();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "整理失败");
    } finally {
      setLoading(false);
    }
  }

  function renderReadingSection() {
    return (
      <>
        <div className="card memory-import-section">
          <EncoreBlockTitle icon={<BookOutlined />} color="#60a5fa">
            新建共读卡
          </EncoreBlockTitle>
          <div className="field">
            <label>书名（标题）</label>
            <input
              type="text"
              value={newBookTitle}
              onChange={(e) => setNewBookTitle(e.target.value)}
              placeholder="例如：看不见的城市"
            />
          </div>
          <button
            type="button"
            className="btn btn-outline"
            disabled={loading || !newBookTitle.trim()}
            onClick={() => void createCoreadBook()}
          >
            创建共读卡
          </button>
        </div>

        {message && <p className="hint">{message}</p>}
        <MemoryListPager
          page={coreadPager.page}
          totalPages={coreadPager.totalPages}
          total={coreadPager.total}
          rangeStart={coreadPager.rangeStart}
          rangeEnd={coreadPager.rangeEnd}
          unit="张"
          onPageChange={coreadPager.setPage}
        />

        {coreadBooks.length === 0 ? (
          <div className="empty-state">
            <p>暂无共读卡</p>
            <p className="hint">先新建一张，再在聊天里用「记入共读」写入草稿。</p>
          </div>
        ) : (
          coreadPager.pageItems.map((book) => {
            const expanded = expandedCoreadIds.has(book.id);
            const editing = coreadEditId === book.id;
            const composingDraft = newDraftBookId === book.id;
            return (
              <div key={book.id} className="card coread-card">
                <div className="coread-card-toolbar">
                  <span className="memory-badge memory-badge-weread">共读</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => toggleCoreadExpand(book.id)}
                  >
                    {expanded ? "收起" : "展开"}
                  </button>
                </div>

                <h3 className="coread-card-title">{formatCoreadTitle(book.title)}</h3>

                <p className="coread-card-meta hint">
                  草稿 {book.draftCount}
                  {book.pendingDraftCount > 0 ? ` · 待整理 ${book.pendingDraftCount}` : ""}
                  {" · "}讨论 {book.discussionCount}
                </p>

                {!editing && (
                  <p className="coread-card-keys hint">
                    关键词：{(book.keys || []).join("、") || book.title}
                  </p>
                )}

                {editing ? (
                  <div className="coread-card-edit">
                    <div className="field">
                      <label>书名</label>
                      <input
                        type="text"
                        value={coreadEditTitle}
                        onChange={(e) => setCoreadEditTitle(e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>触发关键词（逗号分隔）</label>
                      <input
                        type="text"
                        value={coreadEditKeys}
                        onChange={(e) => setCoreadEditKeys(e.target.value)}
                      />
                    </div>
                    <div className="coread-card-actions">
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        disabled={loading}
                        onClick={() => void saveCoreadMeta(book.id)}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setCoreadEditId(null)}
                      >
                        取消
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="coread-card-actions">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setCoreadEditId(book.id);
                        setCoreadEditTitle(book.title);
                        setCoreadEditKeys((book.keys || []).join(", "));
                        setExpandedCoreadIds((prev) => new Set(prev).add(book.id));
                      }}
                    >
                      编辑
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={loading || book.pendingDraftCount === 0}
                      onClick={() => void digestCoreadBook(book.id)}
                    >
                      立刻整理
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => void removeCoreadBook(book.id)}
                    >
                      删除卡
                    </button>
                  </div>
                )}

                {expanded && (
                  <div className="coread-card-body">
                    <h4 className="coread-section-title">【讨论】</h4>
                    {book.discussions.length === 0 ? (
                      <p className="hint">暂无论点。等双日整理，或点「立刻整理」。</p>
                    ) : (
                      book.discussions.map((d) => {
                        const ed =
                          discussionEdit?.bookId === book.id &&
                          discussionEdit.discussionId === d.id
                            ? discussionEdit
                            : null;
                        return (
                          <div key={d.id} className="coread-entry">
                            {ed ? (
                              <>
                                <div className="field">
                                  <label>论点</label>
                                  <input
                                    type="text"
                                    value={ed.claim}
                                    onChange={(e) =>
                                      setDiscussionEdit({ ...ed, claim: e.target.value })
                                    }
                                  />
                                </div>
                                <div className="field">
                                  <label>你的观点</label>
                                  <textarea
                                    rows={2}
                                    value={ed.userView}
                                    onChange={(e) =>
                                      setDiscussionEdit({ ...ed, userView: e.target.value })
                                    }
                                  />
                                </div>
                                <div className="field">
                                  <label>角色的观点</label>
                                  <textarea
                                    rows={2}
                                    value={ed.charView}
                                    onChange={(e) =>
                                      setDiscussionEdit({ ...ed, charView: e.target.value })
                                    }
                                  />
                                </div>
                                <div className="coread-card-actions">
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    disabled={loading}
                                    onClick={() => void saveDiscussionEdit()}
                                  >
                                    保存论点
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setDiscussionEdit(null)}
                                  >
                                    取消
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <pre className="coread-entry-text">{d.text}</pre>
                                <div className="coread-card-actions">
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() =>
                                      setDiscussionEdit({
                                        bookId: book.id,
                                        discussionId: d.id,
                                        claim: d.claim,
                                        userView: d.userView,
                                        charView: d.charView,
                                      })
                                    }
                                  >
                                    编辑
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => void removeCoreadDiscussion(book.id, d.id)}
                                  >
                                    删除
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })
                    )}

                    <div className="coread-draft-head">
                      <h4 className="coread-section-title">【草稿】</h4>
                      {!composingDraft && (
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => {
                            setNewDraftBookId(book.id);
                            setNewDraftText("");
                            setDraftEdit(null);
                          }}
                        >
                          新建草稿
                        </button>
                      )}
                    </div>

                    {composingDraft && (
                      <div className="coread-entry coread-entry-compose">
                        <div className="field">
                          <label>草稿正文</label>
                          <textarea
                            rows={5}
                            value={newDraftText}
                            onChange={(e) => setNewDraftText(e.target.value)}
                            placeholder="直接写讨论要点或粘贴内容…"
                          />
                        </div>
                        <div className="coread-card-actions">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={loading || !newDraftText.trim()}
                            onClick={() => void createManualDraft(book.id)}
                          >
                            保存草稿
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              setNewDraftBookId(null);
                              setNewDraftText("");
                            }}
                          >
                            取消
                          </button>
                        </div>
                      </div>
                    )}

                    {book.drafts.length === 0 && !composingDraft ? (
                      <p className="hint">暂无草稿。可点「新建草稿」，或在聊天中「记入共读」。</p>
                    ) : (
                      book.drafts.map((draft) => {
                        const ed =
                          draftEdit?.bookId === book.id && draftEdit.draftId === draft.id
                            ? draftEdit
                            : null;
                        return (
                          <div
                            key={draft.id}
                            className={`coread-entry${draft.digestedAt && !ed ? " is-digested" : ""}`}
                          >
                            <p className="hint coread-entry-stamp">
                              {draft.createdAt.slice(0, 16).replace("T", " ")}
                              {draft.digestedAt ? " · 已整理" : " · 待整理"}
                            </p>
                            {ed ? (
                              <>
                                <div className="field">
                                  <textarea
                                    rows={6}
                                    value={ed.text}
                                    onChange={(e) =>
                                      setDraftEdit({ ...ed, text: e.target.value })
                                    }
                                  />
                                </div>
                                {ed.wasDigested && (
                                  <p className="hint">
                                    保存后会重新标为「待整理」，下次双日/立刻整理会再扫入。
                                  </p>
                                )}
                                <div className="coread-card-actions">
                                  <button
                                    type="button"
                                    className="btn btn-primary btn-sm"
                                    disabled={loading || !ed.text.trim()}
                                    onClick={() => void saveDraftEdit()}
                                  >
                                    保存草稿
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => setDraftEdit(null)}
                                  >
                                    取消
                                  </button>
                                </div>
                              </>
                            ) : (
                              <>
                                <pre className="coread-entry-text is-draft">{draft.text}</pre>
                                <div className="coread-card-actions">
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() =>
                                      setDraftEdit({
                                        bookId: book.id,
                                        draftId: draft.id,
                                        text: draft.text,
                                        wasDigested: Boolean(draft.digestedAt),
                                      })
                                    }
                                  >
                                    编辑
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-sm"
                                    onClick={() => void removeCoreadDraft(book.id, draft.id)}
                                  >
                                    删除
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </>
    );
  }

  function renderFileSection() {
    const activeTab = FILE_FILTER_TABS.find((t) => t.id === fileFilter);

    return (
      <>
        <div className="card memory-intro">
          <EncoreBlockTitle icon={<UploadOutlined />} color="#fbbf24">
            资料记忆
          </EncoreBlockTitle>
          <p className="hint" style={{ marginBottom: 0 }}>
            从<strong>本地文件</strong>导入参考资料，两种方式请按篇幅选择：
            <strong>短篇总结</strong>适合笔记、短文（AI 提炼成几条记忆）；
            <strong>电子书索引</strong>适合整本书/PDF（向量语义检索，无需关键词也能翻书找段）。
          </p>
        </div>

        <div className="memory-filter-tabs">
          {FILE_FILTER_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`memory-filter-tab ${fileFilter === tab.id ? "active" : ""}`}
              onClick={() => setFileFilter(tab.id)}
              title={tab.hint}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab && (
          <p className="hint memory-filter-desc">{activeTab.hint}</p>
        )}

        {fileFilter === "leann" && leannStatus && (
          <div className="card memory-leann-status">
            <EncoreBlockTitle icon={<DatabaseOutlined />} color="#14b8a6">
              LEANN 状态
            </EncoreBlockTitle>
            <p className="hint" style={{ marginBottom: 8 }}>
              {leannStatus.enabled ? "已启用" : "未启用（请到设置 → LEANN 打开）"}
              {" · "}
              {leannStatus.probe.ok
                ? `Python 就绪 v${leannStatus.probe.version || "?"}${leannStatus.probe.pdf ? " · PDF 可解析" : " · PDF 需 pip install pymupdf"}`
                : `未就绪：${leannStatus.probe.error || "请 pip install leann pymupdf"}`}
              {" · "}
              已索引 {leannStatus.collections.length} 本书
            </p>
          </div>
        )}

        {fileFilter === "summary" ? (
          <div className="card memory-import-section">
            <EncoreBlockTitle icon={<FileTextOutlined />} color="#fbbf24">
              导入短篇资料
            </EncoreBlockTitle>
            <p className="hint">
              适合篇幅较短的 .txt / .md（如读书笔记、设定集）。文件会经 DeepSeek 分段总结，生成可编辑的记忆条目，请记得设置触发关键词。
            </p>
            <button
              type="button"
              className="btn btn-outline"
              disabled={loading}
              onClick={() => fileRef.current?.click()}
            >
              选择短篇文件
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md"
              onChange={ingestFile}
              disabled={loading}
              style={{ display: "none" }}
            />
          </div>
        ) : (
          <div className="card memory-import-section">
            <EncoreBlockTitle icon={<BookOutlined />} color="#14b8a6">
              导入电子书索引
            </EncoreBlockTitle>
            <p className="hint">
              适合长篇 .txt / .md / 文字版 PDF。上传后先存<strong>草稿全文</strong>，在列表中展开编辑、切块，再点向量化；聊天只会检索已向量化的书。
            </p>
            <div className="field">
              <label>触发关键词（可选，逗号分隔；留空则始终参与语义检索）</label>
              <input
                type="text"
                value={leannKeysText}
                onChange={(e) => setLeannKeysText(e.target.value)}
                placeholder="例如：三体, 叶文洁"
              />
            </div>
            <button
              type="button"
              className="btn btn-outline"
              disabled={loading || !leannStatus?.enabled}
              onClick={() => leannFileRef.current?.click()}
            >
              选择电子书 / PDF
            </button>
            <input
              ref={leannFileRef}
              type="file"
              accept=".txt,.md,.pdf,application/pdf"
              onChange={ingestLeannFile}
              disabled={loading || !leannStatus?.enabled}
              style={{ display: "none" }}
            />
            {!leannStatus?.enabled && (
              <p className="hint" style={{ marginTop: 8 }}>
                请先在「设置 → LEANN 电子书向量索引」中启用。
              </p>
            )}
          </div>
        )}

        {fileFilter === "leann" ? (
          renderLeannList("暂无电子书。聊天确认或上方上传后先存草稿，编辑后再向量化。")
        ) : (
          renderMemoryList("暂无短篇资料。在上方上传 .txt / .md，系统会用 DeepSeek 提炼后入库。")
        )}
      </>
    );
  }

  return (
    <AppShell title="记忆库">
      <div className="memory-page">
        <div className="memory-section-tabs">
          {SECTION_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`memory-section-tab ${section === tab.id ? "active" : ""}`}
              onClick={() => setSection(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {section === "semantic" && renderSemanticSection()}
        {section === "event" && renderEventSection()}
        {section === "activity" && <ActivityPanel />}
        {section === "reading" && renderReadingSection()}
        {section === "file" && renderFileSection()}
        {section === "search" && (
          <MemorySearchPanel
            onOpenLeann={(collectionId) => {
              setSection("file");
              setFileFilter("leann");
              void openLeannEditor(collectionId);
            }}
          />
        )}
      </div>
    </AppShell>
  );
}
