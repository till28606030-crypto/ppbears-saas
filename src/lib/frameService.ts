import { supabase } from './supabase';
import { get, set, del } from 'idb-keyval';

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
// Last debug result (for UI display)
export let lastFrameDebug: { rowCount: number; error: any; source: string } = { rowCount: -1, error: null, source: '' };

export async function listFrames(productId?: string): Promise<{ data: Frame[]; source: 'supabase' | 'cache' }> {
    const cacheKey = productId ? `${CACHE_KEY}:${productId}` : CACHE_KEY;
    try {
        // 1. 永遠先從 Supabase 拉取
        const { data, error } = await supabase
            .from('assets')
            .select('id, name, url, category, metadata')
            .eq('type', 'frame')
            .order('created_at', { ascending: false });

        // Always log the raw response for debugging
        console.group('%c[listFrames] Supabase Raw Response', 'color: purple; font-weight: bold');
        console.log('data:', data);
        console.log('error:', error);
        console.groupEnd();

        // Update debug state
        lastFrameDebug = { rowCount: data?.length ?? -1, error: error, source: 'supabase' };

        if (error) throw error;

        if (data) {
            if (data.length === 0) {
                console.warn('⚠️ [listFrames] Supabase returned 0 rows. 可能原因: (1) assets 表中無 type=frame 的資料, (2) RLS 阻擋了 anon 用戶讀取但未報錯 (返回空陣列)。');
                // Don't cache empty results - fall through to cache below
                // This ensures that a previous valid cache is still served
                // and that fixing RLS will take effect immediately
            } else {
                const frames: Frame[] = data.map(item => ({
                    id: item.id,
                    name: item.name || '未命名相框',
                    category: item.category || '未分類',
                    url: item.url,
                    clipPathPoints: item.metadata?.clipPathPoints || [],
                    width: item.metadata?.width || 1000,
                    height: item.metadata?.height || 1000,
                }));

                // Cache the results
                await set(cacheKey, frames);
                try {
                    localStorage.setItem(cacheKey, JSON.stringify(frames));
                } catch (e) {
                    console.warn('LocalStorage quota exceeded, skipped.');
                }

                lastFrameDebug.rowCount = frames.length;
                return { data: frames, source: 'supabase' };
            }
        }

    } catch (err: any) {
        lastFrameDebug = { rowCount: -1, error: err, source: 'error' };
        console.error('❌ [listFrames] Supabase fetch FAILED:', {
            message: err?.message,
            code: err?.code,
            hint: err?.hint,
            details: err?.details,
        });
    }

    // 2. Fallback to cache
    let cached = await get<Frame[]>(cacheKey);
    if (!cached) {
        const lsData = localStorage.getItem(cacheKey);
        if (lsData) {
            try { cached = JSON.parse(lsData); } catch (e) { /* ignore */ }
        }
    }

    if (cached) {
        lastFrameDebug = { ...lastFrameDebug, source: 'cache', rowCount: cached.length };
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

/**
 * 清除所有相框快取 (強制下次從 Supabase 拉取最新資料)
 */
export async function clearFrameCache(productId?: string): Promise<void> {
    const cacheKey = productId ? `${CACHE_KEY}:${productId}` : CACHE_KEY;
    await del(cacheKey);
    localStorage.removeItem(cacheKey);
    console.log('[clearFrameCache] Cache cleared. Next listFrames will fetch from Supabase.');
}
