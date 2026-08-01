import type React from "react";
import {
  AppstoreOutlined,
  BgColorsOutlined,
  BulbOutlined,
  CloudUploadOutlined,
  DatabaseOutlined,
  MessageOutlined,
  SettingOutlined,
  UserOutlined,
} from "@ant-design/icons";

export type EncoreNavItem = {
  key: string;
  href: string;
  label: string;
  group: string;
  color: string;
  Icon: React.ComponentType<{ style?: React.CSSProperties }>;
  /** 手机端侧栏不显示（如开发预览页） */
  hideOnMobile?: boolean;
};

/** 侧边栏与各页面板块共用的导航 / 分组图标配置 */
export const ENCORE_NAV: EncoreNavItem[] = [
  { key: "/chat", href: "/chat", label: "聊天", group: "对话", color: "#a78bfa", Icon: MessageOutlined },
  { key: "/profile", href: "/profile", label: "档案", group: "角色与记忆", color: "#f472b6", Icon: UserOutlined },
  { key: "/memory", href: "/memory", label: "记忆库", group: "角色与记忆", color: "#2dd4bf", Icon: DatabaseOutlined },
  { key: "/obsidian", href: "/obsidian", label: "慢思考", group: "角色与记忆", color: "#f59e0b", Icon: BulbOutlined },
  { key: "/decorate", href: "/decorate", label: "装饰", group: "个性化", color: "#fbbf24", Icon: BgColorsOutlined },
  { key: "/antx", href: "/antx", label: "组件库", group: "个性化", color: "#c084fc", Icon: AppstoreOutlined, hideOnMobile: true },
  { key: "/backup", href: "/backup", label: "备份", group: "系统", color: "#94a3b8", Icon: CloudUploadOutlined },
  { key: "/settings", href: "/settings", label: "设置", group: "系统", color: "#818cf8", Icon: SettingOutlined },
];

export function navActiveKey(pathname: string): string {
  for (const item of ENCORE_NAV) {
    if (item.href === "/chat") {
      if (pathname === "/chat" || pathname.startsWith("/chat/")) return item.key;
    } else if (pathname === item.href || pathname.startsWith(`${item.href}/`)) {
      return item.key;
    } else if (item.href === "/memory" && (pathname === "/worldinfo" || pathname.startsWith("/worldinfo/"))) {
      return item.key;
    }
  }
  return ENCORE_NAV[0].key;
}

export function findNavItem(keyOrHref: string): EncoreNavItem | undefined {
  return ENCORE_NAV.find((item) => item.key === keyOrHref || item.href === keyOrHref);
}
