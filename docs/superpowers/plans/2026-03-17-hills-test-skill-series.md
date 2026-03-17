# hills-test Skill 系列实施计划

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有 4 个散装测试 skills 重组为 7 个 skill 的完整测试闭环系列，支持三种入口场景，与 superpowers 无缝集成。

**Architecture:** 三层架构（入口层 → 分析/生成层 → 验证层），总入口 `hills-test` 编排调度，各 skill 通过文档（用例清单、报告）传递数据，子 Agent 严格职责隔离。

**Tech Stack:** Claude Code Skills (SKILL.md markdown), sub-agent prompt templates (.md)

**Spec:** `docs/superpowers/specs/2026-03-17-hills-test-skill-series-design.md`

---

## File Structure

```
~/.claude/skills/
├── hills-test/
│   └── SKILL.md                          # 总入口/测试计划生成器
├── hills-test-impact/
│   ├── SKILL.md                          # 变更影响分析
│   └── impact-analyst-prompt.md          # 影响分析 Agent prompt
├── hills-unit-test/
│   ├── SKILL.md                          # 单测全流程（用例+代码）
│   ├── case-analyst-prompt.md            # 用例分析师子 Agent prompt
│   └── test-developer-prompt.md          # 测试开发者子 Agent prompt
├── hills-e2e-test/
│   ├── SKILL.md                          # E2E 全流程（用例+代码）
│   ├── case-analyst-prompt.md            # 用例分析师子 Agent prompt
│   └── test-developer-prompt.md          # 测试开发者子 Agent prompt
├── hills-test-quality/
│   ├── SKILL.md                          # 测试质量审查
│   └── quality-reviewer-prompt.md        # 质量审查员子 Agent prompt
├── hills-test-run/
│   ├── SKILL.md                          # 运行测试 + 结果分析
│   └── test-executor-prompt.md           # 测试执行员 Agent prompt
├── hills-test-verify/
│   ├── SKILL.md                          # 走查验收
│   └── walkthrough-verifier-prompt.md    # 走查验收员 Agent prompt
├── hills-unit-test-cases-generator/      # 旧 skill（保留，后续废弃）
├── hills-e2e-test-case-generator/        # 旧 skill（保留，后续废弃）
├── hills-e2e-test-code-quality/          # 旧 skill（保留，后续废弃）
└── hills-web-walkthrough/                # 旧 skill（保留，后续废弃）
```

修改项目 CLAUDE.md，更新测试工作流指令指向新 skills。

---

## Task 1: hills-test-impact（变更影响分析）

**依赖：** 无（独立 skill，无前置）
**Files:**
- Create: `~/.claude/skills/hills-test-impact/SKILL.md`
- Create: `~/.claude/skills/hills-test-impact/impact-analyst-prompt.md`

从分析层开始，因为它是最独立的 skill，无需引用其他 hills-test skill。

- [ ] **Step 1: 创建 impact-analyst-prompt.md（影响分析 Agent prompt）**

子 Agent prompt 模板，定义影响分析师角色：
- 角色声明：你是一名变更影响分析师，职责是分析代码变更的影响范围
- 铁律：禁止修改任何代码，只输出影响分析报告
- 输入：git diff 范围（默认当前未提交变更）、项目根路径
- 分析方法：git diff --name-only → 依赖图追踪（Grep import/require）→ 测试文件映射
- 输出格式：变更文件、影响扩展表、测试状态表、建议列表（含风险等级和推荐 skill）
- 报告落盘：写入 `docs/hills-test/{requirement_name}/impact-analysis.md`，多轮追加 `## Round N`

- [ ] **Step 2: 创建 SKILL.md**

```markdown
---
name: hills-test-impact
description: >
  Use when code has been modified and you need to determine which
  tests are affected — regression testing, refactoring, or before
  running tests to narrow scope. Analyzes git diff + import
  dependency graph.
---
```

内容包含：
- 派发影响分析 Agent（读取 impact-analyst-prompt.md）
- 核心流程（4 步：变更收集 → 依赖图扩展 → 测试文件映射 → 输出报告）
- 降级策略：如果依赖分析失败，退化为全量测试并记录警告

