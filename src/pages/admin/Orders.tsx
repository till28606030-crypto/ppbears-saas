import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { ShoppingBag, Download, Clock, Search, Trash2, ExternalLink, RefreshCw } from 'lucide-react';

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
    created_at: string;
}

export default function AdminOrders() {
    const [designs, setDesigns] = useState<Design[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');

    const fetchDesigns = async () => {
        setLoading(true);
        setError(null);
        try {
            const { data, error: supabaseError } = await supabase
                .from('custom_designs')
                .select('id, design_id, product_id, product_name, phone_model, price, options, canvas_json, preview_image, created_at')
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

    const handleDelete = async (designId: string) => {
        if (!window.confirm('確定要刪除此設計？此操作無法復原。')) return;
        try {
            const { error } = await supabase.from('custom_designs').delete().eq('design_id', designId);
            if (error) throw error;
            setDesigns(prev => prev.filter(d => d.design_id !== designId));
        } catch (err: any) {
            alert('刪除失敗：' + err.message);
        }
    };

    const handleDownload = (design: Design) => {
        if (!design.preview_image) {
            alert('此設計無預覽圖可下載');
            return;
        }
        const link = document.createElement('a');
        link.href = design.preview_image;
        link.download = `design-${design.design_id}-PREVIEW.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getEditUrl = (design: Design): string => {
        const base = `${window.location.origin}/`;
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

    return (
        <>
            <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 shadow-sm">
                <h1 className="text-xl font-semibold text-gray-800">客戶設計管理</h1>
                <button
                    onClick={fetchDesigns}
                    className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm"
                    title="重新整理"
                >
                    <RefreshCw className="w-4 h-4" />
                    重新整理
                </button>
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
                            <p className="text-red-500 mb-4">{error}</p>
                            <p className="text-sm text-gray-500 mb-4">
                                如果看到 RLS 權限錯誤，請在 Supabase SQL Editor 執行以下指令：
                            </p>
                            <pre className="text-xs bg-gray-900 text-green-400 p-4 rounded-lg text-left inline-block max-w-xl">
                                {`ALTER TABLE custom_designs
  ADD COLUMN IF NOT EXISTS canvas_json jsonb,
  ADD COLUMN IF NOT EXISTS preview_image text,
  ADD COLUMN IF NOT EXISTS product_id text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- Allow admin to read all rows
CREATE POLICY IF NOT EXISTS "admin read all custom_designs"
  ON custom_designs FOR SELECT USING (true);`}
                            </pre>
                            <br />
                            <button
                                onClick={fetchDesigns}
                                className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                            >
                                重試
                            </button>
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
                        <div className="divide-y divide-gray-100">
                            {filteredDesigns.map((design) => (
                                <div key={design.design_id} className="p-6 flex items-center gap-6 hover:bg-gray-50 transition-colors">
                                    {/* Thumbnail */}
                                    <div className="w-20 h-28 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0 flex items-center justify-center">
                                        {design.preview_image ? (
                                            <img src={design.preview_image} alt="Preview" className="w-full h-full object-contain" />
                                        ) : (
                                            <ShoppingBag className="w-8 h-8 text-gray-300" />
                                        )}
                                    </div>

                                    {/* Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                                            <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">已付款</span>
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
                            ))}
                        </div>
                    )}
                </div>

                {!loading && filteredDesigns.length > 0 && (
                    <p className="text-sm text-gray-400 mt-4 text-right">
                        共 {filteredDesigns.length} 筆設計
                    </p>
                )}
            </div>
        </>
    );
}
