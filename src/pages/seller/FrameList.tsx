import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Plus, Trash2, Edit2, Search, X, Save, Scissors, GripVertical, Check } from 'lucide-react';
import { FrameTemplate } from './FrameEditor';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Default categories
const DEFAULT_FRAME_CATEGORIES = [
    '基本相框',
    '節慶主題',
    '特殊造型',
    '未分類'
];

function SortableCategoryPill({
    id, isSelected, isEditing, editValue,
    onSelect, onDoubleClick, onEditChange, onEditConfirm, onEditKeyDown, onDelete
}: {
    id: string;
    isSelected: boolean;
    isEditing: boolean;
    editValue: string;
    onSelect: () => void;
    onDoubleClick: () => void;
    onEditChange: (v: string) => void;
    onEditConfirm: () => void;
    onEditKeyDown: (e: React.KeyboardEvent) => void;
    onDelete: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
    const inputRef = React.useRef<HTMLInputElement>(null);

    React.useEffect(() => {
        if (isEditing) inputRef.current?.select();
    }, [isEditing]);

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`relative group flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap select-none transition-all ${
                isSelected && !isEditing ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
            }`}
        >
            {/* Drag handle */}
            <button {...attributes} {...listeners} tabIndex={-1}
                className="cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-500 -ml-1 pr-0.5"
                onClick={(e) => e.stopPropagation()}
            >
                <GripVertical className="w-3 h-3" />
            </button>

            {isEditing ? (
                <>
                    <input
                        ref={inputRef}
                        value={editValue}
                        onChange={(e) => onEditChange(e.target.value)}
                        onKeyDown={onEditKeyDown}
                        className="w-20 bg-transparent outline-none border-b border-blue-400 text-gray-800 text-sm"
                        onClick={(e) => e.stopPropagation()}
                    />
                    <button onClick={(e) => { e.stopPropagation(); onEditConfirm(); }}
                        className="text-green-500 hover:text-green-700">
                        <Check className="w-3.5 h-3.5" />
                    </button>
                </>
            ) : (
                <span onClick={onSelect} onDoubleClick={onDoubleClick} className="cursor-pointer">{id}</span>
            )}

            {/* Delete X (hidden for 未分類) */}
            {id !== '未分類' && !isEditing && (
                <button
                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity ml-0.5 text-red-400 hover:text-red-600"
                    title="刪除這個類別"
                >
                    <X className="w-3 h-3" />
                </button>
            )}
        </div>
    );
}

