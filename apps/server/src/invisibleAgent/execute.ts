import { loadSettings } from "../config.js";
import {
  formatKeepQueryForPrompt,
  getKeepAuthStatus,
  keepErrorCode,
  keepQuery,
} from "../keep/client.js";
import {
  buildKeepQueryText,
  distillKeepResultForPrompt,
  isKeepUnusableResult,
  normalizeKeepQueryForSelf,
} from "../keep/intent.js";
import { listActivities } from "../activity/store.js";
import { buildWindowOccurrences } from "../activity/window.js";
import { formatDayLabel, todayYmd } from "../activity/time.js";
import { loadUserPersona } from "../store/userPersona.js";
import { getChat } from "../store/chats.js";
import { stripUserVisibleText } from "../tools/enrichMarkers.js";
import {
  clearTurnToolPlan,
  ensureTurnToolPlan,
  setTurnToolPlan,
} from "../toolDispatcher/state.js";
import type { TurnToolPlan } from "../toolDispatcher/types.js";
import type { InvisibleMode, InvisibleToolCall, InvisibleToolResult } from "./types.js";

function buildKeepInject(ok: boolean, body: string, userName = "你"): string {
  if (!ok) {
    return (
      `[${userName}的近况 · 运动健康]\n` +
      `你这会儿拿不到她可靠的运动/身体明细。\n` +
      `情况：${body}\n` +
      `请自然接话：可以关心、等她练完或同步后再问；不要编造数字，也不要提 App、查询或工具。`
    );
  }
  return (
    `[${userName}的近况 · 运动健康]\n` +
    `以下是她本人的运动/身体近况（请当作你已知道的事实，用恋人语气接话；` +
    `不要提 App、查询或工具，不要另编数字）：\n` +
    `${body}`
  );
}

async function execKeep(chatId: string, arg: string | undefined): Promise<InvisibleToolResult> {
  const settings = loadSettings();
  if (settings.keepEnabled === false) {
    return { tool: "keep", ok: false, summary: "Keep 已关闭" };
  }

  const chat = getChat(chatId);
  const lastUser = chat ? [...chat.messages].reverse().find((m) => m.role === "user") : null;
  const lastUserIdx = lastUser && chat ? chat.messages.lastIndexOf(lastUser) : -1;
  const prevAssistant =
    chat && lastUserIdx > 0
      ? [...chat.messages.slice(0, lastUserIdx)].reverse().find((m) => m.role === "assistant")
      : undefined;
  const userName = loadUserPersona().name?.trim() || "你";
  const auth = getKeepAuthStatus();

  if (!auth.loggedIn) {
    const reason = "尚未登录 Keep（或登录已过期）。请到「设置 → Keep 健康」用 Keep App 扫码授权后再问";
    return {
      tool: "keep",
      ok: false,
      summary: reason,
      inject: buildKeepInject(false, reason, userName),
    };
  }

  const queryText = normalizeKeepQueryForSelf(
    (arg || "").trim() ||
      buildKeepQueryText(
        stripUserVisibleText(lastUser?.content || ""),
        userName,
        stripUserVisibleText(prevAssistant?.content || "")
      ) ||
      "查询我今天的运动、睡眠与体重等健康近况",
    userName
  );

  try {
    const payload = await keepQuery(queryText);
    const raw = formatKeepQueryForPrompt(payload).trim();
    const data = distillKeepResultForPrompt(raw, queryText);
    if (isKeepUnusableResult(data) && isKeepUnusableResult(raw)) {
      const reason = `这轮没查到可用明细（${raw.slice(0, 120)}）`;
      return {
        tool: "keep",
        ok: false,
        summary: `问：${queryText.slice(0, 80)} → ${reason}`,
        inject: buildKeepInject(false, reason, userName),
      };
    }
    const body = data.trim() || raw.trim() || "（无数据）";
    return {
      tool: "keep",
      ok: true,
      summary: `问：${queryText.slice(0, 60)} → ${body.slice(0, 100)}`,
      inject: buildKeepInject(true, body, userName),
    };
  } catch (err) {
    const code = keepErrorCode(err);
    const errText = err instanceof Error ? err.message : "未知错误";
    let reason = `Keep 暂时查不到（${errText}）`;
    if (code === "AUTH_REQUIRED" || code === "TOKEN_EXPIRED") {
      reason = "Keep 登录失效，请到「设置 → Keep 健康」重新扫码";
    } else if (code === "RATE_LIMITED") {
      reason = "Keep 请求过频，请稍后再问";
    }
    return {
      tool: "keep",
      ok: false,
      summary: `问：${queryText.slice(0, 80)} → ${reason}`,
      inject: buildKeepInject(false, reason, userName),
    };
  }
}

