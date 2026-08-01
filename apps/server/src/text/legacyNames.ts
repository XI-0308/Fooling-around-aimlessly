/** Historical default user name (legacy vault/chat compatibility) */
export const LEGACY_USER = "\u5e0c";
/** Historical default char name (legacy vault/chat compatibility) */
export const LEGACY_CHAR = "\u6eaf";

/** legacy char 思考标签前缀（含可选日期） */
export const LEGACY_CHAR_THOUGHT_PREFIX_RE = new RegExp(
  `^(角色的思考|${LEGACY_CHAR}的思考|${LEGACY_CHAR}|char的思考|char|su的思考|su)(?:\\s*[·・]\\s*\\d{4}-\\d{2}-\\d{2}(?:\\s+\\d{1,2}:\\d{2})?)?\\s*[：:]\\s*`,
  "u"
);

/** legacy user 思考标签前缀（含可选日期） */
export const LEGACY_USER_THOUGHT_PREFIX_RE = new RegExp(
  `^(你的思考|${LEGACY_USER}的思考|${LEGACY_USER}|user的思考|user|xi的思考|xi)(?:\\s*[·・]\\s*\\d{4}-\\d{2}-\\d{2}(?:\\s+\\d{1,2}:\\d{2})?)?\\s*[：:]\\s*`,
  "u"
);

/** legacy char 思考标签前缀（单行，无日期） */
export const LEGACY_CHAR_THOUGHT_LINE_RE = new RegExp(
  `^(角色的思考|${LEGACY_CHAR}的思考|${LEGACY_CHAR}|char的思考|char|su的思考|su)\\s*[：:]\\s*`,
  "u"
);

/** legacy speaker 前缀（聊天记录） */
export const LEGACY_SPEAKER_PREFIX_RE = new RegExp(
  `^(${LEGACY_CHAR}|${LEGACY_USER}|你|帮我|给我|请|一首|1首|首|发送|调用|工具|网易云|音乐卡片|歌曲卡片)+`,
  "gi"
);

/** legacy personal names（用于过滤误识别说话人） */
export const LEGACY_PERSONAL_NAME_RE = new RegExp(`${LEGACY_CHAR}|${LEGACY_USER}|你|我`);
