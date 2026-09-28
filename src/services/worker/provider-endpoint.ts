
// ---------------------------------------------------------------------------
// provider-endpoint — 自定义 LLM 端点的 http(s) 形状校验 (X-035)。
// 设计取舍: 可配置端点是本地 vLLM/Ollama 部署的核心用例, 不做 loopback/
// 内网地址封锁(会杀死该场景); SSRF 类风险由三层兜底:
//   1) 本模块的 scheme 校验(非 http(s) 快速失败而非 opaque fetch 报错)
//   2) 调用方 fetch 的 redirect: 'manual'(防止 302 把带凭据的请求弹到任意目标)
//   3) X-027/X-028 的自定义端点 WARN(仅打印主机名, 可观测性)
// ---------------------------------------------------------------------------

/** 是否为合法 http(s) 端点 URL。 */
export function isHttpEndpoint(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

/** 断言 http(s) 端点; 非法时抛错, 让会话启动期快速失败并带明确配置指引。 */
export function assertHttpEndpoint(value: string, settingName: string): void {
  if (!isHttpEndpoint(value)) {
    throw new Error(`${settingName} is not a valid http(s) URL: ${value}`);
  }
}
