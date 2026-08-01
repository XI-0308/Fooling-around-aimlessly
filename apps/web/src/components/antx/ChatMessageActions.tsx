"use client";

import type { KeyboardEvent, MouseEvent } from "react";
import { Actions } from "@ant-design/x";
import type { ItemType } from "@ant-design/x/es/actions/interface";
import {
  BulbOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  ReloadOutlined,
  SendOutlined,
  SoundOutlined,
} from "@ant-design/icons";

type Props = {
  items: ItemType[];
  className?: string;
};

function dismissActionFocus(domEvent: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) {
  const target = domEvent.currentTarget as HTMLElement;
  target.blur();
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
}

export default function ChatMessageActions({ items, className }: Props) {
  if (items.length === 0) return null;
  return (
    <Actions
      className={className}
      variant="borderless"
      items={items}
      dropdownProps={{ destroyPopupOnHide: true }}
      onClick={({ key, domEvent }) => {
        domEvent.stopPropagation();
        dismissActionFocus(domEvent);
        const item = items.find((i) => i.key === key);
        item?.onItemClick?.(item);
      }}
    />
  );
}

export {
  BulbOutlined,
  DeleteOutlined,
  EditOutlined,
  EyeInvisibleOutlined,
  EyeOutlined,
  ReloadOutlined,
  SendOutlined,
  SoundOutlined,
};
