"use client";

import { Conversations } from "@ant-design/x";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import EncoreIcon from "@/components/EncoreIcon";
import { ENCORE_NAV, navActiveKey } from "@/lib/encoreNav";

type Props = {
  onNavigate?: () => void;
};

export default function AppSidebarNav({ onNavigate }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const activeKey = navActiveKey(pathname);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const navItems = ENCORE_NAV.filter((item) => !isMobile || !item.hideOnMobile);

  const items = navItems.map((item) => ({
    key: item.key,
    label: item.label,
    group: item.group,
    icon: (
      <EncoreIcon color={item.color} size={28}>
        <item.Icon />
      </EncoreIcon>
    ),
  }));

  const expandedGroups = [...new Set(navItems.map((item) => item.group))];

  return (
    <Conversations
      className="encore-sidebar-conversations"
      items={items}
      activeKey={activeKey}
      onActiveChange={(key) => {
        const target = navItems.find((item) => item.key === key);
        if (!target) return;
        router.push(target.href);
        onNavigate?.();
      }}
      groupable={{
        collapsible: true,
        defaultExpandedKeys: expandedGroups,
      }}
    />
  );
}
