import type { Request, Response } from "express";
import { loadUserPersona, saveUserAvatar, saveUserPersona } from "../store/userPersona.js";

export function getUserPersonaHandler(_req: Request, res: Response): void {
  const persona = loadUserPersona();
  res.json({
    persona: {
      name: persona.name,
      description: persona.description,
      hasAvatar: Boolean(persona.avatarPath),
    },
  });
}

export function updateUserPersonaHandler(req: Request, res: Response): void {
  const { name, description } = req.body as { name?: string; description?: string };
  const persona = loadUserPersona();
  if (typeof name === "string" && name.trim()) persona.name = name.trim();
  if (typeof description === "string") persona.description = description;
  saveUserPersona(persona);
  res.json({ persona: { ...persona, hasAvatar: Boolean(persona.avatarPath) } });
}

export function uploadUserAvatarHandler(req: Request, res: Response): void {
  try {
    const { dataBase64, filename } = req.body as { dataBase64?: string; filename?: string };
    if (!dataBase64) {
      res.status(400).json({ error: "缺少图片数据" });
      return;
    }
    const buffer = Buffer.from(dataBase64, "base64");
    const ext = pathExt(filename || "avatar.png");
    saveUserAvatar(buffer, ext);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "上传失败" });
  }
}

function pathExt(name: string): string {
  const m = name.match(/\.(png|jpe?g|gif|webp)$/i);
  return m ? m[0].toLowerCase() : ".png";
}
