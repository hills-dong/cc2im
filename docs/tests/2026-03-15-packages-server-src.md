# 单元测试用例清单 — packages/server/src

> 生成日期: 2026-03-15

---

## Public API

### auth.ts

| 函数 | 签名 |
|------|------|
| `hashPassword` | `(password: string) => Promise<string>` |
| `verifyPassword` | `(password: string, stored: string) => Promise<boolean>` |
| `signToken` | `(secret: string, expiresInSec: number) => string` |
| `verifyToken` | `(token: string, secret: string) => boolean` |

### api.ts

| 函数 | 签名 |
|------|------|
| `handleApi` | `(req: http.IncomingMessage, res: http.ServerResponse, ctx: ApiContext) => Promise<void>` |

内部辅助函数（非导出但需覆盖）:

| 函数 | 签名 |
|------|------|
| `json` | `(res: ServerResponse, status: number, data: unknown) => void` |
| `error` | `(res: ServerResponse, status: number, code: string, message: string) => void` |
| `readBody` | `(req: IncomingMessage) => Promise<string>` |
| `maskConfig` | `(config: AppConfig) => unknown` |

### ws.ts

| 函数 | 签名 |
|------|------|
| `attachWebSocket` | `(server: http.Server, ctx: WsContext) => WebSocketServer` |

内部辅助函数:

| 函数 | 签名 |
|------|------|
| `send` | `(ws: WebSocket, msg: unknown) => void` |
| `broadcast` | `(clients: Set<WebSocket>, msg: unknown) => void` |
| `handleChatSend` | `(ws, clients, ctx, payload) => Promise<void>` |

### server.ts

| 函数 | 签名 |
|------|------|
| `createServer` | `(options: ServerOptions) => Promise<http.Server>` |

内部辅助函数:

| 函数 | 签名 |
|------|------|
| `serveStatic` | `(res: ServerResponse, staticDir: string, urlPath: string) => void` |

### contracts/api.ts

> 纯类型定义文件，无需单元测试。

---

## 单元测试用例

