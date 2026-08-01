const BILIBILI_URL_RE =
  /https?:\/\/(?:www\.)?(?:bilibili\.com\/video\/[^\s<>"{}|\\^`[\]]+|b23\.tv\/[^\s<>"{}|\\^`[\]]+)/gi;

export function extractBilibiliUrls(text: string): string[] {
  const matches = text.match(BILIBILI_URL_RE) || [];
  return [
    ...new Set(matches.map((u) => u.replace(/[),.;!?，。！？；：]+$/g, ""))),
  ];
}

export function isBilibiliUrl(url: string): boolean {
  return /bilibili\.com\/video\//i.test(url) || /b23\.tv\//i.test(url);
}

export function hasBilibiliIntent(text: string): boolean {
  if (extractBilibiliUrls(text).length > 0) return true;
  if (!/哔哩|bilibili|b站/i.test(text)) return false;
  return /字幕|视频|讲了|总结|转录|cc|这个up|up主/i.test(text);
}
