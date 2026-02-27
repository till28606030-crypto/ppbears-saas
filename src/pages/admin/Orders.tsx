import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ShoppingBag, Download, Clock, Search, Trash2, ExternalLink, RefreshCw, CheckSquare, Square, Copy, Image as ImageIcon } from 'lucide-react';

interface Design {
    id: string;
    design_id: string;
    product_id: string | null;
    product_name: string;
    phone_model: string;
    price: number;
    options: Record<string, any>;
    canvas_json: object | null;
    preview_image: string | null;
    spec_image_url: string | null; // 客戶上傳的 AI 辨識截圖
    created_at: string;
}

export default function AdminOrders() {
    const [designs, setDesigns] = useState<Design[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    const [deleteTarget, setDeleteTarget] = useState<'bulk' | string | null>(null);

    const fetchDesigns = async () => {
        setLoading(true);
        setError(null);
        setSelectedIds(new Set()); // Reset selection on refresh
        try {
            const { data, error: supabaseError } = await supabase
                .from('custom_designs')
                .select('id, design_id, product_id, product_name, phone_model, price, options, canvas_json, preview_image, spec_image_url, created_at')
                .order('created_at', { ascending: false });

            if (supabaseError) throw supabaseError;
            setDesigns(data || []);
        } catch (err: any) {
            console.error('Failed to load designs:', err);
            setError(`無法載入設計資料：${err.message}`);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchDesigns();
    }, []);

    const confirmDelete = async () => {
        if (!deleteTarget) return;

        try {
            if (deleteTarget === 'bulk') {
                const idsToDelete = Array.from(selectedIds);
                // Call the RPC function to bypass RLS and delete securely
                const { error } = await supabase.rpc('delete_custom_designs_admin', {
                    design_ids: idsToDelete
                });

                if (error) throw error;

                // Update UI state
                setDesigns(prev => prev.filter(d => !selectedIds.has(d.design_id)));
                setSelectedIds(new Set());
            } else {
                // Delete single item via RPC
                const { error } = await supabase.rpc('delete_custom_designs_admin', {
                    design_ids: [deleteTarget]
                });

                if (error) throw error;

                // Update UI state
                setDesigns(prev => prev.filter(d => d.design_id !== deleteTarget));
                setSelectedIds(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(deleteTarget);
                    return newSet;
                });
            }
        } catch (err: any) {
            console.error('Delete failed:', err);
            alert('刪除失敗：' + (err.message || String(err)));
        } finally {
            setDeleteTarget(null);
        }
    };

    const handleDelete = (designId: string) => {
        if (!designId) return;
        setDeleteTarget(designId);
    };

    const handleBulkDelete = () => {
        if (selectedIds.size === 0) return;
        setDeleteTarget('bulk');
    };

    const handleDownload = async (design: Design) => {
        if (!design.preview_image) {
            alert('此設計無預覽圖可下載');
            return;
        }

        try {
            // Fetch the image as a blob
            const response = await fetch(design.preview_image);
            const blob = await response.blob();

            // Create a temporary object URL
            const url = window.URL.createObjectURL(blob);

            // Create a link and trigger download
            const link = document.createElement('a');
            link.href = url;
            link.download = `design-${design.design_id}-PREVIEW.png`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            // Clean up the object URL
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Download failed:', error);
            // Fallback to direct navigation if blob download fails, but set target blank
            window.open(design.preview_image, '_blank');
        }
    };

    const handleBulkDownload = async () => {
        if (selectedIds.size === 0) return;

        const selectedDesigns = designs.filter(d => selectedIds.has(d.design_id) && d.preview_image);

        if (selectedDesigns.length === 0) {
            alert('選取的設計中沒有可下載的預覽圖。');
            return;
        }

        // Let the user know download is starting if many files
        if (selectedDesigns.length > 3) {
            alert(`準備下載 ${selectedDesigns.length} 份預覽圖，這可能需要一點時間。`);
        }

        for (const design of selectedDesigns) {
            await handleDownload(design);
            // Add a small delay between downloads to prevent browser from blocking
            await new Promise(resolve => setTimeout(resolve, 300));
        }
    };

    const toggleSelection = (designId: string) => {
        setSelectedIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(designId)) {
                newSet.delete(designId);
            } else {
                newSet.add(designId);
            }
            return newSet;
        });
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredDesigns.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredDesigns.map(d => d.design_id)));
        }
    };

    const getEditUrl = (design: Design): string => {
        const basePath = import.meta.env.VITE_BASE_PATH || '/';
        const formattedBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`;
        const base = `${window.location.origin}${formattedBasePath}`;
        const params = new URLSearchParams();
        if (design.product_id) params.set('productId', design.product_id);
        params.set('load_design_id', design.design_id);
        return `${base}?${params.toString()}`;
    };

    const filteredDesigns = designs.filter(d =>
        d.design_id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        d.phone_model.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const isAllSelected = filteredDesigns.length > 0 && selectedIds.size === filteredDesigns.length;

    return (
        <>
            <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 shadow-sm">
                <h1 className="text-xl font-semibold text-gray-800">客戶設計管理</h1>
                <div className="flex items-center gap-3">
                    {selectedIds.size > 0 && (
                        <div className="flex items-center bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-100 mr-2 animate-in fade-in slide-in-from-right-4 duration-300">
                            <span className="text-sm text-blue-800 font-medium mr-4">
                                已選取 {selectedIds.size} 項
                            </span>
                            <button
                                onClick={handleBulkDownload}
                                className="flex items-center gap-1.5 px-3 py-1.5 mr-2 bg-white text-gray-700 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-md transition-colors text-sm font-medium shadow-sm"
                                title="批次下載"
                            >
                                <Download className="w-4 h-4" />
                                下載
                            </button>
                            <button
                                onClick={handleBulkDelete}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-red-600 hover:bg-red-50 border border-gray-200 rounded-md transition-colors text-sm font-medium shadow-sm"
                                title="批次刪除"
                            >
                                <Trash2 className="w-4 h-4" />
                                刪除
                            </button>
                        </div>
                    )}
                    <button
                        onClick={fetchDesigns}
                        className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
                        title="重新整理"
                    >
                        <RefreshCw className="w-4 h-4" />
                        重新整理
                    </button>
                </div>
            </header>

            <div className="p-8 max-w-6xl mx-auto">
                {/* Search Bar */}
                <div className="mb-6 relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                        <Search className="w-5 h-5" />
                    </div>
                    <input
                        type="text"
                        placeholder="搜尋設計 ID、商品名稱..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="block w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                    />
                </div>

                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    {loading ? (
                        <div className="p-12 text-center text-gray-400">
                            <div className="w-8 h-8 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-4" />
                            <p>載入中...</p>
                        </div>
                    ) : error ? (
                        <div className="p-12 text-center">
                            <p className="text-red-500 font-bold mb-2">{error}</p>
                            <p className="text-sm text-gray-500 mb-4">
                                如果看到 RLS 或欄位不存在錯誤，請在 Supabase SQL Editor 執行以下指令：
                            </p>
                            <pre className="text-xs bg-gray-900 text-green-400 p-4 rounded-lg text-left inline-block max-w-xl whitespace-pre-wrap">
                                {`-- 補充缺少的欄位（如已存在會略過）
ALTER TABLE custom_designs
  ADD COLUMN IF NOT EXISTS canvas_json jsonb,
  ADD COLUMN IF NOT EXISTS preview_image text,
  ADD COLUMN IF NOT EXISTS spec_image_url text,
  ADD COLUMN IF NOT EXISTS product_id text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 開啟 RLS
ALTER TABLE custom_designs ENABLE ROW LEVEL SECURITY;

-- 允許 admin 讀取所有資料列
DROP POLICY IF EXISTS "admin read all custom_designs" ON custom_designs;
CREATE POLICY "admin read all custom_designs"
  ON custom_designs FOR SELECT USING (true);

-- 允許任何人新增（客戶加入購物車時寫入）
DROP POLICY IF EXISTS "public insert custom_designs" ON custom_designs;
CREATE POLICY "public insert custom_designs"
  ON custom_designs FOR INSERT WITH CHECK (true);`}
                            </pre>
                            <div className="mt-3 flex items-center justify-center gap-3">
                                <button
                                    onClick={() => {
                                        navigator.clipboard.writeText(`-- 補充缺少的欄位（如已存在會略過）
ALTER TABLE custom_designs
  ADD COLUMN IF NOT EXISTS canvas_json jsonb,
  ADD COLUMN IF NOT EXISTS preview_image text,
  ADD COLUMN IF NOT EXISTS spec_image_url text,
  ADD COLUMN IF NOT EXISTS product_id text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- 開啟 RLS
ALTER TABLE custom_designs ENABLE ROW LEVEL SECURITY;

-- 允許 admin 讀取所有資料列
DROP POLICY IF EXISTS "admin read all custom_designs" ON custom_designs;
CREATE POLICY "admin read all custom_designs"
  ON custom_designs FOR SELECT USING (true);

-- 允許任何人新增（客戶加入購物車時寫入）
DROP POLICY IF EXISTS "public insert custom_designs" ON custom_designs;
CREATE POLICY "public insert custom_designs"
  ON custom_designs FOR INSERT WITH CHECK (true);`);
                                        alert('SQL 已複製！請至 Supabase SQL Editor 執行。');
                                    }}
                                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 text-sm"
                                >
                                    <Copy className="w-4 h-4" /> 複製 SQL
                                </button>
                                <button
                                    onClick={fetchDesigns}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                                >
                                    重試
                                </button>
                            </div>
                        </div>
                    ) : filteredDesigns.length === 0 ? (
                        <div className="p-12 text-center text-gray-500">
                            <ShoppingBag className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                            <p className="text-lg">
                                {searchTerm ? '找不到符合搜尋條件的設計' : '目前尚無客戶設計'}
                            </p>
                            <p className="text-sm text-gray-400 mt-2">當客戶完成設計並加入購物車後，設計將顯示在此頁面。</p>
                        </div>
                    ) : (
                        <div>
                            {/* List Header with Select All */}
                            <div className="bg-gray-50 px-6 py-3 border-b border-gray-100 flex items-center gap-6 sticky top-0 z-10">
                                <button
                                    onClick={toggleSelectAll}
                                    className="flex items-center justify-center text-gray-500 hover:text-blue-600 transition-colors"
                                >
                                    {isAllSelected ? (
                                        <CheckSquare className="w-5 h-5 text-blue-600" />
                                    ) : (
                                        <Square className="w-5 h-5" />
                                    )}
                                </button>
                                <span className="text-sm font-medium text-gray-600 flex-1">
                                    全選
                                </span>
                            </div>

                            {/* List Items */}
                            <div className="divide-y divide-gray-100">
                                {filteredDesigns.map((design) => {
                                    const isSelected = selectedIds.has(design.design_id);
                                    return (
                                        <div
                                            key={design.design_id}
                                            className={`p-6 flex items-center gap-6 transition-colors ${isSelected ? 'bg-blue-50/50' : 'hover:bg-gray-50'}`}
                                        >
                                            {/* Checkbox */}
                                            <button
                                                onClick={() => toggleSelection(design.design_id)}
                                                className="flex-shrink-0 text-gray-400 hover:text-blue-600 transition-colors"
                                            >
                                                {isSelected ? (
                                                    <CheckSquare className="w-5 h-5 text-blue-600" />
                                                ) : (
                                                    <Square className="w-5 h-5" />
                                                )}
                                            </button>

                                            {/* 設計縮圖 */}
                                            <div className="w-20 h-28 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0 flex items-center justify-center">
                                                {design.preview_image ? (
                                                    <img src={design.preview_image} alt="Preview" className="w-full h-full object-contain" />
                                                ) : (
                                                    <ShoppingBag className="w-8 h-8 text-gray-300" />
                                                )}
                                            </div>

                                            {/* 客戶規格截圖（AI辨識上傳）*/}
                                            {design.spec_image_url && (
                                                <a
                                                    href={design.spec_image_url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title="查看客戶上傳的規格截圖"
                                                    className="w-16 h-20 bg-purple-50 rounded-lg overflow-hidden border-2 border-purple-200 flex-shrink-0 flex items-center justify-center group hover:border-purple-400 transition-colors"
                                                >
                                                    <img src={design.spec_image_url} alt="規格截圖" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                                                </a>
                                            )}

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-3 mb-1 flex-wrap">
                                                    <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">已付款</span>
                                                    {design.spec_image_url && (
                                                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full font-medium flex items-center gap-1">
                                                            <ImageIcon className="w-3 h-3" /> 含規格截圖
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="font-semibold text-gray-800 truncate">{design.product_name || design.phone_model}</p>
                                                <p className="text-xs text-gray-500 font-mono mt-1 bg-gray-100 inline-block px-2 py-1 rounded select-all">
                                                    設計 ID: {design.design_id}
                                                </p>
                                                <div className="flex items-center gap-4 mt-2 text-sm text-gray-400 flex-wrap">
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="w-3 h-3" />
                                                        {design.created_at
                                                            ? new Date(design.created_at).toLocaleString('zh-TW')
                                                            : '—'}
                                                    </span>
                                                    <span>NT$ {design.price}</span>
                                                    {!design.canvas_json && (
                                                        <span className="text-amber-500 text-xs">⚠ 舊版設計（無法重新編輯）</span>
                                                    )}
                                                </div>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                {/* Open in Editor */}
                                                {design.canvas_json && design.product_id && (
                                                    <a
                                                        href={getEditUrl(design)}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm text-sm"
                                                        title="在設計器中開啟此設計"
                                                    >
                                                        <ExternalLink className="w-4 h-4" />
                                                        開啟編輯
                                                    </a>
                                                )}
                                                {/* Download Preview */}
                                                <button
                                                    onClick={() => handleDownload(design)}
                                                    disabled={!design.preview_image}
                                                    className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors shadow-sm text-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                                >
                                                    <Download className="w-4 h-4" />
                                                    下載預覽
                                                </button>
                                                {/* Delete */}
                                                <button
                                                    onClick={() => handleDelete(design.design_id)}
                                                    className="p-2 bg-white border border-gray-200 text-red-500 rounded-lg hover:bg-red-50 hover:border-red-200 transition-colors shadow-sm"
                                                    title="刪除"
                                                >
                                                    <Trash2 className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                {!loading && filteredDesigns.length > 0 && (
                    <p className="text-sm text-gray-400 mt-4 text-right">
                        共 {filteredDesigns.length} 筆設計
                    </p>
                )}
            </div>

            {/* Custom Confirm Modal for Delete */}
            {deleteTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <h3 className="text-lg font-bold text-gray-900 mb-2">確認刪除</h3>
                            <p className="text-gray-600 text-sm">
                                {deleteTarget === 'bulk'
                                    ? `確定要刪除選取的 ${selectedIds.size} 筆設計嗎？`
                                    : '確定要刪除此設計？'}
                                <br />
                                <span className="text-red-500 font-medium mt-1 inline-block">此操作無法復原。</span>
                            </p>
                        </div>
                        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3 border-t border-gray-100">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={confirmDelete}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-lg hover:bg-red-700 shadow-sm transition-colors"
                            >
                                確定刪除
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
