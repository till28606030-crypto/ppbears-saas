import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Save, AlertCircle, Loader2 } from 'lucide-react';

interface OptionGroup {
    id: string;
    name: string;
    uiConfig?: {
        category?: string;
        [key: string]: any;
    };
}

interface BulkAttributeModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedProductIds: string[];
    initialSelectedGroupIds?: string[];
    onSuccess: () => void;
}

const BulkAttributeModal: React.FC<BulkAttributeModalProps> = ({ isOpen, onClose, selectedProductIds, initialSelectedGroupIds, onSuccess }) => {
    const [groups, setGroups] = useState<OptionGroup[]>([]);
    const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchGroups();
            setSelectedGroupIds(initialSelectedGroupIds || []);
            setError(null);
        }
    }, [isOpen, initialSelectedGroupIds]);

    const fetchGroups = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('option_groups')
                .select('id, name, ui_config')
                .order('created_at', { ascending: false });

            if (error) throw error;

            // Map the db fields to local fields correctly
            const parsedData = (data || []).map(group => ({
                id: group.id,
                name: group.name,
                uiConfig: group.ui_config || {}
            }));

            setGroups(parsedData);
        } catch (err: any) {
            console.error('Failed to load groups:', err);
            setError('無法載入規格群組');
        } finally {
            setLoading(false);
        }
    };

    const handleToggleGroup = (id: string) => {
        setSelectedGroupIds(prev =>
            prev.includes(id) ? prev.filter(gid => gid !== id) : [...prev, id]
        );
    };

    const handleSelectCategory = (category: string, isSelecting: boolean) => {
        const categoryGroupIds = groups
            .filter(g => (g.uiConfig?.category || '未分類') === category)
            .map(g => g.id);

        if (isSelecting) {
            // Add all missing from category
            setSelectedGroupIds(prev => {
                const newSelection = new Set([...prev, ...categoryGroupIds]);
                return Array.from(newSelection);
            });
        } else {
            // Remove all from category
            setSelectedGroupIds(prev => prev.filter(id => !categoryGroupIds.includes(id)));
        }
    };

    // Grouping groups by category
    const groupedOptions = groups.reduce((acc, current) => {
        const cat = current.uiConfig?.category || '未分類';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(current);
        return acc;
    }, {} as Record<string, OptionGroup[]>);

    // Sort categories (using categorySortOrder from uiConfig just like AdminOptionManager)
    const sortedCategories = Object.keys(groupedOptions).sort((a, b) => {
        const orderA = groupedOptions[a][0]?.uiConfig?.categorySortOrder ?? 999;
        const orderB = groupedOptions[b][0]?.uiConfig?.categorySortOrder ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        if (a === '未分類') return 1;
        if (b === '未分類') return -1;
        return a.localeCompare(b);
    });

    const handleSave = async (mode: 'overwrite' | 'append' | 'remove') => {
        if (selectedProductIds.length === 0) {
            setError('未選擇任何產品');
            return;
        }
        if (selectedGroupIds.length === 0) {
            const confirmed = confirm('目前未勾選任何規格，繼續寫入將清除相關產品的規格設定，確定要繼續嗎？');
            if (!confirmed) return;
        } else {
            const actionText = mode === 'overwrite' ? '覆蓋' : mode === 'append' ? '附加新增' : '刪除移除';
            const confirmed = confirm(`即將對 ${selectedProductIds.length} 個產品「${actionText}」所選的 ${selectedGroupIds.length} 項規格，確定執行嗎？`);
            if (!confirmed) return;
        }

        setSaving(true);
        setError(null);

        try {
            const { data: productsData, error: fetchError } = await supabase
                .from('products')
                .select('id, specs')
                .in('id', selectedProductIds);

            if (fetchError) throw fetchError;

            const updatePromises = (productsData || []).map(async (product) => {
                const currentSpecs = product.specs || {};

                // Ensure existing linked groups is a pure strings array
                const rawLinked = currentSpecs.linked_option_groups || [];
                const existIds = rawLinked.map((g: any) => typeof g === 'string' ? g : g?.id).filter(Boolean) as string[];

                let finalIds: string[] = [];
                if (mode === 'overwrite') {
                    finalIds = [...selectedGroupIds];
                } else if (mode === 'append') {
                    finalIds = Array.from(new Set([...existIds, ...selectedGroupIds]));
                } else if (mode === 'remove') {
                    finalIds = existIds.filter(id => !selectedGroupIds.includes(id));
                }

                const updatedSpecs = {
                    ...currentSpecs,
                    linked_option_groups: finalIds
                };

                return supabase
                    .from('products')
                    .update({ specs: updatedSpecs })
                    .eq('id', product.id);
            });

            await Promise.all(updatePromises);

            alert('處理完成！');
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Failed to bulk update:', err);
            setError('更新失敗：' + (err.message || String(err)));
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                    <h2 className="font-bold text-gray-800 text-lg">
                        {selectedProductIds.length === 1 ? '設定關聯規格' : '批次設定關聯規格'}
                    </h2>
                    <button onClick={onClose} disabled={saving} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    <div className="mb-4 text-sm text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-100">
                        您正在設定 <strong>{selectedProductIds.length}</strong> 個產品的共用規格群組。<br />
                        下方提供三種批次操作：你可以選擇「覆蓋」、「新增」或「刪除」勾選的這些規格。
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                            <AlertCircle className="w-4 h-4" />
                            <span>{error}</span>
                        </div>
                    )}

                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-10">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                            <p className="text-gray-500 text-sm">載入群組中...</p>
                        </div>
                    ) : (
                        <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                            {groups.length === 0 ? (
                                <div className="p-4 text-center text-gray-400 text-sm border border-gray-200 rounded-xl">尚未建立任何規格群組。</div>
                            ) : (
                                sortedCategories.map(category => {
                                    const catGroups = groupedOptions[category].sort((a, b) => {
                                        if (a.uiConfig?.step !== b.uiConfig?.step) return (a.uiConfig?.step || 1) - (b.uiConfig?.step || 1);
                                        return (a.uiConfig?.sortOrder || 0) - (b.uiConfig?.sortOrder || 0);
                                    });
                                    const allSelected = catGroups.every(g => selectedGroupIds.includes(g.id));
                                    const someSelected = catGroups.some(g => selectedGroupIds.includes(g.id));

                                    return (
                                        <div key={category} className="border border-gray-200 rounded-xl overflow-hidden bg-white shadow-sm">
                                            <div className="bg-gray-100 px-4 py-3 flex items-center justify-between border-b border-gray-200">
                                                <div className="font-bold text-gray-800">{category} ({catGroups.length})</div>
                                                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-gray-700 hover:text-blue-600 select-none">
                                                    <input
                                                        type="checkbox"
                                                        className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                        checked={allSelected}
                                                        ref={el => {
                                                            if (el) el.indeterminate = someSelected && !allSelected;
                                                        }}
                                                        onChange={(e) => handleSelectCategory(category, e.target.checked)}
                                                    />
                                                    全選此分類
                                                </label>
                                            </div>
                                            <div className="p-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                {catGroups.map(group => (
                                                    <label
                                                        key={group.id}
                                                        className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors border ${selectedGroupIds.includes(group.id) ? 'border-blue-500 bg-blue-50' : 'border-transparent hover:bg-gray-50'}`}
                                                    >
                                                        <input
                                                            type="checkbox"
                                                            className="mt-0.5 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                            checked={selectedGroupIds.includes(group.id)}
                                                            onChange={() => handleToggleGroup(group.id)}
                                                        />
                                                        <div className="flex-1 overflow-hidden">
                                                            <div className="font-medium text-gray-800 truncate">{group.name}</div>
                                                        </div>
                                                    </label>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <button
                            onClick={onClose}
                            disabled={saving}
                            className="w-full sm:w-auto px-5 py-2.5 text-gray-600 font-medium hover:bg-gray-200 rounded-xl transition-colors order-2 sm:order-1"
                        >
                            取消
                        </button>

                        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto order-1 sm:order-2">
                            <button
                                onClick={() => handleSave('remove')}
                                disabled={saving || groups.length === 0}
                                className="px-5 py-2.5 bg-white text-red-600 font-bold hover:bg-red-50 hover:text-red-700 border-2 border-red-500 rounded-xl transition-all flex items-center justify-center gap-2"
                            >
                                刪除勾選
                            </button>
                            <button
                                onClick={() => handleSave('append')}
                                disabled={saving || groups.length === 0}
                                className="px-5 py-2.5 bg-green-500 hover:bg-green-600 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm shadow-green-200"
                            >
                                追加新增
                            </button>
                            <div className="relative w-full sm:w-auto">
                                <span className="absolute -top-2.5 -right-2 px-2 py-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full shadow-sm pointer-events-none z-10 whitespace-nowrap animate-pulse">
                                    覆蓋舊資料
                                </span>
                                <button
                                    onClick={() => handleSave('overwrite')}
                                    disabled={saving || groups.length === 0}
                                    className="w-full sm:w-auto px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm shadow-blue-200"
                                >
                                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                    強制覆蓋
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BulkAttributeModal;
