# packages/core/src 测试用例清单

> 生成日期: 2026-03-15
> 源目录: `packages/core/src/`
> 包含文件: config.ts, router.ts, formatter.ts, session.ts, store.ts, adapters/discord.ts

---

## Public API

### config.ts

| 函数 | 签名 |
|------|------|
| `loadConfig` | `(path: string) => AppConfig` |
| `saveConfig` | `(path: string, config: AppConfig) => void` |
| `addProject` | `(config: AppConfig, project: ProjectConfig) => AppConfig` |
| `removeProject` | `(config: AppConfig, name: string) => AppConfig` |

### router.ts

| 函数 | 签名 |
|------|------|
| `Router.constructor` | `(config: AppConfig, store: Store) => Router` |
| `Router.registerChannel` | `(channelId: string, platform: Platform, projectName: string) => void` |
| `Router.getProject` | `(channelId: string, platform: Platform) => ProjectConfig \| null` |
| `Router.getSessionId` | `(threadId: string, platform: Platform) => string \| null` |
| `Router.isManagementCommand` | `(content: string) => boolean` |
| `Router.parseManagementCommand` | `(content: string) => { command: string; args: string[] } \| null` |

### formatter.ts

| 函数 | 签名 |
|------|------|
| `Formatter.constructor` | `(config: FormatterConfig) => Formatter` |
| `Formatter.updateConfig` | `(config: FormatterConfig) => void` |
| `Formatter.getMaxLength` | `(platform: Platform) => number` |
| `Formatter.formatOutput` | `(text: string, platform: Platform) => FormatResult` |
| `Formatter.splitText` | `(text: string, maxLen: number) => string[]` |
| `Formatter.generateSummary` | `(text: string, maxLen: number) => string` |
| `Formatter.extractReactions` | `(text: string) => ReactionResult` |
| `Formatter.extractImages` | `(text: string, projectDir: string) => Attachment[]` |

### session.ts

| 函数 | 签名 |
|------|------|
| `SessionManager.constructor` | `(claudeConfig: ClaudeConfig, formatterConfig: FormatterConfig)` |
| `SessionManager.updateConfig` | `(claudeConfig: ClaudeConfig, formatterConfig: FormatterConfig) => void` |
| `SessionManager.activeCount` | `get activeCount(): number` |
| `SessionManager.canAccept` | `() => boolean` |
| `SessionManager.isBusy` | `(threadKey: string) => boolean` |
| `SessionManager.activeKeys` | `() => string[]` |
| `SessionManager.parseLine` | `(line: string) => StreamEvent \| null` |
| `SessionManager.buildArgs` | `(sessionId: string \| null, model?: string) => string[]` |
| `SessionManager.invoke` | `(threadKey, projectDir, sessionId, message, onEvent, images?, onStart?, model?) => Promise<SessionResult>` |
| `SessionManager.abort` | `(sessionId: string) => boolean` |
| `SessionManager.abortAll` | `() => void` |

### store.ts

| 函数 | 签名 |
|------|------|
| `Store.constructor` | `(dbPath: string)` |
| `Store.upsertThread` | `(threadId: string, platform: Platform, channelId: string, sessionId: string, projectName: string) => void` |
| `Store.getThread` | `(threadId: string, platform: Platform) => ThreadRow \| null` |
| `Store.updateThreadStatus` | `(threadId: string, platform: Platform, status: ThreadStatus) => void` |
| `Store.deleteThread` | `(threadId: string, platform: Platform) => void` |
| `Store.saveMessage` | `(messageId: string, platform: Platform, threadId: string, isBot: boolean, contentSummary?: string) => void` |
| `Store.getMessage` | `(messageId: string, platform: Platform) => MessageRow \| null` |
| `Store.getLastBotMessage` | `(threadId: string, platform: Platform) => MessageRow \| null` |
| `Store.markPendingRestart` | `(threadId: string, platform: Platform) => void` |
| `Store.getPendingRestarts` | `() => ThreadRow[]` |
| `Store.clearPendingRestarts` | `() => void` |
| `Store.listSessions` | `(projectName?: string) => ThreadRow[]` |
| `Store.saveTokenUsage` | `(sessionId, projectName, model, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens) => void` |
| `Store.getSessionTokens` | `(sessionId: string) => TokenStats` |
| `Store.getProjectTokens` | `(projectName: string) => TokenStats` |
| `Store.getDailyTokens` | `(projectName: string) => DailyTokenStats[]` |
| `Store.close` | `() => void` |

### adapters/discord.ts

| 函数 | 签名 |
|------|------|
| `DiscordAdapter.constructor` | `(token: string)` |
| `DiscordAdapter.start` | `() => Promise<void>` |
| `DiscordAdapter.stop` | `() => Promise<void>` |
| `DiscordAdapter.setupProject` | `(project: ProjectConfig) => Promise<ChannelInfo>` |
| `DiscordAdapter.createThread` | `(channelId: string, messageId: string) => Promise<string>` |
| `DiscordAdapter.getThreadName` | `(threadId: string) => Promise<string>` |
| `DiscordAdapter.renameThread` | `(threadId: string, name: string) => Promise<void>` |
| `DiscordAdapter.sendMessage` | `(channelId: string, threadId: string, content: string) => Promise<string>` |
| `DiscordAdapter.editMessage` | `(channelId: string, messageId: string, content: string) => Promise<void>` |
| `DiscordAdapter.uploadFile` | `(channelId: string, threadId: string, filename: string, content: Buffer) => Promise<void>` |
| `DiscordAdapter.addReaction` | `(channelId: string, messageId: string, emoji: string) => Promise<void>` |
| `DiscordAdapter.onMessage` | `(handler: (msg: IncomingMessage) => void) => void` |
| `DiscordAdapter.onReaction` | `(handler: (reaction: Reaction) => void) => void` |
| `DiscordAdapter.onSlashCommand` | `(handler: (interaction: ChatInputCommandInteraction) => void) => void` |

---

## 测试用例

