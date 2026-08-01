import type { Request, Response } from "express";
import {
  createActivity,
  deleteActivity,
  getActivity,
  listActivities,
  markOccurrenceDone,
  updateActivity,
} from "../activity/store.js";
import { buildWindowOccurrences, formatActivityInjection } from "../activity/window.js";
import { todayYmd } from "../activity/time.js";
import type {
  ActivityKind,
  ActivityPartOfDay,
  ActivityRemind,
  ActivityRepeat,
  ActivityStatus,
} from "../activity/types.js";

export function listActivityHandler(_req: Request, res: Response): void {
  try {
    const items = listActivities();
    const today = todayYmd();
    const window = buildWindowOccurrences(items, today);
    res.json({
      items,
      today,
      window,
      injectionPreview: formatActivityInjection(window, today),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : "读取失败" });
  }
}

export function createActivityHandler(req: Request, res: Response): void {
  try {
    const body = req.body as {
      title?: string;
      date?: string;
      time?: string;
      partOfDay?: ActivityPartOfDay | null;
      repeat?: ActivityRepeat;
      remind?: ActivityRemind;
      kind?: ActivityKind;
      status?: ActivityStatus;
      note?: string;
    };
    if (!body.title?.trim() || !body.date?.trim()) {
      res.status(400).json({ error: "需要标题和日期" });
      return;
    }
    const item = createActivity({
      title: body.title,
      date: body.date,
      time: body.time,
      partOfDay: body.partOfDay,
      repeat: body.repeat,
      remind: body.remind,
      kind: body.kind,
      status: body.status,
      note: body.note,
    });
    res.json({ item });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "创建失败" });
  }
}

export function updateActivityHandler(req: Request, res: Response): void {
  try {
    const id = req.params.id;
    const body = req.body as Record<string, unknown>;
    const item = updateActivity(id, body as Parameters<typeof updateActivity>[1]);
    if (!item) {
      res.status(404).json({ error: "事项不存在" });
      return;
    }
    res.json({ item });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "更新失败" });
  }
}

export function deleteActivityHandler(req: Request, res: Response): void {
  const ok = deleteActivity(req.params.id);
  if (!ok) {
    res.status(404).json({ error: "事项不存在" });
    return;
  }
  res.json({ success: true });
}

export function completeActivityOccurrenceHandler(req: Request, res: Response): void {
  try {
    const id = req.params.id;
    const { occurrenceDate } = req.body as { occurrenceDate?: string };
    if (!occurrenceDate?.trim()) {
      res.status(400).json({ error: "需要 occurrenceDate" });
      return;
    }
    if (!getActivity(id)) {
      res.status(404).json({ error: "事项不存在" });
      return;
    }
    const item = markOccurrenceDone(id, occurrenceDate.trim());
    res.json({ item });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "标记失败" });
  }
}
