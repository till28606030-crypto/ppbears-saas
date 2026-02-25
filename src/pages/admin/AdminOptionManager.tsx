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
    Copy,
    Edit2,
    GripVertical,
    Check,
    Move,
    Loader2
} from 'lucide-react';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
import MediaSelectorModal from '../../components/admin/MediaSelectorModal';
import { supabase } from '../../lib/supabase';
import { toDbGroup, fromDbGroup, toDbItem, fromDbItem } from '../../utils/dbMappers';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

// --- Types ---
// Moved to src/types.ts

const QUILL_MODULES = {
    toolbar: [
        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
        [{ 'size': ['small', false, 'large', 'huge'] }],
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
    const [isCopying, setIsCopying] = useState<string | null>(null);
    const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
    const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
    const [attributeOptionInput, setAttributeOptionInput] = useState<{ attrId: string, name: string, price: number, image?: string } | null>(null);
    const [editingAttributeOption, setEditingAttributeOption] = useState<{ attrId: string, optionId: string, name: string, price: number, image?: string } | null>(null);

    const [isEditingItem, setIsEditingItem] = useState(false);
    const [editingItemData, setEditingItemData] = useState<Partial<OptionItem>>({});

    // Media Modal State
    const [mediaModalConfig, setMediaModalConfig] = useState<{
        isOpen: boolean;
        bucket: 'models' | 'assets' | 'designs';
        onSelect: (url: string) => void;
        onSelectMultiple?: (urls: string[]) => void;
        isMultiple?: boolean;
        existingUrls?: string[];
    }>({ isOpen: false, bucket: 'models', onSelect: () => { } });

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

    const updateAttributeOption = (attrId: string, optionId: string, updates: Partial<SubAttributeOption>) => {
        setEditingGroupData(prev => ({
            ...prev,
            subAttributes: (prev.subAttributes || []).map(a => {
                if (a.id === attrId) {
                    return {
                        ...a,
                        options: (a.options || []).map(o =>
                            o.id === optionId ? { ...o, ...updates } : o
                        )
                    };
                }
                return a;
            })
        }));
        setEditingAttributeOption(null);
    };

    const updateAttributeName = (attrId: string, newName: string) => {
        setEditingGroupData(prev => ({
            ...prev,
            subAttributes: (prev.subAttributes || []).map(a =>
                a.id === attrId ? { ...a, name: newName } : a
            )
        }));
    };

    const handleAttributeOptionDragEnd = (attrId: string, event: DragEndEvent) => {
        const { active, over } = event;

        if (!over || active.id === over.id) return;

        setEditingGroupData(prev => ({
            ...prev,
            subAttributes: (prev.subAttributes || []).map(a => {
                if (a.id === attrId) {
                    const options = a.options || [];
                    const oldIndex = options.findIndex(o => o.id === active.id);
                    const newIndex = options.findIndex(o => o.id === over.id);

                    return {
                        ...a,
                        options: arrayMove(options, oldIndex, newIndex)
                    };
                }
                return a;
            })
        }));
    };

    const handleSaveGroup = async () => {
        // If there's an active attribute option being edited, commit it first
        if (editingAttributeOption) {
            const { attrId, optionId, name, price, image } = editingAttributeOption;
            // We manually update the data here to ensure it's included in the save payload
            const updatedSubAttributes = (editingGroupData.subAttributes || []).map(a => {
                if (a.id === attrId) {
                    return {
                        ...a,
                        options: (a.options || []).map(o =>
                            o.id === optionId ? { ...o, name, priceModifier: price, image } : o
                        )
                    };
                }
                return a;
            });
            editingGroupData.subAttributes = updatedSubAttributes;
            setEditingAttributeOption(null);
        }

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
        let error;
        const dbPayload = toDbGroup(groupToSave);
        if (editingGroupData.id) {
            const { error: updateError } = await supabase.from('option_groups').update(dbPayload).eq('id', groupToSave.id);
            error = updateError;
        } else {
            const { error: insertError } = await supabase.from('option_groups').insert(dbPayload);
            error = insertError;
        }

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
        setIsCopying(id);
        setLoading(true);
        try {
            // Client-side duplication (Primary for now as RPC is unreliable)
            const sourceGroup = groups.find(g => g.id === id);
            if (!sourceGroup) throw new Error('Source group not found');

            const newGroupId = `grp_${Date.now()}`;
            // Deep copy objects
            const newUiConfig = JSON.parse(JSON.stringify(sourceGroup.uiConfig || {}));
            const newSubAttributes = JSON.parse(JSON.stringify(sourceGroup.subAttributes || []));

            const newGroup: OptionGroup = {
                ...sourceGroup,
                id: newGroupId,
                code: `code_${Date.now()}`, // Generate new code
                name: `${sourceGroup.name} (副本)`,
                uiConfig: newUiConfig,
                subAttributes: newSubAttributes
            };

            const sourceItems = items.filter(i => i.parentId === id);
            const newItems = sourceItems.map((item, index) => ({
                ...item,
                id: `itm_${Date.now()}_${index}`,
                parentId: newGroupId
            }));

            // 1. Insert Group
            const { error: gErr } = await supabase.from('option_groups').insert(toDbGroup(newGroup));
            if (gErr) throw gErr;

            // 2. Insert Items
            if (newItems.length > 0) {
                const { error: iErr } = await supabase.from('option_items').insert(newItems.map(toDbItem));
                if (iErr) throw iErr;
            }

            setGroups(prev => [...prev, newGroup]);
            setItems(prev => [...prev, ...newItems]);
            alert('複製成功');

        } catch (err: any) {
            console.error('Duplication failed:', err);
            alert('複製失敗: ' + (err.message || '未知錯誤'));
        } finally {
            setIsCopying(null);
            setLoading(false);
        }
    };

    const handleDeleteGroup = async (id: string) => {
        setDeletingGroupId(id);
        try {
            const { error } = await supabase.from('option_groups').delete().eq('id', id);
            if (error) {
                alert('刪除失敗: ' + error.message);
                return;
            }

            setGroups(prev => prev.filter(g => g.id !== id));
            if (selectedGroupId === id) setSelectedGroupId(null);
            setItems(prev => prev.filter(i => i.parentId !== id));
        } catch (err: any) {
            console.error('Delete failed:', err);
            alert('刪除發生錯誤');
        } finally {
            setDeletingGroupId(null);
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
        let error;
        const dbPayload = toDbItem(itemToSave);
        if (editingItemData.id) {
            const { error: updateError } = await supabase.from('option_items').update(dbPayload).eq('id', itemToSave.id);
            error = updateError;
        } else {
            const { error: insertError } = await supabase.from('option_items').insert(dbPayload);
            error = insertError;
        }

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
        setDeletingItemId(id);
        try {
            const { error } = await supabase.from('option_items').delete().eq('id', id);
            if (error) {
                alert('刪除失敗: ' + error.message);
                return;
            }
            setItems(prev => prev.filter(i => i.id !== id));
        } catch (err: any) {
            console.error('Delete item failed:', err);
            alert('刪除發生錯誤');
        } finally {
            setDeletingItemId(null);
        }
    };

    // --- Components ---

    const SortableOptionTag: React.FC<{
        option: SubAttributeOption;
        attrId: string;
        isEditing: boolean;
        onEdit: () => void;
        onSave: (updates: Partial<SubAttributeOption>) => void;
        onCancel: () => void;
        onDelete: () => void;
        editingData: { attrId: string, optionId: string, name: string, price: number, image?: string } | null;
        onEditingDataChange: (data: any) => void;
    }> = ({ option, attrId, isEditing, onEdit, onSave, onCancel, onDelete, editingData, onEditingDataChange }) => {
        const {
            attributes,
            listeners,
            setNodeRef,
            transform,
            transition,
            isDragging
        } = useSortable({ id: option.id });

        const style = {
            transform: CSS.Transform.toString(transform),
            transition,
            opacity: isDragging ? 0.5 : 1
        };

        if (isEditing && editingData) {
            return (
                <div
                    ref={setNodeRef}
                    style={style}
                    className="text-xs bg-blue-50 border border-blue-300 px-2 py-1 rounded flex items-center gap-1"
                >
                    <div
                        onClick={() => {
                            setMediaModalConfig({
                                isOpen: true,
                                bucket: 'models',
                                isMultiple: false,
                                onSelect: (url) => {
                                    if (editingData) {
                                        onEditingDataChange({ ...editingData, image: url });
                                    }
                                    setMediaModalConfig(prev => ({ ...prev, isOpen: false }));
                                }
                            });
                        }}
                        className="cursor-pointer w-5 h-5 flex items-center justify-center border rounded bg-white hover:bg-gray-50 overflow-hidden shrink-0"
                        title="點擊選擇圖片"
                    >
                        {editingData.image ? (
                            <img src={editingData.image} className="w-full h-full object-cover" alt="" />
                        ) : (
                            <ImageIcon className="w-3 h-3 text-gray-400" />
                        )}
                    </div>
                    <button
                        onClick={() => {
                            setMediaModalConfig({
                                isOpen: true,
                                bucket: 'models',
                                isMultiple: false,
                                onSelect: (url) => {
                                    if (editingData) {
                                        onEditingDataChange({ ...editingData, image: url });
                                    }
                                    setMediaModalConfig(prev => ({ ...prev, isOpen: false }));
                                }
                            });
                        }}
                        className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded"
                    >
                        選圖
                    </button>
                    <input
                        value={editingData.name}
                        onChange={(e) => onEditingDataChange({ ...editingData, name: e.target.value })}
                        className="border rounded px-1 py-0.5 text-xs w-20"
                        placeholder="名稱"
                    />
                    <input
                        type="number"
                        value={editingData.price}
                        onChange={(e) => onEditingDataChange({ ...editingData, price: Number(e.target.value) })}
                        className="border rounded px-1 py-0.5 text-xs w-12"
                        placeholder="$"
                    />
                    <button
                        onClick={() => onSave({ name: editingData.name, priceModifier: editingData.price, image: editingData.image })}
                        className="text-green-600 hover:bg-green-100 p-0.5 rounded"
                        title="保存"
                    >
                        <Check className="w-3 h-3" />
                    </button>
                    <button
                        onClick={onCancel}
                        className="text-gray-400 hover:bg-gray-100 p-0.5 rounded"
                        title="取消"
                    >
                        <X className="w-3 h-3" />
                    </button>
                </div>
            );
        }

        return (
            <div
                ref={setNodeRef}
                style={style}
                className="text-xs bg-white border border-gray-200 px-2 py-1 rounded flex items-center gap-1 group"
            >
                <div {...attributes} {...listeners} className="cursor-move text-gray-400 hover:text-gray-600">
                    <GripVertical className="w-3 h-3" />
                </div>
                {option.image && <img src={option.image} alt="" className="w-4 h-4 rounded object-cover border border-gray-100" />}
                <span>{option.name} (+${option.priceModifier})</span>
                <button
                    onClick={onEdit}
                    className="text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="編輯"
                >
                    <Edit2 className="w-3 h-3" />
                </button>
                <button
                    onClick={onDelete}
                    className="text-gray-400 hover:text-red-500"
                    title="刪除"
                >
                    <X className="w-3 h-3" />
                </button>
            </div>
        );
    };

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
                                    {group.thumbnail && (
                                        <div className="w-10 h-10 rounded shrink-0 border border-gray-200 overflow-hidden bg-white flex items-center justify-center">
                                            <img src={group.thumbnail} alt={group.name} className="w-full h-full object-cover" />
                                        </div>
                                    )}
                                    <div>
                                        <h3 className="font-bold text-gray-900">{group.name}</h3>
                                        <div className="flex flex-wrap gap-1 mt-0.5">
                                            {group.uiConfig?.displayType && (
                                                <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100">
                                                    {group.uiConfig.displayType === 'cards' ? '大卡片' :
                                                        group.uiConfig.displayType === 'grid' ? '網格' :
                                                            group.uiConfig.displayType === 'list' ? '列表' : '勾選框'}
                                                </span>
                                            )}
                                            {group.uiConfig?.category && (
                                                <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200">
                                                    📁 {group.uiConfig.category}
                                                </span>
                                            )}
                                        </div>
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
                                        disabled={isCopying !== null}
                                        className={`p-1 rounded transition-colors ${isCopying === group.id ? 'bg-green-100 text-green-600' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}
                                        title="複製"
                                    >
                                        {isCopying === group.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Copy className="w-4 h-4" />
                                        )}
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteGroup(group.id);
                                        }}
                                        disabled={deletingGroupId !== null}
                                        className={`p-1 rounded transition-colors ${deletingGroupId === group.id ? 'bg-red-100 text-red-600' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`}
                                        title="刪除"
                                    >
                                        {deletingGroupId === group.id ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Trash2 className="w-4 h-4" />
                                        )}
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
                                                disabled={deletingItemId !== null}
                                                className="p-1.5 bg-white rounded shadow text-gray-600 hover:text-red-600 disabled:opacity-50"
                                            >
                                                {deletingItemId === item.id ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <Trash2 className="w-3 h-3" />
                                                )}
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
                                    <button
                                        onClick={() => setMediaModalConfig({
                                            isOpen: true,
                                            bucket: 'models',
                                            onSelect: (url) => {
                                                setEditingGroupData(prev => ({ ...prev, thumbnail: url }));
                                                setMediaModalConfig(prev => ({ ...prev, isOpen: false }));
                                            }
                                        })}
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium"
                                    >
                                        <ImageIcon className="w-4 h-4" />
                                        從媒體庫選圖
                                    </button>
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
                                        <option value="ai_recognition">圖片辨識 (AI 自動填入)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold mb-1 text-gray-600">分類標籤 (Category)</label>
                                <input
                                    type="text"
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                    value={editingGroupData.uiConfig?.category || ''}
                                    onChange={e => setEditingGroupData(prev => ({
                                        ...prev,
                                        uiConfig: { ...prev.uiConfig, category: e.target.value }
                                    }))}
                                    placeholder="例如: 防摔殼系列、透明殼…（空白=不分類）"
                                />
                                <p className="text-[10px] text-gray-400 mt-1">同 Step 內相同分類的商品，在前台購物車會被收合在同一個折疊群組中。</p>
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
                                    onMediaLibraryClick={() => {
                                        const currentImages = editingGroupData.uiConfig?.descriptionImages ||
                                            (editingGroupData.uiConfig?.descriptionImage ? [editingGroupData.uiConfig.descriptionImage] : []);

                                        setMediaModalConfig({
                                            isOpen: true,
                                            bucket: 'models',
                                            isMultiple: true,
                                            existingUrls: currentImages,
                                            onSelect: () => { }, // Single select not used here
                                            onSelectMultiple: (urls) => {
                                                // Duplicate prevention: only add URLs that aren't already in descriptionImages
                                                const uniqueNewUrls = urls.filter(url => !currentImages.includes(url));
                                                const newImages = [...currentImages, ...uniqueNewUrls];

                                                setEditingGroupData(prev => ({
                                                    ...prev,
                                                    uiConfig: {
                                                        ...prev.uiConfig,
                                                        descriptionImages: newImages,
                                                        descriptionImage: newImages[0]
                                                    }
                                                }));
                                                setMediaModalConfig(prev => ({ ...prev, isOpen: false }));
                                            }
                                        });
                                    }}
                                />
                            </div>
                        </div>

                        <div className="border-t border-gray-100 pt-4">
                            <label className="block text-sm font-bold mb-2 flex items-center gap-2">
                                <ListPlus className="w-4 h-4" />
                                選項 (Options)
                            </label>
                            <p className="text-xs text-gray-500 mb-3">例如: 磁吸功能、鏡頭框顏色、按鍵顏色等。</p>

                            <div className="space-y-3 mb-3">
                                {(editingGroupData.subAttributes || []).map(attr => (
                                    <div key={attr.id} className="bg-gray-50 p-3 rounded-lg border border-gray-200">
                                        <div className="flex justify-between items-center mb-2">
                                            <div className="flex items-center gap-2 flex-1">
                                                <input
                                                    className="font-bold text-sm text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-purple-500 focus:bg-white px-1 py-0.5 outline-none transition-all w-full max-w-[200px]"
                                                    value={attr.name}
                                                    onChange={(e) => updateAttributeName(attr.id, e.target.value)}
                                                    placeholder="屬性名稱"
                                                />
                                                <span className="text-xs text-gray-500 font-normal shrink-0">({attr.type === 'select' ? '選單' : '文字'})</span>
                                            </div>
                                            <button onClick={() => removeAttribute(attr.id)} className="text-red-500 hover:bg-red-50 p-1 rounded"><Trash2 className="w-3 h-3" /></button>
                                        </div>

                                        {attr.type === 'select' && (
                                            <div className="pl-2 border-l-2 border-gray-200 space-y-2">
                                                <DndContext
                                                    collisionDetection={closestCenter}
                                                    onDragEnd={(event) => handleAttributeOptionDragEnd(attr.id, event)}
                                                >
                                                    <SortableContext
                                                        items={(attr.options || []).map(o => o.id)}
                                                        strategy={verticalListSortingStrategy}
                                                    >
                                                        <div className="flex flex-wrap gap-2">
                                                            {(attr.options || []).map(opt => {
                                                                const isEditing = editingAttributeOption?.attrId === attr.id && editingAttributeOption?.optionId === opt.id;

                                                                return (
                                                                    <SortableOptionTag
                                                                        key={opt.id}
                                                                        option={opt}
                                                                        attrId={attr.id}
                                                                        isEditing={isEditing}
                                                                        onEdit={() => setEditingAttributeOption({
                                                                            attrId: attr.id,
                                                                            optionId: opt.id,
                                                                            name: opt.name,
                                                                            price: opt.priceModifier,
                                                                            image: opt.image
                                                                        })}
                                                                        onSave={(updates) => updateAttributeOption(attr.id, opt.id, updates)}
                                                                        onCancel={() => setEditingAttributeOption(null)}
                                                                        onDelete={() => removeAttributeOption(attr.id, opt.id)}
                                                                        editingData={isEditing ? editingAttributeOption : null}
                                                                        onEditingDataChange={setEditingAttributeOption}
                                                                    />
                                                                );
                                                            })}
                                                        </div>
                                                    </SortableContext>
                                                </DndContext>

                                                {/* Add Option Input */}
                                                <div className="flex gap-2 items-center">
                                                    <div
                                                        onClick={() => {
                                                            setMediaModalConfig({
                                                                isOpen: true,
                                                                bucket: 'models',
                                                                isMultiple: false,
                                                                onSelect: (url) => {
                                                                    setAttributeOptionInput(prev =>
                                                                        prev?.attrId === attr.id
                                                                            ? { ...prev, image: url }
                                                                            : { attrId: attr.id, name: '', price: 0, image: url }
                                                                    );
                                                                    setMediaModalConfig(prev => ({ ...prev, isOpen: false }));
                                                                }
                                                            });
                                                        }}
                                                        className="cursor-pointer w-8 h-8 flex items-center justify-center border rounded bg-white hover:bg-gray-50 overflow-hidden shrink-0"
                                                        title="點擊媒體庫選圖"
                                                    >
                                                        {attributeOptionInput?.attrId === attr.id && attributeOptionInput.image ? (
                                                            <img src={attributeOptionInput.image} className="w-full h-full object-cover" />
                                                        ) : (
                                                            <ImageIcon className="w-4 h-4 text-gray-400" />
                                                        )}
                                                    </div>
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
                                    <button
                                        onClick={() => setMediaModalConfig({
                                            isOpen: true,
                                            bucket: 'models',
                                            onSelect: (url) => {
                                                setEditingItemData(prev => ({ ...prev, imageUrl: url }));
                                                setMediaModalConfig(prev => ({ ...prev, isOpen: false }));
                                            }
                                        })}
                                        className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition-colors text-sm font-medium"
                                    >
                                        <ImageIcon className="w-4 h-4" />
                                        從媒體庫選圖
                                    </button>
                                    <p className="text-xs text-gray-400 mt-2">支援 JPG, PNG, GIF</p>
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

            {/* Media Selector Modal */}
            <MediaSelectorModal
                isOpen={mediaModalConfig.isOpen}
                onClose={() => setMediaModalConfig(prev => ({ ...prev, isOpen: false }))}
                onSelect={mediaModalConfig.onSelect}
                onSelectMultiple={mediaModalConfig.onSelectMultiple}
                isMultiple={mediaModalConfig.isMultiple}
                existingUrls={mediaModalConfig.existingUrls}
                defaultBucket={mediaModalConfig.bucket}
            />
        </div>
    );
}