function execActivityRemind(): InvisibleToolResult {
  const userName = loadUserPersona().name?.trim() || "你";
  try {
    const today = todayYmd();
    const window = buildWindowOccurrences(listActivities(), today);
    const pending = window.filter((o) => o.remind === "remind" && o.status === "pending");
    if (pending.length === 0) {
      return {
        tool: "activity_remind",
        ok: false,
        summary: "当前没有标记需提醒的未完成活动",
      };
    }
    const lines = pending.map((o) => {
      const when = formatDayLabel(o.date, today);
      const kind =
        o.kind === "promise" ? "约定" : o.kind === "plan" ? "计划" : "记录";
      return `- ${when} · ${kind} · ${o.title}`;
    });
    const inject =
      `[${userName}的近况 · 待办]\n` +
      `她账本里还有这些未完成、且需要你叮嘱的事。请自然提起一两件（恋人叮嘱口吻），` +
      `不要列清单，不要说「系统提醒」或「工具」。\n` +
      lines.join("\n");
    return {
      tool: "activity_remind",
      ok: true,
      summary: `待提醒 ${pending.length} 项`,
      inject,
    };
  } catch (err) {
    return {
      tool: "activity_remind",
      ok: false,
      summary: err instanceof Error ? err.message : "活动账本读取失败",
    };
  }
}

function applySideEffectToPlan(
  plan: TurnToolPlan,
  call: InvisibleToolCall,
  settings: ReturnType<typeof loadSettings>
): TurnToolPlan {
  const next = { ...plan };
  if (call.tool === "music" && settings.musicEnabled !== false && next.musicQuery === null) {
    next.musicQuery = call.arg ?? "";
  }
  if (
    call.tool === "voice" &&
    settings.assistantVoiceReplyEnabled !== false &&
    settings.voiceMessagesEnabled !== false
  ) {
    next.wantsVoice = true;
  }
  if (
    call.tool === "image" &&
    settings.imageGenEnabled !== false &&
    next.imagePrompt === null &&
    next.shareImageSource === null
  ) {
    next.imagePrompt = call.arg ?? "";
  }
  if (
    call.tool === "shareImage" &&
    next.shareImageSource === null &&
    next.imagePrompt === null
  ) {
    next.shareImageSource = call.arg ?? "";
  }
  return next;
}

export async function executeInvisibleCalls(
  chatId: string,
  mode: InvisibleMode,
  calls: InvisibleToolCall[]
): Promise<{ results: InvisibleToolResult[]; plan: TurnToolPlan }> {
  const settings = loadSettings();
  clearTurnToolPlan(chatId);
  let plan = ensureTurnToolPlan(chatId);
  const results: InvisibleToolResult[] = [];

  for (const call of calls) {
    if (call.tool === "keep") {
      const r = await execKeep(chatId, call.arg);
      results.push(r);
      if (r.ok) plan.keepDone = true;
      continue;
    }
    if (call.tool === "activity_remind") {
      results.push(execActivityRemind());
      continue;
    }
    if (mode === "heartbeat") {
      // heartbeat 忽略副作用
      continue;
    }
    plan = applySideEffectToPlan(plan, call, settings);
    results.push({
      tool: call.tool,
      ok: true,
      summary: `已列入本轮计划（回复后执行）${call.arg ? `：${call.arg.slice(0, 60)}` : ""}`,
    });
  }

  setTurnToolPlan(chatId, plan);
  return { results, plan };
}
