import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, RefreshCw, Trash2, Search, ImageIcon, FolderOpen, ExternalLink } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { format } from 'date-fns';

// ─── Type Definitions ───────────────────────────────────────────────
interface StorageFile {
    id?: string;
    name: string;
    metadata?: { size?: number; mimetype?: string };
    created_at?: string;
}

interface AssetRecord {
    id: string;
    url: string;
    name: string;
    type: 'sticker' | 'background' | 'frame';
    category: string;
    created_at: string;
}

interface DesignRecord {
    id: string;
    design_id: string;
    product_name: string;
    phone_model: string;
    preview_image: string | null;
    created_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────
const TYPE_LABEL: Record<string, string> = {
    sticker: '貼圖',
    background: '背景',
    frame: '相框',
};
const TYPE_COLOR: Record<string, string> = {
    sticker: 'bg-yellow-100 text-yellow-700',
    background: 'bg-blue-100 text-blue-700',
    frame: 'bg-purple-100 text-purple-700',
};

export default function MediaLibrary() {
    const [activeTab, setActiveTab] = useState<'models' | 'assets' | 'designs'>('models');

    // ── models tab ──────────────────────────────────────────────────
    const [modelFiles, setModelFiles] = useState<StorageFile[]>([]);
    const [selectedModelFiles, setSelectedModelFiles] = useState<Set<string>>(new Set());

    // ── assets tab ──────────────────────────────────────────────────
    const [assetRecords, setAssetRecords] = useState<AssetRecord[]>([]);

    // ── designs tab ─────────────────────────────────────────────────
    const [designRecords, setDesignRecords] = useState<DesignRecord[]>([]);

    const [isLoading, setIsLoading] = useState(false);
    const [search, setSearch] = useState('');

    // ── Fetch by tab ─────────────────────────────────────────────────
    const fetchFiles = async () => {
        setIsLoading(true);
        setSelectedModelFiles(new Set());

        try {
            if (activeTab === 'models') {
                const { data, error } = await supabase.storage.from('models').list('', {
                    limit: 1000,
                    sortBy: { column: 'created_at', order: 'desc' },
                });
                if (error) throw error;
                setModelFiles(data?.filter(f => f.name !== '.emptyFolderPlaceholder') || []);

            } else if (activeTab === 'assets') {
                const { data, error } = await supabase
                    .from('assets')
                    .select('id, url, name, type, category, created_at')
                    .in('type', ['sticker', 'background', 'frame'])
                    .order('created_at', { ascending: false });
                if (error) throw error;
                setAssetRecords((data as AssetRecord[]) || []);

            } else if (activeTab === 'designs') {
                const { data, error } = await supabase
                    .from('custom_designs')
                    .select('id, design_id, product_name, phone_model, preview_image, created_at')
                    .order('created_at', { ascending: false })
                    .limit(500);
                if (error) throw error;
                setDesignRecords((data as DesignRecord[]) || []);
            }
        } catch (error) {
            console.error('Error fetching files:', error);
            alert('載入資料失敗');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        setSearch('');
        fetchFiles();
    }, [activeTab]);

    // ── Model file delete ───────────────────────────────────────────
    const handleDeleteModels = async (fileNames: string[]) => {
        if (!window.confirm(`確定要刪除這 ${fileNames.length} 個檔案嗎？\n此動作無法復原！`)) return;
        setIsLoading(true);
        try {
            const { error } = await supabase.storage.from('models').remove(fileNames);
            if (error) throw error;
            await fetchFiles();
        } catch (error) {
            console.error('Error deleting files:', error);
            alert('刪除檔案失敗');
        } finally {
            setIsLoading(false);
        }
    };

    // ── Asset record delete ─────────────────────────────────────────
    const handleDeleteAsset = async (id: string) => {
        if (!window.confirm('確定要刪除此素材嗎？')) return;
        try {
            const { error } = await supabase.from('assets').delete().eq('id', id);
            if (error) throw error;
            setAssetRecords(prev => prev.filter(a => a.id !== id));
        } catch (err: any) {
            console.error('Delete asset failed:', err);
            alert('刪除失敗：' + err.message);
        }
    };

    // ── Design record delete ────────────────────────────────────────
    const handleDeleteDesign = async (designId: string) => {
        if (!window.confirm('確定要刪除此設計嗎？')) return;
        try {
            const { error } = await supabase.rpc('delete_custom_designs_admin', {
                design_ids: [designId],
            });
            if (error) throw error;
            setDesignRecords(prev => prev.filter(d => d.design_id !== designId));
        } catch (err: any) {
            console.error('Delete design failed:', err);
            alert('刪除失敗：' + err.message);
        }
    };

    // ── Model file toggle select ────────────────────────────────────
    const toggleModelSelect = (name: string) => {
        const next = new Set(selectedModelFiles);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        setSelectedModelFiles(next);
    };

    const getModelPublicUrl = (name: string) =>
        supabase.storage.from('models').getPublicUrl(name).data.publicUrl;

    // ── Filtered lists ──────────────────────────────────────────────
    const q = search.toLowerCase();
    const filteredModelFiles = modelFiles.filter(f => f.name.toLowerCase().includes(q));
    const filteredAssets = assetRecords.filter(
        a => a.name.toLowerCase().includes(q) || a.type.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
    );
    const filteredDesigns = designRecords.filter(
        d =>
            d.design_id.toLowerCase().includes(q) ||
            (d.product_name || '').toLowerCase().includes(q) ||
            (d.phone_model || '').toLowerCase().includes(q)
    );

    const totalCount =
        activeTab === 'models'
            ? filteredModelFiles.length
            : activeTab === 'assets'
            ? filteredAssets.length
            : filteredDesigns.length;

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold mb-1">媒體庫 (全域儲存空間)</h1>
                    <p className="text-gray-500">瀏覽與管理 Supabase Storage 及 DB 內的檔案</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-4 mb-6">
                {[
                    { id: 'models', label: '設計模板 (Models)' },
                    { id: 'assets', label: '素材圖片 (Assets)' },
                    { id: 'designs', label: '客戶設計大圖 (Designs)' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                            activeTab === tab.id
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-white text-gray-600 hover:bg-gray-100'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[70vh]">
                {/* Toolbar */}
                <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="relative max-w-xs w-full">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="搜尋名稱..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                        <span className="text-sm text-gray-400 whitespace-nowrap">{totalCount} 筆</span>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={fetchFiles}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                            重新整理
                        </button>

                        {/* Bulk delete for models tab */}
                        {activeTab === 'models' && selectedModelFiles.size > 0 && (
                            <button
                                onClick={() => handleDeleteModels(Array.from(selectedModelFiles))}
                                className="flex items-center gap-2 px-3 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
                            >
                                <Trash2 className="w-4 h-4" />
                                刪除所選 ({selectedModelFiles.size})
                            </button>
                        )}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <Loader2 className="w-8 h-8 animate-spin mb-2" />
                            載入中...
                        </div>
                    ) : totalCount === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <FolderOpen className="w-12 h-12 mb-3 text-gray-300" />
                            沒有找到資料
                        </div>
                    ) : (
                        <>
                            {/* ── Models Grid (Storage files) ── */}
                            {activeTab === 'models' && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                                    {filteredModelFiles.map(file => {
                                        const url = getModelPublicUrl(file.name);
                                        const isSelected = selectedModelFiles.has(file.name);
                                        const isImage = file.metadata?.mimetype?.startsWith('image/') ||
                                            file.name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i);

                                        return (
                                            <div
                                                key={file.id || file.name}
                                                title={file.name}
                                                className={`relative group bg-white border rounded-lg overflow-hidden cursor-pointer hover:shadow-md transition-all ${
                                                    isSelected
                                                        ? 'ring-2 ring-blue-500 border-transparent shadow-sm'
                                                        : 'border-gray-200'
                                                }`}
                                                onClick={() => toggleModelSelect(file.name)}
                                            >
                                                <div className="aspect-square bg-gray-100 flex items-center justify-center relative">
                                                    {isImage ? (
                                                        <img
                                                            src={url}
                                                            alt={file.name}
                                                            className="w-full h-full object-cover"
                                                            loading="lazy"
                                                        />
                                                    ) : (
                                                        <ImageIcon className="w-8 h-8 text-gray-400" />
                                                    )}
                                                    <div
                                                        className={`absolute top-2 left-2 w-5 h-5 rounded-full border-2 ${
                                                            isSelected
                                                                ? 'bg-blue-500 border-blue-500 text-white'
                                                                : 'border-white/80 bg-black/20 group-hover:border-white opacity-0 group-hover:opacity-100 transition-opacity'
                                                        } flex items-center justify-center`}
                                                    >
                                                        {isSelected && (
                                                            <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                                                <polyline points="20 6 9 17 4 12" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="p-2 text-xs truncate">
                                                    <div className="font-medium text-gray-800 truncate" title={file.name}>{file.name}</div>
                                                    <div className="text-gray-500 mt-0.5 flex justify-between">
                                                        <span>{formatBytes(file.metadata?.size || 0)}</span>
                                                        <span>{file.created_at ? format(new Date(file.created_at), 'MM/dd') : ''}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* ── Assets Grid (DB records) ── */}
                            {activeTab === 'assets' && (
                                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                                    {filteredAssets.map(asset => (
                                        <div
                                            key={asset.id}
                                            className="group relative bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-all"
                                            title={asset.name}
                                        >
                                            <div className="aspect-square bg-gray-100 flex items-center justify-center relative p-2">
                                                <img
                                                    src={asset.url}
                                                    alt={asset.name}
                                                    className="w-full h-full object-contain"
                                                    loading="lazy"
                                                />
                                                {/* Delete overlay */}
                                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                                    <button
                                                        onClick={() => handleDeleteAsset(asset.id)}
                                                        className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                                        title="刪除素材"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                {/* Type badge */}
                                                <span className={`absolute top-1 right-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${TYPE_COLOR[asset.type] || 'bg-gray-100 text-gray-600'}`}>
                                                    {TYPE_LABEL[asset.type] || asset.type}
                                                </span>
                                            </div>
                                            <div className="p-2 text-xs truncate">
                                                <div className="font-medium text-gray-800 truncate" title={asset.name}>{asset.name}</div>
                                                <div className="text-gray-400 mt-0.5 flex justify-between">
                                                    <span className="truncate">{asset.category}</span>
                                                    <span>{asset.created_at ? format(new Date(asset.created_at), 'MM/dd') : ''}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* ── Designs List (DB records) ── */}
                            {activeTab === 'designs' && (
                                <div className="space-y-3">
                                    {/* Info note */}
                                    <div className="text-xs text-gray-400 mb-2 px-1">
                                        完整管理功能（批次下載、重製印刷稿）請至「<strong>客戶設計管理</strong>」頁面。
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                                        {filteredDesigns.map(design => (
                                            <div
                                                key={design.design_id}
                                                className="group relative bg-white border border-gray-200 rounded-lg overflow-hidden hover:shadow-md transition-all"
                                            >
                                                <div className="aspect-[3/4] bg-gray-100 flex items-center justify-center relative">
                                                    {design.preview_image ? (
                                                        <img
                                                            src={design.preview_image}
                                                            alt={design.product_name}
                                                            className="w-full h-full object-contain"
                                                            loading="lazy"
                                                        />
                                                    ) : (
                                                        <ImageIcon className="w-8 h-8 text-gray-300" />
                                                    )}
                                                    {/* Action overlay */}
                                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => handleDeleteDesign(design.design_id)}
                                                            className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                                                            title="刪除設計"
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                        {design.preview_image && (
                                                            <a
                                                                href={design.preview_image}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 transition-colors"
                                                                title="開啟原圖"
                                                            >
                                                                <ExternalLink className="w-4 h-4" />
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="p-2 text-xs">
                                                    <div className="font-medium text-gray-800 truncate" title={design.product_name || design.phone_model}>
                                                        {design.product_name || design.phone_model || '未知商品'}
                                                    </div>
                                                    <div className="text-gray-400 font-mono truncate mt-0.5" title={design.design_id}>
                                                        {design.design_id.slice(0, 12)}…
                                                    </div>
                                                    <div className="text-gray-400 mt-0.5">
                                                        {design.created_at ? format(new Date(design.created_at), 'MM/dd HH:mm') : ''}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
