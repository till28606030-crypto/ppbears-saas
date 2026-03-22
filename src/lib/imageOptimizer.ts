import { apiUrl } from './apiBase';

/**
 * 將原始圖片 URL 透過後端 image-proxy 進行壓縮
 * @param url 原始圖片網址 (通常是 Supabase public URL)
 * @param width 期望的最大寬度 (預設 800)
 * @param quality 壓縮品質 (預設 80)
 * @returns 代理後的壓縮網址，若為 base64 或無效網址則原樣回傳
 */
export function getOptimizedUrl(url: string | null | undefined, width = 800, quality = 80): string {
    if (!url) return '';
    // Skip if it's already a proxy URL or base64 or a local blob
    if (url.includes('api/image-proxy') || url.startsWith('data:') || url.startsWith('blob:')) {
        return url;
    }
    
    const apiProxyUrl = apiUrl('/api/image-proxy');
    return `${apiProxyUrl}?url=${encodeURIComponent(url)}&w=${width}&q=${quality}`;
}
