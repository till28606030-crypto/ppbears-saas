import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Package, Calendar, Clock, Tag, Eye } from 'lucide-react';
import { useProductStore } from '@/store/useProductStore';
import { supabase } from '@/lib/supabase';
import { get } from 'idb-keyval';

const ModelDetail = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [model, setModel] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    
    // 7. Tracking Logic
    useEffect(() => {
        if (id) {
            console.log(`[Audit Log] User viewed model details: ${id} at ${new Date().toISOString()}`);
            // In a real app, send to analytics API
        }
    }, [id]);

    // Data Fetching
    useEffect(() => {
        const fetchModel = async () => {
            if (!id) return;
            try {
                // 1. Try IDB (Seller created)
                const storedProducts = await get('ppbears_seller_products');
                let found = Array.isArray(storedProducts) ? storedProducts.find((p: any) => p?.id === id) : null;

                // 2. Try Store/Supabase if needed (Mock for now)
                if (!found) {
                     // Try mock store logic or supabase select
                     // For this demo, we assume IDB is the source of truth for "Seller" models
                     // But we can also check the useProductStore if it's synced
                }

                if (found) {
                    setModel(found);
                } else {
                    setError('找不到該模型資料 (Model Not Found)');
                }
            } catch (err) {
                console.error(err);
                setError('載入失敗');
            } finally {
                setIsLoading(false);
            }
        };

        fetchModel();
    }, [id]);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-50">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
            </div>
        );
    }

    if (error || !model) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 gap-4">
                <div className="text-red-500 font-bold text-lg">{error || '404 Not Found'}</div>
                <button onClick={() => navigate('/seller/products')} className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">
                    返回列表
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-5xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex items-center gap-4">
                    <button 
                        onClick={() => navigate('/seller/products')}
                        className="p-2 hover:bg-white rounded-full transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <h1 className="text-2xl font-bold text-gray-900">模型詳情 (Model Details)</h1>
                    <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-mono rounded">
                        ID: {model.id}
                    </span>
                </div>

                {/* Main Content */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Left: Preview */}
                    <div className="md:col-span-1 space-y-4">
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                            <div className="aspect-[1/2] bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden border border-gray-100">
                                <img 
                                    src={model.thumbnail || model.baseImage} 
                                    alt={model.name} 
                                    className="max-w-full max-h-full object-contain"
                                />
                            </div>
                        </div>
                        
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-3">
                             <h3 className="font-bold text-gray-700 flex items-center gap-2">
                                <Package className="w-4 h-4" />
                                基礎資訊
                             </h3>
                             <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-500">名稱</span>
                                    <span className="font-medium">{model.name}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">品牌</span>
                                    <span className="font-medium">{model.brand || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-500">類別</span>
                                    <span className="font-medium">{model.category || '-'}</span>
                                </div>
                             </div>
                        </div>
                    </div>

                    {/* Right: Details */}
                    <div className="md:col-span-2 space-y-6">
                        {/* Status Card */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-bold text-gray-800 text-lg">規格參數</h3>
                                <div className="flex gap-2">
                                     {model.compatibilityTags?.map((tag: string) => (
                                         <span key={tag} className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                                             <Tag className="w-3 h-3" />
                                             {tag}
                                         </span>
                                     ))}
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <div className="text-xs text-gray-500 mb-1">物理尺寸 (CM)</div>
                                    <div className="font-mono font-bold text-lg">
                                        {model.width} x {model.height}
                                    </div>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <div className="text-xs text-gray-500 mb-1">解析度 (DPI)</div>
                                    <div className="font-mono font-bold text-lg">
                                        {model.dpi || 300}
                                    </div>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <div className="text-xs text-gray-500 mb-1">色彩空間</div>
                                    <div className="font-mono font-bold text-lg">
                                        {model.colorSpace || 'RGB'}
                                    </div>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-lg">
                                    <div className="text-xs text-gray-500 mb-1">圓角半徑</div>
                                    <div className="font-mono font-bold text-lg">
                                        {model.cornerRadius || 0} px
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Permissions */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                            <h3 className="font-bold text-gray-800 mb-4">前端權限配置</h3>
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                {Object.entries(model.permissions || {}).map(([key, val]) => (
                                    <div key={key} className={`flex items-center justify-between p-3 rounded border ${val ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                                        <span className="text-sm font-medium capitalize">{key}</span>
                                        <span className={`text-xs font-bold ${val ? 'text-green-600' : 'text-red-600'}`}>
                                            {val ? 'Enabled' : 'Disabled'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Links Actions */}
                        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between">
                            <div>
                                <h3 className="font-bold text-gray-800">操作記錄</h3>
                                <p className="text-xs text-gray-500 flex items-center gap-1 mt-1">
                                    <Clock className="w-3 h-3" />
                                    Last Viewed: {new Date().toLocaleTimeString()}
                                </p>
                            </div>
                            <div className="flex gap-3">
                                <button 
                                    onClick={() => navigate(`/seller/product/${id}`)}
                                    className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors"
                                >
                                    編輯模型
                                </button>
                                <a 
                                    href={`/?productId=${id}`} 
                                    target="_blank" 
                                    rel="noreferrer"
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors flex items-center gap-2"
                                >
                                    <Eye className="w-4 h-4" />
                                    前台預覽
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ModelDetail;