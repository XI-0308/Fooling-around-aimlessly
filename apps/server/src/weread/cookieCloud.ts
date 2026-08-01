import type { WeReadConn } from "../config.js";
import { resolveCookieFromCloudOrManual } from "../cookieCloud/shared.js";

/** 优先用手动 Cookie，否则尝试 CookieCloud */
export async function resolveWeReadCookie(conn: WeReadConn): Promise<string> {
  return resolveCookieFromCloudOrManual(
    conn.cookie,
    conn.cookieCloud,
    ["weread.qq.com", "weread"],
    "微信读书"
  );
}
