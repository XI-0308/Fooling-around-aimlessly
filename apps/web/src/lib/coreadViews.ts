/** 共读讨论：用户/角色观点字段（兼容旧 xiView / suView） */

export type CoreadViews = { userView: string; charView: string };

export function normalizeCoreadViews(raw: Record<string, unknown>): CoreadViews {
  return {
    userView: String(raw.userView ?? raw.xiView ?? ""),
    charView: String(raw.charView ?? raw.suView ?? ""),
  };
}

export function coreadViewsPayload(views: CoreadViews): Record<string, string> {
  return { userView: views.userView, charView: views.charView };
}

export function normalizeSearchCoreadViews(hit: Record<string, unknown>): CoreadViews {
  return {
    userView: String(hit.coreadUserView ?? hit.coreadXiView ?? ""),
    charView: String(hit.coreadCharView ?? hit.coreadSuView ?? ""),
  };
}
