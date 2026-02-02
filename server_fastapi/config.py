from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    """應用配置"""
    
    # Supabase
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    
    # Replicate
    replicate_api_token: str = ""
    
    # Server
    port: int = 3002
    max_file_size: int = 4 * 1024 * 1024  # 4MB
    max_dimension: int = 2048
    
    # Build ID
    build_id: str = ""
    
    class Config:
        env_file = ".env"
        case_sensitive = False
        # Allow field names with different casing
        populate_by_name = True


@lru_cache()
def get_settings():
    """獲取配置單例"""
    return Settings()
