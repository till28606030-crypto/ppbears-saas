# deploy-hostinger.ps1
# =============================================
# 乾淨打包 + 驗證 + FTP 上傳到 Hostinger /design/
# 使用方式: powershell -ExecutionPolicy Bypass -File scripts\deploy-hostinger.ps1
# =============================================

param(
    [string]$FtpPassword = $env:HOSTINGER_FTP_PASSWORD,
    [switch]$SkipBuild = $false,
    [switch]$SkipGitHub = $false
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DistPath = Join-Path $ProjectRoot "dist"
$FtpHost = "178.16.135.30"
$FtpUser = "u141631622.ppbears.com"
$FtpRemotePath = "/public_html/design/"

# --- 顏色輸出 helpers ---
function Write-Step { param([string]$msg) Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-OK   { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Fail { param([string]$msg) Write-Host "  [!!] $msg" -ForegroundColor Red; exit 1 }

# =============================================
# 步驟 0: 確認 FTP 密碼
# =============================================
if (-not $FtpPassword) {
    $SecurePass = Read-Host "請輸入 Hostinger FTP 密碼" -AsSecureString
    $FtpPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
        [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePass)
    )
}

# =============================================
# 步驟 1: GitHub 推送
# =============================================
if (-not $SkipGitHub) {
    Write-Step "步驟 1: 推送到 GitHub"
    Set-Location $ProjectRoot
    git add -A
    $diffStat = git diff --cached --stat
    if ($diffStat) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
        git commit -m "chore: deploy update $timestamp"
        Write-OK "已提交"
    } else {
        Write-Host "  (無新變更，跳過 commit)" -ForegroundColor Yellow
    }
    git push origin main
    Write-OK "GitHub 推送完成"
}

# =============================================
# 步驟 2: 乾淨打包
# =============================================
if (-not $SkipBuild) {
    Write-Step "步驟 2: 乾淨打包 (Production)"
    Set-Location $ProjectRoot

    # 移除舊 dist
    if (Test-Path $DistPath) {
        Remove-Item -Recurse -Force $DistPath
        Write-OK "已清除舊 dist"
    }

    # 設定生產環境 base path
    $env:VITE_BASE_PATH = "/design/"
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Fail "npm run build 失敗，中止部署！" }
    Write-OK "Build 成功"

    # =============================================
    # 步驟 3: 驗證打包結果
    # =============================================
    Write-Step "步驟 3: 驗證 dist 內容"

    if (-not (Test-Path "$DistPath\index.html")) { Write-Fail "dist/index.html 不存在！" }
    Write-OK "index.html 存在"

    $assetCount = (Get-ChildItem "$DistPath\assets" -ErrorAction SilentlyContinue | Measure-Object).Count
    if ($assetCount -eq 0) { Write-Fail "dist/assets/ 資料夾為空！" }
    Write-OK "assets 資料夾有 $assetCount 個檔案"

    $hasBasePath = Select-String -Path "$DistPath\index.html" -Pattern "/design/" -Quiet
    if (-not $hasBasePath) { Write-Fail "index.html 中找不到 /design/ base path，請確認 VITE_BASE_PATH 設定！" }
    Write-OK "Base path /design/ 確認正確"

    # 複製 .htaccess
    $htaccessSrc = Join-Path $ProjectRoot "deploy\hostinger-design-htaccess.txt"
    if (Test-Path $htaccessSrc) {
        Copy-Item $htaccessSrc "$DistPath\.htaccess" -Force
        Write-OK ".htaccess 已複製到 dist"
    } else {
        Write-Host "  [警告] deploy\hostinger-design-htaccess.txt 不存在，跳過 .htaccess 複製" -ForegroundColor Yellow
    }
}

# =============================================
# 步驟 4: FTP 上傳
# =============================================
Write-Step "步驟 4: FTP 上傳到 Hostinger /design/"

# 嘗試找 WinSCP
$winscpPaths = @(
    "C:\Program Files (x86)\WinSCP\WinSCP.com",
    "C:\Program Files\WinSCP\WinSCP.com",
    (Get-Command winscp.com -ErrorAction SilentlyContinue)?.Source
)
$winscpExe = $winscpPaths | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1

if (-not $winscpExe) {
    Write-Host ""
    Write-Host "  [警告] 找不到 WinSCP，請先安裝 WinSCP（https://winscp.net）" -ForegroundColor Yellow
    Write-Host "  安裝後重新執行此腳本，或手動使用以下指令："
    Write-Host "  & 'C:\Program Files (x86)\WinSCP\WinSCP.com' /command 'open ftp://${FtpUser}:PASSWORD@${FtpHost}/' 'synchronize remote $DistPath $FtpRemotePath -delete' 'exit'"
    exit 0
}

Write-Host "  使用 WinSCP: $winscpExe" -ForegroundColor Gray
& $winscpExe /command `
    "open ftp://${FtpUser}:${FtpPassword}@${FtpHost}/" `
    "synchronize remote `"$DistPath`" `"$FtpRemotePath`" -delete" `
    "exit"

if ($LASTEXITCODE -ne 0) { Write-Fail "WinSCP 上傳失敗，請檢查 FTP 密碼與連線！" }
Write-OK "FTP 上傳完成"

# =============================================
# 步驟 5: 部署後驗證
# =============================================
Write-Step "步驟 5: 部署後網站驗證"
try {
    $resp = Invoke-WebRequest -Uri "https://ppbears.com/design/" -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) {
        Write-OK "https://ppbears.com/design/ 回應 200 OK"
    } else {
        Write-Host "  [警告] 回應狀態碼: $($resp.StatusCode)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  [警告] 無法連接網站（可能 CDN 尚未更新）: $_" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "  部署完成！請在瀏覽器開啟以下連結驗證：" -ForegroundColor Green
Write-Host "  https://ppbears.com/design/" -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
