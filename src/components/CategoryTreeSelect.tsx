import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Category } from '@/types';
import { buildCategoryTree } from '@/utils/categoryTree';

type Props = {
  value: string | null | undefined;
  onChange: (categoryId: string | null) => void;
  placeholder?: string;
};

type FlatOption = { id: string; label: string };

const flattenTree = (nodes: Category[], depth = 0): FlatOption[] => {
  const result: FlatOption[] = [];
  nodes.forEach((n) => {
    result.push({ id: n.id, label: `${'　'.repeat(depth)}${n.name}` });
    if (n.children && n.children.length > 0) {
      result.push(...flattenTree(n.children, depth + 1));
    }
  });
  return result;
};

export const CategoryTreeSelect: React.FC<Props> = ({ value, onChange, placeholder = '選擇類別' }) => {
  const [loading, setLoading] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const { data } = await supabase.from('product_categories').select('*').order('parent_id').order('sort_order');
        if (!cancelled) setCategories((data as any) || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const options = useMemo(() => {
    const { tree } = buildCategoryTree(categories);
    return flattenTree(tree);
  }, [categories]);

  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      disabled={loading}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
};
