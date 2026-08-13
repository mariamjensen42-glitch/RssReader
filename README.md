# Rust RSS Reader

一个基于 **Tauri v2 + React 19 + TypeScript** 构建的现代化桌面 RSS 阅读器，Fluent Reader 的开源移植版本。

Rust 后端负责订阅抓取、解析、全文提取与本地存储，前端使用 FluentUI v9 提供原生流畅的阅读体验。

## 特性

- 📰 **订阅源管理**：添加 / 删除 / 编辑订阅源，支持分组，支持 RSS 源自动发现（输入网站地址自动探测 Feed 链接）
- 🔄 **增量刷新**：基于 ETag / Last-Modified 的 HTTP 缓存，只拉取增量内容，节省流量
- 🔌 **代理支持**：可配置 HTTP/SOCKS 代理，订阅抓取与 RSS 自动发现均生效（适合网络受限环境）
- 🔔 **刷新完成通知**：全部订阅刷新完成后发送系统通知，汇报新增文章数与失败数量
- 🗂️ **OPML 导入导出**：一键迁移其他阅读器的订阅数据
- 📡 **RSSHub 路由浏览器**：内置 RSSHub 路由目录（3000+ 订阅源），搜索、填参、一键订阅
- ⭐ **文章管理**：未读筛选、星标收藏、全部标为已读、站内全文搜索
- 🏷️ **标签系统**：为文章打标签，按标签聚合浏览
- 🤖 **AI 助手**：文章摘要、AI 打标签、翻译、观点提炼（通过 DeepSeek 等 OpenAI 兼容接口）
- 🌐 **编码容错**：基于 `encoding_rs` 处理非 UTF-8 编码的旧站点
- 🪟 **现代窗口外观**：无边框窗口 + Windows 11 Mica 毛玻璃效果，支持深浅主题
- 💾 **SQLite 本地存储**：数据完全本地化，无需账号，隐私安全

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端框架 | React 19 + TypeScript |
| UI 组件库 | FluentUI v9（`@fluentui/react-components`） |
| 状态管理 | Zustand |
| 构建工具 | Vite 7 |
| 桌面框架 | Tauri v2（Rust） |
| 数据库 | SQLite（`rusqlite`，bundled） |
| 网络 / 解析 | `reqwest` + `rss` + `scraper` + `quick-xml` |
| 包管理 | pnpm |

## 环境要求

