"use client";

import { ThoughtChain } from "@ant-design/x";

type Props = {
  messageId: string;
  text: string;
  streaming?: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
};

/** 聊天页思维链：Ant Design X ThoughtChain */
export default function ChatReasoningChain({
  messageId,
  text,
  streaming = false,
  expanded,
  onExpandedChange,
}: Props) {
  const displayText =
    text.trim() ||
    (streaming ? "" : "（此条暂无思维链记录，可能是旧消息或非 reasoner 模型生成）");

  return (
    <ThoughtChain
      className="chat-reasoning-chain"
      items={[
        {
          key: messageId,
          title: streaming ? "思考中…" : "内心戏",
          content: displayText || undefined,
          collapsible: true,
          status: streaming ? "loading" : "success",
          blink: streaming,
        },
      ]}
      expandedKeys={expanded ? [messageId] : []}
      onExpand={(keys) => onExpandedChange(keys.includes(messageId))}
    />
  );
}
