"use client";

import type { ReactNode } from "react";

type Props = {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
};

/** 设置页折叠区块（手机端缩短滚动） */
export default function SettingsFold({ title, children, defaultOpen = false }: Props) {
  return (
    <details className="settings-fold" open={defaultOpen || undefined}>
      <summary className="settings-fold-summary">{title}</summary>
      <div className="settings-fold-body">{children}</div>
    </details>
  );
}
