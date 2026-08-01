/** 粘贴 Cookie 时常带入换行，会导致 fetch 报 invalid header value */
export function normalizeNetEaseCookie(cookie: string): string {
  if (!cookie) return "";
  return cookie
    .replace(/[\r\n]+/g, "")
    .replace(/\s*;\s*/g, "; ")
    .replace(/\s{2,}/g, " ")
    .trim();
}
