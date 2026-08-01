import { sanitizeAssistantOutput, stripSpeakerPrefix } from "../text/speakerLabel.js";

/** 朗读前去掉括号内动作/旁白，以及说话人前缀、语音占位 */
export function stripTextForTts(text: string, speakerNames?: string[]): string {
  let s = text.trim();
  if (!s) return "";

  if (speakerNames && speakerNames.length > 0) {
    const [charName = "", userName = ""] = speakerNames;
    s = sanitizeAssistantOutput(s, charName, userName);
  } else {
    s = stripSpeakerPrefix(s, []);
  }

  let prev = "";
  while (prev !== s) {
    prev = s;
    s = s.replace(/（[^（）]*）/g, "");
    s = s.replace(/\([^()]*\)/g, "");
  }

  s = s
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();

  return s;
}
