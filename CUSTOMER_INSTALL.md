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
WORKSPACE_DIR=C:\CloudCutStudio
POLL_MS=3000
```

## 运行

双击：

```text
start-runner.cmd
```

看到 `Local video runner started` 就说明本地助手启动了。回到网站，右上角会显示“本地助手在线”。

## 素材文件

本地助手启动后会自动创建：

```text
C:\CloudCutStudio\Projects
C:\CloudCutStudio\AssetLibrary
C:\CloudCutStudio\AssetLibrary\Videos
C:\CloudCutStudio\AssetLibrary\Music
C:\CloudCutStudio\AssetLibrary\Images
C:\CloudCutStudio\AssetLibrary\Stickers
C:\CloudCutStudio\AssetLibrary\Backgrounds
```

把视频、音乐、图片放进 `AssetLibrary` 下面对应文件夹，网站会自动扫描并显示。项目剪辑信息每 10 秒自动保存，本地文件会写入 `C:\CloudCutStudio\Projects`。

如果安装了 FFmpeg，本地助手会按网页里的开始秒数、结束秒数、导出比例、多段字幕、亮度、对比度、饱和度、音量和静音设置生成 mp4。后续接入 R2 上传后，运行器可以改成自动下载云端素材。
