# rustrssreader 项目约定

## 技术栈
- 前端: React 19.1 + FluentUI v9 (纯, 无 v8) + Zustand + Vite 7 + TypeScript
- 后端: Tauri v2 + Rust
- 包管理: pnpm

## 状态管理
- 使用 Zustand (src/store.ts), 不用 Redux

## 设置持久化
- Rust 端: src-tauri/src/settings.rs, JSON 文件存储在 `{config_dir}/rustrssreader/settings.json`
- 前端桥接: src/bridges/settings.ts, 所有设置通过 Tauri invoke 异步调用

## IPC 模式
- 所有 `window.settings.*` / `window.utils.*` 返回 Promise (原项目大量用同步 sendSync)
- 组件中用 useEffect 异步获取设置值

## 窗口
- 原生装饰 (decorations: true), 1200x700, min 992x600
- 后续会改为无边框+自定义标题栏

## 验证
- tsc --noEmit → pnpm build → cargo check
