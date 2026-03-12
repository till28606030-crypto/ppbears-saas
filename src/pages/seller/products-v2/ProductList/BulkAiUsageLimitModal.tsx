import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Save, AlertCircle, Loader2, Sparkles } from 'lucide-react';

interface BulkAiUsageLimitModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedProducts: { id: string; name: string }[];
    onSuccess: () => void;
}

const BulkAiUsageLimitModal: React.FC<BulkAiUsageLimitModalProps> = ({ isOpen, onClose, selectedProducts, onSuccess }) => {
    const [limit, setLimit] = useState<number>(10);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleSave = async () => {
        if (selectedProducts.length === 0) {
            setError('未選擇任何產品');
            return;
        }

        const confirmed = confirm(`即將對 ${selectedProducts.length} 個產品批次修改「AI 每日使用上限」為 ${limit} 次，確定執行嗎？`);
        if (!confirmed) return;

        setSaving(true);
        setError(null);

        try {
            const { data: productsData, error: fetchError } = await supabase
                .from('products')
                .select('id, specs')
                .in('id', selectedProducts.map(p => p.id));

            if (fetchError) throw fetchError;

            const updatePromises = (productsData || []).map(async (product) => {
                const currentSpecs = product.specs || {};

                const updatedSpecs = {
                    ...currentSpecs,
                    ai_usage_limit: limit
                };

                return supabase
                    .from('products')
                    .update({ specs: updatedSpecs })
                    .eq('id', product.id);
            });

            await Promise.all(updatePromises);

            alert('處理完成！');
            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Failed to bulk update AI usage limit:', err);
            setError('更新失敗：' + (err.message || String(err)));
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col">
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 shrink-0">
                    <h2 className="font-bold text-gray-800 text-lg flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-blue-600" />
                        批次設定 AI 每日使用上限
                    </h2>
                    <button onClick={onClose} disabled={saving} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-200 rounded-lg transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto flex-1">
                    <div className="mb-6 text-sm text-gray-600 bg-blue-50 p-3 rounded-lg border border-blue-100 flex flex-col gap-2">
                        <div>
                            您正在設定 <strong>{selectedProducts.length}</strong> 個產品的 AI 每日使用上限。
                        </div>
                        <div className="flex flex-wrap gap-1.5 mt-1 max-h-24 overflow-y-auto">
                            {selectedProducts.map(product => (
                                <span key={product.id} className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-white text-blue-700 border border-blue-200 shadow-sm">
                                    {product.name}
                                </span>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
                            <AlertCircle className="w-4 h-4" />
                            <span>{error}</span>
                        </div>
                    )}

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-bold text-gray-800 mb-2">新的 AI 每日使用上限 (次數)</label>
                            <input
                                type="number"
                                min="0"
                                step="1"
                                value={limit}
                                onChange={(e) => setLimit(Number(e.target.value))}
                                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
                            />
                            <p className="mt-2 text-xs text-gray-500">
                                設定使用者每天可免費使用「卡通化」或「去背」的總次數。預設為 10 次。
                            </p>
                        </div>
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 shrink-0">
                    <div className="flex justify-end gap-3">
                        <button
                            onClick={onClose}
                            disabled={saving}
                            className="px-5 py-2.5 text-gray-600 font-medium hover:bg-gray-200 rounded-xl transition-colors"
                        >
                            取消
                        </button>

                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm shadow-blue-200"
                        >
                            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                            儲存設定
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BulkAiUsageLimitModal;
