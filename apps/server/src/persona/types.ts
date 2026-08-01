export const PERSONA_CATEGORIES = [
  "traits",
  "behaviors",
  "values",
  "emotions",
  "social",
  "cognition",
  "motives",
  "expressions",
] as const;

export type PersonaCategory = (typeof PERSONA_CATEGORIES)[number];

export const PERSONA_CATEGORY_LABELS: Record<PersonaCategory, string> = {
  traits: "性格特质",
  behaviors: "行为倾向",
  values: "价值观",
  emotions: "情绪模式",
  social: "人际关系态度",
  cognition: "认知风格",
  motives: "动机恐惧",
  expressions: "表达习惯",
};

export interface PersonaEntry {
  id: string;
  category: PersonaCategory;
  /** 画像认识正文（注入用） */
  content: string;
  /** 证据摘录（不注入） */
  evidence: string;
  createdAt: string;
  updatedAt: string;
}

export function isPersonaCategory(v: string): v is PersonaCategory {
  return (PERSONA_CATEGORIES as readonly string[]).includes(v);
}
