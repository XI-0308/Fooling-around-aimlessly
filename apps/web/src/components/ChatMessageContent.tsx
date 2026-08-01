"use client";

import { Fragment, type ReactNode } from "react";

const URL_SPLIT_RE = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;

export function linkifyText(text: string): ReactNode[] {
  const parts = text.split(URL_SPLIT_RE);
  return parts.map((part, i) => {
    if (/^https?:\/\//i.test(part)) {
      const href = part.replace(/[),.;!?，。！？；：]+$/g, "");
      return (
        <a
          key={`${i}-${href}`}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="msg-link"
        >
          {href}
        </a>
      );
    }
    return <Fragment key={i}>{part}</Fragment>;
  });
}

export default function ChatMessageContent({ text }: { text: string }) {
  if (!text) return null;
  return <>{linkifyText(text)}</>;
}
