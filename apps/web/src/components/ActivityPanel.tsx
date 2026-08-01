"use client";

import { useCallback, useEffect, useState } from "react";
import MemoryListPager from "@/components/MemoryListPager";
import { apiFetch } from "@/lib/api";
import { usePagedList } from "@/lib/usePagedList";

type ActivityRepeat = "none" | "daily" | "monthly" | "yearly";
type ActivityRemind = "mention" | "remind";
type ActivityStatus = "pending" | "done" | "missed";
type ActivityKind = "plan" | "record" | "promise";
type ActivityPartOfDay = "morning" | "afternoon" | "evening";

interface ActivityItem {
  id: string;
  title: string;
  date: string;
  time?: string;
  partOfDay?: ActivityPartOfDay | null;
  repeat: ActivityRepeat;
  remind: ActivityRemind;
  kind?: ActivityKind;
  status: ActivityStatus;
  note?: string;
  createdAt: string;
  updatedAt: string;
}

interface ActivityOccurrence {
  activityId: string;
  title: string;
  date: string;
  remind: ActivityRemind;
  kind?: ActivityKind;
  status: ActivityStatus;
  repeat: ActivityRepeat;
}

const REPEAT_OPTS: { id: ActivityRepeat; label: string }[] = [
  { id: "none", label: "不重复" },
  { id: "daily", label: "每天" },
  { id: "monthly", label: "每月" },
  { id: "yearly", label: "每年" },
];

const REMIND_OPTS: { id: ActivityRemind; label: string }[] = [
  { id: "mention", label: "仅提及" },
  { id: "remind", label: "需提醒（可 √ 完成）" },
];

const PART_OPTS: { id: "" | ActivityPartOfDay; label: string }[] = [
  { id: "", label: "不指定时段" },
  { id: "morning", label: "早上" },
  { id: "afternoon", label: "下午" },
  { id: "evening", label: "晚间" },
];

function statusLabel(s: ActivityStatus): string {
  if (s === "done") return "已完成";
  if (s === "missed") return "未完成（过期）";
  return "未完成";
}

function kindLabel(kind?: ActivityKind, status?: ActivityStatus): string {
  if (status === "done" || kind === "record") return "记录";
  if (kind === "promise") return "约定";
  return "计划";
}

const KIND_OPTS: { id: ActivityKind; label: string }[] = [
  { id: "plan", label: "计划（未完成）" },
  { id: "promise", label: "约定（未完成）" },
  { id: "record", label: "记录（已完成）" },
];

