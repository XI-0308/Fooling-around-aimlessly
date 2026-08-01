import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
  color?: string;
  size?: number;
  className?: string;
};

/** Prompts 风格的圆角彩色图标底 */
export default function EncoreIcon({ children, color = "#a78bfa", size = 32, className = "" }: Props) {
  return (
    <span
      className={`encore-icon ${className}`.trim()}
      style={{
        color,
        background: `${color}22`,
        width: size,
        height: size,
        fontSize: Math.round(size * 0.5),
      }}
      aria-hidden
    >
      {children}
    </span>
  );
}
