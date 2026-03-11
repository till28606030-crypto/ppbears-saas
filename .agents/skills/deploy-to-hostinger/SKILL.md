---
description: 部署更新到 GitHub 並透過 FTP 上傳到 Hostinger /design/ 資料夾（乾淨打包 + 驗證）
---

# 部署技能：GitHub + Hostinger FTP

這個 skill 用於：將專案最新程式碼推送到 GitHub，同時透過 FTP 更新 Hostinger 的 `/design/` 資料夾。
**絕對不可修改任何功能程式碼，只執行乾淨打包與部署。**

---

## Hostinger FTP 資訊

| 欄位 | 值 |
|------|-----|
| FTP Host | `178.16.135.30` |
| 使用者名稱 | `u141631622.czcz28606030` |
| 密碼 | `#g9fsjYp/:W1lkY4` |
| 目標路徑 | `/` (FTP 登入後即為 design 目錄) |
| 網站網址 | `https://ppbears.com/design/` |

> **注意**：FTP 密碼已被安全保存於此 skill 文件中，之後只需直接執行部署腳本，**不需**再徵求使用者同意密碼。

---

## 執行流程

### 步驟一：前置檢查與版號更新 (Version Bump)

1. 確認沒有誤改功能程式碼。
2. **必須**主動詢問使用者：「是否需要更新版本號？本次部署為修復 Bug (Patch) 還是新功能 (Minor)？」
3. 根據使用者的回應，更新 `package.json` 裡的 `version` 數字。
4. **重要**：為了讓本地開發伺服器 (`http://localhost:5173/`) 即刻顯示最新版本，更新版號後**必須**去修改 `vite.config.ts` 檔尾的註解（例如改成 `// Trigger dev server restart for version update (v4.6)`），這會觸發 Vite 自動重啟並讀取新的 `package.json` 版本號。
5. 根據最新的版號與近期的任務，幫使用者寫好 `CHANGELOG.md` 的新增內容。

```powershell
cd c:\Users\till2\Documents\trae_projects\ppbears-saas
git status
git diff --stat
```

### 步驟二：提交並推送到 GitHub

```powershell
cd c:\Users\till2\Documents\trae_projects\ppbears-saas
git add -A
git commit -m "chore: deploy update $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
git push origin main
```

### 步驟三：乾淨打包（Production Build）

```powershell
cd c:\Users\till2\Documents\trae_projects\ppbears-saas
# 確保使用生產環境設定
$env:VITE_BASE_PATH = "/design/"
npm run build
```

> **驗證打包結果**：
> 1. 確認 `dist/index.html` 存在
> 2. 確認 `dist/assets/` 資料夾存在且非空
> 3. 在 `dist/index.html` 中搜尋 `/design/` 確認 base path 正確

```powershell
# 驗證 base path
Select-String -Path "dist\index.html" -Pattern "/design/" | Select-Object -First 3
# 驗證 assets 存在
Get-ChildItem dist\assets | Measure-Object | Select-Object Count
```

### 步驟四：確認 .htaccess 參數

```powershell
# 將 htaccess 複製到 dist 資料夾準備上傳
Copy-Item deploy\hostinger-design-htaccess.txt dist\.htaccess
```

`.htaccess` 內容應為：
```
RewriteEngine On
RewriteBase /design/
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} -f [OR]
RewriteCond %{REQUEST_FILENAME} -d
RewriteRule ^ - [L]
RewriteRule . /design/index.html [L]
```

### 步驟五：執行 FTP 上傳腳本

使用專案內的 PowerShell 腳本上傳（執行前先向使用者確認 FTP 密碼）：

```powershell
cd c:\Users\till2\Documents\trae_projects\ppbears-saas
powershell -ExecutionPolicy Bypass -File scripts\deploy-hostinger.ps1
```

若腳本不存在，使用 WinSCP CLI 手動執行（需先安裝 WinSCP）：

```powershell
# WinSCP 方式上傳
& "C:\Program Files (x86)\WinSCP\WinSCP.com" `
  /command `
  "open ftp://u141631622.czcz28606030:%23g9fsjYp/:W1lkY4@178.16.135.30/" `
  "synchronize remote dist/ / -delete" `
  "exit"
```

### 步驟六：部署後驗證

```powershell
# 用 curl 或瀏覽器確認網站正常
curl -I https://ppbears.com/design/
```

在瀏覽器中開啟並確認：
- `https://ppbears.com/design/` → 設計器首頁正常顯示
- 測試直連路由不會 404（例如 `https://ppbears.com/design/def/123`）

---

## 重要注意事項

1. **自動執行部署** — 使用者已授權未來的部署可直接使用檔案中的密碼進行打包與上傳，不需事先詢問密碼，但仍需與使用者確認版本號更新規則 (`package.json`)，並撰寫修改紀錄 (`CHANGELOG.md`) (本次使用者指示版本號累積為一位小數 X.Y)。
2. **不可修改功能程式碼** — 此 skill 只做打包與上傳，不做程式邏輯修改。
3. **打包驗證必須通過** — 若 `npm run build` 失敗，不可繼續上傳。告知使用者錯誤訊息。
4. **Base Path** — 每次打包前必須確認 `VITE_BASE_PATH=/design/` 環境變數已設定。
5. 如果 `.env.production` 已有正確設定，優先使用環境檔案，不要覆蓋。
