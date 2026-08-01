import { listActivities } from "./store.js";
import {
  buildRemindSnaps,
  buildWindowOccurrences,
  formatActivityInjection,
} from "./window.js";
import { todayYmd } from "./time.js";
import type { InjectedActivitySnap } from "./types.js";

export function resolveActivityForPrompt(): {
  activityBody: string;
  remindSnaps: InjectedActivitySnap[];
} {
  const today = todayYmd();
  const items = listActivities();
  const window = buildWindowOccurrences(items, today);
  return {
    activityBody: formatActivityInjection(window, today),
    remindSnaps: buildRemindSnaps(window),
  };
}