| 文件路径 | 函数名 | 测试用例名 | 用例类型 | 测试数据构造 | 通过条件 | 已覆盖 |
|----------|--------|-----------|---------|-------------|---------|--------|
| packages/server/src/auth.ts | hashPassword | 正确哈希密码并返回 salt:hash 格式 | 功能正确性 | 传入 "mypassword" | 返回值匹配 /^[0-9a-f]+:[0-9a-f]+$/ | Y |
| packages/server/src/auth.ts | hashPassword | 每次调用生成不同的 hash（随机 salt） | 幂等性 | 对同一密码调用两次 | 两次返回值不同 | N |
| packages/server/src/auth.ts | hashPassword | 空字符串密码 | 边界值 | 传入 "" | 不抛出，返回有效格式 | N |
| packages/server/src/auth.ts | verifyPassword | 正确密码验证通过 | 功能正确性 | hashPassword("pw") 后用 "pw" 验证 | 返回 true | Y |
| packages/server/src/auth.ts | verifyPassword | 错误密码验证失败 | 功能正确性 | hashPassword("pw") 后用 "wrong" 验证 | 返回 false | Y |
| packages/server/src/auth.ts | verifyPassword | stored 格式无效（无冒号）返回 false | 错误处理 | stored = "invalidhash" | 返回 false | N |
| packages/server/src/auth.ts | verifyPassword | stored 为空字符串返回 false | 边界值 | stored = "" | 返回 false | N |
| packages/server/src/auth.ts | verifyPassword | stored 含多个冒号时只取第一个分隔 | 边界值 | stored = "salt:hash:extra" | split(":") 只取前两个，hash 不匹配返回 false | N |
| packages/server/src/auth.ts | signToken | 生成三段式 JWT (header.payload.signature) | 功能正确性 | signToken("secret", 3600) | 返回值 split(".") 长度 === 3 | Y |
| packages/server/src/auth.ts | signToken | header 包含 HS256 算法声明 | 功能正确性 | 解码 header 部分 | 包含 { alg: "HS256", typ: "JWT" } | N |
| packages/server/src/auth.ts | signToken | payload 包含正确的 iat 和 exp | 功能正确性 | 解码 payload 部分 | exp - iat === expiresInSec | N |
| packages/server/src/auth.ts | signToken | expiresInSec=0 时 exp 约等于当前时间 | 边界值 | signToken("secret", 0) | exp ≈ Math.floor(Date.now()/1000) | N |
| packages/server/src/auth.ts | signToken | 负数 expiresInSec 生成已过期 token | 边界值 | signToken("secret", -100) | 可生成 token，verifyToken 返回 false | N |
| packages/server/src/auth.ts | verifyToken | 有效 token 验证通过 | 功能正确性 | signToken 生成的 token | 返回 true | Y |
| packages/server/src/auth.ts | verifyToken | 过期 token 验证失败 | 功能正确性 | signToken("s", -1) 生成的 token | 返回 false | Y |
| packages/server/src/auth.ts | verifyToken | 篡改 signature 验证失败 | 功能正确性 | token + "x" | 返回 false | Y |
| packages/server/src/auth.ts | verifyToken | 非三段式格式返回 false | 错误处理 | "not.a.valid.token" (4段) | 返回 false | N |
| packages/server/src/auth.ts | verifyToken | 两段式格式返回 false | 错误处理 | "header.payload" | 返回 false | N |
| packages/server/src/auth.ts | verifyToken | 空字符串返回 false | 边界值 | "" | 返回 false | N |
| packages/server/src/auth.ts | verifyToken | payload 不是有效 JSON 时返回 false | 错误处理 | 构造 header.invalidBase64.signature | 返回 false（catch 分支） | N |
| packages/server/src/auth.ts | verifyToken | payload 无 exp 字段返回 false | 错误处理 | 构造含 { iat: ... } 但无 exp 的 token | 返回 false（typeof exp !== "number"） | N |
| packages/server/src/auth.ts | verifyToken | 使用错误 secret 验证失败 | 安全 | signToken("secret1", 3600) 用 "secret2" 验证 | 返回 false | N |
| packages/server/src/api.ts | handleApi | GET /api/config 返回配置（敏感字段脱敏） | 功能正确性 | 创建带 token 的 ctx | status=200, discord.token="***", lark.appSecret="***" | Y |
| packages/server/src/api.ts | handleApi | GET /api/config 不脱敏非敏感字段 | 功能正确性 | ctx.config.lark.appId = "test-id" | appId 保持原值 | Y |
| packages/server/src/api.ts | handleApi | PUT /api/config 更新配置 | 功能正确性 | body 含 formatter 配置 | status=200, 返回更新后配置 | Y |
| packages/server/src/api.ts | handleApi | PUT /api/config 非法 JSON 返回 400 | 错误处理 | body = "not json" | status=400, error.code="VALIDATION_ERROR" | Y |
| packages/server/src/api.ts | handleApi | PUT /api/config 忽略非 allowedKeys 的字段 | 安全 | body 含 __proto__, constructor 字段 | 不污染原型链 | Y |
| packages/server/src/api.ts | handleApi | PUT /api/config 请求体超过 1MB 拒绝 | 安全 | 发送 >1MB 的 body | 连接被销毁或返回错误 | Y |
| packages/server/src/api.ts | handleApi | PUT /api/config 请求体在 1MB 内接受 | 边界值 | 发送 <1MB 的 body | status=200 | Y |
| packages/server/src/api.ts | handleApi | GET /api/projects 返回项目数组 | 功能正确性 | ctx.config.projects = [] | status=200, 返回 [] | Y |
| packages/server/src/api.ts | handleApi | POST /api/projects 创建项目 | 功能正确性 | body = { name: "p1", directory: "/tmp/p1" } | status=201, 返回含 name 的对象 | Y |
| packages/server/src/api.ts | handleApi | POST /api/projects 缺少 name 或 directory 返回 400 | 错误处理 | body = {} | status=400, error.code="VALIDATION_ERROR" | Y |
| packages/server/src/api.ts | handleApi | POST /api/projects 含可选 model 字段 | 功能正确性 | body = { name, directory, model: "opus" } | 返回对象含 model: "opus" | N |
| packages/server/src/api.ts | handleApi | POST /api/projects 空 body（非 JSON）返回 400 | 错误处理 | 发送空请求体 | status=400 | N |
| packages/server/src/api.ts | handleApi | PUT /api/projects/:name 更新已有项目 | 功能正确性 | 先 POST 创建，再 PUT 更新 directory | status=200, directory 已更新 | Y |
| packages/server/src/api.ts | handleApi | PUT /api/projects/:name 不存在返回 404 | 错误处理 | PUT 不存在的 project name | status=404, error.code="NOT_FOUND" | Y |
| packages/server/src/api.ts | handleApi | PUT /api/projects/:name 非法 JSON body 返回 400 | 错误处理 | body = "invalid" | status=400 | N |
| packages/server/src/api.ts | handleApi | PUT /api/projects/:name URL 编码的 name 正确解码 | 边界值 | PUT /api/projects/my%20project | decodeURIComponent 正确解析 | N |
| packages/server/src/api.ts | handleApi | DELETE /api/projects/:name 删除项目返回 204 | 功能正确性 | 先 POST 创建，再 DELETE | status=204 | Y |
| packages/server/src/api.ts | handleApi | DELETE /api/projects/:name 不存在项目返回 204（幂等） | 幂等性 | DELETE 不存在的 name | status=204 | Y |
| packages/server/src/api.ts | handleApi | GET /api/sessions 返回空数组 | 功能正确性 | 无 session 状态 | status=200, 返回 [] | Y |
| packages/server/src/api.ts | handleApi | GET /api/sessions?project=xxx 按项目过滤 | 功能正确性 | query param project=xxx | status=200, 返回过滤结果 | Y |
| packages/server/src/api.ts | handleApi | GET /api/stats/tokens?project=xxx 返回 token 统计 | 功能正确性 | query param project=xxx | status=200, 含 totalInput, daily 字段 | Y |
| packages/server/src/api.ts | handleApi | GET /api/stats/tokens?session=xxx 返回 session 统计 | 功能正确性 | query param session=xxx | status=200 | N |
| packages/server/src/api.ts | handleApi | GET /api/stats/tokens 无参数返回 400 | 错误处理 | 无 query param | status=400, error.code="VALIDATION_ERROR" | N |
| packages/server/src/api.ts | handleApi | 未知 /api/* 路由返回 404 | 错误处理 | GET /api/nonexistent | status=404, error.code="NOT_FOUND" | Y |
| packages/server/src/api.ts | handleApi | 未知 HTTP 方法对已知路径返回 404 | 边界值 | PATCH /api/config | status=404 | N |
| packages/server/src/ws.ts | attachWebSocket | 客户端连接后加入 clients 集合 | 功能正确性 | 建立 WS 连接 | clients.size 增加 | N |
| packages/server/src/ws.ts | attachWebSocket | 客户端断开后从 clients 移除 | 状态与生命周期 | 连接后关闭 | clients.size 减少 | N |
| packages/server/src/ws.ts | attachWebSocket | sync.state 消息返回活跃 session 列表 | 功能正确性 | 发送 { type: "sync.state" } | 收到含 activeSessions 和 bufferedOutput 的响应 | Y |
| packages/server/src/ws.ts | attachWebSocket | 非法 JSON 消息返回 INVALID_JSON 错误 | 错误处理 | 发送非 JSON 字符串 | 收到 { type: "error", error.code: "INVALID_JSON" } | Y |
| packages/server/src/ws.ts | attachWebSocket | 未知消息类型返回 UNKNOWN_TYPE 错误 | 错误处理 | 发送 { type: "unknown.type" } | 收到含 error.code="UNKNOWN_TYPE" 的响应 | Y |
| packages/server/src/ws.ts | attachWebSocket | chat.send 找不到项目返回 PROJECT_NOT_FOUND | 错误处理 | 发送 { type: "chat.send", project: "nonexistent" } | 收到 chat.error, code="PROJECT_NOT_FOUND" | Y |
| packages/server/src/ws.ts | attachWebSocket | chat.send 成功时广播 chat.done | 功能正确性 | 发送 chat.send 到已有项目 | 收到 chat.done 含 result 和 realSessionId | Y |
| packages/server/src/ws.ts | attachWebSocket | chat.send 多客户端收到广播 | 功能正确性 | 两个客户端连接，一个发送 chat.send | 两个客户端都收到 chat.done/chat.error | Y |
| packages/server/src/ws.ts | attachWebSocket | chat.abort 不存在的 sessionId 不崩溃 | 错误处理 | 发送 { type: "chat.abort", sessionId: "fake" } | 连接仍存活 | Y |
| packages/server/src/ws.ts | attachWebSocket | chat.abort 无 sessionId 时不崩溃 | 边界值 | 发送 { type: "chat.abort" }（无 sessionId） | 不调用 abort，连接仍存活 | N |
| packages/server/src/ws.ts | attachWebSocket | skipAuth=true 时无需 token 即可连接 | 安全 | ctx.skipAuth=true，不传 token | 连接成功 | Y |
| packages/server/src/ws.ts | attachWebSocket | skipAuth=false 且无有效 token 时拒绝连接 | 安全 | ctx.skipAuth=false, ctx.jwtSecret="s"，不传 token | 连接被拒，收到 401 | N |
| packages/server/src/ws.ts | attachWebSocket | skipAuth=false 且有效 token 时允许连接 | 安全 | 传入有效 JWT token 作为 query param | 连接成功 | N |
| packages/server/src/ws.ts | attachWebSocket | 心跳 ping 定期发送 | 状态与生命周期 | 连接后等待 >30s 或 mock setInterval | 客户端收到 ping | N |
| packages/server/src/ws.ts | attachWebSocket | WSS 关闭时清理心跳 interval | 状态与生命周期 | 关闭 server | clearInterval 被调用 | N |
| packages/server/src/ws.ts | send | ws 状态为 OPEN 时发送 JSON | 功能正确性 | mock ws.readyState=OPEN | ws.send 被调用，参数为 JSON 字符串 | N |
| packages/server/src/ws.ts | send | ws 非 OPEN 状态时不发送 | 边界值 | mock ws.readyState=CLOSED | ws.send 未被调用 | N |
| packages/server/src/ws.ts | broadcast | 仅向 OPEN 状态的客户端发送 | 功能正确性 | clients 含 OPEN 和 CLOSED 的 ws | 只有 OPEN 的收到消息 | N |
| packages/server/src/ws.ts | broadcast | clients 为空时不崩溃 | 边界值 | 空 Set | 无异常 | N |
| packages/server/src/ws.ts | handleChatSend | sessionManager.invoke 抛出时广播 chat.error | 依赖失败 | mock invoke reject | 广播 { type: "chat.error", error.code: "INVOKE_ERROR" } | N |
| packages/server/src/ws.ts | handleChatSend | 使用项目配置的 model | 功能正确性 | payload 不含 model，project.model="opus" | invoke 调用时 model="opus" | N |
| packages/server/src/ws.ts | handleChatSend | payload.model 覆盖项目 model | 功能正确性 | payload.model="haiku", project.model="opus" | invoke 调用时 model="haiku" | N |
| packages/server/src/ws.ts | handleChatSend | 流式事件回调中文本块广播 chat.stream | 功能正确性 | mock invoke 触发 assistant 事件含 text block | 广播 { type: "chat.stream", contentType: "text" } | N |
| packages/server/src/server.ts | createServer | 成功启动并监听指定端口 | 功能正确性 | options = { port: 0, bind: "127.0.0.1", ... } | 返回 http.Server，address().port > 0 | Y |
| packages/server/src/server.ts | createServer | /api/* 请求路由到 handleApi | 功能正确性 | GET /api/config | 返回 JSON 配置 | Y |
| packages/server/src/server.ts | createServer | 非 /api/ 请求路由到 serveStatic | 功能正确性 | GET / 或 GET /app.js | 返回静态文件内容 | Y |
| packages/server/src/server.ts | createServer | 无 staticDir 时非 API 请求返回 404 | 边界值 | 不设 staticDir 且 UI dist 不存在 | status=404 | N |
| packages/server/src/server.ts | createServer | handleApi 抛出异常时返回 500 | 错误处理 | mock handleApi 抛出 | status=500, error.code="INTERNAL_ERROR" | N |
| packages/server/src/server.ts | createServer | server.listen 失败时 reject | 依赖失败 | 端口被占用 | Promise reject 含 EADDRINUSE | N |
| packages/server/src/server.ts | createServer | 自动检测 UI dist 目录 | 功能正确性 | 不传 staticDir，但 ../../ui/dist 存在 | 使用自动检测的 staticDir | N |
| packages/server/src/server.ts | serveStatic | / 路径返回 index.html | 功能正确性 | urlPath="/" | 返回 index.html 内容，Content-Type=text/html | Y |
| packages/server/src/server.ts | serveStatic | 已知扩展名返回正确 MIME 类型 | 功能正确性 | 请求 .js, .css, .svg, .png 文件 | 各返回对应 MIME 类型 | Y |
| packages/server/src/server.ts | serveStatic | 未知扩展名返回 application/octet-stream | 边界值 | 请求 .xyz 文件 | Content-Type=application/octet-stream | N |
| packages/server/src/server.ts | serveStatic | 路径遍历攻击返回 403 | 安全 | urlPath="/../secret.txt" | status=403, body="Forbidden" | Y |
| packages/server/src/server.ts | serveStatic | URL 编码的路径遍历攻击被阻止 | 安全 | urlPath="/%2e%2e/secret.txt" | 不返回 staticDir 外的内容 | Y |
| packages/server/src/server.ts | serveStatic | 文件不存在时 SPA 回退到 index.html | 功能正确性 | 请求不存在的路径 | 返回 index.html 内容 | Y |
| packages/server/src/server.ts | serveStatic | index.html 也不存在时返回 404 | 边界值 | staticDir 为空目录 | status=404, body="Not found" | N |
