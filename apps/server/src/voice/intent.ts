/** 模型在回复末尾输出的隐形语音标记（用户不可见） */



/** 匹配 [[VOICE]] 或 [[VOICE:…]] */

export const VOICE_MARKER_RE = /\[\[VOICE(?::\s*[\s\S]*?)?\]\]/gi;



/** 注入 prompt，教模型用 [[VOICE]] 触发后端 TTS */

export function buildVoiceMarkerHint(userName = "你"): string {

  return (

    `【语音回复调用规则】你可以按心情、场景和${userName}的需要，自己判断要不要发语音条：\n` +

    "1. 多数时候用文字即可，不要每条回复都加语音。\n" +

    `2. 当你判断此刻更适合让${userName}「听见」你（安慰、撒娇、认真说话、接她的语音、她明确想听你说等），在回复最末尾单独一行输出：[[VOICE]]\n` +

    "3. 禁止在正文里描写「按录音键 / 松开录音 / 发送语音消息」——那样不会产生真实语音条。\n" +

    "4. 正文不要写「[语音]」「[语音消息]」「发语音条」等元说明；实际语音由后端根据 [[VOICE]] 合成。"

  );

}



/** @deprecated 请用 buildVoiceMarkerHint(userName) */

export const VOICE_MARKER_HINT = buildVoiceMarkerHint();



/** 模型在演「发语音」但没打标记（避免误伤「聊到语音功能」的普通文字） */

const ROLEPLAYED_VOICE_RE =

  // legacy compat: 旧聊天记录里可能出现 legacy user 发送语音 等自写前缀

  /按住录音|按下录音|按(?:了)?录音键|松开录音|录音键|凑近嘴边|对着(?:你的)?麦克风|(?:正式地?)?(?:给.{0,2})?发送(?:了|出)?(?:一条|条)?语音消息|发(?:了|出)(?:一条|条)语音(?:消息|条)?/i;



export function stripVoiceMarker(text: string): { cleanText: string; wantsVoice: boolean } {

  let wantsVoice = false;

  const cleanText = text

    .replace(VOICE_MARKER_RE, () => {

      wantsVoice = true;

      return "";

    })

    .replace(/\n{3,}/g, "\n\n")

    .trim();

  return { cleanText, wantsVoice };

}



export function assistantRoleplayedVoiceWithoutMarker(assistantRaw: string): boolean {

  const { cleanText, wantsVoice } = stripVoiceMarker(assistantRaw);

  if (wantsVoice) return false;

  return ROLEPLAYED_VOICE_RE.test(cleanText);

}



/** 去掉「假装按录音键」的描写（系统会另挂真实语音条） */

export function stripRoleplayedVoiceArtifacts(text: string): string {

  return text

    .replace(

      /\n*（[^）\n]*(?:按住录音|按下录音|按(?:了)?录音键|松开录音|录音键|凑近嘴边|对着(?:你的)?麦克风|发送(?:了|出)?(?:一条|条)?语音|发(?:了|出)(?:一条|条)语音)[^）\n]*）\n*/g,

      "\n"

    )

    .replace(/\n{3,}/g, "\n\n")

    .trim();

}

