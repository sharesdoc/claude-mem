# 上游 claude-mem 可安全 Cherry-Pick 清单

- **上游镜像**：`github.com/thedotmack/claude-mem` @ `v13.11.0`（本地 `../claude-mem.github`）
- **我方分叉**：`git.hnzhzw.com:ai/plugins/claude-mem` @ `v13.2.0`
- **对比基点**：`671de5e3` 之后共 **227** 个提交（`671de5e3` 存在于我方仓库但非 HEAD 祖先，两侧已各自分叉，无法 fast-forward）
- **筛选方法**：候选池 93（fix/feat/batch/refactor，去版本号/changelog/merge）→ 按触及文件分桶（排除 telemetry/sdk/server-rename）→ 对 SHARED 45 条**仅取源码子集**(`src tests plugin/skills plugin/hooks openclaw/src docs .claude-plugin`，排除本地重建的 `plugin/scripts/*.cjs`)跑 `git apply --check`。
- **通用操作**：任何采纳项应只取 `src/**` 等源码改动，落地后统一 `npm run build` 重生成 `plugin/scripts/*.cjs`，**切勿**跨仓库 cherry-pick 生成产物。

> 重复主题对（`b44c6d8f`≡`c81acee3`、`22e4325c`≡`b20024b7`、`92997115`≡`83dd5925`、`339d3eca`≡`eeaadb4a`）经 md5 校验为**逐字节相同** patch（分支+合并各出现一次），每对只取其一。

---

## Tier A —— 绿：源码子集干净应用，可直接 cherry-pick（随后 `npm run build`）

