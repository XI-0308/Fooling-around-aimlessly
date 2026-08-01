"use client";

import { useCallback, useState } from "react";
import { SearchOutlined } from "@ant-design/icons";
import EncoreBlockTitle from "@/components/EncoreBlockTitle";
import MemoryListPager from "@/components/MemoryListPager";
import { apiFetch } from "@/lib/api";
import { coreadViewsPayload, normalizeSearchCoreadViews } from "@/lib/coreadViews";
import { usePagedList } from "@/lib/usePagedList";

type SearchKind =
  | "worldinfo"
  | "memory"
  | "coread_book"
  | "coread_discussion"
  | "coread_draft"
  | "activity";

interface WorldInfoEntryPayload {
  id: string;
  memo: string;
  keys: string[];
  secondaryKeys?: string[];
  selectiveLogic?: string;
  content: string;
  order?: number;
  position?: string;
  depth?: number;
  depthRole?: string;
  constant: boolean;
  enabled?: boolean;
  probability?: number;
  scanDepth?: number;
}

interface GlobalSearchHit {
  uid: string;
  kind: SearchKind;
  categoryLabel: string;
  title: string;
  preview: string;
  body?: string;
  keys: string[];
  memoryId?: string;
  sourceType?: string;
  leannCollectionId?: string;
  leannStatus?: "draft" | "indexed";
  worldInfoId?: string;
  worldInfoMemo?: string;
  worldInfoContent?: string;
  worldInfoConstant?: boolean;
  worldInfoEntry?: WorldInfoEntryPayload;
  coreadBookId?: string;
  coreadDraftId?: string;
  coreadDiscussionId?: string;
  coreadClaim?: string;
  coreadUserView?: string;
  coreadCharView?: string;
  /** @deprecated 兼容旧搜索 API */
  coreadXiView?: string;
  /** @deprecated 兼容旧搜索 API */
  coreadSuView?: string;
  activityId?: string;
  activityTitle?: string;
  activityNote?: string;
  activityDate?: string;
}

interface MemorySearchPanelProps {
  /** 跳到资料记忆 → 电子书编辑器 */
  onOpenLeann?: (collectionId: string) => void;
}

