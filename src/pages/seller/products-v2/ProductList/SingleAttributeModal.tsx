import React, { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Save, AlertCircle, Loader2, Trash2, Plus, ArrowDown, Check } from 'lucide-react';
import { ProductRow } from '../shared/types';

interface OptionGroup {
    id: string;
    name: string;
    uiConfig?: {
        category?: string;
        [key: string]: any;
    };
}

interface SingleAttributeModalProps {
    isOpen: boolean;
    onClose: () => void;
    product: Partial<ProductRow> | null;
    onSuccess: () => void;
}

const SingleAttributeModal: React.FC<SingleAttributeModalProps> = ({ isOpen, onClose, product, onSuccess }) => {
    const [allGroups, setAllGroups] = useState<OptionGroup[]>([]);

    // The groups currently linked to the product (synced from DB / props)
    const [linkedGroupIds, setLinkedGroupIds] = useState<string[]>([]);

    // For the "Add New Options" drawer
    const [showAddDrawer, setShowAddDrawer] = useState(false);
    const [selectedNewGroupIds, setSelectedNewGroupIds] = useState<string[]>([]);

    // Accordion state for categories (true = expanded)
    const [expandedLinkedCats, setExpandedLinkedCats] = useState<Record<string, boolean>>({});
    const [expandedAddCats, setExpandedAddCats] = useState<Record<string, boolean>>({});

    const [loadingParams, setLoadingParams] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && product) {
            fetchAllGroups();

            // Extract the linked groups from product.specs
            const specs = (product as any).specs || {};
            const linked = specs.linked_option_groups || [];
            // Handle both string[] and {id: string}[] gracefully
            const parsedIds = linked.map((g: any) => typeof g === 'string' ? g : (g?.id)).filter(Boolean);
            setLinkedGroupIds(parsedIds);

            setSelectedNewGroupIds([]);
            setShowAddDrawer(false);
            setError(null);
        }
    }, [isOpen, product]);

    const fetchAllGroups = async () => {
        setLoadingParams(true);
        try {
            const { data, error } = await supabase
                .from('option_groups')
                .select('id, name, ui_config')
                .order('created_at', { ascending: false });

            if (error) throw error;

            const parsedData = (data || []).map(group => ({
                id: group.id,
                name: group.name,
                uiConfig: group.ui_config || {}
            }));

            setAllGroups(parsedData);
        } catch (err: any) {
            console.error('Failed to load groups:', err);
            setError('無法載入規格群組');
        } finally {
            setLoadingParams(false);
        }
    };

    // --- Deleting an Existing Group ---
    const handleRemoveLinkedGroup = async (groupIdToRemove: string) => {
        if (!confirm('確定要移除此關聯規格嗎？')) return;

        setSaving(true);
        setError(null);
        try {
            // Filter out the group
            const newLinkedIds = linkedGroupIds.filter(id => id !== groupIdToRemove);

            const currentSpecs = (product as any).specs || {};
            const updatedSpecs = {
                ...currentSpecs,
                linked_option_groups: newLinkedIds
            };

            const { error: updateError } = await supabase
                .from('products')
                .update({ specs: updatedSpecs })
                .eq('id', product!.id);

            if (updateError) throw updateError;

            // Optimistically update local state
            setLinkedGroupIds(newLinkedIds);
            onSuccess(); // Triggers a list refetch in background theoretically, but modal stays open
        } catch (err: any) {
            console.error('Failed to remove group:', err);
            setError('移除失敗：' + (err.message || String(err)));
        } finally {
            setSaving(false);
        }
    };

    // --- Adding New Groups ---
    const handleToggleNewGroup = (id: string) => {
        setSelectedNewGroupIds(prev =>
            prev.includes(id) ? prev.filter(gid => gid !== id) : [...prev, id]
        );
    };

    const handleSelectCategory = (category: string, isSelecting: boolean) => {
        const categoryGroupIds = availableGroupsForAdd
            .filter(g => (g.uiConfig?.category || '未分類') === category)
            .map(g => g.id);

        if (isSelecting) {
            setSelectedNewGroupIds(prev => Array.from(new Set([...prev, ...categoryGroupIds])));
        } else {
            setSelectedNewGroupIds(prev => prev.filter(id => !categoryGroupIds.includes(id)));
        }
    };

    const handleAppendNewGroups = async (shouldCloseModal = false) => {
        if (selectedNewGroupIds.length === 0) {
            setShowAddDrawer(false);
            if (shouldCloseModal) onClose();
            return;
        }

        setSaving(true);
        setError(null);
        try {
            // Append new selections to existing ones
            const finalLinkedIds = Array.from(new Set([...linkedGroupIds, ...selectedNewGroupIds]));

            const currentSpecs = (product as any).specs || {};
            const updatedSpecs = {
                ...currentSpecs,
                linked_option_groups: finalLinkedIds // simple array of strings
            };

            const { error: updateError } = await supabase
                .from('products')
                .update({ specs: updatedSpecs })
                .eq('id', product!.id);

            if (updateError) throw updateError;

            // Success
            setLinkedGroupIds(finalLinkedIds);
            setSelectedNewGroupIds([]);
            setShowAddDrawer(false);
            onSuccess(); // Refresh product list in background
            alert('新增關聯規格成功！');
            if (shouldCloseModal) onClose();
        } catch (err: any) {
            console.error('Failed to append groups:', err);
            setError('儲存失敗：' + (err.message || String(err)));
        } finally {
            setSaving(false);
        }
    };

    // Filter out groups that are already linked so they don't show up in the Add Drawer
    const availableGroupsForAdd = useMemo(() => {
        return allGroups.filter(g => !linkedGroupIds.includes(g.id));
    }, [allGroups, linkedGroupIds]);

    const groupedOptions = useMemo(() => {
        return availableGroupsForAdd.reduce((acc, current) => {
            const cat = current.uiConfig?.category || '未分類';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(current);
            return acc;
        }, {} as Record<string, OptionGroup[]>);
    }, [availableGroupsForAdd]);

    const sortedCategories = useMemo(() => {
        return Object.keys(groupedOptions).sort((a, b) => {
            const orderA = groupedOptions[a][0]?.uiConfig?.categorySortOrder ?? 999;
            const orderB = groupedOptions[b][0]?.uiConfig?.categorySortOrder ?? 999;
            if (orderA !== orderB) return orderA - orderB;
            if (a === '未分類') return 1;
            if (b === '未分類') return -1;
            return a.localeCompare(b);
        });
    }, [groupedOptions]);

    const currentlyLinkedObjects = useMemo(() => {
        return linkedGroupIds
            .map(id => allGroups.find(g => g.id === id))
            .filter(Boolean) as OptionGroup[];
    }, [linkedGroupIds, allGroups]);

    // Grouping the linked options by category
    const groupedLinkedOptions = useMemo(() => {
        return currentlyLinkedObjects.reduce((acc, current) => {
            const cat = current.uiConfig?.category || '未分類';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(current);
            return acc;
        }, {} as Record<string, OptionGroup[]>);
    }, [currentlyLinkedObjects]);

    // Sorting categories for linked options
    const sortedLinkedCategories = useMemo(() => {
        return Object.keys(groupedLinkedOptions).sort((a, b) => {
            const orderA = groupedLinkedOptions[a][0]?.uiConfig?.categorySortOrder ?? 999;
            const orderB = groupedLinkedOptions[b][0]?.uiConfig?.categorySortOrder ?? 999;
            if (orderA !== orderB) return orderA - orderB;
            if (a === '未分類') return 1;
            if (b === '未分類') return -1;
            return a.localeCompare(b);
        });
    }, [groupedLinkedOptions]);

    if (!isOpen || !product) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 flex-shrink-0">
                    <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                        管理 {product.name} 的規格
                    </h2>
                    <button onClick={onClose} disabled={saving} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1 flex flex-col gap-6 relative">
                    {/* Error Alerts */}
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                            <AlertCircle className="w-4 h-4" />
                            <span>{error}</span>
                        </div>
                    )}

                    {loadingParams ? (
                        <div className="flex flex-col items-center justify-center py-10">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                            <p className="text-gray-500 text-sm">載入資料中...</p>
                        </div>
                    ) : (
                        <>
                            {/* Current Linked Groups Section */}
                            <div>
                                <h3 className="text-sm font-semibold text-gray-500 mb-3 uppercase tracking-wider">目前已套用的規格 ({currentlyLinkedObjects.length})</h3>
                                {currentlyLinkedObjects.length === 0 ? (
                                    <div className="p-6 text-center text-gray-400 bg-gray-50 border border-dashed border-gray-200 rounded-xl text-sm">
                                        此產品尚未設定任何關聯規格。
                                    </div>
                                ) : (
                                    <div className="space-y-4 max-h-[40vh] overflow-y-auto pr-2">
                                        {sortedLinkedCategories.map(category => {
                                            const catGroups = groupedLinkedOptions[category].sort((a, b) => {
                                                if (a.uiConfig?.step !== b.uiConfig?.step) return (a.uiConfig?.step || 1) - (b.uiConfig?.step || 1);
                                                return (a.uiConfig?.sortOrder || 0) - (b.uiConfig?.sortOrder || 0);
                                            });

                                            const isExpanded = expandedLinkedCats[category] !== false; // Default true

                                            return (
                                                <div key={category} className="border border-gray-100 rounded-lg overflow-hidden bg-white shadow-sm">
                                                    <div
                                                        className="bg-gray-50 px-3 py-2 border-b border-gray-100 flex justify-between items-center cursor-pointer hover:bg-gray-100 transition-colors"
                                                        onClick={() => setExpandedLinkedCats(prev => ({ ...prev, [category]: !isExpanded }))}
                                                    >
                                                        <div className="font-semibold text-gray-700 text-sm">
                                                            {category} <span className="text-gray-400 font-normal ml-1">({catGroups.length})</span>
                                                        </div>
                                                        <ArrowDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                    </div>
                                                    {isExpanded && (
                                                        <div className="p-2 grid grid-cols-1 gap-1">
                                                            {catGroups.map(g => (
                                                                <div key={g.id} className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-md transition-colors group">
                                                                    <div className="font-medium text-gray-800 text-sm truncate flex-1 pr-4">{g.name}</div>
                                                                    <button
                                                                        onClick={() => handleRemoveLinkedGroup(g.id)}
                                                                        disabled={saving}
                                                                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors flex-shrink-0 opacity-0 group-hover:opacity-100 sm:opacity-100"
                                                                        title="移除此規格"
                                                                    >
                                                                        <Trash2 className="w-4 h-4" />
                                                                    </button>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>

                            <hr className="border-gray-100" />

                            {/* Add New Groups Section */}
                            <div>
                                {!showAddDrawer ? (
                                    <button
                                        onClick={() => setShowAddDrawer(true)}
                                        className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-blue-200 text-blue-600 rounded-xl hover:bg-blue-50 transition-colors font-medium"
                                    >
                                        <Plus className="w-4 h-4" />
                                        新增其他規格
                                    </button>
                                ) : (
                                    <div className="border border-blue-200 rounded-xl overflow-hidden bg-white shadow-sm flex flex-col max-h-[45vh]">
                                        <div className="bg-blue-50 px-4 py-3 flex items-center justify-between border-b border-blue-100 flex-shrink-0">
                                            <div className="font-bold text-blue-800 flex items-center gap-2">
                                                <ArrowDown className="w-4 h-4" /> 請勾選要新增的規格
                                            </div>
                                            <button
                                                onClick={() => {
                                                    setShowAddDrawer(false);
                                                    setSelectedNewGroupIds([]);
                                                }}
                                                className="text-gray-500 hover:text-gray-700"
                                            >
                                                取消
                                            </button>
                                        </div>

                                        <div className="p-3 overflow-y-auto space-y-4">
                                            {sortedCategories.length === 0 ? (
                                                <div className="text-center text-sm text-gray-500 py-4">所有的規格群組已完全加入，無剩餘項目。</div>
                                            ) : (
                                                sortedCategories.map(category => {
                                                    const catGroups = groupedOptions[category].sort((a, b) => {
                                                        if (a.uiConfig?.step !== b.uiConfig?.step) return (a.uiConfig?.step || 1) - (b.uiConfig?.step || 1);
                                                        return (a.uiConfig?.sortOrder || 0) - (b.uiConfig?.sortOrder || 0);
                                                    });
                                                    const allSelected = catGroups.every(g => selectedNewGroupIds.includes(g.id));
                                                    const someSelected = catGroups.some(g => selectedNewGroupIds.includes(g.id));

                                                    const isExpanded = expandedAddCats[category] !== false; // Default true

                                                    return (
                                                        <div key={category} className="border border-gray-100 rounded-lg overflow-hidden bg-white">
                                                            <div
                                                                className="bg-gray-50 px-3 py-2 flex items-center justify-between border-b border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors"
                                                                onClick={() => setExpandedAddCats(prev => ({ ...prev, [category]: !isExpanded }))}
                                                            >
                                                                <div className="font-semibold text-gray-700 text-sm flex items-center gap-2">
                                                                    <ArrowDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                                    {category} ({catGroups.length})
                                                                </div>
                                                                <label
                                                                    className="flex items-center gap-1.5 cursor-pointer text-xs font-medium text-gray-600 hover:text-blue-600 select-none"
                                                                    onClick={(e) => e.stopPropagation()} // Prevent collapse when toggling '全選'
                                                                >
                                                                    <input
                                                                        type="checkbox"
                                                                        className="w-3.5 h-3.5 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                                        checked={allSelected}
                                                                        ref={el => {
                                                                            if (el) el.indeterminate = someSelected && !allSelected;
                                                                        }}
                                                                        onChange={(e) => handleSelectCategory(category, e.target.checked)}
                                                                    />
                                                                    全選
                                                                </label>
                                                            </div>
                                                            {isExpanded && (
                                                                <div className="p-2 grid grid-cols-1 gap-1">
                                                                    {catGroups.map(group => (
                                                                        <label
                                                                            key={group.id}
                                                                            className={`flex items-start gap-2.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${selectedNewGroupIds.includes(group.id) ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}
                                                                        >
                                                                            <input
                                                                                type="checkbox"
                                                                                className="mt-0.5 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                                                                                checked={selectedNewGroupIds.includes(group.id)}
                                                                                onChange={() => handleToggleNewGroup(group.id)}
                                                                            />
                                                                            <div className="flex-1 overflow-hidden">
                                                                                <div className="font-medium text-gray-800 text-sm truncate">{group.name}</div>
                                                                            </div>
                                                                        </label>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>

                                        {/* Drawer Footer actions */}
                                        {sortedCategories.length > 0 && (
                                            <div className="bg-white border-t border-gray-100 p-3 flex justify-end flex-shrink-0">
                                                <button
                                                    onClick={() => handleAppendNewGroups(false)}
                                                    disabled={saving || selectedNewGroupIds.length === 0}
                                                    className="px-5 py-2 bg-blue-600 text-white font-medium hover:bg-blue-700 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 text-sm shadow-sm"
                                                >
                                                    {saving ? (
                                                        <Loader2 className="w-4 h-4 animate-spin" />
                                                    ) : (
                                                        <Check className="w-4 h-4" />
                                                    )}
                                                    確認附加 ({selectedNewGroupIds.length})
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>

                {/* Main Modal Footer */}
                <div className="p-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50 flex-shrink-0">
                    <button
                        onClick={() => handleAppendNewGroups(true)}
                        disabled={saving}
                        className={`px-6 py-2 font-medium rounded-lg transition-colors flex items-center gap-2 ${selectedNewGroupIds.length > 0
                            ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-200'
                            : 'bg-gray-800 hover:bg-gray-900 text-white'
                            }`}
                    >
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {selectedNewGroupIds.length > 0 ? `儲存並關閉 (${selectedNewGroupIds.length})` : '完成並關閉'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SingleAttributeModal;
