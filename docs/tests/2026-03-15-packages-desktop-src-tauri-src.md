# 单元测试用例清单 — packages/desktop/src-tauri/src

> 生成日期: 2026-03-15

---

## Public API

### main.rs

| 函数 | 签名 |
|------|------|
| `find_node` | `fn find_node() -> Option<String>` |
| `find_cli_script` | `fn find_cli_script() -> Option<String>` |
| `main` | `fn main()` (Tauri 应用入口) |

### build.rs

> 仅包含 `tauri_build::build()` 调用，无可测逻辑。

---

## 单元测试用例

| 文件路径 | 函数名 | 测试用例名 | 用例类型 | 测试数据构造 | 通过条件 | 已覆盖 |
|----------|--------|-----------|---------|-------------|---------|--------|
| packages/desktop/src-tauri/src/main.rs | find_node | PATH 中存在 node 时返回 Some | 功能正确性 | 确保系统 PATH 包含 node | 返回 Some(含 "node" 的路径) | N |
| packages/desktop/src-tauri/src/main.rs | find_node | 所有候选路径均不存在时返回 None | 边界值 | mock Command::new 全部失败，HOME 无 nvm/fnm 目录 | 返回 None | N |
| packages/desktop/src-tauri/src/main.rs | find_node | /usr/local/bin/node 存在时返回该路径 | 功能正确性 | mock 仅 /usr/local/bin/node 成功 | 返回 Some("/usr/local/bin/node") | N |
| packages/desktop/src-tauri/src/main.rs | find_node | /opt/homebrew/bin/node 存在时返回该路径 | 功能正确性 | mock 仅 /opt/homebrew/bin/node 成功 | 返回 Some("/opt/homebrew/bin/node") | N |
| packages/desktop/src-tauri/src/main.rs | find_node | NVM 安装的 node 被发现（~/.nvm/versions/node/vX/bin/node） | 功能正确性 | 创建临时 nvm 目录结构 | 返回 Some(含 nvm 路径) | N |
| packages/desktop/src-tauri/src/main.rs | find_node | NVM 多版本时选择最新版本（目录名降序排列） | 功能正确性 | 创建 v18.0.0 和 v20.0.0 目录 | 返回 v20.0.0 的路径 | N |
| packages/desktop/src-tauri/src/main.rs | find_node | fnm 安装的 node 被发现 | 功能正确性 | 创建临时 fnm 目录结构 (installation/bin/node) | 返回 Some(含 fnm 路径) | N |
| packages/desktop/src-tauri/src/main.rs | find_node | HOME 环境变量未设置时跳过 nvm/fnm 检查 | 边界值 | unset HOME | 仅检查固定路径候选，不崩溃 | N |
| packages/desktop/src-tauri/src/main.rs | find_node | nvm 目录存在但无版本子目录时继续搜索 | 边界值 | 创建空 ~/.nvm/versions/node/ 目录 | 继续检查 fnm 或返回 None | N |
| packages/desktop/src-tauri/src/main.rs | find_node | 候选路径按优先级顺序返回第一个可用 | 跨函数交互 | "node" 在 PATH 中可用 | 返回 "node"（第一个候选） | N |
| packages/desktop/src-tauri/src/main.rs | find_cli_script | packages/cli/dist/cli.js 存在时返回该路径 | 功能正确性 | 创建该文件 | 返回 Some("packages/cli/dist/cli.js") | N |
| packages/desktop/src-tauri/src/main.rs | find_cli_script | 全局安装 cc2im 命令存在时返回 "cc2im" | 功能正确性 | 创建 ./cc2im 文件 | 返回 Some("cc2im") | N |
| packages/desktop/src-tauri/src/main.rs | find_cli_script | /usr/local/bin/cc2im 存在时返回该路径 | 功能正确性 | 该路径存在 | 返回 Some("/usr/local/bin/cc2im") | N |
| packages/desktop/src-tauri/src/main.rs | find_cli_script | 所有候选路径均不存在时返回 None | 边界值 | 确保所有候选路径不存在 | 返回 None | N |
| packages/desktop/src-tauri/src/main.rs | find_cli_script | 候选路径按优先级：本地开发 > 全局命令 > PATH 位置 | 跨函数交互 | 同时存在多个候选 | 返回第一个匹配的（packages/cli/dist/cli.js） | N |
| packages/desktop/src-tauri/src/main.rs | main | find_node 返回 None 时 webview 显示 Node.js 未找到错误 | 错误处理 | mock find_node=None | window.navigate 到含错误消息的 data: URL | N |
| packages/desktop/src-tauri/src/main.rs | main | find_cli_script 返回 None 时 webview 显示 CLI 未找到错误 | 错误处理 | mock find_node=Some, find_cli_script=None | 错误页面含 "cc2im CLI not found" | N |
| packages/desktop/src-tauri/src/main.rs | main | 服务器启动成功后 webview 导航到 http://127.0.0.1:{port} | 功能正确性 | mock Command 成功，stdout 输出含端口号 | window.navigate 到正确 URL | N |
| packages/desktop/src-tauri/src/main.rs | main | 从 stdout 正确解析端口号 | 功能正确性 | mock stdout 输出 "listening on :8080" | port.load() === 8080 | N |
| packages/desktop/src-tauri/src/main.rs | main | stdout 无端口信息时 port 为 0，显示错误 | 边界值 | mock stdout 输出无端口信息 | port.load() === 0，显示错误页面 | N |
| packages/desktop/src-tauri/src/main.rs | main | Command::spawn 失败时显示错误 | 依赖失败 | mock spawn 返回 Err | 错误页面含 "Failed to start server" | N |
| packages/desktop/src-tauri/src/main.rs | main | 关闭窗口时隐藏而非退出（最小化到托盘） | 功能正确性 | 触发 CloseRequested 事件 | window.hide() 被调用，api.prevent_close() 被调用 | N |
| packages/desktop/src-tauri/src/main.rs | main | 托盘菜单 "Open" 显示并聚焦窗口 | 功能正确性 | 触发 menu event "open" | window.show() 和 window.set_focus() 被调用 | N |
| packages/desktop/src-tauri/src/main.rs | main | 托盘菜单 "Quit" 退出进程 | 功能正确性 | 触发 menu event "quit" | process::exit(0) 被调用 | N |
| packages/desktop/src-tauri/src/main.rs | main | 托盘图标左键单击显示窗口 | 功能正确性 | 触发 TrayIconEvent::Click Left Up | window.show() 和 window.set_focus() 被调用 | N |
| packages/desktop/src-tauri/src/main.rs | main | child process 引用保存在 Arc<Mutex> 中 | 状态与生命周期 | 启动成功后检查 child_process | guard 为 Some(child) | N |
