import { stripUserVisibleText } from "../tools/enrichMarkers.js";

/**
 * 用户在聊自己的运动 / 身体 / 健康数据时触发 Keep 只读查询。
 * 偏「我的数据」，少触发纯建议闲聊。
 */
const KEEP_DATA_RE =
  /Keep|keep\s*app|运动(?:数据|记录|时长|总量|情况|怎么样)?|跑步|慢跑|骑行|骑车|游泳|健身|训练|锻炼|步数|配速|公里数?|卡路里|千卡|静息心率|心率|血压|血氧|体脂|体重|腰围|睡眠|经期|生理期|饮食记录|今日(?:运动|跑步|步数)|今天(?:跑|练|运动|走了)|最近(?:的)?(?:运动|跑步|体重|体脂|睡眠|心率|步数)|这[周日个]年?.*(?:跑|运动|练|步)|上[周日个]月?.*(?:跑|运动|练)|本[周日个]年?.*(?:跑|运动|练)|运动了(?:多[少长]|几)|跑了(?:多[少远]|几)|睡得?怎么样|睡得?[好不好]|睡得?[很超挺蛮]?[好香差不错]|睡得很香|昨晚睡|昨夜睡|睡得好不好|体重多少|体脂多少/i;

/** 角色刚问过睡眠（用于用户短答时仍查 Keep） */
const ASSISTANT_ASKED_SLEEP_RE =
  /睡得?[好怎吗]|睡得好不好|睡得怎么样|睡得香吗|昨晚睡|昨夜睡|睡眠|休息得怎么样|睡得还好吗/i;

/** 出发 / 打算 / 进行中：数据多半还没同步，先不查 */
const KEEP_DEFER_RE =
  /(?:准备|打算|想|正要|马上|待会|待会儿|等会儿|一会儿|一会)去?(?:健身|跑步|锻炼|训练|健身房|游泳|骑行|骑车)|要去(?:健身|跑步|锻炼|训练|健身房|游泳|骑行|骑车)|出发(?:去)?(?:健身|跑步|锻炼|健身房)|在去.*(?:路上|途中)|去(?:健身|跑步|锻炼|训练|健身房|骑行|骑车)(?:啦|咯|了)?(?![^。！？\n]{0,12}(?:完|回|结束|结束了))|我去(?:健身|跑步|锻炼|训练|骑行|骑车)了(?![^。！？\n]{0,12}(?:完|回|结束))|开始(?:健身|训练|跑步|锻炼|骑行|骑车)|正在(?:健身|跑步|训练|锻炼|骑行|骑车)|先去(?:健身|跑步|练一下)|去练一下(?![^。！？\n]{0,8}完)/i;

/** 已结束或明确要看结果：应该查 */
const KEEP_AFTER_OR_ASK_RE =
  /练完|跑完|游完|骑完|骑车完|骑行完|健身完|锻炼完|训练完|运动完|结束(?:了)?(?:训练|锻炼|健身|跑步|运动|骑行|骑车)|(?:健身|跑步|锻炼|训练|运动|骑行|骑车)结束|健身回|跑回|练完回|骑(?:车|行)?回|从(?:健身房|游泳馆|跑道).{0,6}回|刚刚(?:练|跑|游|骑)(?:完)?|刚(?:练|跑|骑)完|今天(?:跑了|走了|练了|运动了|骑了)|查一下.*(?:Keep|运动|跑步|睡眠|步数|心率|体重)|看看我.*(?:运动|跑步|步数|心率|睡眠|体重)|我的(?:运动|跑步|睡眠|步数|心率|体重).*(?:多少|数据|记录)|运动数据|Keep/i;

/** 明显只要建议、不查她本人数据的句子跳过 */
const ADVICE_ONLY_RE =
  /(?:减脂|增肌|怎么跑|如何跑步|吃什么|食谱|配速多少合适|训练计划|有什么建议)(?!.*(我的|最近|今天|这周|这个月|多少|多少了|记录))/i;

const KEEP_DETAIL_SUFFIX =
  "时长、距离、配速、平均心率、消耗热量等明细";

/**
 * 「我练完了」这类话 Keep 技能不认成查询意图。
 * 收成「查询我今天最新一次…」的明确问法。
 */
