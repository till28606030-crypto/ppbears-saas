import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface OptionItem {
    id: string;
    parent_id: string | null;
    name: string;
    price_modifier: number;
    color_hex: string | null;
    image_url: string | null;
    is_active: boolean;
    created_at: string;
}

export interface OptionGroup {
    id: string;
    code: string;
    name: string;
    price_modifier: number;
    thumbnail: string | null;
    ui_config: Record<string, any>;
    is_active: boolean;
    created_at: string;
}

export const useOptionItems = () => {
    const [optionItems, setOptionItems] = useState<OptionItem[]>([]);
    const [optionGroups, setOptionGroups] = useState<OptionGroup[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchData = async () => {
            try {
                setLoading(true);
                setError(null);

                // Fetch option groups
                const { data: groupsData, error: groupsError } = await supabase
                    .from('option_groups')
                    .select('*')
                    .eq('is_active', true)
                    .order('id');

                if (groupsError) throw groupsError;
                setOptionGroups(groupsData || []);

                // Fetch option items
                const { data: itemsData, error: itemsError } = await supabase
                    .from('option_items')
                    .select('*')
                    .eq('is_active', true)
                    .order('parent_id');

                if (itemsError) throw itemsError;
                setOptionItems(itemsData || []);
            } catch (err: any) {
                console.error('Failed to fetch option items:', err);
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    return {
        optionItems,
        optionGroups,
        loading,
        error,
    };
};
