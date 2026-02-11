from supabase import create_client, Client
from config import get_settings

settings = get_settings()

def get_supabase_client() -> Client:
    """獲取 Supabase 客戶端實例"""
    # 如果需要 service role key 用於後端管理操作
    key = settings.supabase_service_role_key or settings.supabase_anon_key
    return create_client(settings.supabase_url, key)
