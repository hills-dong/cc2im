# hills-test Skill 系列设计

## 概述

将现有 4 个散装测试 skills 重组并补充，形成一个完整的测试闭环系列。采用三层架构（入口层 → 分析/生成层 → 验证层），支持三种入口场景（新功能补测试、回归测试、TDD 先行），与 superpowers 流程无缝集成。

## 架构

### 三层架构

```
┌──────────────────────────────────────────────────┐
│  入口层                                           │
│  hills-test              总入口，场景识别 + 调度    │
├──────────────────────────────────────────────────┤
│  分析层                                           │
│  hills-test-impact       git diff + 依赖图分析     │
├──────────────────────────────────────────────────┤
│  生成层（按类型分）                                 │
│  hills-unit-test         单测：用例生成 + 代码生成   │
│  hills-e2e-test          E2E：用例生成 + 代码生成   │
├──────────────────────────────────────────────────┤
│  验证层（共享）                                     │
│  hills-test-quality      测试代码质量审查            │
│  hills-test-run          运行测试 + 结果分析         │
│  hills-test-verify       走查验收（Web UI）         │
└──────────────────────────────────────────────────┘
```

### 与现有 Skills 的映射

| 现有 skill | → 新 skill | 变化 |
|---|---|---|
| `hills-unit-test-cases-generator` | `hills-unit-test` | 扩展：加入代码生成能力 |
| `hills-e2e-test-case-generator` | `hills-e2e-test` | 扩展：加入代码生成能力 |
| `hills-e2e-test-code-quality` | `hills-test-quality` | 扩展：覆盖单测质量审查 |
| `hills-web-walkthrough` | `hills-test-verify` | 改名，逻辑基本不变 |
| （新增） | `hills-test` | 总入口/路由器 |
| （新增） | `hills-test-impact` | 变更影响分析 |
| （新增） | `hills-test-run` | 运行 + 结果分析 |

### 三种入口场景

```
场景1: 新功能/修 bug（补测试）
hills-test → hills-unit-test / hills-e2e-test → hills-test-quality → hills-test-run → hills-test-verify

场景2: 回归测试（代码改了，确认影响）
hills-test → hills-test-impact → hills-unit-test / hills-e2e-test（更新受影响的测试）→ hills-test-quality → hills-test-run

场景3: TDD 先行（从零开始）
hills-test → hills-unit-test / hills-e2e-test → hills-test-quality → （写实现代码）→ hills-test-run → hills-test-verify
```

## 与 Superpowers 的集成

### 核心原则

hills-test 是 superpowers 的"测试领域适配器"：
- **专注做 superpowers 做不了的测试领域逻辑**
- 编排能力按场景复用 superpowers 或自管
- 不重复实现任务拆分、并行调度等能力

### 两种运行模式

**模式 1：嵌入 superpowers（被动）**
- writing-plans 已经规划好了 → hills-test 只做场景分析补充 skill 标注
- executing-plans 按计划执行 → 各 hills-test-* skill 被逐个调用
- TodoWrite 由 executing-plans 管理
- 不创建自己的 TodoWrite，不派子 Agent

**模式 2：独立调用（主动）**
- hills-test 自己做场景分析 + 生成 TodoWrite
- 直接调度下游 skills，不经过 writing-plans
- 相当于一个轻量版的"测试专用 executing-plans"

### Superpowers 流程中的调用时机

| superpowers 步骤 | 必须调用的 hills-test skill |
|---|---|
| writing-plans 涉及测试任务 | `hills-test`（场景分析，生成带 skill 标注的测试任务） |
| executing-plans 开始实现前 | `hills-test-impact`（影响分析） |
| TDD 写测试步骤 | `hills-unit-test` / `hills-e2e-test` |
| TDD 跑测试步骤 | `hills-test-run` |
| 测试代码完成后 | `hills-test-quality` |
| verification-before-completion | `hills-test-run` + `hills-test-quality` + `hills-test-verify` |

### 计划阶段的 Skill 标注

writing-plans 输出的 plan 文档中，测试相关任务显式标注使用的 skills：

```markdown
## Step N: 单元测试 — session 模块
**Skills:** `hills-unit-test` → `hills-test-quality` → `hills-test-run`
- 生成 session.ts 单元测试用例清单
- 基于清单生成测试代码
- 质量审查 + 运行验证
```

TodoWrite 任务列表中同样体现 skill 名称：

