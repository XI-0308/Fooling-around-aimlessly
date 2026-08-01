/**
 * 反瞎编：无对应执行时，收敛「已点歌/已画图/已发语音/已查询」类表演句。
 * 真正执行仍由 followUp 负责；这里只在「计划与正文不一致」时做轻量清理。
 */

const FAKE_MUSIC_RE =
  /(?:给你放了|帮你放了|我点了|已经点了|发了(?:一张|一条)?(?:音乐|歌曲)?卡片|网易云链接)/;
const FAKE_IMAGE_RE =
  /(?:画好了|画了一张|发给你看|图已经|生成了(?:一张)?图)/;
const FAKE_VOICE_RE = /(?:发了(?:一条)?语音|语音条|听我说)/;
const FAKE_KEEP_RE = /(?:我查了(?:一下)?(?:你的)?Keep|Keep\s*里显示|从Keep看到)/i;

export function stripUnsupportedToolClaims(
  text: string,
  opts: {
    willMusic: boolean;
    willImage: boolean;
    willShareImage: boolean;
    willVoice: boolean;
    didKeep: boolean;
  }
): string {
  let out = text;
  if (!opts.willMusic && FAKE_MUSIC_RE.test(out)) {
    out = out.replace(/(?:给你放了|帮你放了|我点了|已经点了)[^。！？\n]*/g, "").trim();
  }
  if (!opts.willImage && !opts.willShareImage && FAKE_IMAGE_RE.test(out)) {
    out = out.replace(/(?:画好了|画了一张|生成了(?:一张)?图)[^。！？\n]*/g, "").trim();
  }
  if (!opts.willVoice && FAKE_VOICE_RE.test(out)) {
    out = out.replace(/(?:发了(?:一条)?语音)[^。！？\n]*/g, "").trim();
  }
  if (!opts.didKeep && FAKE_KEEP_RE.test(out)) {
    out = out.replace(/(?:我查了(?:一下)?(?:你的)?Keep|从Keep看到)[^。！？\n]*/gi, "").trim();
  }
  return out.replace(/\n{3,}/g, "\n\n").trim();
}
