# OnlyOffice 与 Vue 前端集成演示

这个 demo 用来验证 OnlyOffice Document Server 与自定义应用的协同：在浏览器中上传本地 Word 文档、在线编辑，并将编辑后的文档保存回服务器本地文件夹。

## 项目结构
- `client/`：使用 Vite + Vue 3 构建的前端页面。
- `server/`：基于 Express 的后端，负责本地文件存储、OnlyOffice 配置下发与回调处理。
- `storage/`：上传后的文档会保存在这里（运行时自动创建）。
- `docs/onlyoffice-demo-design.md`：需求分析与架构设计文档。

## 运行前准备
1. **OnlyOffice Document Server** 已安装并可访问，例如 `http://192.168.68.3:32780`。
2. 本地安装 Node.js（建议 18+）。部分依赖针对 Node 20 会有警告，但功能不受影响。
3. 根据实际情况调整后端环境变量（参考 `server/.env.example`）。常用项：
   - `ONLYOFFICE_BASE_URL`：OnlyOffice Document Server 的基础地址，例如 `http://192.168.68.3:32780`。
   - `APP_BASE_URL`：后端对外可访问的地址（OnlyOffice 需要通过该地址访问文件和回调接口），**务必填写 Document Server 可以直接访问的 IP/域名，不要使用 localhost**。
   - `PORT`：后端监听端口，默认 `4000`。
   - `ONLYOFFICE_JWT_SECRET`：OnlyOffice Document Server 配置的 JWT 密钥（示例中已填入 `YH5OgoM4bCDW54FCV9ayHPlVZHSN8Dlp`）。
   - `ONLYOFFICE_JWT_ALG`：JWT 算法，默认 `HS256`。
   - `ONLYOFFICE_JWT_HEADER`：Document Server 回调中承载 token 的 Header，默认 `Authorization`。

## 安装依赖
```bash
# 在项目根目录
npm install
npm install --workspace client
npm install --workspace server
```
（首次运行 `npm install` 时，如果使用 npm workspaces 已经自动安装，可忽略重复安装。）

## 启动方式
```bash
# 同时启动前后端
npm run dev

# 或者分别启动
npm run dev:server
npm run dev:client
```
- 前端开发服务器：默认 http://localhost:5173
- 后端 API：默认 http://localhost:4000

## 功能验证流程
1. 访问前端页面，点击“选择 Word 文件上传”，选择本地 `.docx`/`.doc` 等文档。
2. 上传成功后，文件出现在列表中，可查看文件大小与更新时间。
3. 点击“打开编辑”调用后端生成的 OnlyOffice 配置，加载编辑器。
4. 在 OnlyOffice 页面内修改并保存（自动保存开启）。OnlyOffice 会通过回调把最新文档写回 `storage/` 目录。
5. 关闭编辑器后刷新列表，可看到更新时间已经更新。同时可以在 `storage/` 中找到保存后的文档。

## 注意事项
- Demo 未实现鉴权，所有请求默认允许访问，仅用于本地验证集成。
- 后端与 OnlyOffice 不在同一机器时，请将 `APP_BASE_URL` 设置为后端所在主机在局域网/公网中的地址（例如 `http://192.168.68.2:4000`），并确认防火墙或安全组开放该端口。
- 如果 Document Server 开启了 JWT 校验，需要在后端配置 `ONLYOFFICE_JWT_SECRET` 等变量，本项目已内置签名与回调校验逻辑。
- 建议在 OnlyOffice 回调能够访问到 `APP_BASE_URL` 指向的地址（比如浏览器和 Document Server 均运行在本机时需要确保端口互通）。

## 后续扩展建议
- 接入数据库持久化文件元数据。
- 增加用户身份、访问控制以及协同编辑状态展示。
- 根据实际部署需要，为 OnlyOffice 回调开启 JWT 校验和 HTTPS 支持。
