import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { loadOptionGroups } from '../services/optionGroups';
import { OptionGroup, OptionItem, ProductAvailability } from '../types';

export interface Step1Product {
    group: OptionGroup;
    items: OptionItem[];
    category: string;
}

interface UseStep1ProductsResult {
    step1Products: Step1Product[];
    loading: boolean;
    error: string | null;
    categories: string[];
}

function getStep(g: any): number {
    const raw = g?.uiConfig?.step ?? g?.uiConfig?.stepIndex ?? g?.uiConfig?.step_index ?? g?.step ?? null;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : 1;
}

export function useStep1Products(productId: string | null | undefined): UseStep1ProductsResult {
    const [step1Products, setStep1Products] = useState<Step1Product[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [categories, setCategories] = useState<string[]>([]);

    useEffect(() => {
        if (!productId) {
            setStep1Products([]);
            setCategories([]);
            return;
        }

        let cancelled = false;
        setLoading(true);
        setError(null);

        const fetchData = async () => {
            try {
                // 1. Load all option groups
                const allGroups = await loadOptionGroups();

                // 2. Load availability data for this product
                const { data: availData } = await supabase
                    .from('product_availability')
                    .select('*')
                    .eq('model_id', productId);

                const availability: ProductAvailability[] = (availData || []).map((a: any) => ({
                    id: a.id,
                    modelId: a.model_id,
                    optionItemId: a.option_item_id,
                    isAvailable: a.is_available,
                }));

                // 3. Filter to linked_option_groups for this product (if configured)
                let filteredGroups = allGroups;
                try {
                    const { data: product } = await supabase
                        .from('products')
                        .select('specs')
                        .eq('id', productId)
                        .single();

                    if (product?.specs) {
                        const linked = (product.specs as any)?.linked_option_groups;
                        if (Array.isArray(linked) && linked.length > 0) {
                            filteredGroups = allGroups.filter(g => linked.includes(g.id));
                        }
                    }
                } catch {
                    // Fallback: show all groups
                }

                if (cancelled) return;

                // 4. Filter to Step 1 only
                const step1Groups = filteredGroups.filter(g => getStep(g as any) === 1);

                // 5. Build result with filtered items
                const hasAvailRules = availability.length > 0;
                const result: Step1Product[] = step1Groups.map(group => {
                    const groupItems = (group as any).items as OptionItem[] || [];
                    const filteredItems = hasAvailRules
                        ? groupItems.filter(item =>
                            availability.some(a =>
                                a.modelId === productId &&
                                a.optionItemId === item.id &&
                                a.isAvailable
                            )
                        )
                        : groupItems;

                    const cat = (group.uiConfig as any)?.category || '';
                    return { group, items: filteredItems, category: cat };
                });

                // 6. Derive sorted category list by categorySortOrder (matches AdminOptionManager)
                const catMap = new Map<string, number>(); // category -> min categorySortOrder
                result.forEach(p => {
                    if (p.category) {
                        const order = (p.group.uiConfig as any)?.categorySortOrder ?? 999;
                        const existing = catMap.get(p.category);
                        if (existing === undefined || order < existing) {
                            catMap.set(p.category, order);
                        }
                    }
                });
                const catList = Array.from(catMap.entries())
                    .sort((a, b) => a[1] - b[1])
                    .map(([cat]) => cat);

                setStep1Products(result);
                setCategories(catList);
            } catch (err) {
                if (!cancelled) {
                    console.error('[useStep1Products] Error:', err);
                    setError('無法載入商品資訊');
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        fetchData();
        return () => { cancelled = true; };
    }, [productId]);

    return { step1Products, loading, error, categories };
}
