import { stripImageGenMarker } from "../imageGen/intent.js";
import { sanitizeMusicQuery, stripMusicMarker } from "../music/intent.js";
import { stripVoiceMarker } from "../voice/intent.js";
import { stripShareImageMarker } from "../web/webImage.js";

/** 角色回复里用隐形标记声明的工具起调（优先于调度员 plan） */
export interface AgentToolClaims {
  musicQuery: string | null;
  wantsVoice: boolean;
  imagePrompt: string | null;
  shareImageSource: string | null;
}

export function agentToolClaimsFromText(assistantRaw: string): AgentToolClaims {
  const { source: shareImageSource } = stripShareImageMarker(assistantRaw);
  const { prompt: imagePrompt } = stripImageGenMarker(assistantRaw);
  const { query: musicRaw } = stripMusicMarker(assistantRaw);
  const { wantsVoice } = stripVoiceMarker(assistantRaw);

  let share = shareImageSource;
  let image = imagePrompt;
  // 同条互斥：找图标记优先于生图标记
  if (share && image) image = null;

  return {
    musicQuery: sanitizeMusicQuery(musicRaw),
    wantsVoice,
    imagePrompt: image,
    shareImageSource: share,
  };
}

/** 把角色已声明的槽位写入 plan（可覆盖调度①预填），避免调度员再抢同一工具 */
export function seedPlanFromAgentClaims<
  T extends {
    musicQuery: string | null;
    wantsVoice: boolean;
    imagePrompt: string | null;
    shareImageSource: string | null;
  },
>(plan: T, claims: AgentToolClaims): T {
  const next = { ...plan };
  if (claims.shareImageSource) {
    next.shareImageSource = claims.shareImageSource;
    next.imagePrompt = null;
  } else if (claims.imagePrompt) {
    next.imagePrompt = claims.imagePrompt;
    next.shareImageSource = null;
  }
  if (claims.musicQuery !== null) {
    next.musicQuery = claims.musicQuery;
  }
  if (claims.wantsVoice) {
    next.wantsVoice = true;
  }
  return next;
}
