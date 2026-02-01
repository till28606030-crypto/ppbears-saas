import React, { useState, useEffect } from 'react';
import { X, Upload, Check, Truck, Palette } from 'lucide-react';

interface LinkConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: LinkConfigData) => void;
    initialData?: LinkConfigData;
    productName: string; // Used for default product name suggestion
}

export interface LinkConfigData {
    id?: string;
    productName: string;
    redirectUrl: string;
    productType: 'normal' | 'custom';
    shipping: 'required' | 'digital';
    previewImage?: string;
    operationMode: 'simple' | 'drawer';
    colorSpace: 'rgb' | 'grayscale' | 'bw';
    permissions: {
        allowStickers: boolean;
        allowBackgrounds: boolean;
        allowBackgroundColor: boolean;
        allowFrames: boolean;
    };
}

const DEFAULT_DATA: LinkConfigData = {
    productName: '',
    redirectUrl: '',
    productType: 'custom',
    shipping: 'required',
    operationMode: 'simple',
    colorSpace: 'rgb',
    permissions: {
        allowStickers: true,
        allowBackgrounds: true,
        allowBackgroundColor: true,
        allowFrames: true
    }
};

const LinkConfigModal: React.FC<LinkConfigModalProps> = ({ isOpen, onClose, onSubmit, initialData, productName }) => {
    const [formData, setFormData] = useState<LinkConfigData>(DEFAULT_DATA);

    useEffect(() => {
        if (isOpen) {
            if (initialData) {
                setFormData(initialData);
            } else {
                setFormData({
                    ...DEFAULT_DATA,
                    productName: productName // Pre-fill with main product name
                });
            }
        }
    }, [isOpen, initialData, productName]);

    const handleChange = (key: keyof LinkConfigData, value: any) => {
        setFormData(prev => ({ ...prev, [key]: value }));
    };

    const handlePermissionChange = (key: keyof LinkConfigData['permissions']) => {
        setFormData(prev => ({
            ...prev,
            permissions: {
                ...prev.permissions,
                [key]: !prev.permissions[key]
            }
        }));
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
                
                {/* Header */}
                <div className="sticky top-0 bg-white z-10 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-900">
                        設置自定義設計地址
                    </h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-500 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} className="p-6 space-y-0 divide-y divide-gray-100">
                    
                    {/* Row 1: Product Name */}
                    <div className="grid grid-cols-[120px_1fr] items-center gap-4 py-4">
                        <label className="text-sm font-bold text-gray-700 text-right">商品</label>
                        <input 
                            type="text" 
                            required
                            value={formData.productName}
                            onChange={(e) => handleChange('productName', e.target.value)}
                            className="w-full px-4 py-2 rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="商品名稱，同時作為DIY介面的頁面標題"
                        />
                    </div>

                    {/* Row 2: Redirect URL */}
                    <div className="grid grid-cols-[120px_1fr] items-center gap-4 py-4">
                        <label className="text-sm font-bold text-gray-700 text-right">設計完成後跳轉</label>
                        <input 
                            type="url" 
                            required
                            value={formData.redirectUrl}
                            onChange={(e) => handleChange('redirectUrl', e.target.value)}
                            className="w-full px-4 py-2 rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                            placeholder="您的商品詳情網頁或下單頁面網頁地址"
                        />
                    </div>

                    {/* Row 3: Product Type */}
                    <div className="grid grid-cols-[120px_1fr] items-center gap-4 py-4">
                        <label className="text-sm font-bold text-gray-700 text-right">商品類型</label>
                        <select 
                            value={formData.productType}
                            onChange={(e) => handleChange('productType', e.target.value as any)}
                            className="w-full px-4 py-2 rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        >
                            <option value="custom">普通非定制商品</option>
                            <option value="normal">定制商品</option>
                        </select>
                    </div>

                    {/* Row 4: Shipping (New) */}
                    <div className="grid grid-cols-[120px_1fr] items-center gap-4 py-4">
                        <label className="text-sm font-bold text-gray-700 text-right">發貨設置</label>
                        <select 
                            value={formData.shipping}
                            onChange={(e) => handleChange('shipping', e.target.value as any)}
                            className="w-full px-4 py-2 rounded border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none bg-white"
                        >
                            <option value="required">需要發貨</option>
                            <option value="digital">無需發貨 (虛擬商品)</option>
                        </select>
                    </div>

                    {/* Row 5: Preview Image */}
                    <div className="grid grid-cols-[120px_1fr] items-start gap-4 py-4">
                        <label className="text-sm font-bold text-gray-700 text-right pt-2">展示圖片</label>
                        <div className="w-32 h-32 border border-gray-300 rounded flex items-center justify-center text-blue-600 hover:bg-gray-50 cursor-pointer relative overflow-hidden group">
                            {formData.previewImage ? (
                                <img src={formData.previewImage} alt="Preview" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-sm font-medium">選擇圖片</span>
                            )}
                            <input 
                                type="file" 
                                className="hidden" 
                                accept="image/*"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) {
                                        const reader = new FileReader();
                                        reader.readAsDataURL(file);
                                        reader.onload = () => {
                                            if (typeof reader.result === 'string') {
                                                handleChange('previewImage', reader.result);
                                            }
                                        };
                                    }
                                }}
                            />
                        </div>
                    </div>

                    {/* Row 6: Operation Mode */}
                    <div className="grid grid-cols-[120px_1fr] items-center gap-4 py-4">
                        <label className="text-sm font-bold text-gray-700 text-right">PC界面的操作方式</label>
                        <div className="flex gap-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="operationMode" 
                                    value="simple" 
                                    checked={formData.operationMode === 'simple'}
                                    onChange={() => handleChange('operationMode', 'simple')}
                                    className="text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">簡約點擊式</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="operationMode" 
                                    value="drawer" 
                                    checked={formData.operationMode === 'drawer'}
                                    onChange={() => handleChange('operationMode', 'drawer')}
                                    className="text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-sm text-gray-700">抽屜拖曳式</span>
                            </label>
                        </div>
                    </div>

                    {/* Row 7: Color Space (New) */}
                    <div className="grid grid-cols-[120px_1fr] items-center gap-4 py-4">
                        <label className="text-sm font-bold text-gray-700 text-right">色域</label>
                        <div className="flex gap-6">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="colorSpace" 
                                    value="rgb" 
                                    checked={formData.colorSpace === 'rgb'}
                                    onChange={() => handleChange('colorSpace', 'rgb')}
                                    className="text-blue-600 focus:ring-blue-500"
                                />
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-red-500 via-green-500 to-blue-500 shadow-sm"></div>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="colorSpace" 
                                    value="grayscale" 
                                    checked={formData.colorSpace === 'grayscale'}
                                    onChange={() => handleChange('colorSpace', 'grayscale')}
                                    className="text-blue-600 focus:ring-blue-500"
                                />
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-gray-200 to-gray-400 shadow-sm"></div>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="radio" 
                                    name="colorSpace" 
                                    value="bw" 
                                    checked={formData.colorSpace === 'bw'}
                                    onChange={() => handleChange('colorSpace', 'bw')}
                                    className="text-blue-600 focus:ring-blue-500"
                                />
                                <div className="w-6 h-6 rounded-full bg-gradient-to-br from-white to-black border shadow-sm"></div>
                            </label>
                        </div>
                    </div>

                    {/* Permissions */}
                    <div className="py-2">
                        <ToggleSwitch 
                            label="客戶可使用裝飾素材" 
                            checked={formData.permissions.allowStickers} 
                            onChange={() => handlePermissionChange('allowStickers')} 
                        />
                        <ToggleSwitch 
                            label="客戶可使用背景素材" 
                            checked={formData.permissions.allowBackgrounds} 
                            onChange={() => handlePermissionChange('allowBackgrounds')} 
                        />
                        <ToggleSwitch 
                            label="客戶可自定義背景色" 
                            checked={formData.permissions.allowBackgroundColor} 
                            onChange={() => handlePermissionChange('allowBackgroundColor')} 
                        />
                         <ToggleSwitch 
                            label="客戶可使用相框素材" 
                            checked={formData.permissions.allowFrames} 
                            onChange={() => handlePermissionChange('allowFrames')} 
                        />
                    </div>

                    {/* Footer Actions */}
                    <div className="flex justify-end gap-3 pt-6">
                        <button 
                            type="button" 
                            onClick={onClose}
                            className="px-6 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                        >
                            取消
                        </button>
                        <button 
                            type="submit"
                            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded hover:bg-blue-700 shadow-sm transition-colors"
                        >
                            確定
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

// Updated Toggle Switch to match Image 2
const ToggleSwitch = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: () => void }) => (
    <div className="grid grid-cols-[120px_1fr] items-center gap-4 py-3 border-b border-gray-50 last:border-0">
        <span className="text-sm font-bold text-gray-700 text-right">{label}</span>
        <div className="flex">
             <button 
                type="button"
                onClick={() => !checked && onChange()}
                className={`px-3 py-1 text-sm font-medium border border-r-0 rounded-l transition-colors ${checked ? 'bg-green-500 text-white border-green-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
             >
                允許
             </button>
             <button 
                type="button"
                onClick={() => checked && onChange()}
                className={`px-3 py-1 text-sm font-medium border rounded-r transition-colors ${!checked ? 'bg-gray-500 text-white border-gray-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}
             >
                禁止
             </button>
        </div>
    </div>
);

export default LinkConfigModal;
