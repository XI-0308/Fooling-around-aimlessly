"use client";

import { useEffect, useState, type CSSProperties } from "react";
import AppShell from "@/components/AppShell";
import ChatDecorateForm from "@/components/ChatDecorateForm";
import {
  chatThemeToCssVars,
  DEFAULT_CHAT_THEME,
  loadFullChatTheme,
  saveChatTheme,
  type ChatTheme,
} from "@/lib/chatTheme";

export default function DecoratePage() {
  const [draft, setDraft] = useState<ChatTheme>(DEFAULT_CHAT_THEME);
  const [message, setMessage] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadFullChatTheme()
      .then(setDraft)
      .finally(() => setReady(true));
  }, []);

  function handleSave() {
    try {
      saveChatTheme(draft);
      setMessage("装饰已保存并锁定到服务器。之后改图标 / 重建都不会再用默认紫壳冲掉你的配色。");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "保存失败");
    }
  }

  if (!ready) {
    return (
      <AppShell title="装饰">
        <p className="hint page-scroll">加载装饰设置…</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="装饰">
      <div
        className="page-scroll decorate-page"
        style={chatThemeToCssVars(draft) as CSSProperties}
      >
        {message && <p className={message.includes("失败") ? "error" : "hint decorate-hint"}>{message}</p>}
        <ChatDecorateForm theme={draft} onChange={setDraft} onSave={handleSave} />
      </div>
    </AppShell>
  );
}
