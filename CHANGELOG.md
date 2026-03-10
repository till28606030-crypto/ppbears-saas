# CHANGELOG

所有版本修改紀錄。每次修改需記錄：修改內容、影響檔案、測試結果。

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
