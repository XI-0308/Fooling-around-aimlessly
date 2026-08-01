/** 默认紫外线查询坐标（Open-Meteo WGS84）；本机可通过后续设置覆盖 */
export const DEFAULT_UV_COORDS = {
  latitude: 26.647,
  longitude: 106.63,
  label: "默认位置",
  timezone: "Asia/Shanghai",
} as const;

export interface UvSnapshot {
  locationLabel: string;
  timezone: string;
  currentUv: number | null;
  currentTimeLocal: string | null;
  todayMaxUv: number | null;
  todayDate: string | null;
  source: "Open-Meteo";
}

/** 中国气象常用紫外线等级（与公众预报口径接近） */
export function uvLevelLabel(uv: number): string {
  if (uv < 3) return "最弱";
  if (uv < 5) return "弱";
  if (uv < 7) return "中等";
  if (uv < 10) return "强";
  return "很强";
}

function parseUtcLocalPair(
  times: string[],
  values: Array<number | null | undefined>,
  nowMs: number
): { value: number | null; timeLocal: string | null } {
  if (!times.length || times.length !== values.length) {
    return { value: null, timeLocal: null };
  }

  let bestIdx = 0;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (let i = 0; i < times.length; i++) {
    const t = Date.parse(times[i]);
    if (Number.isNaN(t)) continue;
    const diff = Math.abs(t - nowMs);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestIdx = i;
    }
  }

  const raw = values[bestIdx];
  const value = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  return { value, timeLocal: times[bestIdx] ?? null };
}

export async function fetchGuiyangUvSnapshot(): Promise<UvSnapshot> {
  const { latitude, longitude, label, timezone } = DEFAULT_UV_COORDS;
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(latitude));
  url.searchParams.set("longitude", String(longitude));
  url.searchParams.set("hourly", "uv_index");
  url.searchParams.set("daily", "uv_index_max");
  url.searchParams.set("timezone", timezone);
  url.searchParams.set("forecast_days", "2");

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Open-Meteo HTTP ${res.status}`);
  }

  const data = (await res.json()) as {
    hourly?: { time?: string[]; uv_index?: Array<number | null> };
    daily?: { time?: string[]; uv_index_max?: Array<number | null> };
  };

  const hourlyTimes = data.hourly?.time || [];
  const hourlyUv = data.hourly?.uv_index || [];
  const { value: currentUv, timeLocal: currentTimeLocal } = parseUtcLocalPair(
    hourlyTimes,
    hourlyUv,
    Date.now()
  );

  const dailyTimes = data.daily?.time || [];
  const dailyMax = data.daily?.uv_index_max || [];
  const todayDate = dailyTimes[0] || null;
  const todayMaxRaw = dailyMax[0];
  const todayMaxUv =
    typeof todayMaxRaw === "number" && Number.isFinite(todayMaxRaw) ? todayMaxRaw : null;

  if (currentUv == null && todayMaxUv == null) {
    throw new Error("Open-Meteo 未返回有效的紫外线数据");
  }

  return {
    locationLabel: label,
    timezone,
    currentUv,
    currentTimeLocal,
    todayMaxUv,
    todayDate,
    source: "Open-Meteo",
  };
}

export function formatUvForPrompt(snap: UvSnapshot): string {
  const lines: string[] = [
    `地点：${snap.locationLabel}`,
    `数据源：${snap.source}（无需网页搜索核对）`,
    `时区：${snap.timezone}`,
  ];

  if (snap.currentUv != null) {
    const rounded = Math.round(snap.currentUv * 10) / 10;
    lines.push(
      `当前紫外线指数：${rounded}（${uvLevelLabel(snap.currentUv)}）` +
        (snap.currentTimeLocal ? `，对应时刻 ${snap.currentTimeLocal}` : "")
    );
  } else {
    lines.push("当前紫外线指数：暂无小时数据");
  }

  if (snap.todayMaxUv != null) {
    const rounded = Math.round(snap.todayMaxUv * 10) / 10;
    lines.push(
      `今日最高紫外线指数：${rounded}（${uvLevelLabel(snap.todayMaxUv)}）` +
        (snap.todayDate ? `，日期 ${snap.todayDate}` : "")
    );
  }

  lines.push(
    "等级参考：0–2 最弱 / 3–4 弱 / 5–6 中等 / 7–9 强 / ≥10 很强。",
    "回复用户时请直接使用以上数字与等级；不要说查不到，不要编造其它来源的数字。"
  );

  return lines.join("\n");
}
