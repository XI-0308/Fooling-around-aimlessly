"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type PersonaCategory =
  | "traits"
  | "behaviors"
  | "values"
  | "emotions"
  | "social"
  | "cognition"
  | "motives"
  | "expressions";

interface PersonaEntry {
  id: string;
  category: PersonaCategory;
  content: string;
  evidence: string;
  createdAt: string;
  updatedAt: string;
}

interface CategoryMeta {
  id: PersonaCategory;
  label: string;
}

interface LastDigest {
  at: string;
  wrote: number;
  reason?: string;
  source: "manual" | "scheduled";
}

function formatUpdatedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDigestStatus(last: LastDigest | null): string {
  if (!last) return "尚未整理过";
  const when = formatUpdatedAt(last.at);
  const source = last.source === "manual" ? "手动" : "自动";
  if (last.wrote > 0) {
    return `上次整理 ${when}（${source}）· 写入 ${last.wrote} 条`;
  }
  const tip = last.reason?.trim() || "本轮无新条目";
  return `上次整理 ${when}（${source}）· ${tip}`;
}

export default function PersonaPortraitPanel() {
  const [categories, setCategories] = useState<CategoryMeta[]>([]);
  const [byCategory, setByCategory] = useState<Record<string, PersonaEntry[]>>({});
  const [openCat, setOpenCat] = useState<PersonaCategory | null>("traits");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [lastDigest, setLastDigest] = useState<LastDigest | null>(null);
  const [draft, setDraft] = useState<{ content: string; evidence: string }>({
    content: "",
    evidence: "",
  });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ content: "", evidence: "" });
  const [nightlyEnabled, setNightlyEnabled] = useState(true);
  const [toggleBusy, setToggleBusy] = useState(false);

  const reload = useCallback(async () => {
    const [personaRes, settingsRes] = await Promise.all([
      apiFetch<{
        categories: CategoryMeta[];
        byCategory: Record<string, PersonaEntry[]>;
        lastDigest?: LastDigest | null;
      }>("/persona"),
      apiFetch<{ personaDigestEnabled?: boolean }>("/settings"),
    ]);
    setCategories(personaRes.categories);
    setByCategory(personaRes.byCategory || {});
    setLastDigest(personaRes.lastDigest || null);
    setNightlyEnabled(settingsRes.personaDigestEnabled !== false);
  }, []);

  useEffect(() => {
    setLoading(true);
    reload()
      .catch((err) => setMsg(err instanceof Error ? err.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [reload]);

  async function toggleNightly(next: boolean) {
    setToggleBusy(true);
    setMsg("");
    try {
      await apiFetch("/settings", {
        method: "PUT",
        body: JSON.stringify({ personaDigestEnabled: next }),
      });
      setNightlyEnabled(next);
      setMsg(next ? "已开启夜间自动归纳" : "已关闭夜间自动归纳");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "开关保存失败");
    } finally {
      setToggleBusy(false);
    }
  }

  async function createEntry() {
    if (!openCat || !draft.content.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      await apiFetch(`/persona/${openCat}`, {
        method: "POST",
        body: JSON.stringify({
          content: draft.content.trim(),
          evidence: draft.evidence.trim(),
        }),
      });
      setDraft({ content: "", evidence: "" });
      await reload();
      setMsg("已添加");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "添加失败");
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(category: PersonaCategory, id: string) {
    if (!editForm.content.trim()) return;
    setBusy(true);
    setMsg("");
    try {
      await apiFetch(`/persona/${category}/${id}`, {
        method: "PUT",
        body: JSON.stringify({
          content: editForm.content.trim(),
          evidence: editForm.evidence.trim(),
        }),
      });
      setEditingId(null);
      await reload();
      setMsg("已保存");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function removeEntry(category: PersonaCategory, id: string) {
    if (!window.confirm("删除这条人格画像？")) return;
    setBusy(true);
    setMsg("");
    try {
      await apiFetch(`/persona/${category}/${id}`, { method: "DELETE" });
      await reload();
      setMsg("已删除");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  async function runDigest() {
    setBusy(true);
    setMsg("");
    try {
      const res = await apiFetch<{
        wrote: number;
        reason?: string;
        lastDigest?: LastDigest;
        observations?: { category: PersonaCategory; content: string }[];
      }>("/persona/digest", {
        method: "POST",
      });
      await reload();
      if (res.lastDigest) setLastDigest(res.lastDigest);
      if (res.wrote > 0) {
        const cats = [...new Set((res.observations || []).map((o) => o.category))];
        if (cats[0]) setOpenCat(cats[0]);
      }
      setMsg("");
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "整理失败");
    } finally {
      setBusy(false);
    }
  }

  const openEntries = openCat ? byCategory[openCat] || [] : [];

  return (
    <div className="persona-portrait">
      <div className="persona-portrait-head">
        <h3 className="persona-portrait-title">人格画像</h3>
        <div className="persona-portrait-head-actions">
          <label className="persona-portrait-toggle" title="关闭后每晚不再自动归纳，仍可点「立刻整理」">
            <input
              type="checkbox"
              checked={nightlyEnabled}
              disabled={toggleBusy || loading}
              onChange={(e) => void toggleNightly(e.target.checked)}
            />
            <span>夜间自动归纳</span>
          </label>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={busy || loading}
            onClick={() => void runDigest()}
          >
            立刻整理
          </button>
        </div>
      </div>
      <div className="persona-portrait-status" role="status" aria-live="polite">
        {busy && !msg
          ? "整理中…"
          : `${formatDigestStatus(lastDigest)}${
              nightlyEnabled ? "" : " · 夜间自动归纳已关"
            }`}
        {msg ? <span className="persona-portrait-status-flash"> · {msg}</span> : null}
      </div>
      {loading ? (
        <p className="hint">加载中…</p>
      ) : (
        <>
          <div className="persona-portrait-tabs" role="tablist">
            {categories.map((c) => {
              const count = (byCategory[c.id] || []).length;
              const active = openCat === c.id;
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  className={`persona-portrait-tab ${active ? "is-active" : ""}`}
                  onClick={() => {
                    setOpenCat(c.id);
                    setEditingId(null);
                  }}
                >
                  {c.label}
                  {count > 0 ? <span className="persona-portrait-count">{count}</span> : null}
                </button>
              );
            })}
          </div>

          {openCat ? (
            <div className="persona-portrait-body">
              {openEntries.length === 0 ? (
                <div className="empty-state empty-state-compact">
                  <p>此目录暂无条目</p>
                  <p className="hint">可点「立刻整理」，或在下方手动新增。</p>
                </div>
              ) : (
                <ul className="persona-portrait-list">
                  {openEntries.map((e) => (
                    <li key={e.id} className="persona-portrait-item">
                      {editingId === e.id ? (
                        <>
                          <label className="field">
                            <span>条目内容</span>
                            <textarea
                              rows={3}
                              value={editForm.content}
                              onChange={(ev) =>
                                setEditForm((f) => ({ ...f, content: ev.target.value }))
                              }
                            />
                          </label>
                          <label className="field">
                            <span>证据</span>
                            <textarea
                              rows={2}
                              value={editForm.evidence}
                              onChange={(ev) =>
                                setEditForm((f) => ({ ...f, evidence: ev.target.value }))
                              }
                            />
                          </label>
                          <div className="persona-portrait-item-actions">
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              disabled={busy}
                              onClick={() => void saveEdit(openCat, e.id)}
                            >
                              保存
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busy}
                              onClick={() => setEditingId(null)}
                            >
                              取消
                            </button>
                          </div>
                        </>
                      ) : (
                        <>
                          <p className="persona-portrait-content">{e.content}</p>
                          {e.evidence ? (
                            <p className="persona-portrait-evidence">证据：{e.evidence}</p>
                          ) : null}
                          <p className="persona-portrait-meta">
                            最近修改 {formatUpdatedAt(e.updatedAt)}
                          </p>
                          <div className="persona-portrait-item-actions">
                            <button
                              type="button"
                              className="btn btn-outline btn-sm"
                              disabled={busy}
                              onClick={() => {
                                setEditingId(e.id);
                                setEditForm({ content: e.content, evidence: e.evidence });
                              }}
                            >
                              编辑
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              disabled={busy}
                              onClick={() => void removeEntry(openCat, e.id)}
                            >
                              删除
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              <div className="persona-portrait-add">
                <label className="field">
                  <span>新增条目</span>
                  <textarea
                    rows={3}
                    value={draft.content}
                    placeholder="你在这类上的稳定认识…"
                    onChange={(ev) => setDraft((d) => ({ ...d, content: ev.target.value }))}
                  />
                </label>
                <label className="field">
                  <span>证据（可选，不注入对话）</span>
                  <textarea
                    rows={2}
                    value={draft.evidence}
                    placeholder="依据的对话摘录…"
                    onChange={(ev) => setDraft((d) => ({ ...d, evidence: ev.target.value }))}
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  disabled={busy || !draft.content.trim()}
                  onClick={() => void createEntry()}
                >
                  添加到此目录
                </button>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
