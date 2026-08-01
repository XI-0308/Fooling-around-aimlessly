import { ImageResponse } from "next/og";
import { encoreAppIconStyle } from "@/lib/encoreAppIcon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={encoreAppIconStyle(118)}>E</div>,
    { ...size }
  );
}
