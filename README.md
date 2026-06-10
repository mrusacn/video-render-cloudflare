# Video Render Cloudflare

一个“云端调度 + 本地渲染”的视频编辑/导出骨架。

## 架构

- `public/`：网页任务面板，适合放到 Cloudflare Pages 或 Worker Static Assets。
- `worker/index.js`：Cloudflare Worker API，负责创建任务、分配任务、更新状态。
- `server/dev-server.mjs`：本地开发服务器，用文件模拟云端任务库。
- `runner/local-runner.mjs`：客户电脑上的本地运行器，轮询云端任务并执行渲染。

## 本地运行

```bash
npm install
npm run dev
```

打开：

```text
http://localhost:8787
```

再开一个终端运行本地渲染器：

```bash
npm run runner
```

Windows 也可以直接双击：

- `start-console.cmd`：启动网页和 API
- `start-runner.cmd`：启动本地渲染器

页面里创建一个任务，本地运行器会自动领取、模拟渲染并回传结果。

## 一键脚本

- `一键上传到GitHub.cmd`：初始化 Git、提交代码、推送到 GitHub。
- `一键部署到Cloudflare.cmd`：登录 Cloudflare、创建 KV、设置密钥、部署网站。
- `客户一键启动本地助手.cmd`：客户电脑安装依赖、填写连接信息、启动本地渲染助手。

第一次部署建议顺序：

1. 双击 `一键上传到GitHub.cmd`
2. 双击 `一键部署到Cloudflare.cmd`
3. 把项目文件夹发给客户，客户双击 `客户一键启动本地助手.cmd`

本地开发时如果要模拟登录码：

```bash
set APP_ACCESS_CODE=123456
npm run dev
```

网站登录时输入 `123456`。

## 客户电脑需要安装什么

第一阶段只需要安装打包好的“本地渲染助手”。开发阶段可以用：

- Node.js LTS
- FFmpeg，可选；检测到 FFmpeg 时会生成测试视频，否则生成文本结果文件

后续可以把 `runner/local-runner.mjs` 打包成 Windows 安装器，内置 FFmpeg、Chromium/Playwright 或 Remotion 渲染运行时。

## Cloudflare 部署思路

1. 将 `public/` 作为静态资源部署。
2. 将 `worker/index.js` 作为 Worker 入口。
3. 绑定 KV 命名空间 `JOBS` 存任务。
4. 绑定 R2 存素材和导出视频。
5. 给本地运行器配置：

```bash
set API_BASE=https://你的域名
set RUNNER_TOKEN=你的运行器密钥
npm run runner
```

当前版本的 Worker 已支持 KV；没有 KV 时会退回内存存储，适合开发预览，不适合生产。

## Cloudflare 部署命令

```bash
npm install
npx wrangler login
npx wrangler kv namespace create JOBS
```

把输出的 KV `id` 填入 `wrangler.toml`，然后设置两个密钥：

```bash
npx wrangler secret put APP_ACCESS_CODE
npx wrangler secret put RUNNER_TOKEN
```

最后部署：

```bash
npx wrangler deploy
```

部署成功后，访问 Cloudflare 返回的网站地址，输入 `APP_ACCESS_CODE` 即可进入视频编辑工作台。
