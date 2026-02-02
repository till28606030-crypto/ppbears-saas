# PPBears SaaS - FastAPI Backend

**新一代 Python FastAPI 後端，專為 AI 圖片處理優化。**

## ✨ 特點

- 🚀 **高性能**: 基於 FastAPI + Uvicorn，異步處理
- 📝 **自動文檔**: 訪問 `/docs` 查看 Swagger UI
- 🔍 **類型安全**: Pydantic 自動驗證請求/響應
- 🎨 **AI 整合**: Replicate API (卡通化、去背景)
- 🖼️ **圖片處理**: Pillow 自動調整大小、格式轉換

## 📦 安裝

### 1. 創建虛擬環境

```bash
cd server_fastapi
python -m venv venv

# Windows
venv\Scripts\activate

# Mac/Linux
source venv/bin/activate
```

### 2. 安裝依賴

```bash
pip install -r requirements.txt
```

### 3. 設定環境變數

複製 `.env.example` 為 `.env` 並填入您的配置：

```bash
cp .env.example .env
```

編輯 `.env`：

```env
REPLICATE_API_TOKEN=your_replicate_api_token_here
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
PORT=3002
```

## 🚀 運行

### 開發模式（自動重載）

```bash
python main.py
```

或使用 uvicorn：

```bash
uvicorn main:app --reload --port 3002
```

### 生產模式

```bash
uvicorn main:app --host 0.0.0.0 --port 3002 --workers 4
```

## 📚 API 文檔

啟動服務器後訪問：

- **Swagger UI**: http://localhost:3002/docs
- **ReDoc**: http://localhost:3002/redoc
- **OpenAPI JSON**: http://localhost:3002/openapi.json

## 🔌 API Endpoints

### 健康檢查

```http
GET /api/health
```

### AI - 卡通化

```http
POST /api/ai/cartoon
Content-Type: multipart/form-data

# 方式 1: 文件上傳
image: <file>
meta: {"styleId": "toon_ink"}

# 方式 2: URL 輸入
imageUrl: https://example.com/image.jpg
meta: {"styleId": "toon_anime"}
```

**Style IDs**:
- `toon_ink`: 墨水風格（默認）
- `toon_mochi`: Mochi 風格
- `toon_anime`: 動漫風格

### AI - 去背景

```http
POST /api/ai/remove-bg
Content-Type: multipart/form-data

# 方式 1: 文件上傳
image: <file>

# 方式 2: URL 輸入
imageUrl: https://example.com/image.jpg
```

## 📁 項目結構

```
server_fastapi/
├── main.py              # 主應用入口
├── config.py            # 配置管理
├── models.py            # Pydantic 數據模型
├── routes/              # API 路由
│   ├── __init__.py
│   └── ai.py           # AI endpoints
├── services/            # 業務邏輯
│   ├── __init__.py
│   ├── image_processor.py      # 圖片處理
│   └── replicate_service.py    # Replicate API
├── utils/               # 工具函數
│   └── __init__.py
├── .env                 # 環境變數（不要提交到 git）
├── .env.example         # 環境變數範本
├── requirements.txt     # Python 依賴
└── README.md           # 本文件
```

## 🧪 測試

### 使用 cURL

**卡通化 (文件上傳)**:
```bash
curl -X POST "http://localhost:3002/api/ai/cartoon" \
  -F "image=@test.jpg" \
  -F 'meta={"styleId":"toon_ink"}'
```

**卡通化 (URL)**:
```bash
curl -X POST "http://localhost:3002/api/ai/cartoon" \
  -F "imageUrl=https://example.com/image.jpg" \
  -F 'meta={"styleId":"toon_anime"}'
```

### 使用 Swagger UI

訪問 http://localhost:3002/docs 並直接在瀏覽器中測試 API！

## 🔧 配置

所有配置在 `config.py` 中管理，透過環境變數或 `.env` 文件設定：

| 環境變數 | 預設值 | 說明 |
|---------|--------|------|
| `REPLICATE_API_TOKEN` | - | Replicate API Token (必填) |
| `SUPABASE_URL` | - | Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | - | Supabase Service Role Key |
| `PORT` | 3002 | 服務器端口 |

## 🚢 部署

### Docker

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Vercel

查看 `fastapi_migration_plan.md` 中的 Vercel 部署配置。

## 🆚 對比 Node.js 版本

| 特性 | Node.js Express | FastAPI |
|------|----------------|---------|
| 性能 | 快 | 極快 |
| 類型檢查 | 手動 | 自動 (Pydantic) |
| API 文檔 | 需安裝額外套件 | 內建 Swagger UI |
| 異步支援 | 原生 | 原生 |
| AI/ML 生態 | 有限 | 豐富 |

## 📝 開發注意事項

1. **虛擬環境**: 始終在虛擬環境中開發
2. **環境變數**: 不要將 `.env` 提交到 Git
3. **日誌**: 使用 `print()` 或 Python logging 模組
4. **錯誤處理**: 已內建完整的錯誤處理和 try-catch

## 🐛 常見問題

### 模組找不到

確保虛擬環境已激活並安裝所有依賴：
```bash
pip install -r requirements.txt
```

### Port 已被佔用

修改 `.env` 中的 `PORT` 或使用不同端口啟動：
```bash
uvicorn main:app --port 3003
```

### Replicate API 錯誤

檢查 `REPLICATE_API_TOKEN` 是否正確設定在 `.env` 中。

## 📄 License

與主項目相同

## 🙋 支援

如有問題，請查看：
- API 文檔: http://localhost:3002/docs
- 遷移計劃: `fastapi_migration_plan.md`
