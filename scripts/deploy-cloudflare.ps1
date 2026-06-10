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

Step "检查环境"
Need-Command "node" "Node.js LTS：https://nodejs.org/"
Need-Command "npm" "Node.js LTS：https://nodejs.org/"

Step "安装项目依赖"
npm install

Step "Cloudflare 登录"
Write-Host "如果浏览器弹出 Cloudflare 登录页面，请登录你的账号。"
npx wrangler login

Step "准备 KV 命名空间"
$tomlPath = Join-Path $root "wrangler.toml"
$toml = Get-Content $tomlPath -Raw
if ($toml -match "replace_with_cloudflare_kv_namespace_id") {
  Write-Host "正在创建 Cloudflare KV：JOBS"
  $kvOutput = npx wrangler kv namespace create JOBS 2>&1 | Out-String
  Write-Host $kvOutput
  $match = [regex]::Match($kvOutput, 'id\s*=\s*"([^"]+)"')
  if (-not $match.Success) {
    Write-Host "没有自动识别到 KV id。请从上面的输出里复制 id。"
    $kvId = Read-Host "请输入 KV id"
  } else {
    $kvId = $match.Groups[1].Value
  }
  $toml = $toml -replace 'id = "replace_with_cloudflare_kv_namespace_id"', "id = `"$kvId`""
  Set-Content -LiteralPath $tomlPath -Value $toml -Encoding UTF8
  Write-Host "已写入 wrangler.toml"
} else {
  Write-Host "wrangler.toml 已有 KV id，跳过创建。"
}

Step "设置网站登录码"
$appCode = Read-Host "请输入网站登录码 APP_ACCESS_CODE，例如 123456"
if ([string]::IsNullOrWhiteSpace($appCode)) {
  throw "网站登录码不能为空。"
}
$appCode | npx wrangler secret put APP_ACCESS_CODE

Step "设置本地助手密钥"
$runnerToken = Read-Host "请输入本地助手密钥 RUNNER_TOKEN，建议长一点"
if ([string]::IsNullOrWhiteSpace($runnerToken)) {
  throw "本地助手密钥不能为空。"
}
$runnerToken | npx wrangler secret put RUNNER_TOKEN

Step "部署到 Cloudflare"
$deployOutput = npx wrangler deploy 2>&1 | Out-String
Write-Host $deployOutput

$urlMatch = [regex]::Match($deployOutput, 'https://[^\s]+')
if ($urlMatch.Success) {
  $siteUrl = $urlMatch.Value.TrimEnd(".")
  Write-Host ""
  Write-Host "部署完成：" -ForegroundColor Green
  Write-Host $siteUrl -ForegroundColor Green

  $runnerEnv = @"
API_BASE=$siteUrl
RUNNER_TOKEN=$runnerToken
RUNNER_ID=customer-pc-01
OUTPUT_DIR=C:\VideoRenderOutputs
POLL_MS=3000
"@
  Set-Content -LiteralPath (Join-Path $root "runner.env") -Value $runnerEnv -Encoding UTF8
  Write-Host "已自动生成本机 runner.env。客户电脑也可以照这个文件填写。"
} else {
  Write-Host "部署完成，但没有自动识别网站地址。请查看上面的 wrangler 输出。"
}