参考设计 spec 第 244-306 行的详细定义和输出示例。

- [ ] **Step 3: 验证 skill 加载**

Run: 在 Claude Code 中输入 `/hills-test-impact`
Expected: skill 被正确加载，显示 SKILL.md 内容

- [ ] **Step 4: Commit**

```bash
git add ~/.claude/skills/hills-test-impact/
git commit -m "feat: add hills-test-impact skill for change impact analysis"
```

---

## Task 2: hills-unit-test（单元测试生成）

**依赖：** 无（可与 Task 1 并行）
**Files:**
- Create: `~/.claude/skills/hills-unit-test/SKILL.md`
- Create: `~/.claude/skills/hills-unit-test/case-analyst-prompt.md`
- Create: `~/.claude/skills/hills-unit-test/test-developer-prompt.md`
- Reference: `~/.claude/skills/hills-unit-test-cases-generator/SKILL.md`（继承用例生成逻辑）

- [ ] **Step 1: 创建 case-analyst-prompt.md（用例分析师子 Agent prompt）**

子 Agent prompt 模板，定义用例分析师角色：
- 角色声明：你是一名用例分析师，职责是分析源码并生成测试用例清单
- 铁律：禁止写测试代码、禁止写业务代码、只输出用例清单文档
- 输入：目标源文件路径、可选的 impact 报告路径
- 分析方法：继承现有 hills-unit-test-cases-generator 的 12 维度分析（功能正确性、边界值、错误处理、依赖失败、返回语义、状态/生命周期、副作用、幂等性、跨函数交互、安全性、并发、向后兼容）
- 输出格式：markdown 表格（与现有 skill 一致），写入 `docs/hills-test/{requirement_name}/unit-test-cases.md`
- 多轮策略：更新（覆盖），不追加

- [ ] **Step 2: 创建 test-developer-prompt.md（测试开发者子 Agent prompt）**

子 Agent prompt 模板，定义测试开发者角色：
- 角色声明：你是一名测试开发者，职责是根据用例清单编写测试代码
- 铁律：禁止修改用例清单、禁止写业务代码、只根据清单写测试代码
- 输入：用例清单文件路径、项目测试目录路径
- 代码生成规则（5 条）：风格跟随、一条用例一个 test、命名来自清单、不生成空壳、清单覆盖率 100%
- 风格检测：读取项目已有 .test.ts 文件，匹配框架（vitest/jest）、断言风格、mock 方式
- 输出：.test.ts 文件

- [ ] **Step 3: 创建 SKILL.md**

```markdown
---
name: hills-unit-test
description: >
  Use when unit tests need to be created or updated for any source
  file — including TDD's "write test" step, executing-plans test
  tasks, or standalone test generation. Generates test case
  checklist first, then test code.
---
```

内容包含：
- 两阶段流程：阶段 1 用例生成（派发用例分析师子 Agent）→ 阶段 2 代码生成（派发测试开发者子 Agent）
- 子 Agent 派发指令：读取 case-analyst-prompt.md 和 test-developer-prompt.md，构造精确上下文
- 协调模式检测：在 superpowers 流程中 → 只执行不调下游；独立调用 → 链式调用 hills-test-quality
- 文档产出：用例清单 → `docs/hills-test/{requirement_name}/unit-test-cases.md`

参考设计 spec 第 308-348 行。

- [ ] **Step 4: 验证 skill 加载**

Run: 在 Claude Code 中输入 `/hills-unit-test`
Expected: skill 被正确加载

- [ ] **Step 5: Commit**

```bash
git add ~/.claude/skills/hills-unit-test/
git commit -m "feat: add hills-unit-test skill with case analyst and test developer sub-agents"
```

---

## Task 3: hills-e2e-test（E2E 测试生成）

**依赖：** 无（可与 Task 1、2 并行）
**Files:**
- Create: `~/.claude/skills/hills-e2e-test/SKILL.md`
- Create: `~/.claude/skills/hills-e2e-test/case-analyst-prompt.md`
- Create: `~/.claude/skills/hills-e2e-test/test-developer-prompt.md`
- Reference: `~/.claude/skills/hills-e2e-test-case-generator/SKILL.md`（继承用例生成逻辑）