export default function ActivityPanel() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [windowRows, setWindowRows] = useState<ActivityOccurrence[]>([]);
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [draft, setDraft] = useState({
    title: "",
    date: "",
    time: "",
    partOfDay: "" as "" | ActivityPartOfDay,
    repeat: "none" as ActivityRepeat,
    remind: "mention" as ActivityRemind,
    kind: "plan" as ActivityKind,
    note: "",
  });
  const itemsPager = usePagedList(items);

  const reload = useCallback(async () => {
    const res = await apiFetch<{
      items: ActivityItem[];
      today: string;
      window: ActivityOccurrence[];
      injectionPreview: string;
    }>("/activity");
    setItems(res.items || []);
    setWindowRows(res.window || []);
    setPreview(res.injectionPreview || "");
    if (!draft.date && res.today) {
      setDraft((d) => ({ ...d, date: res.today }));
    }
  }, [draft.date]);

  useEffect(() => {
    setLoading(true);
    reload()
      .catch((e) => setMsg(e instanceof Error ? e.message : "加载失败"))
      .finally(() => setLoading(false));
  }, [reload]);

  async function createItem() {
    if (!draft.title.trim() || !draft.date) {
      setMsg("请填写标题和日期");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      await apiFetch("/activity", {
        method: "POST",
        body: JSON.stringify({
          title: draft.title,
          date: draft.date,
          time: draft.time || undefined,
          partOfDay: draft.partOfDay || null,
          repeat: draft.repeat,
          remind: draft.remind,
          kind: draft.kind,
          note: draft.note || undefined,
        }),
      });
      setDraft((d) => ({
        ...d,
        title: "",
        time: "",
        note: "",
        kind: "plan",
        remind: "mention",
        repeat: "none",
        partOfDay: "",
      }));
      await reload();
      setMsg("已添加");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "添加失败");
    } finally {
      setBusy(false);
    }
  }

  async function markDone(id: string, date: string) {
    setBusy(true);
    try {
      await apiFetch(`/activity/${id}/complete`, {
        method: "POST",
        body: JSON.stringify({ occurrenceDate: date }),
      });
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "标记失败");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: string) {
    if (!window.confirm("删除这条活动？")) return;
    setBusy(true);
    try {
      await apiFetch(`/activity/${id}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="hint">加载活动账本…</p>;

  return (
    <div className="activity-panel">
      <div className="activity-form card">
        <h4 className="activity-form-title">新建</h4>
        <div className="activity-form-grid">
          <div className="field">
            <label>标题</label>
            <input
              value={draft.title}
              onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
              placeholder="英语打卡 / 部门聚餐 / 练腿"
            />
          </div>
          <div className="field">
            <label>日期</label>
            <input
              type="date"
              value={draft.date}
              onChange={(e) => setDraft((d) => ({ ...d, date: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>时段</label>
            <select
              value={draft.partOfDay}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  partOfDay: e.target.value as "" | ActivityPartOfDay,
                }))
              }
            >
              {PART_OPTS.map((o) => (
                <option key={o.id || "none"} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>钟点（可选）</label>
            <input
              type="time"
              value={draft.time}
              onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
            />
          </div>
          <div className="field">
            <label>重复</label>
            <select
              value={draft.repeat}
              onChange={(e) =>
                setDraft((d) => ({ ...d, repeat: e.target.value as ActivityRepeat }))
              }
            >
              {REPEAT_OPTS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>对角色</label>
            <select
              value={draft.remind}
              onChange={(e) =>
                setDraft((d) => ({ ...d, remind: e.target.value as ActivityRemind }))
              }
            >
              {REMIND_OPTS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>形态</label>
            <select
              value={draft.kind}
              onChange={(e) =>
                setDraft((d) => ({ ...d, kind: e.target.value as ActivityKind }))
              }
            >
              {KIND_OPTS.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field activity-form-note">
            <label>备注</label>
            <input
              value={draft.note}
              onChange={(e) => setDraft((d) => ({ ...d, note: e.target.value }))}
              placeholder="可选"
            />
          </div>
        </div>
        <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void createItem()}>
          添加
        </button>
      </div>

      {msg ? <p className="hint">{msg}</p> : null}

      <div className="activity-section">
        <h4>注入预览（近 7 天窗）</h4>
        <pre className="activity-preview">{preview || "（暂无事项）"}</pre>
        {windowRows.some((r) => r.remind === "remind" && r.status === "pending") ? (
          <ul className="activity-window-list">
            {windowRows
              .filter((r) => r.remind === "remind" && r.status === "pending")
              .map((r) => (
                <li key={`${r.activityId}-${r.date}`}>
                  {r.date} · {r.title}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => void markDone(r.activityId, r.date)}
                  >
                    √ 完成
                  </button>
                </li>
              ))}
          </ul>
        ) : null}
      </div>

      <div className="activity-section">
        <h4>全部事项（{items.length}）</h4>
        <MemoryListPager
          page={itemsPager.page}
          totalPages={itemsPager.totalPages}
          total={itemsPager.total}
          rangeStart={itemsPager.rangeStart}
          rangeEnd={itemsPager.rangeEnd}
          onPageChange={itemsPager.setPage}
        />
        {!items.length ? (
          <div className="empty-state">
            <p>还没有事项</p>
            <p className="hint">在上方新建一条计划或记录。</p>
          </div>
        ) : (
          <ul className="activity-item-list">
            {itemsPager.pageItems.map((it) => (
              <li key={it.id} className="activity-item-row">
                <div>
                  <strong>{it.title}</strong>
                  <span className="hint">
                    {" "}
                    · {it.date}
                    {it.repeat !== "none" ? ` · ${REPEAT_OPTS.find((r) => r.id === it.repeat)?.label}` : ""}
                    {it.remind === "remind" ? " · 需提醒" : " · 仅提及"}
                    {" · "}
                    {kindLabel(it.kind, it.status)}
                    {" · "}
                    {statusLabel(it.status)}
                  </span>
                </div>
                <div className="activity-item-actions">
                  {it.status !== "done" ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={busy}
                      onClick={() => void markDone(it.id, it.date)}
                    >
                      √
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy}
                    onClick={() => void removeItem(it.id)}
                  >
                    删
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