| 文件路径 | 函数名 | 测试用例名 | 用例类型 | 测试数据构造 | 通过条件 | 已覆盖 |
|----------|--------|-----------|---------|-------------|---------|--------|
| packages/core/src/config.ts | loadConfig | 加载有效配置文件 | 功能正确性 | 写入完整YAML到临时文件 | 返回对象包含所有字段且值正确 | Y |
| packages/core/src/config.ts | loadConfig | 环境变量覆盖 discord token | 功能正确性 | 设置 DISCORD_TOKEN 环境变量 | config.discord.token === env 值 | Y |
| packages/core/src/config.ts | loadConfig | 环境变量覆盖 lark appId | 功能正确性 | 设置 LARK_APP_ID 环境变量 | config.lark.appId === env 值 | Y |
| packages/core/src/config.ts | loadConfig | 环境变量覆盖 lark appSecret | 功能正确性 | 设置 LARK_APP_SECRET 环境变量 | config.lark.appSecret === env 值 | Y |
| packages/core/src/config.ts | loadConfig | 三个环境变量同时覆盖 | 功能正确性 | 同时设置三个 env var | 三个字段值均为 env 值 | Y |
| packages/core/src/config.ts | loadConfig | 文件不存在时抛出错误 | 错误处理 | 传入不存在的路径 | 抛出 ENOENT | Y |
| packages/core/src/config.ts | loadConfig | 无效 YAML 语法抛出错误 | 错误处理 | 写入格式错误的 YAML | 抛出解析错误 | Y |
| packages/core/src/config.ts | loadConfig | project 无 model 字段为 undefined | 功能正确性 | 不设 model | projects[0].model === undefined | Y |
| packages/core/src/config.ts | loadConfig | project 有可选 model 字段 | 功能正确性 | model: "claude-opus-4-6" | projects[0].model === "claude-opus-4-6" | Y |
| packages/core/src/config.ts | loadConfig | platforms 数组转为对象 | 向后兼容 | platforms: ["discord"] | platforms === { discord: true } | Y |
| packages/core/src/config.ts | loadConfig | 多元素 platforms 数组转为对象 | 向后兼容 | platforms: ["discord", "lark"] | platforms === { discord: true, lark: true } | Y |
| packages/core/src/config.ts | loadConfig | 正确格式的 platforms 不被修改 | 功能正确性 | platforms: { discord: true } | 值不变 | Y |
| packages/core/src/config.ts | loadConfig | 空 platforms 数组转为空对象 | 边界值 | platforms: [] | platforms === {}, 非数组 | Y |
| packages/core/src/config.ts | loadConfig | 多项目独立修复 platforms 格式 | 功能正确性 | 项目A用数组, 项目B用对象 | 各自正确转换 | Y |
| packages/core/src/config.ts | loadConfig | flat formatter keys 转为 nested | 向后兼容 | maxMessageLengthDiscord 等 flat 字段 | maxMessageLength 为正确嵌套对象 | Y |
| packages/core/src/config.ts | loadConfig | 部分 flat keys 缺失用默认值 | 向后兼容 | 仅设 maxMessageLengthDiscord: 1500 | lark=30000, web=100000 | Y |
| packages/core/src/config.ts | loadConfig | 全部使用默认 maxMessageLength | 边界值 | formatter 仅含 maxConcurrentProcesses | discord=2000, lark=30000, web=100000 | Y |
| packages/core/src/config.ts | loadConfig | 正确 nested 格式不被覆盖 | 功能正确性 | maxMessageLength: { discord: 3000, ... } | 值不变 | Y |
| packages/core/src/config.ts | loadConfig | 无 formatter 节不崩溃 | 边界值 | YAML 中不含 formatter | formatter === undefined | Y |
| packages/core/src/config.ts | loadConfig | 缺失 discord 节不校验（已知缺陷） | 错误处理 | YAML 无 discord 字段 | discord === undefined, 无报错 | Y |
| packages/core/src/config.ts | loadConfig | 缺失 projects 节崩溃 | 错误处理 | YAML 无 projects 字段 | 抛出 "is not iterable" | Y |
| packages/core/src/config.ts | loadConfig | lark 节缺失 + env var 崩溃 | 错误处理 | 无 lark 字段, 设置 LARK_APP_ID | 抛出 TypeError | Y |
| packages/core/src/config.ts | loadConfig | projects 为字符串不校验（已知缺陷） | 错误处理 | projects: "not-an-array" | typeof projects === "string" | Y |
| packages/core/src/config.ts | loadConfig | 两种修复同时生效 | 跨函数交互 | platforms 为数组 + formatter 为 flat | 两项均正确转换 | Y |
| packages/core/src/config.ts | loadConfig | 空 YAML 文件 | 边界值 | 写入空字符串到文件 | parsed 为 null, 访问 parsed.projects 崩溃 | N |
| packages/core/src/config.ts | loadConfig | 仅含注释的 YAML 文件 | 边界值 | 写入 "# comment only\n" | parsed 为 null, TypeError | N |
| packages/core/src/config.ts | loadConfig | 超大 projects 数组 | 边界值 | YAML 含 1000+ 项目 | 正常加载不截断 | N |
| packages/core/src/config.ts | loadConfig | platforms 数组含无效平台名 | 错误处理 | platforms: ["slack"] | { slack: true } 无校验 | N |
| packages/core/src/config.ts | loadConfig | 环境变量为空字符串 | 边界值 | DISCORD_TOKEN="" | 空串为 falsy, 不覆盖, 保留文件值 | N |
| packages/core/src/config.ts | loadConfig | YAML 含未知顶层字段 | 向后兼容 | 添加 customField: "value" | 额外字段透传 | N |
| packages/core/src/config.ts | loadConfig | 重复项目名 | 边界值 | 两个 name="dup" 的项目 | 两个都保留（无去重） | N |
| packages/core/src/config.ts | loadConfig | 返回值为可变引用 | 返回值语义 | 加载后修改返回对象 | 修改生效（无防御性拷贝） | N |
| packages/core/src/config.ts | loadConfig | 多次加载同一文件幂等 | 幂等性 | loadConfig(path) 两次 | 两次返回值 deep equal 但非同一引用 | N |
| packages/core/src/config.ts | loadConfig | discord 节缺失 + DISCORD_TOKEN env 崩溃 | 错误处理 | 无 discord 字段, 设置 DISCORD_TOKEN | TypeError: Cannot set 'token' of undefined | N |
| packages/core/src/config.ts | loadConfig | flat 和 nested 同时存在时 nested 优先 | 向后兼容 | 同时设 flat keys 和 nested maxMessageLength | nested 值被保留 | N |
| packages/core/src/config.ts | loadConfig | maxMessageLength 为负数不校验 | 安全/边界值 | maxMessageLength: { discord: -1 } | 值被原样保留 | N |
| packages/core/src/config.ts | saveConfig | 写入 YAML 可被重新加载 | 功能正确性 | makeConfig() + 项目 | loadConfig 后数据一致 | Y |
| packages/core/src/config.ts | saveConfig | 有 env var 时 discord token 被清空 | 功能正确性 | 设置 DISCORD_TOKEN | 保存文件中 token="" | Y |
| packages/core/src/config.ts | saveConfig | 有 env var 时 lark appId 被清空 | 功能正确性 | 设置 LARK_APP_ID | 保存文件中 appId="" | Y |
| packages/core/src/config.ts | saveConfig | 有 env var 时 lark appSecret 被清空 | 功能正确性 | 设置 LARK_APP_SECRET | 保存文件中 appSecret="" | Y |
| packages/core/src/config.ts | saveConfig | 不修改传入的 config 对象 | 返回值语义 | 设置 DISCORD_TOKEN 后保存 | 原始 config.discord.token 不变 | Y |
| packages/core/src/config.ts | saveConfig | 无 env var 时保留原始 token | 功能正确性 | 不设置任何 env var | 保存文件中 token=原始值 | N |
| packages/core/src/config.ts | saveConfig | 目标目录不存在时报错 | 错误处理 | path="/nonexistent/dir/config.yaml" | 抛出 ENOENT | N |
| packages/core/src/config.ts | saveConfig | 覆盖已存在的文件 | 幂等性 | 先写一次, 改 config 再写 | 文件内容为最新 config | N |
| packages/core/src/config.ts | saveConfig | 值含特殊 YAML 字符 | 安全/边界值 | token 含冒号/引号/换行 | 重新加载后值完全一致 | N |
| packages/core/src/config.ts | saveConfig | 空项目列表保存 | 边界值 | projects: [] | 正常写入, 可重新加载 | N |
| packages/core/src/config.ts | addProject | 向空列表添加新项目 | 功能正确性 | makeConfig(), 新 ProjectConfig | projects.length===1 | Y |
| packages/core/src/config.ts | addProject | 替换同名已存在项目 | 功能正确性 | config 含 "proj-a", 传入同名新值 | projects.length===1, 值为新值 | Y |
| packages/core/src/config.ts | addProject | 原地修改并返回同一引用 | 返回值语义 | addProject(config, project) | result === config | Y |
| packages/core/src/config.ts | addProject | 连续添加多个不同项目 | 功能正确性 | 依次添加 "a","b","c" | projects.length===3, 顺序正确 | Y |
| packages/core/src/config.ts | addProject | 空名项目可添加 | 边界值 | name: "" | projects[0].name === "" | Y |
| packages/core/src/config.ts | addProject | 替换保持数组位置 | 功能正确性 | 3 个项目, 替换中间一个 | 在 index 1 替换, 其余不变 | N |
| packages/core/src/config.ts | addProject | 同参数添加两次幂等 | 幂等性 | add("p") 再 add("p") 相同数据 | length 保持 1 | N |
| packages/core/src/config.ts | addProject | 添加→替换→添加不同项目 | 跨函数交互 | add("a"), add("a"更新), add("b") | length===2, "a"为新值, "b"存在 | N |
| packages/core/src/config.ts | addProject | 添加的 project 引用被外部修改 | 返回值语义 | add 后修改 project.directory | config.projects[0].directory 也变（浅引用） | N |
| packages/core/src/config.ts | removeProject | 按名称移除存在的项目 | 功能正确性 | config 含 "remove" 和 "keep" | 仅保留 "keep" | Y |
| packages/core/src/config.ts | removeProject | 移除不存在项目为空操作 | 边界值 | 传入不存在的 name | projects 不变 | Y |
| packages/core/src/config.ts | removeProject | 原地修改并返回同一引用 | 返回值语义 | removeProject(config, name) | result === config | Y |
| packages/core/src/config.ts | removeProject | 空列表移除不报错 | 边界值 | projects: [] | projects.length===0 | Y |
| packages/core/src/config.ts | removeProject | 多个同名项目全部被移除 | 边界值 | 手动 push 两个 "dup" 项目 | 两个都被移除（filter 语义） | N |
| packages/core/src/config.ts | removeProject | 移除空名项目 | 边界值 | config 含 name="" 的项目, 移除 "" | 该项目被移除 | N |
| packages/core/src/config.ts | removeProject | 重复移除幂等 | 幂等性 | remove("x") 两次 | 第二次为空操作 | N |
| packages/core/src/config.ts | addProject + removeProject | 添加再移除恢复原状 | 跨函数交互 | add("x"), remove("x") | projects.length === 初始长度 | N |
| packages/core/src/config.ts | addProject + saveConfig + loadConfig | 添加→保存→加载完整往返 | 跨函数交互 | add, save, load | 加载后数据一致 | N |
| packages/core/src/router.ts | registerChannel | 注册并可通过 getProject 查到 | 功能正确性 | register "ch-1" on discord for "proj" | getProject 返回正确项目 | Y |
| packages/core/src/router.ts | registerChannel | 相同 channelId 不同平台独立映射 | 功能正确性 | 同 channelId 注册 discord 和 lark | 各自返回各自的项目 | N |
| packages/core/src/router.ts | registerChannel | 覆盖已有注册 | 幂等性 | 注册 "ch-1" for "proj-a", 再注册 for "proj-b" | getProject 返回 "proj-b" | N |
| packages/core/src/router.ts | registerChannel | 空 channelId | 边界值 | registerChannel("", "discord", "proj") | Map key 为 "discord:", getProject("","discord") 可用 | N |
| packages/core/src/router.ts | registerChannel | 空 projectName | 边界值 | registerChannel("ch", "discord", "") | 映射存在但 getProject 返回 null（无匹配项目） | N |
| packages/core/src/router.ts | registerChannel | channelId 含冒号 | 边界值 | channelId = "a:b:c" | key 为 "discord:a:b:c", 仍可正确查询 | N |
| packages/core/src/router.ts | getProject | 未注册的 channelId 返回 null | 功能正确性 | 不注册, 直接查询 | 返回 null | Y |
| packages/core/src/router.ts | getProject | 映射存在但项目不在 config 中 | 错误处理 | 注册 "nonexistent-project" | 返回 null（find 无匹配） | N |
| packages/core/src/router.ts | getProject | 错误平台返回 null | 功能正确性 | 在 discord 注册, 用 lark 查询 | 返回 null | N |
| packages/core/src/router.ts | getProject | 返回 config 中项目的引用 | 返回值语义 | getProject 后修改返回值 | 修改影响 config.projects | N |
| packages/core/src/router.ts | getProject | config.projects 外部修改后反映变化 | 状态与生命周期 | 构造后修改 config.projects | getProject 看到新数据 | N |
| packages/core/src/router.ts | getSessionId | 无 thread 返回 null | 功能正确性 | 无 store 数据 | 返回 null | Y |
| packages/core/src/router.ts | getSessionId | 返回已有 thread 的 session ID | 功能正确性 | upsert thread with session-abc | 返回 "session-abc" | Y |
| packages/core/src/router.ts | getSessionId | upsert 后返回更新的 session ID | 状态与生命周期 | upsert session-1, 再 upsert session-2 | 返回 "session-2" | Y |
| packages/core/src/router.ts | getSessionId | 错误平台返回 null | 功能正确性 | 在 discord upsert, 用 lark 查询 | 返回 null | Y |
| packages/core/src/router.ts | getSessionId | 空 threadId | 边界值 | getSessionId("", "discord") | 返回 null | N |
| packages/core/src/router.ts | getSessionId | store 依赖抛异常 | 依赖失败 | mock store.getThread 抛出错误 | 错误传播（无 try-catch） | N |
| packages/core/src/router.ts | isManagementCommand | 识别 /im-list-projects | 功能正确性 | 输入 "/im-list-projects" | 返回 true | Y |
| packages/core/src/router.ts | isManagementCommand | 识别 /im-add-project 带参数 | 功能正确性 | 输入 "/im-add-project foo /tmp" | 返回 true | Y |
| packages/core/src/router.ts | isManagementCommand | 拒绝普通文本 | 功能正确性 | 输入 "hello world" | 返回 false | Y |
| packages/core/src/router.ts | isManagementCommand | 识别 /im-done | 功能正确性 | 输入 "/im-done" | 返回 true | N |
| packages/core/src/router.ts | isManagementCommand | 识别 /im-remove-project | 功能正确性 | 输入 "/im-remove-project foo" | 返回 true | N |
| packages/core/src/router.ts | isManagementCommand | 识别 /im-reload-config | 功能正确性 | 输入 "/im-reload-config" | 返回 true | N |
| packages/core/src/router.ts | isManagementCommand | 识别 /im-reopen | 功能正确性 | 输入 "/im-reopen" | 返回 true | N |
| packages/core/src/router.ts | isManagementCommand | 空字符串返回 false | 边界值 | 输入 "" | 返回 false | N |
| packages/core/src/router.ts | isManagementCommand | /im-unknown 返回 false | 功能正确性 | 输入 "/im-unknown" | 返回 false（不在正则列表中） | N |
| packages/core/src/router.ts | isManagementCommand | 命令在中间返回 false | 边界值 | 输入 "hello /im-done" | 返回 false（正则 ^） | N |
| packages/core/src/router.ts | isManagementCommand | 含换行的输入 | 边界值 | 输入 "/im-done\nsome text" | 返回 true（^ 匹配行首） | N |
| packages/core/src/router.ts | parseManagementCommand | 解析 /im-done 无参数 | 功能正确性 | 输入 "/im-done" | { command: "done", args: [] } | Y |
| packages/core/src/router.ts | parseManagementCommand | 解析带参数的命令 | 功能正确性 | 输入 "/im-add-project myproj /tmp/dir" | { command: "add-project", args: ["myproj", "/tmp/dir"] } | Y |
| packages/core/src/router.ts | parseManagementCommand | 非命令文本返回 null | 功能正确性 | 输入 "hello world" | 返回 null | Y |
| packages/core/src/router.ts | parseManagementCommand | 空字符串返回 null | 边界值 | 输入 "" | 返回 null | Y |
| packages/core/src/router.ts | parseManagementCommand | 处理参数间多余空格 | 边界值 | 输入 "/im-add-project   myproj   /tmp/dir" | args 无空元素 | Y |
| packages/core/src/router.ts | parseManagementCommand | 解析 /im-list-projects | 功能正确性 | 输入 "/im-list-projects" | { command: "list-projects", args: [] } | Y |
| packages/core/src/router.ts | parseManagementCommand | 解析非标准 /im-xxx 命令 | 功能正确性 | 输入 "/im-foobar args" | { command: "foobar", args: ["args"] }（parse 比 is 更宽松） | N |
| packages/core/src/router.ts | parseManagementCommand | 尾部空白处理 | 边界值 | 输入 "/im-done   " | { command: "done", args: [] } | N |
| packages/core/src/router.ts | parseManagementCommand | isManagementCommand 与 parse 一致性 | 跨函数交互 | 所有合法管理命令 | is 返回 true 的命令 parse 均非 null | N |
| packages/core/src/router.ts | Router | register→get→再 register 覆盖→get | 跨函数交互 | 注册 ch for proj-a, 查询, 注册 ch for proj-b | 最终 getProject 返回 proj-b | N |
| packages/core/src/router.ts | Router | 构造函数持有 config 引用 | 状态与生命周期 | 创建 Router 后外部修改 config.projects | Router 看到变化（无防御性拷贝） | N |
| packages/core/src/formatter.ts | constructor | 使用有效 FormatterConfig 构造实例 | 功能正确性 | new Formatter(config) | getMaxLength 返回对应值 | Y |
| packages/core/src/formatter.ts | updateConfig | 更新配置后 getMaxLength 返回新值 | 功能正确性 | 调用 updateConfig 传入新配置 | getMaxLength 返回更新后的值 | Y |
| packages/core/src/formatter.ts | updateConfig | 传入的 config 被外部修改影响内部状态 | 返回值语义 | updateConfig 后修改传入的 config 对象 | getMaxLength 反映修改（持有引用） | N |
| packages/core/src/formatter.ts | updateConfig | 连续调用两次 | 幂等性 | 先更新 A, 再更新 B | 最终状态反映 B | N |
| packages/core/src/formatter.ts | getMaxLength | 返回各平台配置值 | 功能正确性 | discord=1500, lark=30000, web=10000 | 分别返回正确值 | Y |
| packages/core/src/formatter.ts | getMaxLength | 平台未配置时回退到 2000 | 边界值 | maxMessageLength 为空对象 | 返回 2000 | Y |
| packages/core/src/formatter.ts | getMaxLength | 传入非法平台字符串 | 错误处理 | getMaxLength("telegram" as Platform) | 返回 2000（默认值） | N |
| packages/core/src/formatter.ts | formatOutput | 短文本原样通过 | 功能正确性 | text 长度 < maxLen | messages=[text], attachments=[] | Y |
| packages/core/src/formatter.ts | formatOutput | 中等长度文本分片 | 功能正确性 | text 在 maxLen 和 maxLen*5 之间 | 多条消息, 每条 <= maxLen | Y |
| packages/core/src/formatter.ts | formatOutput | 超长文本生成摘要+附件 | 功能正确性 | text > maxLen*5 | attachments 包含 full-output.md | Y |
| packages/core/src/formatter.ts | formatOutput | 空字符串输入 | 边界值 | formatOutput("", "discord") | messages=[""], attachments=[] | N |
| packages/core/src/formatter.ts | formatOutput | 长度恰好等于 maxLen | 边界值 | text.length === maxLen | 单条消息, 不分片 | N |
| packages/core/src/formatter.ts | formatOutput | 长度恰好等于 maxLen+1 | 边界值 | text.length === maxLen + 1 | 分为 2 条消息 | N |
| packages/core/src/formatter.ts | formatOutput | 长度恰好等于 maxLen*5 | 边界值 | text.length === maxLen * 5 | 分片（不生成附件） | N |
| packages/core/src/formatter.ts | formatOutput | 长度恰好等于 maxLen*5+1 | 边界值 | text.length === maxLen * 5 + 1 | 摘要+附件逻辑 | N |
| packages/core/src/formatter.ts | formatOutput | 附件内容为 UTF-8 Buffer | 功能正确性 | 超长文本含中文 | attachment.content.toString("utf-8") === 原文 | N |
| packages/core/src/formatter.ts | formatOutput | 不同平台使用不同 maxLen | 跨函数交互 | discord=100, lark=300, 同一文本 | discord 分片更多 | N |
| packages/core/src/formatter.ts | splitText | 短文本不分片 | 功能正确性 | 短文本, 大 maxLen | 返回 [text] 无前缀 | N |
| packages/core/src/formatter.ts | splitText | 按换行符分割 | 功能正确性 | 多行文本 > maxLen | 在换行处分割 | N |
| packages/core/src/formatter.ts | splitText | 换行位置 < 50% 时用空格分割 | 功能正确性 | 换行在前半段, 空格在后半段 | 在空格处分割 | N |
| packages/core/src/formatter.ts | splitText | 无换行无空格时硬切割 | 功能正确性 | 连续无分隔符的超长字符串 | 在 available 位置硬切 | N |
| packages/core/src/formatter.ts | splitText | 多片添加 [i/total] 前缀 | 功能正确性 | 需分 3 片的文本 | 各片以 [1/3] [2/3] [3/3] 开头 | N |
| packages/core/src/formatter.ts | splitText | 每片不超过 maxLen | 功能正确性 | 各种长度文本 | 所有片段 .length <= maxLen | N |
| packages/core/src/formatter.ts | splitText | 空字符串输入 | 边界值 | splitText("", 100) | 返回 [""] | N |
| packages/core/src/formatter.ts | splitText | maxLen 非常小(如 20) | 边界值 | maxLen=20, 文本 100 字符 | 正常分片, 不死循环 | N |
| packages/core/src/formatter.ts | splitText | maxLen <= reservedForPrefix (12) | 边界值 | maxLen=10 | available 为负, 验证不死循环 | N |
| packages/core/src/formatter.ts | splitText | 相同输入调用两次结果一致 | 幂等性 | 同一文本和 maxLen 调用两次 | 两次结果 deep equal | N |
| packages/core/src/formatter.ts | generateSummary | 取前 10 行并附加后缀 | 功能正确性 | 20 行文本 | 包含前 10 行 + 后缀 | Y |
| packages/core/src/formatter.ts | generateSummary | 前 10 行超过 maxLen-50 时截断 | 功能正确性 | 每行 200 字符, maxLen=500 | 正文 <= maxLen-50 | Y |
| packages/core/src/formatter.ts | generateSummary | 前 10 行短于 maxLen-50 时不截断 | 功能正确性 | 5 行短文本, maxLen=2000 | 完整文本 + 后缀 | Y |
| packages/core/src/formatter.ts | generateSummary | 文本少于 10 行 | 边界值 | 3 行文本 | 使用全部 3 行 + 后缀 | N |
| packages/core/src/formatter.ts | generateSummary | 空字符串输入 | 边界值 | generateSummary("", 2000) | 返回后缀 | N |
| packages/core/src/formatter.ts | generateSummary | maxLen < 50 导致负数 slice | 错误处理 | maxLen=30 | 不崩溃 | N |
| packages/core/src/formatter.ts | extractReactions | 末尾单个 reaction 标记 | 功能正确性 | "回复\n[react:thumbsup]" | reactions=["thumbsup"], cleanText 不含标记 | Y |
| packages/core/src/formatter.ts | extractReactions | 中间的 reaction 标记不被提取 | 功能正确性 | "Some [react:x] text\nMore" | reactions=[], cleanText 为原文 | Y |
| packages/core/src/formatter.ts | extractReactions | 多个尾部 reaction | 功能正确性 | "Done!\n[react:check]\n[react:tada]" | reactions=["check","tada"] | Y |
| packages/core/src/formatter.ts | extractReactions | 空字符串输入 | 边界值 | extractReactions("") | reactions=[], cleanText="" | N |
| packages/core/src/formatter.ts | extractReactions | 只有 reaction 无内容 | 边界值 | "[react:wave]" | reactions=["wave"], cleanText="" | N |
| packages/core/src/formatter.ts | extractReactions | reaction 后有空行 | 边界值 | "Content\n[react:ok]\n\n" | reactions=["ok"] | N |
| packages/core/src/formatter.ts | extractReactions | reaction 值含冒号 | 边界值 | "Text\n[react:a:b:c]" | reactions=["a:b:c"] | N |
| packages/core/src/formatter.ts | extractReactions | 连续调用不影响内部状态 | 幂等性 | 同一文本两次 | 两次结果相同 | N |
| packages/core/src/formatter.ts | extractImages | 提取绝对路径已有图片 | 功能正确性 | 创建 .png 文件, 文本含绝对路径 | 返回 1 个 Attachment | Y |
| packages/core/src/formatter.ts | extractImages | 相对路径相对 projectDir 解析 | 功能正确性 | projectDir 下创建 .jpeg | 正确解析并返回 | Y |
| packages/core/src/formatter.ts | extractImages | 相同路径去重 | 功能正确性 | 同路径出现两次 | 返回 1 个 Attachment | Y |
| packages/core/src/formatter.ts | extractImages | 无图片路径返回空数组 | 功能正确性 | 纯文本 | 返回 [] | Y |
| packages/core/src/formatter.ts | extractImages | 文件不存在时跳过 | 错误处理 | 文本含不存在的路径 | 返回 [] | Y |
| packages/core/src/formatter.ts | extractImages | .jpg 转为 image/jpeg | 功能正确性 | 创建 .jpg 文件 | mimeType 为 "image/jpeg" | Y |
| packages/core/src/formatter.ts | extractImages | 空字符串输入 | 边界值 | extractImages("", "/tmp") | 返回 [] | N |
| packages/core/src/formatter.ts | extractImages | readFileSync 权限不足 | 依赖失败 | 创建文件后 chmod 000 | 优雅跳过, 不抛异常 | N |
| packages/core/src/formatter.ts | extractImages | 路径穿越攻击 | 安全性 | 文本含 "../../etc/passwd.png" | 验证是否限制在 projectDir 内 | N |
| packages/core/src/formatter.ts | extractImages | 大小写扩展名(.PNG) | 边界值 | 文本含大写扩展名路径 | 正则 gi 匹配, extname toLowerCase 处理 | N |
| packages/core/src/formatter.ts | extractImages | SVG mimeType 设置 | 功能正确性 | 创建 .svg 文件 | mimeType 为 "image/svg"（注: 标准应为 image/svg+xml） | N |
| packages/core/src/formatter.ts | extractImages | projectDir 尾部有斜杠 | 边界值 | projectDir="/tmp/" + 相对路径 | 不产生双斜杠 | N |
| packages/core/src/session.ts | constructor | 初始 activeCount 为 0 | 功能正确性 | new SessionManager(config, fmtConfig) | activeCount === 0 | Y |
| packages/core/src/session.ts | updateConfig | 替换 claude config | 功能正确性 | 调用 updateConfig 新 timeout | canAccept 仍正常 | Y |
| packages/core/src/session.ts | updateConfig | 替换 formatter config 影响 canAccept | 功能正确性 | maxConcurrentProcesses=0 | canAccept() === false | Y |
| packages/core/src/session.ts | updateConfig | 传入 config 被外部修改影响 manager | 返回值语义 | updateConfig 后修改传入对象 | 行为反映修改 | N |
| packages/core/src/session.ts | canAccept | 低于上限返回 true | 功能正确性 | 新 manager, maxConcurrentProcesses=3 | true | Y |
| packages/core/src/session.ts | canAccept | 刚好一个低于上限返回 true | 边界值 | active.size === max-1 | true | Y |
| packages/core/src/session.ts | canAccept | 刚好等于上限返回 false | 边界值 | active.size === max | false | Y |
| packages/core/src/session.ts | canAccept | 超过上限返回 false | 边界值 | active.size === max+1 | false | Y |
| packages/core/src/session.ts | canAccept | maxConcurrentProcesses=0 返回 false | 边界值 | maxConcurrentProcesses=0 | false | Y |
| packages/core/src/session.ts | isBusy | 无队列返回 false | 功能正确性 | 新 manager | isBusy("any") === false | Y |
| packages/core/src/session.ts | isBusy | 有队列返回 true | 功能正确性 | 手动设置 queue entry | isBusy(key) === true | Y |
| packages/core/src/session.ts | isBusy | 不同 key 返回 false | 功能正确性 | key A 有队列, 查 key B | false | Y |
| packages/core/src/session.ts | activeKeys | 无进程返回空数组 | 功能正确性 | 新 manager | [] | Y |
| packages/core/src/session.ts | activeKeys | 返回所有活跃 key | 功能正确性 | 手动添加 3 个 entry | 包含所有 3 个 | Y |
| packages/core/src/session.ts | activeKeys | 返回新数组而非内部引用 | 返回值语义 | 调用两次 | 值相等但不同引用 | Y |
| packages/core/src/session.ts | parseLine | 解析有效 init 事件 | 功能正确性 | 有效 JSON init 行 | 返回 type "system" | Y |
| packages/core/src/session.ts | parseLine | 解析 assistant 文本事件 | 功能正确性 | 有效 JSON assistant 行 | 返回 type "assistant" | Y |
| packages/core/src/session.ts | parseLine | 无效 JSON 返回 null | 错误处理 | "not json" | null | Y |
| packages/core/src/session.ts | parseLine | 空字符串返回 null | 边界值 | "" | null | N |
| packages/core/src/session.ts | parseLine | 解析 result 事件 | 功能正确性 | 有效 JSON result 行 | 返回 type "result" | N |
| packages/core/src/session.ts | parseLine | JSON 含未知字段透传 | 向后兼容 | JSON 含额外字段 | 额外字段保留 | N |
| packages/core/src/session.ts | buildArgs | 无 model 时返回 defaultArgs | 功能正确性 | defaultArgs with --model, model=undefined | 返回 defaultArgs 副本 | Y |
| packages/core/src/session.ts | buildArgs | model 覆盖 --model | 功能正确性 | defaultArgs 有 --model haiku, model="opus" | 替换为 opus | Y |
| packages/core/src/session.ts | buildArgs | defaultArgs 无 --model 时追加 | 功能正确性 | defaultArgs 无 --model, model="opus" | 追加 --model opus | Y |
| packages/core/src/session.ts | buildArgs | sessionId 不为 null 时包含 --resume | 功能正确性 | sessionId="abc" | args 含 --resume abc | Y |
| packages/core/src/session.ts | buildArgs | sessionId 为 null 不含 --resume | 功能正确性 | sessionId=null | args 不含 --resume | N |
| packages/core/src/session.ts | buildArgs | 不修改原始 defaultArgs 数组 | 副作用 | 调用后检查原 config.defaultArgs | 原数组不变 | N |
| packages/core/src/session.ts | buildArgs | sessionId 为空字符串 | 边界值 | sessionId="" | 空串为 falsy, 不加 --resume | N |
| packages/core/src/session.ts | invoke | 成功执行返回 SessionResult | 功能正确性 | mock spawn 返回 result 事件 + exit 0 | 解析为 success=true | N |
| packages/core/src/session.ts | invoke | 命令不存在时 reject | 依赖失败 | spawn 不存在的命令 | reject with error | N |
| packages/core/src/session.ts | invoke | 超时时 reject | 依赖失败 | timeout=1ms, 进程挂起 | reject with timeout | N |
| packages/core/src/session.ts | invoke | 从 init 事件提取 session_id | 功能正确性 | 进程发出 init 事件 | result.sessionId 匹配 | N |
| packages/core/src/session.ts | invoke | 累积 assistant 文本 | 功能正确性 | 多个 assistant 文本块 | result.text 包含所有文本 | N |
| packages/core/src/session.ts | invoke | 每个解析的事件调用 onEvent | 副作用 | mock onEvent 回调 | 每个有效 JSON 行调用一次 | N |
| packages/core/src/session.ts | invoke | 处理开始时调用 onStart | 副作用 | mock onStart 回调 | 恰好调用一次 | N |
| packages/core/src/session.ts | invoke | 同 threadKey 排队等待 | 并发 | 同 threadKey invoke 两次 | 第二个等待第一个完成 | N |
| packages/core/src/session.ts | invoke | 达到上限时等待槽位 | 并发 | 填满后再 invoke | 等待槽位释放 | N |
| packages/core/src/session.ts | invoke | 完成后清理 active map | 状态与生命周期 | invoke 完成 | active map 不含该 threadKey | N |
| packages/core/src/session.ts | invoke | 附加图片路径到消息 | 功能正确性 | images=["/path/a.png"] | 消息包含图片列表 | N |
| packages/core/src/session.ts | invoke | images 为空数组时不附加 | 边界值 | images=[] | 消息不变 | N |
| packages/core/src/session.ts | invoke | 非零退出码无输出时 reject | 错误处理 | exit code 1, 无 stdout | reject with stderr | N |
| packages/core/src/session.ts | abort | 无匹配 session 返回 false | 功能正确性 | 空 active map | 返回 false | Y |
| packages/core/src/session.ts | abort | 匹配 session 杀进程返回 true | 功能正确性 | active map 有匹配 key | 返回 true, kill 被调用 | Y |
| packages/core/src/session.ts | abort | 不杀不匹配的进程 | 功能正确性 | 两个活跃, abort 一个 | 仅匹配的被杀 | Y |
| packages/core/src/session.ts | abort | 空 sessionId 匹配所有 key | 安全性 | abort("") | includes("") 总为 true, 潜在非预期行为 | N |
| packages/core/src/session.ts | abortAll | 无进程时无操作 | 功能正确性 | 新 manager | 无错误 | Y |
| packages/core/src/session.ts | abortAll | 杀死所有活跃进程 | 功能正确性 | 3 个活跃进程 | 全部被杀 | Y |
| packages/core/src/session.ts | abortAll | 清空 active map | 状态与生命周期 | abortAll 后 | activeCount === 0 | Y |
| packages/core/src/session.ts | abortAll | 清空 queues map | 状态与生命周期 | abortAll 后 | isBusy 返回 false | Y |
| packages/core/src/session.ts | abortAll | 调用两次幂等 | 幂等性 | abortAll 两次 | 第二次无错误 | N |
| packages/core/src/session.ts | abort + invoke | abort 正在运行的 invoke | 跨函数交互 | invoke 运行中, abort 其 session | invoke reject 或 resolve, 队列推进 | N |
| packages/core/src/store.ts | constructor | 创建数据库和表 | 功能正确性 | new Store("/tmp/test.db") | 无异常, db 文件创建 | Y |
| packages/core/src/store.ts | constructor | 无效路径抛出错误 | 错误处理 | new Store("/nonexistent/dir/test.db") | 抛出错误 | N |
| packages/core/src/store.ts | constructor | 重新打开已有 db 幂等 | 幂等性 | 创建, close, 再创建同路径 | 无错误, 数据保留 | N |
| packages/core/src/store.ts | constructor | 迁移添加 status 列 | 向后兼容 | 旧 db 无 status 列, 重新打开 | status 列存在, 默认 'active' | N |
| packages/core/src/store.ts | upsertThread | 创建新 thread | 功能正确性 | upsertThread("t1","discord","ch1","s1","proj") | getThread 返回匹配行 | Y |
| packages/core/src/store.ts | upsertThread | 冲突时更新 session_id | 功能正确性 | 同 thread_id+platform 两次不同 session_id | session_id 为第二个值 | Y |
| packages/core/src/store.ts | upsertThread | 同 thread_id 不同平台创建两行 | 功能正确性 | "t1" 在 discord 和 lark | 两个 getThread 返回不同行 | N |
| packages/core/src/store.ts | upsertThread | 空字符串 thread_id | 边界值 | upsertThread("","discord","ch","s","p") | 可保存和检索 | N |
| packages/core/src/store.ts | upsertThread | 默认状态为 active | 功能正确性 | 插入后读取 | status === "active" | Y |
| packages/core/src/store.ts | upsertThread | SQL 注入字符串参数 | 安全性 | threadId = "'; DROP TABLE threads; --" | 无注入, 值作为字面量存储 | N |
| packages/core/src/store.ts | getThread | 不存在返回 null | 边界值 | 无数据 | 返回 null | Y |
| packages/core/src/store.ts | getThread | 错误平台返回 null | 边界值 | discord 插入, lark 查询 | 返回 null | N |
| packages/core/src/store.ts | updateThreadStatus | 改为 done | 功能正确性 | 插入后 updateThreadStatus to "done" | status "done" | Y |
| packages/core/src/store.ts | updateThreadStatus | 改回 active | 功能正确性 | done 改回 active | status === "active" | N |
| packages/core/src/store.ts | updateThreadStatus | 不存在的 thread 无操作 | 边界值 | 对不存在 thread_id 调用 | 无错误 | N |
| packages/core/src/store.ts | deleteThread | 删除 thread 及其消息 | 功能正确性 | 插入 thread + messages, 删除 | 两者均消失 | Y |
| packages/core/src/store.ts | deleteThread | 不存在的 thread 无操作 | 边界值 | 删除不存在的 | 无错误 | N |
| packages/core/src/store.ts | deleteThread | 不影响其他 thread 的消息 | 副作用 | 插入 2 个 thread+消息, 删 1 个 | 另一个消息保留 | N |
| packages/core/src/store.ts | saveMessage | 保存 bot 消息 | 功能正确性 | saveMessage("m1","discord","t1",true,"hello") | getMessage 返回正确数据 | Y |
| packages/core/src/store.ts | saveMessage | 保存用户消息 | 功能正确性 | saveMessage isBot=false | is_bot === 0 | N |
| packages/core/src/store.ts | saveMessage | undefined contentSummary | 边界值 | saveMessage 不传 contentSummary | content_summary === null | N |
| packages/core/src/store.ts | saveMessage | 同 id 替换（INSERT OR REPLACE） | 幂等性 | 同 messageId+platform 存两次 | 第二次内容覆盖 | N |
| packages/core/src/store.ts | getMessage | 不存在返回 null | 边界值 | 无数据 | 返回 null | N |
| packages/core/src/store.ts | getLastBotMessage | 返回最近 bot 消息 | 功能正确性 | 存用户消息 + 2 条 bot 消息 | 返回 bot 消息 | Y |
| packages/core/src/store.ts | getLastBotMessage | 无消息返回 null | 边界值 | thread 存在, 无消息 | 返回 null | Y |
| packages/core/src/store.ts | getLastBotMessage | 仅有用户消息返回 null | 边界值 | 只存 isBot=false 的消息 | 返回 null | N |
| packages/core/src/store.ts | markPendingRestart | 标记 thread 为待重启 | 功能正确性 | 插入 thread, markPendingRestart | getPendingRestarts 包含 | Y |
| packages/core/src/store.ts | markPendingRestart | 幂等（INSERT OR IGNORE） | 幂等性 | 同 thread 调用两次 | 无错误, 仍为 1 条 | N |
| packages/core/src/store.ts | getPendingRestarts | 无待重启返回空数组 | 边界值 | 无标记 | 返回 [] | N |
| packages/core/src/store.ts | getPendingRestarts | 通过 JOIN 返回 ThreadRow | 功能正确性 | 插入 thread + 标记 | 返回包含所有字段的行 | Y |
| packages/core/src/store.ts | clearPendingRestarts | 清除所有待重启 | 功能正确性 | 标记 2 个, clear | getPendingRestarts 返回 [] | Y |
| packages/core/src/store.ts | clearPendingRestarts | 已空时无操作 | 边界值 | 直接 clear | 无错误 | N |
| packages/core/src/store.ts | listSessions | 无过滤返回所有 threads | 功能正确性 | 插入 2 个不同项目的 thread | 返回两个 | Y |
| packages/core/src/store.ts | listSessions | 按 projectName 过滤 | 功能正确性 | 多项目 thread, 过滤一个 | 仅返回匹配项目 | Y |
| packages/core/src/store.ts | listSessions | 无 thread 返回空数组 | 边界值 | 无数据 | 返回 [] | N |
| packages/core/src/store.ts | listSessions | 不存在的项目返回空数组 | 边界值 | listSessions("nonexistent") | 返回 [] | N |
| packages/core/src/store.ts | saveTokenUsage | 保存 token 记录 | 功能正确性 | saveTokenUsage("s1","proj","opus",100,50,1000,200) | getSessionTokens 返回匹配总计 | Y |
| packages/core/src/store.ts | saveTokenUsage | null model | 边界值 | model=null | 无错误 | N |
| packages/core/src/store.ts | saveTokenUsage | 零 token 值 | 边界值 | 所有 token = 0 | 无错误, 统计返回 0 | N |
| packages/core/src/store.ts | saveTokenUsage | 多条记录累加 | 功能正确性 | 同 session 存 2 条 | getSessionTokens 返回总和 | Y |
| packages/core/src/store.ts | getSessionTokens | 未知 session 返回零 | 边界值 | 无数据 | 所有字段 === 0 | Y |
| packages/core/src/store.ts | getSessionTokens | 跨多条记录聚合 | 功能正确性 | 同 session 存 2 条 | 返回总和 | Y |
| packages/core/src/store.ts | getSessionTokens | 不泄漏到其他 session | 副作用 | 存 sess-1 和 sess-2 | getSessionTokens("sess-1") 不含 sess-2 | N |
| packages/core/src/store.ts | getProjectTokens | 跨 session 聚合 | 功能正确性 | sess-1 和 sess-2 同项目 | 返回总和 | Y |
| packages/core/src/store.ts | getProjectTokens | 未知项目返回零 | 边界值 | 无数据 | 所有字段 === 0 | N |
| packages/core/src/store.ts | getProjectTokens | 不泄漏到其他项目 | 副作用 | 存 proj-a 和 proj-b | getProjectTokens("proj-a") 不含 proj-b | Y |
| packages/core/src/store.ts | getDailyTokens | 返回日期和 model 分组 | 功能正确性 | 存 usage, 查询 | 返回含日期字符串的数组 | Y |
| packages/core/src/store.ts | getDailyTokens | 日期格式 YYYY-MM-DD | 功能正确性 | 存 usage | date 匹配格式 | Y |
| packages/core/src/store.ts | getDailyTokens | 未知项目返回空数组 | 边界值 | 无数据 | 返回 [] | N |
| packages/core/src/store.ts | getDailyTokens | 按日期和 model 分组 | 功能正确性 | 同日不同 model | 两行 | N |
| packages/core/src/store.ts | close | 关闭数据库连接 | 功能正确性 | 调用 close | 后续操作抛异常 | N |
| packages/core/src/store.ts | close | 双重 close | 幂等性 | close 两次 | 文档化行为（抛出或无操作） | N |
| packages/core/src/store.ts | 生命周期 | construct→use→close→reopen | 状态与生命周期 | 写入, close, 重新打开, 读取 | 数据持久化 | N |
| packages/core/src/adapters/discord.ts | constructor | platform 为 "discord" | 功能正确性 | new DiscordAdapter("token") | adapter.platform === "discord" | Y |
| packages/core/src/adapters/discord.ts | start | 调用 client.login | 功能正确性 | mock client.login | login 以 token 调用 | N |
| packages/core/src/adapters/discord.ts | start | login 失败时 reject | 错误处理 | mock client.login 抛出 | start() reject | N |
| packages/core/src/adapters/discord.ts | start | 调用 registerSlashCommands | 副作用 | mock client | login 后注册命令 | N |
| packages/core/src/adapters/discord.ts | stop | 调用 client.destroy | 功能正确性 | mock client.destroy | destroy 被调用 | N |
| packages/core/src/adapters/discord.ts | setupProject | 找到已有频道时返回 | 功能正确性 | mock guild 有匹配 channel | 返回 {channelId, platform: "discord"} | N |
| packages/core/src/adapters/discord.ts | setupProject | 找不到时创建新频道 | 功能正确性 | mock guild 无匹配 channel | guild.channels.create 被调用 | N |
| packages/core/src/adapters/discord.ts | setupProject | bot 不在任何服务器时抛出 | 错误处理 | mock client.guilds.cache 为空 | 抛出错误 | N |
| packages/core/src/adapters/discord.ts | setupProject | 频道名使用项目名 | 功能正确性 | project.name = "my-proj" | 频道名 = "cc2im-my-proj" | N |
| packages/core/src/adapters/discord.ts | createThread | 获取频道并在消息上创建 thread | 功能正确性 | mock channel.messages.fetch, message.startThread | 返回 thread.id | N |
| packages/core/src/adapters/discord.ts | createThread | 频道不存在时抛出 | 错误处理 | mock fetch 返回 null | 抛出 | N |
| packages/core/src/adapters/discord.ts | sendMessage | 发送到 thread 并返回消息 id | 功能正确性 | mock thread.send | 返回 msg.id | N |
| packages/core/src/adapters/discord.ts | sendMessage | 空内容 | 边界值 | content = "" | thread.send 以 "" 调用 | N |
| packages/core/src/adapters/discord.ts | sendMessage | thread 获取失败时抛出 | 错误处理 | mock fetch 抛出 | reject | N |
| packages/core/src/adapters/discord.ts | editMessage | 编辑已有消息 | 功能正确性 | mock msg.edit | edit 以新内容调用 | N |
| packages/core/src/adapters/discord.ts | uploadFile | 发送文件附件到 thread | 功能正确性 | mock thread.send | send 以 files 数组调用 | N |
| packages/core/src/adapters/discord.ts | uploadFile | 空 buffer | 边界值 | content = Buffer.alloc(0) | 不崩溃 | N |
| packages/core/src/adapters/discord.ts | addReaction | 添加 emoji 反应 | 功能正确性 | mock msg.react | react 以 emoji 调用 | N |
| packages/core/src/adapters/discord.ts | onMessage | 存储 handler | 功能正确性 | 调用 onMessage 传入 fn | handler 在 handleMessage 中使用 | N |
| packages/core/src/adapters/discord.ts | onMessage | 覆盖之前的 handler | 状态与生命周期 | 调用两次不同 handler | 仅第二个被调用 | N |
| packages/core/src/adapters/discord.ts | handleMessage | 忽略 bot 消息 | 功能正确性 | msg.author.bot = true | handler 不被调用 | N |
| packages/core/src/adapters/discord.ts | handleMessage | 正确映射 thread 频道 | 功能正确性 | msg 在 PublicThread 中 | channelId=parentId, threadId=channel.id | N |
| packages/core/src/adapters/discord.ts | handleMessage | 正确映射非 thread 频道 | 功能正确性 | msg 在普通文本频道 | channelId=channel.id, threadId=null | N |
| packages/core/src/adapters/discord.ts | handleMessage | 下载附件 | 功能正确性 | msg 有 1 个 attachment | handler 收到含 attachment buffer 的 IncomingMessage | N |
| packages/core/src/adapters/discord.ts | handleMessage | 附件下载失败 | 依赖失败 | fetch(attachment.url) reject | 错误被 catch 捕获 | N |
| packages/core/src/adapters/discord.ts | handleReaction | 忽略 bot 反应 | 功能正确性 | user.bot = true | handler 不被调用 | N |
| packages/core/src/adapters/discord.ts | handleReaction | 忽略非 thread 频道 | 功能正确性 | reaction 在文本频道 | handler 不被调用 | N |
| packages/core/src/adapters/discord.ts | handleReaction | 正确映射 reaction 字段 | 功能正确性 | reaction 在 thread | handler 收到正确 Reaction 对象 | N |
| packages/core/src/adapters/discord.ts | registerSlashCommands | 为每个 guild 注册命令 | 功能正确性 | mock REST.put, 2 guilds | rest.put 调用 2 次 | N |
| packages/core/src/adapters/discord.ts | registerSlashCommands | REST 失败时优雅处理 | 错误处理 | mock rest.put 抛出 | 记录日志, 不崩溃 | N |
| packages/core/src/adapters/discord.ts | registerSlashCommands | 注册全部 6 个斜杠命令 | 功能正确性 | mock REST | body 包含 6 个命令定义 | N |
| packages/core/src/adapters/discord.ts | registerSlashCommands | 无 guild 时无调用 | 边界值 | 空 guilds cache | 无错误, 无 rest.put 调用 | N |

