export function humanizeToolError(tool: string, raw: string): string {
  const r = raw.trim();
  if (/未配置|not configured/i.test(r)) {
    return `${tool}接口还没在设置里配好`;
  }
  if (/401|403|API Key|api key|鉴权|Unauthorized|invalid.*key/i.test(r)) {
    return `${tool}用的 API Key 不对或者已经失效了`;
  }
  if (/429|rate limit|过于频繁/i.test(r)) {
    return `${tool}请求太频繁，被接口限流了`;
  }
  if (/timeout|超时|abort|ETIMEDOUT/i.test(r)) {
    return `${tool}请求超时，网络或服务端响应太慢`;
  }
  if (/未找到|没找到|not found/i.test(r)) {
    return r;
  }
  return r;
}

/** 点歌/生图 follow-up 失败时，把说明并入角色的上一条回复 */
export function appendToolFailureExplanation(
  existingReply: string,
  toolLabel: string,
  rawError: string,
  userName = "你"
): string {
  const plain = humanizeToolError(toolLabel, rawError);
  const trimmed = existingReply.trim();
  if (!trimmed) {
    return `${userName}，${toolLabel}这边没能完成——${plain}。`;
  }
  return `${trimmed}\n\n${userName}，${toolLabel}这边没能完成——${plain}。`;
}
