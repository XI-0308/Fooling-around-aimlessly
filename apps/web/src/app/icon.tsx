import { ImageResponse } from "next/og";
import { encoreAppIconStyle } from "@/lib/encoreAppIcon";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div style={encoreAppIconStyle(22)}>E</div>,
    { ...size }
  );
}
