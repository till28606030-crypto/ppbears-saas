import { supabase } from './supabase';
import { AssetItem } from '../types';

/**
 * Valid Asset Types as stored in the database
 */
export type AssetType = 'sticker' | 'background' | 'frame';

/**
 * Fetch assets from Supabase with optional filtering
 */
export async function listAssets(params: {
    type: AssetType;
    category?: string;
    search?: string;
    limit?: number;
    offset?: number;
}): Promise<{ data: AssetItem[]; total: number }> {
    const { type, category, search, limit = 50, offset = 0 } = params;

    let query = supabase
        .from('assets')
        .select('id, url, name, category, tags, metadata', { count: 'exact' })
        .eq('type', type);

    // Category Filter
    if (category && category !== '全部') {
        if (category === '未分類') {
            query = query.or(`category.is.null,category.eq.未分類`);
        } else {
            query = query.eq('category', category);
        }
    }

    // Search Filter: name OR tags (exact tag match using array containment)
    if (search && search.trim()) {
        const s = search.trim();
        query = query.or(`name.ilike.%${s}%,tags.cs.{"${s}"}`);
    }

    query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
        if (error.message?.includes('AbortError') || error.message?.includes('signal is aborted')) {
            return { data: [], total: 0 };
        }
        console.error(`Error fetching assets (${type}):`, error);
        throw error;
    }

    const formattedData: AssetItem[] = (data || []).map((item) => ({
        id: item.id,
        url: item.url,
        name: item.name || '未命名',
        category: item.category || '未分類',
        tags: item.tags || [],
        metadata: item.metadata
    }));

    return { data: formattedData, total: count || 0 };
}

/**
 * Fetch distinct categories for a specific asset type
 */
export async function listAssetCategories(type: AssetType): Promise<string[]> {
    const { data, error } = await supabase
        .from('assets')
        .select('category')
        .eq('type', type);

    if (error) {
        console.error(`Error fetching categories for ${type}:`, error);
        return [];
    }

    const categories = Array.from(new Set(data.map(d => d.category).filter(Boolean)));
    return categories.sort();
}

/**
 * Fetch popular tags for a specific asset type (for tag cloud).
 * Returns unique tags sorted by frequency, limited to top N.
 */
export async function listAssetTags(type: AssetType, limit = 30): Promise<string[]> {
    const { data, error } = await supabase
        .from('assets')
        .select('tags')
        .eq('type', type)
        .not('tags', 'is', null);

    if (error) {
        console.error(`Error fetching tags for ${type}:`, error);
        return [];
    }

    const freq: Record<string, number> = {};
    (data || []).forEach(row => {
        (row.tags as string[] || []).forEach(tag => {
            if (tag && tag.trim()) freq[tag.trim()] = (freq[tag.trim()] || 0) + 1;
        });
    });

    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, limit)
        .map(([tag]) => tag);
}
