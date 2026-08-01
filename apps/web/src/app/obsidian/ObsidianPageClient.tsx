"use client";

import { useCallback, useEffect, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";

type ThoughtRole = "user" | "char" | "xi" | "su";

type Thought = {
  role: ThoughtRole;
  text: string;
  date?: string;
  at?: string;
};

function isUserThought(role: ThoughtRole): boolean {
  return role === "user" || role === "xi";
}

type Recent = {
  relPath: string;
  title: string;
  excerpt: string;
  at: string;
  openUri?: string | null;
  chatId?: string;
  thread?: Thought[];
};

type Status = {
  enabled: boolean;
  vaultConfigured: boolean;
  vaultPath: string;
  efSuNoteCount: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  recentComments: Recent[];
};

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return iso;
  }
}

function thoughtLabel(role: ThoughtRole): string {
  return isUserThought(role) ? "你的思考" : "角色的思考";
}

function thoughtStamp(m: Thought): string {
  return (m.at || m.date || "").trim();
}

function previewLine(item: Recent): string {
  const last = item.thread?.length ? item.thread[item.thread.length - 1] : null;
  if (last) {
    const one = last.text.replace(/\s+/g, " ").trim();
    return `${thoughtLabel(last.role)}：${one.slice(0, 72)}${one.length > 72 ? "…" : ""}`;
  }
  const ex = (item.excerpt || "").replace(/\s+/g, " ").trim();
  return ex ? `角色的思考：${ex.slice(0, 72)}${ex.length > 72 ? "…" : ""}` : "暂无留言";
}

