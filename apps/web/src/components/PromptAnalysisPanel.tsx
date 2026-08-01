"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

export interface PromptAnalysisSection {
  label: string;
  role: "system" | "user" | "assistant";
  content: string;
  kind?: "prompt" | "chat_marker" | "chat_turn";
  tokens?: number;
  speaker?: string;
  /** 系统插入的相对日时钟（今天/昨天/前天 HH:MM） */
  clock?: string;
}

interface TokenSummary {
  inputTokens: number;
  promptTokens?: number;
  chatHistoryTokens?: number;
  chatHistoryLimit?: number | null;
  trimmedTokens?: number;
  maxReply: number | null;
  unlimitedReply?: boolean;
  trimmed?: boolean;
  fullInputTokens?: number;
  replyTokens?: number;
  reasoningTokens?: number;
  outputTokens?: number;
}

interface AppliedLimits {
  chatHistoryTokenLimit?: number | null;
  maxReplyTokens?: number | null;
  capturedAt?: string;
}

interface PromptAnalysisMessageMeta {
  messageId: string;
  createdAt?: string;
  isLatestAssistant: boolean;
  /** 该条 assistant 可见正文，用于估算实际回复词元 */
  replyContent?: string;
  /** 该条 assistant 内心戏，用于旧消息回退估算 */
  reasoningContent?: string;
}

interface PromptAnalysisPanelProps {
  contextLog: unknown;
  messageMeta?: PromptAnalysisMessageMeta | null;
  onClose: () => void;
}

type DisplayBlock =
  | { type: "prompt"; section: PromptAnalysisSection }
  | { type: "chat"; turns: PromptAnalysisSection[]; tokens: number };

interface TokenStats {
  statsTime: string;
  beforeTrim: number;
  trimmed: number;
  modelRead: number;
  chatHistory: number;
  chatHistoryLimit: number | null;
  nonChatHistory: number;
  replyTokens: number | null;
  reasoningTokens: number | null;
  outputTokens: number | null;
  maxReply: number | null;
}

function parseSections(contextLog: unknown): PromptAnalysisSection[] {
  if (!contextLog || typeof contextLog !== "object") return [];
  const log = contextLog as Record<string, unknown>;
  if (Array.isArray(log.sections)) return log.sections as PromptAnalysisSection[];

  const legacyOrder = [
    "主提示词",
    "系统说明",
    "相关记忆",
    "世界书_角色定义前",
    "角色描述",
    "角色人格",
    "场景设定",
    "世界书_角色定义后",
    "示例对话",
    "后续历史指令",
    "聊天历史",
  ];
  const legacyLabelMap: Record<string, string> = {
    世界书_角色定义前: "语意记忆_角色定义前",
    世界书_角色定义后: "语意记忆_角色定义后",
  };
  const sections: PromptAnalysisSection[] = [];
  for (const key of legacyOrder) {
    const val = log[key];
    if (typeof val === "string" && val.trim() && val !== "（无）") {
      sections.push({
        label: legacyLabelMap[key] || key,
        role: key === "聊天历史" ? "user" : "system",
        content: val,
      });
    }
  }
  if (sections.length === 0 && typeof log.说明 === "string") {
    sections.push({ label: "说明", role: "system", content: log.说明 });
  }
  return sections;
}

function parseInvisibleAgent(contextLog: unknown): {
  decidedBy?: string;
  mode?: string;
  toolSummary?: string;
  tools?: { tool: string; ok: boolean; summary: string }[];
} | null {
  if (!contextLog || typeof contextLog !== "object") return null;
  const raw = (contextLog as Record<string, unknown>).invisibleAgent;
  if (!raw || typeof raw !== "object") return null;
  return raw as {
    decidedBy?: string;
    mode?: string;
    toolSummary?: string;
    tools?: { tool: string; ok: boolean; summary: string }[];
  };
}

function parseTokenSummary(contextLog: unknown): TokenSummary | null {
  if (!contextLog || typeof contextLog !== "object") return null;
  const log = contextLog as Record<string, unknown>;
  if (!log.tokenSummary || typeof log.tokenSummary !== "object") return null;
  return log.tokenSummary as TokenSummary;
}

function parseAppliedLimits(contextLog: unknown): AppliedLimits | null {
  if (!contextLog || typeof contextLog !== "object") return null;
  const log = contextLog as Record<string, unknown>;
  if (!log.appliedLimits || typeof log.appliedLimits !== "object") return null;
  return log.appliedLimits as AppliedLimits;
}

function estimateSectionTokens(s: PromptAnalysisSection): number {
  if (typeof s.tokens === "number") return s.tokens;
  let tokens = 0;
  for (const ch of s.content) {
    const code = ch.codePointAt(0) ?? 0;
    tokens += code <= 0x7f ? 0.25 : 1;
  }
  return Math.ceil(tokens);
}

