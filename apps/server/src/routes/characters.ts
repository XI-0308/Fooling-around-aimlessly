import type { Request, Response } from "express";
import { parseCharacterFile } from "../characterCard.js";
import {
  deleteCharacter,
  getCharacter,
  getPrimaryCharacter,
  importOrReplacePrimaryCharacter,
  listCharacters,
  saveCharacterAvatar,
  saveCharacterFromCard,
  updateCharacter,
} from "../store/characters.js";
import type { CharacterData } from "../characterCard.js";
import type { CharacterPreset } from "../characterPreset.js";

export function getPrimaryCharacterHandler(_req: Request, res: Response): void {
  const char = getPrimaryCharacter();
  if (!char) {
    res.status(404).json({ error: "尚未配置角色，请先在档案页导入或创建" });
    return;
  }
  res.json({ character: char });
}

export function listCharactersHandler(_req: Request, res: Response): void {
  const chars = listCharacters().map((c) => ({
    id: c.id,
    name: c.data.name,
    description: c.data.description.slice(0, 120),
    avatarPath: c.avatarPath,
    createdAt: c.createdAt,
  }));
  res.json({ characters: chars });
}

export function getCharacterHandler(req: Request, res: Response): void {
  const char = getCharacter(req.params.id);
  if (!char) {
    res.status(404).json({ error: "角色不存在" });
    return;
  }
  res.json({ character: char });
}

export function importCharacterHandler(req: Request, res: Response): void {
  try {
    const { filename, dataBase64 } = req.body as {
      filename?: string;
      dataBase64?: string;
    };

    if (!filename || !dataBase64) {
      res.status(400).json({ error: "缺少文件数据" });
      return;
    }

    const buffer = Buffer.from(dataBase64, "base64");
    const card = parseCharacterFile(buffer, filename);
    const isPng = filename.toLowerCase().endsWith(".png");
    const character = importOrReplacePrimaryCharacter(
      card,
      isPng ? buffer : undefined,
      isPng ? ".png" : undefined
    );

    res.json({
      success: true,
      character: {
        id: character.id,
        name: character.data.name,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "导入失败" });
  }
}

export function deleteCharacterHandler(req: Request, res: Response): void {
  const ok = deleteCharacter(req.params.id);
  if (!ok) {
    res.status(404).json({ error: "角色不存在" });
    return;
  }
  res.json({ success: true });
}

export function updateCharacterHandler(req: Request, res: Response): void {
  const { data, preset } = req.body as {
    data?: Partial<CharacterData>;
    preset?: Partial<CharacterPreset>;
  };

  if (!data && !preset) {
    res.status(400).json({ error: "没有可更新的内容" });
    return;
  }

  const updated = updateCharacter(req.params.id, { data, preset });
  if (!updated) {
    res.status(404).json({ error: "角色不存在" });
    return;
  }
  res.json({ character: updated });
}

export function uploadCharacterAvatarHandler(req: Request, res: Response): void {
  try {
    const { dataBase64, filename } = req.body as { dataBase64?: string; filename?: string };
    if (!dataBase64) {
      res.status(400).json({ error: "缺少图片数据" });
      return;
    }
    const ext = pathExt(filename || "avatar.png");
    const buffer = Buffer.from(dataBase64, "base64");
    const updated = saveCharacterAvatar(req.params.id, buffer, ext);
    if (!updated) {
      res.status(404).json({ error: "角色不存在" });
      return;
    }
    res.json({ success: true, character: updated });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : "上传失败" });
  }
}

function pathExt(name: string): string {
  const m = name.match(/\.(png|jpe?g|gif|webp)$/i);
  return m ? m[0].toLowerCase() : ".png";
}
