param(
    [string]$FtpPassword = $env:HOSTINGER_FTP_PASSWORD,
    [switch]$SkipBuild = $false,
    [switch]$SkipGitHub = $false
)
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$DistPath = Join-Path $ProjectRoot "dist"
$FtpHost = "178.16.135.30"
$FtpUser = "u141631622.czcz28606030"
$FtpRemotePath = "/"

function Write-Step { param([string]$msg) Write-Host "`n=== $msg ===" -ForegroundColor Cyan }
function Write-OK   { param([string]$msg) Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Fail { param([string]$msg) Write-Host "  [!!] $msg" -ForegroundColor Red; exit 1 }

if (-not $FtpPassword) {
    $SecurePass = Read-Host "Enter FTP Password" -AsSecureString
    $FtpPassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecurePass))
}

if (-not $SkipGitHub) {
    Write-Step "Step 1: Push to GitHub"
    Set-Location $ProjectRoot
    git add -A
    $diffStat = git diff --cached --stat
    if ($diffStat) {
        $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
        git commit -m "chore: deploy update $timestamp"
        Write-OK "Committed"
    } else {
        Write-Host "  (No changes to commit)" -ForegroundColor Yellow
    }
    git push origin main
    Write-OK "GitHub Push Complete"
}

if (-not $SkipBuild) {
    Write-Step "Step 2: Production Build"
    Set-Location $ProjectRoot
    if (Test-Path $DistPath) {
        Remove-Item -Recurse -Force $DistPath
        Write-OK "Cleaned old dist"
    }
    $env:VITE_BASE_PATH = "/design/"
    npm run build
    if ($LASTEXITCODE -ne 0) { Write-Fail "npm run build failed!" }
    Write-OK "Build success"
    Write-Step "Step 3: Validate Build"
    if (-not (Test-Path "$DistPath\index.html")) { Write-Fail "dist/index.html missing!" }
    Write-OK "index.html exists"
    $assetCount = (Get-ChildItem "$DistPath\assets" -ErrorAction SilentlyContinue | Measure-Object).Count
    if ($assetCount -eq 0) { Write-Fail "dist/assets/ is empty!" }
    Write-OK "assets count: $assetCount"
    $hasBasePath = Select-String -Path "$DistPath\index.html" -Pattern "/design/" -Quiet
    if (-not $hasBasePath) { Write-Fail "index.html base path missing!" }
    Write-OK "Base path /design/ OK"
    $htaccessSrc = Join-Path $ProjectRoot "deploy\hostinger-design-htaccess.txt"
    if (Test-Path $htaccessSrc) {
        Copy-Item $htaccessSrc "$DistPath\.htaccess" -Force
        Write-OK ".htaccess copied"
    }
}

Write-Step "Step 4: FTP Upload to Hostinger"
$winscpPaths = @("C:\Program Files (x86)\WinSCP\WinSCP.com", "C:\Program Files\WinSCP\WinSCP.com")
$winscpCmd = Get-Command winscp.com -ErrorAction SilentlyContinue
if ($winscpCmd) { $winscpPaths += $winscpCmd.Source }
$winscpExe = $winscpPaths | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
if (-not $winscpExe) { Write-Fail "WinSCP not found!" }
Write-Host "  Using WinSCP: $winscpExe" -ForegroundColor Gray

$encPass = [Uri]::EscapeDataString($FtpPassword)
$winscpScript = "C:\Temp\winscp_deploy_script.txt"
$scriptContent = @"
option batch abort
option confirm off
open ftp://${FtpUser}:${encPass}@${FtpHost}/
synchronize remote `"$DistPath`" `"$FtpRemotePath`" -delete
exit
"@
$scriptContent | Out-File -FilePath $winscpScript -Encoding ASCII
& $winscpExe /script=$winscpScript /log="C:\Temp\winscp_deploy.log"
if ($LASTEXITCODE -ne 0) { Write-Fail "WinSCP upload failed! Check C:\Temp\winscp_deploy.log" }
if (Test-Path $winscpScript) { Remove-Item $winscpScript -Force }
Write-OK "FTP upload complete"

Write-Step "Step 5: Post-deploy validation"
try {
    $resp = Invoke-WebRequest -Uri "https://ppbears.com/design/" -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
    if ($resp.StatusCode -eq 200) { Write-OK "Website returned 200 OK" }
} catch {
    Write-Host "  [Warning] Link test failed: $_" -ForegroundColor Yellow
}
Write-OK "Deployment Finished"
