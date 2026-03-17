# How to Make AI Do Quality Testing on Its Own

## The Problem: Tests Pass, Product Breaks

We had 159 E2E tests. All green. Then we opened the web page — token stats showed 0/0, chat history disappeared after refresh, and continuing a conversation crashed with an error.

The tests were lying to us. Not because they were wrong, but because they were **weak**. They checked if elements existed on the page, but never checked if the data was correct. They wrapped key checks inside `if` blocks, so when something was missing, the test just skipped the check and passed anyway.

This is the core challenge of AI-generated tests: **AI writes tests that look complete but verify nothing meaningful.**

## What We Learned

After six weeks of building a Claude Code bridge service (Discord/Lark/Web), we found patterns that make AI testing actually useful. Here are the key lessons.

### 1. Generate Test Cases Before Test Code

Don't let AI jump straight to writing test files. First, have it generate a **test case checklist** — a document listing what to test, not how to test it. This forces thinking about coverage before implementation.

We built a skill (reusable prompt) that acts as a "senior QA engineer" and analyzes source code across seven dimensions: UI rendering, user experience, core functionality, real-time behavior, state persistence, data accuracy, and error handling. The QA persona catches things a developer mindset misses — like "what happens if the user refreshes mid-stream?"

### 2. Ban the Seven Deadly Patterns

We found seven patterns that create false-positive tests. We turned these into a quality gate skill that AI must follow when writing any test:

- **`if` guards around assertions** — If a condition fails, the test passes without checking anything. Use `expect()` instead of `if`.
- **Silent `return`** — Early exit means the test "passes" but tests nothing. Use `expect()` for preconditions or `test.skip()` with a visible message.
- **`.catch(() => false)`** — Swallows real errors. Let failures fail.
- **Always-true assertions** — `expect(0).toBeGreaterThanOrEqual(0)` never fails. Every assertion must be able to fail.
- **Weak `A || B` checks** — If the test says "chart renders," don't accept "chart OR empty hint." Assert what you claim.
- **Name doesn't match assertion** — Test named "session resume uses same ID" but only checks "no error." The assertion must match the title.
- **Known-bug workarounds** — Comments saying "this is broken, so we test for 0" mean the test documents a bug but will never catch it. Use `test.fail()` or fix the bug.

### 3. Walk Through the Product After Tests Pass

This was our biggest lesson. E2E tests passed, but the product had real bugs. We added a **walkthrough step** — a Playwright script that opens the browser, performs real user actions, and logs actual values (not just pass/fail).

The walkthrough caught: token stats showing double the real amount, duplicate sidebar entries when resuming a conversation, missing navigation buttons, and broken data after page refresh. None of these were caught by the 159 green tests.

The key difference: tests check **structure** (element exists), walkthroughs check **substance** (data is correct).

### 4. Verify Every Layer of the Data Flow

When AI changes data handling code, it often fixes one layer but breaks another. Token data flowed through five layers in our system: CLI output → session parser → WebSocket handler → database → UI display. AI fixed layers 1 and 5 but left layers 2-4 hardcoded to zero.

The fix: after any data flow change, verify each layer independently with direct checks (curl for API, SQL query for database, browser for UI).

### 5. Store Experience as Skills

We encoded all these lessons as "skills" — structured prompts that AI loads before performing tasks. The test quality gate skill alone prevented 45 false-positive tests from being written in subsequent sessions. Skills persist across conversations, so AI doesn't repeat the same mistakes.

## The Result

After applying these patterns, our test suite grew from 156 tests (many false positives) to 160 genuine tests. More importantly, the walkthrough process caught 4 additional bugs that all 160 tests missed. The combination of **case generation → quality gate → automated walkthrough** created a testing pipeline where AI produces tests we can actually trust.

The lesson is simple: **don't trust AI-generated tests by default. Give AI the rules to write honest tests, then verify the product yourself.**

---

# 中文翻译

# 如何让 AI 自主进行高质量测试

## 问题：测试通过，产品却坏了

