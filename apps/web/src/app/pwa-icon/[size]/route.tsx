import { ImageResponse } from "next/og";
import { encoreAppIconStyle } from "@/lib/encoreAppIcon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ size: string }> };

function parseSize(raw: string): number {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return 192;
  return Math.min(512, Math.max(48, n));
}

function defaultIcon(size: number) {
  const fontSize = Math.round(size * 0.66);
  return new ImageResponse(<div style={encoreAppIconStyle(fontSize)}>E</div>, {
    width: size,
    height: size,
  });
}

/** PWA / 桌面图标：优先用户上传，否则默认白底 E */
export async function GET(_req: Request, { params }: Params) {
  const { size: sizeRaw } = await params;
  const size = parseSize(sizeRaw);

  try {
    const base =
      process.env.INTERNAL_API_URL?.replace(/\/$/, "") ||
      `http://127.0.0.1:${process.env.API_PORT || "3001"}`;
    const upstream = await fetch(`${base}/api/theme/icon`, {
      cache: "no-store",
    });
    if (upstream.ok) {
      const buf = Buffer.from(await upstream.arrayBuffer());
      return new Response(buf, {
        headers: {
          "Content-Type": upstream.headers.get("Content-Type") || "image/png",
          "Cache-Control": "public, max-age=300",
        },
      });
    }
  } catch {
    // 回退默认
  }

  return defaultIcon(size);
}
