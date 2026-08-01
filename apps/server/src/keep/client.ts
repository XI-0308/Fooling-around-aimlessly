import { getKeepSdk, type KeepMcpClient } from "./sdk.js";

function createClient(opts?: { token?: string; requestTimeoutMs?: number }): KeepMcpClient {
  const sdk = getKeepSdk();
  const creds = sdk.loadCredentials();
  const token = opts?.token ?? creds.token;
  return new sdk.McpClient({
    url: creds.mcpUrl || undefined,
    token: token || "",
    requestTimeoutMs: opts?.requestTimeoutMs ?? 45_000,
    clientName: "@rp-agent/keep",
    clientVersion: "0.1.0",
  });
}

async function withClient<T>(
  fn: (client: KeepMcpClient) => Promise<T>,
  opts?: { token?: string; requestTimeoutMs?: number }
): Promise<T> {
  const client = createClient(opts);
  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => undefined);
  }
}

export function getKeepAuthStatus(): {
  loggedIn: boolean;
  username: string;
  exp: number;
  expiresAt: string | null;
} {
  const sdk = getKeepSdk();
  const creds = sdk.loadCredentials();
  const exp = creds.exp || (creds.token ? sdk.decodeJwtExp(creds.token) : 0);
  const nowSec = Math.floor(Date.now() / 1000);
  const loggedIn = Boolean(creds.token) && (!exp || exp > nowSec);
  return {
    loggedIn,
    username: creds.username || "",
    exp,
    expiresAt: exp ? new Date(exp * 1000).toISOString() : null,
  };
}

export async function keepGetQrcode(): Promise<{
  qrcodeId: string;
  qrcodeUrl?: string;
  redirectUrl?: string;
  qrcodeAscii?: string;
}> {
  return withClient(
    async (client) => {
      const data = (await client.callTool("get_qrcode", { authType: "openclaw" })) as Record<
        string,
        unknown
      >;
      const qrcodeId = String(data.qrcodeId || data.qrcode_id || "");
      if (!qrcodeId) throw new Error("Keep 未返回二维码 ID");
      return {
        qrcodeId,
        qrcodeUrl: data.qrcodeUrl ? String(data.qrcodeUrl) : undefined,
        redirectUrl: data.redirectUrl ? String(data.redirectUrl) : undefined,
        qrcodeAscii: data.qrcodeAscii ? String(data.qrcodeAscii) : undefined,
      };
    },
    { token: "", requestTimeoutMs: 30_000 }
  );
}

export async function keepCheckLogin(qrcodeId: string): Promise<{
  status: string;
  token?: string;
  username?: string;
  raw: unknown;
}> {
  return withClient(
    async (client) => {
      const data = (await client.callTool("check_login", { qrcodeId })) as Record<string, unknown>;
      const status = String(data.status || "");
      const token = data.token ? String(data.token) : undefined;
      const user = (data.user || {}) as Record<string, unknown>;
      const username = user.username ? String(user.username) : undefined;
      if (status === "authorized" && token) {
        const sdk = getKeepSdk();
        sdk.persistCredentials({ token, username });
      }
      return { status, token, username, raw: data };
    },
    { token: "", requestTimeoutMs: 45_000 }
  );
}

export async function keepLogout(): Promise<void> {
  const status = getKeepAuthStatus();
  if (status.loggedIn) {
    try {
      await withClient(async (client) => {
        await client.callTool("revoke_auth", {});
      });
    } catch {
      // 工具列表可能无 revoke_auth；本地清凭证即可
    }
  }
  getKeepSdk().clearCredentials();
}

/** 自然语言查询 Keep 健康/运动数据（只读） */
export async function keepQuery(text: string): Promise<unknown> {
  const q = text.trim();
  if (!q) throw new Error("查询内容为空");
  const status = getKeepAuthStatus();
  if (!status.loggedIn) {
    const err = new Error("AUTH_REQUIRED: 尚未登录 Keep，请到「设置 → Keep 健康」扫码授权");
    (err as Error & { code?: string }).code = "AUTH_REQUIRED";
    throw err;
  }
  return withClient(
    async (client) => client.callTool("query_tool", { text: q }),
    { requestTimeoutMs: 60_000 }
  );
}

export function formatKeepQueryForPrompt(payload: unknown): string {
  if (payload == null) return "（无数据）";
  if (typeof payload === "string") return payload.slice(0, 8000);
  if (typeof payload === "object" && payload !== null && "result" in payload) {
    const r = (payload as { result: unknown }).result;
    if (typeof r === "string" && r.trim()) return r.trim().slice(0, 8000);
  }
  try {
    return JSON.stringify(payload, null, 2).slice(0, 8000);
  } catch {
    return String(payload).slice(0, 8000);
  }
}

export function keepErrorCode(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const e = err as { code?: string; message?: string };
  if (e.code) return String(e.code);
  const msg = String(e.message || "");
  if (/AUTH_REQUIRED/i.test(msg)) return "AUTH_REQUIRED";
  if (/TOKEN_EXPIRED/i.test(msg)) return "TOKEN_EXPIRED";
  if (/RATE_LIMITED/i.test(msg)) return "RATE_LIMITED";
  return "";
}
