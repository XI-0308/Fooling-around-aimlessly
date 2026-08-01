"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Conversations } from "@ant-design/x";
import { DeleteOutlined, EditOutlined } from "@ant-design/icons";
import AppShell from "@/components/AppShell";
import EncoreIcon from "@/components/EncoreIcon";
import ImportBackupPackage from "@/components/ImportBackupPackage";
import SettingsFold from "@/components/SettingsFold";
import { MessageOutlined } from "@ant-design/icons";
import { useProactiveUnread } from "@/components/ProactiveUnreadProvider";
import { apiFetch } from "@/lib/api";

interface ChatItem {
  id: string;
  title: string;
  characterName: string;
  updatedAt: string;
}

export default function ChatListPage() {
  const router = useRouter();
  const { chats: unreadChats } = useProactiveUnread();
  const [chats, setChats] = useState<ChatItem[]>([]);
  const [message, setMessage] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [activeKey, setActiveKey] = useState<string>();

  const load = useCallback(() => {
    setLoading(true);
    apiFetch<{ chats: ChatItem[] }>("/chats")
      .then((d) => setChats(d.chats))
      .catch((e) => setMessage(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function startPrimaryChat() {
    setCreating(true);
    setMessage("");
    try {
      const primary = await apiFetch<{ character: { id: string } }>("/characters/primary");
      const data = await apiFetch<{ chat: { id: string } }>("/chats", {
        method: "POST",
        body: JSON.stringify({ characterId: primary.character.id }),
      });
      router.push(`/chat/${data.chat.id}`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "无法开始聊天，请先在档案页配置角色");
    } finally {
      setCreating(false);
    }
  }

  async function deleteChat(id: string, name: string) {
    if (!confirm(`确定删除「${name}」？`)) return;
    await apiFetch(`/chats/${id}`, { method: "DELETE" });
    load();
  }

  async function renameChat(id: string, current: string) {
    const next = prompt("修改会话名称", current);
    if (next === null) return;
    try {
      await apiFetch(`/chats/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ title: next }),
      });
      load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "重命名失败");
    }
  }

  const unreadByChat = new Map(unreadChats.map((c) => [c.chatId, c.count]));

  const items = chats.map((c) => {
    const unread = unreadByChat.get(c.id) || 0;
    const title = c.title?.trim() || c.characterName;
    return {
      key: c.id,
      label: (
        <span className="chat-list-conv-label">
          <span className="chat-list-conv-title">{title}</span>
          {unread > 0 ? (
            <span
              className="chat-list-unread-dot"
              aria-label={`${c.characterName}有 ${unread} 条未读消息`}
              title={`${unread} 条未读`}
            />
          ) : null}
        </span>
      ),
      group: "会话列表",
      timestamp: new Date(c.updatedAt).getTime(),
      icon: (
        <EncoreIcon color="#a78bfa" size={28}>
          <MessageOutlined />
        </EncoreIcon>
      ),
    };
  });

  const listBusy = loading || creating;

  return (
    <AppShell title="聊天">
      <div className="page-scroll chat-list-page">
        {message && <p className="error">{message}</p>}
        {importMsg && <p className="hint">{importMsg}</p>}

        {loading && <p className="hint">加载中…</p>}

        {!loading && chats.length === 0 && (
          <div className="card chat-list-conversations-wrap">
            <div className="chat-list-new-row">
              <button
                type="button"
                className="btn btn-outline"
                disabled={listBusy}
                onClick={() => void startPrimaryChat()}
              >
                {creating ? "创建中…" : "新对话"}
              </button>
            </div>
            <Conversations className="chat-list-conversations" items={[]} />
            <div className="empty-state">
              <p>还没有聊天记录</p>
              <p className="hint">点上方「新对话」开始。</p>
            </div>
          </div>
        )}

        {!loading && chats.length > 0 && (
          <div className="card chat-list-conversations-wrap">
            <div className="chat-list-new-row">
              <button
                type="button"
                className="btn btn-outline"
                disabled={listBusy}
                onClick={() => void startPrimaryChat()}
              >
                {creating ? "创建中…" : "新对话"}
              </button>
            </div>
            <Conversations
              className="chat-list-conversations"
              items={items}
              activeKey={activeKey}
              onActiveChange={(key) => {
                setActiveKey(key);
                if (key) router.push(`/chat/${key}`);
              }}
              groupable={{
                collapsible: true,
                defaultExpandedKeys: ["会话列表"],
              }}
              menu={(conv) => ({
                items: [
                  { key: "rename", label: "重命名", icon: <EditOutlined /> },
                  { key: "delete", label: "删除", icon: <DeleteOutlined />, danger: true },
                ],
                onClick: ({ key, domEvent }) => {
                  domEvent.stopPropagation();
                  const chat = chats.find((c) => c.id === conv.key);
                  if (!chat) return;
                  const label = chat.title?.trim() || chat.characterName;
                  if (key === "rename") void renameChat(chat.id, label);
                  if (key === "delete") void deleteChat(chat.id, label);
                },
              })}
            />
          </div>
        )}

        <SettingsFold title="高级：恢复历史聊天">
          <ImportBackupPackage
            packageId="chats"
            buttonLabel="导入历史聊天记录"
            hint="选择备份总 zip 或「聊天.zip」。仅恢复对话记录，不影响记忆库与语意记忆。"
            onSuccess={(msg) => {
              setImportMsg(msg);
              load();
            }}
          />
        </SettingsFold>
      </div>
    </AppShell>
  );
}
