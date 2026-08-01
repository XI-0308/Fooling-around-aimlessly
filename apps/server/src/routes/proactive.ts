import type { Request, Response } from "express";
import { listChats } from "../store/chats.js";
import { countAllUnreadProactive, getProactiveScheduleSummary, markProactiveSeen } from "../proactive/state.js";

export function getProactiveStatusHandler(_req: Request, res: Response): void {
  const chats = listChats();
  const { total, byChat } = countAllUnreadProactive(chats);
  const schedule = getProactiveScheduleSummary();
  res.json({
    unreadCount: total,
    chats: byChat,
    nextAt: schedule.nextAt,
    nextAtLabel: schedule.nextAtLabel,
    schedule: schedule.items,
  });
}

export function markProactiveSeenHandler(_req: Request, res: Response): void {
  markProactiveSeen();
  res.json({ success: true, unreadCount: 0 });
}
