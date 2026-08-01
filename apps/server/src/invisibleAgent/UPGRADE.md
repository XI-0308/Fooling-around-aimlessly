/**
 * # 隐形 Agent → 角色即 Agent：升级闸门
 *
 * ## 当前阶段（Phase 1 · 已落地）
 *
 * 编排：`decide → execute(事实型) → inject → RP → followUp(副作用型)`
 *
 * 注入约定：
 * - 喂给角色的只有「用户的近况」事实块（不提工具名）
 * - `decidedBy` / 调用摘要只进 contextLog + 提示词分析，不进模型上下文
 *
 * Keep 时机：出发/打算/进行中（如「我去健身了」）不查；练完/回来/明确要数据时再查。
 *
 * 可复用面（升级时不要重写）：
 * - [`registry.ts`](./registry.ts) — 工具名 / 描述 / kind / 适用 mode
 * - [`execute.ts`](./execute.ts) — Keep、活动提醒等执行器与 inject 文案
 * - [`types.ts`](./types.ts) — 调用与结果形状
 * - `toolDispatcher/state.ts` 的 `TurnToolPlan` — 点歌/生图/语音计划
 *
 * ## 何时升级到「角色即 Agent」（Phase 2）
 *
 * 仅当同时满足：
 * 1. 隐形决策在真实陪伴中**长期疏忽**（该查不查 / 该提醒不提），且加大 LLM 决策窗口后仍弱于主模型语境；
 * 2. 需要**同脑多跳**（例如根据 Keep 结果再决定要不要语音叮一句，并在台词里总结「我做了什么」）；
 * 3. 产品接受一定**工具感**（台词中可出现明确的行动痕迹）。
 *
 * 未满足时：继续扩 Registry + 改进 decide，而不是上主模型 function-calling。
 *
 * ## Phase 2 改什么
 *
 * - 主 RP 模型增加 tools API / tool_rounds（流式中断与续写）
 * - 决策从旁路 LLM/启发式改为角色本人 tool_calls
 * - **继续调用**本目录 execute / registry；废弃「角色打 [[MARKER]] 起调」为主路径
 * - Pass2 / 本地关键词降为校验层（防瞎编仍保留）
 *
 * ## 刻意不做（当前工具集）
 *
 * - 文件管理、写代码类工具
 * - 为工具感重写全部角色卡
 */