```
☐ hills-unit-test → 生成用例清单 + 测试代码
☐ hills-test-quality → 质量审查
☐ hills-test-run → 运行验证
```

### 三层感知机制

1. **Skill 描述触发** — 每个 hills-test skill 的 description 字段精准对接 superpowers 步骤
2. **CLAUDE.md 桥接指令** — 强制规则，superpowers 走到对应步骤必须调用对应 skill
3. **Skill 内部上下文检测** — 检测是否在 superpowers 流程中，自动切换精简/完整模式

## 子 Agent 职责隔离（铁律）

### 核心原则

不同职责的工作 **必须由独立的子 Agent 执行**，严禁同一个 Agent 身兼多职。这是为了确保每个角色严守自己的职业操守，互相制衡，不容冒犯。

### 角色定义与隔离规则

| 角色 | 职责 | 禁止做的事 |
|---|---|---|
| **用例分析师** | 分析源码，生成测试用例清单 | 禁止写测试代码、禁止写业务代码 |
| **测试开发者** | 根据用例清单编写测试代码 | 禁止修改用例清单、禁止写业务代码 |
| **业务开发者** | 编写/修改业务实现代码 | 禁止修改测试代码、禁止修改用例清单 |
| **质量审查员** | 审查测试代码质量，检测假阳性 | 禁止修改任何代码，只输出审查报告 |
| **测试执行员** | 运行测试，分析结果 | 禁止修改代码，只输出运行报告 |
| **走查验收员** | UI 走查，截图验证 | 禁止修改代码，只输出走查报告 |

### 为什么必须隔离

```
❌ 反模式：同一个 Agent 写测试 + 审查测试
  → "自己写的代码自己审查" = 球员兼裁判
  → 倾向于认为自己写的代码没问题，审查流于形式

❌ 反模式：同一个 Agent 写业务代码 + 写测试代码
  → 对实现细节的了解会污染测试设计
  → 测试会不自觉地绕开实现中的 bug

❌ 反模式：同一个 Agent 生成用例清单 + 写测试代码
  → 用例清单会被测试代码的实现难度影响
  → 难写的用例容易被"优化"掉

✅ 正确模式：每个角色独立子 Agent
  → 用例分析师：只关心"应该测什么"，不受实现约束
  → 测试开发者：只关心"按清单写代码"，不能改清单
  → 质量审查员：独立视角，冷眼审查，只读不写
  → 业务开发者：不碰测试，专注实现
```

### 各 Skill 的子 Agent 分配

```
hills-test（总入口）
  → 主 Agent 编排，不执行具体工作

hills-test-impact
  → 影响分析 Agent（独立）

hills-unit-test
  ├─ 子 Agent A：用例分析师 → 输出用例清单
  └─ 子 Agent B：测试开发者 → 读取清单，输出测试代码

hills-e2e-test
  ├─ 子 Agent A：用例分析师 → 输出用例清单
  └─ 子 Agent B：测试开发者 → 读取清单，输出测试代码

hills-test-quality
  → 子 Agent：质量审查员（只读，不修改任何代码）
  → 发现问题时输出报告，由编排层决定回退给哪个角色修复

hills-test-run
  → 子 Agent：测试执行员（只跑测试，不改代码）

hills-test-verify
  → 子 Agent：走查验收员（只截图验证，不改代码）
```

### 修复流程中的角色切换

当质量审查或运行发现问题需要修复时：

```
hills-test-quality 发现问题
  → 审查员输出报告（指出问题位置和原因）
  → 编排层（hills-test）将报告交给对应角色：
    测试代码问题 → 新的测试开发者 Agent 修复
    用例缺失 → 新的用例分析师 Agent 补充
  → 修复后由新的审查员 Agent 重新审查（不能是同一个）

hills-test-run 发现失败
  → 执行员输出报告
  → 编排层将报告交给对应角色：
    真 bug → 业务开发者 Agent 修复实现
    测试缺陷 → 测试开发者 Agent 修复测试
```

**重新审查时必须使用新的子 Agent**，确保不带上次审查的"惯性思维"。

## 各 Skill 详细设计

### 1. hills-test（总入口 / 测试计划生成器）

**定位：** 不执行任何测试工作，只做场景识别 + 生成带 skill 标注的测试计划

```yaml
description: >
  Use when any test-related work is needed — new feature testing,
  regression testing, TDD setup, or when writing-plans encounters
  test tasks. Generates a test plan with explicit hills-test skill
  assignments for each task.
```