- [ ] **Step 1: 创建 case-analyst-prompt.md（E2E 用例分析师子 Agent prompt）**

与 Task 2 的 case-analyst-prompt.md 结构相同，但分析维度不同：
- 角色声明：高级 QA 工程师，用户视角优先
- 铁律：同 Task 2
- 分析方法：继承现有 hills-e2e-test-case-generator 的逻辑
  - 区分 Web UI / CLI 两种模式
  - Web 7 维度：UI、UX、功能、实时性、状态持久化、数据准确性、错误处理
  - CLI 4 维度：输入验证、输出验证、副作用验证、错误处理
  - 用户旅程（跨模块端到端场景）
  - Docker 测试环境规范
- 输出：写入 `docs/hills-test/{requirement_name}/e2e-test-cases.md`
- 多轮策略：更新

- [ ] **Step 2: 创建 test-developer-prompt.md（E2E 测试开发者子 Agent prompt）**

- 角色声明：E2E 测试开发者
- 铁律：同 Task 2
- 代码生成规则（5 条）：风格跟随 Playwright、一条用例一个 test、防假阳性 8 大致命模式内置检测、condition-based waiting 禁止 sleep、清单覆盖率 100%
- 风格检测：读取项目 playwright.config.ts 和已有 .spec.ts 文件
- 输出：.spec.ts 文件

- [ ] **Step 3: 创建 SKILL.md**

```markdown
---
name: hills-e2e-test
description: >
  Use when E2E tests need to be created or updated for Web UI or
  CLI features — including after implementation, executing-plans
  test tasks, or standalone E2E test generation. Generates test
  case checklist first, then Playwright/test code.
---
```

内容结构与 hills-unit-test 一致，但引用 E2E 专用的子 Agent prompts。
参考设计 spec 第 350-400 行。

- [ ] **Step 4: 验证 skill 加载**

Run: `/hills-e2e-test`
Expected: skill 被正确加载

- [ ] **Step 5: Commit**

```bash
git add ~/.claude/skills/hills-e2e-test/
git commit -m "feat: add hills-e2e-test skill with E2E case analyst and test developer sub-agents"
```

---

## Task 4: hills-test-quality（测试质量审查）

**依赖：** 无（可与 Task 1-3 并行）
**Files:**
- Create: `~/.claude/skills/hills-test-quality/SKILL.md`
- Create: `~/.claude/skills/hills-test-quality/quality-reviewer-prompt.md`
- Reference: `~/.claude/skills/hills-e2e-test-code-quality/SKILL.md`（继承 8 大致命模式）

- [ ] **Step 1: 创建 quality-reviewer-prompt.md（质量审查员子 Agent prompt）**

- 角色声明：测试质量审查员，独立视角，冷眼审查
- 铁律：禁止修改任何代码，只输出审查报告
- 输入：测试代码文件路径、对应用例清单文件路径
- 审查流程 4 步：
  1. 清单对照检查（覆盖率缺口）
  2. 假阳性检测（继承现有 8 大致命模式，完整列出每个模式的检测规则和示例代码）
  3. 单测专项检查（过度 mock、断言粒度、测试隔离性）
  4. 质量评分（🔴 阻断 / 🟡 警告 / 🟢 通过）
- 输出格式：结构化审查报告
- 报告落盘：写入 `docs/hills-test/{requirement_name}/quality-review.md`，多轮追加 `## Round N`

- [ ] **Step 2: 创建 SKILL.md**

```markdown
---
name: hills-test-quality
description: >
  Use after test code has been written or modified — reviews both
  unit tests and E2E tests for false positives, weak assertions,
  and quality issues. Must pass before running tests.
---
```

内容包含：
- 派发质量审查员子 Agent（读取 quality-reviewer-prompt.md）
- 协调模式：被链式调用 → 返回结果；独立调用 → 审查指定文件
- 🔴 阻断时的回退逻辑描述（由编排层执行，不由本 skill 执行）

参考设计 spec 第 402-446 行。

- [ ] **Step 3: 验证 skill 加载**

Run: `/hills-test-quality`
Expected: skill 被正确加载

