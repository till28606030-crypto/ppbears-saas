# 快速啟動指南 - FastAPI Backend

## 🚀 5 分鐘快速開始

### Windows 用戶

```powershell
# 1. 進入目錄
cd server_fastapi

# 2. 創建虛擬環境
python -m venv venv

# 3. 激活虛擬環境
.\venv\Scripts\activate

# 4. 安裝依賴
pip install -r requirements.txt

# 5. 啟動服務器
python main.py
```

### Mac/Linux 用戶

```bash
# 1. 進入目錄
cd server_fastapi

# 2. 創建虛擬環境
python3 -m venv venv

# 3. 激活虛擬環境
source venv/bin/activate

# 4. 安裝依賴
pip install -r requirements.txt

# 5. 啟動服務器
python main.py
```

## ✅ 確認運行成功

1. **查看終端輸出**：
   ```
   🚀 Starting FastAPI server on port 3002
   🆔 BUILD_ID: fastapi-3002-...
   📚 API Docs: http://localhost:3002/docs
   
   INFO:     Uvicorn running on http://0.0.0.0:3002
   ```

2. **訪問 API 文檔**：
   - 打開瀏覽器：http://localhost:3002/docs
   - 您應該看到 Swagger UI 界面

3. **測試健康檢查**：
   ```bash
   curl http://localhost:3002/api/health
   ```
   
   應該返回：
   ```json
   {
     "ok": true,
     "time": "2026-02-02T07:33:19.123456"
   }
   ```

## 🧪 測試 AI 功能

### 方式 1: 使用 Swagger UI（推薦）

1. 訪問 http://localhost:3002/docs
2. 展開 **POST /api/ai/cartoon**
3. 點擊 **Try it out**
4. 上傳圖片或填入 imageUrl
5. 點擊 **Execute**

### 方式 2: 使用 cURL

```bash
# 測試卡通化（使用 URL）
curl -X POST "http://localhost:3002/api/ai/cartoon" \
  -F "imageUrl=https://example.com/image.jpg" \
  -F 'meta={"styleId":"toon_ink"}'

# 測試去背景（上傳文件）
curl -X POST "http://localhost:3002/api/ai/remove-bg" \
  -F "image=@/path/to/your/image.jpg"
```

## 🔧 常見問題

### Python 版本要求

需要 Python 3.8 或以上版本。檢查版本：

```bash
python --version
```

### 模組找不到

確保虛擬環境已激活（命令提示符前應有 `(venv)`）：

```powershell
# Windows
.\venv\Scripts\activate

# Mac/Linux
source venv/bin/activate
```

### Port 3002 被佔用

修改 `.env` 中的 PORT：

```env
PORT=3003
```

### Replicate API 錯誤

檢查 `.env` 中的 `REPLICATE_API_TOKEN` 是否正確。

## 📊 與 Node.js 版本對比測試

可以同時運行兩個服務器進行對比：

- **Node.js Express**: Port 3001
- **FastAPI**: Port 3002

測試相同的 API 並比較性能！

## 🎯 下一步

1. ✅ FastAPI 運行成功
2. 🧪 測試所有 AI endpoints
3. 📝 更新前端 API 配置（如果需要切換到 port 3002）
4. 🚢 部署到生產環境

查看 `README.md` 了解更多詳情。
