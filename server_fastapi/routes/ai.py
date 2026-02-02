from fastapi import APIRouter, UploadFile, File, Form, HTTPException
from fastapi.responses import JSONResponse
from typing import Optional
import httpx
import json
import os

from models import AIResponse, CartoonMeta
from services import ImageProcessor, ReplicateService

router = APIRouter()


def get_build_id():
    """獲取 Build ID"""
    return os.getenv("BUILD_ID", "fastapi-server")


@router.post("/cartoon", response_model=AIResponse)
async def cartoonize(
    image: Optional[UploadFile] = File(None),
    imageUrl: Optional[str] = Form(None),
    meta: Optional[str] = Form(None)
):
    """
    卡通化圖片
    
    支援兩種輸入方式：
    1. 文件上傳 (multipart/form-data): image 參數
    2. URL 輸入 (multipart/form-data): imageUrl 參數
    
    參數：
    - image: 上傳的圖片文件
    - imageUrl: 圖片 URL
    - meta: JSON 字串，包含 styleId (toon_ink, toon_mochi, toon_anime)
    """
    build_id = get_build_id()
    print(f"[AI] HIT /api/ai/cartoon (ID: {build_id})")
    
    try:
        # 獲取圖片 buffer
        image_buffer = None
        
        if image and image.file:
            # Case A: File Upload
            print(f"[AI] Source: File Upload ({image.filename})")
            image_buffer = await image.read()
        elif imageUrl:
            # Case B: URL Input
            print(f"[AI] Source: URL ({imageUrl})")
            async with httpx.AsyncClient() as client:
                response = await client.get(imageUrl)
                response.raise_for_status()
                image_buffer = response.content
        
        if not image_buffer:
            return JSONResponse(
                status_code=400,
                content=AIResponse(
                    buildId=build_id,
                    success=False,
                    message="未上傳圖片或無效的圖片連結",
                    errorCode="UPLOAD_FAILED"
                ).dict()
            )
        
        # 解析 meta (styleId)
        style_id = "toon_ink"
        if meta:
            try:
                meta_dict = json.loads(meta)
                style_id = meta_dict.get("styleId", "toon_ink")
                print(f"[AI] Style ID: {style_id}")
            except json.JSONDecodeError:
                pass
        
        # 處理圖片
        processor = ImageProcessor()
        image_uri = await processor.process_image(image_buffer)
        
        # 調用 Replicate
        replicate_service = ReplicateService()
        url = await replicate_service.cartoonize(image_uri, style_id)
        
        print(f"[AI] Success! URL: {url}")
        
        return AIResponse(
            buildId=build_id,
            success=True,
            url=url
        )
    
    except Exception as e:
        print(f"[AI] Error: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return JSONResponse(
            status_code=500,
            content=AIResponse(
                buildId=build_id,
                success=False,
                message="AI cartoon failed",
                errorCode="AI_ERROR",
                error=str(e),
                stack=traceback.format_exc()
            ).dict()
        )


@router.post("/remove-bg", response_model=AIResponse)
async def remove_background(
    image: Optional[UploadFile] = File(None),
    imageUrl: Optional[str] = Form(None)
):
    """
    去除背景
    
    支援兩種輸入方式：
    1. 文件上傳 (multipart/form-data): image 參數
    2. URL 輸入 (multipart/form-data): imageUrl 參數
    """
    build_id = get_build_id()
    print(f"[AI] HIT /api/ai/remove-bg (ID: {build_id})")
    
    try:
        # 獲取圖片 buffer
        image_buffer = None
        
        if image and image.file:
            # Case A: File Upload
            print(f"[AI] Source: File Upload ({image.filename})")
            image_buffer = await image.read()
        elif imageUrl:
            # Case B: URL Input
            print(f"[AI] Source: URL ({imageUrl})")
            async with httpx.AsyncClient() as client:
                response = await client.get(imageUrl)
                response.raise_for_status()
                image_buffer = response.content
        
        if not image_buffer:
            return JSONResponse(
                status_code=400,
                content=AIResponse(
                    buildId=build_id,
                    success=False,
                    message="未上傳圖片或無效的圖片連結",
                    errorCode="UPLOAD_FAILED"
                ).dict()
            )
        
        # 處理圖片
        processor = ImageProcessor()
        image_uri = await processor.process_image(image_buffer)
        
        # 調用 Replicate
        replicate_service = ReplicateService()
        url = await replicate_service.remove_background(image_uri)
        
        print(f"[AI] Success! URL: {url}")
        
        return AIResponse(
            buildId=build_id,
            success=True,
            url=url
        )
    
    except Exception as e:
        print(f"[AI] Error: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return JSONResponse(
            status_code=500,
            content=AIResponse(
                buildId=build_id,
                success=False,
                message="AI remove-bg failed",
                errorCode="AI_ERROR",
                error=str(e),
                stack=traceback.format_exc()
            ).dict()
        )
