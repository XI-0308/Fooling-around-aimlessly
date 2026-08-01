/** 说话人身份：由系统标注，不要求角色在正文里自报「角色：」 */

import { formatMessageClock } from "../chatTimeMarkers.js";

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 去掉正文开头的「角色：」「用户：」等自写前缀 */
export function stripSpeakerPrefix(content: string, names: string[]): string {
  let text = content.trimStart();
  for (const name of names) {
    if (!name?.trim()) continue;
    const re = new RegExp(`^${escapeRegExp(name.trim())}\\s*[:：]\\s*`, "i");
    if (re.test(text)) {
      text = text.replace(re, "");
      break;
    }
  }
  return text;
}

/** 去掉模型可能模仿的语音占位（语音气泡由附件系统生成） */
export function stripVoiceMetaPrefix(content: string): string {
  return content
    .replace(/^\[语音消息\]\s*/i, "")
    .replace(/^\[语音[^\]]*\]\s*/i, "")
    .trimStart();
}

/** 落库 / TTS 前清洗助手正文 */
export function sanitizeAssistantOutput(
  content: string,
  charName: string,
  userName: string
): string {
  let text = stripSpeakerPrefix(content.trim(), [charName, userName]);
  text = stripVoiceMetaPrefix(text);
  // 系统标签若被模型抄进正文也剥掉
  text = text.replace(/^\[说话人[·・.][^\]]+\]\s*/i, "").trimStart();
  // 偶发抄写时钟行（今天 （周二）10:37 / 上周三 09:15 / 旧版）
  text = text
    .replace(
      /^(?:今天|昨天|前天|明天|后天)\s*（周[一二三四五六日]）\s*\d{2}:\d{2}(?:（[^）]*）)?\s*/u,
      ""
    )
    .replace(
      /^(?:这周|上周|下周|上上周|下下周)[一二三四五六日]\s+\d{2}:\d{2}\s*/u,
      ""
    )
    .replace(
      /^(?:今天|昨天|前天|明天|后天|\d{1,2}月\d{1,2}日(?:（周[一二三四五六日]）)?|\d{4}-\d{2}-\d{2})\s+\d{2}:\d{2}(?:（[^）]*）)?\s*/u,
      ""
    )
    .trimStart();
  return text.trim();
}

/** 注入提示词：说明历史里的说话人/时间标记是系统加的 */
export function buildSpeakerIdentityDirective(charName: string, userName: string): string {
  return (
    `【说话人与时间标注——系统层，不是角色台词】\n` +
    `下方对话历史里，每条消息前的「今天 （周X）HH:MM」以及「${charName}：」「${userName}：」由系统自动加上，用来标明谁在何时说的。\n` +
    `- 你（${charName}）写回复时，不要以「${charName}：」「${charName}:」开头，也不要抄写时间行。\n` +
    `- 不要把「[语音消息]」「[语音]」写进正文；语音气泡由系统根据附件生成。\n` +
    `- 直接输出你对${userName}说的话与动作即可。`
  );
}

/** 历史轮次：时钟 + 说话人 + 正文 */
export function formatDialogueTurn(
  role: "user" | "assistant",
  content: string,
  charName: string,
  userName: string,
  createdAt?: string | null,
  now: Date = new Date()
): { text: string; speaker: string; clockLabel: string | null } {
  const speaker = role === "assistant" ? charName : userName;
  const body = stripSpeakerPrefix(content, [charName, userName]);
  const clockLabel =
    createdAt && !Number.isNaN(new Date(createdAt).getTime())
      ? formatMessageClock(createdAt, now)
      : null;
  const text = clockLabel
    ? `${clockLabel}\n${speaker}：${body}`
    : `${speaker}：${body}`;
  return { text, speaker, clockLabel };
}
