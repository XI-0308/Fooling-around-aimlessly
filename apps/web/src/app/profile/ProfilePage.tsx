"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useSearchParams } from "next/navigation";
import AppShell from "@/components/AppShell";
import { apiFetch } from "@/lib/api";
import PersonaPortraitPanel from "./PersonaPortraitPanel";


type PromptSlotId =
  | "main"
  | "jailbreak"
  | "memories"
  | "activities"
  | "user_description"
  | "world_info_before"
  | "system_prompt"
  | "description"
  | "personality"
  | "scenario"
  | "world_info_after"
  | "mes_example"
  | "chat_history"
  | "post_history"
  | "supervisor";

interface PromptSlot {
  id: PromptSlotId;
  enabled: boolean;
  template?: string;
  label?: string;
}

interface CharacterPreset {
  name: string;
  promptOrder: PromptSlot[];
  mainPrompt: string;
  jailbreakPrompt: string;
  postHistoryInstructions: string;
  temperature: number;
  topP: number;
  topK: number;
  frequencyPenalty: number;
  presencePenalty: number;
  maxTokens: number;
  maxContext: number;
  ttsSpeaker?: string;
  supervisorCapabilitiesPrompt?: string;
}

interface CharacterData {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  system_prompt?: string;
  post_history_instructions?: string;
}

interface StoredCharacter {
  id: string;
  data: CharacterData;
  preset?: CharacterPreset;
  avatarPath?: string;
}

const SLOT_LABELS: Record<PromptSlotId, string> = {
  description: "① 认识自己 · 角色描述",
  personality: "② 认识自己 · 处境与能力",
  user_description: "③ 认识用户（留空则用「人物」中用户描述）",
  world_info_after: "④ 语意记忆（关键词触发）",
  world_info_before: "语意记忆（角色前）",
  chat_history: "⑤ 聊天历史",
  memories: "⑥ 相关记忆",
  activities: "相关活动",
  scenario: "⑦ 现实信息 / 情景",
  main: "⑧ 主提示词 · 如何思考",
  post_history: "⑨ 输出格式（最后）",
  supervisor: "能力 · 主管（工具与态度）",
  jailbreak: "系统说明 / 越狱",
  system_prompt: "系统提示词覆盖",
  mes_example: "示例对话",
};

const DIRECT_BLOCK_SLOTS = new Set<PromptSlotId>([
  "description",
  "personality",
  "scenario",
  "user_description",
  "main",
  "post_history",
  "memories",
  "activities",
  "jailbreak",
  "supervisor",
]);

const DEFAULT_PRESET: CharacterPreset = {
  name: "默认",
  promptOrder: [
    { id: "description", enabled: true },
    { id: "personality", enabled: true },
    { id: "user_description", enabled: true },
    { id: "world_info_after", enabled: true },
    { id: "supervisor", enabled: true },
    { id: "chat_history", enabled: true },
    { id: "memories", enabled: true },
    { id: "activities", enabled: true, label: "【相关活动】" },
    { id: "scenario", enabled: true },
    { id: "main", enabled: true },
    { id: "post_history", enabled: true },
    { id: "jailbreak", enabled: false },
    { id: "world_info_before", enabled: false },
    { id: "system_prompt", enabled: false },
    { id: "mes_example", enabled: false },
  ],
  mainPrompt: "",
  jailbreakPrompt: "",
  postHistoryInstructions: "",
  temperature: 0.85,
  topP: 0.95,
  topK: 40,
  frequencyPenalty: 0,
  presencePenalty: 0,
  maxTokens: 512,
  maxContext: 8192,
};

type TabId = "people" | "preset";

function parseTabId(raw: string | null): TabId {
  if (raw === "preset") return "preset";
  if (raw === "char" || raw === "user" || raw === "people") return "people";
  return "people";
}

