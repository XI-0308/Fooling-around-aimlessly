import type { ReactNode } from "react";
import EncoreIcon from "@/components/EncoreIcon";

type Props = {
  children: ReactNode;
  icon: ReactNode;
  color?: string;
  as?: "h2" | "h3";
  className?: string;
};

/** 任意 Ant Design 图标的板块标题（用于设置页等子板块） */
export default function EncoreBlockTitle({
  children,
  icon,
  color = "#a78bfa",
  as = "h2",
  className = "",
}: Props) {
  const Tag = as;
  return (
    <Tag className={`encore-section-title ${className}`.trim()} style={{ marginTop: as === "h2" ? 0 : undefined }}>
      <EncoreIcon color={color}>{icon}</EncoreIcon>
      <span>{children}</span>
    </Tag>
  );
}
