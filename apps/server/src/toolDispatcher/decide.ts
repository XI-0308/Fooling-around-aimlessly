import { loadSettings } from "../config.js";
import { openAiChatCompletion } from "../services/openaiCompat.js";
import type { DeepSeekMessage } from "../promptBuilder.js";
import { EMPTY_INTENT, type ToolDispatchIntent } from "./types.js";

function systemPrompt(pass: 1 | 2, userName: string, charName: string): string {
  const passHint =
    pass === 1
      ? `现在是调度①（用户刚说话、角色尚未回复）。` +
        `Keep 由你主责：用户提到运动/睡眠/体重等健康数据且需要事实时，主动查 Keep。` +
        `点歌/语音/生图/找图：角色稍后可用标记自行起调；你只在用户要求非常明确、预判角色可能漏调时轻量预填，不要抢戏。`
      : `现在是调度②（角色刚回复）。你是兜底，不是主调度。` +
        `若回复末尾已有 [[IMAGE:]] / [[SHARE_IMAGE:]] / [[MUSIC:]] / [[VOICE]]（或等价标记），对应字段必须为 null，不要改、不要抢。` +
        `仅当角色声称已点歌/画画/发语音/找图/查 Keep（或明确马上要做）但未打标记、系统也尚未计划时，才补调。` +
        `纯向往（「好想画」）不要触发。Keep 仍由你补查；不要改写角色正文。`;

  return (
    `你是 WE-E 的工具调度员，不是角色扮演者。\n` +
    `用户叫「${userName}」，角色叫「${charName}」。\n` +
    `协议：点歌/语音/生图/网页找图以角色起调为优先（回复末尾隐形标记）；你只做漏调兜底。Keep 健康查询仍由你与后端主责。\n` +
    `${passHint}\n` +
    `你只能决策：music（点歌）、voice（语音条）、image（AI 生图）、shareImage（网页找图/下载图发给用户）、keep（Keep 只读健康查询）。\n` +
    `image 与 shareImage 互斥优先：用户要「画/生成」用 image；要「找图/搜图/发网上的图/照片」用 shareImage，不要两个都填。\n` +
    `shareImage 填：图片 URL、网页 URL、或简短主题词（如「仙女座星系」）。\n` +
    `Keep 可查本人：运动记录、步数、睡眠时长、体重体脂、心率等。keep 必须用第一人称「我/本人」。\n` +
    `禁止写成「查询${userName}…」。若用户消息里已有 Keep 块或本轮已点歌/已生图/已找图，不要重复。\n` +
    `生图兜底：用户说「画给我看」且角色未打 [[IMAGE:]] 时，image 可填描述。\n` +
    `找图兜底：用户说「找图给我」或角色声称已找到图但未打 [[SHARE_IMAGE:]] 时，shareImage 可填。\n` +
    `只输出一个 JSON 对象，不要 markdown。格式：\n` +
    `{"music":null或搜歌词,"voice":false或true,"image":null或绘画描述,"shareImage":null或URL或主题词,"keep":null或查询用语}\n` +
    `不需要的字段必须为 null；需要但无具体词时 music/image/shareImage/keep 可用 ""。`
  );
}

function parseIntent(raw: string): ToolDispatchIntent {
  const text = raw.trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { ...EMPTY_INTENT };
  try {
    const obj = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
    const asStr = (v: unknown): string | null => {
      if (v === null || v === undefined) return null;
      return typeof v === "string" ? v : String(v);
    };
    return {
      music: asStr(obj.music),
      voice: obj.voice === true || obj.voice === "true",
      image: asStr(obj.image),
      shareImage: asStr(obj.shareImage ?? obj.share_image),
      keep: asStr(obj.keep),
    };
  } catch {
    return { ...EMPTY_INTENT };
  }
}

export async function decideToolIntent(input: {
  pass: 1 | 2;
  historyMessages: { role: "user" | "assistant"; content: string }[];
  userName: string;
  charName: string;
}): Promise<ToolDispatchIntent> {
  const settings = loadSettings();
  if (settings.toolDispatcherEnabled !== true) return { ...EMPTY_INTENT };
  const conn = settings.toolDispatcher;
  if (!conn?.baseUrl?.trim() || !conn?.apiKey?.trim()) {
    console.warn("[toolDispatcher] 已启用但未配置 API，跳过调度");
    return { ...EMPTY_INTENT };
  }

  const messages: DeepSeekMessage[] = [
    {
      role: "system",
      content: systemPrompt(input.pass, input.userName, input.charName),
    },
    ...input.historyMessages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
    {
      role: "user",
      content:
        input.pass === 1
          ? "请输出本轮工具调度 JSON（Keep 可主动；其余仅轻量预填）。"
          : "角色标记已优先。请只输出需兜底补调的 JSON；已有标记的工具字段必须为 null。",
    },
  ];

  try {
    const { content } = await openAiChatCompletion(conn, messages, {
      model: conn.defaultModel || "gpt-4o-mini",
      temperature: 0.2,
      maxTokens: 320,
    });
    const intent = parseIntent(content);
    // 互斥：同时有则优先 shareImage（找图）若文案像找图，否则保留 image
    if (intent.image !== null && intent.shareImage !== null) {
      const blob = `${intent.image} ${intent.shareImage}`;
      if (/找|搜|网|照片|http/i.test(blob) && !/画|生成|seedream/i.test(intent.image || "")) {
        intent.image = null;
      } else {
        intent.shareImage = null;
      }
    }
    console.log(
      `[toolDispatcher] pass${input.pass} ok model=${conn.defaultModel || "gpt-4o-mini"} ` +
        `history=${input.historyMessages.length} raw=${content.replace(/\s+/g, " ").slice(0, 220)} ` +
        `intent=${JSON.stringify(intent)}`
    );
    return intent;
  } catch (err) {
    console.warn(
      "[toolDispatcher] 决策失败:",
      err instanceof Error ? err.message : err
    );
    return { ...EMPTY_INTENT };
  }
}