export default function ProfilePage() {
  const searchParams = useSearchParams();
  const initialTab = parseTabId(searchParams.get("tab"));

  const charFileRef = useRef<HTMLInputElement>(null);
  const charAvatarRef = useRef<HTMLInputElement>(null);
  const userAvatarRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<TabId>(initialTab);
  const [charId, setCharId] = useState("");
  const [data, setData] = useState<CharacterData | null>(null);
  const [preset, setPreset] = useState<CharacterPreset | null>(null);
  const [hasCharAvatar, setHasCharAvatar] = useState(false);
  const [charAvatarKey, setCharAvatarKey] = useState(0);

  const [userForm, setUserForm] = useState({ name: "用户", description: "" });
  const [hasUserAvatar, setHasUserAvatar] = useState(false);
  const [userAvatarKey, setUserAvatarKey] = useState(0);

  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const presetListRef = useRef<HTMLDivElement>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function persistPresetLimits() {
    if (!charId || !preset) return;
    try {
      await apiFetch(`/characters/${charId}`, {
        method: "PUT",
        body: JSON.stringify({
          preset: { maxContext: preset.maxContext, maxTokens: preset.maxTokens },
        }),
      });
      setMessage("TOKEN 限制已自动保存");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "自动保存失败，请点底部「保存」");
    }
  }

  useEffect(() => {
    setTab(parseTabId(searchParams.get("tab")));
  }, [searchParams]);

  useEffect(() => {
    Promise.all([
      apiFetch<{ character: StoredCharacter }>("/characters/primary").catch(() => null),
      apiFetch<{ persona: { name: string; description: string; hasAvatar: boolean } }>("/user"),
    ])
      .then(([charRes, userRes]) => {
        if (charRes?.character) {
          setCharId(charRes.character.id);
          setData(charRes.character.data);
          const rawPreset = charRes.character.preset;
          let promptOrder = rawPreset?.promptOrder ?? DEFAULT_PRESET.promptOrder;
          if (!promptOrder.some((s) => s.id === "supervisor")) {
            const copy = promptOrder.map((s) => ({ ...s }));
            const chatIdx = copy.findIndex((s) => s.id === "chat_history");
            copy.splice(chatIdx >= 0 ? chatIdx : copy.length, 0, {
              id: "supervisor",
              enabled: true,
              template: rawPreset?.supervisorCapabilitiesPrompt,
            });
            promptOrder = copy;
          }
          const misuseJb = promptOrder.findIndex(
            (s) => s.id === "jailbreak" && /相关活动/.test(s.label || "")
          );
          if (misuseJb >= 0 && !promptOrder.some((s) => s.id === "activities")) {
            const copy = promptOrder.map((s) => ({ ...s }));
            const old = copy[misuseJb];
            copy[misuseJb] = {
              id: "activities",
              enabled: old.enabled,
              label: old.label?.trim() || "【相关活动】",
              template: old.template,
            };
            copy.push({ id: "jailbreak", enabled: false });
            promptOrder = copy;
          } else if (!promptOrder.some((s) => s.id === "activities")) {
            const copy = promptOrder.map((s) => ({ ...s }));
            const memIdx = copy.findIndex((s) => s.id === "memories");
            const slot = { id: "activities" as const, enabled: true, label: "【相关活动】" };
            if (memIdx >= 0) copy.splice(memIdx + 1, 0, slot);
            else copy.push(slot);
            promptOrder = copy;
          }
          setPreset({
            ...DEFAULT_PRESET,
            ...rawPreset,
            promptOrder,
          });
          setHasCharAvatar(Boolean(charRes.character.avatarPath));
        }
        setUserForm({ name: userRes.persona.name, description: userRes.persona.description });
        setHasUserAvatar(userRes.persona.hasAvatar);
      })
      .catch((e) => setMessage(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      if (charId && data && preset) {
        await apiFetch(`/characters/${charId}`, {
          method: "PUT",
          body: JSON.stringify({ data, preset }),
        });
      }
      await apiFetch("/user", { method: "PUT", body: JSON.stringify(userForm) });
      setMessage("已保存");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleImportCard(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let binary = "";
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const res = await apiFetch<{ character: { id: string; name: string } }>("/characters/import", {
        method: "POST",
        body: JSON.stringify({ filename: file.name, dataBase64: btoa(binary) }),
      });
      setMessage(`已导入：${res.character.name}`);
      window.location.reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "导入失败");
    } finally {
      setSaving(false);
      if (charFileRef.current) charFileRef.current.value = "";
    }
  }

  async function uploadCharAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !charId) return;
    setSaving(true);
    try {
      const { compressImageForAvatar } = await import("@/lib/chatTheme");
      const dataUrl = await compressImageForAvatar(file);
      const dataBase64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
      await apiFetch(`/characters/${charId}/avatar`, {
        method: "POST",
        body: JSON.stringify({ filename: "avatar.jpg", dataBase64 }),
      });
      setHasCharAvatar(true);
      setCharAvatarKey((k) => k + 1);
      setMessage("角色头像已更新（已压缩）");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "上传失败");
    } finally {
      setSaving(false);
      if (charAvatarRef.current) charAvatarRef.current.value = "";
    }
  }

  async function uploadUserAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSaving(true);
    try {
      const { compressImageForAvatar } = await import("@/lib/chatTheme");
      const dataUrl = await compressImageForAvatar(file);
      const dataBase64 = dataUrl.replace(/^data:image\/\w+;base64,/, "");
      await apiFetch("/user/avatar", {
        method: "POST",
        body: JSON.stringify({ filename: "avatar.jpg", dataBase64 }),
      });
      setHasUserAvatar(true);
      setUserAvatarKey((k) => k + 1);
      setMessage("用户头像已更新（已压缩）");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "上传失败");
    } finally {
      setSaving(false);
      if (userAvatarRef.current) userAvatarRef.current.value = "";
    }
  }

  function applyReorder(from: number, to: number): number {
    if (from === to) return from;
    let nextFrom = to;
    setPreset((current) => {
      if (!current) return current;
      const order = [...current.promptOrder];
      const [item] = order.splice(from, 1);
      order.splice(to, 0, item);
      nextFrom = to;
      return { ...current, promptOrder: order };
    });
    return nextFrom;
  }

  function reorderSlots(from: number, to: number) {
    if (!preset || from === to) return;
    const order = [...preset.promptOrder];
    const [item] = order.splice(from, 1);
    order.splice(to, 0, item);
    setPreset({ ...preset, promptOrder: order });
    void persistPromptOrder(order);
  }

  function findPresetDropIndex(clientY: number): number | null {
    const list = presetListRef.current;
    if (!list) return null;
    const items = Array.from(list.querySelectorAll<HTMLElement>("[data-preset-index]"));
    if (!items.length) return null;
    for (const el of items) {
      const rect = el.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (clientY < mid) return Number(el.dataset.presetIndex);
    }
    return Number(items[items.length - 1]?.dataset.presetIndex);
  }

  function onPresetHandlePointerDown(index: number, e: ReactPointerEvent<HTMLSpanElement>) {
    if (saving) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragFrom(index);
  }

  function onPresetHandlePointerMove(e: ReactPointerEvent<HTMLSpanElement>) {
    if (dragFrom === null) return;
    const over = findPresetDropIndex(e.clientY);
    if (over === null || over === dragFrom) return;
    const nextFrom = applyReorder(dragFrom, over);
    setDragFrom(nextFrom);
  }

  function onPresetHandlePointerUp(e: ReactPointerEvent<HTMLSpanElement>) {
    if (dragFrom === null) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setPreset((current) => {
      if (current) void persistPromptOrder(current.promptOrder);
      return current;
    });
    setDragFrom(null);
  }

  async function persistPromptOrder(order: CharacterPreset["promptOrder"]) {
    if (!charId) return;
    try {
      await apiFetch(`/characters/${charId}`, {
        method: "PUT",
        body: JSON.stringify({ preset: { promptOrder: order } }),
      });
      setMessage("板块顺序已保存");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "顺序保存失败，请点底部「保存」");
    }
  }

  function toggleSlot(index: number) {
    if (!preset) return;
    const order = preset.promptOrder.map((s, i) => (i === index ? { ...s, enabled: !s.enabled } : s));
    setPreset({ ...preset, promptOrder: order });
  }

  function updateSlotTemplate(index: number, template: string) {
    if (!preset) return;
    const order = preset.promptOrder.map((s, i) => (i === index ? { ...s, template } : s));
    setPreset({ ...preset, promptOrder: order });
  }

  function updateSlotLabel(index: number, label: string) {
    if (!preset) return;
    const order = preset.promptOrder.map((s, i) =>
      i === index ? { ...s, label: label.trim() || undefined } : s
    );
    setPreset({ ...preset, promptOrder: order });
  }

  if (loading) {
    return (
      <AppShell title="档案">
        <div className="chat-empty"><p>{message || "加载中…"}</p></div>
      </AppShell>
    );
  }

  return (
    <AppShell title="档案">
      <form className="card character-edit-form profile-form" onSubmit={handleSave}>
        <div className="char-edit-header">
          <button type="submit" className="btn btn-outline" disabled={saving}>
            {saving ? "保存中…" : "保存全部"}
          </button>
        </div>

        <div className="char-edit-tabs">
          <button type="button" className={`char-tab ${tab === "people" ? "char-tab-active" : ""}`} onClick={() => setTab("people")}>
            人物
          </button>
          <button type="button" className={`char-tab ${tab === "preset" ? "char-tab-active" : ""}`} onClick={() => setTab("preset")}>
            提示词
          </button>
        </div>

        {tab === "people" && (
          <div className="profile-people">
            <section className="profile-person-card">
              {!data ? (
                <>
                  <p className="hint">尚未配置角色，请导入 ST 角色卡。</p>
                  <div className="field">
                    <label className="sr-only">导入 ST 角色卡</label>
                    <input ref={charFileRef} type="file" accept=".png,.json" onChange={handleImportCard} disabled={saving} />
                  </div>
                </>
              ) : (
                <>
                  <div className="profile-person-row">
                    <div className="profile-avatar-col">
                      <button
                        type="button"
                        className="profile-avatar-btn"
                        disabled={saving || !charId}
                        onClick={() => charAvatarRef.current?.click()}
                        aria-label="更换角色头像"
                      >
                        {hasCharAvatar && charId ? (
                          <img
                            key={charAvatarKey}
                            src={`/api/characters/${charId}/avatar?t=${charAvatarKey}`}
                            alt=""
                            className="persona-avatar-preview"
                          />
                        ) : (
                          <div className="persona-avatar-preview persona-avatar-empty" aria-hidden />
                        )}
                      </button>
                      <span className="profile-avatar-hint">点击更换</span>
                      <input
                        ref={charAvatarRef}
                        type="file"
                        accept="image/*"
                        onChange={uploadCharAvatar}
                        disabled={saving}
                        className="profile-avatar-input"
                      />
                    </div>
                    <div className="field profile-person-name-field">
                      <label>角色名称</label>
                      <input value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} />
                    </div>
                  </div>
                </>
              )}
            </section>

            <section className="profile-person-card profile-person-card-user">
              <div className="profile-person-row">
                <div className="profile-avatar-col">
                  <button
                    type="button"
                    className="profile-avatar-btn"
                    disabled={saving}
                    onClick={() => userAvatarRef.current?.click()}
                    aria-label="更换用户头像"
                  >
                    {hasUserAvatar ? (
                      <img
                        key={userAvatarKey}
                        src={`/api/user/avatar?t=${userAvatarKey}`}
                        alt=""
                        className="persona-avatar-preview"
                      />
                    ) : (
                      <div className="persona-avatar-preview persona-avatar-empty" aria-hidden />
                    )}
                  </button>
                  <span className="profile-avatar-hint">点击更换</span>
                  <input
                    ref={userAvatarRef}
                    type="file"
                    accept="image/*"
                    onChange={uploadUserAvatar}
                    disabled={saving}
                    className="profile-avatar-input"
                  />
                </div>
                <div className="field profile-person-name-field">
                  <label>称呼</label>
                  <input value={userForm.name} onChange={(e) => setUserForm({ ...userForm, name: e.target.value })} />
                </div>
              </div>
              <div className="field profile-person-desc-field">
                <label>用户描述</label>
                <textarea
                  rows={5}
                  value={userForm.description}
                  onChange={(e) => setUserForm({ ...userForm, description: e.target.value })}
                  placeholder="关于你的设定，会注入对话上下文"
                />
              </div>
              <PersonaPortraitPanel />
            </section>

          </div>
        )}

        {tab === "preset" && preset && (
          <>
            <p className="hint preset-order-hint">按住左侧 ⠿ 上下拖动即可调整板块顺序。</p>
            <div className="preset-order-list" ref={presetListRef}>
              {preset.promptOrder.map((slot, index) => (
                <div
                  key={slot.id}
                  data-preset-index={index}
                  className={`preset-order-item preset-order-item-expanded ${slot.enabled ? "" : "preset-order-disabled"} ${dragFrom === index ? "preset-order-dragging" : ""}`}
                >
                  <div className="preset-order-item-head">
                    <span
                      className="preset-drag-handle"
                      onPointerDown={(e) => onPresetHandlePointerDown(index, e)}
                      onPointerMove={onPresetHandlePointerMove}
                      onPointerUp={onPresetHandlePointerUp}
                      onPointerCancel={onPresetHandlePointerUp}
                      aria-label="拖动排序"
                      title="按住上下拖动排序"
                    >
                      ⠿
                    </span>
                    <input type="checkbox" checked={slot.enabled} onChange={() => toggleSlot(index)} />
                    <input
                      type="text"
                      className="preset-order-label-input"
                      value={slot.label ?? ""}
                      placeholder={SLOT_LABELS[slot.id] || slot.id}
                      onChange={(e) => updateSlotLabel(index, e.target.value)}
                    />
                  </div>
                  {DIRECT_BLOCK_SLOTS.has(slot.id) && (
                    <textarea
                      className="preset-direct-block"
                      rows={Math.min(12, Math.max(3, (slot.template?.split("\n").length ?? 0) + 1))}
                      placeholder={
                        slot.id === "user_description"
                          ? "留空则用「人物」中的用户描述"
                          : slot.id === "supervisor"
                            ? "留空则用默认；支持 {{char}} 宏"
                            : slot.id === "activities"
                              ? "可留空：用上方格子标题作标题，下列表自动注入。或写：【你的标题】\\n{{content}}"
                              : "直接系统块正文"
                      }
                      value={slot.template ?? ""}
                      onChange={(e) => updateSlotTemplate(index, e.target.value)}
                    />
                  )}
                </div>
              ))}
            </div>
            <h3 style={{ marginTop: 24 }}>采样参数</h3>
            <div className="field-grid">
              <div className="field">
                <label>温度 ({preset.temperature})</label>
                <input type="range" min={0} max={2} step={0.05} value={preset.temperature} onChange={(e) => setPreset({ ...preset, temperature: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label>Top-P ({preset.topP})</label>
                <input type="range" min={0} max={1} step={0.01} value={preset.topP} onChange={(e) => setPreset({ ...preset, topP: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label>Top-K</label>
                <input type="number" min={0} max={100} value={preset.topK} onChange={(e) => setPreset({ ...preset, topK: Number(e.target.value) })} />
                <p className="hint">DeepSeek 无效</p>
              </div>
              <div className="field">
                <label>频率惩罚</label>
                <input type="number" min={-2} max={2} step={0.1} value={preset.frequencyPenalty} onChange={(e) => setPreset({ ...preset, frequencyPenalty: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label>存在惩罚</label>
                <input type="number" min={-2} max={2} step={0.1} value={preset.presencePenalty} onChange={(e) => setPreset({ ...preset, presencePenalty: Number(e.target.value) })} />
              </div>
              <div className="field">
                <label>最长回复（词元）</label>
                <p className="hint" style={{ margin: "4px 0 8px" }}>
                  超出此长度的可见回复将被拦截，不会写入聊天记录，并提示超限。
                </p>
                <div className="token-limit-row">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="token-limit-input"
                    disabled={preset.maxTokens <= 0}
                    value={preset.maxTokens <= 0 ? "512" : String(preset.maxTokens)}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      if (!raw) return;
                      setPreset({ ...preset, maxTokens: Number(raw) });
                    }}
                    onBlur={(e) => {
                      let v = Number(e.target.value.replace(/\D/g, ""));
                      if (!Number.isFinite(v)) v = 512;
                      v = Math.min(8192, Math.max(64, v));
                      setPreset({ ...preset, maxTokens: v });
                      void persistPresetLimits();
                    }}
                  />
                  <label className="memory-checkbox-row token-limit-check">
                    <input
                      type="checkbox"
                      checked={preset.maxTokens <= 0}
                      onChange={(e) =>
                        setPreset({ ...preset, maxTokens: e.target.checked ? 0 : 512 })
                      }
                    />
                    不限
                  </label>
                </div>
              </div>
              <div className="field">
                <label>聊天历史 TOKEN 限制</label>
                <p className="hint" style={{ margin: "4px 0 8px" }}>
                  仅限制送入模型的<strong>聊天历史文字</strong>；预设、语意记忆、记忆等其它板块不计入此上限。修改后<strong>离开输入框即自动保存</strong>，再发新消息才会生效。
                </p>
                <div className="token-limit-row">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    className="token-limit-input"
                    disabled={preset.maxContext <= 0}
                    value={preset.maxContext <= 0 ? "5000" : String(preset.maxContext)}
                    onChange={(e) => {
                      const raw = e.target.value.replace(/\D/g, "");
                      if (!raw) return;
                      setPreset({ ...preset, maxContext: Number(raw) });
                    }}
                    onBlur={(e) => {
                      let v = Number(e.target.value.replace(/\D/g, ""));
                      if (!Number.isFinite(v)) v = 5000;
                      v = Math.min(65536, Math.max(256, v));
                      setPreset({ ...preset, maxContext: v });
                      void persistPresetLimits();
                    }}
                  />
                  <label className="memory-checkbox-row token-limit-check">
                    <input
                      type="checkbox"
                      checked={preset.maxContext <= 0}
                      onChange={(e) =>
                        setPreset({ ...preset, maxContext: e.target.checked ? 0 : 5000 })
                      }
                    />
                    不限
                  </label>
                </div>
              </div>
            </div>
          </>
        )}

        {message && <p className={message.includes("已") ? "hint" : "error"}>{message}</p>}
      </form>
    </AppShell>
  );
}
