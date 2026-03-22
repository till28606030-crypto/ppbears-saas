import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { uploadToSupabase } from '@/lib/upload';
import { apiUrl } from '@/lib/apiBase';
import { generateThumbnail } from '@/lib/imageUtils';
import { Sticker, Image as ImageIcon, Upload, Trash2, Edit2, X, Plus, Save, GripVertical, Search, Copy, Sparkles, Loader2, Check } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
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

/** Inline sortable category pill used in the category bar */
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
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
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

export default function AdminAssets() {
    const [activeAssetTab, setActiveAssetTab] = useState<'stickers' | 'backgrounds' | 'frames'>('stickers');
    const [stickers, setStickers] = useState<AssetItem[]>([]);
    const [backgrounds, setBackgrounds] = useState<AssetItem[]>([]);
    const [frames, setFrames] = useState<AssetItem[]>([]);
    const [isLoading, setIsLoading] = useState(false);

    // Batch Edit & Inline Edit State
    const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
    const [isBatchUpdating, setIsBatchUpdating] = useState(false);

    // Categories Management State
    const [stickerCategories, setStickerCategories] = useState<string[]>(DEFAULT_STICKER_CATEGORIES);
    const [backgroundCategories, setBackgroundCategories] = useState<string[]>(DEFAULT_BACKGROUND_CATEGORIES);
    const [frameCategories, setFrameCategories] = useState<string[]>(['基本相框', '節慶', '未分類']);

    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategory, setNewCategory] = useState('');

    // Search & Filter State
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('全部');

    useEffect(() => {
        setSelectedAssetIds([]);
    }, [activeAssetTab, searchTerm, selectedCategory]);

    // Load Data from Supabase
    const fetchData = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase
                .from('assets')
                .select('*')
                .in('type', ['sticker', 'background', 'frame'])
                .order('created_at', { ascending: false });

            if (error) throw error;

            if (data) {
                const loadedStickers = data.filter(i => i.type === 'sticker').map(mapDbToAsset);
                const loadedBackgrounds = data.filter(i => i.type === 'background').map(mapDbToAsset);
                const loadedFrames = data.filter(i => i.type === 'frame').map(mapDbToAsset);

                setStickers(loadedStickers);
                setBackgrounds(loadedBackgrounds);
                setFrames(loadedFrames);

                // Extract distinct categories
                const sCats = Array.from(new Set(['未分類', ...loadedStickers.map(i => i.category)]));
                const bCats = Array.from(new Set(['未分類', ...loadedBackgrounds.map(i => i.category)]));
                const fCats = Array.from(new Set(['未分類', ...loadedFrames.map(i => i.category)]));

                setStickerCategories(sCats);
                setBackgroundCategories(bCats);
                setFrameCategories(fCats);
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
        tags: dbItem.tags || [],
        metadata: dbItem.metadata
    });

    // Helper to get current active categories based on editType
    const getCurrentCategories = () => {
        if (activeAssetTab === 'stickers') return stickerCategories;
        if (activeAssetTab === 'backgrounds') return backgroundCategories;
        return frameCategories;
    };

    const handleAddCategory = () => {
        if (!newCategory.trim()) return;
        const cat = newCategory.trim();

        if (activeAssetTab === 'stickers') {
            setStickerCategories(prev => [...prev, cat]);
        } else if (activeAssetTab === 'backgrounds') {
            setBackgroundCategories(prev => [...prev, cat]);
        } else {
            setFrameCategories(prev => [...prev, cat]);
        }

        setNewCategory('');
    };

    const handleDeleteCategory = async (catToDelete: string) => {
        if (catToDelete === '未分類') return;

        if (!window.confirm(`確定要刪除「${catToDelete}」類別嗎？\n該類別下的所有素材將被移至「未分類」。`)) {
            return;
        }

        setIsLoading(true);
        try {
            const dbType = activeAssetTab.slice(0, -1);
            
            // 1. Update in Supabase
            const { error } = await supabase
                .from('assets')
                .update({ category: '未分類' })
                .eq('type', dbType)
                .eq('category', catToDelete);

            if (error) throw error;

            // 2. Update local state
            const updateAssets = (items: AssetItem[]) =>
                items.map(i => i.category === catToDelete ? { ...i, category: '未分類' } : i);
            
            if (activeAssetTab === 'stickers') {
                setStickerCategories(prev => prev.filter(c => c !== catToDelete));
                setStickers(prev => updateAssets(prev));
            } else if (activeAssetTab === 'backgrounds') {
                setBackgroundCategories(prev => prev.filter(c => c !== catToDelete));
                setBackgrounds(prev => updateAssets(prev));
            } else {
                setFrameCategories(prev => prev.filter(c => c !== catToDelete));
                setFrames(prev => updateAssets(prev));
            }
        } catch (err: any) {
            console.error("Failed to delete category:", err);
            alert("刪除失敗：" + err.message);
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
        const current = getCurrentCategories();

        if (over && active.id !== over.id) {
            const oldIndex = current.indexOf(active.id as string);
            const newIndex = current.indexOf(over.id as string);

            const newCategories = arrayMove(current, oldIndex, newIndex);
            if (activeAssetTab === 'stickers') setStickerCategories(newCategories);
            else if (activeAssetTab === 'backgrounds') setBackgroundCategories(newCategories);
            else setFrameCategories(newCategories);
        }
    };

    const handleBatchCategoryUpdate = async (newCategory: string) => {
        if (selectedAssetIds.length === 0 || !newCategory) return;
        setIsBatchUpdating(true);
        try {
            const dbType = activeAssetTab.slice(0, -1);
            const { error } = await supabase
                .from('assets')
                .update({ category: newCategory })
                .eq('type', dbType)
                .in('id', selectedAssetIds);

            if (error) throw error;

            const updateFn = (items: AssetItem[]) => 
                items.map(i => selectedAssetIds.includes(i.id) ? { ...i, category: newCategory } : i);
            
            if (activeAssetTab === 'stickers') setStickers(updateFn);
            else if (activeAssetTab === 'backgrounds') setBackgrounds(updateFn);
            else setFrames(updateFn);

            setSelectedAssetIds([]);
        } catch (err: any) {
            alert("批次更新分類失敗: " + err.message);
        } finally {
            setIsBatchUpdating(false);
        }
    };

    const handleInlineNameUpdate = async (id: string, newName: string) => {
        const trimmedName = newName.trim();
        if (!trimmedName) return;
        try {
            const { error } = await supabase
                .from('assets')
                .update({ name: trimmedName })
                .eq('id', id);

            if (error) throw error;

            const updateFn = (items: AssetItem[]) => 
                items.map(i => i.id === id ? { ...i, name: trimmedName } : i);
            
            if (activeAssetTab === 'stickers') setStickers(updateFn);
            else if (activeAssetTab === 'backgrounds') setBackgrounds(updateFn);
            else setFrames(updateFn);
        } catch (err: any) {
            alert("名稱更新失敗: " + err.message);
        }
    };

    // Inline category rename state
    const [editingCatName, setEditingCatName] = useState<string | null>(null); // which cat is being renamed
    const [editingCatValue, setEditingCatValue] = useState('');

    const startEditCat = (cat: string) => {
        setEditingCatName(cat);
        setEditingCatValue(cat);
    };

    const confirmEditCat = async () => {
        if (!editingCatName) return;
        const newName = editingCatValue.trim();
        if (!newName || newName === editingCatName) { setEditingCatName(null); return; }

        setIsLoading(true);
        try {
            const dbType = activeAssetTab.slice(0, -1);
            
            // 1. Update in Supabase
            const { error } = await supabase
                .from('assets')
                .update({ category: newName })
                .eq('type', dbType)
                .eq('category', editingCatName);

            if (error) throw error;

            // 2. Update local state
            const rename = (cats: string[]) => cats.map(c => c === editingCatName ? newName : c);
            const updateAssets = (items: AssetItem[]) =>
                items.map(i => i.category === editingCatName ? { ...i, category: newName } : i);

            if (activeAssetTab === 'stickers') {
                setStickerCategories(prev => rename(prev));
                setStickers(prev => updateAssets(prev));
            } else if (activeAssetTab === 'backgrounds') {
                setBackgroundCategories(prev => rename(prev));
                setBackgrounds(prev => updateAssets(prev));
            } else {
                setFrameCategories(prev => rename(prev));
                setFrames(prev => updateAssets(prev));
            }

            if (selectedCategory === editingCatName) setSelectedCategory(newName);
            setEditingCatName(null);
        } catch (err: any) {
            console.error("Failed to rename category:", err);
            alert("重新命名失敗：" + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // Inline new category add state
    const [isAddingCatInline, setIsAddingCatInline] = useState(false);
    const [newCatInlineValue, setNewCatInlineValue] = useState('');

    // Edit Modal State
    const [editingAsset, setEditingAsset] = useState<AssetItem | null>(null);
    const [editType, setEditType] = useState<'stickers' | 'backgrounds' | 'frames'>('stickers');
    const [isAiTagging, setIsAiTagging] = useState(false);

    // Upload Queue State
    const [uploadQueue, setUploadQueue] = useState<AssetItem[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);

    // Pop next item from queue into edit modal
    const processNextInQueue = (queue: AssetItem[]) => {
        if (queue.length === 0) {
            setUploadProgress(null);
            return;
        }
        const [next, ...rest] = queue;
        setUploadQueue(rest);
        setEditingAsset({ ...next });
        setEditType(next.metadata?.assetType || 'stickers');
        autoTagAsset(next.url, next);
    };

    const handleAssetUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'stickers' | 'backgrounds' | 'frames') => {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;
        // Reset input so same files can be re-selected
        e.target.value = '';

        setIsUploading(true);
        setUploadProgress({ done: 0, total: files.length });

        const uploadedItems: AssetItem[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                // 1. Upload original to Supabase Storage
                const publicUrl = await uploadToSupabase(file, 'assets', type);
                if (!publicUrl) continue;

                // 1.5. Generate and upload thumbnail
                let thumbUrl = publicUrl;
                try {
                    const { blob, filename } = await generateThumbnail(file);
                    const thumbFile = new File([blob], filename, { type: 'image/webp' });
                    const uploadedThumbUrl = await uploadToSupabase(thumbFile, 'assets', type);
                    if (uploadedThumbUrl) thumbUrl = uploadedThumbUrl;
                } catch (thumbErr) {
                    console.warn('Thumbnail generation failed:', thumbErr);
                }

                // 2. Insert into Supabase DB
                const newAsset = {
                    type: type === 'stickers' ? 'sticker' : type === 'backgrounds' ? 'background' : 'frame',
                    url: publicUrl,
                    name: file.name.replace(/\.[^.]+$/, ''), // Remove extension
                    category: selectedCategory !== '全部' ? selectedCategory : '未分類',
                    tags: [],
                    metadata: { thumbnail_url: thumbUrl, assetType: type },
                    created_at: new Date().toISOString()
                };

                const { data, error } = await supabase.from('assets').insert(newAsset).select().single();
                if (error) throw error;

                // 3. Update Local State immediately
                const newItem = mapDbToAsset(data);
                if (type === 'stickers') setStickers(prev => [newItem, ...prev]);
                else if (type === 'backgrounds') setBackgrounds(prev => [newItem, ...prev]);
                else setFrames(prev => [newItem, ...prev]);

                uploadedItems.push(newItem);
                setUploadProgress({ done: i + 1, total: files.length });

            } catch (err: any) {
                console.error(`Upload failed for ${file.name}:`, err);
            }
        }

        setIsUploading(false);

        // After all uploaded, open edit queue
        if (uploadedItems.length > 0) {
            const [first, ...rest] = uploadedItems;
            setUploadQueue(rest);
            setEditingAsset({ ...first });
            setEditType(type);
            autoTagAsset(first.url, first);
        }
    };

    const deleteAsset = async (id: string, type: 'stickers' | 'backgrounds' | 'frames') => {
        if (!confirm('確定要刪除此素材嗎？')) return;

        try {
            const { error } = await supabase.from('assets').delete().eq('id', id);
            if (error) throw error;

            if (type === 'stickers') setStickers(prev => prev.filter(i => i.id !== id));
            else if (type === 'backgrounds') setBackgrounds(prev => prev.filter(i => i.id !== id));
            else setFrames(prev => prev.filter(i => i.id !== id));
        } catch (err: any) {
            console.error("Delete failed:", err);
            alert("刪除失敗：" + err.message);
        }
    };

    const openEditModal = (asset: AssetItem, type: 'stickers' | 'backgrounds' | 'frames') => {
        setEditingAsset({ ...asset }); // Clone
        setEditType(type);
    };

    // AI Auto-Tag Function
    const autoTagAsset = async (imageUrl: string, asset: AssetItem) => {
        setIsAiTagging(true);
        try {
            // Collect all existing tags from current assets for consistency
            const allTags = [...stickers, ...backgrounds, ...frames]
                .flatMap(item => item.tags || []);
            const existingTags = [...new Set(allTags)].filter(Boolean);

            console.log('[AutoTag] Sending request for asset:', asset.id, 'url:', imageUrl.slice(0, 60));

            const apiOrigin = (import.meta as any).env?.VITE_API_ORIGIN || '';
            const response = await fetch(`${apiOrigin}/api/ai/vision-analyze`, {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'X-AI-Token': import.meta.env.VITE_AI_TOKEN || ''
                },
                body: JSON.stringify({ imageUrl, existingTags })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.message || `API 錯誤: ${response.statusText}`);
            }

            const result = await response.json();
            console.log('[AutoTag] Response:', JSON.stringify(result));

            if (result.success && Array.isArray(result.tags) && result.tags.length > 0) {
                const newTags = result.tags;
                // Update tags first, then reset loading flag
                setEditingAsset(prev => {
                    if (prev && prev.id === asset.id) {
                        return { ...prev, tags: newTags };
                    }
                    return prev;
                });
                // Small delay to ensure React commits the tags state before showing the input
                await new Promise(r => setTimeout(r, 50));
                setIsAiTagging(false);
            } else {
                console.warn('[AutoTag] Empty or invalid tags received:', result);
                setIsAiTagging(false);
            }
        } catch (err) {
            console.error('[AutoTag] Failed:', err);
            alert('AI 辨識失敗：' + (err instanceof Error ? err.message : String(err)));
            setIsAiTagging(false);
        }
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
            } else if (editType === 'backgrounds') {
                setBackgrounds(prev => prev.map(i => i.id === editingAsset.id ? editingAsset : i));
            } else {
                setFrames(prev => prev.map(i => i.id === editingAsset.id ? editingAsset : i));
            }

            setEditingAsset(null);

            // Process next in upload queue if any
            if (uploadQueue.length > 0) {
                processNextInQueue(uploadQueue);
            }
        } catch (err: any) {
            console.error("Update failed:", err);
            alert("更新失敗：" + err.message);
        }
    };

    // Filter Logic
    const filteredAssets = (activeAssetTab === 'stickers' ? stickers : activeAssetTab === 'backgrounds' ? backgrounds : frames).filter(item => {
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
                        <button
                            onClick={() => setActiveAssetTab('frames')}
                            className={`flex-1 py-4 text-center font-medium border-b-2 transition-colors ${activeAssetTab === 'frames' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                        >
                            <ImageIcon className="w-4 h-4 inline-block mr-2" /> 相框
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

                            {/* Category Bar - fully inline editable */}
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide flex-wrap">
                                    <button
                                        onClick={() => setSelectedCategory('全部')}
                                        className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                                            selectedCategory === '全部' ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-gray-600 border border-gray-200 hover:border-blue-300'
                                        }`}
                                    >
                                        全部
                                    </button>

                                    <SortableContext
                                        items={getCurrentCategories()}
                                        strategy={horizontalListSortingStrategy}
                                    >
                                        {getCurrentCategories().map(cat => (
                                            <SortableCategoryPill
                                                key={cat}
                                                id={cat}
                                                isSelected={selectedCategory === cat}
                                                isEditing={editingCatName === cat}
                                                editValue={editingCatValue}
                                                onSelect={() => setSelectedCategory(cat)}
                                                onDoubleClick={() => startEditCat(cat)}
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

                                    {/* Inline add new category */}
                                    {isAddingCatInline ? (
                                        <div className="flex items-center gap-1 px-2 py-1 rounded-full border border-blue-400 bg-blue-50">
                                            <input
                                                autoFocus
                                                value={newCatInlineValue}
                                                onChange={(e) => setNewCatInlineValue(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && newCatInlineValue.trim()) {
                                                        handleAddCategory();
                                                        setIsAddingCatInline(false);
                                                        setNewCatInlineValue('');
                                                    }
                                                    if (e.key === 'Escape') { setIsAddingCatInline(false); setNewCatInlineValue(''); }
                                                }}
                                                placeholder="新類別名稱"
                                                className="w-24 text-sm bg-transparent outline-none text-gray-800"
                                            />
                                            <button
                                                onClick={() => {
                                                    if (newCatInlineValue.trim()) {
                                                        setNewCategory(newCatInlineValue.trim());
                                                        // We need to call handleAddCategory with the inline value
                                                        const cat = newCatInlineValue.trim();
                                                        if (activeAssetTab === 'stickers') setStickerCategories(prev => [...prev, cat]);
                                                        else if (activeAssetTab === 'backgrounds') setBackgroundCategories(prev => [...prev, cat]);
                                                        else setFrameCategories(prev => [...prev, cat]);
                                                    }
                                                    setIsAddingCatInline(false);
                                                    setNewCatInlineValue('');
                                                }}
                                                className="text-green-500 hover:text-green-700"
                                            >
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
                                </div>
                            </DndContext>
                        </div>

                        {/* Upload Area */}
                        <div className="mb-8">
                            <label className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors ${isUploading ? 'pointer-events-none opacity-60' : ''}`}>
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    {isUploading ? (
                                        <>
                                            <Loader2 className="w-8 h-8 mb-2 text-blue-500 animate-spin" />
                                            <p className="text-sm text-blue-600 font-semibold">
                                                批量上傳中... {uploadProgress?.done}/{uploadProgress?.total} 張
                                            </p>
                                            <div className="w-40 h-1.5 bg-gray-200 rounded-full mt-2 overflow-hidden">
                                                <div
                                                    className="h-full bg-blue-500 rounded-full transition-all"
                                                    style={{ width: `${uploadProgress ? (uploadProgress.done / uploadProgress.total) * 100 : 0}%` }}
                                                />
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <Upload className="w-8 h-8 mb-3 text-gray-400" />
                                            <p className="mb-1 text-sm text-gray-500"><span className="font-semibold">點擊上傳</span> {activeAssetTab === 'stickers' ? '貼圖' : '背景'}</p>
                                            <p className="text-xs text-gray-400">支援多選，PNG, JPG, WebP（每檔最大 5MB）</p>
                                        </>
                                    )}
                                </div>
                                <input
                                    type="file"
                                    className="hidden"
                                    accept="image/*"
                                    multiple
                                    onChange={(e) => handleAssetUpload(e, activeAssetTab)}
                                />
                            </label>
                            {uploadQueue.length > 0 && (
                                <div className="mt-2 flex items-center gap-2 text-sm text-orange-600 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    <span>還有 <strong>{uploadQueue.length}</strong> 張圖片等待您編輯名稱與標籤（請儲存目前這張後繼續）</span>
                                </div>
                            )}
                        </div>

                        {/* Gallery */}
                        {selectedAssetIds.length > 0 && !isLoading && (
                            <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
                                <div className="text-sm text-blue-800 font-medium flex items-center gap-2">
                                    <span className="bg-blue-600 text-white w-5 h-5 flex items-center justify-center rounded-full text-xs">{selectedAssetIds.length}</span>
                                    已選取項目
                                </div>
                                <div className="flex items-center gap-2">
                                    <select 
                                        id="batchCategorySelect"
                                        className="text-sm border-gray-300 rounded-md py-1.5 pl-3 pr-8 focus:ring-blue-500 focus:border-blue-500"
                                        defaultValue=""
                                    >
                                        <option value="" disabled>請選擇新分類...</option>
                                        {activeAssetTab === 'stickers' ? stickerCategories.filter(c=>c!=='全部').map(c => <option key={c} value={c}>{c}</option>) : null}
                                        {activeAssetTab === 'backgrounds' ? backgroundCategories.filter(c=>c!=='全部').map(c => <option key={c} value={c}>{c}</option>) : null}
                                        {activeAssetTab === 'frames' ? frameCategories.filter(c=>c!=='全部').map(c => <option key={c} value={c}>{c}</option>) : null}
                                    </select>
                                    <button 
                                        onClick={() => {
                                            const select = document.getElementById('batchCategorySelect') as HTMLSelectElement;
                                            if (select.value) {
                                                handleBatchCategoryUpdate(select.value);
                                            } else {
                                                alert('請先選擇分類');
                                            }
                                        }}
                                        disabled={isBatchUpdating}
                                        className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                                    >
                                        {isBatchUpdating && <Loader2 className="w-3 h-3 animate-spin" />}
                                        套用分類
                                    </button>
                                    <button 
                                        onClick={() => setSelectedAssetIds([])}
                                        className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50"
                                    >
                                        取消選取
                                    </button>
                                </div>
                            </div>
                        )}

                        {isLoading ? (
                            <div className="text-center py-12 text-gray-400">載入中...</div>
                        ) : (
                            <div className="grid grid-cols-4 md:grid-cols-6 gap-4">
                                {filteredAssets.map((item, idx) => (
                                    <div key={item.id} className="group relative aspect-square bg-gray-100 rounded-lg border border-gray-200 overflow-hidden flex items-center justify-center p-2">
                                        {/* Checkbox for Batch Selection */}
                                        <div className="absolute top-2 left-2 z-20">
                                            <input 
                                                type="checkbox" 
                                                checked={selectedAssetIds.includes(item.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) setSelectedAssetIds(prev => [...prev, item.id]);
                                                    else setSelectedAssetIds(prev => prev.filter(id => id !== item.id));
                                                }}
                                                className={`w-4 h-4 rounded border-gray-300 shadow-sm cursor-pointer transition-opacity ${selectedAssetIds.includes(item.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                                                title="選取以批次修改分類"
                                            />
                                        </div>

                                        <img 
                                            src={item.metadata?.thumbnail_url || item.url} 
                                            onError={(e) => {
                                                const target = e.target as HTMLImageElement;
                                                if (target.src !== item.url) {
                                                    target.src = item.url;
                                                }
                                            }}
                                            alt={item.name} 
                                            className="max-w-full max-h-full object-contain" 
                                            loading="lazy"
                                        />

                                        {/* Actions Overlay */}
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                                            <button
                                                onClick={() => openEditModal(item, activeAssetTab)}
                                                className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
                                                title="編輯資訊"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                            {activeAssetTab === 'backgrounds' && (
                                                <button
                                                    onClick={() => {
                                                        const link = `${window.location.origin}${import.meta.env.VITE_BASE_PATH || '/'}t/bg-${item.id}`;
                                                        navigator.clipboard.writeText(link);
                                                        alert("背景素材連結已複製！\n\n網址: " + link);
                                                    }}
                                                    className="p-2 bg-green-500 text-white rounded-full hover:bg-green-600 transition-colors"
                                                    title="複製對外連結"
                                                >
                                                    <Copy className="w-4 h-4" />
                                                </button>
                                            )}
                                            <button
                                                onClick={() => deleteAsset(item.id, activeAssetTab)}
                                                className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                                title="刪除素材"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </div>

                                        {/* Inline Editable Label */}
                                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 p-0.5 z-20">
                                            <input
                                                type="text"
                                                defaultValue={item.name}
                                                onBlur={(e) => {
                                                    const val = e.target.value.trim();
                                                    if (val && val !== item.name) {
                                                        handleInlineNameUpdate(item.id, val);
                                                    } else {
                                                        e.target.value = item.name;
                                                    }
                                                }}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') e.currentTarget.blur();
                                                    if (e.key === 'Escape') {
                                                        e.currentTarget.value = item.name;
                                                        e.currentTarget.blur();
                                                    }
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                className="w-full bg-transparent text-white text-[10px] text-center outline-none border-b border-transparent focus:border-white/50 focus:bg-white/20 px-0.5 rounded-none transition-colors"
                                                title="點擊修改圖片名稱 (Enter 儲存)"
                                            />
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
                            <div>
                                <h3 className="font-bold text-gray-800">編輯素材資訊</h3>
                                {uploadQueue.length > 0 && (
                                    <p className="text-xs text-orange-500 mt-0.5">儲存後將自動開啟下一張（還剩 {uploadQueue.length} 張）</p>
                                )}
                            </div>
                            <button onClick={() => { setEditingAsset(null); setUploadQueue([]); }} className="text-gray-400 hover:text-gray-600">
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">分類</label>
                                <select
                                    value={editingAsset.category}
                                    onChange={(e) => setEditingAsset({ ...editingAsset, category: e.target.value })}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                >
                                    {getCurrentCategories().map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <div className="flex items-center justify-between mb-1">
                                    <label className="block text-sm font-medium text-gray-700">標籤 (以逗號分隔)</label>
                                    {!isAiTagging && (
                                        <button
                                            onClick={() => autoTagAsset(editingAsset.url, editingAsset)}
                                            className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1"
                                            title={editingAsset.tags.length > 0 ? '重新 AI 辨識並更新標籤' : 'AI 自動產生標籤'}
                                        >
                                            <Sparkles className="w-3 h-3" /> {editingAsset.tags.length > 0 ? '重新辨識' : 'AI 自動標籤'}
                                        </button>
                                    )}
                                </div>
                                {isAiTagging ? (
                                    <div className="flex items-center gap-2 px-3 py-2 border border-purple-200 bg-purple-50 rounded-lg text-purple-600 text-sm">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        <span>✨ AI 分析中，正在辨識圖片標籤...</span>
                                    </div>
                                ) : (
                                    <input
                                        type="text"
                                        value={editingAsset.tags.join(', ')}
                                        onChange={(e) => setEditingAsset({ ...editingAsset, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean) })}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                        placeholder="例如: 可愛, 紅色, 新年"
                                    />
                                )}
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
                            <button
                                onClick={() => { setEditingAsset(null); setUploadQueue([]); }}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={saveEdit}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors flex items-center gap-2"
                            >
                                <Save className="w-4 h-4" />
                                {uploadQueue.length > 0 ? `儲存並開啟下一張 (${uploadQueue.length})` : '儲存變更'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
