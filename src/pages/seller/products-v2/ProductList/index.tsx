import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { ProductRow } from '../shared/types';
import { useProductEditor } from '../hooks/useProductEditor';
import { Loader2, Plus, AlertCircle, CheckCircle2, XCircle, Copy, Trash2, Share2, ExternalLink } from 'lucide-react';
import { buildDesignShareUrl, copyToClipboard } from '../shared/shareLink';

const ProductListV2: React.FC = () => {
  const [products, setProducts] = useState<Partial<ProductRow>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { deleteProduct, duplicateProduct } = useProductEditor();

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const { data, error: fetchError } = await supabase
        .from('products')
        .select('id, name, updated_at, base_image, specs')
        .order('updated_at', { ascending: false })
        .limit(50);

      if (fetchError) throw fetchError;
      setProducts(data || []);
    } catch (err: any) {
      console.error('Error fetching products:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除此產品嗎？此操作無法復原。')) return;

    const result = await deleteProduct(id);
    if (result.success) {
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } else {
      alert(`刪除失敗: ${result.error}`);
    }
  };

  const handleDuplicate = async (id: string) => {
    const result = await duplicateProduct(id);
    if (result.success) {
      alert('複製成功！');
      fetchProducts(); // Refresh list to show new item
    } else {
      alert(`複製失敗: ${result.error}`);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
        <p className="text-gray-500">載入產品列表中...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">產品管理 V2</h1>
        <button
          onClick={() => navigate('/seller/products-v2/new')}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新增產品
        </button>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span>錯誤: {error}</span>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 border-bottom border-gray-200">
              <th className="px-6 py-4 font-semibold text-gray-600">ID / 名稱</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-center">Base Image</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-center">關聯規格</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-center">分享連結</th>
              <th className="px-6 py-4 font-semibold text-gray-600">最後更新</th>
              <th className="px-6 py-4 font-semibold text-gray-600 text-right">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {products.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                  尚無產品資料
                </td>
              </tr>
            ) : (
              products.map((product) => (
                <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="font-medium text-gray-900">{product.name}</div>
                    <div className="text-xs text-gray-400 mt-1 font-mono">{product.id}</div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {product.base_image ? (
                      <div className="flex items-center justify-center gap-1 text-green-600 text-sm">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>已設定</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center gap-1 text-red-500 text-sm">
                        <XCircle className="w-4 h-4" />
                        <span>未設定</span>
                      </div>
                    )}
                  </td>
                  {/* 關聯規格 */}
                  <td className="px-6 py-4 text-center">
                    {(() => {
                      const linkedCount = (product as any).specs?.linked_option_groups?.length || 0;
                      return linkedCount > 0 ? (
                        <div className="flex items-center justify-center gap-1 text-blue-600 text-sm">
                          <span className="font-medium">{linkedCount}</span>
                          <span>個規格</span>
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">未設定</span>
                      );
                    })()}
                  </td>
                  {/* 分享連結 */}
                  <td className="px-6 py-4 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <div className="flex items-center justify-center gap-2">
                        {(() => {
                          const result = buildDesignShareUrl(product.id);
                          if (result.url) {
                            return (
                              <>
                                <button
                                  onClick={async () => {
                                    const ok = await copyToClipboard(result.url!);
                                    if (ok) alert('分享連結已複製！');
                                  }}
                                  className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                                  title="複製分享連結"
                                >
                                  <Share2 className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => window.open(result.url!, '_blank')}
                                  className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                                  title="在新分頁開啟"
                                >
                                  <ExternalLink className="w-4 h-4" />
                                </button>
                              </>
                            );
                          }
                          return (
                            <span className="text-[10px] text-gray-400 italic" title={result.reason}>
                              無法分享
                            </span>
                          );
                        })()}
                      </div>

                      {/* DEV-only Diagnostics */}
                      {import.meta.env.DEV && (
                        <div className="text-[8px] text-gray-400 font-mono mt-1 border-t border-gray-50 pt-1">
                          {import.meta.env.VITE_CANONICAL_ORIGIN ? (
                            <span className="text-green-500">ENV: {import.meta.env.VITE_CANONICAL_ORIGIN}</span>
                          ) : (
                            <span className="text-red-400">ENV missing (restart dev server)</span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {product.updated_at ? new Date(product.updated_at).toLocaleString() : '-'}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button
                        onClick={() => handleDuplicate(product.id!)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                        title="複製產品"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(product.id!)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
                        title="刪除產品"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => navigate(`/seller/products-v2/${product.id}`)}
                        className="text-blue-600 hover:text-blue-800 font-medium text-sm ml-2"
                      >
                        編輯
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ProductListV2;