export function rewritePostWorkoutKeepQuery(raw: string): string | null {
  const t = (raw || "").trim();
  if (!t) return null;
  // 已经是明确查询，不改写
  if (/^查询/.test(t) || /查一下|看看我/.test(t)) return null;
  const done =
    /(?:练|跑|游|骑车|骑行|骑|健身|锻炼|训练|运动)完了?|结束(?:了)?(?:训练|锻炼|健身|跑步|运动|骑行|骑车)?|(?:健身|跑步|锻炼|训练|运动|骑车|骑行)回|刚刚(?:练|跑|游|骑)/.test(
      t
    );
  if (!done) return null;
  // 已点明指标时仍走原话 + normalize 补全
  if (/配速|心率|距离|热量|大卡|公里|时长|步数/.test(t) && /多少|几|查|数据/.test(t)) {
    return null;
  }
  if (/骑车|骑行|骑完/.test(t)) {
    return `查询我今天最新一次骑行的${KEEP_DETAIL_SUFFIX}`;
  }
  if (/跑/.test(t)) {
    return `查询我今天最新一次跑步的${KEEP_DETAIL_SUFFIX}`;
  }
  if (/游/.test(t)) {
    return `查询我今天最新一次游泳的${KEEP_DETAIL_SUFFIX}`;
  }
  if (/健身|力量|训练|锻炼|练完/.test(t)) {
    return `查询我今天最新一次健身训练的时长、消耗热量、平均心率等明细`;
  }
  return `查询我今天最新一次运动的${KEEP_DETAIL_SUFFIX}`;
}

/** 是否「还没练完 / 正要去」——此类不应查 Keep */
export function isKeepDeferredIntent(content: string): boolean {
  const t = stripUserVisibleText(content).trim();
  if (!t) return false;
  // 明确已结束优先，不算 defer
  if (KEEP_AFTER_OR_ASK_RE.test(t)) return false;
  return KEEP_DEFER_RE.test(t);
}

/** 上一句助手是否在问用户的睡眠 */
export function assistantAskedAboutSleep(assistantContent: string): boolean {
  const t = stripUserVisibleText(assistantContent).trim();
  return Boolean(t) && ASSISTANT_ASKED_SLEEP_RE.test(t);
}

/**
 * 角色刚问睡眠，用户用口语短答（睡得好/香/还行…）也应查 Keep。
 * 避免「角色空问 → 用户说睡得好 → Keep 没触发」。
 */
export function isSleepReplyContext(userContent: string, assistantContent: string): boolean {
  if (!assistantAskedAboutSleep(assistantContent)) return false;
  const t = stripUserVisibleText(userContent).trim();
  if (!t) return false;
  if (/睡|香|失眠|早醒|没睡|熬夜|一觉|翻来覆去|做梦|休息|醒了/.test(t)) return true;
  // 短肯定/否定（「还行」「嗯嗯」）也算跟进睡眠话题
  if (
    t.length <= 28 &&
    /^(嗯+|啊+|哎+|还行|不错|一般|挺好|很好|不好|差|马马虎虎|凑合|还好|可以|还行吧|还行啊)[.!！？。…~～]*$/u.test(
      t
    )
  ) {
    return true;
  }
  return false;
}

export function hasKeepHealthIntent(content: string, prevAssistantContent?: string): boolean {
  const t = stripUserVisibleText(content).trim();
  if (!t) return false;
  if (isKeepDeferredIntent(t)) return false;
  if (ADVICE_ONLY_RE.test(t) && !/(我的|最近|今天|这周|这个月|查一下|看看我)/.test(t)) {
    return false;
  }
  if (prevAssistantContent && isSleepReplyContext(t, prevAssistantContent)) return true;
  if (KEEP_AFTER_OR_ASK_RE.test(t)) return true;
  return KEEP_DATA_RE.test(t);
}

const SLEEP_DURATION_QUERY =
  "查询我最近一次睡眠的总时长，只返回几小时几分钟，不要睡眠质量、HRV或其它说明。";

/** 传给 query_tool 的自然语言；尽量保留用户原话，并改成「查本人」 */
export function buildKeepQueryText(
  content: string,
  userName = "你",
  prevAssistantContent?: string
): string {
  const t = stripUserVisibleText(content).trim();
  if (prevAssistantContent && isSleepReplyContext(t, prevAssistantContent)) {
    return SLEEP_DURATION_QUERY;
  }
  const rewritten = rewritePostWorkoutKeepQuery(t);
  if (rewritten) return normalizeKeepQueryForSelf(rewritten, userName);
  return normalizeKeepQueryForSelf(t.length <= 200 ? t : t.slice(0, 200), userName);
}

/**
 * Keep 技能只认「本人」查询；调度员若写成「查询某用户名…」会被拒。
 * 统一改成第一人称，并在运动/睡眠语境下补明细诉求。
 */
