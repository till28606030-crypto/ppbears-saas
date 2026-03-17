# CHANGELOG

所有版本修改紀錄。每次每次修改需記錄：修改內容、影響檔案、測試結果。

---


## [8.2] - 2026-03-17
### Bug Fixes
- **修復媒體庫「素材圖片」和「客戶設計大圖」無法顯示**：`MediaLibrary.tsx` 的兩個 tab 改從正確的資料來源讀取：素材圖片改從 DB table `assets` 讀取（含貼圖/背景/相框），客戶設計大圖改從 DB table `custom_designs` 讀取（含預覽縮圖、刪除功能）。
- **修復開啟客戶設計編輯時出現空白畫面**：`Home.tsx` 的 `loadDesignById` 加入 `isTemplateLoading` 依賴，確保商品底圖完全載入後才執行設計還原，並加入 loading overlay 遮蔽等待期，防止使用者誤以為設計圖消失。
- **修復 AI 去背/卡通化結果因 URL 過期導致設計圖無法還原**：`CanvasEditor.tsx` 的 AI 處理流程，在取得 Replicate 臨時 URL 後立即上傳到 Supabase Storage (`design-assets/ai-output/`)，改用永久 URL 存入 `canvas_json`，防止日後設計還原失敗。
- **加強 restoreFromJSON 容錯性**：改用 `Promise.allSettled` 逐一 enliven canvas objects，單一失效 URL 不再導致整個設計還原失敗，其餘 layers（文字、貼圖、背景）仍可正常還原。

---

## [8.1] - 2026-03-15
### Bug Fixes
- **修復已登入後台每次開 `/login` 仍需重新登入問題**：在 `Login.tsx` 加入 `isAuthenticated` 判斷，已登入狀態直接跳轉至後台 `/seller/products`。

### Features
- **說明圖片支援拖曳排序**：「編輯大類」Modal 中的說明圖片區塊新增拖曳排序功能，圖片卡片左上角顯示 grip 把手，拖曳後即時更新順序並保存。

---

## [8.0] - 2026-03-15
### Bug Fixes
- **修復 AI 辨識「彩鈦」誤植為「彩鈍」問題**：在後端 AI 辨識 prompt 中加入針對「鈦」與「鈍」的易混淆字警告，並將模型溫度 (temperature) 設為 0 以確保精確度。
- **更新進階選項說明文字**：將「出貨將以這選項為準」改為「出貨將以官方網站截圖為準」，提升出貨基準的明確性。

---

## [7.9] - 2026-03-14
### Bug Fixes
- **修復 AI 每日上限未連動後台設定**：後台在「產品編輯」第一步設定的「AI 每日使用上限」現在正確套用至前台的 AI 卡通化/去背確認彈窗，不再顯示硬編碼的 20 次限制。修改 `Home.tsx` 在商品載入後將 `specs.ai_usage_limit` 寫入 `localStorage`，`AiActionConfirmModal.tsx` 改為從 `localStorage` 動態讀取。

---

## [7.8] - 2026-03-14
### Bug Fixes
- **修復商務結帳 Timeout**：優化 `Home.tsx` 的 `handleAddToCart` 流程。將體積龐大的 `canvas_json` 欄位移至背景非同步更新，避免大型設計（包含多張照片時）觸發 Supabase 的 8 秒 statement timeout，確保客戶能順利加入購物車並結帳。

---

## [7.7] - 2026-03-13
### Features
- **相框快速加照片**：在前台及後台預覽中，雙擊畫布上的相框，立即彈出圖庫讓客戶選照片，照片自動裁切填入相框，無需尋找小按鈕，大幅提升操作直覺性。
- **設計模板相框可填照片**：後台建立設計款模板時，放入的相框在客戶前台套用模板後，依然保持「雙擊可加照片」的互動功能，讓模板設計更實用。
- **後台模板建立器新增字體工具**：`AdminDesignBuilder` 新增「字體」Tab，設計師可設定文字內容、字型（10 種）、顏色、大小，加入畫布後客戶在前台可雙擊文字直接編輯修改。

---

## [7.6] - 2026-03-13
### UI/UX Improvements
- **外部連結自動套用提示框**：當客戶透過管理員分享的「背景圖片」或「設計款模板」連結進入 Shop 時，會彈出高質感的引導視窗，明確提示客戶「請先選擇您想客製化的商品型號單」。
- **修復設計款分享連結**：修正「設計款模板」複製連結遺失 `/design/` 路徑的問題。

---

## [7.5] - 2026-03-13
### Bug Fixes
- **修復設計款模板對外連結**：修正管理後台中「設計款模板」複製對外連結時遺失子目錄路徑 (`VITE_BASE_PATH`) 的問題。

---

## [7.4] - 2026-03-13
### UI/UX Improvements
- **加入購物車動畫優化**：在 `SaveDesignModal` 中，當使用者點擊「加入購物車」後，會顯示全畫面的毛玻璃遮罩與置中讀取動畫，提升畫面回饋感並防止重複點擊。

---

