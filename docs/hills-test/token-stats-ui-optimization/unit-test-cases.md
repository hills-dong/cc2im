# Unit Test Cases: getOverviewTokens(since)

> Requirement: `token-stats-ui-optimization`
> Target: `Store.getOverviewTokens(since: string | null): OverviewTokenRow[]`
> Scene: TDD Scene 3 (method does not exist yet)
> Generated: 2026-03-18

## Public API

| 文件路径 | 函数签名 |
|---------|---------|
| `packages/core/src/store.ts` | `getOverviewTokens(since: string \| null): OverviewTokenRow[]` |

### OverviewTokenRow Interface (from spec)

```typescript
interface OverviewTokenRow {
  projectName: string;
  sessionId: string;
  platform: string | null;
  sessionName: string | null;
  sessionCreatedAt: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}
```

## Unit Test Case Table

| 文件路径 | 函数名 | 测试用例名 | 用例类型 | 测试数据构造 | 通过条件 | 已覆盖 |
|---------|--------|-----------|---------|-------------|---------|-------|
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | since=null 时返回所有 token_usage 记录的聚合 | 功能正确性 | 插入 3 条 token_usage（2 个 session, 2 个 project），since=null 调用 | 返回 2 行，各行 token 值正确聚合 | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | since 指定时间后仅返回该时间之后的记录 | 功能正确性 | 手动插入 created_at 分别为 "2026-03-17T00:00:00" 和 "2026-03-18T12:00:00" 的记录，since="2026-03-18T00:00:00" | 仅返回 3-18 的记录，3-17 的被过滤 | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | 同一 session 多条 token_usage 正确聚合求和 | 功能正确性 | 同一 session_id + project_name 插入 3 条记录 | 返回 1 行，inputTokens/outputTokens/cacheReadTokens/cacheCreationTokens 均为 3 条之和 | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | 按 project_name 分组，不同 project 的 session 不混淆 | 功能正确性 | session-1 属于 proj-a，session-2 属于 proj-b，各插入 token_usage | 返回 2 行，projectName 分别为 proj-a 和 proj-b | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | 同一 project 下多个 session 按 token 总量降序排列 | 排序 | proj-a 下 session-1(input=100,output=50)、session-2(input=500,output=200) | session-2 排在 session-1 前面（SUM(input+output) 降序） | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | 不同 project 按 project_name 排序 | 排序 | 插入 project "beta" 和 "alpha" 的记录 | 返回行按 project_name 升序排列（alpha 在 beta 前） | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | LEFT JOIN threads：有对应 thread 时返回 platform/sessionName/sessionCreatedAt | JOIN 正确性 | 先 upsertThread 创建 thread（带 platform、name），再插入 token_usage 使用同一 session_id | 返回行中 platform、sessionName、sessionCreatedAt 非 null | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | LEFT JOIN threads：无对应 thread 时 platform/sessionName/sessionCreatedAt 为 null | JOIN 正确性 | 仅插入 token_usage，不创建 thread | 返回行中 platform=null, sessionName=null, sessionCreatedAt=null | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | threads 子查询去重：同一 session_id 有多个 thread 时不导致 token 重复计数 | JOIN 去重 | upsertThread 为同一 session_id 创建 2 个 thread（不同 thread_id + platform），插入 1 条 token_usage(input=100) | 返回 1 行，inputTokens=100（不因 JOIN 翻倍为 200） | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | 空数据库返回空数组 | 边界值 | 不插入任何数据 | 返回 `[]`（空数组） | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | since 精确等于 created_at 的记录应被包含（>=） | 边界值 | 插入 created_at="2026-03-18T10:00:00" 的记录，since="2026-03-18T10:00:00" | 返回 1 行（>= 语义包含等于） | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | since 晚于所有记录时返回空数组 | 边界值 | 插入 created_at="2026-03-17T00:00:00"，since="2026-03-19T00:00:00" | 返回 `[]` | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | 所有 token 字段为 0 时 COALESCE 返回 0 | 边界值 | 插入 token_usage 全字段为 0 | 返回 1 行，所有 token 字段均为 0 | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | 返回值字段名与 OverviewTokenRow 接口一致 | 返回值语义 | 插入 1 条 token_usage + 对应 thread | 返回对象包含 projectName, sessionId, platform, sessionName, sessionCreatedAt, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens 这 9 个字段 | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | token 字段类型为 number 非 string | 返回值语义 | 插入 1 条 token_usage | `typeof row.inputTokens === 'number'` 且其它 token 字段同理 | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | 大量数据：多 project 多 session 综合聚合正确 | 功能正确性 | 3 个 project，每个 2 个 session，每个 session 3 条 token_usage | 返回 6 行，各行聚合值正确，按 project_name 和 token 总量排序 | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | 同一 session 跨多个 project 时分别聚合 | 功能正确性 | 同一 session_id 的 token_usage 记录分属 proj-a 和 proj-b | 返回 2 行（同一 sessionId 出现在不同 projectName 下） | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | threads 子查询 MIN 选择：多 thread 时取 MIN(platform)、MIN(name)、MIN(created_at) | JOIN 去重 | session-1 有 2 个 thread：(platform="discord",name="chat-b")、(platform="web",name="chat-a") | 返回行 platform="discord"（MIN），sessionName="chat-a"（MIN） | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | 调用多次结果一致（幂等性） | 幂等性 | 插入固定数据 | 连续调用 2 次 getOverviewTokens(null)，结果深等 | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | 不修改数据库（无副作用） | 副作用 | 插入数据，调用 getOverviewTokens，再查 token_usage 行数 | 调用前后 token_usage 行数一致 | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | saveTokenUsage 写入后立即可被 getOverviewTokens 读取 | 跨函数交互 | saveTokenUsage 写入 1 条，立即 getOverviewTokens(null) | 返回包含该条数据 | N |
| `packages/core/tests/store-tokens.test.ts` | `getOverviewTokens` | upsertThread 更新 session_id 后 JOIN 使用新 session_id | 跨函数交互 | upsertThread 创建 thread(session_id=s1)，再 upsertThread 同一 thread 更新 session_id=s2，插入 token_usage(session_id=s2) | getOverviewTokens 返回行的 platform 来自更新后的 thread | N |

## Analysis Dimensions Coverage

| 维度 | 覆盖用例数 | 说明 |
|-----|----------|------|
| 功能正确性 | 5 | 基本聚合、多 project、多 session、跨 project session、综合场景 |
| 边界值 | 4 | 空数据、since 边界相等、since 超出范围、全零 token |
| 排序 | 2 | session 按 token 总量降序、project 按名称排序 |
| JOIN 正确性 | 2 | 有 thread / 无 thread 的 LEFT JOIN 行为 |
| JOIN 去重 | 2 | 多 thread 不导致 token 翻倍、MIN 选择策略 |
| 返回值语义 | 2 | 字段名一致性、字段类型为 number |
| 幂等性 | 1 | 多次调用结果一致 |
| 副作用 | 1 | 只读不写 |
| 跨函数交互 | 2 | 与 saveTokenUsage、upsertThread 的协作 |
| 错误处理 | 0 | 该方法为纯查询，输入仅 string\|null，SQLite prepared statement 无需额外错误场景 |
| 安全 | 0 | 使用 prepared statement 参数绑定，无 SQL 注入风险，无需额外用例 |
| 并发 | 0 | SQLite WAL 模式下单进程读查询无并发冲突，不作为单元测试范围 |
| 向后兼容 | 0 | 新增方法，无向后兼容问题 |
