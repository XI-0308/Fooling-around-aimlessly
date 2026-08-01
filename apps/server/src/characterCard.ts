import fs from "fs";

export interface CharacterData {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes?: string;
  system_prompt?: string;
  post_history_instructions?: string;
  alternate_greetings?: string[];
  tags?: string[];
}

export interface ParsedCharacterCard {
  spec: string;
  spec_version?: string;
  data: CharacterData;
}

function normalizeCard(raw: unknown): ParsedCharacterCard {
  const obj = raw as Record<string, unknown>;
  if (obj.data && typeof obj.data === "object") {
    const data = obj.data as Record<string, unknown>;
    return {
      spec: String(obj.spec || "chara_card_v2"),
      spec_version: obj.spec_version ? String(obj.spec_version) : undefined,
      data: {
        name: String(data.name || "未命名角色"),
        description: String(data.description || ""),
        personality: String(data.personality || ""),
        scenario: String(data.scenario || ""),
        first_mes: String(data.first_mes || ""),
        mes_example: String(data.mes_example || ""),
        creator_notes: data.creator_notes ? String(data.creator_notes) : undefined,
        system_prompt: data.system_prompt ? String(data.system_prompt) : undefined,
        post_history_instructions: data.post_history_instructions
          ? String(data.post_history_instructions)
          : undefined,
        alternate_greetings: Array.isArray(data.alternate_greetings)
          ? data.alternate_greetings.map(String)
          : undefined,
        tags: Array.isArray(data.tags) ? data.tags.map(String) : undefined,
      },
    };
  }

  return {
    spec: "legacy",
    data: {
      name: String(obj.name || "未命名角色"),
      description: String(obj.description || ""),
      personality: String(obj.personality || ""),
      scenario: String(obj.scenario || ""),
      first_mes: String(obj.first_mes || ""),
      mes_example: String(obj.mes_example || ""),
    },
  };
}

export function parseCharacterJson(text: string): ParsedCharacterCard {
  return normalizeCard(JSON.parse(text));
}

/** 从 ST 风格 PNG 的 tEXt 块提取 chara 字段 */
export function parseCharacterPng(buffer: Buffer): ParsedCharacterCard {
  const signature = buffer.subarray(0, 8);
  if (!signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    throw new Error("不是有效的 PNG 文件");
  }

  let offset = 8;
  while (offset + 12 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (type === "tEXt") {
      const chunk = buffer.subarray(dataStart, dataEnd);
      const nullIndex = chunk.indexOf(0);
      if (nullIndex > 0) {
        const keyword = chunk.subarray(0, nullIndex).toString("latin1");
        const text = chunk.subarray(nullIndex + 1).toString("latin1");
        if (keyword === "chara") {
          const json = Buffer.from(text, "base64").toString("utf-8");
          return parseCharacterJson(json);
        }
      }
    }

    if (type === "IEND") break;
    offset = dataEnd + 4;
  }

  throw new Error("PNG 中未找到 SillyTavern 角色卡数据（chara 块）");
}

export function parseCharacterFile(buffer: Buffer, filename: string): ParsedCharacterCard {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".json")) {
    return parseCharacterJson(buffer.toString("utf-8"));
  }
  if (lower.endsWith(".png")) {
    return parseCharacterPng(buffer);
  }
  throw new Error("仅支持 .json 或 .png 角色卡");
}

export function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return fallback;
  }
}