**核心流程：**

```
输入：用户意图 + 当前代码状态
  │
  ├─ 1. 场景识别
  │   ├─ 新功能/修 bug？ → 需要哪些模块的单测/E2E
  │   ├─ 回归测试？     → 调用 hills-test-impact 分析影响
  │   └─ TDD 先行？     → 确定目标模块
  │
  ├─ 2. 确定测试范围
  │   ├─ 哪些文件/模块需要单测
  │   ├─ 哪些功能需要 E2E
  │   └─ 是否需要走查验收
  │
  ├─ 3. 生成测试计划（带 skill 标注）
  │   └─ 输出结构化的任务列表
  │
  └─ 4. 交付
      ├─ 如果在 writing-plans 中 → 写入 plan 文档
      └─ 如果独立调用 → 创建 TodoWrite 并开始执行
```

**协调模式检测：**
- 在 writing-plans 中 → 只输出计划文本，不创建 TodoWrite
- 在 executing-plans / TDD 中 → 精简模式，按当前步骤只调用对应 skill
- 独立调用 → 完整模式，自建 TodoWrite 并按计划顺序执行

### 2. hills-test-impact（变更影响分析）

**定位：** 分析代码变更的影响范围，输出需要测试的模块列表 + 建议的测试类型

```yaml
description: >
  Use when code has been modified and you need to determine which
  tests are affected — regression testing, refactoring, or before
  running tests to narrow scope. Analyzes git diff + import
  dependency graph.
```

**核心流程：**

```
输入：git diff（或指定 commit 范围）
  │
  ├─ 1. 变更文件收集
  │   └─ git diff --name-only → 变更文件列表
  │
  ├─ 2. 依赖图扩展
  │   └─ 对每个变更文件，追踪所有 import 它的上游文件
  │       → 扩展出完整影响面
  │
  ├─ 3. 测试文件映射
  │   ├─ 影响面中的文件 → 对应的 .test.ts / .spec.ts
  │   ├─ 标记：已有测试 / 缺失测试
  │   └─ 标记：测试用例清单是否需要更新
  │
  └─ 4. 输出影响报告
      ├─ 受影响模块列表
      ├─ 建议测试类型（单测 / E2E / 都要）
      ├─ 建议调用的 skills
      └─ 风险等级（高：核心模块 / 低：边缘改动）
```

**输出示例：**

```markdown
## 变更影响分析

### 变更文件
- `packages/core/src/session.ts`（直接修改）

### 影响扩展（依赖图）
- `packages/core/src/client.ts` → import session
- `packages/core/src/reconnect.ts` → import session
- `packages/web/src/hooks/useSession.ts` → import session

### 测试状态
| 文件 | 已有单测 | 已有 E2E | 用例清单需更新 |
|---|---|---|---|
| session.ts | ✅ | ❌ | ⚠️ 是 |
| client.ts | ✅ | ✅ | ❌ |
| reconnect.ts | ❌ | ✅ | ⚠️ 是 |
| useSession.ts | ❌ | ❌ | ⚠️ 是 |

### 建议
- 🔴 高优：session.ts 单测用例清单需更新 → `hills-unit-test`
- 🟡 中优：reconnect.ts 缺单测 → `hills-unit-test`
- 🟡 中优：useSession.ts 缺单测+E2E → `hills-unit-test` + `hills-e2e-test`
- 🟢 低优：client.ts 已有完整测试，回归跑一遍即可 → `hills-test-run`
```

### 3. hills-unit-test（单元测试生成）

**定位：** 合并现有 `hills-unit-test-cases-generator` 的用例生成能力 + 新增测试代码生成能力

```yaml
description: >
  Use when unit tests need to be created or updated for any source
  file — including TDD's "write test" step, executing-plans test
  tasks, or standalone test generation. Generates test case
  checklist first, then test code.
```

**核心流程：**

