from pydantic import BaseModel, HttpUrl
from typing import Optional, Literal, Dict, Any
from datetime import datetime


class AIResponse(BaseModel):
    """AI API 響應模型"""
    buildId: str
    success: bool
    url: Optional[str] = None
    message: Optional[str] = None
    errorCode: Optional[str] = None
    error: Optional[str] = None
    stack: Optional[str] = None


class CartoonMeta(BaseModel):
    """卡通化參數"""
    styleId: Literal["toon_ink", "toon_mochi", "toon_anime"] = "toon_ink"


class TemplateCreate(BaseModel):
    """創建模板請求"""
    name: Optional[str] = "未命名設計"
    canvasData: Dict[str, Any]
    previewImage: Optional[str] = None


class Template(TemplateCreate):
    """模板響應"""
    id: str
    createdAt: datetime


class DeleteImageRequest(BaseModel):
    """刪除圖片請求"""
    target: Literal["base", "mask", "all"]


class HealthResponse(BaseModel):
    """健康檢查響應"""
    ok: bool
    time: str


class CategoryBase(BaseModel):
    """類別基礎模型"""
    name: str
    parent_id: Optional[str] = None # UUID stored as str often easier in Pydantic/JSON
    layer_level: Optional[int] = None
    sort_order: Optional[int] = None

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    layer_level: Optional[int] = None
    sort_order: Optional[int] = None

class CategoryReorderRequest(BaseModel):
    parent_id: Optional[str] = None
    ordered_ids: list[str]

class CategoryResponse(CategoryBase):
    id: str
    created_at: datetime
