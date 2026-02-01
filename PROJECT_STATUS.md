# 🐻 PPBears 客製化引擎 - AI 開發專用文檔 

> **給 AI 的指令**：這份文件是你對本專案的「長期記憶」。每次對話開始時，請先讀取此文件以了解當前狀態；每次對話結束前，必須更新此文件以保存進度。 

## 1. 專案願景 (Project Vision) 
- **當前目標 (Phase 1)**: 為 `ppbears.com` 開發客製化手機殼子網域。 
  - 流程：上傳圖片 -> 線上模擬 (Canvas) -> 選擇規格/屬性 -> 預覽確認 -> 加入購物車。 
  - 技術：React + Fabric.js (前端), Tailwind CSS (UI), IndexedDB (本地緩存), Lucide React (Icons)。 
- **未來目標 (Phase 2)**: 轉型為全球客製化 SaaS 平台。 
  - 商業模式：月租或點數扣款 (下載圖檔扣點)。 
  - 架構要求：代碼必須模組化，預留「多租戶 (Multi-tenant)」與「點數系統」的接口。 

## 2. 當前開發狀態 (Current Status) 
- **最近更新時間**: 2026-01-18
- **目前進度**: 🟢 核心功能開發中 / 規格管理系統完成
- **已完成功能**:
  - [x] 建立 React 專案基礎架構 (Vite, Tailwind).
  - [x] Fabric.js 畫布編輯器 (CanvasEditor) - 支援圖片上傳、縮放、文字編輯.
  - [x] 後台規格管理 (AdminOptionManager) - 支援規格大類、子選項、縮圖上傳、自訂屬性 (Custom Attributes).
  - [x] 前台結帳模組 (SaveDesignModal) - 兩層式規格選擇、燈箱放大預覽、價格動態計算、自訂屬性選單.
  - [x] 資料持久化 (IndexedDB via idb-keyval) - 暫時替代後端資料庫.

- **正在處理的任務**: 
  - [ ] 1. 優化畫布操作體驗 (圖層管理、Undo/Redo).
  - [ ] 2. 實作「手機殼遮罩 (Mask)」與「邊框 (Frame)」的進階整合.
  - [ ] 3. 串接真實後端 API (Supabase/WooCommerce).

## 3. 技術決策備忘錄 (Tech Stack & Decisions) 
- **目錄架構 (Category-First)**: 
  - 為了支援多租戶與多產品線，靜態資源已從平行結構遷移至以「類別」為首層的結構。
  - 路徑範例：`public/[category]/models/` 與 `public/[category]/assets/`。
- **UI 風格**: 主色 `#e50038` (紅)，輔助色 黃色 (目前開發階段多使用黑白灰+藍色強調).
- **資料流**: 
  - 前端：使用 `idb-keyval` 模擬後端資料庫，儲存規格 (Groups/Items) 與可用性 (Availability).
  - 畫布：Fabric.js JSON 用於保存設計狀態.
- **SaaS 預埋**: 所有 API 請求需預留 `tenant_id` 或 `api_key` 欄位.
- **規格結構**:
  - Group (大類): e.g., 惡魔防摔殼. 包含 `subAttributes` (如磁吸、邊框色).
  - Item (子項): e.g., 黑色, 白色.
  - Availability: 控制特定機型可用的規格.

## 4. 待辦事項清單 (Backlog) 
- [ ] 實作「手機殼遮罩 (Mask)」功能 - 讓圖片不超出手機殼範圍.
- [ ] 串接 WooCommerce Add-to-Cart API.
- [ ] 開發後端「扣點數並下載原圖」的邏輯.
- [ ] 增加更多畫布素材 (貼紙、背景).

## 5. 已知問題與解決方案 (Issues & Fixes) 
- **已修復**:
  - [x] 結帳選單 Hook 順序錯誤 (React Error).
  - [x] 規格大類無法重新選擇的問題 (導航邏輯修正).
  - [x] 自訂屬性 (Custom Attributes) 顯示與價格計算.