```
输入：目标源文件 + 可选的 hills-test-impact 影响报告
  │
  ├─ 阶段 1：用例生成（继承现有 hills-unit-test-cases-generator）
  │   ├─ 分析源码：函数签名、分支、边界、依赖
  │   ├─ 12 维度分析：功能正确性、边界值、错误处理、依赖失败、
  │   │   返回语义、状态/生命周期、副作用、幂等性、跨函数交互、
  │   │   安全性、并发、向后兼容
  │   └─ 输出用例清单
  │
  ├─ 阶段 2：代码生成（新增）
  │   ├─ 读取用例清单
  │   ├─ 读取项目现有测试的风格（框架、断言库、mock 方式）
  │   ├─ 按用例清单逐条生成测试代码
  │   └─ 输出 .test.ts / .spec.ts 文件
  │
  └─ 协调模式检测
      ├─ 在 superpowers 流程中（TDD / executing-plans）→ 只执行，不调下游 skills
      └─ 独立调用 → 自动链式调用 hills-test-quality
```

**代码生成规则：**
1. 风格跟随：分析项目已有测试文件，匹配框架（vitest/jest）、断言风格（expect/assert）、mock 方式（vi.mock/jest.mock）
2. 一条用例一个 test：用例清单中每行对应一个 test() 块
3. 测试命名：来自用例清单的描述，不自行编造
4. 不生成空壳测试：每个 test 必须有真实断言，不允许 test.todo() 或注释占位
5. 清单覆盖率 100%：清单中标记 Y 的用例全部生成代码，不允许跳过

### 4. hills-e2e-test（E2E 测试生成）

**定位：** 合并现有 `hills-e2e-test-case-generator` 的用例生成能力 + 新增 E2E 测试代码生成能力

```yaml
description: >
  Use when E2E tests need to be created or updated for Web UI or
  CLI features — including after implementation, executing-plans
  test tasks, or standalone E2E test generation. Generates test
  case checklist first, then Playwright/test code.
```

**核心流程：**

```
输入：目标功能/页面 + 可选的 hills-test-impact 影响报告
  │
  ├─ 阶段 1：用例生成（继承现有 hills-e2e-test-case-generator）
  │   ├─ 区分 Web UI / CLI 两种模式
  │   ├─ Web 维度：UI、UX、功能、实时性、状态持久化、数据准确性、错误处理
  │   ├─ CLI 维度：输入验证、输出验证、副作用验证、错误处理
  │   ├─ 用户旅程（跨模块端到端场景）
  │   └─ 输出用例清单
  │
  ├─ 阶段 2：代码生成（新增）
  │   ├─ 读取用例清单
  │   ├─ 读取项目现有 E2E 测试风格（Playwright 配置、页面对象模式、选择器策略）
  │   ├─ 按用例清单生成 .spec.ts 文件
  │   └─ 包含 Docker 环境隔离配置（如项目需要）
  │
  └─ 协调模式检测
      ├─ 在 superpowers 流程中（TDD / executing-plans）→ 只执行，不调下游
      └─ 独立调用 → 自动链式调用 hills-test-quality
```

**E2E 代码生成规则：**
1. 风格跟随：匹配项目现有 Playwright 配置和页面对象模式
2. 一条用例一个 test：用例清单每行对应一个 test() 块
3. 防假阳性（内置 8 大致命模式检测）：禁止 if-guard 静默跳过、catch 吞异常、always-true 断言、弱析取断言、缺失断言的 test 块、catch-false、断言与描述不匹配、已知 bug workaround
4. 等待策略：使用 condition-based waiting，禁止硬编码 sleep
5. 清单覆盖率 100%：清单中标记 Y 的用例全部生成代码

**与 hills-unit-test 的差异：**

| | hills-unit-test | hills-e2e-test |
|---|---|---|
| 输入 | 源文件（函数级） | 功能/页面（用户级） |
| 分析维度 | 12 维度（边界、依赖...） | 7 维度（UI、UX、持久化...） |
| 输出 | .test.ts（vitest/jest） | .spec.ts（Playwright） |
| 额外 | — | 用户旅程、Docker 隔离 |
| 防假阳性 | 基础检测 | 8 大致命模式 |

### 5. hills-test-quality（测试质量审查）

**定位：** 扩展现有 `hills-e2e-test-code-quality`，覆盖单测 + E2E 两种测试代码的质量审查

```yaml
description: >
  Use after test code has been written or modified — reviews both
  unit tests and E2E tests for false positives, weak assertions,
  and quality issues. Must pass before running tests.
```

**核心流程：**

