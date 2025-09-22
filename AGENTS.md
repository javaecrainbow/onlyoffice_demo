# Repository Guidelines

## 项目结构与模块组织
- `client/` 目录 由 Vite 与 Vue 3 构建 的 前端 UI，核心 代码 位于 `src/`，共享 组件 在 `src/components/`，静态 资源 存放 `public/`。
- `server/` 目录 为 Express 后端，入口 文件 `src/index.js`，默认 配置 参考 `server/.env.example`，上传 文档 会 写入 gitignore 的 `storage/`。
- `docs/onlyoffice-demo-design.md` 记录 架构 思路，`fixtures/sample.docx` 用于 手动 验证 上传 与 编辑 流程。

## 构建、测试 与 开发 命令
- 在 仓库 根 运行 `npm install` 可 为 两个 workspace 安装 依赖，新增 依赖 时 再次 执行 或 针对 单独 子 项目 使用 `npm install --workspace <name>`。
- `npm run dev` 并行 启动 Vite (端口 5173) 与 Express (端口 4000)；可视 需求 使用 `npm run dev:client` 或 `npm run dev:server` 单独 排查。
- 需要 构建 前端 时 执行 `npm run build --workspace client`，产物 位于 `client/dist`；`npm run preview --workspace client` 用于 本地 验证 打包 结果；部署 后端 使用 `npm run start --workspace server`。

## 代码 风格 与 命名 约定
- 保持 2 空格 缩进；后端 延续 CommonJS `require` 与 分号，Vue 单文件 组件 使用 `<script setup>` 与 单引号。
- 组件 文件 名 使用 PascalCase，事件 与 props 采用 camelCase，样式 文件 紧随 组件。
- 新增 资源 时 按 现有 目录 归类，例如 图片 放入 `client/src/assets`，工具 函数 靠近 调用 处，必要 时 再 提炼 公共 模块。

## 测试 指引
- 当前 未 配置 自动化 套件，PR 需 记录 手动 验证：上传 → 编辑 → 保存，建议 使用 `fixtures/sample.docx`。
- 后端 调整 后，手动 调用 `POST /api/files` 及 `GET /api/files`，并 通过 模拟 OnlyOffice 回调 检查 `storage/` 中文件 更新时间。
- 引入 自动 测试 时，推荐 Vue 侧 使用 Vitest + Testing Library，后端 使用 supertest，测试 文件 置于 `server/tests/` 并 命名 为 `*.spec.js`。

## 提交 与 PR 指南
- Commit 标题 延续 git 历史 的 简短 祈使句，如 `Stop tracking storage documents`，前后端 同步 修改 应 一并 提交。
- 提交 信息 需 说明 关联 需求、环境 变量 变更 及 潜在 部署 操作。
- PR 描述 包括 变更 摘要、风险 与 回滚 方案、手动 测试 证明，界面 改动 提供 截图 或 录屏，并 在 API 变动 时 同时 邀请 前端 与 后端 评审。

## 安全 与 配置 提示
- 开发 时 从 `server/.env.example` 复制 为 `.env`，避免 将 实际 密钥、外网 地址 写入 版本库。
- 确认 `APP_BASE_URL` 能 被 OnlyOffice Document Server 访问；如 端口 或 域名 调整，需 在 PR 中 标注。
- 遵循 `server/src/index.js` 中 `SUPPORTED_EXTENSIONS` 限制，新增 类型 前 先 评估 风险，切勿 将 `storage/` 纳入 Git。
