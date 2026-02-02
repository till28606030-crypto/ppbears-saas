from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes import ai
import os
from datetime import datetime
from models import HealthResponse
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Build ID
BUILD_ID = os.getenv("BUILD_ID", f"fastapi-{os.getenv('PORT', '3002')}-{int(datetime.now().timestamp())}")
os.environ["BUILD_ID"] = BUILD_ID

app = FastAPI(
    title="PPBears SaaS API",
    description="FastAPI backend for PPBears SaaS - AI Image Processing",
    version="2.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生產環境應限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Custom Middleware: Add Build ID Header
@app.middleware("http")
async def add_build_id_header(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["x-ppbears-backend"] = BUILD_ID
        response.headers["x-backend"] = BUILD_ID
    return response

# Include Routers
app.include_router(ai.router, prefix="/api/ai", tags=["AI"])

# Root Endpoint
@app.get("/")
async def root():
    """根路徑 - 服務狀態"""
    return {
        "message": f"PPBears SaaS FastAPI Backend is running!",
        "buildId": BUILD_ID,
        "version": "2.0.0",
        "docs": "/docs"
    }

# Health Check
@app.get("/api/health", response_model=HealthResponse)
async def health():
    """健康檢查"""
    return HealthResponse(
        ok=True,
        time=datetime.now().isoformat()
    )

# 404 Fallback for /api
@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def api_not_found(path: str):
    """API 路由不存在"""
    return {
        "buildId": BUILD_ID,
        "success": False,
        "message": f"API Route not found: {path}",
        "errorCode": "NOT_FOUND"
    }

# Run with Uvicorn
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 3002))
    print(f"🚀 Starting FastAPI server on port {port}")
    print(f"🆔 BUILD_ID: {BUILD_ID}")
    print(f"📚 API Docs: http://localhost:{port}/docs")
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=True,
        log_level="info"
    )
