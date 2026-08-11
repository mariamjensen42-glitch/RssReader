# rustrssreader 代码审查标准与流程

> 适用于本项目的 Tauri v2 + React 19 + TypeScript + Rust 技术栈。
> 基于 2026-08-10 代码审计的实际问题制定。

---

## 一、审查流程

### PR 提交前（开发者自查）

1. **`pnpm build`** 通过（含 `tsc --noEmit`）
2. **`cargo check`** 通过
3. **`cargo clippy`** 无警告
4. 新功能有对应测试（至少关键路径）
5. 自查本检查清单的 🔴 项

### PR 审查流程

| 步骤 | 角色 | 要求 |
|------|------|------|
| 1. 创建 PR | 开发者 | PR 描述：改了啥 + 为什么 + 如何验证 |
| 2. 自动检查 | CI | `tsc --noEmit` + `pnpm build` + `cargo check` + `cargo clippy` |
| 3. 代码审查 | Reviewer | 按检查清单逐项审查，标注 🔴🟡💭 |
| 4. 修改 | 开发者 | 🔴 必须修，🟡 建议修，💭 可选 |
| 5. 合入 | Reviewer | 无 🔴 项残留即可合入 |

---

## 二、审查检查清单

### 🔴 阻塞项（必须修）

#### Rust

- [ ] **无 `unwrap()` / `expect()` 裸调用**
  - 当前问题：`database.rs:15` `Connection::open().expect()`、`settings.rs:65` `to_string_pretty().unwrap()`
  - 规则：用 `?` 传播或用 `anyhow::Context` 附加错误上下文
  - 例外：仅在绝对不可能失败处（如硬编码的常量序列化）可用 `unwrap()`，但必须注释原因

- [ ] **SQL 参数化查询**：动态 SQL 拼接仅限 `i64` 等数值类型；字符串值一律用 `?` 占位符
  - 当前问题：`database.rs:162` 用 `format!()` 拼 SQL

- [ ] **XML/HTML 输出做转义**：OPML 导出的 title/url 等字段需转义 `& < > " '`
  - 当前问题：`lib.rs:371-372` OPML 模板直接插入未转义文本

- [ ] **无阻塞 UI 的操作**：`reqwest::blocking` 的 fetch 需设置合理超时（`timeout(Duration::from_secs(30))`），并处理超时错误
  - 当前问题：HTTP 请求无超时设置

- [ ] **React Error Boundary**：新增组件需被 Error Boundary 包裹，任意组件崩溃不能白屏
  - 当前问题：项目无 Error Boundary

#### TypeScript

- [ ] **无裸 `any`**：所有 `any` 需有明确的类型定义或注释说明原因
  - 当前问题：`store.ts:14` contextMenu 的 `event`/`target` 用 `any`

- [ ] **`dangerouslySetInnerHTML` 安全审查**：必须确认 HTML 来源可信，或已做清洗
  - 当前使用：`ArticleDetail.tsx` 直接渲染 RSS 内容——需确认 RSS 源是否可信

- [ ] **状态更新无竞态**：异步操作完成后检查组件是否已卸载

### 🟡 建议项（建议修）

#### Rust

- [ ] **错误信息有上下文**：`Err(e)` → `Err(anyhow::anyhow!("加载 feed {} 失败: {}", url, e))`
- [ ] **并发获取 Feeds**：`refresh_all_feeds` 用 `tokio::spawn` 并发而非串行 for 循环
- [ ] **Settings Clone 优化**：`bool`/`u8`/`u32` 等 Copy 类型不调用 `.clone()`
- [ ] **死代码清理**：`get_feed_meta()` 若不被调用应删除，而非保留
- [ ] **Cargo.toml 加 `[lints]` 段**：
  ```toml
  [lints.rust]
  unsafe_code = "forbid"
  [lints.clippy]
  unwrap_used = "warn"
  expect_used = "warn"
  ```

#### TypeScript

- [ ] **全局 bridge 类型统一**：三个 bridge 文件的 `Window` 扩展集中到一个 `src/types/global.d.ts`
- [ ] **组件内一致性**：store 操作统一用 selector pattern 或 `useAppStore.getState()`，不混用
- [ ] **useEffect 依赖完整**：不遗漏依赖项（目前基本正确，保持）

#### 通用

- [ ] **新功能有测试**：
  - Rust: `#[cfg(test)] mod tests` 覆盖 database 操作
  - TS: vitest 覆盖 store actions
- [ ] **公共函数有注释**：Rust 用 `///`，TS 用 JSDoc

### 💭 可选优化（Nice to Have）

- [ ] Bridge 改为 React Context 模式，避免 `window` 全局变量污染
- [ ] `reqwest` 改用异步模式（需 `tokio` runtime）
- [ ] 添加 `rustfmt.toml` + `.prettierrc` 统一格式
- [ ] 添加 `rust-toolchain.toml` 固定 Rust 版本
- [ ] `package.json` 添加 `lint` 和 `test` 脚本

---

## 三、严重级别判定

| 级别 | 标记 | 含义 | 处理 |
|------|------|------|------|
| 阻塞 | 🔴 | 安全漏洞、数据丢失、panic 崩溃、逻辑错误 | **不修不能合入** |
| 严重 | 🟡 | 可维护性差、性能瓶颈、缺少必要测试 | 修了再合入 |
| 优化 | 💭 | 代码风格、命名、可选的架构改进 | 不阻塞，可后续 PR |

---

## 四、按文件类型的关注重点

| 文件类型 | 重点关注 |
|----------|----------|
| `*.rs` (Tauri Command) | 无 unwrap/expect、错误上下文、参数验证、并发安全 |
| `*.rs` (Database) | SQL 参数化、事务使用、连接管理 |
| `*.tsx` (React) | Error Boundary、useEffect cleanup、key prop、不必要的 re-render |
| `*.ts` (Store) | 不可变更新、异步竞态、类型完整 |
| `*.ts` (Bridge) | 参数验证、错误传播、Promise 链完整 |
| 配置文件 | 无敏感信息（密钥/token）、环境隔离 |

---

## 五、审查评论模板

```
🔴 **阻塞：Rust unwrap 可能导致 panic**
`lib.rs:65` — `serde_json::to_string_pretty(&default).unwrap()`

**风险：** 如果 serde 序列化失败，应用会直接崩溃。
**建议：** 改用 `serde_json::to_string_pretty(&default).context("序列化设置失败")?`
         向上传播错误而非 panic。
```

---

## 六、CI 自动检查脚本

```bash
# 前端
pnpm tsc --noEmit
pnpm build
pnpm test                 # 待添加

# Rust
cargo check
cargo clippy -- -D warnings
cargo test                # 待添加
```

---

> 最后更新：2026-08-10
> 维护者：代码审查专家