| SHA | 主题 | 文件 | 相关性 / 备注 |
|---|---|---|---|
| `7a81c507` | refactor: stdin-reader 去掉冗余 50ms 延时 (#2746) | `src/cli/stdin-reader.ts` | ✅ 我们共享该文件，纯质量修复 |
| `b44c6d8f` | fix: probe configured worker host | `HealthMonitor.ts`+test | ✅ 多账号/自定义 host 健康探测；与 `c81acee3` 同一 patch，取其一 |
| `36bb1e4b` | fix(marketplace): 移除不支持的 `metadata.homepage` (#2628) | `.claude-plugin/marketplace.json` | ✅ 无害元数据修正 |
| `7121de49` | fix(openclaw): 压缩 routine feed 消息 (#2734) | `openclaw/src/*` | ◐ 仅当我们使用 openclaw |
| `87e4836a` | feat(skills): 新增 "what-the" skill (#3026) | `plugin/skills/what-the/SKILL.md` | ◐ 纯新增，可选 |
| `38fc189b` | fix(build): 打包 sqlite runtime modules | 构建配置 1f | ◐ 边际，仅当遇到 sqlite 打包问题 |

**跳过**：`838d888a` cloud-sync skill —— 依赖我方**不具备**的 worker-native CloudSync 架构，装了也是死技能。

---

## Tier B —— 黄：高价值，需人工解冲突（单/少文件，建议采纳）

| SHA | 主题 | 文件 | 为什么值得做 |
|---|---|---|---|
| ⭐ `ce1f5253` | fix: 令 Claude memory hooks 非阻断 | `plugin/hooks/hooks.json` (1f) | **✅ 已采纳并按 /rev 修正**(commit `a55c3783` → 修正 commit 见下)。**仅对 `observation`(PostToolUse)与 `summarize`(Stop)加 `"async": true`**(纯记录/触发型,async 无损)。**`file-context`(PreToolUse/Read)不加 async**——它是注入型 hook(读前把文件历史观察作为 `additionalContext` 注入),async 会令 Claude Code 丢弃其 stdout、静默禁用注入(R-001)。其阻断风险已由 `timeout:60` + 我方 `bun-runner.js` 退出码归一化兜住。`SessionStart` context 亦不加(需同步注入)。**与上游取舍分叉:上游对三 hook 全加 async,我方保留注入招牌功能。** |
| ⭐ `62693445` | fix: hook no-op 回退时输出合法 SessionStart `hookSpecificOutput` (#2972) | `hook-command.ts`+test (2f) | **✅ 已采纳**(commit `a55c3783`)。新增 `buildNoOpResult(event)`,adapter 拒绝/输入缺失回退时对 `context` 事件补最小合法 payload。已适配我方 `formatOutput` 调用形态(非上游 `emitModelContext`)+ 配套单测。 |
| `016668338` | fix: 限制 observer provider 上下文 | 4f (`observer-context.ts` 等) | ⏸ **暂缓**(2026-07-23 决策)。价值最高、最自包含(新增独立模块),但需针对分叉手工移植,见下"provider 三项暂缓说明"。 |
| `f7aa16d6` | fix(deps): CLI 依赖缺失时优雅降级 | 10f (chroma/provider) | ⏸ **暂缓**。面广,ChromaMcpManager/SessionRoutes 多处冲突。 |
| `29af0284` | fix(providers): 移除客户端上下文截断（"second system"） | 8f，含 `SettingsDefaultsManager.ts` | ⏸ **暂缓**(风险最高)。落在 X-008 热修过的 `SettingsDefaultsManager`,且是"删行为",需逐 hunk 核对不回归。 |

> **provider 三项暂缓说明(2026-07-23)**：三项均**无法干净应用**。根因是 **provider 架构已根本分叉**——上游把 OpenAI 兼容路径抽象为通用 `OpenAICompatibleProvider.ts`,**我方保留专用 `QwenProvider.ts` 且不存在 `OpenAICompatibleProvider.ts`**。三项补丁全部瞄准上游抽象,须逐 hunk 重指我方 `QwenProvider`/`ClaudeProvider`。经评估,收益未达到即刻承担该手工移植风险的程度,统一暂缓归档;若后续 Qwen observer 上下文撑窗或依赖缺失整链崩问题实际发生,优先单独抽取 `016668338`。

---

## Tier C —— 排除 / 暂缓

| 类别 | 数量 | 处置 | 原因 |
|---|---|---|---|
| **telemetry / PostHog** | 16 | ❌ 硬排除 | opt-out（默认开）匿名分析上报第三方，违背隐私红线与项目定位 |
| CMEM-Online 邮箱 opt-in (`d88a3c01`) | 1 | ❌ 排除 | 上游 SaaS 拉新，内网分叉无关 |
| **cmem-sdk（新包）** | 10 | ⏸ 暂缓 | 新增 headless SDK，能力扩展非修复，需战略决策 |
| **server-beta→server 重命名/重构** | 22 | ⏸ 暂缓 | 大重构，与我方已分叉 server 代码高冲突、无功能收益 |
| CloudSync 系列（`1d12941e` `b3e79f83` `8b10d9ee` `5af1b059` `7c8c6ebc` `aa186fae` `f7bb940f`） | 7 | ⏸ 暂缓 | 依赖上游 CloudSync 架构，我方未引入 |
| Codex / Antigravity host（`26fe40a6` `173ebb26` `ec783e87` `9cbd3f82` `2282220d` `41b6a8a9` `9afe1e0c` `8d80ca4b` `47d14c17`） | 9 | ❌ 排除 | 我方不使用这些 host 集成 |
| windows spawn shims / sqlite 大加固（`92997115`≡`83dd5925`、`22e4325c`≡`b20024b7` 各 22f） | 2 | ⏸ 暂缓 | blast radius 极大且触及多个分叉文件；**若 X-008 类 settings 写入问题复发**，可单独抽取其中 `atomic-json` / settings 原子写 hunk |

---

## 建议执行顺序

1. ~~**Tier A 先落**：`7a81c507` → `b44c6d8f` → `36bb1e4b`~~ **✅ 已完成**(commit `7ddb87a2`,源码-only,零回归)。可选项 `7121de49`/`87e4836a`/`38fc189b` 未采纳。
2. ~~**Tier B 两个 hook 项**（`ce1f5253` + `62693445`）~~ **✅ 已完成**(commit `a55c3783`,源码-only,作用域全量 1851 pass / 94 fail / 1 error,较基线仅 +2 新增测试,零回归)。
3. 其余 Tier B（provider 三项）**⏸ 已暂缓**(2026-07-23):因 provider 架构分叉(QwenProvider vs 上游 OpenAICompatibleProvider)无一可干净应用,统一归档;触发条件见上说明。
4. Tier C 归档留档，按需再议。
