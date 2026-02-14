import React, { useState, useEffect, useRef } from 'react';
import {
    Plus,
    Trash2,
    Save,
    ChevronRight,
    Tag,
    Palette,
    Image as ImageIcon,
    Settings,
    MoreVertical,
    Search,
    Upload,
    FileSpreadsheet,
    ListPlus,
    X,
    Copy
} from 'lucide-react';
import { get, set } from 'idb-keyval';

import {
    OptionGroup,
    OptionItem,
    ProductAvailability,
    SubAttribute,
    SubAttributeOption,
    OptionGroupUIConfig
} from '../../types';
import { normalizeOptionGroup } from '../../utils/normalizeOptionGroup';
import MultiImageUploader from '../../components/admin/MultiImageUploader';
import { supabase } from '../../lib/supabase';
import { toDbGroup, fromDbGroup, toDbItem, fromDbItem } from '../../utils/dbMappers';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

// --- Types ---
// Moved to src/types.ts

const QUILL_MODULES = {
    toolbar: [
        ['bold', 'italic', 'underline', 'strike'],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        ['link'],
        ['clean']
    ],
};

const STORAGE_KEY_AVAILABILITY = 'ppbears_product_availability';
const STORAGE_KEY_PRODUCTS = 'ppbears_seller_products';

// Helper to upload to Supabase
const uploadToSupabase = async (file: File, bucket: 'assets' | 'models' = 'assets') => {
    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(filePath, file);

        if (uploadError) {
            // Ignore AbortError caused by React Strict Mode or fast unmounts
            if (uploadError.message?.includes('AbortError') || uploadError.name === 'AbortError' || uploadError.message?.includes('signal is aborted')) {
                console.warn('Supabase upload aborted (likely due to dev environment/Strict Mode). Ignoring.');

                // Fallback for Trae Preview Environment
                const isPreview = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');
                if (isPreview) {
                    alert('⚠️ 預覽環境限制：圖片上傳被中斷，將使用替代圖片。\n(請在 Chrome 或正式環境測試真實上傳功能)');
                    return 'https://placehold.co/400x400?text=Preview+Image';
                }

                return null;
            }
            throw uploadError;
        }

        const { data } = supabase.storage
            .from(bucket)
            .getPublicUrl(filePath);

        return data.publicUrl;
    } catch (error: any) {
        if (error.message?.includes('AbortError') || error.name === 'AbortError' || error.message?.includes('signal is aborted')) {
            // Fallback for Trae Preview Environment (Catch block)
            const isPreview = window.location.hostname.includes('localhost') || window.location.hostname.includes('127.0.0.1');
            if (isPreview) {
                alert('⚠️ 預覽環境限制：圖片上傳被中斷，將使用替代圖片。\n(請在 Chrome 或正式環境測試真實上傳功能)');
                return 'https://placehold.co/400x400?text=Preview+Image';
            }
            return null;
        }
        console.error('Upload failed:', error);
        alert('圖片上傳失敗: ' + (error.message || '未知錯誤'));
        return null;
    }
};