const FrameList = () => {
    const navigate = useNavigate();
    const [frames, setFrames] = useState<FrameTemplate[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Category Management State
    const [categories, setCategories] = useState<string[]>(DEFAULT_FRAME_CATEGORIES);
    const [selectedCategory, setSelectedCategory] = useState('全部');
    const [editingCatName, setEditingCatName] = useState<string | null>(null);
    const [editingCatValue, setEditingCatValue] = useState('');
    const [isAddingCatInline, setIsAddingCatInline] = useState(false);
    const [newCatInlineValue, setNewCatInlineValue] = useState('');

    // Edit Modal State
    const [editingFrame, setEditingFrame] = useState<FrameTemplate | null>(null);

    // Load Data
    useEffect(() => {
        loadFrames();
    }, []);

    const mapDbToFrame = (dbItem: any): FrameTemplate => ({
        id: dbItem.id,
        name: dbItem.name || '未命名',
        imageUrl: dbItem.url,
        category: dbItem.category || '未分類',
        clipPathPoints: dbItem.metadata?.clipPathPoints || [],
        width: dbItem.metadata?.width || 0,
        height: dbItem.metadata?.height || 0,
        createdAt: new Date(dbItem.created_at).getTime(),
        tags: dbItem.tags || []
    });

    const loadFrames = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('assets')
                .select('*')
                .eq('type', 'frame')
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (data) {
                const loadedFrames = data.map(mapDbToFrame);
                setFrames(loadedFrames);

                // Extract categories
                const dynamicCats = Array.from(new Set(['未分類', ...loadedFrames.map(f => f.category)]));
                setCategories(dynamicCats);
            } else {
                setFrames([]);
            }
        } catch (error) {
            console.error("Failed to load frames:", error);
            setFrames([]);
        } finally {
            setIsLoading(false);
        }
    };

    // Category Management Handlers
    const confirmEditCat = async () => {
        if (!editingCatName) return;
        const newName = editingCatValue.trim();
        if (!newName || newName === editingCatName) { setEditingCatName(null); return; }

        setIsLoading(true);
        try {
            const { error } = await supabase
                .from('assets')
                .update({ category: newName })
                .eq('type', 'frame')
                .eq('category', editingCatName);

            if (error) throw error;

            setCategories(prev => prev.map(c => c === editingCatName ? newName : c));
            setFrames(prev => prev.map(f => f.category === editingCatName ? { ...f, category: newName } : f));

            if (selectedCategory === editingCatName) setSelectedCategory(newName);
            setEditingCatName(null);
        } catch (error: any) {
            console.error("Failed to rename category:", error);
            alert("重新命名失敗：" + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddCategoryInline = () => {
        if (!newCatInlineValue.trim()) return;
        setCategories(prev => [...prev, newCatInlineValue.trim()]);
        setNewCatInlineValue('');
        setIsAddingCatInline(false);
    };

    const handleDeleteCategory = async (catToDelete: string) => {
        if (catToDelete === '未分類' || !window.confirm(`確定要刪除「${catToDelete}」類別嗎？\n該類別下的所有相框將被移至「未分類」。`)) return;
        
        setIsLoading(true);
        try {
            const { error } = await supabase
                .from('assets')
                .update({ category: '未分類' })
                .eq('type', 'frame')
                .eq('category', catToDelete);

            if (error) throw error;
            
            setCategories(prev => prev.filter(c => c !== catToDelete));
            setFrames(prev => prev.map(f => f.category === catToDelete ? { ...f, category: '未分類' } : f));
        } catch (error: any) {
            console.error("Failed to delete category:", error);
            alert("刪除失敗：" + error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = categories.indexOf(active.id as string);
            const newIndex = categories.indexOf(over.id as string);
            
            setCategories(arrayMove(categories, oldIndex, newIndex));
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('確定要刪除此相框嗎？')) return;
        
        try {
            const { error } = await supabase.from('assets').delete().eq('id', id);
            if (error) throw error;
            
            setFrames(prev => prev.filter(f => f.id !== id));
        } catch (error: any) {
            console.error("Delete failed:", error);
            alert("刪除失敗：" + error.message);
        }
    };

    const handleSaveEdit = async () => {
        if (!editingFrame) return;
        
        try {
            const { error } = await supabase
                .from('assets')
                .update({
                    name: editingFrame.name,
                    category: editingFrame.category,
                    // Note: We don't update metadata here unless needed, 
                    // assuming this modal only edits name/category
                })
                .eq('id', editingFrame.id);

            if (error) throw error;

            setFrames(prev => prev.map(f => f.id === editingFrame.id ? editingFrame : f));
            setEditingFrame(null);
        } catch (error: any) {
            console.error("Update failed:", error);
            alert("更新失敗：" + error.message);
        }
    };

    const filteredFrames = frames.filter(f => {
        const matchesSearch = f.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                              f.tags?.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesCategory = selectedCategory === '全部' || f.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <header className="flex items-center justify-between mb-8">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">相框素材管理</h1>
                    <p className="text-gray-500 mt-1">上傳並定義異型相框的裁切區域</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={() => navigate('/seller/frame/new', { state: { category: selectedCategory !== '全部' ? selectedCategory : '未分類' } })}
                        className="px-4 py-2 bg-black text-white rounded-lg text-sm font-medium hover:bg-gray-800 flex items-center gap-2 transition-colors"
                    >
                        <Plus className="w-4 h-4" />
                        新增相框
                    </button>
                </div>
            </header>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden min-h-[400px]">
                <div className="p-4 border-b border-gray-100 space-y-4">
                    {/* Search */}
                    <div className="relative max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input 
                            type="text" 
                            placeholder="搜尋相框..." 
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* Category Tabs */}
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        <div className="flex items-center px-4 py-2 bg-gray-100 text-gray-600 rounded-md text-sm font-medium whitespace-nowrap mr-2">
                            相框分類
                        </div>
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragEnd={handleDragEnd}
                        >
                            <button
                                onClick={() => setSelectedCategory('全部')}
                                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                                    selectedCategory === '全部' ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
                                }`}
                            >
                                全部
                            </button>

                            <SortableContext
                                items={categories}
                                strategy={horizontalListSortingStrategy}
                            >
                                {categories.map(cat => (
                                    <SortableCategoryPill
                                        key={cat}
                                        id={cat}
                                        isSelected={selectedCategory === cat}
                                        isEditing={editingCatName === cat}
                                        editValue={editingCatValue}
                                        onSelect={() => setSelectedCategory(cat)}
                                        onDoubleClick={() => { setEditingCatName(cat); setEditingCatValue(cat); }}
                                        onEditChange={setEditingCatValue}
                                        onEditConfirm={confirmEditCat}
                                        onEditKeyDown={(e) => {
                                            if (e.key === 'Enter') confirmEditCat();
                                            if (e.key === 'Escape') setEditingCatName(null);
                                        }}
                                        onDelete={() => handleDeleteCategory(cat)}
                                    />
                                ))}
                            </SortableContext>

                            {isAddingCatInline ? (
                                <div className="flex items-center gap-1 px-2 py-1 rounded-full border border-blue-400 bg-blue-50">
                                    <input
                                        autoFocus
                                        value={newCatInlineValue}
                                        onChange={(e) => setNewCatInlineValue(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && newCatInlineValue.trim()) handleAddCategoryInline();
                                            if (e.key === 'Escape') { setIsAddingCatInline(false); setNewCatInlineValue(''); }
                                        }}
                                        placeholder="新類別名稱"
                                        className="w-24 text-sm bg-transparent outline-none text-gray-800"
                                    />
                                    <button onClick={handleAddCategoryInline} className="text-green-500 hover:text-green-700">
                                        <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button onClick={() => { setIsAddingCatInline(false); setNewCatInlineValue(''); }} className="text-gray-400 hover:text-red-500">
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={() => setIsAddingCatInline(true)}
                                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs text-gray-400 border border-dashed border-gray-300 hover:border-blue-400 hover:text-blue-500 transition-colors"
                                    title="新增類別"
                                >
                                    <Plus className="w-3 h-3" /> 新增
                                </button>
                            )}
                        </DndContext>
                    </div>
                </div>

                {isLoading ? (
                    <div className="flex items-center justify-center h-64 text-gray-400">
                        載入中...
                    </div>
                ) : frames.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                        <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                            <Plus className="w-8 h-8 text-gray-300" />
                        </div>
                        <p className="mb-2">尚無相框資料</p>
                        <button onClick={() => navigate('/seller/frame/new', { state: { category: selectedCategory !== '全部' ? selectedCategory : '未分類' } })} className="text-blue-600 hover:underline text-sm">
                            立即新增第一個相框
                        </button>
                    </div>
                ) : (
                    <div className="p-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-6">
                        {filteredFrames.map(frame => (
                            <div key={frame.id} className="group relative aspect-square bg-gray-100 rounded-xl border border-gray-200 overflow-hidden">
                                <img src={frame.imageUrl} alt={frame.name} className="w-full h-full object-contain p-2" />
                                
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-4">
                                    <span className="text-white text-xs font-bold mb-1 text-center truncate w-full px-2">{frame.name}</span>
                                    <div className="flex gap-2">
                                        <button 
                                            onClick={() => navigate(`/seller/frame/${frame.id}`)}
                                            className="p-2 bg-white text-gray-900 rounded-full hover:bg-blue-50 transition-colors"
                                            title="編輯裁切區域"
                                        >
                                            <Scissors className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => setEditingFrame(frame)}
                                            className="p-2 bg-white text-gray-900 rounded-full hover:bg-blue-50 transition-colors"
                                            title="編輯資訊"
                                        >
                                            <Edit2 className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(frame.id)}
                                            className="p-2 bg-white text-red-600 rounded-full hover:bg-red-50 transition-colors"
                                            title="刪除"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                                <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1">
                                    <p className="text-white text-[10px] truncate text-center">{frame.category || '未分類'}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                
                {filteredFrames.length === 0 && !isLoading && frames.length > 0 && (
                    <div className="text-center py-12">
                        <p className="text-gray-400 mb-2">找不到符合條件的相框。</p>
                        {(searchTerm || selectedCategory !== '全部') && (
                            <button 
                                onClick={() => {setSearchTerm(''); setSelectedCategory('全部');}}
                                className="text-blue-600 hover:underline text-sm"
                            >
                                清除篩選條件
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Edit Info Modal */}
            {editingFrame && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 animate-in fade-in zoom-in-95">
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="font-bold text-gray-900">編輯資訊</h3>
                            <button onClick={() => setEditingFrame(null)}><X className="w-5 h-5 text-gray-400" /></button>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">名稱</label>
                                <input 
                                    value={editingFrame.name} 
                                    onChange={e => setEditingFrame({...editingFrame, name: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">分類</label>
                                <select 
                                    value={editingFrame.category || '未分類'}
                                    onChange={e => setEditingFrame({...editingFrame, category: e.target.value})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                                >
                                    {categories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="pt-2 flex justify-end gap-2">
                                <button onClick={() => setEditingFrame(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">取消</button>
                                <button onClick={handleSaveEdit} className="px-4 py-2 bg-black text-white rounded-lg text-sm hover:bg-gray-800">儲存</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default FrameList;
