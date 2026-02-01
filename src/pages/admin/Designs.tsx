import { useState, useEffect } from 'react';
import { get, update } from 'idb-keyval';
import { supabase } from '../../lib/supabase';
import { listDesignTemplates, createDesignTemplate, DesignTemplate } from '../../lib/designTemplates';
import { Upload, Trash2, Search, FileImage, Layers, Loader2, Edit2, X, Plus, GripVertical, Save, Copy, ExternalLink, Database } from 'lucide-react';
// @ts-ignore
import { readPsd } from 'ag-psd';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const DEFAULT_DESIGN_CATEGORIES = [
    '熱門設計',
    '節慶主題',
    '風格插畫',
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

const NEW_MIGRATION_SQL = `-- 1) table 
create table if not exists public.design_templates ( 
  id uuid primary key default gen_random_uuid(), 
  name text not null, 
  category text null,
  tags text[] not null default '{}'::text[], 
  is_featured boolean not null default false,
  is_active boolean not null default true, 

  preview_bucket text not null default 'design-previews', 
  preview_path text null,
  file_bucket text not null default 'design-assets', 
  file_path text not null,

  file_type text null,
  created_at timestamptz not null default now(), 
  updated_at timestamptz not null default now() 
); 

-- 2) RLS
alter table public.design_templates enable row level security;
create policy "Public can view active designs" on public.design_templates for select using (is_active = true);
create policy "Admins can do everything" on public.design_templates for all using (auth.role() = 'authenticated');
`;

const STORAGE_MIGRATION_SQL = `-- Create Buckets & Policies
insert into storage.buckets (id, name, public) values ('design-assets', 'design-assets', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('design-previews', 'design-previews', true) on conflict (id) do nothing;

create policy "Public Access Assets" on storage.objects for select using ( bucket_id = 'design-assets' );
create policy "Auth Upload Assets" on storage.objects for insert with check ( bucket_id = 'design-assets' and auth.role() = 'authenticated' );
create policy "Auth Update Assets" on storage.objects for update using ( bucket_id = 'design-assets' and auth.role() = 'authenticated' );
create policy "Auth Delete Assets" on storage.objects for delete using ( bucket_id = 'design-assets' and auth.role() = 'authenticated' );

create policy "Public Access Previews" on storage.objects for select using ( bucket_id = 'design-previews' );
create policy "Auth Upload Previews" on storage.objects for insert with check ( bucket_id = 'design-previews' and auth.role() = 'authenticated' );
create policy "Auth Update Previews" on storage.objects for update using ( bucket_id = 'design-previews' and auth.role() = 'authenticated' );
create policy "Auth Delete Previews" on storage.objects for delete using ( bucket_id = 'design-previews' and auth.role() = 'authenticated' );
`;

export const FIX_RLS_SQL = `-- FIX_RLS_SQL_V2
begin;

-- 0) 確保 RLS 有開（沒開就算你寫 policy 也可能怪怪的）
alter table if exists public.design_templates enable row level security;
alter table if exists storage.objects enable row level security;

-- 1) 確保 anon/authenticated 有 table 權限（很多人只寫 policy 忘了 GRANT）
grant usage on schema public to anon, authenticated;
grant select on public.design_templates to anon, authenticated;
grant insert, update, delete on public.design_templates to authenticated;

-- 2) design_templates：前台 anon 可讀 is_active=true
drop policy if exists "Public can view active designs" on public.design_templates;
create policy "Public can view active designs"
on public.design_templates for select
to anon, authenticated
using (is_active = true);

-- 3) design_templates：後台登入者可管理（MVP 先放寬 authenticated）
drop policy if exists "Authenticated can manage designs" on public.design_templates;
create policy "Authenticated can manage designs"
on public.design_templates for all
to authenticated
using (true)
with check (true);

-- 4) Storage bucket 設為 public（走 public url 才不會卡 signed url）
update storage.buckets
set public = true
where id in ('design-assets','design-previews');

-- 5) Storage 權限與 policies（保險起見補齊）
grant usage on schema storage to anon, authenticated;
grant select on storage.objects to anon, authenticated;
grant insert, update, delete on storage.objects to authenticated;

drop policy if exists "Public read design buckets" on storage.objects;
create policy "Public read design buckets"
on storage.objects for select
to anon, authenticated
using (bucket_id in ('design-assets','design-previews'));

drop policy if exists "Auth insert design buckets" on storage.objects;
create policy "Auth insert design buckets"
on storage.objects for insert
to authenticated
with check (bucket_id in ('design-assets','design-previews'));

drop policy if exists "Auth update design buckets" on storage.objects;
create policy "Auth update design buckets"
on storage.objects for update
to authenticated
using (bucket_id in ('design-assets','design-previews'))
with check (bucket_id in ('design-assets','design-previews'));

drop policy if exists "Auth delete design buckets" on storage.objects;
create policy "Auth delete design buckets"
on storage.objects for delete
to authenticated
using (bucket_id in ('design-assets','design-previews'));

commit;`;

export default function AdminDesigns() {
    const [designs, setDesigns] = useState<DesignTemplate[]>([]);
    const [isUploading, setIsUploading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('全部');
    
    // Categories
    const [categories, setCategories] = useState<string[]>(DEFAULT_DESIGN_CATEGORIES);
    const [isAddingCategory, setIsAddingCategory] = useState(false);
    const [newCategory, setNewCategory] = useState('');

    // Edit Modal
    const [editingDesign, setEditingDesign] = useState<DesignTemplate | null>(null);

    // Error State
    const [tableError, setTableError] = useState(false);
    const [storageError, setStorageError] = useState(false);

    useEffect(() => {
        // Debounce search
        const timer = setTimeout(() => {
            fetchData();
        }, 300);
        return () => clearTimeout(timer);
    }, [searchTerm, selectedCategory]);

    useEffect(() => {
        loadCategories();
    }, []);

    const fetchData = async () => {
        try {
            setTableError(false);
            const { data } = await listDesignTemplates({
                category: selectedCategory,
                search: searchTerm,
                limit: 100
            });
            setDesigns(data);
        } catch (error: any) {
            if (error.message?.includes('AbortError') || error.message?.includes('signal is aborted')) {
                 return;
            }
            console.error("Failed to load designs:", error);
            if (error.code === 'PGRST205' || error.message?.includes('does not exist') || error.message?.includes('design_templates')) {
                setTableError(true);
            }
        }
    };

    const loadCategories = async () => {
        const savedCats = await get('design_categories');
        if (savedCats && Array.isArray(savedCats)) {
            setCategories(savedCats);
        }
    };

    // --- Category Management ---
    const handleAddCategory = async () => {
        if (!newCategory.trim()) return;
        const updated = [...categories, newCategory.trim()];
        setCategories(updated);
        await update('design_categories', () => updated);
        setNewCategory('');
    };

    const handleDeleteCategory = async (catToDelete: string) => {
        if (catToDelete === '未分類' || !confirm(`確定要刪除分類「${catToDelete}」嗎？`)) return;
        const updated = categories.filter(c => c !== catToDelete);
        setCategories(updated);
        await update('design_categories', () => updated);
    };

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = categories.indexOf(active.id as string);
            const newIndex = categories.indexOf(over.id as string);
            const newCategories = arrayMove(categories, oldIndex, newIndex);
            setCategories(newCategories);
            await update('design_categories', () => newCategories);
        }
    };

    // --- Design Actions ---
    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (tableError) {
            alert("請先修復資料庫錯誤 (請見頁面上方提示)");
            e.target.value = '';
            return;
        }

        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const ext = file.name.split('.').pop()?.toLowerCase();
            let previewFile: File | undefined = undefined;

            // Generate Preview
            if (ext === 'psd') {
                const arrayBuffer = await file.arrayBuffer();
                const psd = readPsd(arrayBuffer);
                if (psd.canvas) {
                    const blob = await new Promise<Blob | null>(resolve => psd.canvas.toBlob(resolve, 'image/png'));
                    if (blob) {
                        previewFile = new File([blob], `preview-${file.name}.png`, { type: 'image/png' });
                    }
                }
            } else if (['jpg', 'jpeg', 'png'].includes(ext || '')) {
                // For images, we can use the file itself as preview, or create a smaller thumbnail
                // For simplicity, let's just use the file itself as preview for now, 
                // or we could resize it in browser canvas.
                // Let's pass the same file as preview to ensure we have a 'preview' bucket entry 
                // (though logic in createDesignTemplate allows skipping if it's image, but having a dedicated preview path is consistent)
                previewFile = file;
            }

            await createDesignTemplate({
                name: file.name.replace(/\.[^/.]+$/, ""),
                category: selectedCategory === '全部' ? '未分類' : selectedCategory,
                tags: [],
                isFeatured: false,
                fileType: ext || 'unknown'
            }, file, previewFile);

            await fetchData(); // Refresh list

        } catch (error: any) {
            console.error("File processing failed:", error);
            
            if (error.message?.includes('Bucket not found') || error.error === 'Bucket not found' || error.statusCode === '404') {
                setStorageError(true);
                alert("Storage Bucket 不存在，請執行上方 SQL 腳本建立 Bucket。");
            } else {
                alert(error.message || "檔案處理失敗");
            }
        } finally {
            setIsUploading(false);
            e.target.value = '';
        }
    };

    const handleDeleteDesign = async (id: string) => {
        if (!confirm('確定要刪除此設計嗎？')) return;
        
        try {
            const { error } = await supabase.from('design_templates').delete().eq('id', id);
            if (error) throw error;
            // Also need to delete storage files, but for now just DB record
            setDesigns(prev => prev.filter(d => d.id !== id));
        } catch (error) {
            console.error("Delete failed:", error);
            alert("刪除失敗");
        }
    };

    const openEditModal = (design: DesignTemplate) => {
        setEditingDesign({ ...design });
    };

    const saveEdit = async () => {
        if (!editingDesign) return;
        
        try {
            const { error } = await supabase
                .from('design_templates')
                .update({
                    name: editingDesign.name,
                    category: editingDesign.category,
                    tags: editingDesign.tags,
                    is_featured: editingDesign.isFeatured,
                    is_active: editingDesign.isActive
                })
                .eq('id', editingDesign.id);

            if (error) throw error;

            setDesigns(prev => prev.map(d => d.id === editingDesign.id ? editingDesign : d));
            setEditingDesign(null);
        } catch (error) {
            console.error("Update failed:", error);
            alert("更新失敗");
        }
    };

    const handleCopyLink = (design: DesignTemplate) => {
        // Public link feature was for old designs.json/store_designs with slug.
        // New system might not have slug yet (schema doesn't have it).
        // User schema provided in prompt doesn't have 'slug'.
        // So public link might not be supported or needs ID-based link.
        // Prompt says: "Supports 'Public Link' ... (/t/:slug)" in MEMORY, 
        // but NEW schema in prompt Step B does NOT have slug.
        // However, Step C mentions "URL generation: previewUrl...".
        // Step D says "Card displays: previewUrl...".
        // It does NOT explicitly ask for Slug support in the new schema.
        // I will comment out slug/link functionality for now or use ID.
        // If I need to support /t/:slug, I should have added slug column.
        // But user provided the schema in Step B explicitly, and it lacks 'slug'.
        // So I will assume we don't need the public link copy feature for now, or just copy the file URL.
        // Wait, User Memory says "Public Template Link Implementation ... (/t/:slug)".
        // If I remove slug, I break that feature.
        // But the user gave me a schema to apply.
        // I should probably stick to the user's explicit schema instructions for this task.
        // I will disable the "Copy Link" button or make it copy the direct image link.
        if (design.fileUrl) {
            navigator.clipboard.writeText(design.fileUrl);
            alert("原始檔連結已複製");
        }
    };

    return (
        <>
            <header className="h-16 bg-white border-b border-gray-200 flex items-center px-8 shadow-sm">
                <h1 className="text-xl font-semibold text-gray-800">設計管理 (PSD/圖片)</h1>
            </header>

            <div className="p-8 max-w-5xl mx-auto">
                {/* Database Error Alert */}
                {(tableError || storageError) && (
                    <div className="mb-8 bg-red-50 border border-red-200 rounded-xl p-6 shadow-sm animate-in fade-in slide-in-from-top-4">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-red-100 rounded-full shrink-0">
                                <Database className="w-6 h-6 text-red-600" />
                            </div>
                            <div className="flex-1">
                                <h3 className="text-lg font-bold text-gray-900 mb-2">
                                    {tableError ? '資料庫尚未設定' : 'Storage Bucket 尚未建立'}
                                </h3>
                                <p className="text-gray-600 mb-4">
                                    {tableError 
                                        ? <>系統偵測到 Supabase 中缺少必要的 <code>design_templates</code> 資料表。</>
                                        : <>系統偵測到 Supabase 中缺少必要的 Storage Buckets (<code>design-assets</code>, <code>design-previews</code>)。</>
                                    }
                                    請在 Supabase SQL Editor 中執行以下腳本：
                                </p>
                                <div className="relative">
                                    <pre className="bg-gray-800 text-gray-200 p-4 rounded-lg text-xs overflow-x-auto font-mono max-h-64">
                                        {tableError ? NEW_MIGRATION_SQL : (storageError ? STORAGE_MIGRATION_SQL : FIX_RLS_SQL)}
                                    </pre>
                                    <button 
                                        onClick={() => {
                                            navigator.clipboard.writeText(tableError ? NEW_MIGRATION_SQL : (storageError ? STORAGE_MIGRATION_SQL : FIX_RLS_SQL));
                                            alert("SQL 腳本已複製！");
                                        }}
                                        className="absolute top-2 right-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded border border-white/20 backdrop-blur-sm transition-colors flex items-center gap-2"
                                    >
                                        <Copy className="w-3 h-3" /> 複製 SQL
                                    </button>
                                </div>
                                <div className="mt-2 text-right">
                                    <button
                                        onClick={() => {
                                            navigator.clipboard.writeText(FIX_RLS_SQL);
                                            alert("RLS 修復腳本已複製！");
                                        }}
                                        className="text-xs text-red-600 underline hover:text-red-800"
                                    >
                                        前台看不到資料？點此複製 RLS 修復腳本
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <div className="p-8">
                        {/* Search & Filter Bar */}
                        <div className="mb-8 space-y-4">
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                    <Search className="w-5 h-5" />
                                </div>
                                <input 
                                    type="text" 
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    placeholder="搜尋設計名稱或標籤..."
                                    className="block w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                />
                            </div>

                            <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                                <div className="flex items-center px-4 py-2 bg-gray-100 text-gray-600 rounded-md text-sm font-medium whitespace-nowrap">
                                    設計分類
                                </div>
                                <button
                                    onClick={() => setSelectedCategory('全部')}
                                    className={`px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${selectedCategory === '全部' ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
                                >
                                    全部
                                </button>
                                {categories.map(cat => (
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
                            <label className={`flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                    {isUploading ? (
                                        <Loader2 className="w-10 h-10 mb-3 text-blue-500 animate-spin" />
                                    ) : (
                                        <Upload className="w-10 h-10 mb-3 text-gray-400" />
                                    )}
                                    <p className="mb-2 text-sm text-gray-500">
                                        {isUploading ? '正在處理檔案...' : <><span className="font-semibold">點擊上傳設計檔案</span></>}
                                    </p>
                                    <p className="text-xs text-gray-500">支援 PSD, JPG, PNG, AI 格式</p>
                                </div>
                                <input 
                                    type="file" 
                                    className="hidden" 
                                    accept=".psd,.jpg,.jpeg,.png,.ai"
                                    onChange={handleFileUpload}
                                    disabled={isUploading}
                                />
                            </label>
                        </div>

                        {/* Gallery */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                            {designs.map((design) => (
                                <div key={design.id} className="bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-shadow group relative flex flex-col">
                                    <div className="aspect-square bg-gray-100 relative shrink-0">
                                        {design.previewUrl ? (
                                            <img src={design.previewUrl} alt={design.name} className="w-full h-full object-contain p-2" />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-gray-400">
                                                <FileImage className="w-8 h-8" />
                                            </div>
                                        )}
                                        
                                        {/* Status Badge */}
                                        <div className="absolute top-1 left-1 flex gap-1">
                                            {design.isActive ? (
                                                <div className="bg-green-500 w-2 h-2 rounded-full ring-2 ring-white" title="啟用中"></div>
                                            ) : (
                                                <div className="bg-gray-300 w-2 h-2 rounded-full ring-2 ring-white" title="已停用"></div>
                                            )}
                                            {design.isFeatured && (
                                                 <div className="bg-yellow-400 w-2 h-2 rounded-full ring-2 ring-white" title="熱門設計"></div>
                                            )}
                                        </div>

                                        {/* Actions Overlay */}
                                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1">
                                            <button 
                                                onClick={() => openEditModal(design)}
                                                className="p-1.5 bg-white text-gray-700 rounded-full hover:bg-blue-50 hover:text-blue-600 transition-colors shadow-sm"
                                                title="編輯資訊"
                                            >
                                                <Edit2 className="w-3.5 h-3.5" />
                                            </button>
                                            <button 
                                                onClick={() => handleDeleteDesign(design.id)}
                                                className="p-1.5 bg-white text-gray-700 rounded-full hover:bg-red-50 hover:text-red-600 transition-colors shadow-sm"
                                                title="刪除設計"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div className="p-3 flex-1 flex flex-col min-w-0">
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <h3 className="font-medium text-gray-800 text-sm truncate flex-1">{design.name}</h3>
                                            <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded flex-shrink-0">{design.category || '未分類'}</span>
                                        </div>
                                        
                                        <div className="text-xs text-gray-400 mb-2 flex items-center gap-1">
                                            <span className="uppercase">{design.fileType}</span>
                                        </div>

                                        {/* Copy Link Section */}
                                        <div className="mt-auto pt-2 border-t border-gray-100 flex items-center gap-1">
                                            <button
                                                onClick={() => handleCopyLink(design)}
                                                className="p-1 hover:bg-gray-100 text-gray-500 hover:text-gray-700 rounded transition-colors ml-auto"
                                                title="複製檔案連結"
                                            >
                                                <Copy className="w-3 h-3" />
                                            </button>
                                            <a 
                                                href={design.fileUrl} 
                                                target="_blank" 
                                                rel="noopener noreferrer"
                                                className="p-1 hover:bg-gray-100 text-gray-500 hover:text-gray-700 rounded transition-colors"
                                                title="下載原始檔"
                                            >
                                                <ExternalLink className="w-3 h-3" />
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {designs.length === 0 && !isUploading && (
                            <div className="text-center py-12">
                                <p className="text-gray-400 mb-2">找不到符合條件的設計。</p>
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
                </div>
            </div>

            {/* Edit Modal */}
            {editingDesign && (
                <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
                        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10">
                            <h3 className="font-bold text-gray-800">編輯設計資訊</h3>
                            <button onClick={() => setEditingDesign(null)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                        
                        <div className="p-6 space-y-4">
                            <div className="flex justify-center mb-4">
                                <div className="w-32 h-20 bg-gray-50 border rounded-lg p-2 flex items-center justify-center">
                                    <img src={editingDesign.previewUrl || ''} alt="Preview" className="max-w-full max-h-full object-contain" />
                                </div>
                            </div>

                            {/* Active Switch */}
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <div>
                                    <label className="text-sm font-medium text-gray-900 block">啟用狀態</label>
                                    <span className="text-xs text-gray-500">控制是否在前台顯示</span>
                                </div>
                                <button 
                                    onClick={() => setEditingDesign({...editingDesign, isActive: !editingDesign.isActive})}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${editingDesign.isActive ? 'bg-blue-600' : 'bg-gray-200'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editingDesign.isActive ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            {/* Featured Switch */}
                            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                                <div>
                                    <label className="text-sm font-medium text-gray-900 block">熱門設計</label>
                                    <span className="text-xs text-gray-500">是否在「熱門設計」分類顯示</span>
                                </div>
                                <button 
                                    onClick={() => setEditingDesign({...editingDesign, isFeatured: !editingDesign.isFeatured})}
                                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${editingDesign.isFeatured ? 'bg-yellow-400' : 'bg-gray-200'}`}
                                >
                                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${editingDesign.isFeatured ? 'translate-x-6' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">設計名稱</label>
                                <input 
                                    type="text" 
                                    value={editingDesign.name}
                                    onChange={(e) => setEditingDesign({...editingDesign, name: e.target.value})}
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
                                                    items={categories}
                                                    strategy={verticalListSortingStrategy}
                                                >
                                                    {categories.map((cat) => (
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
                                        value={editingDesign.category || '未分類'}
                                        onChange={(e) => setEditingDesign({...editingDesign, category: e.target.value})}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    >
                                        {categories.map(cat => (
                                            <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">標籤 (以逗號分隔)</label>
                                <input 
                                    type="text" 
                                    value={editingDesign.tags.join(', ')}
                                    onChange={(e) => setEditingDesign({...editingDesign, tags: e.target.value.split(',').map(t => t.trim()).filter(Boolean)})}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                                    placeholder="例如: 可愛, 紅色, 新年"
                                />
                            </div>
                        </div>

                        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 sticky bottom-0 z-10">
                            <button 
                                onClick={() => setEditingDesign(null)}
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
