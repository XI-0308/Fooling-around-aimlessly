/** 与世界书共用的关键词匹配逻辑 */

export function normalizeScanText(text: string, caseSensitive: boolean): string {
  return caseSensitive ? text : text.toLowerCase();
}

/** 书名类关键词：同时匹配带/不带 《》 的写法 */
function keyMatchVariants(key: string): string[] {
  const k = key.trim();
  if (!k) return [];
  const out = [k];
  const stripped = k.replace(/[《》〈〉「」『』]/g, "").trim();
  if (stripped && stripped !== k) out.push(stripped);
  return out;
}

export function matchTriggerKey(key: string, haystack: string, caseSensitive: boolean): boolean {
  const k = key.trim();
  if (!k) return false;
  if (k.startsWith("/") && k.lastIndexOf("/") > 0) {
    const last = k.lastIndexOf("/");
    const pattern = k.slice(1, last);
    const flags = k.slice(last + 1) || (caseSensitive ? "" : "i");
    try {
      return new RegExp(pattern, flags).test(haystack);
    } catch {
      return false;
    }
  }
  const h = normalizeScanText(haystack, caseSensitive);
  return keyMatchVariants(k).some((v) => h.includes(normalizeScanText(v, caseSensitive)));
}

export function anyKeyMatches(keys: string[], text: string, caseSensitive: boolean): boolean {
  return keys.some((k) => matchTriggerKey(k, text, caseSensitive));
}

export function parseKeysInput(input: string): string[] {
  return input
    .split(/[,，;；\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
