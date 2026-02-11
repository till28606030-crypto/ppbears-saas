import React, { useState, useEffect } from 'react';
import { Category } from '../../types';
import { supabase } from '../../lib/supabase';
import { ChevronRight, ChevronDown, Plus, Trash2, Edit2, X, Save, FolderOpen } from 'lucide-react';

interface CategoryManagerProps {
    isOpen: boolean;
    onClose: () => void;
}

export const CategoryManager: React.FC<CategoryManagerProps> = ({ isOpen, onClose }) => {
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(false);

    // Edit State
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    // Add State
    const [addingParentId, setAddingParentId] = useState<string | null>(null); // null = root
    const [addName, setAddName] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    // Expand State
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

    const fetchCategories = async () => {
        setLoading(true);
        try {
            // Use API if available for consistent logic, or Supabase directly
            // Using API to verify backend
            const res = await fetch('/api/categories');
            if (res.ok) {
                const data = await res.json();
                setCategories(data);
                // Expand all by default or strictly root?
                // Let's expand root items
                const ids = new Set<string>();
                // @ts-ignore
                data.forEach(c => { if (c.layer_level < 3) ids.add(c.id); });
                setExpandedIds(ids);
            } else {
                console.error("API Error");
            }
        } catch (e) {
            console.error("Fetch Error", e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) fetchCategories();
    }, [isOpen]);

    const buildTree = (cats: Category[]) => {
        const tree: Category[] = [];
        const map = new Map<string, Category>();
        const raw = JSON.parse(JSON.stringify(cats));
        raw.forEach((c: Category) => { c.children = []; map.set(c.id, c); });
        raw.forEach((c: Category) => {
            if (c.parent_id && map.has(c.parent_id)) {
                map.get(c.parent_id)!.children!.push(c);
            } else {
                tree.push(c);
            }
        });
        return tree;
    };

    const tree = buildTree(categories);

    const toggleExpand = (id: string) => {
        const newSet = new Set(expandedIds);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedIds(newSet);
    };

    const handleSaveEdit = async (id: string) => {
        if (!editName.trim()) return;
        try {
            const res = await fetch(`/api/categories/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: editName })
            });
            if (res.ok) {
                setEditingId(null);
                fetchCategories();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleAdd = async () => {
        if (!addName.trim()) return;

        // Calculate level
        let level = 1;
        if (addingParentId) {
            const parent = categories.find(c => c.id === addingParentId);
            if (parent) level = parent.layer_level + 1;
        }

        if (level > 3) {
            alert("最多支援三層類別");
            return;
        }

        try {
            const res = await fetch('/api/categories', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: addName.trim(),
                    parent_id: addingParentId,
                    layer_level: level,
                    sort_order: categories.length + 1 // Simple append
                })
            });

            if (res.ok) {
                setAddName('');
                setIsAdding(false);
                setAddingParentId(null);
                fetchCategories();
            }
        } catch (e) {
            console.error(e);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("確定要刪除此分類？其下的子分類也會一併被移除。")) return;
        try {
            await fetch(`/api/categories/${id}`, { method: 'DELETE' });
            fetchCategories();
        } catch (e) {
            console.error(e);
        }
    };

    const handleStartEdit = (cat: Category) => {
        setEditingId(cat.id);
        setEditName(cat.name);
        setIsAdding(false);
    };

    const handleStartAdd = (parentId: string | null) => {
        setAddingParentId(parentId);
        setIsAdding(true);
        setAddName('');
        setEditingId(null);
        // If parent, expand it
        if (parentId) {
            const newSet = new Set(expandedIds);
            newSet.add(parentId);
            setExpandedIds(newSet);
        }
    };

    // Recursive Renderer
    const renderNode = (node: Category) => {
        const hasChildren = node.children && node.children.length > 0;
        const isExpanded = expandedIds.has(node.id);
        const isEditing = editingId === node.id;
        // Adding child to THIS node
        const isAddingChild = isAdding && addingParentId === node.id;

        return (
            <div key={node.id} className="ml-4 border-l border-gray-200 pl-2">
                <div className="flex items-center gap-2 py-1 group hover:bg-gray-50 rounded pr-2">
                    <button
                        onClick={() => toggleExpand(node.id)}
                        className={`p-1 rounded hover:bg-gray-200 text-gray-500 ${!hasChildren && !isAddingChild ? 'opacity-20 cursor-default' : ''}`}
                    >
                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    </button>

                    {isEditing ? (
                        <div className="flex items-center gap-2 flex-1">
                            <input
                                autoFocus
                                value={editName}
                                onChange={e => setEditName(e.target.value)}
                                className="border px-2 py-1 rounded text-sm w-full"
                                onKeyDown={e => e.key === 'Enter' && handleSaveEdit(node.id)}
                            />
                            <button onClick={() => handleSaveEdit(node.id)} className="text-green-600"><Save className="w-4 h-4" /></button>
                            <button onClick={() => setEditingId(null)} className="text-gray-400"><X className="w-4 h-4" /></button>
                        </div>
                    ) : (
                        <div className="flex-1 flex items-center justify-between">
                            <span className="text-sm font-medium text-gray-700">{node.name}</span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {node.layer_level < 3 && (
                                    <button onClick={() => handleStartAdd(node.id)} title="新增子類別" className="p-1 hover:text-blue-600"><Plus className="w-3 h-3" /></button>
                                )}
                                <button onClick={() => handleStartEdit(node)} title="編輯" className="p-1 hover:text-green-600"><Edit2 className="w-3 h-3" /></button>
                                <button onClick={() => handleDelete(node.id)} title="刪除" className="p-1 hover:text-red-600"><Trash2 className="w-3 h-3" /></button>
                            </div>
                        </div>
                    )}
                </div>

                {isExpanded && (
                    <div className="ml-2">
                        {node.children?.map(child => renderNode(child))}
                        {isAddingChild && (
                            <div className="ml-6 flex items-center gap-2 py-1 animate-in fade-in slide-in-from-left-2">
                                <input
                                    autoFocus
                                    placeholder="輸入子類別名稱..."
                                    value={addName}
                                    onChange={e => setAddName(e.target.value)}
                                    className="border px-2 py-1 rounded text-sm w-40"
                                    onKeyDown={e => e.key === 'Enter' && handleAdd()}
                                />
                                <button onClick={handleAdd} className="text-green-600"><Save className="w-4 h-4" /></button>
                                <button onClick={() => setIsAdding(false)} className="text-gray-400"><X className="w-4 h-4" /></button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
                <div className="p-4 border-b flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <FolderOpen className="w-5 h-5 text-blue-600" />
                        類別管理
                    </h3>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-lg">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    {loading ? (
                        <div className="text-center py-8 text-gray-400">載入中...</div>
                    ) : (
                        <div className="space-y-1">
                            {/* Insert Root */}
                            {isAdding && addingParentId === null && (
                                <div className="flex items-center gap-2 mb-4 p-2 bg-blue-50 rounded border border-blue-100">
                                    <span className="text-sm font-bold text-blue-800">新增主分類：</span>
                                    <input
                                        autoFocus
                                        value={addName}
                                        onChange={e => setAddName(e.target.value)}
                                        className="border px-2 py-1 rounded text-sm flex-1"
                                        onKeyDown={e => e.key === 'Enter' && handleAdd()}
                                    />
                                    <button onClick={handleAdd} className="text-green-600"><Save className="w-4 h-4" /></button>
                                    <button onClick={() => setIsAdding(false)} className="text-gray-400"><X className="w-4 h-4" /></button>
                                </div>
                            )}

                            {tree.map(node => renderNode(node))}

                            {!isAdding && (
                                <button
                                    onClick={() => handleStartAdd(null)}
                                    className="mt-4 flex items-center gap-2 text-sm text-gray-500 hover:text-blue-600 hover:bg-blue-50 px-3 py-2 rounded-lg w-full transition-colors border border-dashed border-gray-300 hover:border-blue-300"
                                >
                                    <Plus className="w-4 h-4" />
                                    新增主分類
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <div className="p-4 border-t bg-gray-50 rounded-b-xl text-xs text-gray-400 text-center">
                    提示：最多支援三層結構。刪除父類別將同時影響子類別。
                </div>
            </div>
        </div>
    );
};
