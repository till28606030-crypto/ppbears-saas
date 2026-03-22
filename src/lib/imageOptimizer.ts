/**
 * 將 Supabase Storage 的原始圖片 URL 加上 transform 參數進行動態縮圖
 * 利用 Supabase 本身的 Image Transformation API，不依賴外部 proxy
 * @param url    原始圖片網址 (通常是 Supabase storage public URL)
 * @param width  期望的最大寬度 (預設 800)
 * @param quality 壓縮品質 (預設 80)
 * @returns 優化後的縮圖網址，若為 base64/blob/非 Supabase 網址則原樣回傳
 */
export function getOptimizedUrl(url: any, width = 800, quality = 80): string {
    if (!url || typeof url !== 'string') return typeof url === 'string' ? url : '';
    
    try {
        // Skip base64, blob, already-processed URLs
        if (url.startsWith('data:') || url.startsWith('blob:') || url.includes('/render/image/')) {
            return url;
        }

        // Only apply transformation to Supabase storage URLs
        if (!url.includes('/storage/v1/object/public/')) {
            return url;
        }

        // Convert to /render/image/ endpoint which supports transformation
        const renderUrl = url.replace('/storage/v1/object/public/', '/storage/v1/render/image/public/');
        
        // Append transformation query params
        const separator = renderUrl.includes('?') ? '&' : '?';
        return `${renderUrl}${separator}width=${width}&quality=${quality}&resize=contain`;
    } catch (e) {
        console.warn('getOptimizedUrl processing error:', e);
        return url;
    }
}
