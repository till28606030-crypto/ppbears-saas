import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Save, AlertCircle, Loader2 } from 'lucide-react';
import { ClientPermissions } from '../shared/types';

interface PermissionModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedProducts: { id: string; name: string; permissions?: ClientPermissions }[];
    onSuccess: () => void;
}

const defaultPermissions: ClientPermissions = {
    text: true,
    background: true,
    designs: true,
    ai_remove_bg: true,
    stickers: true,
    barcode: true,
    ai_cartoon: true,
    frames: true,
};

const permissionItems: { key: keyof ClientPermissions; label: string }[] = [
    { key: 'text', label: '文字 (Text)' },
    { key: 'background', label: '背景 (Background)' },
    { key: 'designs', label: '設計 (Designs)' },
    { key: 'ai_remove_bg', label: '一鍵去背 (AI Remove BG)' },
    { key: 'stickers', label: '貼圖 (Stickers)' },
    { key: 'barcode', label: '條碼 (Barcode)' },
    { key: 'ai_cartoon', label: '卡通化 (AI Cartoon)' },
    { key: 'frames', label: '相框 (Frames)' },
];

const PermissionModal: React.FC<PermissionModalProps> = ({ isOpen, onClose, selectedProducts, onSuccess }) => {
    const [permissions, setPermissions] = useState<ClientPermissions>(defaultPermissions);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Initialize state when modal opens
    useEffect(() => {
        if (isOpen) {
            setError(null);
            if (selectedProducts.length === 1 && selectedProducts[0].permissions) {
                // Single edit: load existing permissions
                setPermissions({ ...defaultPermissions, ...selectedProducts[0].permissions });
            } else {
                // Bulk edit or no existing permissions: default to all true to avoid confusion
                setPermissions({ ...defaultPermissions });
            }
        }
    }, [isOpen, selectedProducts]);

    const handleToggle = (key: keyof ClientPermissions) => {
        setPermissions(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const handleSave = async () => {
        if (selectedProducts.length === 0) return;

        if (selectedProducts.length > 1) {
            const confirmed = confirm(`即將對 ${selectedProducts.length} 個產品「覆蓋」設計權限，確定執行嗎？`);
            if (!confirmed) return;
        }

        setSaving(true);
        setError(null);

        try {
            // Update all selected products with the new permissions object
            const updatePromises = selectedProducts.map(product =>
                supabase
                    .from('products')
                    .update({ client_permissions: permissions })
                    .eq('id', product.id)
            );

            const results = await Promise.all(updatePromises);
            const errors = results.filter(r => r.error);

            if (errors.length > 0) {
                console.error('Some updates failed:', errors);
                throw new Error(`部分產品更新失敗 (${errors.length}/${selectedProducts.length})`);
            }

            onSuccess();
            onClose();
        } catch (err: any) {
            console.error('Save failed:', err);
            setError(err.message || '儲存失敗，請稍後再試');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800">
                            {selectedProducts.length > 1 ? `批次設定客戶設計權限 (${selectedProducts.length} 筆)` : '設定客戶設計權限'}
                        </h2>
                        {selectedProducts.length === 1 && (
                            <p className="text-sm text-gray-500 mt-1">{selectedProducts[0].name}</p>
                        )}
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="p-6 overflow-y-auto custom-scrollbar flex-1">
                    {error && (
                        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}

                    {selectedProducts.length > 1 && (
                        <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3 text-amber-800">
                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                            <div className="text-sm">
                                <strong>批次修改警告：</strong> 儲存後，將會<strong>覆蓋</strong>這 {selectedProducts.length} 個產品原本的個別權限設定。
                            </div>
                        </div>
                    )}

                    <p className="text-sm text-gray-500 mb-6">
                        設定客戶在設計此產品時，可以使用哪些功能模組。打勾代表開放該功能。
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {permissionItems.map((item) => (
                            <label
                                key={String(item.key)}
                                className={`flex items-center justify-between p-4 border rounded-xl cursor-pointer transition-colors ${permissions[item.key] ? 'bg-blue-50/50 border-blue-200 shadow-sm' : 'hover:bg-gray-50 border-gray-200'
                                    }`}
                            >
                                <span className="font-medium text-gray-700">{item.label}</span>
                                <input
                                    type="checkbox"
                                    checked={permissions[item.key] ?? true}
                                    onChange={() => handleToggle(item.key)}
                                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                                />
                            </label>
                        ))}
                    </div>
                </div>

                <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 mt-auto">
                    <button
                        onClick={onClose}
                        className="px-6 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 font-medium transition-colors"
                        disabled={saving}
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-bold transition-colors shadow-sm disabled:opacity-50"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        儲存設定
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PermissionModal;
