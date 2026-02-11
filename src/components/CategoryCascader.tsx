import React, { useState, useEffect, useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { Category } from '../types';
import { supabase } from '../lib/supabase';

interface CategoryCascaderProps {
    value?: string | null;
    onChange: (categoryId: string) => void;
    onManage?: () => void; // Trigger management modal
}

export const CategoryCascader: React.FC<CategoryCascaderProps> = ({ value, onChange, onManage }) => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);

    // Selected path [L1_ID, L2_ID, L3_ID]
    const [selectedPath, setSelectedPath] = useState<(string | null)[]>([null, null, null]);

    // Fetch categories
    useEffect(() => {
        const fetchCategories = async () => {
            // Fetch from FastAPI proxy which points to API, or directly via Supabase client?
            // The Plan said "Backend API". But frontend usually uses Supabase Client for read if RLS enabled.
            // Let's use Supabase Client for simplicity and speed (cacheing etc is automatic if using query hooks, but here vanilla)
            // But wait, our API server is at port 3002. `vite.config` proxies `/api` to 3002.
            // Using `fetch('/api/categories')` is good to test our new API.
            try {
                const res = await fetch('/api/categories');
                if (res.ok) {
                    const data: Category[] = await res.json();
                    setCategories(data);
                } else {
                    console.error("Failed to fetch categories via API, falling back to Supabase SDK");
                    // Fallback
                    const { data: sbData } = await supabase.from('product_categories').select('*').order('sort_order');
                    if (sbData) setCategories(sbData);
                }
            } catch (e) {
                console.error("Fetch error", e);
            } finally {
                setLoading(false);
            }
        };
        fetchCategories();
    }, []);

    // Build Tree
    const categoryTree = useMemo(() => {
        const tree: Category[] = [];
        const map = new Map<string, Category>();

        // Clone to avoid mutation issues
        const raw = JSON.parse(JSON.stringify(categories));

        raw.forEach((c: Category) => {
            c.children = [];
            map.set(c.id, c);
        });

        raw.forEach((c: Category) => {
            if (c.parent_id && map.has(c.parent_id)) {
                map.get(c.parent_id)!.children!.push(c);
            } else {
                tree.push(c);
            }
        });

        return tree;
    }, [categories]);

    // Resolve path when value changes (e.g. initial load)
    useEffect(() => {
        if (!value) {
            // If no value, keep current path or reset? 
            // If user cleared it externally, reset.
            // Safe to ignore if user is just navigating.
            return;
        }

        // Find path to this leaf/node
        const findPath = (targetId: string, currentTree: Category[], path: string[]): string[] | null => {
            for (const cat of currentTree) {
                if (cat.id === targetId) return [...path, cat.id];
                if (cat.children && cat.children.length > 0) {
                    const res = findPath(targetId, cat.children, [...path, cat.id]);
                    if (res) return res;
                }
            }
            return null;
        };

        const path = findPath(value, categoryTree, []);
        if (path) {
            // Pad with nulls to length 3
            const newPath = [...path, null, null].slice(0, 3);
            // Only update if different to prevent loops
            if (JSON.stringify(newPath) !== JSON.stringify(selectedPath)) {
                setSelectedPath(newPath);
            }
        }
    }, [value, categoryTree]);

    const handleSelect = (level: number, id: string) => {
        const newPath = [...selectedPath];
        newPath[level] = id;

        // Reset subsequent levels
        for (let i = level + 1; i < 3; i++) newPath[i] = null;

        setSelectedPath(newPath);

        // Determine the "Effective" category ID (the deepest selected)
        // Or strictly strictly only allow leaf selection? 
        // User requirements: "implement product template feature with customizable categories... up to three levels"
        // Usually you can assign a product to a subcategory.
        onChange(id);
    };

    // Helper to get options for a level
    const getOptions = (level: number) => {
        if (level === 0) return categoryTree;
        const parentId = selectedPath[level - 1];
        if (!parentId) return [];

        // Find parent in raw list or traverse tree?
        // Traversing tree is safer since we built it.
        const findNode = (nodes: Category[], id: string): Category | null => {
            for (const node of nodes) {
                if (node.id === id) return node;
                if (node.children) {
                    const found = findNode(node.children, id);
                    if (found) return found;
                }
            }
            return null;
        };

        const parent = findNode(categoryTree, parentId);
        return parent ? (parent.children || []) : [];
    };

    const renderSelect = (level: number) => {
        const options = getOptions(level);
        // Hide level 2/3 if no options and no parent selected (or parent has no children)
        if (level > 0 && !selectedPath[level - 1]) return null;
        if (level > 0 && options.length === 0) return null; // Parent has no children, stop here.

        return (
            <div className="flex-1 min-w-[30%]">
                <select
                    value={selectedPath[level] || ''}
                    onChange={(e) => handleSelect(level, e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                    <option value="" disabled>選擇分類...</option>
                    {options.map(opt => (
                        <option key={opt.id} value={opt.id}>{opt.name}</option>
                    ))}
                </select>
            </div>
        );
    };

    if (loading) return <div className="text-gray-400 text-sm">載入分類中...</div>;

    return (
        <div className="space-y-2">
            <div className="flex gap-2 items-center flex-wrap">
                {renderSelect(0)}
                {renderSelect(1) && <ChevronRight className="w-4 h-4 text-gray-400" />}
                {renderSelect(1)}
                {renderSelect(2) && <ChevronRight className="w-4 h-4 text-gray-400" />}
                {renderSelect(2)}
            </div>
            {onManage && (
                <button
                    type="button"
                    onClick={onManage}
                    className="text-xs text-blue-600 hover:text-blue-800 underline mt-1"
                >
                    管理類別結構
                </button>
            )}
        </div>
    );
};
