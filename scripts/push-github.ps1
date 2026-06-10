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

Step "检查 Git"
Need-Command "git" "Git for Windows：https://git-scm.com/download/win"

if (-not (Test-Path (Join-Path $root ".git"))) {
  Step "初始化 Git 仓库"
  git init
}

$remoteUrl = ""
try {
  $remoteUrl = git remote get-url origin 2>$null
} catch {
  $remoteUrl = ""
}

if ([string]::IsNullOrWhiteSpace($remoteUrl)) {
  Step "填写 GitHub 仓库地址"
  Write-Host "请先在 GitHub 新建一个空仓库，然后复制 HTTPS 地址。"
  $remoteUrl = Read-Host "例如 https://github.com/你的用户名/video-render-cloudflare.git"
  if ([string]::IsNullOrWhiteSpace($remoteUrl)) {
    throw "GitHub 仓库地址不能为空。"
  }
  git remote add origin $remoteUrl
}

Step "提交代码"
git add .
$status = git status --porcelain
if (-not [string]::IsNullOrWhiteSpace($status)) {
  $message = Read-Host "请输入提交说明，直接回车使用默认说明"
  if ([string]::IsNullOrWhiteSpace($message)) {
    $message = "Update Cloudflare video studio"
  }
  git commit -m $message
} else {
  Write-Host "没有新的文件变更，跳过提交。"
}

Step "推送到 GitHub"
git branch -M main
git push -u origin main
Write-Host ""
Write-Host "已上传到 GitHub。" -ForegroundColor Green
