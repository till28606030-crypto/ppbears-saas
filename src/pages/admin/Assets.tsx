import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { uploadToSupabase } from '@/lib/upload';
import { Sticker, Image as ImageIcon, Upload, Trash2, Edit2, X, Plus, Save, GripVertical, Search } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AssetItem } from '@/types';

// Predefined Categories
const DEFAULT_STICKER_CATEGORIES = [
    '熱門活動',
    '主題設計',
    '合作設計師',
    '未分類'
];

const DEFAULT_BACKGROUND_CATEGORIES = [
    '風格類型',
    '節慶氛圍',
    '未分類'
];

function SortableCategoryItem({ id, onDelete }: { id: string; onDelete: (id: string) => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} className="flex items-center justify-between text-sm bg-white px-2 py-1 rounded border border-gray-100 group hover:border-blue-200 transition-colors">
            <div className="flex items-center gap-2">
                <button {...attributes} {...listeners} className="cursor-grab text-gray-400 hover:text-gray-600 active:cursor-grabbing">
                    <GripVertical className="w-3 h-3" />
                </button>
                <span>{id}</span>
            </div>
            {id !== '未分類' && (
                <button
                    onClick={() => onDelete(id)}
                    className="text-red-400 hover:text-red-600 p-1"
                >
                    <Trash2 className="w-3 h-3" />
                </button>
            )}
        </div>
    );
}

