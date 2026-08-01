import type { NewApiChannelConn } from "../config.js";

function normalizeBaseUrl(url: string): string {
  let base = url.trim().replace(/\/+$/, "");
  // 用户常误填完整 endpoint，需剥掉路径后缀
  base = base.replace(/\/v1\/chat\/completions\/?$/i, "");
  base = base.replace(/\/v1\/models\/?$/i, "");
  base = base.replace(/\/v1\/images\/generations\/?$/i, "");
  // 火山方舟 Seedream：完整路径 …/api/v3/images/generations
  base = base.replace(/\/api\/v3\/images\/generations\/?$/i, "/api/v3");
  base = base.replace(/\/images\/generations\/?$/i, "");
  // OpenAI 兼容网关常见写法 https://host/v1
  base = base.replace(/\/v1\/?$/i, "");
  return base.replace(/\/+$/, "");
}

/** OpenAI 兼容用 /v1/images/generations；火山方舟用 /api/v3/images/generations */
function imagesGenerationsUrl(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  if (/\/api\/v3$/i.test(base)) {
    return `${base}/images/generations`;
  }
  return `${base}/v1/images/generations`;
}

function modelsListUrl(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  if (/\/api\/v3$/i.test(base)) {
    return `${base}/models`;
  }
  return `${base}/v1/models`;
}

function chatCompletionsUrl(baseUrl: string): string {
  const base = normalizeBaseUrl(baseUrl);
  if (/\/api\/v3$/i.test(base)) {
    return `${base}/chat/completions`;
  }
  return `${base}/v1/chat/completions`;
}

/**
 * 兼容从 NewAPI 控制台复制的通道连接 JSON：
 * {"_type":"newapi_channel_conn","key":"sk-...","url":"https://..."}
 */
export function unwrapNewApiCredential(raw: string): { apiKey: string; baseUrl?: string } {
  const text = (raw || "").trim();
  if (!text) return { apiKey: "" };
  if (text.startsWith("{")) {
    try {
      const parsed = JSON.parse(text) as {
        _type?: string;
        key?: string;
        apiKey?: string;
        url?: string;
        baseUrl?: string;
      };
      const key = (parsed.key || parsed.apiKey || "").trim();
      if (key) {
        return {
          apiKey: key,
          baseUrl: (parsed.url || parsed.baseUrl || "").trim() || undefined,
        };
      }
    } catch {
      /* 不是 JSON，当普通 key */
    }
  }
  return { apiKey: text };
}

