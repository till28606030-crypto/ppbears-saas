// DEPRECATED: replaced by products-v2 (flag controlled)
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { 
    ChevronLeft, 
    Save, 
    Settings, 
    Sliders, 
    Smartphone, 
    Eye, 
    Upload, 
    Plus,
    X,
    AlignCenter,
    Type, 
    Wand2, 
    Sparkles, 
    Check, 
    Sticker, 
    Image, 
    ScanBarcode, 
    Scissors, 
    Circle, 
    Heart, 
    Square, 
    Ban,
    Trash2,
    ArrowUpDown,
    GripVertical
} from 'lucide-react';
import { get, set } from 'idb-keyval';
import { supabase } from '../../lib/supabase';
import {
  DndContext, 
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import CanvasEditor, { CanvasEditorRef } from '../../components/CanvasEditor';
import { OptionGroup, OptionItem } from '../../types';
import { normalizeOptionGroup } from '../../utils/normalizeOptionGroup';
import { fromDbGroup, fromDbItem } from '../../utils/dbMappers';

// Helper to upload to Supabase
const uploadToSupabase = async (file: File, bucket: 'assets' | 'models' = 'models') => {
    // 1. Check Auth Session
    const { data: { session } } = await supabase.auth.getSession();
    
    if (import.meta.env.DEV) {
        console.log("[Debug] Supabase Session:", session);
    }

    if (!session) {
        alert('【上傳失敗】請確認已登入管理員帳號。');
        return null;
    }

    try {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const filePath = `${fileName}`;

        // 2. Upload
        const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(filePath, file);

        if (uploadError) {
             console.error('Supabase Upload Error:', uploadError);
             alert(`上傳失敗，請稍後重試。 (Code: ${(uploadError as any).statusCode || 'StorageError'})`);
             return null;
        }

        const { data } = supabase.storage
            .from(bucket)
            .getPublicUrl(filePath);
        
        if (import.meta.env.DEV) {
            console.log(`[Upload Success] Path: ${filePath}, URL: ${data.publicUrl}`);
        }
        return data.publicUrl;

    } catch (error: any) {
        console.error('Upload Critical Error:', error);
        alert('上傳發生錯誤，請檢查網路連線。');
        return null;
    }
};

// Helper to extract storage path from public URL
const extractStoragePathFromPublicUrl = (url: string, bucket: string = 'models') => {
    try {
        // Handle URL like: https://[project].supabase.co/storage/v1/object/public/[bucket]/[path]
        const delimiter = `/storage/v1/object/public/${bucket}/`;
        if (url.includes(delimiter)) {
            return url.split(delimiter)[1];
        }
        return null;
    } catch (e) {
        console.error('Error parsing storage path:', e);
        return null;
    }
};

const CATEGORIES_KEY = 'ppbears_seller_categories';
const BRANDS_KEY = 'ppbears_seller_brands';

// --- Helper Components ---
const SortableItem = ({ id, label, onDelete, isSystem }: { id: string, label: string, onDelete: () => void, isSystem: boolean }) => {
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
        <div ref={setNodeRef} style={style} className="flex items-center gap-2 p-2 bg-white border border-gray-200 rounded-lg mb-2 touch-none">
            <div {...attributes} {...listeners} className="cursor-grab text-gray-400 hover:text-gray-600 p-1">
                <GripVertical className="w-4 h-4" />
            </div>
            <span className="flex-1 font-medium text-gray-700">{label}</span>
            {!isSystem && (
                <button 
                    type="button"
                    onClick={onDelete}
                    className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50"
                >
                    <Trash2 className="w-4 h-4" />
                </button>
            )}
        </div>
    );
};

