/** 用户界面隐藏后端注入块（与 server tools/enrichMarkers 保持一致） */
export function stripEnrichBlocksFromDisplay(content: string): string {
  let text = content;
  const visionIdx = text.indexOf("\n\n图片上是：");
  if (visionIdx >= 0) text = text.slice(0, visionIdx);
  const markers = [
    "[用户分享的网页 — 正文摘要]",
    "[工具 · 看图]",
    "[工具 · 微信读书]",
    "[工具 · Bilibili 字幕]",
    "[工具 · 知乎]",
    "[工具 · 紫外线指数]",
    "[工具 · Keep 健康]",
    "[工具 · 语音识别]",
    "[用户发送的图片 — Vision 转述]",
  ];
  for (const marker of markers) {
    const idx = text.indexOf(`\n\n${marker}`);
    if (idx >= 0) text = text.slice(0, idx);
  }
  return text.trim();
}

export function hasWeReadEnrichSuccess(content: string): boolean {
  return content.includes("[工具 · 微信读书]") && /状态：成功/.test(content);
}

function extractWeReadEnrichData(content: string): string | null {
  const marker = "\n\n[工具 · 微信读书]";
  const idx = content.indexOf(marker);
  if (idx < 0) return null;
  const block = content.slice(idx);
  if (!/状态：成功/.test(block)) return null;
  const dataMatch = block.match(/数据：\n([\s\S]*)/);
  return dataMatch?.[1]?.trim() || null;
}

/** 与 server wereadMemory.hasWeReadExcerptableData 保持一致 */
export function hasWeReadExcerptableData(dataBody: string): boolean {
  if (!dataBody.trim()) return false;

  if (/【划线】[\s\S]*?\n-\s+\S/.test(dataBody)) return true;
  if (/【笔记\/想法】[\s\S]*?\n-\s+\S/.test(dataBody)) return true;

  const counts = dataBody.match(/划线\s+(\d+)\s*条[，,]\s*笔记\/想法\s+(\d+)\s*条/);
  if (counts && (Number(counts[1]) > 0 || Number(counts[2]) > 0)) return true;

  if (/【热门划线/.test(dataBody)) {
    const section = (dataBody.split("【热门划线")[1] || "").split("\n【")[0] || "";
    if (/\n-\s+\S/.test(section)) return true;
  }

  return false;
}

/** 微信读书注入成功且含可摘抄划线/笔记（非仅书架/在读概览） */
export function hasWeReadExcerptableContent(content: string): boolean {
  if (!hasWeReadEnrichSuccess(content)) return false;
  const data = extractWeReadEnrichData(content);
  return data ? hasWeReadExcerptableData(data) : false;
}
