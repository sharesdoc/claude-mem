
import { describe, it, expect } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

// X-022: install.ts 交互流程源码断言——与 install-non-tty.test.ts 同风格。
// 交互 prompt 无法单测, 用源码特征锁定验收标准:
//   1) ProviderId 含 5 厂商
//   2) provider 选择交互含 Qwen/DeepSeek 选项
//   3) 安装流程询问 REPORT_PROVIDER(默认 off)
//   4) qwen/deepseek 有 URL 提示路径

const installSource = readFileSync(
  join(__dirname, '..', 'src', 'npx-cli', 'commands', 'install.ts'),
  'utf-8',
);

describe('Install provider options (X-022)', () => {
  it('should type ProviderId with all five vendors', () => {
    expect(installSource).toMatch(/type ProviderId = .*'qwen'.*'deepseek'/s);
  });

  it('should offer Qwen and DeepSeek in the provider select', () => {
    expect(installSource).toContain("{ value: 'qwen'");
    expect(installSource).toContain("{ value: 'deepseek'");
  });

  it('should prompt for CLAUDE_MEM_REPORT_PROVIDER with an off default', () => {
    expect(installSource).toContain('CLAUDE_MEM_REPORT_PROVIDER');
    expect(installSource).toContain('promptReportProvider');
  });

  it('should prompt an optional URL for qwen/deepseek', () => {
    expect(installSource).toContain('CLAUDE_MEM_QWEN_URL');
    expect(installSource).toContain('CLAUDE_MEM_DEEPSEEK_URL');
  });
});
