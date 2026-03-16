# 单元测试用例清单 — packages/cli/src

> 生成日期: 2026-03-15

---

## Public API

### service.ts

| 函数 | 签名 |
|------|------|
| `detectPlatform` | `() => ServicePlatform` |
| `resolveConfigPath` | `(explicit?: string) => string` |
| `generateSystemdUnit` | `(paths: ServicePaths) => string` |
| `generateLaunchdPlist` | `(paths: ServicePaths) => string` |
| `install` | `(configPath?: string) => void` |
| `uninstall` | `() => void` |
| `start` | `() => void` |
| `stop` | `() => void` |
| `restart` | `() => void` |
| `status` | `() => void` |
| `logs` | `() => void` |

### index.ts

| 函数 | 签名 |
|------|------|
| `main` | `() => Promise<void>` |
| `formatUserError` | `(err: unknown) => string` |
| `stripStatusIcon` | `(name: string) => string` |
| `generateThreadTitle` | `(userMessage: string, claudeCommand: string) => Promise<string>` |

### cli.ts

| 函数 | 签名 |
|------|------|
| _(顶层脚本)_ | CLI 入口，无导出函数；解析 `process.argv` 执行对应命令 |

---

## 单元测试用例

| 文件路径 | 函数名 | 测试用例名 | 用例类型 | 测试数据构造 | 通过条件 | 已覆盖 |
|----------|--------|-----------|---------|-------------|---------|--------|
| packages/cli/src/service.ts | detectPlatform | macOS 平台返回 "launchd" | 功能正确性 | mock `process.platform` 为 "darwin" | 返回值 === "launchd" | N |
| packages/cli/src/service.ts | detectPlatform | Linux 平台返回 "systemd" | 功能正确性 | mock `process.platform` 为 "linux" | 返回值 === "systemd" | N |
| packages/cli/src/service.ts | detectPlatform | Windows 等其他平台返回 "systemd" | 边界值 | mock `process.platform` 为 "win32" | 返回值 === "systemd" | N |
| packages/cli/src/service.ts | resolveConfigPath | 传入显式路径时直接返回绝对路径 | 功能正确性 | 传入 "/my/config.yaml" | 返回 "/my/config.yaml" | Y |
| packages/cli/src/service.ts | resolveConfigPath | 传入相对路径时 resolve 为绝对路径 | 功能正确性 | 传入 "relative/config.yaml" | 返回 resolve("relative/config.yaml") | N |
| packages/cli/src/service.ts | resolveConfigPath | 未传参时 cwd 存在 config.yaml 则返回 cwd 路径 | 功能正确性 | mock existsSync 返回 true | 返回 resolve("config.yaml") | Y |
| packages/cli/src/service.ts | resolveConfigPath | 未传参且 cwd 无 config.yaml 时返回 ~/.config/cc2im/config.yaml | 边界值 | mock existsSync 返回 false | 返回 join(homedir(), ".config", "cc2im", "config.yaml") | N |
| packages/cli/src/service.ts | resolveConfigPath | 传入空字符串 | 边界值 | 传入 "" | 空字符串为 falsy，应走默认逻辑 | N |
| packages/cli/src/service.ts | generateSystemdUnit | 生成包含所有必要 section 的 unit 文件 | 功能正确性 | 传入有效 ServicePaths | 包含 [Unit], [Service], [Install] | Y |
| packages/cli/src/service.ts | generateSystemdUnit | ExecStart 包含正确的 node 和 entry 路径 | 功能正确性 | 传入指定 nodePath 和 entryPath | ExecStart 行包含两个路径 | Y |
| packages/cli/src/service.ts | generateSystemdUnit | 包含 CC2IM_CONFIG 环境变量 | 功能正确性 | 传入指定 configPath | 包含 Environment=CC2IM_CONFIG=... | Y |
| packages/cli/src/service.ts | generateSystemdUnit | 路径含空格时正确嵌入（无转义） | 安全 | nodePath="/usr/bin/my node", entryPath="/path with spaces/index.js" | 路径原样嵌入（当前实现不处理空格） | N |
| packages/cli/src/service.ts | generateLaunchdPlist | 生成有效的 XML plist | 功能正确性 | 传入有效 ServicePaths | 包含 <?xml, <plist, Label=com.cc2im | Y |
| packages/cli/src/service.ts | generateLaunchdPlist | 包含 KeepAlive 和 RunAtLoad | 功能正确性 | 传入有效 ServicePaths | 包含对应 key | Y |
| packages/cli/src/service.ts | generateLaunchdPlist | 日志路径指向 ~/.local/share/cc2im/ | 功能正确性 | 传入有效 ServicePaths | StandardOutPath 和 StandardErrorPath 包含正确目录 | N |
| packages/cli/src/service.ts | generateLaunchdPlist | 路径含 XML 特殊字符 (<, &) 时不转义（潜在 bug） | 安全 | configPath 包含 "&" 或 "<" | 验证行为（当前不做转义） | N |
| packages/cli/src/service.ts | install | systemd 平台：写入 unit 文件并执行 daemon-reload/enable/start | 功能正确性 | mock detectPlatform="systemd", mock fs 和 execFileSync | 按序调用 writeFileSync、systemctl daemon-reload/enable/start | N |
| packages/cli/src/service.ts | install | launchd 平台：写入 plist 文件并执行 launchctl load | 功能正确性 | mock detectPlatform="launchd", mock fs 和 execFileSync | 按序调用 writeFileSync、mkdirSync(logDir)、launchctl load | N |
| packages/cli/src/service.ts | install | configPath 不存在时打印错误并 exit(1) | 错误处理 | mock existsSync 返回 false | console.error 被调用，process.exit(1) 被调用 | N |
| packages/cli/src/service.ts | install | systemctl 命令失败时抛出 Error | 依赖失败 | mock execFileSync 抛出 { stderr: "unit not found" } | 抛出 Error 包含 stderr 内容 | N |
| packages/cli/src/service.ts | uninstall | systemd 平台：停止、禁用、删除 service 文件并 daemon-reload | 功能正确性 | mock detectPlatform="systemd", mock fs 和 execFileSync | 按序调用 stop/disable/unlinkSync/daemon-reload | N |
| packages/cli/src/service.ts | uninstall | launchd 平台：unload 并删除 plist 文件 | 功能正确性 | mock detectPlatform="launchd", mock fs 和 execFileSync | 调用 launchctl unload 和 unlinkSync | N |
| packages/cli/src/service.ts | uninstall | service 文件不存在时打印 "not installed" 并返回 | 边界值 | mock existsSync 返回 false | console.log 包含 "not installed"，不调用 systemctl/launchctl | N |
| packages/cli/src/service.ts | uninstall | systemctl stop 失败时静默忽略继续执行 | 错误处理 | mock stop 抛出，但 disable/unlinkSync 正常 | 不抛出异常，后续步骤继续执行 | N |
| packages/cli/src/service.ts | start | systemd 平台调用 systemctl start | 功能正确性 | mock detectPlatform="systemd", mock execFileSync | 调用 systemctl --user start cc2im.service | N |
| packages/cli/src/service.ts | start | launchd 平台调用 launchctl start | 功能正确性 | mock detectPlatform="launchd", mock execFileSync | 调用 launchctl start com.cc2im | N |
| packages/cli/src/service.ts | start | 底层命令失败时抛出 Error | 依赖失败 | mock execFileSync 抛出 | 抛出包含错误信息的 Error | N |
| packages/cli/src/service.ts | stop | systemd 平台调用 systemctl stop | 功能正确性 | mock 同 start | 调用 systemctl --user stop cc2im.service | N |
| packages/cli/src/service.ts | stop | launchd 平台调用 launchctl stop | 功能正确性 | mock 同 start | 调用 launchctl stop com.cc2im | N |
| packages/cli/src/service.ts | restart | systemd 平台调用 systemctl restart | 功能正确性 | mock detectPlatform="systemd", mock execFileSync | 调用 systemctl --user restart cc2im.service | N |
| packages/cli/src/service.ts | restart | launchd 平台先 stop 再 start | 功能正确性 | mock detectPlatform="launchd", mock execFileSync | 按序调用 launchctl stop 和 launchctl start | N |
| packages/cli/src/service.ts | restart | launchd 平台 stop 失败时 start 是否仍执行 | 错误处理 | mock stop 抛出 | 当前实现会抛出，不会继续 start（与 uninstall 行为不同） | N |
| packages/cli/src/service.ts | status | systemd 平台调用 systemctl status 并输出结果 | 功能正确性 | mock execFileSync 返回 "active (running)" | console.log 包含该字符串 | N |
| packages/cli/src/service.ts | status | systemd 平台 systemctl 失败时输出错误信息 | 错误处理 | mock execFileSync 抛出 Error("inactive") | console.log 包含 "inactive" | N |
| packages/cli/src/service.ts | status | launchd 平台调用 launchctl list 并输出结果 | 功能正确性 | mock execFileSync 返回列表输出 | console.log 包含该输出 | N |
| packages/cli/src/service.ts | status | launchd 平台 launchctl list 失败时输出 "not running" | 错误处理 | mock execFileSync 抛出 | console.log 包含 "not running" | N |
| packages/cli/src/service.ts | logs | systemd 平台 spawn journalctl -f | 功能正确性 | mock spawn | 调用 spawn("journalctl", [..., "-f", ...]) | N |
| packages/cli/src/service.ts | logs | launchd 平台 tail -f 日志文件 | 功能正确性 | mock spawn 和 existsSync=true | 调用 spawn("tail", ["-f", logPath]) | N |
| packages/cli/src/service.ts | logs | launchd 平台日志文件不存在时打印 "No logs yet" | 边界值 | mock existsSync 返回 false | console.log 包含 "No logs yet"，不调用 spawn | N |
| packages/cli/src/index.ts | formatUserError | ENOENT 错误码返回安装提示 | 功能正确性 | Error + code: "ENOENT" | 包含 "not installed" 和安装链接 | Y |
| packages/cli/src/index.ts | formatUserError | 消息含 ENOENT（无 code）返回安装提示 | 功能正确性 | Error("Something ENOENT happened") | 包含 "not installed" | Y |
| packages/cli/src/index.ts | formatUserError | EACCES 错误码返回权限提示 | 功能正确性 | Error + code: "EACCES" | 包含 "Permission denied" | Y |
| packages/cli/src/index.ts | formatUserError | auth 相关关键词返回登录提示 | 功能正确性 | Error("auth failed") 等 | 包含 "not logged in" | Y |
| packages/cli/src/index.ts | formatUserError | 超时错误返回超时提示 | 功能正确性 | Error("timed out") | 包含 "timed out" | Y |
| packages/cli/src/index.ts | formatUserError | 未知错误返回通用错误信息 | 功能正确性 | Error("Something unexpected") | 返回 "❌ Error: Something unexpected" | Y |
| packages/cli/src/index.ts | formatUserError | 非 Error 值 (string/number/null/undefined) | 边界值 | 传入 "raw string", 42, null, undefined | 正确转换为字符串 | Y |
| packages/cli/src/index.ts | formatUserError | ENOENT 优先级高于 auth 关键词 | 跨函数交互 | Error("auth ENOENT") + code: "ENOENT" | 返回安装提示而非登录提示 | Y |
| packages/cli/src/index.ts | formatUserError | 所有返回值以 ❌ 开头 | 功能正确性 | 各种错误类型 | 每个结果都匹配 /^❌/ | Y |
| packages/cli/src/index.ts | stripStatusIcon | 移除 🔄 前缀 | 功能正确性 | "🔄 Some title" | 返回 "Some title" | Y |
| packages/cli/src/index.ts | stripStatusIcon | 移除 ✅ 前缀 | 功能正确性 | "✅ Completed" | 返回 "Completed" | Y |
| packages/cli/src/index.ts | stripStatusIcon | 无图标前缀时原样返回 | 边界值 | "Regular title" | 返回 "Regular title" | Y |
| packages/cli/src/index.ts | stripStatusIcon | 空字符串 | 边界值 | "" | 返回 "" | Y |
| packages/cli/src/index.ts | stripStatusIcon | 图标在中间不移除 | 功能正确性 | "Title with 🔄 inside" | 返回原字符串 | Y |
| packages/cli/src/index.ts | stripStatusIcon | 多个图标只移除第一个 | 功能正确性 | "🔄 ✅ Both" | 返回 "✅ Both" | Y |
| packages/cli/src/index.ts | generateThreadTitle | 从 stream-json 输出提取 result 作为标题 | 功能正确性 | mock execFile 返回含 result 事件的 NDJSON | 返回 result 中的文本 | Y |
| packages/cli/src/index.ts | generateThreadTitle | 标题超过 15 字符时截断 | 边界值 | mock execFile 返回超长 result | 返回值长度 <= 15 | Y |
| packages/cli/src/index.ts | generateThreadTitle | result 为空时回退到 userMessage 截取 | 边界值 | mock execFile 返回 result="" | 返回 userMessage.slice(0, 15) | Y |
| packages/cli/src/index.ts | generateThreadTitle | execFile 出错时 reject | 错误处理 | mock execFile 回调 err | Promise reject 包含错误信息 | Y |
| packages/cli/src/index.ts | generateThreadTitle | 传入正确的 claude 命令参数 | 功能正确性 | mock execFile 检查参数 | 包含 --print, --output-format stream-json, --max-turns 1, -p | Y |
| packages/cli/src/index.ts | generateThreadTitle | userMessage 为空字符串时回退到 "New conversation" | 边界值 | mock execFile 返回 result=""，userMessage="" | 返回 "New conversation" | N |
| packages/cli/src/index.ts | generateThreadTitle | stdout 包含非 JSON 行时不崩溃 | 错误处理 | mock execFile 返回混合 JSON/非JSON 内容 | 正常解析有效 JSON 行，忽略无效行 | N |
| packages/cli/src/index.ts | generateThreadTitle | stdout 完全没有 result 事件时回退 | 边界值 | mock execFile 返回仅含 system 事件 | 返回 userMessage.slice(0, 15) 或 "New conversation" | N |
| packages/cli/src/index.ts | main | 正常启动流程：加载配置、创建 store、启动 adapter | 功能正确性 | mock 所有外部依赖 (loadConfig, Store, SessionManager, DiscordAdapter) | 按序调用 start、setupProject、registerChannel | N |
| packages/cli/src/index.ts | main | 无 discord token 时不创建 DiscordAdapter | 边界值 | mock loadConfig 返回 discord.token="" | adapters 数组为空 | N |
| packages/cli/src/index.ts | main | 有 pending restarts 时恢复 session | 功能正确性 | mock store.getPendingRestarts 返回非空列表 | 调用 sessionManager.invoke 恢复 session | N |
| packages/cli/src/index.ts | main | pending restart 恢复失败时不影响其他恢复 | 错误处理 | mock 第一个恢复失败，第二个成功 | 仅第一个 reject，第二个正常完成 | N |
| packages/cli/src/index.ts | main | SIGINT 触发 graceful shutdown | 副作用 | mock process.on 捕获 SIGINT handler 后调用 | 调用 sessionManager.abortAll, adapter.stop, store.close, process.exit(0) | N |
| packages/cli/src/index.ts | main | shutdown 重复调用时幂等 | 幂等性 | 连续调用 shutdown 两次 | 第二次调用直接返回（shuttingDown=true） | N |
| packages/cli/src/index.ts | main | shutdown 保存活跃 thread 到 pending restart | 副作用 | mock sessionManager.activeKeys 返回 ["discord:123"] | 调用 store.markPendingRestart("123", "discord") | N |
