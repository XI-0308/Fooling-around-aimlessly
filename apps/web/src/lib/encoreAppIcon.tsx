/** PWA / 桌面图标：白底黑字 E */
export const ENCORE_APP_ICON_BG = "#ffffff";
export const ENCORE_APP_ICON_FG = "#000000";

export function encoreAppIconStyle(fontSize: number) {
  return {
    width: "100%",
    height: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: ENCORE_APP_ICON_BG,
    color: ENCORE_APP_ICON_FG,
    fontSize,
    fontWeight: 700 as const,
    fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
    letterSpacing: "-0.04em",
  };
}
