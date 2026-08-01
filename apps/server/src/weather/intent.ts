import { stripUserVisibleText } from "../tools/enrichMarkers.js";

/** 用户想查紫外线 / 晒伤相关实时数据 */
const UV_INTENT_RE =
  /紫外线|UV\s*指数|uv\s*index|晒伤|防晒|烈日|暴晒|阳光太(?:强|大)|晒得慌/i;

export function hasUvIntent(content: string): boolean {
  const t = stripUserVisibleText(content).trim();
  if (!t) return false;
  return UV_INTENT_RE.test(t);
}
