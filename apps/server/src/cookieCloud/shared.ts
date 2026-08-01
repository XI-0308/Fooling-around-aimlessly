/** CookieCloud 通用拉取与按域名提取 Cookie */

interface CookieCloudPayload {
  cookie_data: Record<string, unknown>;
  local_storage_data?: Record<string, unknown>;
}

export async function fetchCookieCloudPayload(
  url: string,
  id: string,
  password: string
): Promise<CookieCloudPayload> {
  const base = url.replace(/\/$/, "");
  const res = await fetch(`${base}/get/${id}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  if (res.status === 404) {
    throw new Error("CookieCloud 尚无同步数据，请先在浏览器扩展里登录并点「同步」");
  }
  if (!res.ok) {
    throw new Error(
      "CookieCloud 解密失败：请确认扩展里的 UUID、密码、加密模式与 Encore Flow 设置完全一致，然后重新同步"
    );
  }
  const data = (await res.json()) as CookieCloudPayload;
  if (!data.cookie_data || Object.keys(data.cookie_data).length === 0) {
    throw new Error(
      "CookieCloud 已连接，但同步内容为空。请在 Edge 扩展「同步域名关键词」填 music.163.com 和 weread.qq.com（不要加 https://），登录对应网站后点「手动同步」"
    );
  }
  return data;
}

export async function fetchCookieCloudData(
  url: string,
  id: string,
  password: string
): Promise<Record<string, unknown>> {
  const data = await fetchCookieCloudPayload(url, id, password);
  return data.cookie_data;
}

function normalizeDomainKey(key: string): string {
  return key
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
}

function normalizeNeedles(needles: string[]): string[] {
  return [...new Set(needles.map(normalizeDomainKey).filter(Boolean))];
}

export function extractCookiesForDomains(
  cookieData: Record<string, unknown>,
  domainNeedles: string[]
): string | null {
  const needles = normalizeNeedles(domainNeedles);
  const matched: Array<{ name: string; value: string }> = [];
  const seen = new Set<string>();

  for (const [rawKey, items] of Object.entries(cookieData)) {
    if (!Array.isArray(items)) continue;
    const bucket = normalizeDomainKey(rawKey);
    for (const raw of items) {
      const c = raw as { domain?: string; name?: string; value?: string };
      if (!c.name || !c.value) continue;
      const dom = normalizeDomainKey(c.domain || bucket);
      if (!needles.some((n) => dom.includes(n) || bucket.includes(n))) continue;
      const sig = `${c.name}=${c.domain || bucket}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      matched.push({ name: c.name, value: c.value });
    }
  }

  if (matched.length === 0) return null;
  return matched.map((c) => `${c.name}=${c.value}`).join("; ");
}

function detectEmptyHttpsBuckets(cookieData: Record<string, unknown>): boolean {
  return Object.entries(cookieData).some(
    ([key, items]) =>
      /^https?:\/\//i.test(key.trim()) && Array.isArray(items) && items.length === 0
  );
}

function describeMissingDomainCookies(
  cookieData: Record<string, unknown>,
  localStorageData: Record<string, unknown> | undefined,
  needles: string[],
  label: string
): string {
  const normalized = normalizeNeedles(needles);
  const site = normalized.find((n) => n.includes(".")) || normalized[0] || "对应网站";
  const hasLocal = Object.keys(localStorageData || {}).some((k) =>
    normalized.some((n) => normalizeDomainKey(k).includes(n))
  );
  const bucketEntry = Object.entries(cookieData).find(([k]) =>
    normalized.some((n) => normalizeDomainKey(k).includes(n))
  );
  const bucketEmpty =
    bucketEntry && Array.isArray(bucketEntry[1]) && bucketEntry[1].length === 0;

  if (hasLocal && bucketEmpty) {
    return (
      `${label}：localStorage 已同步但 Cookie 为 0 条（Encore Flow 必须用 Cookie 登录）。` +
      `请在 Edge 打开 ${site} 确认网页版已登录 → 扩展点「手动同步」；` +
      `仍不行则在设置里粘贴「手动 Cookie」备用`
    );
  }
  if (detectEmptyHttpsBuckets(cookieData)) {
    return `${label}：未同步（域名关键词不要加 https://，应填 music.163.com）`;
  }
  return `${label}：Cookie 未同步（请先在 Edge 登录 ${site}，再点扩展「手动同步」）`;
}

export interface CookieCloudConfig {
  url?: string;
  id?: string;
  password?: string;
}

export function isCookieCloudReady(cloud?: CookieCloudConfig): boolean {
  return Boolean(cloud?.url?.trim() && cloud?.id?.trim() && cloud?.password?.trim());
}

async function fetchCloudCookieString(
  cloud: CookieCloudConfig,
  domainNeedles: string[],
  cloudErrorLabel: string
): Promise<string> {
  const payload = await fetchCookieCloudPayload(
    cloud.url!.trim(),
    cloud.id!.trim(),
    cloud.password!.trim()
  );
  const cookie = extractCookiesForDomains(payload.cookie_data, domainNeedles);
  if (cookie) return cookie;
  throw new Error(
    describeMissingDomainCookies(
      payload.cookie_data,
      payload.local_storage_data,
      domainNeedles,
      cloudErrorLabel
    )
  );
}

/** 已配置 CookieCloud 时优先云端；云端失败时回退手动 Cookie */
export async function resolveCookieFromCloudOrManual(
  manualCookie: string | undefined,
  cloud: CookieCloudConfig | undefined,
  domainNeedles: string[],
  cloudErrorLabel: string
): Promise<string> {
  if (isCookieCloudReady(cloud)) {
    try {
      return await fetchCloudCookieString(cloud!, domainNeedles, cloudErrorLabel);
    } catch (err) {
      if (manualCookie?.trim()) return manualCookie.trim();
      throw err;
    }
  }
  if (manualCookie?.trim()) return manualCookie.trim();
  throw new Error(`${cloudErrorLabel}：请填写 Cookie 或配置 CookieCloud`);
}

export async function testCookieCloudConn(
  cloud: CookieCloudConfig,
  checks: { label: string; needles: string[] }[]
): Promise<string> {
  if (!isCookieCloudReady(cloud)) {
    throw new Error("请先填写 CookieCloud 地址、UUID 和密码并保存");
  }
  const payload = await fetchCookieCloudPayload(
    cloud.url!.trim(),
    cloud.id!.trim(),
    cloud.password!.trim()
  );
  const parts = checks.map(({ label, needles }) => {
    const cookie = extractCookiesForDomains(payload.cookie_data, needles);
    if (!cookie) {
      return describeMissingDomainCookies(
        payload.cookie_data,
        payload.local_storage_data,
        needles,
        label
      );
    }
    const count = cookie.split(";").filter(Boolean).length;
    return `${label}：已同步 ${count} 项`;
  });
  return parts.join("；");
}