- [Node.js](https://nodejs.org/) ≥ 20
- [pnpm](https://pnpm.io/) ≥ 9
- [Rust](https://www.rust-lang.org/tools/install) ≥ 1.77（含 Cargo）
- Tauri v2 的平台依赖，请参考 [Tauri 官方前置要求](https://v2.tauri.app/start/prerequisites/)：

  - **Windows**：Microsoft Visual Studio C++ Build Tools（含 Windows SDK）
  - **macOS**：Xcode Command Line Tools
  - **Linux**：`webkit2gtk-4.1`、`libappindicator3` 等系统库

## 安装步骤

```bash
# 1. 克隆仓库
git clone https://github.com/yourname/rustrssreader.git
cd rustrssreader

# 2. 安装前端依赖
pnpm install

# 3. 开发模式运行（自动启动 Vite + 编译 Rust + 打开应用窗口）
pnpm tauri dev
```

> 首次运行 `pnpm tauri dev` 时 Rust 依赖编译较慢（数分钟），属正常现象。

## 使用示例

### 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm tauri dev` | 开发模式：热更新 + 调试窗口 |
| `pnpm tauri build` | 构建并打包安装程序（Windows: NSIS/MSI，macOS: dmg，Linux: deb/AppImage） |
| `pnpm dev` | 仅启动前端 Vite 开发服务器（http://localhost:1420） |
| `pnpm build` | 仅构建前端产物（输出到 `dist/`） |
| `pnpm preview` | 预览前端构建产物 |

### 前端调用 Rust 命令

前端通过 `src/bridges/` 下的桥接模块异步调用后端命令（Tauri v2 的 `invoke`）：

```ts
import { feedsBridge } from "./bridges/feeds"

// 添加订阅源
const feed = await feedsBridge.addFeed("https://example.com/feed.xml", "技术")

// 获取未读文章列表
const articles = await feedsBridge.getArticles({ onlyUnread: true, limit: 50 })

// 标记已读 / 切换星标
await feedsBridge.markRead(article.id, true)
const starred = await feedsBridge.toggleStar(article.id)
```

### 设置存储位置

应用设置以 JSON 形式持久化在系统配置目录：

- **Windows**：`%APPDATA%\rustrssreader\settings.json`
- **macOS**：`~/Library/Application Support/rustrssreader/settings.json`
- **Linux**：`~/.config/rustrssreader/settings.json`

订阅与文章数据存储在 SQLite 数据库（同目录下的 `rustrssreader.db`）。

### AI 功能配置

在应用设置中配置 OpenAI 兼容接口的 Base URL 与 API Key（默认支持 DeepSeek），即可使用文章摘要、翻译、观点提炼与 AI 打标签功能。

## 项目结构

```
rustrssreader/
├── src/                      # 前端 (React + TypeScript)
│   ├── bridges/              # Tauri IPC 桥接层（feeds / ai / settings / utils）
│   ├── components/           # UI 组件（文章列表、详情、设置、标签页等）
│   ├── store.ts              # Zustand 全局状态
│   ├── schema-types.ts       # 数据库行类型定义
│   └── styles/               # 全局样式
├── src-tauri/                # 后端 (Tauri v2 + Rust)
│   ├── src/
│   │   ├── lib.rs            # Tauri 命令注册与订阅抓取/解析逻辑
│   │   ├── database.rs       # SQLite 数据库操作
│   │   ├── ai.rs             # AI 接口调用（摘要/翻译/打标签等）
│   │   ├── settings.rs       # 设置持久化
│   │   └── main.rs           # 程序入口
│   └── tauri.conf.json       # Tauri 应用配置
├── package.json
└── vite.config.ts
```

## 贡献指南

欢迎提交 Issue 和 Pull Request！

### 开发流程

1. **Fork 并克隆**本仓库，按上文「安装步骤」搭好环境。
2. **创建功能分支**：`git checkout -b feat/your-feature` 或 `git checkout -b fix/your-bugfix`。
3. **开发**：前端改 `src/`，后端改 `src-tauri/src/`，运行 `pnpm tauri dev` 实时调试。
4. **验证**：提交前必须通过全部检查（见下节）。
5. **提交 PR**：描述改动内容、动机与测试情况，等待 Review。

### 验证命令

```bash
# 1. 类型检查（必须零错误）
pnpm exec tsc --noEmit

# 2. 前端生产构建
pnpm build

# 3. Rust 后端编译检查
cd src-tauri && cargo check
```

### 代码约定

- **状态管理**：统一使用 Zustand（`src/store.ts`），不使用 Redux。
- **IPC 模式**：所有 `window.settings.*` / `window.utils.*` / 桥接方法均为**异步 Promise**（Tauri v2 的 `invoke`），组件中通过 `useEffect` 获取设置值，禁止使用同步 `sendSync`。
- **命令命名**：Rust 侧命令使用 snake_case（如 `add_feed`），前端桥接方法使用 camelCase（如 `addFeed`）。
- **类型安全**：前端与 Rust 交互的数据结构在 `src/schema-types.ts` 中定义，增删字段需同步更新。
- **代码质量**：Rust 侧已开启 `unsafe_code = "forbid"`，新代码不得使用 `unsafe`。

### Issue 提交规范

- 描述复现步骤、期望行为与实际行为。
- 附上运行环境（操作系统、应用版本）。
- 如为 UI 问题，尽量附带截图。

## License

[MIT](./LICENSE)（如未创建 LICENSE 文件，请按需补充后启用）
