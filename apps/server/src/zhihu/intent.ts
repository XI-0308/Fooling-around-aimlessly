const ZHIHU_URL_RE =
  /https?:\/\/(?:www\.)?(?:zhihu\.com\/(?:question\/\d+(?:\/answer\/\d+)?|p\/\d+)|zhuanlan\.zhihu\.com\/p\/\d+)[^\s<>"{}|\\^`[\]]*/gi;

const ZHIHU_LOOSE_URL_RE = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

function cleanUrl(url: string): string {
  return url.replace(/[),.;!?，。！？；：]+$/g, "");
}

export function extractZhihuUrls(text: string): string[] {
  const strict = text.match(ZHIHU_URL_RE) || [];
  const loose =
    text.match(ZHIHU_LOOSE_URL_RE)?.filter((u) => /zhihu\.com/i.test(u) && !/weixin\.qq\.com/i.test(u)) ||
    [];
  return [...new Set([...strict, ...loose].map(cleanUrl))];
}

export function isZhihuUrl(url: string): boolean {
  return /zhihu\.com/i.test(url);
}

export function hasZhihuIntent(text: string): boolean {
  if (extractZhihuUrls(text).length > 0) return true;
  if (!/知乎|zhihu/i.test(text)) return false;
  return /文章|专栏|问题|回答|看看|这篇|读后|摘要|链接|url/i.test(text);
}

export type ZhihuTarget =
  | { kind: "article"; id: string }
  | { kind: "question"; id: string }
  | { kind: "answer"; questionId: string; answerId: string };

export function parseZhihuUrl(url: string): ZhihuTarget | null {
  const article = url.match(/(?:zhuanlan\.)?zhihu\.com\/p\/(\d+)/i);
  if (article?.[1]) return { kind: "article", id: article[1] };

  const answer = url.match(/zhihu\.com\/question\/(\d+)\/answer\/(\d+)/i);
  if (answer?.[1] && answer[2]) {
    return { kind: "answer", questionId: answer[1], answerId: answer[2] };
  }

  const question = url.match(/zhihu\.com\/question\/(\d+)/i);
  if (question?.[1]) return { kind: "question", id: question[1] };

  return null;
}