export default function MemorySearchPanel({ onOpenLeann }: MemorySearchPanelProps) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<GlobalSearchHit[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string | boolean>>({});
  const [activeQuery, setActiveQuery] = useState("");
  const hitsPager = usePagedList(hits, 10, activeQuery);

  const runSearch = useCallback(async (q?: string) => {
    const text = (q ?? query).trim();
    if (!text) {
      setMessage("请输入关键词");
      return;
    }
    setLoading(true);
    setMessage("");
    setEditingUid(null);
    try {
      const res = await apiFetch<{ hits: GlobalSearchHit[]; total: number }>(
        `/memory/search?q=${encodeURIComponent(text)}&limit=80`
      );
      setHits(res.hits || []);
      setActiveQuery(text);
      setSearched(true);
      setMessage(res.total ? `找到 ${res.total} 条` : "没有匹配结果");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "搜索失败");
    } finally {
      setLoading(false);
    }
  }, [query]);

  function startEdit(hit: GlobalSearchHit) {
    setEditingUid(hit.uid);
    if (hit.kind === "worldinfo") {
      setDraft({
        memo: hit.worldInfoMemo || "",
        content: hit.body || hit.worldInfoContent || "",
        keysText: (hit.keys || []).join(", "),
        constant: Boolean(hit.worldInfoConstant),
      });
    } else if (hit.kind === "memory") {
      setDraft({
        text: hit.body || hit.preview,
        keysText: (hit.keys || []).join(", "),
      });
    } else if (hit.kind === "coread_book") {
      setDraft({
        title: hit.title,
        keysText: (hit.keys || []).join(", "),
      });
    } else if (hit.kind === "coread_discussion") {
      const views = normalizeSearchCoreadViews(hit);
      setDraft({
        claim: hit.coreadClaim || "",
        userView: views.userView,
        charView: views.charView,
      });
    } else if (hit.kind === "coread_draft") {
      setDraft({ text: hit.body || hit.preview });
    } else if (hit.kind === "activity") {
      setDraft({
        title: hit.activityTitle || hit.title,
        note: hit.activityNote || "",
      });
    }
  }

  async function saveEdit(hit: GlobalSearchHit) {
    setLoading(true);
    setMessage("");
    try {
      if (hit.kind === "worldinfo" && hit.worldInfoId) {
        const base = hit.worldInfoEntry || {
          id: hit.worldInfoId,
          memo: "",
          keys: [],
          secondaryKeys: [],
          selectiveLogic: "and_any",
          content: "",
          order: 100,
          position: "after_char_defs",
          depth: 0,
          depthRole: "system",
          constant: false,
          enabled: true,
          probability: 100,
          scanDepth: 0,
        };
        await apiFetch("/worldinfo/entries", {
          method: "POST",
          body: JSON.stringify({
            ...base,
            id: hit.worldInfoId,
            memo: String(draft.memo || ""),
            content: String(draft.content || ""),
            keys: String(draft.keysText || "")
              .split(/[,，]/)
              .map((k) => k.trim())
              .filter(Boolean),
            constant: Boolean(draft.constant),
          }),
        });
      } else if (hit.kind === "memory" && hit.memoryId) {
        await apiFetch(`/memory/${hit.memoryId}`, {
          method: "PUT",
          body: JSON.stringify({
            text: String(draft.text || ""),
            keysText: String(draft.keysText || ""),
          }),
        });
      } else if (hit.kind === "coread_book" && hit.coreadBookId) {
        await apiFetch(`/coread/${hit.coreadBookId}`, {
          method: "PUT",
          body: JSON.stringify({
            title: String(draft.title || ""),
            keysText: String(draft.keysText || ""),
          }),
        });
      } else if (
        hit.kind === "coread_discussion" &&
        hit.coreadBookId &&
        hit.coreadDiscussionId
      ) {
        await apiFetch(
          `/coread/${hit.coreadBookId}/discussions/${hit.coreadDiscussionId}`,
          {
            method: "PUT",
            body: JSON.stringify({
              claim: String(draft.claim || ""),
              ...coreadViewsPayload({
                userView: String(draft.userView || ""),
                charView: String(draft.charView || ""),
              }),
            }),
          }
        );
      } else if (hit.kind === "coread_draft" && hit.coreadBookId && hit.coreadDraftId) {
        await apiFetch(`/coread/${hit.coreadBookId}/drafts/${hit.coreadDraftId}`, {
          method: "PUT",
          body: JSON.stringify({ text: String(draft.text || "") }),
        });
      } else if (hit.kind === "activity" && hit.activityId) {
        await apiFetch(`/activity/${hit.activityId}`, {
          method: "PUT",
          body: JSON.stringify({
            title: String(draft.title || ""),
            note: String(draft.note || ""),
          }),
        });
      } else {
        throw new Error("此条目请到对应分区编辑全文");
      }
      setEditingUid(null);
      setMessage("已保存");
      await runSearch(query);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setLoading(false);
    }
  }

  async function removeHit(hit: GlobalSearchHit) {
    if (!confirm(`删除「${hit.title}」？此操作不可撤销。`)) return;
    setLoading(true);
    setMessage("");
    try {
      if (hit.kind === "worldinfo" && hit.worldInfoId) {
        await apiFetch(`/worldinfo/entries/${hit.worldInfoId}`, { method: "DELETE" });
      } else if (hit.kind === "memory" && hit.memoryId) {
        await apiFetch(`/memory/${hit.memoryId}`, { method: "DELETE" });
      } else if (hit.kind === "memory" && hit.leannCollectionId && !hit.memoryId) {
        await apiFetch(`/leann/collections/${hit.leannCollectionId}`, { method: "DELETE" });
      } else if (hit.kind === "coread_book" && hit.coreadBookId) {
        await apiFetch(`/coread/${hit.coreadBookId}`, { method: "DELETE" });
      } else if (
        hit.kind === "coread_discussion" &&
        hit.coreadBookId &&
        hit.coreadDiscussionId
      ) {
        await apiFetch(
          `/coread/${hit.coreadBookId}/discussions/${hit.coreadDiscussionId}`,
          { method: "DELETE" }
        );
      } else if (hit.kind === "coread_draft" && hit.coreadBookId && hit.coreadDraftId) {
        await apiFetch(`/coread/${hit.coreadBookId}/drafts/${hit.coreadDraftId}`, {
          method: "DELETE",
        });
      } else if (hit.kind === "activity" && hit.activityId) {
        await apiFetch(`/activity/${hit.activityId}`, { method: "DELETE" });
      } else {
        throw new Error("无法删除此条目");
      }
      if (editingUid === hit.uid) setEditingUid(null);
      setMessage("已删除");
      await runSearch(query);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "删除失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="card memory-intro">
        <EncoreBlockTitle icon={<SearchOutlined />} color="#38bdf8">
          全局搜索
        </EncoreBlockTitle>
        <p className="hint" style={{ marginBottom: 12 }}>
          在整个记忆库中查找条目（语意、事件、读书共读、资料短篇、电子书全文、近期活动），找到后可直接修改或删除。
        </p>
        <div className="memory-global-search-bar">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
            placeholder="输入关键词，如角色名、书名、事件片段…"
            disabled={loading}
          />
          <button
            type="button"
            className="btn btn-primary"
            disabled={loading || !query.trim()}
            onClick={() => void runSearch()}
          >
            {loading ? "搜索中…" : "搜索"}
          </button>
        </div>
        {message && <p className="hint" style={{ marginTop: 8, marginBottom: 0 }}>{message}</p>}
      </div>

      {searched && (
        <div className="memory-list">
          {hits.length === 0 ? (
            <p className="hint">没有匹配结果，换个词试试。</p>
          ) : (
            <>
            <MemoryListPager
              page={hitsPager.page}
              totalPages={hitsPager.totalPages}
              total={hitsPager.total}
              rangeStart={hitsPager.rangeStart}
              rangeEnd={hitsPager.rangeEnd}
              onPageChange={hitsPager.setPage}
            />
            {hitsPager.pageItems.map((hit) => {
              const editing = editingUid === hit.uid;
              const isLeann = Boolean(hit.leannCollectionId);
              return (
                <div key={hit.uid} className="card memory-item">
                  <div className="memory-item-head">
                    <div>
                      <span className="memory-badge memory-badge-event">{hit.categoryLabel}</span>
                      {hit.leannStatus && (
                        <span
                          className={`memory-badge ${
                            hit.leannStatus === "indexed"
                              ? "memory-badge-leann"
                              : "memory-badge-file"
                          }`}
                          style={{ marginLeft: 6 }}
                        >
                          {hit.leannStatus === "indexed" ? "已向量化" : "草稿"}
                        </span>
                      )}
                      <strong style={{ marginLeft: 8 }}>{hit.title}</strong>
                    </div>
                    <div className="memory-item-actions">
                      {!editing && (
                        <>
                          {(hit.kind !== "memory" || hit.memoryId || !isLeann) && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={loading}
                              onClick={() => startEdit(hit)}
                            >
                              编辑
                            </button>
                          )}
                          {isLeann && onOpenLeann && hit.leannCollectionId && (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={loading}
                              onClick={() => onOpenLeann(hit.leannCollectionId!)}
                            >
                              编辑电子书
                            </button>
                          )}
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={loading}
                            onClick={() => void removeHit(hit)}
                          >
                            删除
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {!editing ? (
                    <>
                      {hit.keys?.length > 0 && (
                        <p className="hint" style={{ marginBottom: 6 }}>
                          关键词：{hit.keys.join("、")}
                        </p>
                      )}
                      <p className="memory-preview">{hit.preview || "（无预览）"}</p>
                    </>
                  ) : (
                    <div className="memory-edit-form">
                      {hit.kind === "worldinfo" && (
                        <>
                          <div className="field">
                            <label>备注 / 标题</label>
                            <input
                              type="text"
                              value={String(draft.memo || "")}
                              onChange={(e) => setDraft((d) => ({ ...d, memo: e.target.value }))}
                            />
                          </div>
                          <div className="field">
                            <label>关键词</label>
                            <input
                              type="text"
                              value={String(draft.keysText || "")}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, keysText: e.target.value }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>内容</label>
                            <textarea
                              rows={6}
                              value={String(draft.content || "")}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, content: e.target.value }))
                              }
                            />
                          </div>
                          <label className="memory-check">
                            <input
                              type="checkbox"
                              checked={Boolean(draft.constant)}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, constant: e.target.checked }))
                              }
                            />
                            常驻注入
                          </label>
                        </>
                      )}
                      {hit.kind === "memory" && (
                        <>
                          <div className="field">
                            <label>关键词</label>
                            <input
                              type="text"
                              value={String(draft.keysText || "")}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, keysText: e.target.value }))
                              }
                            />
                          </div>
                          <div className="field">
                            <label>正文</label>
                            <textarea
                              rows={6}
                              value={String(draft.text || "")}
                              onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                            />
                          </div>
                          {isLeann && (
                            <p className="hint">
                              电子书全文请点「编辑电子书」；此处改的是记忆壳关键词与摘要。
                            </p>
                          )}
                        </>
                      )}
                      {hit.kind === "coread_book" && (
                        <>
                          <div className="field">
                            <label>书名</label>
                            <input
                              type="text"
                              value={String(draft.title || "")}
                              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                            />
                          </div>
                          <div className="field">
                            <label>关键词</label>
                            <input
                              type="text"
                              value={String(draft.keysText || "")}
                              onChange={(e) =>
                                setDraft((d) => ({ ...d, keysText: e.target.value }))
                              }
                            />
                          </div>
                        </>
                      )}
                      {hit.kind === "coread_discussion" && (
                        <>
                          <div className="field">
                            <label>主张</label>
                            <input
                              type="text"
                              value={String(draft.claim || "")}
                              onChange={(e) => setDraft((d) => ({ ...d, claim: e.target.value }))}
                            />
                          </div>
                          <div className="field">
                            <label>你的看法</label>
                            <textarea
                              rows={3}
                              value={String(draft.userView || "")}
                              onChange={(e) => setDraft((d) => ({ ...d, userView: e.target.value }))}
                            />
                          </div>
                          <div className="field">
                            <label>角色的看法</label>
                            <textarea
                              rows={3}
                              value={String(draft.charView || "")}
                              onChange={(e) => setDraft((d) => ({ ...d, charView: e.target.value }))}
                            />
                          </div>
                        </>
                      )}
                      {hit.kind === "coread_draft" && (
                        <div className="field">
                          <label>草稿</label>
                          <textarea
                            rows={6}
                            value={String(draft.text || "")}
                            onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
                          />
                        </div>
                      )}
                      {hit.kind === "activity" && (
                        <>
                          <div className="field">
                            <label>标题</label>
                            <input
                              type="text"
                              value={String(draft.title || "")}
                              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                            />
                          </div>
                          <div className="field">
                            <label>备注</label>
                            <textarea
                              rows={3}
                              value={String(draft.note || "")}
                              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
                            />
                          </div>
                        </>
                      )}
                      <div className="memory-item-actions" style={{ marginTop: 8 }}>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={loading}
                          onClick={() => void saveEdit(hit)}
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={loading}
                          onClick={() => setEditingUid(null)}
                        >
                          取消
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            </>
          )}
        </div>
      )}
    </>
  );
}
