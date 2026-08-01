import { createRequire } from "module";

const require = createRequire(import.meta.url);

/** @keepclaw/skill-sdk 为 CommonJS，经 createRequire 接入 ESM 服务端 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyFn = (...args: any[]) => any;

export interface KeepCredentials {
  token: string;
  exp: number;
  username: string;
  mcpUrl: string;
}

export interface KeepMcpClient {
  callTool(name: string, args?: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
}

export interface KeepSdk {
  loadCredentials: (opts?: { env?: NodeJS.ProcessEnv }) => KeepCredentials;
  hasValidToken: (opts?: { env?: NodeJS.ProcessEnv; now?: number }) => boolean;
  persistCredentials: (opts: {
    token: string;
    exp?: number;
    username?: string;
  }) => { path: string; exp: number; username: string };
  clearCredentials: () => { cleared: boolean; path: string };
  decodeJwtExp: (token: string) => number;
  McpClient: new (opts?: {
    url?: string;
    token?: string;
    requestTimeoutMs?: number;
    clientName?: string;
    clientVersion?: string;
  }) => KeepMcpClient;
  DEFAULT_MCP_URL: string;
}

let cached: KeepSdk | null = null;

export function getKeepSdk(): KeepSdk {
  if (cached) return cached;
  const auth = require("@keepclaw/skill-sdk/auth") as {
    loadCredentials: AnyFn;
    hasValidToken: AnyFn;
    persistCredentials: AnyFn;
    clearCredentials: AnyFn;
    decodeJwtExp: AnyFn;
  };
  const mcp = require("@keepclaw/skill-sdk/mcp") as {
    McpClient: KeepSdk["McpClient"];
    DEFAULT_MCP_URL: string;
  };
  cached = {
    loadCredentials: auth.loadCredentials,
    hasValidToken: auth.hasValidToken,
    persistCredentials: auth.persistCredentials,
    clearCredentials: auth.clearCredentials,
    decodeJwtExp: auth.decodeJwtExp,
    McpClient: mcp.McpClient,
    DEFAULT_MCP_URL: mcp.DEFAULT_MCP_URL,
  };
  return cached;
}