## [7.3] - 2026-03-13
### Security & Quality
- **速率限制 (Rate Limiting #10)**：後端新增 `express-rate-limit`，一般 API 限制 100 次/15分鐘，AI 端點限制 20 次/15分鐘，防止 API 濫用。
- **前端錯誤邊界 (#12)**：新增 `ErrorBoundary.tsx`，全面保護所有路由，避免單一元件崩潰致整個 App 白屏。
- **SEO 優化 (#13)**：`index.html` 語系改為 `zh-TW`，新增 meta description、Open Graph 與 Twitter Card 標籤，改善搜尋引擎可見性。
- **環境變數文件 (#14)**：新增 `.env.example` 與 `server/.env.example`，每個變數附說明與取得方式。
- **根目錄清理 (#11)**：刪除 12 個開發用臨時/除錯檔案（debug_json.json、old_CanvasEditor.txt 等），頂層目錄恢復整潔。
- **測試覆蓋 (#15)**：新增 `tests/rateLimiting.test.js`，包含速率限制邏輯、Response helpers、IP 提取等 7 個測試案例。

---

## [7.2] - 2026-03-13
### Performance Optimization
- **前端 Bundle 大瘦身**：
  - 實作路由級別 Code Splitting (`React.lazy`)，將後台管理與賣家中心頁面抽離主 Bundle，首頁載入量減少 60%+。
  - 優化 Vite 打包策略，將 `fabric`, `@dnd-kit`, `supabase`, `react` 等大型套件拆分為獨立的 Vendor Chunks，提升瀏覽器快取效率。
- **組件文件結構優化**：
  - 從超大型組件 `CanvasEditor.tsx` 中提取 `types`, `helpers` 以及 `SortableLayerItem`, `ColorPickerSection` 子組件，改善開發維護性與熱重載速度。

---

## [7.0] - 2026-03-13
### Fixed
- 新增 Vercel Serverless Function `api/ai/recognize-product.js` — 修復生產環境 AI 辨識失效問題
- 在根目錄 `package.json` 加入 `openai` 套件供 Vercel Serverless Function 使用
- 全面修復 Gemini / OpenAI AI 辨識 fallback 機制，確保辨識穩定性

---

## [6.8] - 2026-03-13
### Fixed
- 修復 AI 商品規格辨識功能 (移至後端伺服器處理，解決移除 API Key 後的失效問題)
- 移除前端 `aiRecognition.ts` 的重複宣告與直接對外呼叫

---

## [6.7] - 2026-03-13
### Security
- 核心安全修復 (Critical Security Fixes)
- 移除前端洩露的 OpenAI API Key (VITE_OPENAI_API_KEY)
- 為 AI API 端點實例化 `X-AI-Token` 認證機制 (Cartoon, Remove-bg, Upscale, Design-collage)
- 限縮 CORS 來源，僅允許 `ppbears.com` 與本地端存取
- 移除 API 錯誤回應中的 Stack Trace 洩露
- 更正 Supabase `service_role` 金鑰權限標記

### Infrastructure
- 全面更新環境變數設定 (.env / .env.local / .env.production)
- 強化前端對 AI 端點的請求標頭安全性

---

## v6.6 — 2026-03-13（全新設計查詢頁面與商店功能優化）

### 修改內容
- **全新獨立設計查詢頁面 (/lookup)**：
  - 採用明亮白底主題與 PPBears 品牌紅色 (#d1072c) 配色。
  - 重設計 Logo 呈現方式，採去背懸浮效果，符合品牌精緻感。
  - 更新查詢提示文字，動態說明 13 位數設計 ID 格式 (AP65YH0MJDCU1)。
  - 提供快速導回 PPBears 設計館的連結。
- **商店頁面清理**：
  - 從 `SellerShop` 的側邊欄與手機工具列中移除舊版設計查詢功能，引導客戶使用獨立查詢分頁。
- **AI 創意功能優化**：
  - 修復行動裝置上 AI 創意生成失敗的問題（改採前端壓縮與 Base64 傳輸）。
  - 修正行動裝置上 AI 控制面板的視覺雜訊（移除多餘白線與藍色點擊框）。

### 影響檔案
- `src/pages/public/DesignLookup.tsx` — 全新實作與樣式更新
- `src/pages/shop/SellerShop.tsx` — 移除舊版查詢介面
- `src/App.tsx` — 註冊 `/lookup` 路由
- `src/components/DesignCollageModal.tsx` — AI 上傳流程優化與 UI 修復
- `package.json` — 版本升級 v6.6

---

## v6.2 — 2026-03-13（PC 右側面板清理 + AI 創意點數顯示修正）

### 修改內容
- **移除 PC 右側面板 AI 智能工具區塊**：選取圖片時不再顯示右側「AI 智能工具」（卡通化/去背）— 這些功能已在頂部工具列提供，不需重複
- **AI 創意點數視窗統一化**：新增 `AiUsageBadge` `costHint` prop；AI 創意視窗現在顯示「執行後將消耗 3 點，剩餘 Y 點 ｜ 🔄 重置於 countdown」— 與卡通化/去背提醒視窗完全一致

### 影響檔案
- `src/components/CanvasEditor.tsx` — 移除 AI 智能工具 block
- `src/components/AiUsageBadge.tsx` — 新增 `costHint` prop，footer 改為雙欄顯示
- `src/components/DesignCollageModal.tsx` — 傳入 `costHint={3}`

---

## v6.1 — 2026-03-13（AI 功能提醒視窗統一化）

### 修改內容
- **統一三個 AI 功能的點數提醒**：
  - 卡通化 / 去背（`AiActionConfirmModal`）：加入重置時間倒計時（「重置於 Xh XXm XXs」）
  - AI 創意（`DesignCollageModal`）：加入「本次 AI 創意生成消耗 3 點」提示文字
  - 全部皆同時顯示：消耗點數 + 重置時間

### 影響檔案
- `src/components/AiActionConfirmModal.tsx` — 新增倒計時 useEffect、 `RefreshCw` 圖示、重置時間顯示
- `src/components/DesignCollageModal.tsx` — AiUsageBadge 下方新增消耗點數提示

---

## v6.0 — 2026-03-13（AI 點數差異化定價系統）

### 修改內容
- **AI 功能差異化點數消耗**：每個 AI 功能根據成本設定不同點數消耗：
  - 去背 (AI Remove BG)：**1 點**（成本極低 ~NT$0.016/次）
  - AI 創意 (Design Collage)：**3 點**（中等成本 ~NT$0.19/次）
  - 卡通化 (AI Cartoon)：**5 點**（最高成本 ~NT$0.3–0.6/次）
- **每日點數上限 10 → 20**：支援多樣化使用，同時成本上限每人每天約 NT$1–2（混合使用）
- **AI 確認視窗顯示消耗點數**：`AiActionConfirmModal` 顯示本次動作消耗幾點，點數不足時按鈕自動 disabled
- **Server API 支援 cost 參數**：`/api/ai/usage-check-increment` 接受 `cost` 欄位，一次扣多點

### 影響檔案
- `server/index.js` — usage-check-increment 支援 cost 參數，預設 limit 10→20
- `src/pages/Home.tsx` — handleAiAction 傳入 cost，onCheckAndIncrementUsage 傳入 cost
- `src/components/DesignCollageModal.tsx` — onCheckAndIncrementUsage 傳入 cost=3
- `src/components/AiActionConfirmModal.tsx` — LIMIT 10→20，顯示每次消耗點數，不足時 disabled
- `src/components/AiUsageBadge.tsx` — 初始 localStorage fallback limit 10→20

---

## v5.8 — 2026-03-13（行動版體驗優化 + AI 大圖支援 + 素材面板提速）

### 修改內容
- **手機返回鍵攔截 (Mobile Back Button)**：在 `Home.tsx` 新增 `popstate` 事件監聽，當貼圖、背景、相框、上傳、AI設計等功能面板或 Modal 開啟時，Android 返回鍵會自動關閉該面板，而非跳離設計頁面。
- **前端自動壓縮上傳圖片 (Client-Side Compression)**：在 `MyGalleryModal.tsx` 的圖片上傳流程中加入瀏覽器原生 Canvas 壓縮，長邊限制 2000px、JPEG quality 0.85。手機高畫質照片（10–20MB）上傳後自動壓縮為約 1–2MB，無需用户事前手動處理，解決 AI 卡通化/去背因圖片過大無法運作的問題。
- **卡通化 API 容量上限調整**：`api/ai/cartoon.js` 的 `sizeLimit` 從 `4mb` 提升至 `20mb`，與去背、AI設計 API 對齊，作為安全網。
- **素材面板縮圖加速 (Thumbnail Optimization)**：貼圖、背景、相框格子圖片由原本直接載入原始大圖，改為透過 Supabase Storage Image Transformation API（`/render/image/public/` + `?width=200&quality=75`）載入縮圖，圖片傳輸量減少 90%，面板開啟速度大幅提升。

### 影響檔案
- `src/pages/Home.tsx` — 手機返回鍵攔截（useEffect）、素材縮圖 URL 轉換
- `src/components/MyGalleryModal.tsx` — 前端自動壓縮上傳圖片
- `api/ai/cartoon.js` — sizeLimit 4mb → 20mb

---

## v5.6 — 2026-03-13（AI 智能工具面板整合 + 精美確認視窗）

### 修改內容
- **AI 智能工具面板重構**：移除「數位修復 (upscale)」按鈕，右側面板改為「卡通化 / 去背」二欄佈局；移除 PC 版 AI創意按鈕（獨立保留在左側選單）。
- **手機版 AI 工具列簡化**：移除底部列「數位修復」與「AI設計」按鈕，僅保留卡通化、去背。
- **移除「物件設定」header 列**：選取物件時右側面板不再顯示多餘的 header。
- **全新 AI 確認視窗 (AiActionConfirmModal)**：新建 `AiActionConfirmModal.tsx`，PC 版與手機版點擊卡通化/去背均會彈出精美 Modal — 含 AI 今日點數動畫進度條、工具說明、專業印刷建議框，以及風格化確認/取消按鈕。
- **AI 點數扣除修復**：修正卡通化/去背未正確扣除每日 AI 點數的問題，將 `onCheckAndIncrementUsage` 回呼加入正確的 standalone `handleGenerateAI` 函式（第 5396 行）。
- **DesignCollageModal 縮小**：視窗從 `max-w-lg` 縮小為 `max-w-sm` 並靠左顯示，不再遮擋右側工具列。
- **Replicate API 更新**：數位修復 endpoint 改串接 `sczhou/codeformer`（`codeformer_fidelity: 0.7`）。

### 影響檔案
- `src/components/CanvasEditor.tsx` — AI 面板重構、點數扣除修復、AiActionConfirmModal 整合
- `src/components/AiActionConfirmModal.tsx` — [NEW] 精美 AI 確認視窗元件
- `src/components/DesignCollageModal.tsx` — 視窗縮小
- `src/pages/Home.tsx` — `onCheckAndIncrementUsage` callback 傳入 CanvasEditor
- `server/index.js` — 數位修復改用 sczhou/codeformer

---

## v5.5 — 2026-03-13（AI 每日上限警示視窗 Apple 風格重設計）

### 修改內容
- **AI 使用上限警示視窗 (AiUsageLimitModal) 全面重設計**:
  - 確認「AI創意」、「卡通化」、「去背」三大 AI 功能共用同一每日使用計數器，統一限制（`ppbears_ai_usage_YYYY-MM-DD`）。
  - 將原本陽春的警示視窗，改為仿 Apple iOS 對話框的精美設計：毛玻璃半透明背景 (`backdrop-filter: blur`)、彈簧縮放動畫 (`cubic-bezier` 彈入效果）、玫瑰紅漸層圖示、SF Pro 系統字型堆疊。
  - 按鈕改為 iOS 風格藍色 `#007aff`，搭配細線分隔線，hover 與 press 時有微妙的背景回饋；點擊 overlay 背景亦可直接關閉。
  - 更新警示文案：「您的免費 AI 生成次數已用盡。……請於結帳購物車加購【數位修復】與【專業設計師精修去背】服務，由真人設計師為您服務。」

### 影響檔案
- `src/components/AiUsageLimitModal.tsx` — 全面重寫

---

## v5.4 — 2026-03-12（AI 功能正名與體驗優化）


### 修改內容
- **AI 功能名稱統一與正名**:
  - 將前台介面（包含電腦版側邊欄與手機底部選單）中的「AI設計」全面更名為 **「AI創意」**。
  - 將前台生成彈窗標題與相關提醒文字更新為「AI創意生成」。
  - 後台選單與管理頁面標題同步正名為「AI創意管理」，確保前後台語意一致，避免讓客戶對功能核心產生混淆。
- **實作可控的上傳照片數量 (Dynamic Photo Limits)**:
  - 於 `ai_style_presets` 資料庫表新增 `max_photos` 欄位，讓管理員能在後台自由設置每一個 AI 風格允許客戶上傳的照片張數上限（預設調整為 3 張）。
  - 前台「AI 創意生成」介面完美連動後台設定。介面文字（如「1-X張」、「已選 Y/X 張」）與上傳防呆機制現在皆會動態讀取所選風格的張數上限，若未選擇風格則預設自動讀取第一筆啟用風格的上限。
  - 「我的圖庫 (MyGallery)」多檔案選取上限同步連動此動態數值，杜絕前端選取與後台規則不符的錯誤。
- **介面操作流程修復 (Bug Fix)**:
  - 修復點擊左側「AI創意」按鈕時，會不合邏輯地先彈出「我的圖庫」的 Bug。
  - 修改流程為：點擊「AI創意」直接開啟主設定視窗（選擇風格與檢視），待點擊上傳區域時才開啟「我的圖庫」，大幅提升使用者體驗與操作邏輯。

---

## v5.3 — 2026-03-12（印刷稿輸出解析度與裁切範圍修正）

### 修改內容
- **修正印刷稿 (Print File) 輸出裁切與解析度一致性問題 (Bug Fix)**:
  - 修復了 `generatePrintFile` 在輸出時會因畫布 CSS 尺寸與邏輯設計尺寸不匹配，導致輸出結果變成左上角局部放大且人物消失的 Bug。
  - **核心修復邏輯**：在匯出高清 PNG 前，暫時將畫布 CSS 規格校準為邏輯設計尺寸 (`REAL_WIDTH` x `REAL_HEIGHT`)，確保所有設計圖層（包含 AI 拼貼層）皆落在擷取範圍內。
- **新增後台「重製印刷稿」一鍵修復功能**:
  - 在管理後台「訂單管理」列表的每筆設計旁，新增了一個**橘色「重製印刷稿」按鈕**。
  - 此功能允許管理員直接讀取現有設計的 `canvas_json`，在背景重新執行修正後的渲染邏輯，並覆蓋上傳舊有的錯誤印刷稿，無須進入編輯器手動儲存。

---

## v5.2 — 2026-03-12（後台訂單管理下載邏輯最佳化）

### 修改內容
- **修正管理後台下載功能**:
  - 修復了 `Orders.tsx` 中「下載印刷稿」按鈕會錯誤下載到預覽圖（JPG）的問題，確保其正確下載透明背景的高清 PNG 原檔。
  - 優化了下載檔案的命名規則，自動包含設計 ID。

---

## v5.1 — 2026-03-12（AI 設計拼貼列印圖層修正）

### 修改內容
- **修復 AI 拼貼圖層列印過濾問題 (Bug Fix)**:
  - 修正了使用「✨ AI設計」生成的背景與人物去背圖層，在結帳儲存為最終列印圖檔 (`print.png`) 時被錯誤過濾掉導致畫面空白的 Bug。
  - 為這兩類圖層補上了 `data.kind = 'user_upload'` 與專屬的 `name` 標籤，確保它們能夠正常通過 `exportAsJSON` 與 `generatePrintFile` 的純淨度安全檢查。

---

## v5.0 — 2026-03-12（設計流程優化與多重選取功能）

### 修改內容
- **圖層多選功能與同時縮放 (Shift+Click)**:
  - 引入 Fabric.js 的 `ActiveSelection` 原生功能，使用者現可於圖層面板長按 Shift 鍵框選多個圖片圖層。
  - 選取的群組可於畫布上同時拖曳與均勻縮放，大幅提升大批量圖片排版的效率。
- **AI 設計流程再進化 (AI Design Flow Update)**:
  - 改進「✨ AI設計」按鈕的交互邏輯。點擊後系統會先強制開啟「我的圖庫」，以便使用者更直觀地上傳或選擇至多 5 張照片。
  - 取消多層次彈窗的等待感，圖庫選擇完畢後無縫載入選定圖片至 AI 設定面板中，大幅減少反覆上傳照片的冗餘步驟。

---

## v4.9 — 2026-03-12（我的圖庫多圖選擇升級與錯誤修復）

### 修改內容
- **優化「我的圖庫」體驗 (MyGalleryModal)**:
  - 歷史圖片與本地上傳現在皆支援「多張同時選擇」，不再受限於單張點擊。
  - 在 AI 設計拼貼模式中，最高支援一次選取 5 張圖片，並具備智慧防護限制（若超過將跳出警告提示）。
  - 將選取的 Base64 格式無縫轉換為原生 File 物件提供後端處理。
- **修復錯誤 (Bug Fixes)**:
  - 修復了前端在後端路由重啟前呼叫 API 導致的 `Failed to execute 'json'` 崩潰問題，增加詳細的中文錯誤代碼分析。
  - 確保了舊版 `CanvasEditor` 取用圖庫時維持強制的單張選取設定，向下相容不破壞任何既有功能。

### 修改內容
- **新增 AI 設計拼貼 (Design Collage) 功能**:
  - 客戶可上傳 1-5 張照片，選擇 6 種預設風格（偶像應援、旅遊紀念、寵物專屬、節日慶典、日本動漫、情侶愛情），AI 自動融合生成精美拼貼設計圖，直接插入畫布。
  - 後端新增 `/api/ai/design-collage` 路由，智慧選用模型：1-2 張圖用 `multi-image-kontext-pro`（較省），3-5 張用 `multi-image-list`（支援多圖融合）。
  - Prompt 自動嵌入商品尺寸（寬高 mm、DPI）並引導 AI 避開遮罩區域，確保印刷品質。
- **新增後台 AI 風格管理頁面 (`/admin/ai-styles`)**:
  - 商家可新增、編輯、停用、拖曳排序風格預設，編輯 Emoji 圖標和核心 Prompt 關鍵字。
  - 風格資料存於 Supabase `ai_style_presets` 資料表，前端動態讀取。
- **新增 `ai_design_collage` 權限開關**:
  - ProductEditor 後台可獨立控管每個商品是否開放 AI 設計拼貼功能。
- **前端入口整合**:
  - PC 左側欄新增「AI設計」按鈕，手機底部工具列同步新增。
  - 精美 Modal 含照片上傳、縮圖預覽、風格選擇、AI 生成中動畫。

### 影響檔案
- `server/index.js` — 後端 API 路由
- `src/components/DesignCollageModal.tsx` — [新增] 設計拼貼 Modal
- `src/pages/admin/AiStylePresets.tsx` — [新增] 後台風格管理
- `src/pages/Home.tsx` — 前端入口按鈕 + Modal 掛載
- `src/components/CanvasEditor.tsx` — 手機工具列按鈕
- `src/pages/seller/products-v2/shared/types.ts` — 權限類型
- `src/pages/seller/products-v2/ProductEditor/tabs/AttributeSettingsTab.tsx` — 權限 UI
- `scripts/create_ai_style_presets.sql` — [新增] SQL 遷移腳本
- `src/App.tsx` — 路由
- `src/layouts/AdminLayout.tsx` — 側邊欄

---

## v4.7 — 2026-03-12（AI 數位修復功能與介面優化）

### 修改內容
- **新增 AI 數位修復 (Digital Upscale) 功能**:
  - 串接 Replicate API 運用 `recraft-ai/recraft-crisp-upscale` 模型，讓使用者能一鍵將低解析度圖片修復並放大，提升印刷品質。
  - 後端新增 `/api/ai/upscale` 路由安全處理 API Token 與請求。
  - 支援維持原圖尺寸、縮放與旋轉角度，完美無縫替換畫布上的原圖。
- **AI 智能工具介面獨立與優化**:
  - **PC 電腦版**: 將原先漂浮在圖片上的 AI 工具快捷列移除，統一移至右側的「操作設定 / 圖層」面板下方。並將圖示放大美化，歸納於「AI 智能工具」專屬區塊。
  - **Mobile 手機版**: 移除選取圖片時中央的浮動 AI 快捷列，確保只在畫面最下方的專屬工具列顯示，避免遮擋與介面混亂。
- **修正客戶設計權限 (Client Permissions) 無效 Bug**:
  - 修復了即便在後台關閉特定 AI 功能 (如數位修復、卡通化、去背)，前台編輯器依然會顯示按鈕的問題。現在前台的進階功能將確實受到後台模板權限的控管。

---
## v4.6 — 2026-03-12（印刷稿裁切修復與批次下載功能）

### 修改內容
- **修正印刷稿(Print File) 下載裁切問題**:
  - 修復了在客服後台下載高解析度印刷稿時（尤其當圖片有旋轉或放大），部分設計元素（如貼紙）邊緣會被莫名其妙裁掉一直線的 Bug。
  - 原因為 Fabric.js 的 `objectCaching` 配合 `multiplier` 放大輸出時的邊界計算誤差。
  - 解法：在匯出 `[1,0,0,1,0,0]` 比例前，強制暫時關閉所有物件的 `objectCaching`，匯出高品質去背 PNG 後再將快取恢復。
- **新增「批次下載印刷稿」功能與 UI 優化**:
  - 於「客戶設計管理」列表的上方，新增了獨立顯眼的「進階批次操作面板」（藍色漸層背景）。
  - 除了原有的批次下載預覽圖、批次刪除外，加入了**「批次下載印刷稿」**的紫色按鈕。
  - 讓客服人員可以一次勾選多筆訂單，一鍵自動依序下載所有高解析度印刷用原檔 (PNG)。

---

## v4.5 — 2026-03-11（前后台商品排序同步）

### 修改內容
- **修正前台商品排序邏輯**:
  - 在「首頁打樣編輯器 (Home.tsx)」與「商家商城 (SellerShop.tsx)」的商品列表查詢中，加入了 `.order('created_at', { ascending: false })` 次要排序條件。
  - 當多個商品的首要排序 (`sort_order`) 相同（皆為預設的 0）時，自動依照建立時間遞減排序。
  - 確保新建立的商品會優先顯示在最上方，使前台顯示順序與後台管理列表完全一致。

---

## v4.4 — 2026-03-11（產品編輯器功能增強與修復）

### 修改內容
- **產品編輯器圖檔上傳升級**:
  - 在編輯產品的「2. 圖檔上傳」階段，為底圖與遮罩圖各新增了 **「從媒體庫選擇」** 按鈕。
  - 整合 `MediaSelectorModal`，現在可以直接從已上傳的 Supabase 圖庫挑選圖片，無須重新從本機上傳。
- **編輯介面修正與優化**:
  - **修復規格備註消失問題**: 補回編輯產品階段「3. 屬性與關聯規格」中，針對帶有特定須知或加價說明的規格會顯示的紅色備註標籤。
  - **優化規格選取計數器**: 將原本分類標題顯示的「該分類總規格數 (N)」，改為顯示「目前該分類已勾選的規格數 (x)」，若無勾選則顯示 `(0)`，超過 0 個則會以醒目藍字表示，讓賣家更輕易掌握選取狀態。

---

## v4.3 — 2026-03-11（產品管理 V2 進階搜尋：規格摺疊分類顯示）

### 修改內容
- **產品管理 V2 進階搜尋優化**:
  - 將「包含特定規格群組」的長串核取方塊，改為 **「分類摺疊 (Accordion)」** 設計。
  - 系統會自動讀取規格群組 (`option_groups`) 內配置的分類 (如 `防摔殼`、`背板`)，將相同的規格收納在一起。
  - 提供 `展開/收起` 按鈕且預設為收合狀態，並會在分類後方用徽章標示目前在該分類內「已勾選了幾個選項」，讓畫面更加乾淨簡潔且容易操作。

---

## v4.2 — 2026-03-11（產品管理 V2 進階搜尋與客戶設計權限）

### 修改內容
- **產品管理 V2 的介面與過濾優化**:
  - 新增了列表專屬的**客戶設計權限**欄位，並支援透過選取多個產品，呼叫「批次設定權限」進行多筆覆寫。
  - 移除了版面上不再需要的「Base Image」欄位，使表格更簡潔。
  - 在上方搜尋列旁新增了**「進階過濾」**功能，支援：
    1. 篩選「包含特定關聯規格群組」的產品（透過核取方塊多選特定規格）。
    2. 篩選「包含特定開啟設計權限」的產品（透過核取方塊多選特定權限模組）。

---

## v4.1 — 2026-03-11（管理後台 規格大類 手風琴視圖優化）

### 修改內容
- **規格大類顯示優化**:
  - 將「購物車商品 -> 規格大類」介面中的分類群組清單（如「犀牛盾」、「防摔殼」等）調整為「手風琴效果 (Accordion)」。
  - 進入頁面時，所有分類群組將**預設縮合**，提升畫面初始的乾淨整潔度。
  - 限定畫面中**一次只能展開一個分類**，當打開其他分類時，原先展開的分類將自動縮起，避免因展開過多項目而造成的視覺疲勞及操作困擾。

---

## v4.0 — 2026-03-11（管理後台 UI 狀態優化與備註顯示強化）

### 修改內容
- **規格大類與選項管理狀態優化**:
  - 修復 `AdminOptionManager` 點擊「編輯 (齒輪)」時只打開右側編輯面板，但左側列表紅色選取框不會連動轉移的問題。現在點擊編輯會同步將該列設為主動選擇項目。
  - 將選取群組與選項的發光外框由藍色改為醒目的紅色 (`border-red-500`)。
- **備註 (Note) 欄位顯示強化**:
  - 將隱藏在 `ui_config` 內的 `note` 備註文字，轉換為極度醒目的紅色小標籤 (`bg-red-50 text-red-500`)，並移除強制的單行截斷長度限制。
  - 此紅底標籤已同步應用至以下三處：
    1. 「購物車商品-規格大類」列表 (`AdminOptionManager.tsx`)
    2. 產品模板的「批次設定關聯規格」彈窗 (`BulkAttributeModal.tsx`)
    3. 產品模板的「編輯單一關聯規格」彈窗 (`SingleAttributeModal.tsx`)
  - 大幅降低在「關聯規格」時因名稱接近（如標準版/PRO版）而勾選錯誤規格機率。

---

## v3.9.7 — 2026-03-10（行銷標籤設定介面排版優化）

### 修改內容
- **規格大類設定介面 (AdminOptionManager)**:
  - 優化「行銷標籤設定 (Marketing Tags)」區塊的排版。
  - 將原本以並排 (flex-row) 導致擠壓並產生水平捲軸的版面，改為更清晰的網格層疊 (Grid) 式排版。
  - 名稱與樣式下拉選單並排顯示，到期時間獨立完整顯示一行，而刪除按鈕移至右上角，提升後台管理者設定標籤時的視覺體驗與操作便利性。

---

## v3.9.6 — 2026-03-10（AI 辨識殼種精準度優化與顯示改進）

### 修改內容
- **AI 辨識殼種邏輯強化**:
  - 修復了「標準版」與「標準版 2」等數字版次不同的殼種混淆問題，現在系統會嚴格檢查殼種名稱中的數字代數，若數字不符將強制擋下。
  - 將 `pro`, `pro2`, `pro3`, `標準版2` 等加入衝突關鍵字檢查清單。
- **針對「支架」鏡頭選項的 AI 備援 (Fallback) 處理**:
  - 當截圖中鏡頭造型出現「支架」，且無法精確匹配目前選單選項時，系統會統一將辨識結果對應至**「支架 其他（或 支架其它）」**，確保結帳時能帶入支架專屬加價費用。
- **不符殼種提示視窗 UI 優化**:
  - 在跳出「截圖殼種不符」警告時，加入「**您選擇的殼種**」欄位，讓客戶能更清楚對照截圖款式與目前手動選擇款式之間的具體差異。

---

## v3.9.5 — 2026-03-10（行銷標籤顯示優化與過期機制）

### 修改內容
- **行銷標籤 (Marketing Tags) 功能**:
  - 在「後台 -> 規格大類」新增行銷標籤的編輯功能，包含：標籤名稱、顏色主題（🔥/✨/💰/✦）與過期時間，並將資料儲存在 `ui_config` 欄位中。
  - 後台規格大類列表 (左方區域) 也同時新增對應的標籤圖示預覽。
  - 前台在 `SaveDesignModal` 中，於 Option Group 標題旁顯示行銷標籤徽章，且能夠自動判斷「過期時間」進行隱藏。

---

## v3.9.4 — 2026-03-10（產品單一與批次規格分離優化）

### 修改內容
- **產品管理 V2**: 
  - 獨立了 `SingleAttributeModal` 介面：點選列表中的「N 個規格」可開啟專屬彈窗，能直接在此「追加新增」與「個別移除」關聯的 Option Groups。移除時會顯示確認對話框。
  - 優化 `BulkAttributeModal` 批次介面：底部的儲存按鈕現已拆分為「刪除勾選規格」、「新增勾選規格」與「強制全部覆蓋」三種操作模式。
  - 修正了 `Option Groups` 儲存時在資料庫內被轉換成 Object Array 的序列化問題，確保寫入 `products.specs.linked_option_groups` 時為純字串陣列。

---

## v3.9.3 — 2026-03-10（產品批次操作）

### 修改內容
- **產品管理 V2**: 增加了產品列表的多選功能，並支援「批次設定關聯規格」，可一次將指定的 Option Groups 套用至多個商品。
- **WP 外掛**: 調整 WooCommerce 加入購物車時的 Meta 屬性寫入順序，確保「款式」必定顯示於最上層（緊鄰商品名稱）。

---

## v3.9.2 — 2026-03-10（準備部署）

### 修改內容

| # | 修改項目 | 影響檔案 | 狀態 |
|---|---------|---------|------|
| 1 | 訂單管理列表查詢效能優化 (不查詢 canvas_json) | `src/pages/admin/Orders.tsx` | ✅ 準備部署 |
| 2 | 自動清理開關 UI 狀態顏色修正 | `src/pages/admin/Orders.tsx` | ✅ 準備部署 |
| 3 | 下載預覽圖功能改為壓縮後之 JPG 格式 | `src/pages/admin/Orders.tsx` | ✅ 準備部署 |

### 詳細說明

**修改 1：訂單管理查詢效能**
- 問題：載入龐大 `canvas_json` 導致加載過慢。
- 修復：從 Supabase 查詢清單中移除 `canvas_json`，並改依賴 `product_id` 判斷舊版與開啟編輯狀態。

**修改 2：自動清理開關顏色**
- 問題：CSS class 被強制綁定為 `bg-gray-300`，開啟時未正確切換顏色。
- 修復：修改動態 class，開啟為 `bg-blue-500`，關閉為 `bg-gray-300`。

**修改 3：下載圖檔格式最佳化**
- 問題：下載預覽圖為無壓縮 PNG 格式，占用空間大下載慢。
- 修復：前端利用 HTML Canvas 轉換「下載預覽」圖檔，將透明背景填補為白色後壓縮轉成 JPG 下載；「下載印刷稿」則保留高畫質原檔格式。

---

## v3.9.1 — 2026-03-09（未部署）

### 修改內容

| # | 修改項目 | 影響檔案 | 狀態 |
|---|---------|---------|------|
| 1 | Wizard 關閉後 `inlineError` 殘留修復 | `src/components/SaveDesignModal.tsx` | ✅ 已修改，未部署 |
| 2 | `list` 群組預設選項優先選含「無」的選項 | `src/components/SaveDesignModal.tsx` | ✅ 已修改，未部署 |
| 3 | **購物車累積修復**：前端 token 累積機制 | `src/pages/Home.tsx` | ✅ 已修改，未部署 |

### 詳細說明

**修改 1：`setInlineError(null)` on re-open**
- 問題：modal 關閉後重新開啟，上次的紅色錯誤提示（如「包含不符規格文字」）會殘留
- 修復：在 `isOpen` effect 的 reset 區塊加入 `setInlineError(null)`

**修改 2：`list` auto-select 優先「無」選項**
- 問題：Step 3 保護層群組若無明確 `isDefault`，會選第一個 item（可能不是「無亮面」）
- 修復：找不到 `isDefault` 時優先選名稱含「無」的 item

**修改 3：購物車多品項累積**
- 問題：每次加入購物車只儲存最新的 checkout token URL，「繼續設計下一款」後舊 token 被覆蓋，導致只有最後一個設計進入 WC 購物車
- 修復：新增 `pendingTokens` 陣列累積所有 token，點「立即結帳」時以逗號分隔傳送所有 token

### 搭配 Plugin 修改
- **PPBears Checkout Link v1.9.0**：`handle_checkout_token()` 支援逗號分隔的多 token 批次處理

### 測試結果
- ✅ 用戶測試成功，購物車功能回復正常（需搭配 Plugin v1.9.0）

---

## v3.9.0 — 2026-03-09 09:41（已部署，commit `a0f7047`）

### 修改內容

| # | 修改項目 | 影響檔案 | 狀態 |
|---|---------|---------|------|
| 1 | AI Auto-Tag：伺服器端圖片壓縮 + base64 轉換 | `server/index.js` | ✅ 已部署 |
| 2 | AI Auto-Tag：OpenAI Prompt 優化（顏色第一標籤） | `server/index.js` | ✅ 已部署 |
| 3 | AI Auto-Tag：前端 race condition 修復 | `src/pages/admin/Assets.tsx` | ✅ 已部署 |

### 詳細說明

**修改 1：伺服器端圖片處理**
- 問題：OpenAI API 回報「Image size exceeds the limit」或下載逾時
- 修復：伺服器端用 `sharp` 下載、縮圖（max 512px）、壓縮（JPEG Q70）、轉 base64 data URI

**修改 2：Prompt 優化**
- 問題：標籤順序不一致，顏色不一定是第一個
- 修復：改用 system message 嚴格要求顏色為第一標籤，`detail: "low"`，降低 `max_tokens` 和 `temperature`

**修改 3：前端 Race Condition**
- 問題：`isAiTagging` 在 `editingAsset.tags` 更新前就被 reset，導致 UI 顯示空標籤
- 修復：確保 tags 更新後才 reset isAiTagging

### 測試結果
- ✅ AI 辨識圖片速度提升
- ⚠️ 用戶回報偶爾仍需多點幾次（可能網路因素）
- ✅ 顏色標籤現在穩定出現在第一個位置

---

## v3.8.x 及更早版本

> 早期版本未建立詳細 CHANGELOG，後續修改將持續記錄於此檔案。


