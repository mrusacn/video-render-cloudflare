# 客户电脑安装说明

客户电脑负责真正的视频导出，Cloudflare 网站负责登录、剪辑界面和任务排队。

## 需要安装

1. Node.js LTS
2. FFmpeg，推荐安装；如果没有 FFmpeg，程序只会生成测试结果文件
3. 本项目文件夹 `video-render-cloudflare`

## 配置

在项目根目录新建 `runner.env`：

```text
API_BASE=https://你的-cloudflare-worker-地址
RUNNER_TOKEN=你的运行器密钥
RUNNER_ID=customer-pc-01
OUTPUT_DIR=C:\VideoRenderOutputs
POLL_MS=3000
```

## 运行

双击：

```text
start-runner.cmd
```

看到 `Local video runner started` 就说明本地助手启动了。回到网站，右上角会显示“本地助手在线”。

## 素材文件

当前版本的网站会记录素材文件名和剪辑参数。客户电脑需要能访问对应素材。后续接入 R2 上传后，运行器会自动下载云端素材。
