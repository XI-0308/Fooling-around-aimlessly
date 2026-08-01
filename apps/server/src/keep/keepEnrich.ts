import { loadSettings } from "../config.js";
import { getChat, updateMessage, type ChatMessage } from "../store/chats.js";
import { KEEP_ENRICH_MARKER, stripKeepEnrichFromContent } from "../tools/enrichMarkers.js";
import { loadUserPersona } from "../store/userPersona.js";
import {
  formatKeepQueryForPrompt,
  getKeepAuthStatus,
  keepErrorCode,
  keepQuery,
} from "./client.js";
import {
  buildKeepQueryText,
  distillKeepResultForPrompt,
  hasKeepHealthIntent,
  isKeepUnusableResult,
  normalizeKeepQueryForSelf,
} from "./intent.js";

/** Keep 返回第二人称 → 「我」，挂在用户消息下当作她自述 */
export function rewriteKeepAsSelfReport(text: string): string {
  return text.replace(/您/g, "我").replace(/你/g, "我");
}

/** @deprecated 旧前缀路径；保留以免外部引用炸掉 */
export function rewriteKeepPronounsForUser(text: string, userName = "你"): string {
  const name = userName.trim() || "你";
  return text.replace(/您/g, name).replace(/你/g, name);
}

function buildSuccessBlock(data: string): string {
  const body = rewriteKeepAsSelfReport(data).trim() || "（无数据）";
  return `\n\n${KEEP_ENRICH_MARKER}\n${body}`;
}

function buildFailureBlock(reason: string): string {
  return `\n\n${KEEP_ENRICH_MARKER}\n状态：失败\n原因：${reason}`;
}

function writeKeepOntoUserMessage(
  chatId: string,
  message: ChatMessage,
  block: string
): void {
  const base = stripKeepEnrichFromContent(message.content);
  const enriched = `${base}${block}`;
  updateMessage(chatId, message.id, { content: enriched });
}

/**
 * 本轮若需 Keep：查询后把数据直接挂到用户最新一条用户消息后面（第一人称），
 * 让角色当成她自己报的运动/身体事实，不好瞎编。
 */
export async function prepareKeepForChat(
  chatId: string,
  options?: { skipIntentCheck?: boolean; forceQuery?: string }
): Promise<boolean> {
  const chat = getChat(chatId);
  if (!chat) return false;
  const last = chat.messages[chat.messages.length - 1];
  if (!last || last.role !== "user") return false;

  // 重新生成前先清掉旧块
  const baseContent = stripKeepEnrichFromContent(last.content);
  if (baseContent !== last.content) {
    updateMessage(chatId, last.id, { content: baseContent });
  }
  const msg = { ...last, content: baseContent };

  const settings = loadSettings();
  if (settings.keepEnabled === false) return false;
  if (!options?.skipIntentCheck && !hasKeepHealthIntent(msg.content)) return false;

  const userName = loadUserPersona().name?.trim() || "你";
  const auth = getKeepAuthStatus();

  if (!auth.loggedIn) {
    writeKeepOntoUserMessage(
      chatId,
      msg,
      buildFailureBlock(
        "尚未登录 Keep（或登录已过期）。请到「设置 → Keep 健康」用 Keep App 扫码授权后再问"
      )
    );
    return true;
  }

  const queryText = normalizeKeepQueryForSelf(
    options?.forceQuery?.trim() ||
      buildKeepQueryText(msg.content, userName) ||
      "查询我今天的运动、睡眠与体重等健康近况",
    userName
  );

  try {
    const payload = await keepQuery(queryText);
    const raw = formatKeepQueryForPrompt(payload).trim();
    const data = distillKeepResultForPrompt(raw, queryText);
    if (isKeepUnusableResult(data) && isKeepUnusableResult(raw)) {
      console.warn(
        `[keep] 不可用结果 query=${JSON.stringify(queryText)} data=${raw.slice(0, 160)}`
      );
      writeKeepOntoUserMessage(
        chatId,
        msg,
        buildFailureBlock(`这轮没查到可用明细（${raw.slice(0, 120)}）`)
      );
      return true;
    }
    writeKeepOntoUserMessage(chatId, msg, buildSuccessBlock(data));
    return true;
  } catch (err) {
    const code = keepErrorCode(err);
    const errText = err instanceof Error ? err.message : "未知错误";
    let reason = `Keep 暂时查不到（${errText}）`;
    if (code === "AUTH_REQUIRED" || code === "TOKEN_EXPIRED") {
      reason = "Keep 登录失效，请到「设置 → Keep 健康」重新扫码";
    } else if (code === "RATE_LIMITED") {
      reason = "Keep 请求过频，请稍后再问";
    }
    writeKeepOntoUserMessage(chatId, msg, buildFailureBlock(reason));
    return true;
  }
}

/** @deprecated 兼容旧调用：改为直接写用户消息，无 pending 前缀 */
export function takeKeepTurnResult(_chatId: string): null {
  return null;
}

export async function enrichLatestUserMessageKeep(chatId: string): Promise<void> {
  await prepareKeepForChat(chatId);
}