```
输入：测试代码文件 + 对应的用例清单
  │
  ├─ 1. 清单对照检查
  │   ├─ 用例清单中标记 Y 的 → 是否都有对应 test 块
  │   ├─ 测试代码中的 test → 是否都能映射回清单
  │   └─ 输出：覆盖率缺口列表
  │
  ├─ 2. 假阳性检测（继承现有 8 大致命模式）
  │   ├─ if-guard 静默跳过
  │   ├─ catch 吞异常后 silent return
  │   ├─ always-true 断言
  │   ├─ 弱析取断言（A || B || C → 永远过）
  │   ├─ 断言与测试描述不匹配
  │   ├─ 已知 bug workaround
  │   ├─ 缺失断言的 test 块
  │   └─ catch-false（catch 里断言 false 但不会走到）
  │
  ├─ 3. 单测专项检查（新增）
  │   ├─ mock 是否过度（mock 了被测对象本身）
  │   ├─ 断言粒度（只断言了返回值，没断言副作用）
  │   └─ 测试隔离性（test 之间是否共享可变状态）
  │
  ├─ 4. 质量评分
  │   ├─ 🔴 阻断：有致命模式 → 必须修复才能继续
  │   ├─ 🟡 警告：有潜在问题 → 建议修复
  │   └─ 🟢 通过：可以进入 hills-test-run
  │
  └─ 协调模式
      ├─ 被 hills-unit-test / hills-e2e-test 链式调用 → 审查后返回结果
      └─ 独立调用 → 审查指定的测试文件
```

### 6. hills-test-run（运行测试 + 结果分析）

**定位：** 运行测试并智能分析失败原因，给出下一步建议

```yaml
description: >
  Use when tests need to be executed and results analyzed — TDD
  red/green steps, regression verification, or final validation
  before completion. Runs tests, classifies failures, and
  recommends next action.
```

**核心流程：**

```
输入：测试范围（全量 / 指定文件 / 受影响范围）
  │
  ├─ 1. 确定运行策略
  │   ├─ 有 hills-test-impact 报告 → 只跑受影响的测试
  │   ├─ TDD Red 阶段 → 只跑当前新写的测试
  │   ├─ TDD Green 阶段 → 跑当前测试 + 回归
  │   └─ 最终验证 → 全量运行
  │
  ├─ 2. 执行测试
  │   ├─ 单测和 E2E 可并行（用 parallel agents）
  │   ├─ 捕获完整输出（stdout + stderr）
  │   └─ 记录运行时间
  │
  ├─ 3. 结果分析（核心价值）
  │   ├─ 全部通过 → 🟢 报告通过，建议下一步
  │   └─ 有失败 → 对每个失败分类：
  │       ├─ 🔴 真 bug：断言失败 + 实现逻辑有问题 → 建议修复实现代码
  │       ├─ 🟡 测试缺陷：测试本身写错了 → 建议回到生成层修复
  │       ├─ 🟠 环境问题：超时、端口占用、Docker 未启动 → 建议修复环境后重跑
  │       └─ ⚪ TDD 预期失败（Red 阶段）：正常，继续写实现
  │
  └─ 4. 输出运行报告
```

**Docker 测试环境：**

```
运行测试前：
  │
  ├─ 1. 环境检测
  │   ├─ 项目是否有 docker-compose.test.yml
  │   ├─ 是否有 Dockerfile.test
  │   └─ 当前 Docker 服务状态
  │
  ├─ 2. 环境准备
  │   ├─ 启动测试专用容器（隔离于开发环境）
  │   ├─ 等待服务就绪（health check，不用 sleep）
  │   └─ 初始化测试数据（seed / migration）
  │
  ├─ 3. 运行测试
  │   ├─ 单测：直接在宿主机跑（不需要 Docker）
  │   └─ E2E：在 Docker 网络中跑，确保环境一致
  │
  └─ 4. 清理
      ├─ 测试完成后销毁容器
      ├─ 清理测试数据卷
      └─ 不影响开发环境的 Docker 容器
```

**Docker 测试规则：**

隔离：
1. 测试容器必须用独立的 compose project name → `docker compose -p cc2im-test` 避免与开发环境冲突
2. 测试数据库用独立实例，不共享开发数据库
3. 端口映射避免冲突：测试用不同端口段（如 4000+ 对应开发的 3000+）

等待策略：
4. 禁止 sleep 等待服务启动 → 用 health check + 轮询：`docker compose wait` 或 `wait-on http://localhost:4000/health`
5. 设置合理超时（30s），超时后报 🟠 环境问题

数据管理：
6. 每次测试前重置数据：truncate + seed，不依赖上次状态
7. 测试数据用 fixtures，不用生产数据快照
8. 数据卷用 tmpfs 或每次重建，不持久化

