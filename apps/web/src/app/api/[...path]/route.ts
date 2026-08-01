import { NextRequest, NextResponse } from "next/server";

const API_URL = (process.env.API_URL || "http://127.0.0.1:3001").replace(/\/$/, "");

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

function buildTargetUrl(req: NextRequest, pathSegments: string[]): string {
  const path = pathSegments.map(encodeURIComponent).join("/");
  const search = req.nextUrl.search;
  return `${API_URL}/api/${path}${search}`;
}

function forwardRequestHeaders(req: NextRequest): Headers {
  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    headers.set(key, value);
  });
  return headers;
}

function forwardResponseHeaders(upstream: Response): Headers {
  const headers = new Headers();
  upstream.headers.forEach((value, key) => {
    if (HOP_BY_HOP.has(key.toLowerCase())) return;
    // set-cookie 单独处理，避免被 Headers 合并丢失
    if (key.toLowerCase() === "set-cookie") return;
    headers.set(key, value);
  });

  const maybeGetSetCookie = (
    upstream.headers as Headers & { getSetCookie?: () => string[] }
  ).getSetCookie;
  if (typeof maybeGetSetCookie === "function") {
    for (const cookie of maybeGetSetCookie.call(upstream.headers)) {
      headers.append("set-cookie", cookie);
    }
  } else {
    const single = upstream.headers.get("set-cookie");
    if (single) headers.append("set-cookie", single);
  }
  return headers;
}

async function proxy(req: NextRequest, context: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await context.params;
  const target = buildTargetUrl(req, path);
  const headers = forwardRequestHeaders(req);
  const method = req.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "HEAD";

  try {
    // Windows / Node undici 对「流式请求体 + duplex」偶发失败，登录等 POST 会直接 502。
    // 请求体先读成 Buffer 再转发更稳；SSE 流式在响应侧，不受影响。
    let body: ArrayBuffer | undefined;
    if (hasBody) {
      body = await req.arrayBuffer();
      headers.set("content-length", String(body.byteLength));
    }

    const upstream = await fetch(target, {
      method,
      headers,
      body: hasBody ? body : undefined,
      cache: "no-store",
    });

    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: forwardResponseHeaders(upstream),
    });
  } catch (err) {
    console.error("[api-proxy]", method, target, err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: "无法连接后端服务，请确认 rp-agent-server 已启动" },
      { status: 502 }
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