function isChatHistorySection(section: PromptAnalysisSection): boolean {
  if (section.kind === "chat_turn") return true;
  if (section.kind === "chat_marker") {
    if (section.label === "聊天历史") {
      return !section.content.includes("表示新的一天");
    }
    return section.label === "时间线";
  }
  if (section.label.startsWith("世界书 @D") || section.label.startsWith("语意记忆 @D")) {
    return true;
  }
  return false;
}

function computeTokensFromSections(sections: PromptAnalysisSection[]): {
  chatHistoryTokens: number;
  promptTokens: number;
  totalTokens: number;
} {
  let chatHistoryTokens = 0;
  let promptTokens = 0;
  for (const section of sections) {
    const tokens = estimateSectionTokens(section);
    if (isChatHistorySection(section)) chatHistoryTokens += tokens;
    else promptTokens += tokens;
  }
  return { chatHistoryTokens, promptTokens, totalTokens: chatHistoryTokens + promptTokens };
}

function groupSections(sections: PromptAnalysisSection[]): DisplayBlock[] {
  const blocks: DisplayBlock[] = [];
  let i = 0;

  while (i < sections.length) {
    const s = sections[i];
    if (s.kind === "chat_marker" || s.kind === "chat_turn") {
      const groupLabel = s.label;
      const turns: PromptAnalysisSection[] = [];
      while (i < sections.length) {
        const cur = sections[i];
        if (cur.kind !== "chat_marker" && cur.kind !== "chat_turn") break;
        if (turns.length > 0 && cur.kind === "chat_marker" && cur.label !== groupLabel) break;
        turns.push(cur);
        i++;
      }
      const tokens = turns.reduce((sum, t) => sum + estimateSectionTokens(t), 0);
      blocks.push({ type: "chat", turns, tokens });
    } else {
      blocks.push({ type: "prompt", section: s });
      i++;
    }
  }
  return blocks;
}

function formatStatsTime(iso?: string, fallback?: string): string {
  const raw = iso || fallback;
  if (!raw) return "—";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatLimit(limit: number | null | undefined, unlimited?: boolean): string {
  if (unlimited || limit === null || limit === undefined) return "不限制";
  return String(limit);
}

function estimatePlainTokens(text: string): number {
  let tokens = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    tokens += code <= 0x7f ? 0.25 : 1;
  }
  return Math.ceil(tokens);
}

function buildTokenStats(
  sections: PromptAnalysisSection[],
  summary: TokenSummary | null,
  appliedLimits: AppliedLimits | null,
  messageMeta?: PromptAnalysisMessageMeta | null
): TokenStats | null {
  const fromSections = sections.length > 0 ? computeTokensFromSections(sections) : null;

  const modelRead =
    summary?.inputTokens ?? fromSections?.totalTokens ?? null;
  if (modelRead === null) return null;

  const chatHistory =
    summary?.chatHistoryTokens ?? fromSections?.chatHistoryTokens ?? 0;
  let nonChatHistory = summary?.promptTokens ?? fromSections?.promptTokens ?? modelRead - chatHistory;

  if (nonChatHistory + chatHistory !== modelRead) {
    nonChatHistory = modelRead - chatHistory;
  }

  const beforeTrim = summary?.fullInputTokens ?? modelRead;
  let trimmed =
    summary?.trimmedTokens ?? Math.max(0, beforeTrim - modelRead);

  if (trimmed + modelRead !== beforeTrim) {
    trimmed = Math.max(0, beforeTrim - modelRead);
  }

  const chatHistoryLimit =
    appliedLimits?.chatHistoryTokenLimit ?? summary?.chatHistoryLimit ?? null;
  const maxReply =
    appliedLimits?.maxReplyTokens ??
    (summary?.unlimitedReply ? null : summary?.maxReply ?? null);

  const statsTime = formatStatsTime(
    appliedLimits?.capturedAt,
    messageMeta?.createdAt
  );

  const replyTokens =
    summary?.replyTokens ??
    (messageMeta?.replyContent?.trim() ? estimatePlainTokens(messageMeta.replyContent) : null);

  const reasoningTokens =
    summary?.reasoningTokens ??
    (messageMeta?.reasoningContent?.trim()
      ? estimatePlainTokens(messageMeta.reasoningContent)
      : null);

  const outputTokens =
    summary?.outputTokens ??
    (replyTokens !== null || reasoningTokens !== null
      ? (replyTokens ?? 0) + (reasoningTokens ?? 0)
      : null);

  return {
    statsTime,
    beforeTrim,
    trimmed,
    modelRead,
    chatHistory,
    chatHistoryLimit,
    nonChatHistory,
    replyTokens,
    reasoningTokens,
    outputTokens,
    maxReply,
  };
}