网络：
9. E2E 测试进程和被测服务在同一 Docker 网络中，避免 host 网络差异导致的 CI/本地不一致
10. 如果用 Playwright，浏览器也跑在容器中 → `mcr.microsoft.com/playwright` 官方镜像

失败处理：
11. 测试失败时自动收集容器日志 → `docker compose -p cc2im-test logs > docker.log`
12. 失败后不立即清理容器，保留现场供调试 → 通过参数控制：--keep-on-failure
13. CI 中始终清理，避免资源泄漏

性能：
14. 使用 Docker layer cache 加速构建
15. 并行跑单测和 E2E 时，各自用独立 compose project → `cc2im-test-unit` / `cc2im-test-e2e`

**Docker 环境失败细分：**

```
🟠 环境问题 — Docker 细分：
  ├─ 🟠-1 容器未启动：compose 文件缺失或 Docker daemon 未运行
  ├─ 🟠-2 服务未就绪：health check 超时，服务还在初始化
  ├─ 🟠-3 端口冲突：测试端口被开发环境占用
  ├─ 🟠-4 网络不通：容器间 DNS 解析失败
  └─ 🟠-5 数据问题：seed 失败或 migration 版本不匹配
```

### 7. hills-test-verify（走查验收）

**定位：** 继承现有 `hills-web-walkthrough`，验证层最后一关 — 抓测试覆盖不到的真实体验问题

```yaml
description: >
  Use after all tests pass and hills-test-quality approves — final
  visual verification of Web UI using Playwright screenshots.
  Catches issues that pass/fail tests miss: wrong data values,
  broken flows across refresh, missing UI elements.
```

**核心流程：**

```
输入：功能描述 + 测试通过的确认
  │
  ├─ 1. 确定走查范围
  │   ├─ 从 hills-test-impact 或用例清单中提取涉及的页面/功能
  │   └─ 制定走查路径（按用户旅程组织）
  │
  ├─ 2. 自动化走查（Playwright）
  │   ├─ 按路径逐步操作
  │   ├─ 每步截图（before / after）
  │   └─ 每步验证 6 个维度：
  │       ├─ 存在性：元素是否存在
  │       ├─ 内容：文本/数据是否正确
  │       ├─ 准确性：数值是否与后端一致
  │       ├─ 持久化：刷新后状态是否保留
  │       ├─ 响应性：操作后 UI 是否及时更新
  │       └─ 流程连续性：跨页面流程是否断裂
  │
  ├─ 3. 输出走查报告
  │   ├─ 截图路径（引用到报告中）
  │   ├─ 每步验证结果
  │   └─ 发现的问题列表
  │
  └─ 走查不通过时
      ├─ 分类问题（UI bug / 数据 bug / 状态 bug）
      └─ 建议回到哪个环节修复
```

**Docker 环境（走查专用）：**

```
走查前环境准备：
  │
  ├─ 1. docker compose -p cc2im-test-verify up -d
  │   └─ 独立 project name，不与 test-run 和开发环境冲突
  │
  ├─ 2. 全栈启动：前端 + 后端 + 数据库 + 依赖服务
  │
  ├─ 3. 等待全部服务就绪（health check，超时 60s）
  │
  ├─ 4. 初始化走查数据
  │   ├─ seed 真实场景数据（不是最小测试数据）
  │   └─ 模拟已有用户、历史消息等真实状态
  │
  ├─ 5. Playwright 浏览器在容器中（mcr.microsoft.com/playwright）
  │
  └─ 6. 走查完成后
      ├─ 通过 → 销毁容器
      └─ 发现问题 → 保留容器现场，日志导出
```

**与 hills-test-run 的 Docker 差异：**

| | hills-test-run | hills-test-verify |
|---|---|---|
| project name | `cc2im-test` | `cc2im-test-verify` |
| 数据 | 最小 fixtures，每次重置 | 真实场景 seed，模拟生产数据 |
| 服务范围 | 可按需只启动部分 | 必须全栈启动 |
| 浏览器 | 按需（E2E 才需要） | 必须（Playwright 截图） |
| 超时 | 30s | 60s |
| 失败后 | 按参数决定是否保留 | 默认保留现场 |

## 管道失败与重试逻辑

当 hills-test 流程中某个 skill 失败时，按以下规则处理：

