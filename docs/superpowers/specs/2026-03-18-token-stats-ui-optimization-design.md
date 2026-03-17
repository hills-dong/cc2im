# Token Statistics UI Optimization Design

## Overview

优化 Stats 页面，支持按时间窗口查看全部/各项目/各 Session 的 token 消耗，突出 Input/Output，弱化 Cache。

## API 设计

### 新增端点：`GET /api/stats/overview`

**查询参数：**
- `window`: `24h` | `7d` | `all`（必填）

**响应结构：**

```typescript
interface TokenTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
}

interface SessionOverview {
  sessionId: string;
  platform: string | null;   // "discord" | "lark" | "web"
  name: string | null;
  createdAt: string | null;
  total: TokenTotals;
}

interface ProjectOverview {
  name: string;
  total: TokenTotals;
  sessions: SessionOverview[];
}

interface OverviewResponse {
  window: "24h" | "7d" | "all";
  total: TokenTotals;
  projects: ProjectOverview[];
}
```

**时间窗口计算：**
- `24h` → `since = now - 24 hours`
- `7d` → `since = now - 7 days`
- `all` → 无时间过滤
- 不合法的 `window` 值返回 400 错误

**空数据处理：**
- 无数据时汇总卡片显示 0，项目列表显示空状态提示文字

## 数据库改动

### Store 新增方法

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

getOverviewTokens(since: string | null): OverviewTokenRow[]
```

### SQL 查询

```sql
SELECT
  tu.project_name AS projectName,
  tu.session_id AS sessionId,
  ts.platform,
  ts.sessionName,
  ts.sessionCreatedAt,
  COALESCE(SUM(tu.input_tokens), 0) AS inputTokens,
  COALESCE(SUM(tu.output_tokens), 0) AS outputTokens,
  COALESCE(SUM(tu.cache_read_tokens), 0) AS cacheReadTokens,
  COALESCE(SUM(tu.cache_creation_tokens), 0) AS cacheCreationTokens
FROM token_usage tu
LEFT JOIN (
  SELECT session_id,
         MIN(platform) AS platform,
         MIN(name) AS sessionName,
         MIN(created_at) AS sessionCreatedAt
  FROM threads
  GROUP BY session_id
) ts ON ts.session_id = tu.session_id
WHERE (:since IS NULL OR tu.created_at >= :since)
GROUP BY tu.project_name, tu.session_id
ORDER BY tu.project_name, SUM(tu.input_tokens + tu.output_tokens) DESC
```

- 子查询先对 `threads` 按 `session_id` 去重（取 MIN），避免 JOIN 导致 token 重复计数
- 按 `project_name` + `session_id` 分组聚合
- Session 按 token 总量降序（消耗大的排前面）
- Projects 也按总 token 降序排列
- API 层将扁平行组装为嵌套 `projects → sessions` 结构
- `since` 参数格式：ISO 8601（`YYYY-MM-DDTHH:MM:SS`），兼容 SQLite datetime 比较

### 参数校验

- `window` 参数不合法时返回 400 错误：`{ error: { code: "VALIDATION_ERROR", message: "window must be 24h, 7d, or all" } }`

### 聚合逻辑

- API 层遍历 SQL 返回的扁平行，按 `projectName` 分组构建 `projects` 数组
- `OverviewResponse.total` 和 `ProjectOverview.total` 由 API 层对行数据求和计算
- 空数据时返回 `{ window, total: { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 }, projects: [] }`

## 前端 UI 设计

### 页面布局

```
┌──────────────────────────────────────────────────────┐
│  Token Statistics                                     │
│                                                       │
│  [ 最近 24h ]  [ 最近 7天 ]  [ 全部 ]                   │
│                                                       │
│  ┌─────────────┬─────────────┬─────────────────────┐  │
│  │   Input     │   Output    │  Cache (read/create) │  │
│  │   12.3K     │   8.1K      │  45.2K / 2.1K       │  │
│  └─────────────┴─────────────┴─────────────────────┘  │
│                                                       │
│  ▼ cc2im  (in: 8K / out: 5K)                          │
│  ┌──────────────────────────────────────────────┐     │
│  │ Platform │ Session     │ Time  │  In  │  Out  │     │
│  │──────────┼─────────────┼───────┼──────┼───────│     │
│  │ 🟢 Web   │ session-abc │ 14:22 │  3K  │  2K   │     │
│  │ 🟣 Discord│session-def │ 10:05 │  5K  │  3K   │     │
│  └──────────────────────────────────────────────┘     │
│                                                       │
│  ▶ another-project  (in: 4K / out: 3K)                │
└──────────────────────────────────────────────────────┘
```

### 交互行为

- **时间窗口**：3 个按钮组（Tab 样式），点击切换重新请求 API
- **汇总卡片**：Input 和 Output 大卡片突出显示，Cache 合并为一个小卡片（read / create 斜杠分隔）
- **项目卡片**：默认折叠，显示项目名 + in/out 汇总，点击展开 Session 表格
- **Session 表格**：5 列 — Platform（图标）、Session（名称）、Time（创建时间）、In、Out

### 平台图标

- 🟣 Discord
- 🔵 Lark
- 🟢 Web

## 改动文件清单

| 文件 | 改动内容 |
|------|---------|
| `packages/core/src/store.ts` | 新增 `OverviewTokenRow` 接口 + `getOverviewTokens(since)` 方法 |
| `packages/server/src/api.ts` | 新增 `GET /api/stats/overview?window=` 路由，组装嵌套响应 |
| `packages/server/src/contracts/api.ts` | 新增 `OverviewResponse` 等类型定义 |
| `packages/ui/src/lib/Stats.svelte` | 重写：时间窗口切换 + 汇总卡片 + 项目折叠/Session 表格 |

### 删除的功能

- Stats.svelte 中的柱状图（SVG Bar Chart）
- Stats.svelte 中的每日明细表
- 项目下拉框选择器

### 保留不动

- `store.ts` 中 `getSessionTokens`、`getProjectTokens`、`getDailyTokens`（Chat 页面仍在使用）
- `api.ts` 中 `/api/stats/tokens` 端点
