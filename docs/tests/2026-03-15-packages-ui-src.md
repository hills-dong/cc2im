# 单元测试用例清单 — packages/ui/src

> 生成日期: 2026-03-15

---

## Public API

### lib/stores/connection.ts

| 函数 | 签名 |
|------|------|
| `on` | `(type: string, handler: (data: any) => void) => () => void` |
| `connect` | `(url: string) => void` |
| `send` | `(data: unknown) => void` |
| `connectionStatus` | `writable<ConnectionStatus>` (Svelte store) |

内部函数:

| 函数 | 签名 |
|------|------|
| `dispatch` | `(event: any) => void` |
| `scheduleReconnect` | `(url: string) => void` |

### lib/stores/chat.ts

| 函数 | 签名 |
|------|------|
| `sendMessage` | `(project: string, message: string, sessionId?: string) => void` |
| `currentProject` | `writable<string \| null>` (Svelte store) |
| `currentSessionId` | `writable<string \| null>` (Svelte store) |
| `sessions` | `writable<Map<string, Session>>` (Svelte store) |

### main.ts

> 仅包含 Svelte App mount 调用，无可测逻辑。

### Svelte 组件 (*.svelte)

> Svelte 组件（App, Chat, ChatInput, Sidebar, Config, Stats, Onboarding, MessageBubble）属于 UI 层，更适合 E2E / 组件测试，不在本单测范围内。

---

## 单元测试用例