export default function ObsidianPageClient() {
  const [status, setStatus] = useState<Status | null>(null);
  const [recent, setRecent] = useState<Recent[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [replyingKey, setReplyingKey] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ relPath: string; index: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newText, setNewText] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);

  const refresh = useCallback(async (opts?: { quiet?: boolean }) => {
    setError("");
    try {
      const [s, r] = await Promise.all([
        apiFetch<Status>("/obsidian/status"),
        apiFetch<{ recentComments: Recent[] }>("/obsidian/recent"),
      ]);
      setStatus(s);
      setRecent(r.recentComments || s.recentComments || []);
      if (!opts?.quiet) setMessage(`已刷新 · ${new Date().toLocaleTimeString("zh-CN", { hour12: false })}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "加载失败");
    }
  }, []);

  useEffect(() => {
    void refresh({ quiet: true });
  }, [refresh]);

  function patchThread(relPath: string, thread: Thought[], excerpt?: string) {
    setRecent((prev) =>
      prev.map((x) =>
        x.relPath === relPath
          ? {
              ...x,
              thread,
              excerpt: excerpt ?? x.excerpt,
              at: new Date().toISOString(),
            }
          : x
      )
    );
  }

  async function sendReply(item: Recent) {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const r = await apiFetch<{ thread: Thought[] }>("/obsidian/reply", {
        method: "POST",
        body: JSON.stringify({ relPath: item.relPath, text }),
      });
      patchThread(item.relPath, r.thread, text.slice(0, 120));
      setDraft("");
      setReplyingKey(null);
      setMessage("已写入你的思考");
    } catch (e) {
      alert(e instanceof Error ? e.message : "回复失败");
    } finally {
      setSending(false);
    }
  }

  async function saveEdit(item: Recent) {
    if (!editing || sending) return;
    const text = draft.trim();
    if (!text) return;
    setSending(true);
    try {
      const r = await apiFetch<{ thread: Thought[] }>("/obsidian/thought/edit", {
        method: "POST",
        body: JSON.stringify({ relPath: item.relPath, index: editing.index, text }),
      });
      patchThread(item.relPath, r.thread, text.slice(0, 120));
      setDraft("");
      setEditing(null);
      setMessage("已保存修改");
    } catch (e) {
      alert(e instanceof Error ? e.message : "修改失败");
    } finally {
      setSending(false);
    }
  }

  async function createTopic() {
    const title = newTitle.trim();
    if (!title || creatingBusy) return;
    setCreatingBusy(true);
    try {
      const r = await apiFetch<{
        relPath: string;
        title: string;
        thread: Thought[];
        openUri?: string | null;
      }>("/obsidian/thought/create", {
        method: "POST",
        body: JSON.stringify({ title, text: newText.trim() || undefined }),
      });
      setRecent((prev) => [
        {
          relPath: r.relPath,
          title: r.title,
          excerpt: (r.thread[0]?.text || "（新话题，还没有思考）").slice(0, 120),
          at: new Date().toISOString(),
          openUri: r.openUri,
          thread: r.thread,
        },
        ...prev.filter((x) => x.relPath !== r.relPath),
      ]);
      setNewTitle("");
      setNewText("");
      setCreating(false);
      setOpenKey(r.relPath);
      setMessage(`已新建「${r.title}」`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "创建失败");
    } finally {
      setCreatingBusy(false);
    }
  }

  return (
    <AppShell title="慢思考 · Obsidian">
      <div className="obsidian-page">
        <p className="hint">
          知识库在 Obsidian 里；这里跟进留言也会写回本地库。配置在{" "}
          <a href="/settings">设置 → Obsidian · 慢思考</a>。
        </p>
        {error && <p className="error">{error}</p>}
        {message && !error && <p className="hint obsidian-flash">{message}</p>}
        {status && (
          <ul className="hint obsidian-status">
            <li>接入：{status.enabled ? "已启用" : "未启用"}</li>
            <li>Vault：{status.vaultConfigured ? status.vaultPath : "未配置或无效"}</li>
            <li>可留言笔记：{status.efSuNoteCount}</li>
            <li>上次夜间任务：{formatWhen(status.lastRunAt)}</li>
            <li>预计下次：{formatWhen(status.nextRunAt)}</li>
          </ul>
        )}
        <div className="obsidian-actions">
          <button
            type="button"
            className="btn btn-ghost"
            disabled={refreshing}
            onClick={async () => {
              setRefreshing(true);
              setMessage("");
              try {
                await refresh();
              } finally {
                setRefreshing(false);
              }
            }}
          >
            {refreshing ? "刷新中…" : "刷新"}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={!status?.enabled}
            onClick={() => {
              setCreating((v) => !v);
              setMessage("");
            }}
          >
            {creating ? "收起新建" : "新建思考"}
          </button>
          <button
            type="button"
            className="btn btn-outline"
            disabled={busy || !status?.enabled}
            onClick={async () => {
              setBusy(true);
              setMessage("");
              try {
                const r = await apiFetch<{
                  commented?: { title: string }[];
                  errors?: string[];
                  skippedReason?: string;
                }>("/obsidian/nightly/run", { method: "POST", body: "{}" });
                if (r.skippedReason) {
                  setMessage(`跳过：${r.skippedReason}`);
                } else if ((r.commented?.length ?? 0) === 0 && !(r.errors?.length)) {
                  setMessage(
                    "本轮没有新留言：今天角色已留过，且留言后还没有新的「你的思考」跟进（或没有待留言笔记）。"
                  );
                } else {
                  const errHint = r.errors?.length
                    ? `；错误 ${r.errors.length}：${r.errors.slice(0, 2).join("；")}`
                    : "";
                  setMessage(`留言 ${r.commented?.length ?? 0} 篇${errHint}`);
                }
                await refresh({ quiet: true });
              } catch (e) {
                setMessage(e instanceof Error ? e.message : "失败");
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "执行中…" : "立即留言一轮"}
          </button>
        </div>

        {creating && (
          <div className="field obsidian-compose obsidian-create">
            <label>标题</label>
            <input
              type="text"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="例如：幻觉"
              disabled={creatingBusy}
            />
            <label style={{ marginTop: 8, display: "block" }}>第一条思考（可选）</label>
            <textarea
              value={newText}
              onChange={(e) => setNewText(e.target.value)}
              rows={4}
              placeholder="写下你此刻的想法…"
              disabled={creatingBusy}
            />
            <div className="obsidian-compose-actions">
              <button
                type="button"
                className="btn btn-outline"
                disabled={creatingBusy || !newTitle.trim()}
                onClick={() => void createTopic()}
              >
                {creatingBusy ? "创建中…" : "创建"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={creatingBusy}
                onClick={() => {
                  setCreating(false);
                  setNewTitle("");
                  setNewText("");
                }}
              >
                取消
              </button>
            </div>
          </div>
        )}

        <h3 className="obsidian-heading">最近留言</h3>
        {recent.length === 0 ? (
          <p className="hint">暂无。跑一轮夜间留言，或聊天里「沉淀到 Obsidian」。</p>
        ) : (
          <ul className="obsidian-feed">
            {recent.map((item) => {
              const key = item.relPath;
              const expanded = openKey === key;
              const replying = replyingKey === key;
              const thread = item.thread?.length
                ? item.thread
                : item.excerpt
                  ? [{ role: "char" as const, text: item.excerpt }]
                  : [];
              return (
                <li key={key} className="obsidian-item">
                  <button
                    type="button"
                    className="obsidian-item-toggle"
                    onClick={() => {
                      setOpenKey(expanded ? null : key);
                      if (expanded) {
                        setReplyingKey(null);
                        setEditing(null);
                        setDraft("");
                      }
                    }}
                  >
                    <span aria-hidden className="obsidian-chevron">
                      {expanded ? "▾" : "▸"}
                    </span>
                    <span className="obsidian-item-main">
                      <span className="obsidian-item-title">{item.title}</span>
                      {!expanded && <span className="hint obsidian-item-preview">{previewLine(item)}</span>}
                    </span>
                  </button>

                  {expanded && (
                    <div className="obsidian-item-body">
                      <div className="hint obsidian-item-meta">
                        {item.relPath} · {formatWhen(item.at)}
                      </div>
                      {thread.length === 0 ? (
                        <p className="hint">还没有留言。</p>
                      ) : (
                        thread.map((m, i) => {
                          const isEditing =
                            editing?.relPath === item.relPath && editing.index === i;
                          const stamp = thoughtStamp(m);
                          return (
                            <div key={`${m.role}-${i}-${stamp}`} className="obsidian-thought">
                              <div className="obsidian-thought-head">
                                <strong>{thoughtLabel(m.role)}</strong>
                                {stamp ? <span className="hint">{stamp}</span> : null}
                              </div>
                              {isEditing ? (
                                <div className="field obsidian-compose">
                                  <textarea
                                    value={draft}
                                    onChange={(e) => setDraft(e.target.value)}
                                    rows={4}
                                    autoFocus
                                  />
                                  <div className="obsidian-compose-actions">
                                    <button
                                      type="button"
                                      className="btn btn-outline"
                                      disabled={sending || !draft.trim()}
                                      onClick={() => void saveEdit(item)}
                                    >
                                      {sending ? "保存中…" : "保存"}
                                    </button>
                                    <button
                                      type="button"
                                      className="btn btn-ghost"
                                      disabled={sending}
                                      onClick={() => {
                                        setEditing(null);
                                        setDraft("");
                                      }}
                                    >
                                      取消
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <p className="obsidian-thought-text">{m.text}</p>
                                  {isUserThought(m.role) && !replying && !editing ? (
                                    <button
                                      type="button"
                                      className="btn btn-ghost obsidian-edit-btn"
                                      onClick={() => {
                                        setReplyingKey(null);
                                        setEditing({ relPath: item.relPath, index: i });
                                        setDraft(m.text);
                                      }}
                                    >
                                      修改
                                    </button>
                                  ) : null}
                                </>
                              )}
                            </div>
                          );
                        })
                      )}

                      {replying ? (
                        <div className="field obsidian-compose">
                          <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            rows={4}
                            placeholder="写下你的思考…"
                            autoFocus
                          />
                          <div className="obsidian-compose-actions">
                            <button
                              type="button"
                              className="btn btn-outline"
                              disabled={sending || !draft.trim()}
                              onClick={() => void sendReply(item)}
                            >
                              {sending ? "写入中…" : "发送"}
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost"
                              disabled={sending}
                              onClick={() => {
                                setReplyingKey(null);
                                setDraft("");
                              }}
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : !editing ? (
                        <div className="obsidian-compose-actions">
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => {
                              setEditing(null);
                              setReplyingKey(key);
                              setDraft("");
                            }}
                          >
                            回复
                          </button>
                          {item.chatId ? (
                            <a href={`/chat/${item.chatId}`} className="btn btn-ghost">
                              打开原对话
                            </a>
                          ) : (
                            <span className="hint" title="从聊天「沉淀到 Obsidian」的话题会带上对话链接">
                              无关联对话
                            </span>
                          )}
                          {item.openUri ? (
                            <a href={item.openUri} className="hint">
                              在 Obsidian 中打开
                            </a>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
