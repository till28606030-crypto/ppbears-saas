from pydantic_settings import BaseSettings, SettingsConfigDict
from functools import lru_cache


class Settings(BaseSettings):
    """應用配置"""
    
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore",
        case_sensitive=False,
        populate_by_name=True
    )

    # Supabase
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    supabase_anon_key: str = ""  # Added to match .env potentially
    
    # Replicate
    replicate_api_token: str = ""
    
    # Server
    port: int = 3002
    max_file_size: int = 4 * 1024 * 1024  # 4MB
    max_dimension: int = 2048
    
    # Build ID
    build_id: str = ""

@lru_cache()
def get_settings():
    """獲取配置單例"""
    return Settings()