| 文件路径 | 函数名 | 测试用例名 | 用例类型 | 测试数据构造 | 通过条件 | 已覆盖 |
|----------|--------|-----------|---------|-------------|---------|--------|
| packages/ui/src/lib/stores/connection.ts | on | 注册 handler 后收到匹配事件时调用 | 功能正确性 | on("chat.done", handler)，然后内部 dispatch({ type: "chat.done" }) | handler 被调用一次 | N |
| packages/ui/src/lib/stores/connection.ts | on | 返回的 unsubscribe 函数移除 handler | 功能正确性 | const unsub = on("x", h); unsub(); dispatch({ type: "x" }) | handler 不被调用 | N |
| packages/ui/src/lib/stores/connection.ts | on | 同类型注册多个 handler 全部触发 | 功能正确性 | on("x", h1); on("x", h2); dispatch({ type: "x" }) | h1 和 h2 都被调用 | N |
| packages/ui/src/lib/stores/connection.ts | on | 不匹配的事件类型不触发 handler | 功能正确性 | on("a", handler); dispatch({ type: "b" }) | handler 不被调用 | N |
| packages/ui/src/lib/stores/connection.ts | on | 无注册 handler 的事件类型 dispatch 不崩溃 | 边界值 | dispatch({ type: "unregistered" }) | 无异常 | N |
| packages/ui/src/lib/stores/connection.ts | on | handler 抛出异常时不影响其他 handler | 错误处理 | h1 抛出 Error, h2 正常; dispatch | h2 仍被调用（当前 forEach 会中断，属于潜在 bug） | N |
| packages/ui/src/lib/stores/connection.ts | connect | 连接成功时 connectionStatus 变为 "connected" | 功能正确性 | mock WebSocket, 触发 onopen | connectionStatus store 值 === "connected" | N |
| packages/ui/src/lib/stores/connection.ts | connect | 连接过程中 connectionStatus 为 "connecting" | 状态与生命周期 | connect(url) 后立即读取 | connectionStatus === "connecting" | N |
| packages/ui/src/lib/stores/connection.ts | connect | 连接关闭时 connectionStatus 变为 "disconnected" | 状态与生命周期 | 触发 ws.onclose | connectionStatus === "disconnected" | N |
| packages/ui/src/lib/stores/connection.ts | connect | 连接成功后 reconnectAttempt 重置为 0 | 状态与生命周期 | 先失败重连几次（reconnectAttempt>0），再成功连接 | reconnectAttempt === 0 | N |
| packages/ui/src/lib/stores/connection.ts | connect | 连接成功后自动发送 sync.state | 副作用 | 触发 onopen | ws.send 被调用，参数含 { type: "sync.state" } | N |
| packages/ui/src/lib/stores/connection.ts | connect | 收到消息时 dispatch 到注册的 handler | 功能正确性 | 注册 handler，触发 ws.onmessage 含 JSON | handler 收到解析后的对象 | N |
| packages/ui/src/lib/stores/connection.ts | connect | 收到非 JSON 消息时不崩溃 | 错误处理 | 触发 ws.onmessage 含非 JSON 字符串 | 不抛出异常（try/catch 捕获） | N |
| packages/ui/src/lib/stores/connection.ts | connect | 断开后自动重连 | 状态与生命周期 | 触发 onclose | scheduleReconnect 被调用，setTimeout 触发后 connect 再次调用 | N |
| packages/ui/src/lib/stores/connection.ts | send | ws 打开时发送 JSON 序列化数据 | 功能正确性 | mock ws.readyState=OPEN, send({ type: "x" }) | ws.send 被调用，参数为 JSON 字符串 | N |
| packages/ui/src/lib/stores/connection.ts | send | ws 未连接时不发送 | 边界值 | ws=null 或 ws.readyState !== OPEN | ws.send 不被调用，无异常 | N |
| packages/ui/src/lib/stores/connection.ts | send | ws 为 null 时不崩溃 | 边界值 | 不先调用 connect | 无异常 | N |
| packages/ui/src/lib/stores/connection.ts | scheduleReconnect | 首次重连延迟为 0ms | 功能正确性 | reconnectAttempt=0 | setTimeout delay=0 | N |
| packages/ui/src/lib/stores/connection.ts | scheduleReconnect | 第二次重连延迟为 1000ms | 功能正确性 | reconnectAttempt=1 | setTimeout delay=1000 | N |
| packages/ui/src/lib/stores/connection.ts | scheduleReconnect | 超出 delays 数组后使用 MAX_RECONNECT_DELAY | 边界值 | reconnectAttempt=10 | setTimeout delay=30000 | N |
| packages/ui/src/lib/stores/connection.ts | scheduleReconnect | 每次调用递增 reconnectAttempt | 状态与生命周期 | 调用两次 | reconnectAttempt 从 n 增加到 n+2 | N |
| packages/ui/src/lib/stores/chat.ts | sendMessage | 创建新 session 并添加 user 和 streaming assistant 消息 | 功能正确性 | sendMessage("proj", "hello") | sessions store 包含 sessKey，messages 有 2 条（user + assistant streaming） | N |
| packages/ui/src/lib/stores/chat.ts | sendMessage | user 消息内容与传入 message 一致 | 功能正确性 | sendMessage("proj", "test msg") | 第一条消息 role="user", content="test msg" | N |
| packages/ui/src/lib/stores/chat.ts | sendMessage | assistant 消息初始为空且 streaming=true | 功能正确性 | sendMessage("proj", "hello") | 第二条消息 role="assistant", content="", streaming=true | N |
| packages/ui/src/lib/stores/chat.ts | sendMessage | 传入 sessionId 时使用 sessionId 作为 sessKey | 功能正确性 | sendMessage("proj", "hi", "existing-session") | sessions store 含 key "existing-session" | N |
| packages/ui/src/lib/stores/chat.ts | sendMessage | 未传 sessionId 时 sessKey 为 "new-{project}" | 功能正确性 | sendMessage("proj", "hi") | sessions store 含 key "new-proj" | N |
| packages/ui/src/lib/stores/chat.ts | sendMessage | 重置 streamBuffer | 副作用 | 先手动设置 streamBuffer="old"，再 sendMessage | streamBuffer === "" | N |
| packages/ui/src/lib/stores/chat.ts | sendMessage | 调用 connection.send 发送 chat.send 消息 | 副作用 | mock send | send 被调用，参数含 { type: "chat.send", project, message, threadKey } | N |
| packages/ui/src/lib/stores/chat.ts | sendMessage | threadKey 格式为 "web:{project}:{timestamp}" | 功能正确性 | mock Date.now | threadKey 匹配格式 | N |
| packages/ui/src/lib/stores/chat.ts | sendMessage | 向已有 session 追加消息不覆盖旧消息 | 状态与生命周期 | 先 sendMessage 一次，再 sendMessage 到同一 sessKey | messages 长度增加 2（新 user + assistant） | N |
| packages/ui/src/lib/stores/chat.ts | chat.stream handler | 文本流追加到 streamBuffer 并更新 assistant 消息 | 功能正确性 | 先 sendMessage 创建 session，再 dispatch chat.stream 事件 | assistant 消息 content 包含流式文本 | N |
| packages/ui/src/lib/stores/chat.ts | chat.stream handler | 非 text contentType 不更新 | 边界值 | dispatch { type: "chat.stream", contentType: "tool_use" } | assistant 消息 content 不变 | N |
| packages/ui/src/lib/stores/chat.ts | chat.stream handler | 无对应 session 时不崩溃 | 边界值 | dispatch chat.stream 使用不存在的 sessionId | 无异常，sessions 不变 | N |
| packages/ui/src/lib/stores/chat.ts | chat.stream handler | 最后一条消息非 streaming 时不更新 | 边界值 | session 最后一条消息 streaming=false | sessions 不变 | N |
| packages/ui/src/lib/stores/chat.ts | chat.stream handler | 多次 stream 事件累加文本 | 功能正确性 | 连续 dispatch 3 个 chat.stream | content = 三次文本拼接 | N |
| packages/ui/src/lib/stores/chat.ts | chat.done handler | 完成时设置 streaming=false 并更新 content 为 result | 功能正确性 | dispatch chat.done 含 result | assistant 消息 streaming=false, content=result | N |
| packages/ui/src/lib/stores/chat.ts | chat.done handler | 更新 session id 为 realSessionId | 功能正确性 | dispatch chat.done 含 realSessionId="abc" | session.id === "abc" | N |
| packages/ui/src/lib/stores/chat.ts | chat.done handler | 设置 tokens 统计 | 功能正确性 | dispatch chat.done 含 tokens | assistant 消息 tokens.input 和 tokens.output 正确 | N |
| packages/ui/src/lib/stores/chat.ts | chat.done handler | 清理 threadKeyMap 映射 | 副作用 | dispatch chat.done 后再 dispatch chat.stream 用同一 sessionId | 不再更新之前的 session | N |
| packages/ui/src/lib/stores/chat.ts | chat.done handler | 重置 streamBuffer | 副作用 | dispatch chat.done 后检查 streamBuffer | streamBuffer === "" | N |
| packages/ui/src/lib/stores/chat.ts | chat.done handler | realSessionId 为 null 时保留原 session.id | 边界值 | dispatch chat.done 含 realSessionId=null，session.id="orig" | session.id === "orig"（因为 null ?? "orig" = "orig"...但实际是 null） | N |
| packages/ui/src/lib/stores/chat.ts | chat.error handler | 错误时设置 streaming=false 并显示错误信息 | 错误处理 | dispatch chat.error 含 error.message | assistant 消息 content 包含 "Error: ..." | N |
| packages/ui/src/lib/stores/chat.ts | chat.error handler | 重置 streamBuffer | 副作用 | dispatch chat.error | streamBuffer === "" | N |
| packages/ui/src/lib/stores/chat.ts | chat.error handler | 清理 threadKeyMap 映射 | 副作用 | dispatch chat.error | 后续同 sessionId 的事件不再关联 | N |
| packages/ui/src/lib/stores/chat.ts | chat.error handler | error.message 为 undefined 时显示 "Unknown error" | 边界值 | dispatch chat.error 含 error={} | content 包含 "Unknown error" | N |
| packages/ui/src/lib/stores/chat.ts | chat.error handler | session 不存在时不崩溃 | 边界值 | dispatch chat.error 使用不存在的 sessionId | 无异常 | N |
| packages/ui/src/lib/stores/chat.ts | chat.error handler | 最后一条消息非 streaming 时不更新 | 边界值 | 最后一条消息 streaming=false | sessions 不变 | N |