- [ ] **Step 4: Commit**

```bash
git add ~/.claude/skills/hills-test-quality/
git commit -m "feat: add hills-test-quality skill with quality reviewer sub-agent"
```

---

## Task 5: hills-test-run（运行测试 + 结果分析）

**依赖：** 无（可与 Task 1-4 并行）
**Files:**
- Create: `~/.claude/skills/hills-test-run/SKILL.md`
- Create: `~/.claude/skills/hills-test-run/test-executor-prompt.md`

- [ ] **Step 1: 创建 test-executor-prompt.md（测试执行员 Agent prompt）**

子 Agent prompt 模板，定义测试执行员角色：
- 角色声明：你是一名测试执行员，职责是运行测试并分析结果
- 铁律：禁止修改任何代码（测试代码和业务代码都不能改），只执行测试命令并输出分析报告
- 输入：测试范围（全量/指定文件/受影响范围）、当前 TDD 阶段（Red/Green/最终验证）
- 执行方法：检测测试框架（vitest/jest/playwright）→ 构造运行命令 → 捕获 stdout+stderr
- 结果分类：🔴 真 bug / 🟡 测试缺陷 / 🟠 环境问题（含 Docker 5 细分）/ ⚪ TDD 预期失败
- 报告落盘：写入 `docs/hills-test/{requirement_name}/test-run.md`，多轮追加 `## Round N`
- Docker 日志：`docs/hills-test/{requirement_name}/docker.log`，覆盖

- [ ] **Step 2: 创建 SKILL.md**

```markdown
---
name: hills-test-run
description: >
  Use when tests need to be executed and results analyzed — TDD
  red/green steps, regression verification, or final validation
  before completion. Runs tests, classifies failures, and
  recommends next action.
---
```

内容包含：
- 派发测试执行员 Agent（读取 test-executor-prompt.md）
- 运行策略判断（impact 报告范围 / TDD Red / TDD Green / 全量）
- Docker 测试环境完整规范（隔离 15 条规则，全部从 spec 复制）
- Docker 环境启动/清理流程

参考设计 spec 第 448-550 行。

- [ ] **Step 3: 验证 skill 加载**

Run: `/hills-test-run`
Expected: skill 被正确加载

- [ ] **Step 4: Commit**

```bash
git add ~/.claude/skills/hills-test-run/
git commit -m "feat: add hills-test-run skill for test execution and result analysis"
```

---

## Task 6: hills-test-verify（走查验收）

**依赖：** 无（可与 Task 1-5 并行）
**Files:**
- Create: `~/.claude/skills/hills-test-verify/SKILL.md`
- Create: `~/.claude/skills/hills-test-verify/walkthrough-verifier-prompt.md`
- Reference: `~/.claude/skills/hills-web-walkthrough/SKILL.md`（继承走查逻辑）

- [ ] **Step 1: 创建 walkthrough-verifier-prompt.md（走查验收员 Agent prompt）**

子 Agent prompt 模板，定义走查验收员角色：
- 角色声明：你是一名走查验收员，职责是通过 Playwright 截图验证 Web UI 的真实体验
- 铁律：禁止修改任何代码，只执行 Playwright 脚本并输出走查报告
- 输入：功能描述、走查路径（按用户旅程组织）、Docker 环境信息
- 验证方法：每步截图 + 6 维度验证（存在性、内容、准确性、持久化、响应性、流程连续性）
- 问题分类：UI bug / 数据 bug / 状态 bug
- 报告落盘：写入 `docs/hills-test/{requirement_name}/walkthrough.md`，多轮追加 `## Round N`
- 截图存放：`docs/hills-test/{requirement_name}/screenshots/roundN-stepN.png`
- Docker 环境：`cc2im-test-verify` project name，全栈启动，真实场景 seed，60s 超时

- [ ] **Step 2: 创建 SKILL.md**

```markdown
---
name: hills-test-verify
description: >
  Use after all tests pass and hills-test-quality approves — final
  visual verification of Web UI using Playwright screenshots.
  Catches issues that pass/fail tests miss: wrong data values,
  broken flows across refresh, missing UI elements.
---
```