export default function PromptAnalysisPanel({
  contextLog,
  messageMeta,
  onClose,
}: PromptAnalysisPanelProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const sections = parseSections(contextLog);
  const blocks = groupSections(sections);
  const summary = parseTokenSummary(contextLog);
  const appliedLimits = parseAppliedLimits(contextLog);
  const invisibleAgent = parseInvisibleAgent(contextLog);
  const tokenStats = buildTokenStats(sections, summary, appliedLimits, messageMeta);

  if (!mounted) return null;

  const panel = (
    <div className="modal-overlay prompt-analysis-overlay" onClick={onClose}>
      <div className="modal-panel prompt-analysis-panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header prompt-analysis-header">
          <h3 style={{ margin: 0 }}>提示词分析</h3>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="modal-body prompt-analysis-body">
          {messageMeta && !messageMeta.isLatestAssistant && (
            <p className="prompt-analysis-stale-notice">
              你正在查看较早的回复记录。若要核对最新 TOKEN 限制，请对<strong>最新一条角色的回复</strong>打开提示词分析。
            </p>
          )}
          {tokenStats ? (
            <div className="prompt-analysis-stats">
              <div className="prompt-analysis-stats-time">
                统计时间：{tokenStats.statsTime}
              </div>
              <ul className="prompt-analysis-stats-list">
                <li>裁剪前总共 {tokenStats.beforeTrim} 词元</li>
                <li>已裁剪 {tokenStats.trimmed} 词元</li>
                <li>本次模型阅读 {tokenStats.modelRead} 词元</li>
                <li>
                  聊天历史 {tokenStats.chatHistory} 词元 / 限制{" "}
                  {formatLimit(tokenStats.chatHistoryLimit)}
                </li>
                <li>除聊天历史外：{tokenStats.nonChatHistory} 词元</li>
                <li>
                  本次回复 {tokenStats.replyTokens ?? "—"} 词元 / 限制{" "}
                  {formatLimit(tokenStats.maxReply, summary?.unlimitedReply)}
                </li>
                <li>
                  内心戏（思维链） {tokenStats.reasoningTokens ?? "—"} 词元
                  <span className="prompt-analysis-stats-hint">
                    （不含回复正文里的括号描写；那些算在「本次回复」里）
                  </span>
                </li>
                <li>本次输出合计 {tokenStats.outputTokens ?? "—"} 词元</li>
              </ul>
            </div>
          ) : sections.length > 0 ? (
            <p className="hint">此消息无词元汇总数据（旧记录），请重新生成一条新回复后再查看统计。</p>
          ) : null}
          {invisibleAgent && (invisibleAgent.decidedBy || invisibleAgent.toolSummary || (invisibleAgent.tools && invisibleAgent.tools.length > 0)) ? (
            <div className="prompt-analysis-stats">
              <div className="prompt-analysis-stats-time">
                隐形层调用（仅分析，未喂给角色）
              </div>
              <ul className="prompt-analysis-stats-list">
                {invisibleAgent.decidedBy ? (
                  <li>决策：{invisibleAgent.decidedBy}{invisibleAgent.mode ? ` · ${invisibleAgent.mode}` : ""}</li>
                ) : null}
                {invisibleAgent.tools?.map((t, i) => (
                  <li key={`${t.tool}-${i}`}>
                    {t.tool}：{t.ok ? "成功" : "未成功"}
                    {t.summary ? `（${t.summary}）` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {blocks.length === 0 ? (
            <p className="hint">此消息没有提示词记录。请重新生成一条新回复后再查看。</p>
          ) : (
            <article className="prompt-analysis-doc">
              {blocks.map((block, i) =>
                block.type === "chat" ? (
                  <section key={`chat-${i}`} className="prompt-analysis-block prompt-analysis-chat">
                    <div className="prompt-analysis-chat-flow">
                      {block.turns.map((t, j) => {
                        // 与模型所见一致：时间行 + 说话人正文挂在一起，不再单独盖「系统」徽章
                        const body = t.content
                          .replace(/\[说话人[·・.][^\]]+\]\s*/g, "")
                          .trim();
                        return (
                        <div
                          key={j}
                          className={
                            t.kind === "chat_marker"
                              ? "prompt-analysis-chat-marker"
                              : "prompt-analysis-chat-turn"
                          }
                        >
                          <div className="prompt-analysis-chat-turn-body">{body}</div>
                        </div>
                        );
                      })}
                    </div>
                  </section>
                ) : (
                  <section
                    key={`prompt-${i}`}
                    className={`prompt-analysis-block prompt-analysis-${block.section.role}`}
                  >
                    <div className="prompt-analysis-block-text">{block.section.content}</div>
                  </section>
                )
              )}
            </article>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(panel, document.body);
}
