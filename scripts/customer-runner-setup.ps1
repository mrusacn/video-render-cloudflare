$ErrorActionPreference = "Stop"

function Step($message) {
  Write-Host ""
  Write-Host "== $message ==" -ForegroundColor Cyan
}

function Need-Command($name, $installHint) {
  if (-not (Get-Command $name -ErrorAction SilentlyContinue)) {
    throw "没有找到 $name。请先安装：$installHint"
  }
}

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root
$envPath = Join-Path $root "runner.env"

Step "检查本地运行环境"
Need-Command "node" "Node.js LTS：https://nodejs.org/"
Need-Command "npm" "Node.js LTS：https://nodejs.org/"

if (-not (Get-Command "ffmpeg" -ErrorAction SilentlyContinue)) {
  Write-Host "提醒：没有检测到 FFmpeg。可以先运行测试，但要导出真正视频，建议安装 FFmpeg。" -ForegroundColor Yellow
}

Step "安装依赖"
npm install

if (-not (Test-Path $envPath)) {
  Step "填写 Cloudflare 连接信息"
  $apiBase = Read-Host "请输入 Cloudflare 网站/API 地址，例如 https://xxx.workers.dev"
  $runnerToken = Read-Host "请输入本地助手密钥 RUNNER_TOKEN"
  if ([string]::IsNullOrWhiteSpace($apiBase) -or [string]::IsNullOrWhiteSpace($runnerToken)) {
    throw "Cloudflare 地址和本地助手密钥都不能为空。"
  }
  $runnerId = Read-Host "请输入这台电脑名称，直接回车使用 customer-pc-01"
  if ([string]::IsNullOrWhiteSpace($runnerId)) {
    $runnerId = "customer-pc-01"
  }
  $runnerEnv = @"
API_BASE=$apiBase
RUNNER_TOKEN=$runnerToken
RUNNER_ID=$runnerId
OUTPUT_DIR=C:\VideoRenderOutputs
POLL_MS=3000
"@
  Set-Content -LiteralPath $envPath -Value $runnerEnv -Encoding UTF8
  Write-Host "已生成 runner.env"
}

Step "启动本地渲染助手"
Write-Host "保持这个窗口打开。网站右上角应显示“本地助手在线”。"
Get-Content $envPath | ForEach-Object {
  if ($_ -match "^\s*([^#=]+?)\s*=\s*(.*)\s*$") {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
  }
}
node runner\local-runner.mjs