function resolveConn(conn: NewApiChannelConn): { baseUrl: string; apiKey: string; defaultModel?: string } {
  const unwrapped = unwrapNewApiCredential(conn.apiKey || "");
  const baseUrl = (conn.baseUrl?.trim() || unwrapped.baseUrl || "").trim();
  return {
    baseUrl,
    apiKey: unwrapped.apiKey,
    defaultModel: conn.defaultModel,
  };
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey.trim()}`,
  };
}

async function listAvailableModels(conn: NewApiChannelConn): Promise<string[]> {
  try {
    const resolved = resolveConn(conn);
    const res = await fetch(modelsListUrl(resolved.baseUrl), {
      headers: { Authorization: `Bearer ${resolved.apiKey}` },
    });
    if (!res.ok) return [];
    const raw = (await res.json()) as { data?: { id?: string }[] };
    return (raw.data ?? []).map((m) => m.id).filter((id): id is string => Boolean(id));
  } catch {
    return [];
  }
}

/** 1×1 透明 PNG，用于 Vision 连通性测试 */
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

export async function enrichVisionApiError(
  conn: NewApiChannelConn,
  model: string,
  msg: string
): Promise<string> {
  let enriched = msg;
  if (/no access to model|has no access/i.test(msg)) {
    const available = await listAvailableModels(conn);
    if (available.length) {
      enriched += `。此 Key 当前可用模型：${available.join(", ")}`;
    }
  }
  return formatVisionModelError(model, enriched);
}

export function formatVisionModelError(model: string, raw: string): string {
  if (/no access to model|has no access|无权|无权限/i.test(raw)) {
    return (
      `当前 API Key 无权使用模型「${model}」。` +
      `请在 niuflu 控制台确认该令牌已开通此模型（可先用 curl 调 /v1/models 查看可用列表），或换有权限的 Key。` +
      ` 原始错误：${raw.slice(0, 200)}`
    );
  }
  if (/no available channel|not found|does not exist|unsupported|无可用|不存在/i.test(raw)) {
    return (
      `模型「${model}」在当前 NewAPI 网关无可用通道。` +
      `请在设置 → 看图 → 默认模型 中改为网关实际支持的 Vision 模型（常见：gpt-4o、gpt-4o-mini、gemini-2.0-flash）。` +
      ` 原始错误：${raw.slice(0, 200)}`
    );
  }
  return raw;
}

/** NewAPI / OpenAI 兼容生图 */
export async function generateImage(
  conn: NewApiChannelConn,
  prompt: string,
  options?: { model?: string; size?: string }
): Promise<{ url?: string; b64?: string; raw: unknown }> {
  const resolved = resolveConn(conn);
  if (!resolved.baseUrl || !resolved.apiKey) {
    throw new Error("生图接口未配置");
  }
  const model = options?.model || resolved.defaultModel || "dall-e-3";
  const res = await fetch(imagesGenerationsUrl(resolved.baseUrl), {
    method: "POST",
    headers: authHeaders(resolved.apiKey),
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: options?.size || "1024x1024",
    }),
  });
  const raw = (await res.json()) as {
    error?: { message?: string };
    data?: { url?: string; b64_json?: string }[];
  };
  if (!res.ok) {
    const msg = raw.error?.message || `HTTP ${res.status}`;
    throw new Error(await enrichImageGenApiError(conn, model, msg));
  }
  const first = raw.data?.[0];
  return { url: first?.url, b64: first?.b64_json, raw };
}

export function formatImageGenModelError(model: string, raw: string): string {
  if (/overdue balance|欠费|余额不足|逾期/i.test(raw)) {
    return (
      `火山方舟账户欠费或余额不足，生图已被拒绝（模型「${model}」）。` +
      `请到火山引擎控制台结清账单/充值后再试。` +
      ` 原始错误：${raw.slice(0, 220)}`
    );
  }
  if (/no available channel|无可用通道|not found|does not exist|unsupported/i.test(raw)) {
    return (
      `模型「${model}」在当前 NewAPI 网关无可用生图通道（常见原因：模型名填错、分组未开通、或该令牌无权使用）。` +
      `请在设置 → 生图 → 默认模型 中改为网关控制台里实际支持的生图模型名。` +
      ` 原始错误：${raw.slice(0, 220)}`
    );
  }
  if (/no access|has no access|无权|无权限/i.test(raw)) {
    return (
      `当前 API Key 无权使用生图模型「${model}」。` +
      `请在网关控制台确认该令牌已开通此模型，或更换有权限的 Key / 模型名。` +
      ` 原始错误：${raw.slice(0, 220)}`
    );
  }
  return raw;
}

export async function enrichImageGenApiError(
  conn: NewApiChannelConn,
  model: string,
  msg: string
): Promise<string> {
  let enriched = msg;
  if (/no available channel|no access|has no access|无可用|无权/i.test(msg)) {
    const available = await listAvailableModels(conn);
    if (available.length) {
      const imageLike = available.filter((id) =>
        /image|dall|flux|gpt-image|midjourney|seedream|ideogram|recraft/i.test(id)
      );
      const hint = imageLike.length ? imageLike : available;
      enriched += `。此 Key 列出的相关模型：${hint.slice(0, 18).join(", ")}${hint.length > 18 ? "…" : ""}`;
    }
  }
  return formatImageGenModelError(model, enriched);
}

/** NewAPI / OpenAI 兼容看图（vision chat） */
export async function describeImage(
  conn: NewApiChannelConn,
  imageUrl: string,
  prompt = "请描述这张图片的内容。"
): Promise<string> {
  const resolved = resolveConn(conn);
  if (!resolved.baseUrl || !resolved.apiKey) {
    throw new Error("看图接口未配置");
  }
  const model = resolved.defaultModel?.trim() || "gpt-4o-mini";
  const res = await fetch(chatCompletionsUrl(resolved.baseUrl), {
    method: "POST",
    headers: authHeaders(resolved.apiKey),
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      max_tokens: 512,
    }),
  });
  const raw = (await res.json()) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
  };
  if (!res.ok) {
    const msg = raw.error?.message || `HTTP ${res.status}`;
    throw new Error(await enrichVisionApiError(conn, model, msg));
  }

  const content = raw.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error(`模型「${model}」未返回描述内容`);
  return content;
}

export async function testNewApiConn(conn: NewApiChannelConn, label: string): Promise<string> {
  const resolved = resolveConn(conn);
  if (!resolved.baseUrl || !resolved.apiKey) {
    throw new Error(`${label}：请先填写 URL 与 Key`);
  }
  const res = await fetch(modelsListUrl(resolved.baseUrl), {
    headers: { Authorization: `Bearer ${resolved.apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${label} HTTP ${res.status}: ${text.slice(0, 180)}`);
  }
  return `${label} API 密钥有效（models 可访问）。注意：这不代表「默认模型」一定能生图，生图请点「测试生图模型」。`;
}

/** 用指定模型做一次真实生图测试 */
export async function testImageGenConn(
  conn: NewApiChannelConn,
  modelOverride?: string
): Promise<string> {
  const resolved = resolveConn(conn);
  if (!resolved.baseUrl || !resolved.apiKey) {
    throw new Error("生图：请先填写 URL 与 Key");
  }
  const model = modelOverride?.trim() || resolved.defaultModel?.trim() || "dall-e-3";
  const result = await generateImage(conn, "a simple red circle on white background, minimal test", {
    model,
    size: "1024x1024",
  });
  if (!result.url && !result.b64) {
    throw new Error(`模型「${model}」请求成功但未返回图片数据`);
  }
  return `生图模型「${model}」可用，已成功生成测试图`;
}

/** 用指定 Vision 模型做一次真实识图测试 */
export async function testVisionConn(
  conn: NewApiChannelConn,
  modelOverride?: string
): Promise<string> {
  const resolved = resolveConn(conn);
  if (!resolved.baseUrl || !resolved.apiKey) {
    throw new Error("看图：请先填写 URL 与 Key");
  }
  const model = modelOverride?.trim() || resolved.defaultModel?.trim() || "gpt-4o-mini";
  const dataUrl = `data:image/png;base64,${TINY_PNG_BASE64}`;

  const res = await fetch(chatCompletionsUrl(resolved.baseUrl), {
    method: "POST",
    headers: authHeaders(resolved.apiKey),
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "回复 OK 两个字母即可。" },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      max_tokens: 16,
    }),
  });

  const raw = (await res.json()) as {
    error?: { message?: string };
    choices?: { message?: { content?: string } }[];
  };

  if (!res.ok) {
    const msg = raw.error?.message || `HTTP ${res.status}`;
    throw new Error(await enrichVisionApiError(conn, model, msg));
  }

  const reply = raw.choices?.[0]?.message?.content?.trim() || "（无文本）";
  return `看图模型「${model}」可用，测试回复：${reply.slice(0, 40)}`;
}