我们有 159 个 E2E 测试，全部绿色。然后打开网页一看——token 统计显示 0/0，聊天记录刷新后消失，继续对话直接报错。

测试在骗我们。不是测试写错了，而是测试**太弱了**。它们检查页面上元素是否存在，但从不检查数据是否正确。关键检查被包在 `if` 块里，当元素缺失时，测试直接跳过检查照样通过。

这是 AI 生成测试的核心挑战：**AI 写出的测试看起来完整，实际什么都没验证。**

## 我们学到了什么

经过六周构建 Claude Code 桥接服务（Discord/Lark/Web）的开发，我们总结出让 AI 测试真正有用的模式。

### 1. 先生成测试用例，再写测试代码

不要让 AI 直接跳到写测试文件。先让它生成**测试用例清单**——一份列出要测什么的文档，而不是怎么测。这迫使 AI 在实现之前先思考覆盖范围。

我们构建了一个以"资深 QA 工程师"人设分析源代码的 skill，覆盖七个维度：UI 渲染、用户体验、核心功能、实时行为、状态持久化、数据准确性和错误处理。QA 人设能抓到开发者思维容易忽略的场景——比如"用户在流式输出过程中刷新页面会怎样？"

### 2. 禁止七种致命模式

我们发现了七种制造假阳性测试的模式，将其编码为 AI 写测试时必须遵循的质量门禁：

- **`if` 守卫包裹断言** — 条件不满足时测试跳过检查直接通过。用 `expect()` 替代 `if`。
- **静默 `return`** — 提前退出意味着测试"通过"但什么都没测。用 `expect()` 断言前置条件。
- **`.catch(() => false)`** — 吞掉真实错误。让失败暴露出来。
- **恒真断言** — `expect(0).toBeGreaterThanOrEqual(0)` 永远不会失败。每个断言必须有失败的可能。
- **弱化的 `A || B` 检查** — 测试说"图表渲染"，却接受"图表或空提示"。断言要与声称一致。
- **名不副实** — 测试名叫"session resume 使用相同 ID"，但只检查"没报错"。断言必须匹配标题。
- **已知 bug 的绕行** — 注释写着"这个功能坏了，所以我们测 0"。用 `test.fail()` 或直接修 bug。

### 3. 测试通过后，走查产品

这是我们最大的教训。E2E 测试通过了，但产品有真实 bug。我们增加了**走查步骤**——用 Playwright 脚本打开浏览器，执行真实用户操作，记录实际数值（不只是通过/失败）。

走查发现了：token 统计显示双倍数值、续聊时 sidebar 产生重复条目、缺少导航按钮、刷新后数据丢失。159 个绿色测试一个都没抓到这些问题。

关键区别：测试检查**结构**（元素存在），走查检查**内容**（数据正确）。

### 4. 验证数据流的每一层

AI 修改数据处理代码时，经常修好一层但破坏另一层。我们系统中 token 数据流经五层：CLI 输出 → 会话解析器 → WebSocket 处理 → 数据库 → UI 展示。AI 修好了第 1 层和第 5 层，但第 2-4 层仍然硬编码为零。

解决方法：数据流变更后，用直接检查逐层独立验证（curl 查 API、SQL 查数据库、浏览器查 UI）。

### 5. 将经验存储为 Skill

我们把所有教训编码为 "skill"——AI 在执行任务前加载的结构化提示。仅测试质量门禁这一个 skill 就在后续会话中阻止了 45 个假阳性测试的产生。Skill 跨会话持久化，让 AI 不再重复犯同样的错误。

## 结果

应用这些模式后，测试套件从 156 个测试（大量假阳性）增长到 160 个真实测试。更重要的是，走查流程额外发现了 4 个所有 160 个测试都遗漏的 bug。**用例生成 → 质量门禁 → 自动走查**的组合创建了一条我们可以真正信任的测试流水线。

教训很简单：**不要默认信任 AI 生成的测试。给 AI 写诚实测试的规则，然后自己验证产品。**
