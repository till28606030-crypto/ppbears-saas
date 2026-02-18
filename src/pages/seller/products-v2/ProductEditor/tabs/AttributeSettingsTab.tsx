import React from 'react';
import { ProductRow, ClientPermissions } from '../../shared/types';
import { Settings } from 'lucide-react';

interface AttributeSettingsTabProps {
    draft: Partial<ProductRow> | null;
    setDraft: (draft: Partial<ProductRow>) => void;
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

const AttributeSettingsTab: React.FC<AttributeSettingsTabProps> = ({ draft, setDraft }) => {
    const permissions = draft?.client_permissions || defaultPermissions;

    const handleToggle = (key: keyof ClientPermissions) => {
        const newPermissions = { ...permissions, [key]: !permissions[key] };
        setDraft({
            ...draft,
            client_permissions: newPermissions
        });
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

    return (
        <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <div className="flex items-center gap-2 mb-6">
                    <Settings className="w-5 h-5 text-gray-500" />
                    <h2 className="text-lg font-semibold text-gray-800">客戶設計權限</h2>
                </div>

                <p className="text-sm text-gray-500 mb-6">
                    設定客戶在設計此產品時，可以使用哪些功能模組。
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {permissionItems.map((item) => (
                        <label
                            key={item.key}
                            className="flex items-center justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
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

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-lg font-semibold mb-4">資料預覽 (Internal Data)</h2>
                <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto max-h-[200px] text-xs font-mono">
                    {JSON.stringify(permissions, null, 2)}
                </pre>
            </div>
        </div>
    );
};

export default AttributeSettingsTab;
