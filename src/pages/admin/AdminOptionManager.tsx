import React, { useState, useEffect, useRef } from 'react';
import {
    Plus,
    Trash2,
    Save,
    ChevronRight,
    ChevronDown,
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
    const [descriptionMode, setDescriptionMode] = useState<'visual' | 'code'>('visual');

    // Sub-Attributes Editor State
    const [attributeInput, setAttributeInput] = useState<{ name: string, type: 'select' | 'text' }>({ name: '', type: 'select' });
    const [isCopying, setIsCopying] = useState<string | null>(null);
    const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
    const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
    const [attributeOptionInput, setAttributeOptionInput] = useState<{ attrId: string, name: string, price: number, image?: string } | null>(null);
    const [editingAttributeOption, setEditingAttributeOption] = useState<{ attrId: string, optionId: string, name: string, price: number, image?: string } | null>(null);
    const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
    // Right panel tab state (items | suboptions)
    const [rightPanelTab, setRightPanelTab] = useState<'items' | 'suboptions'>('items');
    // State for inline suboptions editing in right panel
    const [panelAttrInput, setPanelAttrInput] = useState<{ name: string; type: 'select' | 'text' }>({ name: '', type: 'select' });
    const [panelAttrOptionInput, setPanelAttrOptionInput] = useState<{ attrId: string; name: string; price: number; image?: string } | null>(null);
    const [panelEditingAttrOption, setPanelEditingAttrOption] = useState<{ attrId: string; optionId: string; name: string; price: number; image?: string } | null>(null);
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

        // 檢查重複名稱
        const currentAttr = (editingGroupData.subAttributes || []).find(a => a.id === attrId);
        const newNameClean = newOption.name.trim().toLowerCase();
        if (currentAttr?.options?.some(o => o.name.trim().toLowerCase() === newNameClean)) {
            window.alert(`新增失敗：此屬性下已存在名為「${newOption.name.trim()}」的選項。`);
            return;
        }

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
        if (updates.name) {
            const currentAttr = (editingGroupData.subAttributes || []).find(a => a.id === attrId);
            const newNameClean = updates.name.trim().toLowerCase();
            if (currentAttr?.options?.some(o => o.id !== optionId && o.name.trim().toLowerCase() === newNameClean)) {
                window.alert(`儲存失敗：此屬性下已存在名為「${updates.name.trim()}」的選項。`);
                return;
            }
        }

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

    // --- Panel SubAttributes Handlers (direct save to Supabase) ---
    const getPanelGroup = () => groups.find(g => g.id === selectedGroupId) || null;

    const panelAddAttribute = async () => {
        if (!panelAttrInput.name.trim() || !selectedGroupId) return;
        const group = getPanelGroup();
        if (!group) return;
        const newAttr: SubAttribute = {
            id: `attr_${Date.now()}`,
            name: panelAttrInput.name,
            type: panelAttrInput.type,
            options: []
        };
        const updated = { ...group, subAttributes: [...(group.subAttributes || []), newAttr] };
        const { error } = await supabase.from('option_groups').update(toDbGroup(updated)).eq('id', group.id);
        if (error) { alert('儲存失敗: ' + error.message); return; }
        setGroups(prev => prev.map(g => g.id === group.id ? updated : g));
        setPanelAttrInput({ name: '', type: 'select' });
    };

    const panelRemoveAttribute = async (attrId: string) => {
        const group = getPanelGroup();
        if (!group) return;
        const updated = { ...group, subAttributes: (group.subAttributes || []).filter(a => a.id !== attrId) };
        const { error } = await supabase.from('option_groups').update(toDbGroup(updated)).eq('id', group.id);
        if (error) { alert('儲存失敗: ' + error.message); return; }
        setGroups(prev => prev.map(g => g.id === group.id ? updated : g));
    };

    const panelUpdateAttrName = async (attrId: string, newName: string) => {
        const group = getPanelGroup();
        if (!group) return;
        const updated = {
            ...group,
            subAttributes: (group.subAttributes || []).map(a => a.id === attrId ? { ...a, name: newName } : a)
        };
        setGroups(prev => prev.map(g => g.id === group.id ? updated : g)); // Optimistic update
        // Save debounced? For simplicity, save immediately:
        await supabase.from('option_groups').update(toDbGroup(updated)).eq('id', group.id);
    };

    const panelAddAttrOption = async (attrId: string) => {
        if (!panelAttrOptionInput || !panelAttrOptionInput.name.trim()) return;
        const group = getPanelGroup();
        if (!group) return;
        const newOption: SubAttributeOption = {
            id: `opt_${Date.now()}`,
            name: panelAttrOptionInput.name,
            priceModifier: panelAttrOptionInput.price,
            image: panelAttrOptionInput.image
        };

        // 檢查重複名稱
        const currentAttr = group.subAttributes?.find(a => a.id === attrId);
        const newNameClean = newOption.name.trim().toLowerCase();
        if (currentAttr?.options?.some(o => o.name.trim().toLowerCase() === newNameClean)) {
            window.alert(`新增失敗：此屬性下已存在名為「${newOption.name.trim()}」的選項。`);
            return;
        }
        const updated = {
            ...group,
            subAttributes: (group.subAttributes || []).map(a =>
                a.id === attrId ? { ...a, options: [...(a.options || []), newOption] } : a
            )
        };
        const { error } = await supabase.from('option_groups').update(toDbGroup(updated)).eq('id', group.id);
        if (error) { alert('儲存失敗: ' + error.message); return; }
        setGroups(prev => prev.map(g => g.id === group.id ? updated : g));
        setPanelAttrOptionInput(null);
    };

    const panelRemoveAttrOption = async (attrId: string, optionId: string) => {
        const group = getPanelGroup();
        if (!group) return;
        const updated = {
            ...group,
            subAttributes: (group.subAttributes || []).map(a =>
                a.id === attrId ? { ...a, options: (a.options || []).filter(o => o.id !== optionId) } : a
            )
        };
        const { error } = await supabase.from('option_groups').update(toDbGroup(updated)).eq('id', group.id);
        if (error) { alert('儲存失敗: ' + error.message); return; }
        setGroups(prev => prev.map(g => g.id === group.id ? updated : g));
    };

    const panelSaveAttrOption = async (attrId: string, optionId: string, updates: Partial<SubAttributeOption>) => {
        const group = getPanelGroup();
        if (!group) return;
        const currentAttr = group.subAttributes?.find(a => a.id === attrId);
        if (updates.name) {
            const newNameClean = updates.name.trim().toLowerCase();
            const isDuplicate = currentAttr?.options?.some(o =>
                o.id !== optionId && o.name.trim().toLowerCase() === newNameClean
            );
            if (isDuplicate) {
                window.alert(`儲存失敗：此屬性下已存在名為「${updates.name.trim()}」的選項。`);
                return;
            }
        }

        const updated = {
            ...group,
            subAttributes: (group.subAttributes || []).map(a =>
                a.id === attrId
                    ? { ...a, options: (a.options || []).map(o => o.id === optionId ? { ...o, ...updates } : o) }
                    : a
            )
        };
        const { error } = await supabase.from('option_groups').update(toDbGroup(updated)).eq('id', group.id);
        if (error) { alert('儲存失敗: ' + error.message); return; }
        setGroups(prev => prev.map(g => g.id === group.id ? updated : g));
        setPanelEditingAttrOption(null);
    };

    const panelAttrOptionDragEnd = async (attrId: string, event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const group = getPanelGroup();
        if (!group) return;
        const updated = {
            ...group,
            subAttributes: (group.subAttributes || []).map(a => {
                if (a.id === attrId) {
                    const opts = a.options || [];
                    const oldIdx = opts.findIndex(o => o.id === active.id);
                    const newIdx = opts.findIndex(o => o.id === over.id);
                    return { ...a, options: arrayMove(opts, oldIdx, newIdx) };
                }
                return a;
            })
        };
        setGroups(prev => prev.map(g => g.id === group.id ? updated : g));
        await supabase.from('option_groups').update(toDbGroup(updated)).eq('id', group.id);
    };

    const handleGroupDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const activeGroup = groups.find(g => g.id === active.id);
        const overGroup = groups.find(g => g.id === over.id);
        if (!activeGroup || !overGroup) return;

        const activeCat = activeGroup.uiConfig?.category || '未分類';
        const overCat = overGroup.uiConfig?.category || '未分類';

        if (activeCat !== overCat) {
            alert('目前僅支援在同一個分類標籤內進行排序');
            return;
        }

        let categoryGroups = groups.filter(g => (g.uiConfig?.category || '未分類') === activeCat)
            .sort((a, b) => {
                if (a.uiConfig?.step !== b.uiConfig?.step) return (a.uiConfig?.step || 1) - (b.uiConfig?.step || 1);
                return (a.uiConfig?.sortOrder || 0) - (b.uiConfig?.sortOrder || 0);
            });

        const oldIndex = categoryGroups.findIndex(g => g.id === active.id);
        const newIndex = categoryGroups.findIndex(g => g.id === over.id);

        categoryGroups = arrayMove(categoryGroups, oldIndex, newIndex);

        const updates = categoryGroups.map((g, index) => ({
            ...g,
            uiConfig: { ...g.uiConfig, sortOrder: index }
        }));

        setGroups(prev => prev.map(g => {
            const updated = updates.find(u => u.id === g.id);
            return updated ? updated : g;
        }));

        for (const finalG of updates) {
            await supabase.from('option_groups').update(toDbGroup(finalG)).eq('id', finalG.id);
        }
    };

    const handleCategoryDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        // Require it to be a category drag
        if (!over || active.id === over.id || !String(active.id).startsWith('cat-') || !String(over.id).startsWith('cat-')) return;

        const activeCatName = String(active.id).replace('cat-', '');
        const overCatName = String(over.id).replace('cat-', '');

        // Recalculate sortedCategories (Current state)
        const currentGroupedOptions = groups.reduce((acc, current) => {
            const cat = current.uiConfig?.category || '未分類';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(current);
            return acc;
        }, {} as Record<string, OptionGroup[]>);

        let currentSortedCats = Object.keys(currentGroupedOptions).sort((a, b) => {
            const orderA = currentGroupedOptions[a][0]?.uiConfig?.categorySortOrder ?? 999;
            const orderB = currentGroupedOptions[b][0]?.uiConfig?.categorySortOrder ?? 999;
            if (orderA !== orderB) return orderA - orderB;
            if (a === '未分類') return 1;
            if (b === '未分類') return -1;
            return a.localeCompare(b);
        });

        const oldIndex = currentSortedCats.indexOf(activeCatName);
        const newIndex = currentSortedCats.indexOf(overCatName);

        if (oldIndex !== -1 && newIndex !== -1) {
            const newCategoriesOrder = arrayMove(currentSortedCats, oldIndex, newIndex);

            const updates: OptionGroup[] = [];

            const newGroups = groups.map(g => {
                const cat = g.uiConfig?.category || '未分類';
                const catIndex = newCategoriesOrder.indexOf(cat);
                if (catIndex !== -1 && g.uiConfig?.categorySortOrder !== catIndex) {
                    const updated = { ...g, uiConfig: { ...g.uiConfig, categorySortOrder: catIndex } };
                    updates.push(updated);
                    return updated;
                }
                return g;
            });

            setGroups(newGroups);

            for (const u of updates) {
                await supabase.from('option_groups').update(toDbGroup(u)).eq('id', u.id);
            }
        }
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

        // 檢查重複名稱 (強化版：去空格、不分大小寫)
        const newNameClean = (itemToSave.name || '').trim().toLowerCase();
        const isDuplicate = items.some(i => {
            const matchParent = i.parentId === selectedGroupId;
            const matchName = i.name.trim().toLowerCase() === newNameClean;
            const notSelf = i.id !== itemToSave.id;
            return matchParent && matchName && notSelf;
        });

        console.log('[Duplicate Check] Item:', itemToSave.name, 'isDuplicate:', isDuplicate);

        if (isDuplicate) {
            window.alert(`儲存失敗：此大類下已存在名為「${itemToSave.name.trim()}」的子項，請使用不同的名稱。`);
            return;
        }

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

    const getStepColorClass = (step: number) => {
        switch (step) {
            case 1: return 'bg-blue-100 text-blue-800 border-blue-200';
            case 2: return 'bg-green-100 text-green-800 border-green-200';
            case 3: return 'bg-purple-100 text-purple-800 border-purple-200';
            case 4: return 'bg-amber-100 text-amber-800 border-amber-200';
            case 5: return 'bg-pink-100 text-pink-800 border-pink-200';
            default: return 'bg-gray-100 text-gray-800 border-gray-200';
        }
    };

    const SortableCategoryItem = ({ cat, catGroups, isExpanded, onToggle, children }: any) => {
        const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: `cat-${cat}` });
        const style = {
            transform: CSS.Transform.toString(transform),
            transition,
            zIndex: transform ? 999 : 1,
            position: 'relative' as any,
        };

        return (
            <div ref={setNodeRef} style={style} className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-visible">
                <div className="bg-gray-50 flex items-center justify-between p-3 rounded-t-xl group/cat">
                    <div className="flex items-center gap-2">
                        <div {...attributes} {...listeners} className="cursor-move text-gray-300 hover:text-gray-500 mr-1 p-1 -ml-2" title="拖曳排序分類">
                            <GripVertical className="w-4 h-4" />
                        </div>
                        <button type="button" onClick={onToggle} className="flex items-center gap-2 hover:bg-gray-200/50 p-1 rounded transition-colors">
                            <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                            <h3 className="font-bold text-gray-800">{cat}</h3>
                        </button>
                        <span className="text-xs text-gray-400 bg-white px-2 py-0.5 rounded-full border border-gray-200">
                            {catGroups.length}
                        </span>
                    </div>
                </div>
                {isExpanded && (
                    <div className="p-2 space-y-2 bg-gray-50/30">
                        {children}
                    </div>
                )}
            </div>
        );
    };

    const SortableGroupItem = ({ group, isSelected, onClick, onEdit, onDuplicate, onDelete, isCopying, isDeleting, childrenCount }: any) => {
        const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: group.id });
        const style = {
            transform: CSS.Transform.toString(transform),
            transition,
            zIndex: transform ? 999 : 1,
            position: 'relative' as any,
        };

        return (
            <div
                ref={setNodeRef}
                style={style}
                onClick={onClick}
                className={`p-3 rounded-xl cursor-pointer border transition-all flex items-start gap-2 bg-white ${isSelected ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200 hover:border-gray-300'}`}
            >
                <div {...attributes} {...listeners} className="cursor-move text-gray-400 hover:text-gray-600 self-center p-1 -ml-1">
                    <GripVertical className="w-5 h-5" />
                </div>
                <div className="flex-1 w-full min-w-0">
                    <div className="flex justify-between items-start mb-2 gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                            <div className={`flex flex-col items-center justify-center rounded px-2 py-1 min-w-[2.5rem] shrink-0 border ${getStepColorClass(group.uiConfig?.step || 1)}`}>
                                <span className="text-[10px] font-bold uppercase opacity-70">Step</span>
                                <span className="text-lg font-bold leading-none">{group.uiConfig?.step || 1}</span>
                            </div>
                            {group.thumbnail && (
                                <div className="w-10 h-10 rounded shrink-0 border border-gray-200 overflow-hidden bg-white flex items-center justify-center">
                                    <img src={group.thumbnail} alt={group.name} className="w-full h-full object-cover" />
                                </div>
                            )}
                            <div className="min-w-0">
                                <h3 className="font-bold text-gray-900 leading-tight truncate">{group.name}</h3>
                                <div className="flex flex-wrap gap-1 mt-1">
                                    {group.uiConfig?.displayType && (
                                        <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded border border-blue-100 shrink-0">
                                            {group.uiConfig.displayType === 'cards' ? '大卡片' :
                                                group.uiConfig.displayType === 'grid' ? '網格' :
                                                    group.uiConfig.displayType === 'list' ? '列表' :
                                                        group.uiConfig.displayType === 'ai_recognition' ? 'AI 辨識' :
                                                            group.uiConfig.displayType === 'checkbox' ? '勾選框' : group.uiConfig.displayType}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                            <button onClick={onEdit} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" title="編輯">
                                <Settings className="w-4 h-4" />
                            </button>
                            <button onClick={onDuplicate} disabled={isCopying} className={`p-1 rounded transition-colors ${isCopying ? 'bg-green-100 text-green-600' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`} title="複製">
                                {isCopying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
                            </button>
                            <button onClick={onDelete} disabled={isDeleting} className={`p-1 rounded transition-colors ${isDeleting ? 'bg-red-100 text-red-600' : 'text-gray-400 hover:text-red-600 hover:bg-red-50'}`} title="刪除">
                                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                            </button>
                        </div>
                    </div>
                    <div className="text-xs text-gray-500 flex justify-between ml-[2.5rem]">
                        <span>加價: +${group.priceModifier}</span>
                        <span className="flex items-center gap-1">
                            {childrenCount} 個子項 <ChevronRight className="w-3 h-3" />
                        </span>
                    </div>
                </div>
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
    const uniqueCategories = Array.from(new Set(groups.map(g => g.uiConfig?.category).filter(Boolean))) as string[];

    const groupedOptions = groups.reduce((acc, current) => {
        const cat = current.uiConfig?.category || '未分類';
        if (!acc[cat]) acc[cat] = [];
        acc[cat].push(current);
        return acc;
    }, {} as Record<string, OptionGroup[]>);

    const sortedCategories = Object.keys(groupedOptions).sort((a, b) => {
        const orderA = groupedOptions[a][0]?.uiConfig?.categorySortOrder ?? 999;
        const orderB = groupedOptions[b][0]?.uiConfig?.categorySortOrder ?? 999;
        if (orderA !== orderB) return orderA - orderB;
        if (a === '未分類') return 1;
        if (b === '未分類') return -1;
        return a.localeCompare(b);
    });

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

                    {/* Sort groups by step order & category */}
                    <DndContext
                        collisionDetection={closestCenter}
                        onDragEnd={handleCategoryDragEnd}
                    >
                        <SortableContext items={sortedCategories.map(cat => `cat-${cat}`)} strategy={verticalListSortingStrategy}>
                            {sortedCategories.map(cat => {
                                const isExpanded = expandedCategories[cat] !== false; // Default to true
                                const catGroups = groupedOptions[cat].sort((a, b) => {
                                    if (a.uiConfig?.step !== b.uiConfig?.step) return (a.uiConfig?.step || 1) - (b.uiConfig?.step || 1);
                                    return (a.uiConfig?.sortOrder || 0) - (b.uiConfig?.sortOrder || 0);
                                });

                                return (
                                    <SortableCategoryItem
                                        key={cat}
                                        cat={cat}
                                        catGroups={catGroups}
                                        isExpanded={isExpanded}
                                        onToggle={() => setExpandedCategories(prev => ({ ...prev, [cat]: !isExpanded }))}
                                    >
                                        <DndContext
                                            collisionDetection={closestCenter}
                                            onDragEnd={handleGroupDragEnd}
                                        >
                                            <SortableContext
                                                items={catGroups.map(g => g.id)}
                                                strategy={verticalListSortingStrategy}
                                            >
                                                {catGroups.map(group => (
                                                    <SortableGroupItem
                                                        key={group.id}
                                                        group={group}
                                                        isSelected={selectedGroupId === group.id}
                                                        onClick={() => setSelectedGroupId(group.id)}
                                                        onEdit={(e: React.MouseEvent) => {
                                                            e.stopPropagation();
                                                            setEditingGroupData(group);
                                                            setIsEditingGroup(true);
                                                        }}
                                                        onDuplicate={(e: React.MouseEvent) => {
                                                            e.stopPropagation();
                                                            handleDuplicateGroup(group.id);
                                                        }}
                                                        onDelete={(e: React.MouseEvent) => {
                                                            e.stopPropagation();
                                                            handleDeleteGroup(group.id);
                                                        }}
                                                        isCopying={isCopying === group.id}
                                                        isDeleting={deletingGroupId === group.id}
                                                        childrenCount={items.filter(i => i.parentId === group.id).length}
                                                    />
                                                ))}
                                            </SortableContext>
                                        </DndContext>
                                    </SortableCategoryItem>
                                );
                            })}
                        </SortableContext>
                    </DndContext>
                </div>
            </div>

            {/* Right Column: Option Items (Children) */}
            <div className="w-2/3 flex flex-col bg-gray-50/50">
                {selectedGroupId ? (
                    <>
                        {/* Header */}
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
                            {rightPanelTab === 'items' && (
                                <button
                                    onClick={() => {
                                        setEditingItemData({ parentId: selectedGroupId, colorHex: '#000000' });
                                        setIsEditingItem(true);
                                    }}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 font-medium"
                                >
                                    <Plus className="w-4 h-4" />
                                    新增子項
                                </button>
                            )}
                        </div>

                        {/* Tab Switcher */}
                        <div className="flex border-b border-gray-200 bg-white">
                            <button
                                className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${rightPanelTab === 'items' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                                onClick={() => setRightPanelTab('items')}
                            >
                                顏色/子項
                                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{items.filter(i => i.parentId === selectedGroupId).length}</span>
                            </button>
                            <button
                                className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors ${rightPanelTab === 'suboptions' ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-800'}`}
                                onClick={() => setRightPanelTab('suboptions')}
                            >
                                附加選項
                                <span className="ml-1.5 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">{groups.find(g => g.id === selectedGroupId)?.subAttributes?.length || 0}</span>
                            </button>
                        </div>

                        {/* Tab Content: Items */}
                        {rightPanelTab === 'items' && (
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
                                        <p>此類別尚無子項</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Tab Content: SubOptions */}
                        {rightPanelTab === 'suboptions' && (() => {
                            const group = groups.find(g => g.id === selectedGroupId);
                            const subAttrs = group?.subAttributes || [];
                            return (
                                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                                    {subAttrs.length === 0 && (
                                        <div className="py-10 text-center text-gray-400 flex flex-col items-center">
                                            <ListPlus className="w-10 h-10 mb-2 opacity-30" />
                                            <p>尚無附加選項</p>
                                            <p className="text-xs mt-1">例如: 磁吸功能、鏡頭框顏色、按鍵顏色</p>
                                        </div>
                                    )}

                                    {subAttrs.map(attr => (
                                        <div key={attr.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                                            {/* Attribute Header */}
                                            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b border-gray-100">
                                                <input
                                                    className="font-bold text-gray-800 bg-transparent border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:bg-white px-1 py-0.5 outline-none transition-all text-sm flex-1 max-w-[200px]"
                                                    value={attr.name}
                                                    onChange={e => panelUpdateAttrName(attr.id, e.target.value)}
                                                    placeholder="屬性名稱"
                                                />
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs text-gray-400 bg-white border border-gray-200 px-2 py-0.5 rounded-full">{attr.type === 'select' ? '選單' : '文字'}</span>
                                                    <button onClick={() => panelRemoveAttribute(attr.id)} className="text-gray-400 hover:text-red-500 p-1 rounded hover:bg-red-50">
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Options Grid (same card style as items) */}
                                            {attr.type === 'select' && (
                                                <div className="p-3">
                                                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mb-3">
                                                        <DndContext
                                                            collisionDetection={closestCenter}
                                                            onDragEnd={e => panelAttrOptionDragEnd(attr.id, e)}
                                                        >
                                                            <SortableContext
                                                                items={(attr.options || []).map(o => o.id)}
                                                                strategy={verticalListSortingStrategy}
                                                            >
                                                                {(attr.options || []).map(opt => {
                                                                    const isEditing = panelEditingAttrOption?.attrId === attr.id && panelEditingAttrOption?.optionId === opt.id;
                                                                    return (
                                                                        <SortableOptionTag
                                                                            key={opt.id}
                                                                            option={opt}
                                                                            attrId={attr.id}
                                                                            isEditing={isEditing}
                                                                            onEdit={() => setPanelEditingAttrOption({ attrId: attr.id, optionId: opt.id, name: opt.name, price: opt.priceModifier, image: opt.image })}
                                                                            onSave={(updates: any) => panelSaveAttrOption(attr.id, opt.id, updates)}
                                                                            onCancel={() => setPanelEditingAttrOption(null)}
                                                                            onDelete={() => panelRemoveAttrOption(attr.id, opt.id)}
                                                                            editingData={isEditing ? panelEditingAttrOption : null}
                                                                            onEditingDataChange={setPanelEditingAttrOption}
                                                                        />
                                                                    );
                                                                })}
                                                            </SortableContext>
                                                        </DndContext>
                                                    </div>

                                                    {/* Add option row */}
                                                    <div className="flex gap-2 items-center bg-gray-50 p-2 rounded-lg">
                                                        <div
                                                            onClick={() => setMediaModalConfig({
                                                                isOpen: true, bucket: 'models', isMultiple: false,
                                                                onSelect: (url) => {
                                                                    setPanelAttrOptionInput(prev =>
                                                                        prev?.attrId === attr.id ? { ...prev, image: url } : { attrId: attr.id, name: '', price: 0, image: url }
                                                                    );
                                                                    setMediaModalConfig(prev => ({ ...prev, isOpen: false }));
                                                                }
                                                            })}
                                                            className="cursor-pointer w-8 h-8 flex items-center justify-center border rounded bg-white hover:bg-gray-50 overflow-hidden shrink-0"
                                                            title="點擊媒體庫選圖"
                                                        >
                                                            {panelAttrOptionInput?.attrId === attr.id && panelAttrOptionInput.image ? (
                                                                <img src={panelAttrOptionInput.image} className="w-full h-full object-cover" />
                                                            ) : (
                                                                <ImageIcon className="w-4 h-4 text-gray-400" />
                                                            )}
                                                        </div>
                                                        <input
                                                            placeholder="選項名稱"
                                                            className="border rounded px-2 py-1 text-xs flex-1"
                                                            value={panelAttrOptionInput?.attrId === attr.id ? panelAttrOptionInput.name : ''}
                                                            onChange={e => setPanelAttrOptionInput(prev =>
                                                                prev?.attrId === attr.id ? { ...prev, name: e.target.value } : { attrId: attr.id, name: e.target.value, price: 0 }
                                                            )}
                                                        />
                                                        <input
                                                            type="number"
                                                            placeholder="加價"
                                                            className="border rounded px-2 py-1 text-xs w-16"
                                                            value={panelAttrOptionInput?.attrId === attr.id ? panelAttrOptionInput.price : 0}
                                                            onChange={e => setPanelAttrOptionInput(prev =>
                                                                prev?.attrId === attr.id ? { ...prev, price: Number(e.target.value) } : { attrId: attr.id, name: '', price: Number(e.target.value) }
                                                            )}
                                                        />
                                                        <button
                                                            onClick={() => panelAddAttrOption(attr.id)}
                                                            className="text-xs bg-blue-600 text-white px-2 py-1 rounded hover:bg-blue-700 shrink-0"
                                                        >
                                                            新增
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ))}

                                    {/* Add Attribute Footer */}
                                    <div className="flex gap-2 items-center bg-white p-3 rounded-xl border border-gray-200 border-dashed">
                                        <ListPlus className="w-4 h-4 text-gray-400 shrink-0" />
                                        <input
                                            placeholder="屬性名稱 (如: 磁吸)"
                                            className="border rounded px-2 py-1 text-sm flex-1"
                                            value={panelAttrInput.name}
                                            onChange={e => setPanelAttrInput(prev => ({ ...prev, name: e.target.value }))}
                                            onKeyDown={e => e.key === 'Enter' && panelAddAttribute()}
                                        />
                                        <select
                                            className="border rounded px-2 py-1 text-sm"
                                            value={panelAttrInput.type}
                                            onChange={e => setPanelAttrInput(prev => ({ ...prev, type: e.target.value as any }))}
                                        >
                                            <option value="select">選單 (Select)</option>
                                            <option value="text">文字 (Text)</option>
                                        </select>
                                        <button
                                            onClick={panelAddAttribute}
                                            className="text-sm bg-gray-800 text-white px-3 py-1 rounded hover:bg-black shrink-0"
                                        >
                                            + 新增屬性
                                        </button>
                                    </div>
                                </div>
                            );
                        })()}
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
                                        <option value="ai_recognition">AI 圖片辨識 (自動填入)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold mb-1 text-gray-600">分類標籤 (Category)</label>
                                <input
                                    type="text"
                                    list="category-options"
                                    className="w-full border rounded-lg px-3 py-2 text-sm"
                                    value={editingGroupData.uiConfig?.category || ''}
                                    onChange={e => setEditingGroupData(prev => ({
                                        ...prev,
                                        uiConfig: { ...prev.uiConfig, category: e.target.value }
                                    }))}
                                    placeholder="例如: 防摔殼系列、透明殼…（空白=不分類）"
                                />
                                <datalist id="category-options">
                                    {uniqueCategories.map(cat => (
                                        <option key={cat} value={cat} />
                                    ))}
                                </datalist>
                                <p className="text-[10px] text-gray-400 mt-1">同 Step 內相同分類的商品，在前台購物車會被收合在同一個折疊群組中。</p>
                            </div>

                            <div className="bg-white p-3 rounded-lg border border-purple-100 shadow-sm">
                                <label className="block text-xs font-bold mb-2 text-purple-700 flex items-center gap-1">
                                    顯示條件 (相依選項)
                                </label>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <select
                                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-gray-50 focus:ring-1 focus:ring-purple-500 outline-none"
                                            value={editingGroupData.uiConfig?.dependsOnGroupId || ''}
                                            onChange={e => {
                                                const val = e.target.value;
                                                setEditingGroupData(prev => ({
                                                    ...prev,
                                                    uiConfig: {
                                                        ...prev.uiConfig,
                                                        dependsOnGroupId: val ? val : undefined,
                                                        dependsOnOptionId: undefined // Reset option when group changes
                                                    }
                                                }));
                                            }}
                                        >
                                            <option value="">無條件 (預設顯示)</option>
                                            {groups.filter(g => g.id !== editingGroupData.id).map(g => (
                                                <option key={g.id} value={g.id}>需要先選擇：{g.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <select
                                            className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs bg-gray-50 focus:ring-1 focus:ring-purple-500 outline-none"
                                            value={editingGroupData.uiConfig?.dependsOnOptionId || ''}
                                            onChange={e => setEditingGroupData(prev => ({
                                                ...prev,
                                                uiConfig: { ...prev.uiConfig, dependsOnOptionId: e.target.value ? e.target.value : undefined }
                                            }))}
                                            disabled={!editingGroupData.uiConfig?.dependsOnGroupId}
                                        >
                                            <option value="">不限子選項 (有選大類即可)</option>
                                            {editingGroupData.uiConfig?.dependsOnGroupId &&
                                                items.filter(i => i.parentId === editingGroupData.uiConfig?.dependsOnGroupId).map(i => (
                                                    <option key={i.id} value={i.id}>指定選項：{i.name}</option>
                                                ))
                                            }
                                        </select>
                                    </div>
                                </div>
                                <p className="text-[10px] text-gray-400 mt-1.5">設定此大類必須在選擇了特定商品後才會在購物車出現。</p>
                            </div>

                            <div>
                                <div className="flex justify-between items-end mb-1">
                                    <label className="block text-xs font-bold text-gray-600">功能說明文字 (Description)</label>
                                    <div className="flex bg-gray-100 p-0.5 rounded border border-gray-200">
                                        <button
                                            type="button"
                                            onClick={() => setDescriptionMode('visual')}
                                            className={`px-2 py-1 text-[10px] sm:text-xs rounded font-medium transition-colors ${descriptionMode === 'visual' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            視覺化編輯器
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setDescriptionMode('code')}
                                            className={`px-2 py-1 text-[10px] sm:text-xs rounded font-medium transition-colors ${descriptionMode === 'code' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            程式碼編輯器 (HTML)
                                        </button>
                                    </div>
                                </div>
                                <div className="bg-white">
                                    {descriptionMode === 'visual' ? (
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
                                    ) : (
                                        <textarea
                                            className="w-full h-[208px] border border-gray-300 rounded-lg p-3 text-sm font-mono bg-gray-50 text-gray-800 leading-relaxed focus:bg-white focus:ring-2 focus:ring-purple-500 outline-none"
                                            value={editingGroupData.uiConfig?.description || ''}
                                            onChange={(e) => setEditingGroupData(prev => ({
                                                ...prev,
                                                uiConfig: { ...prev.uiConfig, description: e.target.value }
                                            }))}
                                            placeholder="在此輸入或貼上 HTML 原始碼 (例如：<p style='color:red;'>文字</p>)..."
                                        />
                                    )}
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