export default function AdminOptionManager() {
    // State
    const [groups, setGroups] = useState<OptionGroup[]>([]);
    const [items, setItems] = useState<OptionItem[]>([]);
    const [availability, setAvailability] = useState<ProductAvailability[]>([]);
    const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Form States
    const [isEditingGroup, setIsEditingGroup] = useState(false);
    const [editingGroupData, setEditingGroupData] = useState<Partial<OptionGroup>>({});

    // Sub-Attributes Editor State
    const [attributeInput, setAttributeInput] = useState<{ name: string, type: 'select' | 'text' }>({ name: '', type: 'select' });
    const [attributeOptionInput, setAttributeOptionInput] = useState<{ attrId: string, name: string, price: number, image?: string } | null>(null);

    const [isEditingItem, setIsEditingItem] = useState(false);
    const [editingItemData, setEditingItemData] = useState<Partial<OptionItem>>({});

    // Load Data (Sync with Supabase)
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                // 1. Fetch from Supabase
                const { data: dbGroups, error: errG } = await supabase.from('option_groups').select('*');
                const { data: dbItems, error: errI } = await supabase.from('option_items').select('*');

                if (errG) {
                    if (!errG.message?.includes('AbortError')) console.error('Error loading groups:', errG);
                }
                if (errI) {
                    if (!errI.message?.includes('AbortError')) console.error('Error loading items:', errI);
                }

                // DB has data
                if (dbGroups) setGroups(dbGroups.map(fromDbGroup));
                if (dbItems) setItems(dbItems.map(fromDbItem));

                // Load Availability (Still local for now, or move to DB later)
                const storedAvailability = await get(STORAGE_KEY_AVAILABILITY);
                setAvailability(storedAvailability || []);

            } catch (error) {
                console.error('Critical error loading data:', error);
                alert('載入資料發生錯誤，請檢查網路連線');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    // Auto-save removed. Data is saved on action.

    // --- Handlers ---

    const handleImportAvailability = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        // ... (existing code)
    };



    const handleGroupImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setLoading(true);
            const publicUrl = await uploadToSupabase(file, 'models');
            if (publicUrl) {
                setEditingGroupData(prev => ({ ...prev, thumbnail: publicUrl }));
            }
        } finally {
            setLoading(false);
        }
    };

    // --- Sub-Attributes Handlers ---
    const addAttribute = () => {
        if (!attributeInput.name.trim()) return;
        const newAttr: SubAttribute = {
            id: `attr_${Date.now()}`,
            name: attributeInput.name,
            type: attributeInput.type,
            options: []
        };
        setEditingGroupData(prev => ({
            ...prev,
            subAttributes: [...(prev.subAttributes || []), newAttr]
        }));
        setAttributeInput({ name: '', type: 'select' });
    };

    const removeAttribute = (attrId: string) => {
        setEditingGroupData(prev => ({
            ...prev,
            subAttributes: (prev.subAttributes || []).filter(a => a.id !== attrId)
        }));
    };

    const addAttributeOption = (attrId: string) => {
        if (!attributeOptionInput || !attributeOptionInput.name.trim()) return;

        const newOption: SubAttributeOption = {
            id: `opt_${Date.now()}`,
            name: attributeOptionInput.name,
            priceModifier: attributeOptionInput.price,
            image: attributeOptionInput.image
        };

        setEditingGroupData(prev => ({
            ...prev,
            subAttributes: (prev.subAttributes || []).map(a => {
                if (a.id === attrId) {
                    return { ...a, options: [...(a.options || []), newOption] };
                }
                return a;
            })
        }));
        setAttributeOptionInput(null);
    };

    const removeAttributeOption = (attrId: string, optionId: string) => {
        setEditingGroupData(prev => ({
            ...prev,
            subAttributes: (prev.subAttributes || []).map(a => {
                if (a.id === attrId) {
                    return { ...a, options: (a.options || []).filter(o => o.id !== optionId) };
                }
                return a;
            })
        }));
    };

    const handleSaveGroup = async () => {
        if (!editingGroupData.name) return alert('請輸入名稱');

        // Ensure uiConfig.step is set (default to 1)
        const uiConfig = {
            ...(editingGroupData.uiConfig || {}),
            step: editingGroupData.uiConfig?.step || 1
        };

        const groupToSave: OptionGroup = editingGroupData.id ? {
            ...groups.find(g => g.id === editingGroupData.id)!,
            ...editingGroupData,
            uiConfig
        } as OptionGroup : {
            id: `grp_${Date.now()}`,
            code: `code_${Date.now()}`,
            name: editingGroupData.name || '未命名',
            priceModifier: editingGroupData.priceModifier || 0,
            thumbnail: editingGroupData.thumbnail,
            subAttributes: editingGroupData.subAttributes,
            uiConfig: uiConfig
        };

        // Save to Supabase
        const { error } = await supabase.from('option_groups').upsert(toDbGroup(groupToSave));

        if (error) {
            console.error('Error saving group:', error);
            alert('儲存失敗: ' + error.message);
            return;
        }

        // Update Local State
        if (editingGroupData.id) {
            setGroups(prev => prev.map(g => g.id === groupToSave.id ? groupToSave : g));
        } else {
            setGroups(prev => [...prev, groupToSave]);
        }
        setIsEditingGroup(false);
        setEditingGroupData({});
    };

    const handleDuplicateGroup = async (id: string) => {
        if (!confirm('確定複製此規格大類？')) return;

        setLoading(true);
        try {
            // 1. Try RPC (Backend Logic)
            const { data, error } = await supabase.rpc('duplicate_option_group', { source_group_id: id });

            if (!error && data) {
                // RPC Success
                const newGroup = fromDbGroup(data);
                // Fetch new items
                const { data: newItemsData } = await supabase.from('option_items').select('*').eq('parent_id', newGroup.id);
                const newItems = (newItemsData || []).map(fromDbItem);

                setGroups(prev => [...prev, newGroup]);
                setItems(prev => [...prev, ...newItems]);
                alert('複製成功');
                return;
            }

            console.warn('RPC duplicate_option_group failed or not found, falling back to client-side logic.', error);

            // 2. Client-side Fallback
            const sourceGroup = groups.find(g => g.id === id);
            if (!sourceGroup) throw new Error('Source group not found');

            const newGroupId = `grp_${Date.now()}`;
            // Ensure deep copy of uiConfig & subAttributes
            const newUiConfig = JSON.parse(JSON.stringify(sourceGroup.uiConfig || {}));
            const newSubAttributes = JSON.parse(JSON.stringify(sourceGroup.subAttributes || []));

            const newGroup: OptionGroup = {
                ...sourceGroup,
                id: newGroupId,
                code: `${sourceGroup.code}_copy_${Date.now()}`,
                name: `${sourceGroup.name} (Copy)`,
                uiConfig: newUiConfig,
                subAttributes: newSubAttributes
            };

            const sourceItems = items.filter(i => i.parentId === id);
            const newItems = sourceItems.map((item, index) => ({
                ...item,
                id: `itm_${Date.now()}_${index}`,
                parentId: newGroupId
            }));

            // Insert Group
            const { error: gErr } = await supabase.from('option_groups').insert(toDbGroup(newGroup));
            if (gErr) throw gErr;

            // Insert Items
            if (newItems.length > 0) {
                const { error: iErr } = await supabase.from('option_items').insert(newItems.map(toDbItem));
                if (iErr) throw iErr;
            }

            setGroups(prev => [...prev, newGroup]);
            setItems(prev => [...prev, ...newItems]);
            alert('複製成功 (Client-side)');

        } catch (err: any) {
            console.error('Duplication failed:', err);
            alert('複製失敗: ' + (err.message || '未知錯誤'));
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteGroup = async (id: string) => {
        if (confirm('確定刪除此規格大類？底下的子選項也會被隱藏。')) {
            const { error } = await supabase.from('option_groups').delete().eq('id', id);
            if (error) {
                alert('刪除失敗');
                return;
            }

            setGroups(prev => prev.filter(g => g.id !== id));
            if (selectedGroupId === id) setSelectedGroupId(null);
            // Optional: Delete children too (DB Cascade handles it, but update UI)
            setItems(prev => prev.filter(i => i.parentId !== id));
        }
    };

    const handleSaveItem = async () => {
        if (!editingItemData.name || !selectedGroupId) return alert('請輸入名稱');

        const itemToSave: OptionItem = editingItemData.id ? {
            ...items.find(i => i.id === editingItemData.id)!,
            ...editingItemData
        } as OptionItem : {
            id: `itm_${Date.now()}`,
            parentId: selectedGroupId,
            name: editingItemData.name || '未命名',
            priceModifier: editingItemData.priceModifier || 0,
            colorHex: editingItemData.colorHex,
            imageUrl: editingItemData.imageUrl
        };

        // Save to Supabase
        const { error } = await supabase.from('option_items').upsert(toDbItem(itemToSave));

        if (error) {
            console.error('Error saving item:', error);
            alert('儲存失敗: ' + error.message);
            return;
        }

        if (editingItemData.id) {
            setItems(prev => prev.map(i => i.id === itemToSave.id ? itemToSave : i));
        } else {
            setItems(prev => [...prev, itemToSave]);
        }
        setIsEditingItem(false);
        setEditingItemData({});
    };

    const handleDeleteItem = async (id: string) => {
        if (confirm('確定刪除此選項？')) {
            const { error } = await supabase.from('option_items').delete().eq('id', id);
            if (error) {
                alert('刪除失敗');
                return;
            }
            setItems(prev => prev.filter(i => i.id !== id));
        }
    };

    // --- Components ---

    const TagInput = ({ tags, onChange }: { tags: string[], onChange: (tags: string[]) => void }) => {
        const [input, setInput] = useState('');

        const handleKeyDown = (e: React.KeyboardEvent) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const val = input.trim();
                if (val && !tags.includes(val)) {
                    onChange([...tags, val]);
                    setInput('');
                }
            }
        };

        const removeTag = (tagToRemove: string) => {
            onChange(tags.filter(t => t !== tagToRemove));
        };

        return (
            <div className="flex flex-wrap gap-2 p-2 border rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500">
                {tags.map(tag => (
                    <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-sm flex items-center gap-1">
                        {tag}
                        <button onClick={() => removeTag(tag)} className="hover:text-blue-900"><Trash2 className="w-3 h-3" /></button>
                    </span>
                ))}
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="輸入標籤按 Enter..."
                    className="flex-1 outline-none min-w-[120px] text-sm"
                />
            </div>
        );
    };

    // --- Render ---

    return (
        <div className="flex h-full bg-gray-50">
            {/* Left Column: Option Groups (Parents) */}
            <div className="w-1/3 border-r border-gray-200 bg-white flex flex-col">
                <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50">
                    <h2 className="font-bold text-gray-800 flex items-center gap-2">
                        <Settings className="w-5 h-5" />
                        規格大類 (Parent)
                    </h2>
                    <button
                        onClick={() => {
                            setEditingGroupData({});
                            setIsEditingGroup(true);
                        }}
                        className="p-2 bg-black text-white rounded-lg hover:bg-gray-800"
                    >
                        <Plus className="w-4 h-4" />
                    </button>

                    {/* Import Availability Button */}
                    <div className="relative">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 bg-green-600 text-white rounded-lg hover:bg-green-700 ml-2"
                            title="匯入配色對照表 (CSV)"
                        >
                            <FileSpreadsheet className="w-4 h-4" />
                        </button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".csv"
                            className="hidden"
                            onChange={handleImportAvailability}
                        />
                    </div>


                </div>

                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {/* Empty State */}
                    {groups.length === 0 && !loading && (
                        <div className="flex flex-col items-center justify-center py-10 text-gray-400">
                            <Settings className="w-12 h-12 mb-2 opacity-20" />
                            <p className="text-sm">目前沒有任何規格大類</p>
                            <p className="text-xs mt-1">請按上方 + 新增</p>
                        </div>
                    )}

                    {/* Sort groups by step order */}
                    {[...groups].sort((a, b) => (a.uiConfig?.step || 1) - (b.uiConfig?.step || 1)).map(group => (
                        <div
                            key={group.id}
                            onClick={() => setSelectedGroupId(group.id)}
                            className={`p-3 rounded-xl cursor-pointer border transition-all ${selectedGroupId === group.id ? 'bg-blue-50 border-blue-500 ring-1 ring-blue-500' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                        >
                            <div className="flex justify-between items-start mb-2">
                                <div className="flex items-center gap-2">
                                    {/* Step Indicator Badge */}
                                    <div className="flex flex-col items-center justify-center bg-gray-100 rounded px-2 py-1 min-w-[2.5rem]">
                                        <span className="text-[10px] text-gray-500 font-bold uppercase">Step</span>
                                        <span className="text-lg font-bold leading-none text-gray-800">{group.uiConfig?.step || 1}</span>
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-900">{group.name}</h3>
                                        {group.uiConfig?.displayType && (
                                            <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">
                                                {group.uiConfig.displayType === 'cards' ? '大卡片' :
                                                    group.uiConfig.displayType === 'grid' ? '網格' :
                                                        group.uiConfig.displayType === 'list' ? '列表' : '勾選框'}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingGroupData(group);
                                            setIsEditingGroup(true);
                                        }}
                                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                        title="編輯"
                                    >
                                        <Settings className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDuplicateGroup(group.id);
                                        }}
                                        className="p-1 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"
                                        title="複製"
                                    >
                                        <Copy className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteGroup(group.id);
                                        }}
                                        className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                                        title="刪除"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                            <div className="text-xs text-gray-500 flex justify-between ml-[3.25rem]">
                                <span>加價: +${group.priceModifier}</span>
                                <span className="flex items-center gap-1">
                                    {items.filter(i => i.parentId === group.id).length} 個子項 <ChevronRight className="w-3 h-3" />
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right Column: Option Items (Children) */}
            <div className="w-2/3 flex flex-col bg-gray-50/50">
                {selectedGroupId ? (
                    <>
                        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white">
                            <div>
                                <h2 className="font-bold text-gray-800 flex items-center gap-2">
                                    <Palette className="w-5 h-5" />
                                    顏色/子項 (Children)
                                </h2>
                                <p className="text-sm text-gray-500">
                                    所屬大類: <span className="font-bold">{groups.find(g => g.id === selectedGroupId)?.name}</span>
                                </p>
                            </div>
                            <button
                                onClick={() => {
                                    setEditingItemData({ parentId: selectedGroupId, colorHex: '#000000' });
                                    setIsEditingItem(true);
                                }}
                                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium"
                            >
                                <Plus className="w-4 h-4" />
                                新增選項
                            </button>
                        </div>

                        <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 overflow-y-auto">
                            {items.filter(i => i.parentId === selectedGroupId).map(item => (
                                <div key={item.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden group hover:shadow-md transition-shadow">
                                    <div className="aspect-square bg-gray-100 relative">
                                        {item.imageUrl ? (
                                            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center" style={{ backgroundColor: item.colorHex || '#eee' }}>
                                                {!item.colorHex && <ImageIcon className="w-8 h-8 text-gray-400" />}
                                            </div>
                                        )}
                                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => {
                                                    setEditingItemData(item);
                                                    setIsEditingItem(true);
                                                }}
                                                className="p-1.5 bg-white rounded shadow text-gray-600 hover:text-blue-600"
                                            >
                                                <Settings className="w-3 h-3" />
                                            </button>
                                            <button
                                                onClick={() => handleDeleteItem(item.id)}
                                                className="p-1.5 bg-white rounded shadow text-gray-600 hover:text-red-600"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="p-3">
                                        <div className="font-bold text-gray-900 truncate">{item.name}</div>
                                        <div className="text-sm text-gray-500">+${item.priceModifier}</div>
                                    </div>
                                </div>
                            ))}
                            {items.filter(i => i.parentId === selectedGroupId).length === 0 && (
                                <div className="col-span-full py-10 text-center text-gray-400 flex flex-col items-center">
                                    <Search className="w-8 h-8 mb-2 opacity-50" />
                                    <p>此類別尚無選項</p>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex items-center justify-center text-gray-400 flex-col gap-2">
                        <Settings className="w-12 h-12 opacity-20" />
                        <p>請從左側選擇一個規格大類</p>
                    </div>
                )}
            </div>

            {/* Modal: Edit Group */}
            {isEditingGroup && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-lg p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
                        <h3 className="text-xl font-bold sticky top-0 bg-white z-10 pb-2 border-b">{editingGroupData.id ? '編輯大類' : '新增規格大類'}</h3>

                        <div>
                            <label className="block text-sm font-bold mb-1">名稱</label>
                            <input
                                className="w-full border rounded-lg px-3 py-2"
                                value={editingGroupData.name || ''}
                                onChange={e => setEditingGroupData(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="例如: 惡魔防摔殼"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold mb-1">基礎加價</label>
                            <input
                                type="number"
                                className="w-full border rounded-lg px-3 py-2"
                                value={editingGroupData.priceModifier || 0}
                                onChange={e => setEditingGroupData(prev => ({ ...prev, priceModifier: Number(e.target.value) }))}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold mb-1">示意圖 (縮圖/結構圖)</label>
                            <div className="flex items-center gap-4">
                                <div className="w-20 h-20 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden relative group">
                                    {editingGroupData.thumbnail ? (
                                        <>
                                            <img src={editingGroupData.thumbnail} alt="Preview" className="w-full h-full object-contain" />
                                            <button
                                                onClick={() => setEditingGroupData(prev => ({ ...prev, thumbnail: undefined }))}
                                                className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                                            >
                                                <Trash2 className="w-5 h-5" />
                                            </button>
                                        </>
                                    ) : (
                                        <ImageIcon className="w-8 h-8 text-gray-300" />
                                    )}
                                </div>
                                <div className="flex-1">
                                    <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium">
                                        <Upload className="w-4 h-4" />
                                        上傳圖片
                                        <input type="file" accept="image/*" className="hidden" onChange={handleGroupImageUpload} />
                                    </label>
                                    <p className="text-xs text-gray-400 mt-2">支援 JPG, PNG, GIF</p>
                                </div>
                            </div>
                        </div>

                        {/* UI Config Section */}
                        <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                            <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                <Settings className="w-4 h-4" />
                                前台顯示設定 (Steps & UI)
                            </h4>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold mb-1 text-gray-600">步驟順序 (Step Index)</label>
                                    <input
                                        type="number"
                                        min="1"
                                        className="w-full border rounded-lg px-3 py-2 text-sm"
                                        value={editingGroupData.uiConfig?.step || 1}
                                        onChange={e => setEditingGroupData(prev => ({
                                            ...prev,
                                            uiConfig: { ...prev.uiConfig, step: Number(e.target.value) }
                                        }))}
                                        placeholder="1"
                                    />
                                    <p className="text-[10px] text-gray-400 mt-1">1=殼種選擇, 2=修復, 3=保護...</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold mb-1 text-gray-600">顯示樣式 (Display Type)</label>
                                    <select
                                        className="w-full border rounded-lg px-3 py-2 text-sm"
                                        value={editingGroupData.uiConfig?.displayType || 'cards'}
                                        onChange={e => setEditingGroupData(prev => ({
                                            ...prev,
                                            uiConfig: { ...prev.uiConfig, displayType: e.target.value as any }
                                        }))}
                                    >
                                        <option value="cards">大卡片 (適用殼種)</option>
                                        <option value="grid">網格 (適用顏色)</option>
                                        <option value="list">列表 (適用簡單選項)</option>
                                        <option value="checkbox">勾選框 (適用加購/修復)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold mb-1 text-gray-600">功能說明文字 (Description)</label>
                                <div className="bg-white">
                                    <ReactQuill
                                        theme="snow"
                                        value={editingGroupData.uiConfig?.description || ''}
                                        onChange={(value) => setEditingGroupData(prev => ({
                                            ...prev,
                                            uiConfig: { ...prev.uiConfig, description: value }
                                        }))}
                                        modules={QUILL_MODULES}
                                        placeholder="例如: 透過 AI 技術提升照片解析度... (支援 HTML 與連結)"
                                        className="h-40 mb-12" // Add margin bottom for toolbar/content space
                                    />
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1">支援 HTML 格式。可插入連結以導向詳細說明頁面。</p>
                            </div>

                            <div>
                                <label className="block text-xs font-bold mb-2 text-gray-600">說明圖片 (可上傳多張)</label>
                                <MultiImageUploader
                                    images={
                                        editingGroupData.uiConfig?.descriptionImages ||
                                        (editingGroupData.uiConfig?.descriptionImage ? [editingGroupData.uiConfig.descriptionImage] : [])
                                    }
                                    onChange={(newImages) => {
                                        setEditingGroupData(prev => ({
                                            ...prev,
                                            uiConfig: {
                                                ...prev.uiConfig,
                                                descriptionImages: newImages,
                                                descriptionImage: newImages.length > 0 ? newImages[0] : undefined // Sync for backward compatibility
                                            }
                                        }));
                                    }}
                                    maxFiles={10}
                                />
                            </div>
                        </div>

                        <div className="border-t border-gray-100 pt-4">
                            <label className="block text-sm font-bold mb-2 flex items-center gap-2">
                                <ListPlus className="w-4 h-4" />
                                自訂屬性 (Custom Attributes)
                            </label>
                            <p className="text-xs text-gray-500 mb-3">例如: 磁吸功能、鏡頭框顏色、按鍵顏色等。</p>

                            <div className="space-y-3 mb-3">
                                {(editingGroupData.subAttributes || []).map(attr => (
                                    <div key={attr.id} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                        <div className="flex justify-between items-center mb-2">
                                            <span className="font-bold text-sm text-gray-800">{attr.name} <span className="text-xs text-gray-500 font-normal">({attr.type === 'select' ? '選單' : '文字'})</span></span>
                                            <button onClick={() => removeAttribute(attr.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 className="w-3 h-3" /></button>
                                        </div>

                                        {attr.type === 'select' && (
                                            <div className="pl-2 border-l-2 border-gray-200 space-y-2">
                                                <div className="flex flex-wrap gap-2">
                                                    {(attr.options || []).map(opt => (
                                                        <span key={opt.id} className="text-xs bg-white border border-gray-200 px-2 py-1 rounded flex items-center gap-1">
                                                            {opt.image && <img src={opt.image} alt="" className="w-4 h-4 rounded object-cover border border-gray-100" />}
                                                            {opt.name} (+${opt.priceModifier})
                                                            <button onClick={() => removeAttributeOption(attr.id, opt.id)} className="text-gray-400 hover:text-red-500"><X className="w-3 h-3" /></button>
                                                        </span>
                                                    ))}
                                                </div>

                                                {/* Add Option Input */}
                                                <div className="flex gap-2 items-center">
                                                    <label className="cursor-pointer w-8 h-8 flex items-center justify-center border rounded bg-white hover:bg-gray-50 overflow-hidden relative shrink-0">
                                                        {attributeOptionInput?.attrId === attr.id && attributeOptionInput.image ? (
                                                            <img src={attributeOptionInput.image} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <ImageIcon className="w-4 h-4 text-gray-400" />
                                                        )}
                                                        <input
                                                            type="file"
                                                            accept="image/*"
                                                            className="hidden"
                                                            onChange={async (e) => {
                                                                const file = e.target.files?.[0];
                                                                if (!file) return;

                                                                const publicUrl = await uploadToSupabase(file, 'models');
                                                                if (publicUrl) {
                                                                    setAttributeOptionInput(prev =>
                                                                        prev?.attrId === attr.id
                                                                            ? { ...prev, image: publicUrl }
                                                                            : { attrId: attr.id, name: '', price: 0, image: publicUrl }
                                                                    );
                                                                }
                                                            }}
                                                        />
                                                    </label>
                                                    <input
                                                        placeholder="選項名稱"
                                                        className="border rounded px-2 py-1 text-xs w-24"
                                                        value={attributeOptionInput?.attrId === attr.id ? attributeOptionInput.name : ''}
                                                        onChange={e => setAttributeOptionInput(prev =>
                                                            prev?.attrId === attr.id
                                                                ? { ...prev, name: e.target.value }
                                                                : { attrId: attr.id, name: e.target.value, price: 0 }
                                                        )}
                                                    />
                                                    <input
                                                        type="number"
                                                        placeholder="加價"
                                                        className="border rounded px-2 py-1 text-xs w-16"
                                                        value={attributeOptionInput?.attrId === attr.id ? attributeOptionInput.price : 0}
                                                        onChange={e => setAttributeOptionInput(prev =>
                                                            prev?.attrId === attr.id
                                                                ? { ...prev, price: Number(e.target.value) }
                                                                : { attrId: attr.id, name: '', price: Number(e.target.value) }
                                                        )}
                                                    />
                                                    <button
                                                        onClick={() => addAttributeOption(attr.id)}
                                                        className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 shrink-0"
                                                    >
                                                        新增
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            <div className="flex gap-2 items-center bg-gray-50 p-2 rounded-lg">
                                <input
                                    placeholder="屬性名稱 (如: 磁吸)"
                                    className="border rounded px-2 py-1 text-sm flex-1"
                                    value={attributeInput.name}
                                    onChange={e => setAttributeInput(prev => ({ ...prev, name: e.target.value }))}
                                />
                                <select
                                    className="border rounded px-2 py-1 text-sm"
                                    value={attributeInput.type}
                                    onChange={e => setAttributeInput(prev => ({ ...prev, type: e.target.value as any }))}
                                >
                                    <option value="select">選單 (Select)</option>
                                    <option value="text">文字 (Text)</option>
                                </select>
                                <button
                                    onClick={addAttribute}
                                    className="text-sm bg-gray-800 text-white px-3 py-1 rounded hover:bg-black"
                                >
                                    新增屬性
                                </button>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4">
                            <button onClick={() => setIsEditingGroup(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
                            <button onClick={handleSaveGroup} className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800">保存</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Edit Group Sub-Attributes (New Modal or Embedded?) */}
            {/* Let's embed it in the Edit Group modal for now, or maybe too crowded? */}
            {/* Actually, let's append it to the Edit Group modal content above the buttons */}

            {/* ... Wait, I can't insert into the middle of previous block easily with search/replace. */}
            {/* I will replace the whole Edit Group Modal content to include the Attributes section */}

            {/* Modal: Edit Item */}
            {isEditingItem && (
                <div className="fixed inset-0 bg-black/50 z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl w-full max-w-md p-6 space-y-4 shadow-2xl">
                        <h3 className="text-xl font-bold">{editingItemData.id ? '編輯選項' : '新增子選項'}</h3>

                        <div>
                            <label className="block text-sm font-bold mb-1">名稱</label>
                            <input
                                className="w-full border rounded-lg px-3 py-2"
                                value={editingItemData.name || ''}
                                onChange={e => setEditingItemData(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="例如: 午夜黑"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold mb-1">加價金額</label>
                            <input
                                type="number"
                                className="w-full border rounded-lg px-3 py-2"
                                value={editingItemData.priceModifier || 0}
                                onChange={e => setEditingItemData(prev => ({ ...prev, priceModifier: Number(e.target.value) }))}
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-bold mb-1">代表色 (Color Hex)</label>
                            <div className="flex gap-2">
                                <input
                                    type="color"
                                    className="w-10 h-10 border rounded cursor-pointer"
                                    value={editingItemData.colorHex || '#000000'}
                                    onChange={e => setEditingItemData(prev => ({ ...prev, colorHex: e.target.value }))}
                                />
                                <input
                                    type="text"
                                    className="flex-1 border rounded-lg px-3 py-2 uppercase font-mono"
                                    value={editingItemData.colorHex || '#000000'}
                                    onChange={e => setEditingItemData(prev => ({ ...prev, colorHex: e.target.value }))}
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-bold mb-1">圖片連結 (可選)</label>
                            <div className="space-y-2">
                                <input
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                    value={editingItemData.imageUrl || ''}
                                    onChange={e => setEditingItemData(prev => ({ ...prev, imageUrl: e.target.value }))}
                                    placeholder="https://..."
                                />

                                <div className="flex items-center gap-4">
                                    <div className="w-20 h-20 bg-gray-100 rounded-lg border border-gray-200 flex items-center justify-center overflow-hidden relative group">
                                        {editingItemData.imageUrl ? (
                                            <>
                                                <img src={editingItemData.imageUrl} alt="Preview" className="w-full h-full object-contain" />
                                                <button
                                                    onClick={() => setEditingItemData(prev => ({ ...prev, imageUrl: undefined }))}
                                                    className="absolute inset-0 bg-black/50 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </>
                                        ) : (
                                            <ImageIcon className="w-8 h-8 text-gray-300" />
                                        )}
                                    </div>
                                    <div className="flex-1">
                                        <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium">
                                            <Upload className="w-4 h-4" />
                                            上傳圖片
                                            <input
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={async (e) => {
                                                    const file = e.target.files?.[0];
                                                    if (!file) return;

                                                    const publicUrl = await uploadToSupabase(file, 'models');
                                                    if (publicUrl) {
                                                        setEditingItemData(prev => ({ ...prev, imageUrl: publicUrl }));
                                                    }
                                                }}
                                            />
                                        </label>
                                        <p className="text-xs text-gray-400 mt-2">支援 JPG, PNG, GIF</p>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-4">
                            <button onClick={() => setIsEditingItem(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">取消</button>
                            <button onClick={handleSaveItem} className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800">保存</button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