export function normalizeKeepQueryForSelf(raw: string, userName: string): string {
  const name = (userName || "你").trim() || "你";
  const reName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  let q = (raw || "").trim();

  if (!q) {
    return `查询我今天最新的运动与健康详情，包括${KEEP_DETAIL_SUFFIX}，以及最近睡眠`;
  }

  const rewritten = rewritePostWorkoutKeepQuery(q);
  if (rewritten) return rewritten;

  q = q
    .replace(new RegExp(`查询\\s*${reName}`, "g"), "查询我")
    .replace(new RegExp(`${reName}\\s*刚`, "g"), "我刚")
    .replace(new RegExp(`${reName}\\s*的`, "g"), "我的")
    .replace(new RegExp(`${reName}(?=完成|跑|走|睡|运动|练)`, "g"), "我")
    .replace(new RegExp(reName, "g"), "我");

  if (
    /跑|慢跑|运动|走完|练完|骑行|骑车|骑完|游泳|健身|训练|锻炼/.test(q) &&
    !/配速|心率|距离|热量|大卡|公里|查询我今天最新/.test(q)
  ) {
    q += `。请给出该次运动的${KEEP_DETAIL_SUFFIX}。`;
  }
  // 睡眠：质量/HRV 经常空，Keep 会返回一堆重复话术；统一只问时长
  if (/睡/.test(q)) {
    return SLEEP_DURATION_QUERY;
  }
  if (/体重|体脂|腰围/.test(q) && !/公斤|kg|%|斤/.test(q)) {
    q += "。请给出最近的体重、体脂等身体数据明细。";
  }
  if (/步数|走了多少/.test(q) && !/\d/.test(q)) {
    q += "。请给出今日或近期步数明细。";
  }
  return q;
}

/** 是否偏睡眠查询（用于结果精简） */
export function isSleepKeepQuery(queryText: string): boolean {
  return /睡/.test(queryText);
}

/**
 * 从 Keep 睡眠乱文里抽出「XhYm」。
 * Keep 常返回多天列表；必须取最新一天，不能拿列表里较早的一条。
 * 例：有日期则「2026-07-26 睡了 8小时37分钟」；否则「最近一次睡眠 …」。
 */
export function distillSleepKeepResult(raw: string): string | null {
  const t = raw.replace(/\s+/g, " ").trim();
  if (!t) return null;

  // 逐条：日期与「睡眠时长 X小时Y分钟」紧邻（避免把 7-20 错配到后面某天的时长）
  const datedRe =
    /(\d{4}-\d{2}-\d{2})\s*[：:]\s*睡眠时长\s*(\d+)\s*小时\s*(\d+)\s*分钟/g;
  const dated: { date: string; h: string; m: string }[] = [];
  for (const m of t.matchAll(datedRe)) {
    dated.push({ date: m[1], h: m[2], m: m[3] });
  }
  if (dated.length > 0) {
    dated.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const best = dated[0];
    return `${best.date} 睡了 ${best.h}小时${best.m}分钟`;
  }

  // 「你在2026-07-26的睡眠时长为8小时37分钟」
  const narrative = t.match(
    /(\d{4}-\d{2}-\d{2})的?睡眠时长\s*[为:：]\s*(\d+)\s*小时\s*(\d+)\s*分钟/
  );
  if (narrative) {
    return `${narrative[1]} 睡了 ${narrative[2]}小时${narrative[3]}分钟`;
  }

  const labeled = t.match(/睡眠时长\s*[为:：]?\s*(\d+)\s*小时\s*(\d+)\s*分钟/);
  if (labeled) {
    return `最近一次睡眠 ${labeled[1]}小时${labeled[2]}分钟`;
  }

  // 整段几乎只有时长，如「7小时4分钟」
  const bare = t.match(/^(\d+)\s*小时\s*(\d+)\s*分钟\.?$/);
  if (bare) {
    return `最近一次睡眠 ${bare[1]}小时${bare[2]}分钟`;
  }

  // 多段时长时取最后一次（Keep 列表通常由旧到新）
  if (/睡眠|睡了|昨晚|昨夜/.test(t)) {
    const all = [...t.matchAll(/(\d+)\s*小时\s*(\d+)\s*分钟/g)];
    if (all.length > 0) {
      const last = all[all.length - 1];
      return `最近一次睡眠 ${last[1]}小时${last[2]}分钟`;
    }
  }

  return null;
}

/** 按查询类型清洗 Keep 原文（睡眠只保留时长） */
export function distillKeepResultForPrompt(raw: string, queryText: string): string {
  const text = raw.trim();
  if (!text) return text;
  if (isSleepKeepQuery(queryText)) {
    return distillSleepKeepResult(text) || text;
  }
  return text;
}

/** Keep 明确拒查 / 空话术（无有效指标） */
export function isKeepUnusableResult(text: string): boolean {
  const t = text.trim();
  if (!t) return true;
  // 已有可用睡眠时长：即使夹带「去 App」也不算失败
  if (/睡眠时长|睡了/.test(t) && /\d+\s*小时/.test(t)) return false;
  if (/^\d+\s*小时\s*\d+\s*分钟/.test(t)) return false;
  if (/暂不支持查询其他|不是健康或运动相关的数据查询需求|目前主要支持|目前只能帮/.test(t)) {
    return true;
  }
  if (/可以告诉我具体/.test(t) && !/\d/.test(t)) return true;
  if (
    /可以在Keep App|到Keep App查询/.test(t) &&
    !/平均心率|配速|大卡|公里|bpm|消耗|睡眠时长|\d+\s*小时/.test(t)
  ) {
    return true;
  }
  return false;
}
