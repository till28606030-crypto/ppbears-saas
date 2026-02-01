import { supabase } from './supabase';
import { get, set } from 'idb-keyval';

export interface Frame {
    id: string;
    name: string;
    category?: string;
    url: string;
    clipPathPoints: { x: number; y: number }[];
    width: number;
    height: number;
}

const CACHE_KEY = 'ppbears_frames_cache';

/**
 * 列出所有相框 (統一由 Supabase 取得)
 * @param productId 可選的產品 ID (目前專案中相框為全局通用，此參數保留作為未來擴充用)
 */
export async function listFrames(productId?: string): Promise<{ data: Frame[]; source: 'supabase' | 'cache' }> {
    const cacheKey = productId ? `${CACHE_KEY}:${productId}` : CACHE_KEY;
    try {
        // 1. 永遠先從 Supabase 拉取
        const { data, error } = await supabase
            .from('assets')
            .select('id, name, url, category, metadata')
            .eq('type', 'frame')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (data) {
            const frames: Frame[] = data.map(item => ({
                id: item.id,
                name: item.name || '未命名相框',
                category: item.category || '未分類',
                url: item.url,
                clipPathPoints: item.metadata?.clipPathPoints || [],
                width: item.metadata?.width || 1000,
                height: item.metadata?.height || 1000,
            }));

            // 成功後寫入本機快取 (使用 localStorage 以符合任務要求，或繼續使用 idb-keyval 以支援大資料)
            // 考慮到相框資料可能較大，這裡我們同時支援，但主要以 idb-keyval 存儲
            await set(cacheKey, frames);
            
            // 額外同步一份到 localStorage 以符合任務描述的 T2 規範
            try {
                localStorage.setItem(cacheKey, JSON.stringify(frames));
            } catch (e) {
                console.warn('LocalStorage quota exceeded, skipped.');
            }

            return { data: frames, source: 'supabase' };
        }
    } catch (err) {
        console.warn('Supabase fetch failed, falling back to cache:', err);
    }

    // 2. 若 Supabase 失敗：才讀快取並回傳
    let cached = await get<Frame[]>(cacheKey);
    
    // 若 idb-keyval 沒抓到，試試 localStorage (相容性)
    if (!cached) {
        const lsData = localStorage.getItem(cacheKey);
        if (lsData) {
            try {
                cached = JSON.parse(lsData);
            } catch (e) {
                console.error('Failed to parse localStorage frames cache');
            }
        }
    }

    if (cached) {
        return { data: cached, source: 'cache' };
    }

    return { data: [], source: 'supabase' };
}

/**
 * 取得所有相框分類
 */
export async function listFrameCategories(): Promise<string[]> {
    const { data, source } = await listFrames();
    const categories = Array.from(new Set(data.map(f => f.category).filter(Boolean))) as string[];
    return categories.sort();
}
