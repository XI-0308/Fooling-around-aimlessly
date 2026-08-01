import { loadSettings } from "../config.js";
import { getChat } from "../store/chats.js";
import { getCharacter } from "../store/characters.js";
import { loadUserPersona } from "../store/userPersona.js";
import { prepareKeepForChat } from "../keep/keepEnrich.js";
import {
  agentToolClaimsFromText,
  seedPlanFromAgentClaims,
} from "./agentClaims.js";
import { decideToolIntent } from "./decide.js";
import { ensureTurnToolPlan, setTurnToolPlan, clearTurnToolPlan } from "./state.js";
import {
  buildDispatcherHistory,
  type ToolDispatchIntent,
  type TurnToolPlan,
} from "./types.js";

/** 只填空位；image / shareImage 互斥，不覆盖角色或先前已占槽 */
function applyIntentToPlan(
  plan: TurnToolPlan,
  intent: ToolDispatchIntent,
  opts: { pass: 1 | 2; settings: ReturnType<typeof loadSettings> }
): TurnToolPlan {
  const next = { ...plan };
  const { settings } = opts;

  if (
    settings.musicEnabled !== false &&
    intent.music !== null &&
    next.musicQuery === null
  ) {
    next.musicQuery = intent.music;
  }
  if (
    settings.assistantVoiceReplyEnabled !== false &&
    settings.voiceMessagesEnabled !== false &&
    intent.voice &&
    !next.wantsVoice
  ) {
    next.wantsVoice = true;
  }
  if (
    settings.imageGenEnabled !== false &&
    intent.image !== null &&
    next.imagePrompt === null &&
    next.shareImageSource === null
  ) {
    next.imagePrompt = intent.image;
  }
  if (
    intent.shareImage !== null &&
    next.shareImageSource === null &&
    next.imagePrompt === null
  ) {
    next.shareImageSource = intent.shareImage;
  }

  return next;
}

/** 调度①：Keep 可主动查；点歌/生图/找图/语音仅轻量预填，正式以角色标记为准 */
export async function runToolDispatcherPass1(chatId: string): Promise<TurnToolPlan | null> {
  const settings = loadSettings();
  if (settings.toolDispatcherEnabled !== true) return null;

  clearTurnToolPlan(chatId);
  const chat = getChat(chatId);
  if (!chat) return null;
  const character = getCharacter(chat.characterId);
  const userName = loadUserPersona().name?.trim() || "你";
  const charName = character?.data?.name?.trim() || chat.characterName || "角色";

  const history = buildDispatcherHistory(chat.messages, {
    pass: 1,
    userName,
    charName,
  });
  const intent = await decideToolIntent({
    pass: 1,
    historyMessages: history,
    userName,
    charName,
  });

  let plan = ensureTurnToolPlan(chatId);

  if (settings.keepEnabled !== false && intent.keep !== null) {
    const keep = await prepareKeepForChat(chatId, {
      skipIntentCheck: true,
      forceQuery: intent.keep.trim() || undefined,
    });
    if (keep) plan.keepDone = true;
  }

  plan = applyIntentToPlan(plan, intent, { pass: 1, settings });
  setTurnToolPlan(chatId, plan);
  return plan;
}

/** 调度②：角色标记优先占槽；仅补漏调（含 Keep）；不抢已起调工具 */
export async function runToolDispatcherPass2(
  chatId: string,
  assistantText: string
): Promise<TurnToolPlan | null> {
  const settings = loadSettings();
  if (settings.toolDispatcherEnabled !== true) return null;

  const chat = getChat(chatId);
  if (!chat) return null;
  const character = getCharacter(chat.characterId);
  const userName = loadUserPersona().name?.trim() || "你";
  const charName = character?.data?.name?.trim() || chat.characterName || "角色";

  // 角色已打标记的槽位先占上，再问调度员，避免同工具被抢
  let plan = seedPlanFromAgentClaims(
    ensureTurnToolPlan(chatId),
    agentToolClaimsFromText(assistantText)
  );
  setTurnToolPlan(chatId, plan);

  // 把刚生成的回复纳入窗口（可能尚未写库，手动拼一条）
  const messagesForCtx = [
    ...chat.messages,
    {
      id: "pending-assistant",
      role: "assistant" as const,
      content: assistantText,
      createdAt: new Date().toISOString(),
    },
  ];

  const history = buildDispatcherHistory(messagesForCtx, {
    pass: 2,
    userName,
    charName,
  });
  const intent = await decideToolIntent({
    pass: 2,
    historyMessages: history,
    userName,
    charName,
  });

  plan = ensureTurnToolPlan(chatId);

  if (settings.keepEnabled !== false && intent.keep !== null && !plan.keepDone) {
    const keep = await prepareKeepForChat(chatId, {
      skipIntentCheck: true,
      forceQuery: intent.keep.trim() || undefined,
    });
    if (keep) plan.keepDone = true;
  }

  plan = applyIntentToPlan(plan, intent, { pass: 2, settings });
  setTurnToolPlan(chatId, plan);
  return plan;
}

export function isToolDispatcherActive(): boolean {
  const settings = loadSettings();
  return (
    settings.toolDispatcherEnabled === true &&
    Boolean(settings.toolDispatcher?.baseUrl?.trim() && settings.toolDispatcher?.apiKey?.trim())
  );
}
