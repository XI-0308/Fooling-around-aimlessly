import type { ReactNode } from "react";
import EncoreIcon from "@/components/EncoreIcon";
import { findNavItem } from "@/lib/encoreNav";

type Props = {
  navKey: string;
  children: ReactNode;
  as?: "h2" | "h3";
  className?: string;
};

/** 带 Encore 导航图标的板块标题 */
export default function EncoreSectionTitle({ navKey, children, as = "h2", className = "" }: Props) {
  const item = findNavItem(navKey);
  const Tag = as;
  return (
    <Tag className={`encore-section-title ${className}`.trim()}>
      {item ? (
        <EncoreIcon color={item.color}>
          <item.Icon />
        </EncoreIcon>
      ) : null}
      <span>{children}</span>
    </Tag>
  );
}