```
hills-test-impact 失败：
  → 降级：跳过影响分析，改为全量测试
  → 记录警告到报告

hills-unit-test / hills-e2e-test 失败：
  → 停止：无法继续，报告错误原因
  → 不自动重试（生成失败通常是源码问题）

hills-test-quality 🔴 阻断：
  → 回退：自动回到对应的生成层（hills-unit-test / hills-e2e-test）修复
  → 修复后重新审查，最多循环 3 轮
  → 超过 3 轮仍不通过 → 停止，请求人工介入

hills-test-run 失败：
  → 按分类处理：
    🔴 真 bug → 停止，报告给开发者修复实现代码
    🟡 测试缺陷 → 回退到生成层修复测试代码，重新进入 quality → run
    🟠 环境问题 → 尝试重建 Docker 环境后重跑，最多 2 次
    ⚪ TDD Red → 正常，继续写实现

hills-test-verify 失败：
  → 停止：报告问题，建议回到哪个环节修复
  → 不自动重试（走查失败通常是实现问题）
```

**整体重试上限：** 单次需求的 quality → run 循环总计不超过 5 轮，超过则停止并请求人工介入。

## 文档产出

### 统一目录结构

所有文档统一存放在 `docs/hills-test/{requirement_name}/` 下：

```
docs/hills-test/{requirement_name}/
├── impact-analysis.md          ← 影响分析报告（多轮追加）
├── unit-test-cases.md          ← 单测用例清单（多轮更新）
├── e2e-test-cases.md           ← E2E 用例清单（多轮更新）
├── quality-review.md           ← 质量审查报告（多轮追加）
├── test-run.md                 ← 运行报告（多轮追加）
├── walkthrough.md              ← 走查报告（多轮追加，引用截图）
├── screenshots/                ← 走查截图目录
│   ├── round1-step1.png
│   ├── round1-step2.png
│   ├── round2-step1.png
│   └── ...
└── docker.log                  ← Docker 容器日志（多轮覆盖）
```

`requirement_name` 为每次需求的简写，如 `chat-reconnect`、`token-refresh` 等。
命名规则：由 `hills-test` 总入口在场景识别阶段确定，优先使用用户指定的名称；
若用户未指定，则从当前 git 分支名、plan 文档标题或用户意图中自动提取简写（kebab-case）。

### 多轮文档策略

| 文档类型 | 多轮策略 | 原因 |
|---|---|---|
| 影响分析报告 | **追加** — 每轮新增 `## Round N` 章节 | 每轮变更不同，保留历史对照 |
| 单测用例清单 | **更新** — 直接修改用例表格，标记变更 | 用例清单是"当前真相"，不需历史版本 |
| E2E 用例清单 | **更新** — 同上 | 同上 |
| 质量审查报告 | **追加** — 每轮新增 `## Round N` | 可以看到问题是否被修复 |
| 运行报告 | **追加** — 每轮新增 `## Round N` | 可以追踪 Red → Green 过程 |
| 走查报告 | **追加** — 每轮新增 `## Round N`，引用对应截图 | 对比修复前后 |
| 截图 | **按轮次前缀命名**，不覆盖 | 保留每轮截图供对比 |
| Docker 日志 | **覆盖** — 只保留最新一轮 | 历史日志无价值 |

### 按 Skill 的文档产出

| Skill | 产出文档 | 文件名 | 多轮策略 |
|---|---|---|---|
| `hills-test` | 测试计划 | 写入 `docs/superpowers/plans/` | 不变 |
| `hills-test-impact` | 影响分析报告 | `impact-analysis.md` | 追加 |
| `hills-unit-test` | 单测用例清单 | `unit-test-cases.md` | 更新 |
| `hills-unit-test` | 单测代码 | `__tests__/*.test.ts` | 更新 |
| `hills-e2e-test` | E2E 用例清单 | `e2e-test-cases.md` | 更新 |
| `hills-e2e-test` | E2E 测试代码 | `e2e/*.spec.ts` | 更新 |
| `hills-test-quality` | 质量审查报告 | `quality-review.md` | 追加 |
| `hills-test-run` | 运行报告 | `test-run.md` | 追加 |
| `hills-test-run` | Docker 日志 | `docker.log` | 覆盖 |
| `hills-test-verify` | 走查报告 | `walkthrough.md` | 追加 |
| `hills-test-verify` | 走查截图 | `screenshots/roundN-stepN.png` | 按轮次命名 |