内容包含：
- 派发走查验收员 Agent（读取 walkthrough-verifier-prompt.md）
- 继承现有 hills-web-walkthrough 的核心逻辑（Playwright 截图、6 维度验证）
- Docker 环境（走查专用）规范
- 走查不通过时的问题分类和回退建议

参考设计 spec 第 552-626 行。

- [ ] **Step 3: 验证 skill 加载**

Run: `/hills-test-verify`
Expected: skill 被正确加载

- [ ] **Step 4: Commit**

```bash
git add ~/.claude/skills/hills-test-verify/
git commit -m "feat: add hills-test-verify skill for visual walkthrough verification"
```

---

## Task 7: hills-test（总入口 / 编排器）

**依赖：** Task 1-6（需要引用所有下游 skill 的名称和触发条件）
**Files:**
- Create: `~/.claude/skills/hills-test/SKILL.md`

- [ ] **Step 1: 创建 SKILL.md — 场景识别 + requirement_name 逻辑**

```markdown
---
name: hills-test
description: >
  Use when any test-related work is needed — new feature testing,
  regression testing, TDD setup, or when writing-plans encounters
  test tasks. Generates a test plan with explicit hills-test skill
  assignments for each task.
---
```

编写 SKILL.md 的前半部分：
- 场景识别逻辑（检测用户意图 + git 状态 → 判断场景 1/2/3）
- `requirement_name` 确定规则（优先用户指定 → git 分支名 → 用户意图提取 → kebab-case）
- 协调模式检测（writing-plans / executing-plans+TDD / 独立调用 三种模式）

- [ ] **Step 2: 补充 SKILL.md — 三种场景流程编排**

在 SKILL.md 中续写三种场景的流程编排：
```
场景1: hills-unit-test / hills-e2e-test → hills-test-quality → hills-test-run → hills-test-verify
场景2: hills-test-impact → hills-unit-test / hills-e2e-test → hills-test-quality → hills-test-run
场景3: hills-unit-test / hills-e2e-test → hills-test-quality → （写实现）→ hills-test-run → hills-test-verify
```
包含每种场景的触发条件和 skill 调用顺序的详细说明。

- [ ] **Step 3: 补充 SKILL.md — 子 Agent 职责隔离铁律**

在 SKILL.md 中续写：
- 完整的角色定义表（6 种角色 + 职责 + 禁止事项）
- 各 skill 的子 Agent 分配图
- 修复流程中的角色切换规则
- 重新审查必须使用新子 Agent

- [ ] **Step 4: 补充 SKILL.md — 管道失败/重试 + Superpowers 集成**

在 SKILL.md 中续写：
- 各 skill 失败时的处理规则（降级/停止/回退/重试）
- 整体重试上限 5 轮
- Superpowers 调用时机映射表（6 行）
- 三层感知机制说明

参考设计 spec 全文。

- [ ] **Step 5: 验证 skill 加载**

Run: `/hills-test`
Expected: skill 被正确加载，能识别场景

- [ ] **Step 6: Commit**

```bash
git add ~/.claude/skills/hills-test/
git commit -m "feat: add hills-test entry skill for test orchestration"
```

---

## Task 8: 更新 CLAUDE.md（桥接指令）

**依赖：** Task 7（所有 skills 就位后）
**Files:**
- Modify: `/home/hills/projects/cc2im/CLAUDE.md`

- [ ] **Step 1: 备份现有 CLAUDE.md 测试指令**

在 CLAUDE.md 中将现有测试指令用 HTML 注释包裹保留，以备 Task 9 集成测试失败时回退：
```markdown
<!-- DEPRECATED: 旧测试工作流指令，Task 9 通过后在 Task 10 中删除
1. Generate/update test case checklists first...
...
-->
```

- [ ] **Step 2: 新增 hills-test 系列集成规则**

在 CLAUDE.md 中添加新的 hills-test 系列集成规则：

