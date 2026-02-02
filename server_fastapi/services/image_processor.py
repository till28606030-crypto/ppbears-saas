from PIL import Image
import io
import base64
from config import get_settings


class ImageProcessor:
    """圖片處理服務"""
    
    def __init__(self):
        self.settings = get_settings()
        self.max_dimension = self.settings.max_dimension
    
    async def process_image(self, buffer: bytes) -> str:
        """
        處理圖片：調整大小、轉換為 PNG、生成 Data URI
        
        Args:
            buffer: 圖片二進制數據
            
        Returns:
            Data URI 格式的圖片字串
        """
        try:
            # 開啟圖片
            image = Image.open(io.BytesIO(buffer))
            
            # 轉換 RGBA (如果需要)
            if image.mode not in ('RGB', 'RGBA'):
                image = image.convert('RGB')
            
            # 調整大小
            if image.width > self.max_dimension or image.height > self.max_dimension:
                image.thumbnail(
                    (self.max_dimension, self.max_dimension),
                    Image.Resampling.LANCZOS
                )
            
            # 轉換為 PNG
            output_buffer = io.BytesIO()
            image.save(output_buffer, format="PNG")
            output_buffer.seek(0)
            
            # 生成 Data URI
            b64 = base64.b64encode(output_buffer.read()).decode('utf-8')
            return f"data:image/png;base64,{b64}"
            
        except Exception as e:
            raise ValueError(f"Image processing failed: {str(e)}")
