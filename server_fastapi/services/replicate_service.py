import replicate
from typing import Optional, Any
from config import get_settings


class ReplicateService:
    """Replicate AI 服務"""
    
    def __init__(self):
        settings = get_settings()
        if not settings.replicate_api_token:
            raise ValueError("Missing REPLICATE_API_TOKEN")
        
        self.client = replicate.Client(api_token=settings.replicate_api_token)
    
    async def cartoonize(self, image_uri: str, style_id: str = "toon_ink") -> str:
        """
        卡通化圖片
        
        Args:
            image_uri: Data URI 格式的圖片
            style_id: 風格 ID (toon_ink, toon_mochi, toon_anime)
            
        Returns:
            處理後的圖片 URL
        """
        # Model 選擇
        if style_id == "toon_mochi":
            model = "catacolabs/cartoonify:043a7a0bb103cd8ce5c63e64161eae63a99f01028b83aa1e28e53a42d86191d3"
            input_data = {"image": image_uri}
        elif style_id == "toon_anime":
            model = "qwen-edit-apps/qwen-image-edit-plus-lora-photo-to-anime"
            input_data = {
                "image": [image_uri],
                "aspect_ratio": "match_input_image",
                "output_format": "png",
                "go_fast": True
            }
        else:  # toon_ink (default)
            model = "flux-kontext-apps/cartoonify:398ba4a9808131eae162741458435bcf145d03690cecef1467bdf81cc1ad654e"
            input_data = {
                "input_image": image_uri,
                "aspect_ratio": "match_input_image"
            }
        
        print(f"[AI] Calling Model: {model}")
        
        # 執行
        output = self.client.run(model, input=input_data)
        
        print(f"[AI] Replicate Output: {output}")
        
        # 提取 URL
        url = self._extract_url(output)
        if not url:
            raise ValueError(f"AI succeeded but missing url. Output: {output}")
        
        return url
    
    async def remove_background(self, image_uri: str) -> str:
        """
        去除背景
        
        Args:
            image_uri: Data URI 格式的圖片
            
        Returns:
            處理後的圖片 URL
        """
        model = "851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc"
        input_data = {
            "image": image_uri,
            "format": "png",
            "background_type": "rgba"
        }
        
        print(f"[AI] Calling Model: {model}")
        
        output = self.client.run(model, input=input_data)
        
        print(f"[AI] Replicate Output: {output}")
        
        url = self._extract_url(output)
        
        if not url:
            raise ValueError(f"AI succeeded but missing url. Output: {output}")
        
        return url
    
    def _extract_url(self, result: Any) -> Optional[str]:
        """
        從 Replicate 結果提取 URL
        
        支援多種格式：
        - 直接字串
        - 列表
        - 字典
        - FileOutput 物件
        """
        # 直接字串
        if isinstance(result, str) and result.startswith(("http://", "https://")):
            return result
        
        # 列表
        if isinstance(result, list) and len(result) > 0:
            return self._extract_url(result[0])
        
        # 字典
        if isinstance(result, dict):
            for key in ["url", "image", "output", "result", "href"]:
                if key in result:
                    url_candidate = self._extract_url(result[key])
                    if url_candidate:
                        return url_candidate
        
        # FileOutput 物件（有 url() 方法）
        if hasattr(result, 'url') and callable(result.url):
            try:
                url = result.url()
                if isinstance(url, str) and url.startswith(("http://", "https://")):
                    return url
            except Exception:
                pass
        
        # toString()
        if hasattr(result, '__str__'):
            try:
                s = str(result)
                if s.startswith(("http://", "https://")):
                    return s
            except Exception:
                pass
        
        return None