```markdown
# Project Rules

## Testing Requirements

When adding or modifying features, follow this workflow:

1. **Use hills-test for all test-related work:**
   - Invoke `hills-test` to analyze the scenario and generate a test plan
   - Follow the plan's skill assignments for each task

2. **Skill Integration: hills-test × superpowers**

| superpowers 步骤 | 必须调用的 hills-test skill |
|---|---|
| writing-plans 涉及测试任务 | `hills-test`（场景分析，生成带 skill 标注的测试任务） |
| executing-plans 开始实现前 | `hills-test-impact`（影响分析） |
| TDD 写测试步骤 | `hills-unit-test` / `hills-e2e-test` |
| TDD 跑测试步骤 | `hills-test-run` |
| 测试代码完成后 | `hills-test-quality` |
| verification-before-completion | `hills-test-run` + `hills-test-quality` + `hills-test-verify` |

3. **Sub-Agent Role Isolation (Iron Rule):**
   - Case analyst, test developer, business developer, quality reviewer, test runner, and walkthrough verifier MUST run in separate sub-agents
   - Never let the same agent write code and review it

4. **Ensure sufficient test coverage:**
   - Unit tests and E2E tests must adequately cover the new or modified functionality
   - All test documents go to `docs/hills-test/{requirement_name}/`
```

- [ ] **Step 3: 验证 CLAUDE.md 被正确加载**

Run: 开启新对话，检查 system-reminder 是否包含更新后的指令
Expected: 新的 hills-test 集成规则可见

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "feat: update CLAUDE.md with hills-test skill series integration rules"
```

---

## Task 9: 集成测试 — 端到端验证

**依赖：** Task 8（所有 skills + CLAUDE.md 就位后）

- [ ] **Step 1: 验证场景 1 — 新功能补测试**

在新对话中输入 `/hills-test`，描述要给 session.ts 补测试：
- 预期：识别为场景 1，生成 TodoWrite，按顺序调用 hills-unit-test → hills-test-quality → hills-test-run
- 验证子 Agent 隔离：用例分析师和测试开发者是不同的子 Agent

- [ ] **Step 2: 验证场景 2 — 回归测试**

修改 session.ts 后输入 `/hills-test`，描述要做回归测试：
- 预期：识别为场景 2，先调用 hills-test-impact 分析影响

- [ ] **Step 3: 验证 superpowers 集成**

通过 superpowers TDD 流程开发一个小功能：
- 预期：在"写测试"步骤自动调用 hills-unit-test

- [ ] **Step 4: Commit 验证结果**

如果有修复，提交修复。

```bash
git commit -m "fix: adjust hills-test skills based on integration testing"
```

---

## Task 10: 清理旧 Skills

**依赖：** Task 9（集成验证通过后）

- [ ] **Step 1: 确认旧 skills 不再被引用**

搜索项目中所有对旧 skill 名称的引用：
- `hills-unit-test-cases-generator`
- `hills-e2e-test-case-generator`
- `hills-e2e-test-code-quality`
- `hills-web-walkthrough`

- [ ] **Step 2: 删除 CLAUDE.md 中的旧指令注释**

移除 Task 8 Step 1 中用 HTML 注释保留的旧测试工作流指令。

- [ ] **Step 3: 删除旧 skill 目录**

```bash
rm -rf ~/.claude/skills/hills-unit-test-cases-generator/
rm -rf ~/.claude/skills/hills-e2e-test-case-generator/
rm -rf ~/.claude/skills/hills-e2e-test-code-quality/
rm -rf ~/.claude/skills/hills-web-walkthrough/
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "chore: remove deprecated test skills and old CLAUDE.md instructions"
```

---

## Parallelization Map

```
Task 1 (impact)     ─┐
Task 2 (unit-test)   ├─ 可全部并行（独立 skills，无依赖）
Task 3 (e2e-test)    │
Task 4 (quality)     │
Task 5 (run)         │
Task 6 (verify)     ─┘
         │
         ▼
Task 7 (总入口)      ─── 依赖 Task 1-6
         │
         ▼
Task 8 (CLAUDE.md)   ─── 依赖 Task 7
         │
         ▼
Task 9 (集成测试)    ─── 依赖 Task 8
         │
         ▼
Task 10 (清理旧 skills) ─ 依赖 Task 9
```

**最大并行度：Task 1-6 同时执行（6 个子 Agent 并行）**