---

## 统计

| 文件 | 已覆盖 | 未覆盖 | 总计 |
|------|--------|--------|------|
| config.ts | 24 | 29 | 53 |
| router.ts | 10 | 23 | 33 |
| formatter.ts | 19 | 34 | 53 |
| session.ts | 30 | 26 | 56 |
| store.ts | 21 | 27 | 48 |
| adapters/discord.ts | 1 | 34 | 35 |
| **合计** | **105** | **173** | **278** |

## 重点未覆盖区域

1. **config.ts**: 空 YAML 文件崩溃、环境变量空字符串行为、discord 节缺失 + env var 崩溃、saveConfig 错误路径、完整往返测试
2. **router.ts**: registerChannel 覆盖/跨平台隔离、getProject 返回引用语义、store 依赖失败传播、isManagementCommand 与 parseManagementCommand 一致性
3. **formatter.ts**: splitText 零直接覆盖、formatOutput 边界值(maxLen 精确边界)、extractImages 安全性(路径穿越)、SVG mimeType 不标准
4. **session.ts**: invoke 零测试覆盖(最复杂函数)、abort("") 匹配所有 key 的安全隐患、buildArgs 副作用验证
5. **store.ts**: 无效路径构造、SQL 注入防护验证、close 后操作行为、数据库生命周期往返
6. **adapters/discord.ts**: 仅 1 个已有测试, 几乎所有功能未覆盖(start/stop/setupProject/createThread/sendMessage/handleMessage/handleReaction/registerSlashCommands)
