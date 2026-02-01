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
            // Handle both null and explicit '未分類' string just in case
            query = query.or(`category.is.null,category.eq.未分類`);
        } else {
            query = query.eq('category', category);
        }
    }

    // Search Filter
    if (search) {
        // Search in name or tags
        // Using Postgres text search would be better but simple ILIKE is sufficient for now
        // Note: tags is an array, so we check if it contains the search term
        // query = query.or(`name.ilike.%${search}%,tags.cs.{"${search}"}`); 
        // Simple name search for stability first
        query = query.ilike('name', `%${search}%`);
    }

    query = query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
        // Ignore AbortError (common in React strict mode / dev)
        if (error.message?.includes('AbortError') || error.message?.includes('signal is aborted')) {
            return { data: [], total: 0 };
        }
        console.error(`Error fetching assets (${type}):`, error);
        throw error;
    }

    // Map DB result to AssetItem interface
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
 * This is useful for building dynamic filter menus
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

    // Extract unique non-null categories
    const categories = Array.from(new Set(data.map(d => d.category).filter(Boolean)));
    return categories.sort();
}