export default function AdminAssets() {
    const [activeAssetTab, setActiveAssetTab] = useState<'stickers' | 'backgrounds'>('stickers');
    const [stickers, setStickers] = useState<AssetItem[]>([]);
    const [backgrounds, setBackgrounds] = useState<AssetItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Categories Management State
    const [stickerCategories, setStickerCategories] = useState<string[]>(DEFAULT_STICKER_CATEGORIES);
    const [backgroundCategories, setBackgroundCategories] = useState<string[]>(DEFAULT_BACKGROUND_CATEGORIES);

    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategory, setNewCategory] = useState('');

    // Search & Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('全部');

    // Load Data from Supabase
    const fetchData = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('assets')
                .select('*')
                .in('type', ['sticker', 'background'])
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (data) {
                const loadedStickers = data.filter(i => i.type === 'sticker').map(mapDbToAsset);
                const loadedBackgrounds = data.filter(i => i.type === 'background').map(mapDbToAsset);

                setStickers(loadedStickers);
                setBackgrounds(loadedBackgrounds);

                // Extract distinct categories
                const sCats = Array.from(new Set([...DEFAULT_STICKER_CATEGORIES, ...loadedStickers.map(i => i.category)]));
                const bCats = Array.from(new Set([...DEFAULT_BACKGROUND_CATEGORIES, ...loadedBackgrounds.map(i => i.category)]));

                setStickerCategories(sCats);
                setBackgroundCategories(bCats);
            }
        } catch (err) {
            console.error("Failed to load assets:", err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const mapDbToAsset = (dbItem: any): AssetItem => ({
        id: dbItem.id,
        url: dbItem.url,
        name: dbItem.name || '未命名',
        category: dbItem.category || '未分類',
        tags: dbItem.tags || []
    });

    // Helper to get current active categories based on editType
    const getCurrentCategories = () => {
        return activeAssetTab === 'stickers' ? stickerCategories : backgroundCategories;
    };

    const handleAddCategory = () => {
        if (!newCategory.trim()) return;
        const cat = newCategory.trim();

        if (activeAssetTab === 'stickers') {
            setStickerCategories(prev => [...prev, cat]);
        } else {
            setBackgroundCategories(prev => [...prev, cat]);
        }

        setNewCategory('');
    };

    const handleDeleteCategory = (catToDelete: string) => {
        if (catToDelete === '未分類' || !confirm(`確定要刪除分類「${catToDelete}」嗎？`)) return;

        if (activeAssetTab === 'stickers') {
            setStickerCategories(prev => prev.filter(c => c !== catToDelete));
        } else {
            setBackgroundCategories(prev => prev.filter(c => c !== catToDelete));
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
        const current = getCurrentCategories();

        if (over && active.id !== over.id) {
            const oldIndex = current.indexOf(active.id as string);
            const newIndex = current.indexOf(over.id as string);

            const newCategories = arrayMove(current, oldIndex, newIndex);
            if (activeAssetTab === 'stickers') setStickerCategories(newCategories);
            else setBackgroundCategories(newCategories);
        }
    };

    // Edit Modal State
    const [editingAsset, setEditingAsset] = useState<AssetItem | null>(null);
    const [editType, setEditType] = useState<'stickers' | 'backgrounds'>('stickers');

    const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'stickers' | 'backgrounds') => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            // 1. Upload to Supabase Storage
            const publicUrl = await uploadToSupabase(file, 'assets', type); // Use 'stickers' or 'backgrounds' as folder
            if (!publicUrl) return;

            // 2. Insert into Supabase DB
            const newAsset = {
                type: type === 'stickers' ? 'sticker' : 'background',
                url: publicUrl,
                name: file.name.split('.')[0],
                category: '未分類',
                tags: [],
                created_at: new Date().toISOString()
            };

            const { data, error } = await supabase.from('assets').insert(newAsset).select().single();
            if (error) throw error;

            // 3. Update Local State
            const newItem = mapDbToAsset(data);
            if (type === 'stickers') setStickers(prev => [newItem, ...prev]);
            else setBackgrounds(prev => [newItem, ...prev]);

        } catch (err: any) {
            console.error("Upload failed:", err);
            alert("上傳失敗：" + err.message);
        }
    };

    const deleteAsset = async (id: string, type: 'stickers' | 'backgrounds') => {
        if (!confirm('確定要刪除此素材嗎？')) return;

        try {
            const { error } = await supabase.from('assets').delete().eq('id', id);
            if (error) throw error;

            if (type === 'stickers') setStickers(prev => prev.filter(i => i.id !== id));
            else setBackgrounds(prev => prev.filter(i => i.id !== id));
        } catch (err: any) {
            console.error("Delete failed:", err);
            alert("刪除失敗：" + err.message);
        }
    };

    const openEditModal = (asset: AssetItem, type: 'stickers' | 'backgrounds') => {
        setEditingAsset({ ...asset }); // Clone
        setEditType(type);
    };

    const saveEdit = async () => {
        if (!editingAsset) return;

        try {
            const { error } = await supabase
                .from('assets')
                .update({
                    name: editingAsset.name,
                    category: editingAsset.category,
                    tags: editingAsset.tags
                })
                .eq('id', editingAsset.id);

            if (error) throw error;

            // Update Local State
            if (editType === 'stickers') {
                setStickers(prev => prev.map(i => i.id === editingAsset.id ? editingAsset : i));
            } else {
                setBackgrounds(prev => prev.map(i => i.id === editingAsset.id ? editingAsset : i));
            }

            setEditingAsset(null);
        } catch (err: any) {
            console.error("Update failed:", err);
            alert("更新失敗：" + err.message);
        }
    };

    // Filter Logic
    const filteredAssets = (activeAssetTab === 'stickers' ? stickers : backgrounds).filter(item => {
        const matchesSearch = !searchTerm || item.name.toLowerCase().includes(searchTerm.toLowerCase()) || item.tags.some(t => t.toLowerCase().includes(searchTerm.toLowerCase()));
        const matchesCategory = selectedCategory === '全部' || item.category === selectedCategory;
        return matchesSearch && matchesCategory;
    });

    // Reset search and filter when tab changes
    useEffect(() => {
        setSearchTerm('');
        setSelectedCategory('全部');
    }, [activeAssetTab]);

    return (
        <>
            <header className="h-16 bg-white border-b border-gray-200 flex items-center px-8 shadow-sm">
                <h1 className="text-xl font-semibold text-gray-800">素材庫管理</h1>
            </header>

            <div className="p-8 max-w-5xl mx-auto">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="border-b border-gray-200 flex">
                        <button
                            onClick={() => setActiveAssetTab('stickers')}
                            className={`flex-1 py-4 text-center font-medium border-b-2 transition-colors ${activeAssetTab === 'stickers' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            <Sticker className="w-4 h-4 inline-block mr-2" /> 貼圖
                        </button>
                        <button
                            onClick={() => setActiveAssetTab('backgrounds')}
                            className={`flex-1 py-4 text-center font-medium border-b-2 transition-colors ${activeAssetTab === 'backgrounds' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            <ImageIcon className="w-4 h-4 inline-block mr-2" /> 背景
                        </button>
                    </div>

                    <div className="p-8">
                        {/* Search & Filter Bar */}
                        <div className="mb-8 space-y-4">
                            {/* Search Input */}
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                    <Search className="w-5 h-5" />
                                </div>
                                <input
                                    type="text"
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="輸入查詢關鍵字..."
                                    className="block w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                />
                            </div>

                            {/* Category Tabs */}
                            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                <div className="flex items-center px-4 py-2 bg-gray-100 text-gray-600 rounded-md text-sm font-medium whitespace-nowrap">
                                    {activeAssetTab === 'stickers' ? '貼圖風格' : '背景風格'}
                                </div>
                                <button
                                    onClick={() => setSelectedCategory('全部')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${selectedCategory === '全部' ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                >
                                    全部
                                </button>
                                {(activeAssetTab === 'stickers' ? stickerCategories : backgroundCategories).map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setSelectedCategory(cat)}
                                        className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${selectedCategory === cat ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                    >
                                        {cat}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Upload Area */}
                        <div className="mb-8">
                            <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    <Upload className="w-8 h-8 mb-3 text-gray-400" />
                                    <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">點擊上傳</span> {activeAssetTab === 'stickers' ? '貼圖' : '背景'}</p>
                                    <p className="text-xs text-gray-500">PNG, JPG (最大 5MB)</p>
                                </div>
                                <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    onChange={(e) => handleAssetUpload(e, activeAssetTab)}
                                />
                            </label>
                        </div>

                        {/* Gallery */}
                        {isLoading ? (
                            <div className="text-center py-12 text-gray-400">載入中...</div>
                        ) : (
                            <div className="grid grid-cols-4 md:grid-cols-6 gap-4">
                                {filteredAssets.map((item, idx) => (
                                    <div key={item.id} className="group relative aspect-square bg-gray-100 rounded-lg border border-gray-200 overflow-hidden flex items-center justify-center p-2">
                                        <img src={item.url} alt={item.name} className="max-w-full max-h-full object-contain" />

                                        {/* Actions Overlay */}
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                            <button
                                                onClick={() => openEditModal(item, activeAssetTab)}
                                                className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
                                                title="編輯資訊"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => deleteAsset(item.id, activeAssetTab)}
                                                className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                                title="刪除素材"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>

                                        {/* Label */}
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-1">
                                            <p className="text-white text-[10px] truncate text-center">{item.name}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}

                        {filteredAssets.length === 0 && !isLoading && (
                            <div className="text-center py-12">
                                <p className="text-gray-400 mb-2">找不到符合條件的素材。</p>
                                {(searchTerm || selectedCategory !== '全部') && (
                                    <button
                                        onClick={() => { setSearchTerm(''); setSelectedCategory('全部'); }}
                                        className="text-blue-600 hover:underline text-sm"
                                    >
                                        清除篩選條件
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Edit Modal */}
            {editingAsset && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="font-bold text-gray-800">編輯素材資訊</h3>
                            <button onClick={() => setEditingAsset(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <div className="flex justify-center mb-4">
                                <div className="w-24 h-24 bg-gray-50 border rounded-lg p-2 flex items-center justify-center">
                                    <img src={editingAsset.url} alt="Preview" className="max-w-full max-h-full object-contain" />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">素材名稱</label>
                                <input
                                    type="text"
                                    value={editingAsset.name}
                                    onChange={(e) => setEditingAsset({ ...editingAsset, name: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-gray-700">分類</label>
                                    <button
                                        onClick={() => setIsAddingCategory(!isAddingCategory)}
                                        className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                    >
                                        <Plus className="w-3 h-3" /> 管理分類
                                    </button>
                                </div>

                                {isAddingCategory ? (
                                    <div className="p-3 bg-gray-50 rounded-lg border border-gray-200 mb-2 space-y-2">
                                        <div className="flex gap-2">
                                            <input
                                                type="text"
                                                value={newCategory}
                                                onChange={(e) => setNewCategory(e.target.value)}
                                                placeholder="輸入新分類名稱"
                                                className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 outline-none"
                                            />
                                            <button
                                                onClick={handleAddCategory}
                                                className="px-3 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700"
                                            >
                                                新增
                                            </button>
                                        </div>
                                        <div className="max-h-48 overflow-y-auto space-y-1">
                                            <DndContext
                                                sensors={sensors}
                                                collisionDetection={closestCenter}
                                                onDragEnd={handleDragEnd}
                                            >
                                                <SortableContext
                                                    items={getCurrentCategories()}
                                                    strategy={verticalListSortingStrategy}
                                                >
                                                    {getCurrentCategories().map((cat) => (
                                                        <SortableCategoryItem
                                                            key={cat}
                                                            id={cat}
                                                            onDelete={handleDeleteCategory}
                                                        />
                                                    ))}
                                                </SortableContext>
                                            </DndContext>
                                        </div>
                                    </div>
                                ) : (
                                    <select
                                        value={editingAsset.category}
                                        onChange={(e) => setEditingAsset({ ...editingAsset, category: e.target.value })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        {getCurrentCategories().map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">標籤 (以逗號分隔)</label>
                                <input
                                    type="text"
                                    value={editingAsset.tags.join(', ')}
                                    onChange={(e) => setEditingAsset({ ...editingAsset, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="例如: 可愛, 紅色, 新年"
                                />
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
                            <button
                                onClick={() => setEditingAsset(null)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={saveEdit}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
                            >
                                <Save className="w-4 h-4" /> 儲存變更
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