const ManageableSelect = ({
    label,
    value,
    options,
    onChange,
    onAdd,
    onDelete,
    onReorder,
    systemItems = ['all'],
    hideAddButton = false // New prop to optionally hide add button
}: {
    label: string,
    value: string,
    options: { id: string, label: string }[],
    onChange: (val: string) => void,
    onAdd: (name: string) => void,
    onDelete: (id: string) => void,
    onReorder: (oldIndex: number, newIndex: number) => void,
    systemItems?: string[],
    hideAddButton?: boolean
}) => {
    const [isAdding, setIsAdding] = useState(false);
    const [newItemName, setNewItemName] = useState('');
    const [isReordering, setIsReordering] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (active.id !== over?.id) {
            const oldIndex = options.findIndex((item) => item.id === active.id);
            const newIndex = options.findIndex((item) => item.id === over?.id);
            onReorder(oldIndex, newIndex);
        }
    };

    const handleSubmitAdd = () => {
        if (newItemName.trim()) {
            onAdd(newItemName);
            setNewItemName('');
            setIsAdding(false);
        }
    };

    return (
        <div>
            <label className="block text-sm font-bold text-gray-700 mb-1">{label}</label>
            
            {isReordering ? (
                <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 animate-in fade-in zoom-in-95 duration-200">
                    <div className="mb-3 flex justify-between items-center">
                        <span className="text-sm font-bold text-gray-700">排序 {label}</span>
                        <span className="text-xs text-gray-500">拖曳以調整順序</span>
                    </div>
                    <DndContext 
                        sensors={sensors} 
                        collisionDetection={closestCenter} 
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext 
                            items={options.map(c => c.id)} 
                            strategy={verticalListSortingStrategy}
                        >
                            <div className="space-y-2 pr-2">
                                {options.map(item => (
                                    <SortableItem 
                                        key={item.id} 
                                        id={item.id} 
                                        label={item.label} 
                                        onDelete={() => onDelete(item.id)}
                                        isSystem={systemItems.includes(item.id)}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </DndContext>
                    <button 
                        type="button"
                        onClick={() => setIsReordering(false)}
                        className="w-full mt-4 py-2 bg-black text-white rounded-lg text-sm font-bold hover:bg-gray-800 transition-colors"
                    >
                        完成排序
                    </button>
                </div>
            ) : (
                <div className="flex gap-2 items-center">
                    <div className="relative flex-1">
                        <select 
                            value={value} 
                            onChange={(e) => onChange(e.target.value)}
                            className="w-full border border-gray-300 rounded-lg pl-4 pr-10 py-2 focus:ring-2 focus:ring-red-500 outline-none bg-white appearance-none"
                        >
                            <option value="" disabled>請選擇...</option>
                            {options.filter(c => !systemItems.includes(c.id) || c.id !== 'all').map(item => (
                                <option key={item.id} value={item.id}>{item.label}</option>
                            ))}
                        </select>
                        <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-gray-500">
                            <ChevronLeft className="w-4 h-4 -rotate-90" />
                        </div>
                    </div>
                    
                    {isAdding ? (
                        <div className="flex gap-1 animate-in fade-in duration-200 items-center">
                            <input 
                                type="text"
                                value={newItemName}
                                onChange={(e) => setNewItemName(e.target.value)}
                                placeholder={`新增${label}`}
                                className="border border-gray-300 rounded-lg px-2 py-2 w-32 focus:ring-2 focus:ring-red-500 outline-none text-sm"
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && handleSubmitAdd()}
                            />
                            <button 
                                type="button"
                                onClick={handleSubmitAdd}
                                className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 border border-green-200 transition-colors"
                            >
                                <Check className="w-5 h-5" />
                            </button>
                            <button 
                                type="button"
                                onClick={() => setIsAdding(false)}
                                className="p-2 bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 border border-gray-200 transition-colors"
                            >
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    ) : (
                        <>
                            {!hideAddButton && (
                                <button 
                                    type="button"
                                    onClick={() => setIsAdding(true)}
                                    className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg border border-gray-200 transition-colors"
                                    title="新增"
                                >
                                    <Plus className="w-5 h-5" />
                                </button>
                            )}
                            <button 
                                type="button"
                                onClick={() => setIsReordering(true)}
                                className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg border border-gray-200 transition-colors"
                                title="排序"
                            >
                                <ArrowUpDown className="w-5 h-5" />
                            </button>
                        </>
                    )}

                    {!systemItems.includes(value) && value !== 'all' && !isAdding && (
                        <button 
                            type="button"
                            onClick={() => onDelete(value)}
                            className="p-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg border border-red-200 transition-colors"
                            title="刪除當前"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};

const DEFAULT_CATEGORIES = [
    { id: 'all', label: '全部' },
    // { id: 'bottle', label: '水杯' },
    // { id: 'phone-case', label: '手機殼' },
    // { id: 'decor', label: '家居裝飾' },
    // { id: 'apparel', label: '服裝飾品' },
    // { id: 'accessories', label: '燭台/相框' },
    // { id: 'other', label: '其他' }
];

const DEFAULT_BRANDS: { id: string, label: string }[] = [
    // { id: 'Apple', label: 'Apple' },
    // { id: 'Samsung', label: 'Samsung' },
    // { id: 'Google', label: 'Google' },
    // { id: 'Xiaomi', label: 'Xiaomi' },
    // { id: 'OPPO', label: 'OPPO' },
    // { id: 'Vivo', label: 'Vivo' },
    // { id: 'Sony', label: 'Sony' },
    // { id: 'ASUS', label: 'ASUS' },
];

// --- Types ---

type DesignPermissions = {
    text: boolean;
    stickers: boolean;
    backgrounds: boolean;
    barcode: boolean;
    designs: boolean;
    aiCartoon: boolean;
    aiRemoveBg: boolean;
};

interface ProductData {
    // Basic Settings
    name: string;
    category: string;
    brand: string;
    operationMode: 'simple' | 'drawer';
    
    // Property Settings
    width: number;
    height: number;
    bleed: { top: number; bottom: number; left: number; right: number };
    cornerRadius: number;
    outputFormat: 'png' | 'jpg' | 'pdf';
    dpi: number;
    colorSpace: 'RGB' | 'CMYK';
    permissions: DesignPermissions;

    // Model Settings
    shape: 'rect' | 'circle';
    baseImage?: string; // The phone body
    maskImage?: string; // The printable area mask
    maskOffset: { x: number; y: number };
    maskSize: { w: number; h: number };
    
    // New: Tag Management
    compatibilityTags?: string[]; 
}

const DEFAULT_DATA: ProductData = {
    name: '',
    category: 'phone-case',
    brand: '',
    operationMode: 'simple',
    width: 7.69,
    height: 16.20,
    bleed: { top: 0, bottom: 0, left: 0, right: 0 },
    cornerRadius: 0.5,
    outputFormat: 'png',
    dpi: 300,
    colorSpace: 'RGB',
    permissions: {
        text: true,
        stickers: true,
        backgrounds: true,
        barcode: true,
        designs: true,
        aiCartoon: true,
        aiRemoveBg: true
    },
    shape: 'rect',
    maskOffset: { x: 0, y: 0 },
    maskSize: { w: 7.69, h: 16.20 },
    compatibilityTags: []
};

// --- Sub-components for Tabs ---

const BasicSettingsTab = ({ 
    data, 
    onChange,
    categories,
    onAddCategory,
    onDeleteCategory,
    onReorder,
    brands,
    onAddBrand,
    onDeleteBrand,
    onReorderBrands
}: { 
    data: ProductData, 
    onChange: (k: keyof ProductData, v: any) => void,
    categories: { id: string, label: string }[],
    onAddCategory: (name: string) => void,
    onDeleteCategory: (id: string) => void,
    onReorder: (oldIndex: number, newIndex: number) => void,
    brands: { id: string, label: string }[],
    onAddBrand: (name: string) => void,
    onDeleteBrand: (id: string) => void,
    onReorderBrands: (oldIndex: number, newIndex: number) => void
}) => {
    const [availableGroups, setAvailableGroups] = useState<OptionGroup[]>([]);

    useEffect(() => {
        const loadGroups = async () => {
            try {
                // 1. Fetch Option Groups from Supabase
                // Filter by is_active=true (default is true if not set)
                // Order by created_at (or sort order if available)
                const { data: dbGroups, error: errG } = await supabase
                    .from('option_groups')
                    .select('*')
                    .order('created_at', { ascending: true }); // Keep old items first usually, or use UI config step

                // 2. Fetch Option Items for complete hydration (needed for 'items' property)
                const { data: dbItems, error: errI } = await supabase
                    .from('option_items')
                    .select('*');

                if (errG) {
                    if (!errG.message?.includes('AbortError')) console.error('Error loading groups for Quick Select:', errG);
                }
                
                if (dbGroups) {
                    const rawGroups = dbGroups.map(fromDbGroup);
                    const rawItems = dbItems ? dbItems.map(fromDbItem) : [];
                    
                    // Client-side hydration of items into groups
                    // This matches the logic in loadOptionGroups service
                    const hydratedGroups = rawGroups.map(g => {
                        const children = rawItems.filter(i => i.parentId === g.id);
                        // @ts-ignore
                        g.items = children;
                        return g;
                    });

                    // @ts-ignore
                    setAvailableGroups(hydratedGroups.map(normalizeOptionGroup));
                }
            } catch (e) {
                console.error("Failed to load option groups", e);
            }
        };
        loadGroups();
    }, []);

    const toggleGroupTags = (group: OptionGroup, isChecked: boolean) => {
        const currentTags = new Set(data.compatibilityTags || []);
        
        if (isChecked) {
            // Add tags
            group.matchingTags.forEach(tag => currentTags.add(tag));
        } else {
            // Remove tags
            group.matchingTags.forEach(tag => currentTags.delete(tag));
        }
        
        onChange('compatibilityTags', Array.from(currentTags));
    };

    return (
    <div className="space-y-8 max-w-3xl">
        {/* Quick Link Option Groups */}
        <div className="space-y-4 pt-6 border-t border-gray-100">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Check className="w-4 h-4" /> 
                支援規格/配件 (Quick Select)
            </h3>
            <p className="text-sm text-gray-500">
                勾選此產品支援的規格大類，系統會自動加入對應的標籤。
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {availableGroups.map(group => {
                    const isChecked = group.matchingTags.length > 0 && group.matchingTags.every(tag => (data.compatibilityTags || []).includes(tag));
                    
                    return (
                        <label 
                            key={group.id} 
                            className={`flex items-center gap-3 p-3 border rounded-lg cursor-pointer transition-all ${isChecked ? 'bg-green-50 border-green-500 ring-1 ring-green-500' : 'bg-white border-gray-200 hover:border-gray-300'}`}
                        >
                            <input 
                                type="checkbox" 
                                checked={isChecked}
                                onChange={(e) => toggleGroupTags(group, e.target.checked)}
                                className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
                            />
                            <div>
                                <div className="font-bold text-gray-800 text-sm">{group.name}</div>
                                <div className="text-xs text-gray-400 mt-0.5 flex flex-wrap gap-1">
                                    {group.matchingTags.map(t => <span key={t} className="bg-gray-100 px-1 rounded">{t}</span>)}
                                </div>
                            </div>
                        </label>
                    );
                })}
                {availableGroups.filter(g => g.matchingTags && g.matchingTags.length > 0).length === 0 && (
                    <div className="col-span-full text-center py-4 text-gray-400 text-sm bg-gray-50 rounded-lg">
                        {availableGroups.length > 0 ? '目前只有通用選項 (Universal)，無需設定。' : '尚未設定任何規格大類，請先至「規格管理」頁面新增。'}
                    </div>
                )}
            </div>
        </div>

        {/* Compatibility Tags */}
        <div className="space-y-4 pt-6 border-t border-gray-100">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                <Settings className="w-4 h-4" /> 
                系統標籤 (System Tags)
            </h3>
            <p className="text-sm text-gray-500">
                輸入標籤 (Tags) 以自動關聯到具備相同標籤的「加購選項」。按 Enter 新增。
            </p>
            <div className="flex flex-wrap gap-2 p-3 bg-white border border-gray-200 rounded-lg min-h-[3rem]">
                {(data.compatibilityTags || []).map((tag, idx) => (
                    <span key={idx} className="px-2 py-1 bg-blue-100 text-blue-700 text-sm rounded-md flex items-center gap-1">
                        {tag}
                        <button 
                            onClick={() => {
                                const newTags = [...(data.compatibilityTags || [])];
                                newTags.splice(idx, 1);
                                onChange('compatibilityTags', newTags);
                            }}
                            className="hover:text-blue-900"
                        >
                            <X className="w-3 h-3" />
                        </button>
                    </span>
                ))}
                <input 
                    type="text" 
                    placeholder="輸入標籤 (例如: magsafe, iphone)..." 
                    className="flex-1 min-w-[150px] outline-none text-sm bg-transparent"
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            const val = e.currentTarget.value.trim();
                            if (val && !(data.compatibilityTags || []).includes(val)) {
                                onChange('compatibilityTags', [...(data.compatibilityTags || []), val]);
                                e.currentTarget.value = '';
                            }
                        }
                    }}
                />
            </div>
            <div className="text-xs text-gray-400">
                常用標籤: <span className="font-mono bg-gray-100 px-1 rounded">iphone</span> <span className="font-mono bg-gray-100 px-1 rounded">magsafe</span> <span className="font-mono bg-gray-100 px-1 rounded">android</span>
            </div>
        </div>

        <div className="space-y-4">
            <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">模型名稱</label>
                <input 
                    type="text" 
                    value={data.name} 
                    onChange={(e) => onChange('name', e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-red-500 outline-none"
                    placeholder="例如: iPhone 15 Pro 磨砂殼"
                />
            </div>
            
            <ManageableSelect 
                label="類別" 
                value={data.category} 
                options={categories}
                onChange={(val) => onChange('category', val)}
                onAdd={onAddCategory}
                onDelete={onDeleteCategory}
                onReorder={onReorder}
            />

            {/* Only show Brand selector when category is NOT 'all' */}
            {data.category !== 'all' && (
                <ManageableSelect 
                    label="品牌 (Brand)" 
                    value={data.brand} 
                    options={brands}
                    onChange={(val) => onChange('brand', val)}
                    onAdd={onAddBrand}
                    onDelete={onDeleteBrand}
                    onReorder={onReorderBrands}
                    systemItems={[]}
                    // Only show add button if user has selected a category other than 'all'
                    // Actually user logic is: "Category Add -> Brand Appears"
                    // But currently brands are global, not per-category. 
                    // However, I will follow the visual request: 
                    // "Category" usually is fixed (Phone Case, Bottle), user selects one.
                    // Then "Brand" appears.
                    // If user means "When I click Add on Category, then Brand disappears", that's weird.
                    // The user said: "Category Add -> Brand disappears" (Bug report)
                    // "Should be: Category Add -> Then options appear" (Feature request?)
                    
                    // Wait, the user said: "`div` "類別"這邊只要新增 下面"品牌" 這個就會消失"
                    // This means when `ManageableSelect` for Category enters "Add Mode", the UI below it shifts or disappears?
                    // Ah, looking at the code, `ManageableSelect` is self-contained. 
                    // But if `isAdding` is true, the `select` input is replaced by `text input`.
                    // The "Brand" component below should still be rendered unless conditional logic hides it.
                    
                    // Let's look at the usage in `BasicSettingsTab`:
                    // {data.category === 'phone-case' && ( ... Brand Select ... )}
                    
                    // If the user adds a NEW category, `data.category` might still be the old value OR empty?
                    // When adding a category, `handleAddCategory` sets the new category ID.
                    // But WHILE typing (isAdding=true), the value hasn't changed yet.
                    
                    // User's second sentence: "因該是要 類別"新增"後才會出現 針對"類別"的"選項""
                    // Intent: The "Brand" selector should ONLY appear if the selected category supports brands (e.g. Phone Case).
                    // AND when adding a new category, we shouldn't show the brand selector yet because we don't know if this new category needs brands.
                    
                    // Let's adjust the condition. 
                    // Currently it is: `{data.category === 'phone-case' && ...}`
                    // This means Brand ONLY shows for "phone-case".
                    // If user adds "Water Bottle", Brand won't show. This is correct behavior for "Phone Case" specific brands.
                    // But maybe the user WANTS brands for their new category?
                    
                    // Re-reading user input carefully:
                    // "`div` "類別"這邊只要新增 下面"品牌" 這個就會消失" (When I click add on Category, Brand disappears)
                    // "`div` 因該是要 類別"新增"後才會出現 針對"類別"的"選項"" (It should be: After adding Category, the options for that category appear)
                    
                    // Interpretation:
                    // 1. User clicks "+" on Category.
                    // 2. "Brand" selector disappears. (This is happening now, why?)
                    //    -> Because when `isAdding` is true inside `ManageableSelect`, it doesn't trigger `onChange`.
                    //    -> Wait, `ManageableSelect` state is internal.
                    //    -> Maybe the user means visually it disappears?
                    //    -> Or maybe `data.category` changes? No.
                    
                    // Let's look at the condition again: `{data.category === 'phone-case' && ...}`
                    // If the user selects "all" or "bottle", Brand is hidden.
                    // The user wants to add a CUSTOM category (e.g. "AirPods") and then have Brands available for it?
                    // OR the user is reporting a UI glitch.
                    
                    // Let's assume the user wants to enable Brands for ANY category that isn't "all".
                    // So I changed the condition from `data.category === 'phone-case'` to `data.category !== 'all'`.
                    // This allows Brands to show up for any selected category (including new ones).
                />
            )}

            <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">PC 介面操作方式</label>
                <div className="flex gap-4">
                    <label className={`flex items-center gap-2 p-4 border rounded-lg cursor-pointer ${data.operationMode === 'simple' ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}>
                        <input type="radio" name="mode" checked={data.operationMode === 'simple'} onChange={() => onChange('operationMode', 'simple')} className="text-red-600 focus:ring-red-500" />
                        <span className="font-medium">簡約點擊式</span>
                    </label>
                    <label className={`flex items-center gap-2 p-4 border rounded-lg cursor-pointer ${data.operationMode === 'drawer' ? 'border-red-500 bg-red-50' : 'border-gray-200'}`}>
                        <input type="radio" name="mode" checked={data.operationMode === 'drawer'} onChange={() => onChange('operationMode', 'drawer')} className="text-red-600 focus:ring-red-500" />
                        <span className="font-medium">抽屜拖曳式</span>
                    </label>
                </div>
                <p className="text-xs text-gray-500 mt-2">簡約點擊式適合簡單的貼圖、換背景操作；抽屜式適合複雜的多圖層設計。</p>
            </div>
        </div>
    </div>
    );
};

const PropertySettingsTab = ({ data, onChange, onDeepChange }: { data: ProductData, onChange: (k: keyof ProductData, v: any) => void, onDeepChange: (path: string[], v: any) => void }) => (
    <div className="space-y-8 max-w-4xl">
        {/* Dimensions */}
        <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
            <h3 className="font-bold text-gray-800 mb-4 border-b pb-2">尺寸與出血 (cm)</h3>
            <div className="grid grid-cols-2 gap-6 mb-4">
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase">寬度</label>
                    <input type="number" value={data.width} onChange={(e) => onChange('width', parseFloat(e.target.value))} className="w-full mt-1 border rounded px-3 py-2" />
                </div>
                <div>
                    <label className="block text-xs font-bold text-gray-500 uppercase">高度</label>
                    <input type="number" value={data.height} onChange={(e) => onChange('height', parseFloat(e.target.value))} className="w-full mt-1 border rounded px-3 py-2" />
                </div>
            </div>
            
            <div className="grid grid-cols-4 gap-4">
                {['top', 'bottom', 'left', 'right'].map((side) => (
                    <div key={side}>
                        <label className="block text-xs font-bold text-gray-500 uppercase">出血 {side}</label>
                        <input 
                            type="number" 
                            value={data.bleed[side as keyof typeof data.bleed]} 
                            onChange={(e) => onDeepChange(['bleed', side], parseFloat(e.target.value))}
                            className="w-full mt-1 border rounded px-3 py-2" 
                        />
                    </div>
                ))}
            </div>
        </div>

        {/* Output Specs */}
        <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
            <h3 className="font-bold text-gray-800 mb-4 border-b pb-2">輸出規格</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                    <label className="block text-sm font-medium mb-1">切角大小 (Corner Radius)</label>
                    <input type="number" value={data.cornerRadius} onChange={(e) => onChange('cornerRadius', parseFloat(e.target.value))} className="w-full border rounded px-3 py-2" />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">輸出解析度 (DPI)</label>
                    <input type="number" value={data.dpi} onChange={(e) => onChange('dpi', parseFloat(e.target.value))} className="w-full border rounded px-3 py-2" />
                </div>
                <div>
                    <label className="block text-sm font-medium mb-1">色彩空間</label>
                    <select value={data.colorSpace} onChange={(e) => onChange('colorSpace', e.target.value)} className="w-full border rounded px-3 py-2 bg-white">
                        <option value="RGB">RGB (螢幕顯示)</option>
                        <option value="CMYK">CMYK (印刷專用)</option>
                    </select>
                </div>
            </div>
        </div>

        {/* Permissions */}
        <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
            <h3 className="font-bold text-gray-800 mb-4 border-b pb-2">客戶設計權限</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                    { key: 'text', label: '文字 (Text)' },
                    { key: 'stickers', label: '貼圖 (Stickers)' },
                    { key: 'backgrounds', label: '背景 (Background)' },
                    { key: 'barcode', label: '條碼 (Barcode)' },
                    { key: 'designs', label: '設計 (Designs)' },
                    { key: 'aiCartoon', label: '卡通化 (AI Cartoon)' },
                    { key: 'aiRemoveBg', label: '一鍵去背 (AI Remove BG)' }
                ].map(({ key, label }) => (
                    <label key={key} className="flex items-center justify-between bg-white p-3 rounded border shadow-sm cursor-pointer hover:border-red-200 transition-colors">
                        <span className="text-sm font-medium text-gray-700">{label}</span>
                        <input 
                            type="checkbox" 
                            checked={!!data.permissions?.[key as keyof typeof data.permissions]} 
                            onChange={() => onDeepChange(['permissions', key], !data.permissions?.[key as keyof typeof data.permissions])}
                            className="w-5 h-5 text-red-600 rounded focus:ring-red-500" 
                        />
                    </label>
                ))}
            </div>
        </div>
    </div>
);

const ModelSettingsTab = ({ data, onChange, onDeepChange, productId }: { data: ProductData, onChange: (k: keyof ProductData, v: any) => void, onDeepChange: (path: string[], v: any) => void, productId?: string }) => {
    const [previewScale, setPreviewScale] = useState(20);
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [initialOffset, setInitialOffset] = useState({ x: 0, y: 0 });

    const [isResizing, setIsResizing] = useState(false);
    const [resizingDir, setResizingDir] = useState<string | null>(null);
    const [resizeStart, setResizeStart] = useState({ x: 0, y: 0 });
    const [initialDims, setInitialDims] = useState({ w: 0, h: 0, x: 0, y: 0 });
    
    const handleImageUpload = async (key: 'baseImage' | 'maskImage', e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            // Upload to Supabase
            const publicUrl = await uploadToSupabase(file, 'models');
            if (publicUrl) {
                onChange(key, publicUrl);
            }
        }
        // T3: Clear input value to allow re-uploading the same file
        if (e.target) {
            e.target.value = '';
        }
    };

    const handleDeleteImage = async (key: 'baseImage' | 'maskImage') => {
        const url = data[key];
        if (!url) return;

        if (!confirm('確定要刪除這張圖片嗎？這也會同步清除資料庫記錄並移除檔案。')) return;

        try {
            // T2: Call Server API to delete
            if (productId && productId !== 'new') {
                const target = key === 'baseImage' ? 'base' : 'mask';
                const response = await fetch(`/api/products/${productId}/delete-image`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ target })
                });

                const result = await response.json();

                if (!result.success) {
                    console.error('Delete API Failed:', result);
                    alert(`刪除失敗: ${result.message || '未知錯誤'}`);
                    return;
                }

                if (import.meta.env.DEV) {
                    console.log(`[Delete Success] Server cleared DB & Storage for ${key}`);
                }
            } else {
                 // New product (not saved yet) - just clear UI
                 console.warn("Product ID missing or 'new', only clearing UI state.");
            }
            
            // T3: Update UI State only after success
            onChange(key, null);
            
        } catch (error: any) {
            console.error('Error in handleDeleteImage:', error);
            alert(`刪除圖片時發生錯誤: ${error.message || '未知錯誤'}`);
        }
    };

    const handleCenter = () => {
        onDeepChange(['maskOffset', 'x'], 0);
        onDeepChange(['maskOffset', 'y'], 0);
    };

    // Drag Handlers
    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        setInitialOffset({ x: data.maskOffset.x, y: data.maskOffset.y });
    };

    // Resize Handlers
    const handleResizeMouseDown = (e: React.MouseEvent, dir: string) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);
        setResizingDir(dir);
        setResizeStart({ x: e.clientX, y: e.clientY });
        setInitialDims({ w: data.width, h: data.height, x: data.maskOffset.x, y: data.maskOffset.y });
    };

    const getHandleStyle = (dir: string) => {
        const size = 10;
        const offset = -5;
        const style: React.CSSProperties = {
            position: 'absolute',
            width: size,
            height: size,
            backgroundColor: 'white',
            border: '1px solid #ef4444',
            zIndex: 30,
            pointerEvents: 'auto'
        };
        if (dir.includes('n')) style.top = offset;
        if (dir.includes('s')) style.bottom = offset;
        if (dir.includes('w')) style.left = offset;
        if (dir.includes('e')) style.right = offset;
        if (dir === 'n' || dir === 's') { style.left = '50%'; style.marginLeft = offset; style.cursor = 'ns-resize'; }
        if (dir === 'w' || dir === 'e') { style.top = '50%'; style.marginTop = offset; style.cursor = 'ew-resize'; }
        if (dir === 'nw' || dir === 'se') style.cursor = 'nwse-resize';
        if (dir === 'ne' || dir === 'sw') style.cursor = 'nesw-resize';
        
        return style;
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                const dx = e.clientX - dragStart.x;
                const dy = e.clientY - dragStart.y;
                onDeepChange(['maskOffset', 'x'], initialOffset.x + dx);
                onDeepChange(['maskOffset', 'y'], initialOffset.y + dy);
            }
            if (isResizing && resizingDir) {
                const dx = e.clientX - resizeStart.x;
                const dy = e.clientY - resizeStart.y;
                
                let newW = initialDims.w;
                let newH = initialDims.h;
                let newX = initialDims.x;
                let newY = initialDims.y;
                
                // Width Logic
                if (resizingDir.includes('e')) {
                    newW += dx / previewScale;
                    newX += dx / 2;
                }
                if (resizingDir.includes('w')) {
                    newW -= dx / previewScale;
                    newX += dx / 2;
                }
                
                // Height Logic
                if (resizingDir.includes('s')) {
                    newH += dy / previewScale;
                    newY += dy / 2;
                }
                if (resizingDir.includes('n')) {
                    newH -= dy / previewScale;
                    newY += dy / 2;
                }
                
                // Apply (Min size 0.5cm)
                if (newW > 0.5) {
                    onChange('width', parseFloat(newW.toFixed(2)));
                    onDeepChange(['maskOffset', 'x'], newX);
                }
                if (newH > 0.5) {
                    onChange('height', parseFloat(newH.toFixed(2)));
                    onDeepChange(['maskOffset', 'y'], newY);
                }
            }
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            setIsResizing(false);
            setResizingDir(null);
        };

        if (isDragging || isResizing) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, isResizing, resizingDir, dragStart, resizeStart, initialOffset, initialDims, previewScale]);

    return (
        <div className="flex flex-col lg:flex-row gap-8 h-full">
            {/* Left: Controls */}
            <div className="w-full lg:w-1/3 space-y-6 overflow-y-auto pr-2">
                <div className="space-y-4">
                    <h3 className="font-bold text-gray-800">區域形狀</h3>
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2">
                            <input type="radio" name="shape" checked={data.shape === 'rect'} onChange={() => onChange('shape', 'rect')} className="text-red-600" />
                            <span>矩形 (Rect)</span>
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="radio" name="shape" checked={data.shape === 'circle'} onChange={() => onChange('shape', 'circle')} className="text-red-600" />
                            <span>圓形 (Circle)</span>
                        </label>
                    </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                    <h3 className="font-bold text-gray-800">圖層設置</h3>
                    
                    {/* Mask Image Upload */}
                    <div>
                        <label className="block text-sm font-medium mb-2">遮罩圖 (可選)</label>
                        <div className="flex items-center gap-4">
                            <div 
                                className={`w-20 h-20 bg-gray-100 rounded border flex items-center justify-center overflow-hidden transition-colors ${data.maskImage ? 'cursor-pointer hover:bg-red-50 hover:border-red-200' : ''}`}
                                onClick={() => data.maskImage && handleDeleteImage('maskImage')}
                                title={data.maskImage ? "點擊刪除圖片" : ""}
                            >
                                {data.maskImage ? (
                                    <div className="relative group w-full h-full">
                                        <img src={data.maskImage} className="w-full h-full object-contain" />
                                        <div className="absolute inset-0 bg-red-500/0 group-hover:bg-red-500/20 flex items-center justify-center transition-colors">
                                            <Trash2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-md" />
                                        </div>
                                    </div>
                                ) : <div className="text-xs text-gray-400 text-center px-1">No Mask</div>}
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="cursor-pointer bg-white border border-gray-300 px-3 py-1.5 rounded text-sm hover:bg-gray-50 text-center">
                                    選擇圖片
                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload('maskImage', e)} />
                                </label>
                                {data.maskImage && (
                                    <button 
                                        type="button"
                                        onClick={() => handleDeleteImage('maskImage')}
                                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                                    >
                                        刪除圖片
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Base Image Upload */}
                    <div>
                        <label className="block text-sm font-medium mb-2">底圖 (手機殼模型)</label>
                        <div className="flex items-center gap-4">
                            <div 
                                className={`w-20 h-20 bg-gray-100 rounded border flex items-center justify-center overflow-hidden transition-colors ${data.baseImage ? 'cursor-pointer hover:bg-red-50 hover:border-red-200' : ''}`}
                                onClick={() => data.baseImage && handleDeleteImage('baseImage')}
                                title={data.baseImage ? "點擊刪除圖片" : ""}
                            >
                                {data.baseImage ? (
                                    <div className="relative group w-full h-full">
                                        <img src={data.baseImage} className="w-full h-full object-contain" />
                                        <div className="absolute inset-0 bg-red-500/0 group-hover:bg-red-500/20 flex items-center justify-center transition-colors">
                                            <Trash2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-md" />
                                        </div>
                                    </div>
                                ) : <Smartphone className="text-gray-400" />}
                            </div>
                            <div className="flex flex-col gap-2">
                                <label className="cursor-pointer bg-white border border-gray-300 px-3 py-1.5 rounded text-sm hover:bg-gray-50 text-center">
                                    選擇圖片
                                    <input type="file" className="hidden" accept="image/*" onChange={(e) => handleImageUpload('baseImage', e)} />
                                </label>
                                {data.baseImage && (
                                    <button 
                                        type="button"
                                        onClick={() => handleDeleteImage('baseImage')}
                                        className="text-xs text-red-500 hover:text-red-700 font-medium"
                                    >
                                        刪除圖片
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-4 pt-4 border-t">
                    <h3 className="font-bold text-gray-800">預覽校準</h3>
                    <div>
                        <label className="text-xs flex justify-between font-medium text-gray-600 mb-1">
                            <span>顯示比例 (px/cm)</span>
                            <span>{previewScale.toFixed(1)}</span>
                        </label>
                        <input 
                            type="range" 
                            min="10" 
                            max="100" 
                            step="0.5" 
                            value={previewScale} 
                            onChange={(e) => setPreviewScale(parseFloat(e.target.value))} 
                            className="w-full accent-red-600"
                        />
                    </div>
                    
                    <button 
                        onClick={handleCenter}
                        className="w-full py-2 flex items-center justify-center gap-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 font-medium transition-colors"
                    >
                        <AlignCenter className="w-4 h-4" />
                        自動置中 (Center)
                    </button>
                    <p className="text-xs text-gray-500">
                        提示：您可以直接在右側預覽圖中<b>拖曳</b>紅色區域調整位置，或拖曳周圍控制點<b>變形</b>。
                    </p>
                </div>
            </div>

            {/* Right: Visual Editor */}
            <div className="flex-1 bg-gray-200 rounded-xl flex items-center justify-center p-8 min-h-[500px] border-2 border-dashed border-gray-300 relative overflow-hidden select-none">
                <div className="relative shadow-2xl bg-white" style={{ width: '300px', height: '600px' }}>
                    {/* Base Image Layer (Bottom) */}
                    {data.baseImage && (
                        <img src={data.baseImage} className="absolute inset-0 w-full h-full object-contain z-10 pointer-events-none" />
                    )}
                    
                    {/* Active Area Indicator (Middle) */}
                    <div 
                        onMouseDown={handleMouseDown}
                        className={`absolute border-2 border-red-500 bg-red-500/10 z-20 flex items-center justify-center text-red-500 font-bold hover:bg-red-500/20 transition-colors ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                        style={{
                            left: '50%',
                            top: '50%',
                            transform: `translate(-50%, -50%) translate(${data.maskOffset.x}px, ${data.maskOffset.y}px)`,
                            width: `${data.width * previewScale}px`, 
                            height: `${data.height * previewScale}px`,
                            borderRadius: data.shape === 'circle' ? '50%' : `${data.cornerRadius * 10}px`,
                            touchAction: 'none'
                        }}
                    >
                        <span className="bg-white/80 px-2 py-1 rounded text-xs pointer-events-none">Print Area</span>
                        
                        {/* Resize Handles */}
                        {['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w'].map(dir => (
                            <div 
                                key={dir}
                                onMouseDown={(e) => handleResizeMouseDown(e, dir)}
                                style={getHandleStyle(dir)}
                            />
                        ))}
                    </div>

                    {/* Mask Image Layer (Top) */}
                    {data.maskImage && (
                        <img src={data.maskImage} className="absolute inset-0 w-full h-full object-contain z-30 pointer-events-none" />
                    )}
                </div>
                <div className="absolute bottom-4 right-4 bg-white/90 p-2 rounded text-xs text-gray-500">
                    * 預覽圖僅供參考，實際比例依 DPI 設定為準
                </div>
            </div>
        </div>
    );
};

const PreviewTab = ({ data }: { data: ProductData }) => {
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [activeTool, setActiveTool] = useState<string | null>(null);
    const [isAiMenuOpen, setIsAiMenuOpen] = useState(false);
    
    // Assets State
    const [stickers, setStickers] = useState<string[]>([]);
    const [backgrounds, setBackgrounds] = useState<string[]>([]);
    const [activePanel, setActivePanel] = useState<'none' | 'stickers' | 'backgrounds' | 'barcode' | 'frames'>('none');
    const [barcodeText, setBarcodeText] = useState('/');
  
    const canvasRef = useRef<CanvasEditorRef>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
  
    // Load assets
    useEffect(() => {
        get('store_stickers').then(res => setStickers(res || []));
        get('store_backgrounds').then(res => setBackgrounds(res || []));
    }, []);
  
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (f) => {
          if (f.target?.result) {
            setUploadedImage(f.target.result as string);
          }
        };
        reader.readAsDataURL(file);
      }
    };
  
    const handleToolClick = (toolName: string) => {
      const lowerName = toolName.toLowerCase();
      
      if (lowerName === 'magic') {
          setIsAiMenuOpen(!isAiMenuOpen);
          setActivePanel('none');
      } else if (lowerName === 'stickers') {
          setActivePanel(activePanel === 'stickers' ? 'none' : 'stickers');
          setIsAiMenuOpen(false);
      } else if (lowerName === 'background') {
          setActivePanel(activePanel === 'backgrounds' ? 'none' : 'backgrounds');
          setIsAiMenuOpen(false);
      } else if (lowerName === 'barcode') {
          setActivePanel(activePanel === 'barcode' ? 'none' : 'barcode');
          setIsAiMenuOpen(false);
      } else if (lowerName === 'frames') {
          setActivePanel(activePanel === 'frames' ? 'none' : 'frames');
          setIsAiMenuOpen(false);
      } else {
          setActiveTool(toolName);
          setIsAiMenuOpen(false);
          setActivePanel('none');
      }
    };
  
    const handleAddAsset = (url: string, type: 'sticker' | 'background') => {
        if (canvasRef.current) {
            if (type === 'sticker') {
                canvasRef.current.addSticker(url);
            } else {
                canvasRef.current.addBackground(url);
            }
        }
    };
  
    const handleAddBarcode = () => {
        if (!barcodeText || barcodeText.length < 2) return;
        if (canvasRef.current) {
            // @ts-ignore
            if (canvasRef.current.addBarcode) {
                // @ts-ignore
                canvasRef.current.addBarcode(barcodeText);
            }
        }
        setActivePanel('none');
    };
  
    const handleApplyCrop = (shape: 'circle' | 'heart' | 'rounded' | 'none') => {
        if (canvasRef.current) {
            canvasRef.current.applyCrop(shape);
        }
        setActivePanel('none');
    };
  
    const handleAiStyleSelect = (styleId: string) => {
        setIsAiMenuOpen(false);
        if (canvasRef.current) {
            // @ts-ignore
            if (canvasRef.current.applyAiStyle) {
                // @ts-ignore
                canvasRef.current.applyAiStyle(styleId);
            }
        }
    };
  
    return (
      <div className="flex h-full min-h-[600px] w-full overflow-hidden bg-gray-50 text-gray-900 font-sans relative border border-gray-200 rounded-lg">
        {/* Hidden File Input */}
        <input 
          ref={fileInputRef}
          type="file" 
          className="hidden" 
          accept="image/*" 
          onChange={handleImageUpload} 
          onClick={(e) => (e.currentTarget.value = '')}
        />
  
        {/* Left Sidebar - Toolbar */}
        <aside className="hidden md:flex md:w-20 md:flex-col md:border-r md:order-first bg-white z-40 justify-start items-center py-6 space-y-4 h-full relative shadow-sm">
          
          {/* Tool: Upload Image */}
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="group relative flex flex-col items-center justify-center w-12 h-12 rounded-xl text-gray-500 hover:bg-blue-50 hover:text-blue-600 cursor-pointer transition-all duration-200 border border-transparent hover:border-blue-200"
            title="Upload Image"
          >
            <Upload className="w-5 h-5" />
            <span className="absolute left-14 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              Upload
            </span>
          </button>
  
          {/* Tool: Text */}
          <button 
            onClick={() => handleToolClick('Text')}
            className="group relative flex flex-col items-center justify-center w-12 h-12 rounded-xl text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-all duration-200 border border-transparent hover:border-blue-200"
            title="Add Text"
          >
            <Type className="w-5 h-5" />
            <span className="absolute left-14 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              Text
            </span>
          </button>
  
          {/* Tool: Stickers */}
          <button 
            onClick={() => handleToolClick('Stickers')}
            className={`group relative flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-200 border border-transparent hover:border-blue-200 ${activePanel === 'stickers' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600'}`}
            title="Stickers"
          >
            <Sticker className="w-5 h-5" />
            <span className="absolute left-14 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              Stickers
            </span>
          </button>
  
          {/* Tool: Background */}
          <button 
            onClick={() => handleToolClick('Background')}
            className={`group relative flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-200 border border-transparent hover:border-blue-200 ${activePanel === 'backgrounds' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600'}`}
            title="Background"
          >
            <Image className="w-5 h-5" />
            <span className="absolute left-14 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              Background
            </span>
          </button>
  
          {/* Tool: Barcode */}
          <button 
            onClick={() => handleToolClick('Barcode')}
            className={`group relative flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-200 border border-transparent hover:border-blue-200 ${activePanel === 'barcode' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600'}`}
            title="Mobile Barcode"
          >
            <ScanBarcode className="w-5 h-5" />
            <span className="absolute left-14 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              Barcode
            </span>
          </button>
  
          {/* Tool: Frames (Crop) */}
          <button 
            onClick={() => handleToolClick('Frames')}
            className={`group relative flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-200 border border-transparent hover:border-blue-200 ${activePanel === 'frames' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600'}`}
            title="Frames & Crop"
          >
            <Scissors className="w-5 h-5" />
            <span className="absolute left-14 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              Frames
            </span>
          </button>
  
          {/* Tool: Magic (AI) */}
          <button 
            onClick={() => handleToolClick('Magic')}
            className={`group relative flex flex-col items-center justify-center w-12 h-12 rounded-xl transition-all duration-200 border border-transparent hover:border-purple-200 ${isAiMenuOpen ? 'bg-purple-100 text-purple-600' : 'text-gray-500 hover:bg-purple-50 hover:text-purple-600'}`}
            title="AI Magic"
          >
            <Wand2 className="w-5 h-5" />
            <span className="absolute left-14 bg-gray-800 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              AI Magic
            </span>
          </button>
  
          {/* AI Style Menu (Popover) */}
          {isAiMenuOpen && (
              <div className="absolute left-20 top-60 ml-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 p-2 z-50 animate-in slide-in-from-left-2 fade-in duration-200">
                  <div className="flex items-center justify-between px-2 pb-2 mb-2 border-b border-gray-100">
                      <span className="text-xs font-semibold text-gray-500 flex items-center gap-1">
                          <Sparkles className="w-3 h-3 text-purple-500" />
                          Choose Style
                      </span>
                      <button onClick={() => setIsAiMenuOpen(false)} className="text-gray-400 hover:text-gray-600">
                          <X className="w-3 h-3" />
                      </button>
                  </div>
                  <div className="space-y-1">
                      {[
                          { id: 'Disney Style', label: 'Disney 3D' },
                          { id: 'Pixar Style', label: 'Pixar Cute' },
                          { id: 'Japanese Anime', label: 'Anime' },
                          { id: 'Chibi Style', label: 'Chibi' },
                          { id: 'Line Art', label: 'Line Art' },
                      ].map((style) => (
                          <button
                              key={style.id}
                              onClick={() => handleAiStyleSelect(style.id)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-purple-50 hover:text-purple-700 rounded-lg transition-colors"
                          >
                              {style.label}
                          </button>
                      ))}
                  </div>
              </div>
          )}
  
        </aside>
  
        {/* Center - Canvas Area */}
        <main className="flex-1 relative bg-gray-100 flex flex-col">
          {/* Assets Panel */}
          {activePanel !== 'none' && (
              <div className={`
                  absolute z-50 bg-white shadow-xl overflow-y-auto animate-in duration-200
                  md:left-0 md:top-0 md:bottom-0 md:w-64 md:border-r md:border-t-0 md:slide-in-from-left-5 md:rounded-none
                  fixed inset-x-0 bottom-0 top-auto h-[50vh] rounded-t-2xl border-t slide-in-from-bottom-5
              `}>
                  <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 sticky top-0 z-10">
                      <h3 className="font-bold text-gray-800 flex items-center gap-2">
                          {activePanel === 'stickers' && <><Sticker className="w-4 h-4"/> Stickers</>}
                          {activePanel === 'backgrounds' && <><Image className="w-4 h-4"/> Backgrounds</>}
                          {activePanel === 'barcode' && <><ScanBarcode className="w-4 h-4"/> Mobile Barcode</>}
                          {activePanel === 'frames' && <><Scissors className="w-4 h-4"/> Frames & Shapes</>}
                      </h3>
                      <button onClick={() => setActivePanel('none')} className="text-gray-400 hover:text-gray-600">
                          <X className="w-4 h-4" />
                      </button>
                  </div>
                  
                  {activePanel === 'barcode' ? (
                      <div className="p-6 space-y-4">
                          <div className="space-y-2">
                              <label className="text-sm font-medium text-gray-700">Enter Code (e.g. /ABC1234)</label>
                              <input 
                                  type="text" 
                                  value={barcodeText}
                                  onChange={(e) => setBarcodeText(e.target.value.toUpperCase())}
                                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono tracking-widest uppercase"
                                  placeholder="/ABC1234"
                                  maxLength={8}
                              />
                              <p className="text-xs text-gray-500">Taiwan E-Invoice Carrier format.</p>
                          </div>
                          <button 
                              onClick={handleAddBarcode}
                              disabled={!barcodeText || barcodeText.length < 2}
                              className="w-full py-2.5 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                          >
                              <ScanBarcode className="w-4 h-4" />
                              Generate Barcode
                          </button>
                      </div>
                  ) : activePanel === 'frames' ? (
                      <div className="p-4 space-y-6">
                          <div>
                              <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Basic Shapes</h4>
                              <div className="grid grid-cols-2 gap-3">
                                  <button 
                                      onClick={() => handleApplyCrop('circle')}
                                      className="flex flex-col items-center justify-center p-3 border border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 transition-all gap-2"
                                  >
                                      <Circle className="w-6 h-6 text-blue-600" />
                                      <span className="text-xs font-medium text-gray-600">Circle</span>
                                  </button>
                                  <button 
                                      onClick={() => handleApplyCrop('heart')}
                                      className="flex flex-col items-center justify-center p-3 border border-gray-200 rounded-xl hover:border-pink-500 hover:bg-pink-50 transition-all gap-2"
                                  >
                                      <Heart className="w-6 h-6 text-pink-600" />
                                      <span className="text-xs font-medium text-gray-600">Heart</span>
                                  </button>
                                  <button 
                                      onClick={() => handleApplyCrop('rounded')}
                                      className="flex flex-col items-center justify-center p-3 border border-gray-200 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all gap-2"
                                  >
                                      <Square className="w-6 h-6 text-indigo-600 rounded-md" />
                                      <span className="text-xs font-medium text-gray-600">Rounded</span>
                                  </button>
                                  <button 
                                      onClick={() => handleApplyCrop('none')}
                                      className="flex flex-col items-center justify-center p-3 border border-gray-200 rounded-xl hover:border-red-500 hover:bg-red-50 transition-all gap-2"
                                  >
                                      <Ban className="w-6 h-6 text-red-500" />
                                      <span className="text-xs font-medium text-gray-600">None</span>
                                  </button>
                              </div>
                          </div>
                      </div>
                  ) : (
                      <div className="p-4 grid grid-cols-2 gap-3">
                          {(activePanel === 'stickers' ? stickers : backgrounds).map((url, idx) => (
                              <button 
                                  key={idx} 
                                  onClick={() => handleAddAsset(url, activePanel === 'stickers' ? 'sticker' : 'background')}
                                  className="aspect-square rounded-lg border border-gray-200 p-2 hover:border-blue-500 hover:shadow-md transition-all bg-white flex items-center justify-center"
                              >
                                  <img src={url} alt="Asset" className="max-w-full max-h-full object-contain" />
                              </button>
                          ))}
                          {(activePanel === 'stickers' ? stickers : backgrounds).length === 0 && (
                              <div className="col-span-2 text-center text-sm text-gray-400 py-8">
                                  No items found. <br/> Upload in Admin.
                              </div>
                          )}
                      </div>
                  )}
              </div>
          )}
  
          <div className="flex-1 overflow-hidden relative flex flex-col">
            <CanvasEditor 
              ref={canvasRef}
              uploadedImage={uploadedImage} 
              activeTool={activeTool}
              onToolUsed={() => setActiveTool(null)}
              previewConfig={{
                  width: Math.round(data.width * data.dpi / 2.54),
                  height: Math.round(data.height * data.dpi / 2.54),
                  borderRadius: Math.round(data.cornerRadius * data.dpi / 2.54),
                  baseImage: data.baseImage || null,
                  maskImage: data.maskImage || null,
                  offset: {
                      x: (data.maskOffset.x / 20) * (data.dpi / 2.54),
                      y: (data.maskOffset.y / 20) * (data.dpi / 2.54)
                  }
              }}
              mobileActions={{
                  onUpload: () => fileInputRef.current?.click(),
                  onAddText: () => handleToolClick('Text'),
                  onOpenStickers: () => handleToolClick('Stickers'),
                  onOpenBackgrounds: () => handleToolClick('Background'),
                  onOpenBarcode: () => handleToolClick('Barcode'),
                  onOpenFrames: () => handleToolClick('Frames'),
                  onOpenAI: () => handleToolClick('Magic'),
                  onOpenProduct: () => {} // Seller preview doesn't need product switching
              }}
            />
          </div>
        </main>
      </div>
    );
};

// --- Main Component ---

const ProductEditor: React.FC = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [activeTab, setActiveTab] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    const [isLoadingData, setIsLoadingData] = useState(true);
    
    const [data, setData] = useState<ProductData>(DEFAULT_DATA);
    
    // Category Management
    const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
    const [isCategoriesLoaded, setIsCategoriesLoaded] = useState(false);

    // Load Categories
    useEffect(() => {
        get(CATEGORIES_KEY).then(saved => {
            if (saved && Array.isArray(saved)) {
                setCategories(saved);
            }
            setIsCategoriesLoaded(true);
        });
    }, []);

    // Save Categories
    useEffect(() => {
        if (isCategoriesLoaded) {
            set(CATEGORIES_KEY, categories);
        }
    }, [categories, isCategoriesLoaded]);

    const handleAddCategory = (name: string) => {
        if (name && name.trim()) {
            const id = name.trim();
            setCategories(prev => [...prev, { id, label: name.trim() }]);
            handleChange('category', id);
        }
    };

    const handleDeleteCategory = (id: string) => {
        if (confirm('確定要刪除此類別嗎？')) {
            setCategories(prev => prev.filter(c => c.id !== id));
            if (data.category === id) {
                handleChange('category', 'other');
            }
        }
    };

    const handleReorderCategories = (oldIndex: number, newIndex: number) => {
        setCategories((items) => arrayMove(items, oldIndex, newIndex));
    };

    // Brand Management
    const [brands, setBrands] = useState(DEFAULT_BRANDS);
    const [isBrandsLoaded, setIsBrandsLoaded] = useState(false);
    const [isAddingBrand, setIsAddingBrand] = useState(false); // Track if user is adding brand

    // Load Brands
    useEffect(() => {
        get(BRANDS_KEY).then(saved => {
            if (saved && Array.isArray(saved)) {
                setBrands(saved);
            }
            setIsBrandsLoaded(true);
        });
    }, []);

    // Save Brands
    useEffect(() => {
        if (isBrandsLoaded) {
            set(BRANDS_KEY, brands);
        }
    }, [brands, isBrandsLoaded]);

    const handleAddBrand = (name: string) => {
        if (name && name.trim()) {
            const id = name.trim();
            if (brands.some(b => b.id === id)) {
                alert('品牌已存在');
                return;
            }
            setBrands(prev => [...prev, { id, label: id }]);
            handleChange('brand', id);
            setIsAddingBrand(false); // Close adding mode after success
        }
    };

    const handleDeleteBrand = (id: string) => {
        if (confirm('確定要刪除此品牌嗎？')) {
            setBrands(prev => prev.filter(b => b.id !== id));
            if (data.brand === id) {
                handleChange('brand', '');
            }
        }
    };

    const handleReorderBrands = (oldIndex: number, newIndex: number) => {
        setBrands((items) => arrayMove(items, oldIndex, newIndex));
    };

    useEffect(() => {
        const loadData = async () => {
            if (id) {
                try {
                    // 1. Try Supabase
                    const { data: dbProduct } = await supabase
                        .from('products')
                        .select('*')
                        .eq('id', id)
                        .maybeSingle();

                    if (dbProduct) {
                        setData({ 
                            ...DEFAULT_DATA, 
                            name: dbProduct.name,
                            category: dbProduct.category,
                            brand: dbProduct.brand,
                            // Priority: Manual > DB > Default
                            width: dbProduct.specs?.manual_width || dbProduct.specs?.width || DEFAULT_DATA.width,
                            height: dbProduct.specs?.manual_height || dbProduct.specs?.height || DEFAULT_DATA.height,
                            bleed: dbProduct.specs?.bleed || DEFAULT_DATA.bleed,
                            cornerRadius: dbProduct.specs?.cornerRadius || DEFAULT_DATA.cornerRadius,
                            outputFormat: dbProduct.specs?.format || 'png',
                            dpi: dbProduct.specs?.dpi || 300,
                            colorSpace: dbProduct.specs?.colorSpace || 'RGB',
                            permissions: { ...DEFAULT_DATA.permissions, ...(dbProduct.permissions || {}) },
                            shape: dbProduct.mask_config?.shape || 'rect',
                            baseImage: dbProduct.base_image,
                            maskImage: dbProduct.mask_image,
                            maskOffset: dbProduct.mask_config?.offset || DEFAULT_DATA.maskOffset,
                            maskSize: dbProduct.mask_config?.size || DEFAULT_DATA.maskSize,
                            compatibilityTags: dbProduct.tags || []
                        });
                    } else {
                        console.error('Product not found in DB');
                        alert('找不到該商品，可能已被刪除。');
                        navigate('/seller/products');
                    }
                } catch (e) {
                    console.error("Failed to load product data", e);
                }
            }
            setIsLoadingData(false);
        };
        loadData();
    }, [id]);

    const tabs = [
        { name: '基本設置', icon: <Settings className="w-4 h-4" /> },
        { name: '屬性設置', icon: <Sliders className="w-4 h-4" /> },
        { name: '模型頁設置', icon: <Smartphone className="w-4 h-4" /> },
        { name: '效果預覽', icon: <Eye className="w-4 h-4" /> },
    ];

    const handleChange = (key: keyof ProductData, value: any) => {
        setData(prev => ({ ...prev, [key]: value }));
    };

    const handleDeepChange = (path: string[], value: any) => {
        setData(prev => {
            const newData = { ...prev };
            let current: any = newData;
            for (let i = 0; i < path.length - 1; i++) {
                current = current[path[i]];
            }
            current[path[path.length - 1]] = value;
            return newData;
        });
    };

    const handleSave = async () => {
        if (!data.name) {
            alert('請輸入模型名稱！');
            setActiveTab(0);
            return;
        }

        if (data.category === 'phone-case' && !data.brand) {
            alert('請選擇品牌 (Brand)！手機殼類別必須設定品牌，否則前台無法正確分類。');
            setActiveTab(0);
            return;
        }

        setIsSaving(true);
        
        try {
            // Construct DB object
            const dbProduct = {
                id: id || `prod_${Date.now()}`,
                name: data.name,
                category: data.category,
                brand: data.brand,
                thumbnail: data.baseImage || 'https://placehold.co/300x400?text=No+Image',
                base_image: data.baseImage,
                mask_image: data.maskImage,
                specs: {
                    width: data.width,
                    height: data.height,
                    // Enforce Manual Authority
                    manual_width: data.width,
                    manual_height: data.height,
                    
                    bleed: data.bleed,
                    cornerRadius: data.cornerRadius,
                    dpi: data.dpi,
                    format: data.outputFormat,
                    colorSpace: data.colorSpace,
                    dimensions: `${data.width} x ${data.height} cm`
                },
                mask_config: {
                    offset: data.maskOffset,
                    size: data.maskSize,
                    shape: data.shape
                },
                permissions: data.permissions,
                tags: data.compatibilityTags,
                is_active: true,
                created_at: new Date().toISOString()
            };

            const { error } = await supabase.from('products').upsert(dbProduct);
            
            if (error) throw error;
            
            setIsSaving(false);
            alert('模型已成功保存！');
            navigate('/seller/products');
        } catch (error: any) {
            console.error("Save failed", error);
            setIsSaving(false);
            alert('保存失敗: ' + error.message);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Top Bar */}
            <header className="bg-white shadow-sm border-b sticky top-0 z-30">
                <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <button onClick={() => navigate('/seller/products')} className="p-2 hover:bg-gray-100 rounded-full">
                            <ChevronLeft className="w-5 h-5 text-gray-600" />
                        </button>
                        <h1 className="text-lg font-bold text-gray-900">{id ? '編輯模型' : '添加商品模型'}</h1>
                    </div>
                    <div className="flex gap-3">
                        <button className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">查看教程</button>
                        <button 
                            onClick={handleSave}
                            disabled={isSaving}
                            className={`px-4 py-2 bg-red-600 text-white rounded-lg flex items-center gap-2 font-medium shadow-sm ${isSaving ? 'opacity-70 cursor-not-allowed' : 'hover:bg-red-700'}`}
                        >
                            {isSaving ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                    保存中...
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4" />
                                    保存模型
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </header>

            {/* Tab Navigation */}
            <div className="bg-white border-b sticky top-16 z-20">
                <div className="max-w-7xl mx-auto px-4 flex">
                    {tabs.map((tab, index) => (
                        <button
                            key={index}
                            onClick={() => setActiveTab(index)}
                            className={`flex items-center gap-2 px-6 py-4 text-sm font-medium border-b-2 transition-colors ${
                                activeTab === index 
                                    ? 'border-red-500 text-red-600 bg-red-50/50' 
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                            }`}
                        >
                            {tab.icon}
                            {tab.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <main className="flex-1 max-w-7xl mx-auto w-full px-4 py-8">
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 min-h-[600px]">
                    {activeTab === 0 && (
                        <BasicSettingsTab 
                            data={data} 
                            onChange={handleChange} 
                            categories={categories}
                            onAddCategory={handleAddCategory}
                            onDeleteCategory={handleDeleteCategory}
                            onReorder={handleReorderCategories}
                            brands={brands}
                            onAddBrand={handleAddBrand}
                            onDeleteBrand={handleDeleteBrand}
                            onReorderBrands={handleReorderBrands}
                        />
                    )}
                    {activeTab === 1 && <PropertySettingsTab data={data} onChange={handleChange} onDeepChange={handleDeepChange} />}
                    {activeTab === 2 && <ModelSettingsTab data={data} onChange={handleChange} onDeepChange={handleDeepChange} productId={id} />}
                    {activeTab === 3 && <PreviewTab data={data} />}
                </div>
            </main>
        </div>
    );
};

export default ProductEditor;
