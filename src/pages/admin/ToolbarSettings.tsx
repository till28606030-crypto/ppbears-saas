import React, { useState, useEffect, useCallback } from 'react';
import {
    GripVertical, Eye, EyeOff, Save, RotateCcw, Loader2,
    PanelLeft, ArrowUpDown, Type, Info
} from 'lucide-react';
import {
    DndContext, closestCenter, PointerSensor, KeyboardSensor,
    useSensor, useSensors, DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove, SortableContext, sortableKeyboardCoordinates,
    useSortable, verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ToolbarItemConfig {
    id: string;
    label: string;
    visible: boolean;
    sort_order: number;
}

export const DEFAULT_TOOLBAR_CONFIG: ToolbarItemConfig[] = [
    { id: 'upload',          label: '上傳',   visible: true,  sort_order: 1 },
    { id: 'text',            label: '文字',   visible: true,  sort_order: 2 },
    { id: 'stickers',        label: '貼圖',   visible: true,  sort_order: 3 },
    { id: 'background',      label: '背景',   visible: true,  sort_order: 4 },
    { id: 'frames',          label: '相框',   visible: true,  sort_order: 5 },
    { id: 'barcode',         label: '條碼',   visible: false, sort_order: 6 },
    { id: 'designs',         label: '設計',   visible: false, sort_order: 7 },
    { id: 'ai',              label: 'AI創意', visible: true,  sort_order: 8 },
    { id: 'product_preview', label: '規格',   visible: true,  sort_order: 9 },
];

// IDs that cannot be hidden (system required)
const ALWAYS_VISIBLE = new Set(['upload']);

// Map tool IDs to human-readable labels for display
const TOOL_DEFAULTS: Record<string, string> = {
    upload: '上傳', text: '文字', stickers: '貼圖', background: '背景',
    frames: '相框', barcode: '條碼', designs: '設計', ai: 'AI創意',
    product_preview: '規格',
};

// ─── Sortable Row ─────────────────────────────────────────────────────────────

function SortableToolRow({ item, onToggleVisible, onRename }: {
    item: ToolbarItemConfig;
    onToggleVisible: () => void;
    onRename: (val: string) => void;
}) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(item.label);

    useEffect(() => { setDraft(item.label); }, [item.label]);

    const commit = () => {
        const v = draft.trim();
        onRename(v || TOOL_DEFAULTS[item.id] || item.label);
        setEditing(false);
    };

    const isAlwaysVisible = ALWAYS_VISIBLE.has(item.id);

    return (
        <div
            ref={setNodeRef}
            style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.7 : 1, zIndex: isDragging ? 50 : undefined }}
            className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                isDragging ? 'bg-blue-50 shadow-md border-blue-200' : 'bg-white border-gray-200 hover:border-gray-300'
            } ${!item.visible ? 'opacity-50' : ''}`}
        >
            <button {...attributes} {...listeners} className="p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing touch-none">
                <GripVertical className="w-4 h-4" />
            </button>

            <div className="flex-1 min-w-0">
                {editing ? (
                    <input
                        autoFocus value={draft}
                        onChange={e => setDraft(e.target.value)}
                        onBlur={commit}
                        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
                        className="w-full text-sm px-2 py-1 border border-blue-400 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-400"
                    />
                ) : (
                    <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-sm font-medium text-gray-800 hover:text-blue-600 transition-colors" title="點擊修改名稱">
                        {item.label}
                        <Type className="w-3 h-3 text-gray-300" />
                    </button>
                )}
                <p className="text-[10px] text-gray-400 mt-0.5">ID: {item.id}</p>
            </div>

            <button
                onClick={onToggleVisible}
                disabled={isAlwaysVisible}
                className={`p-1.5 rounded-lg transition-colors ${isAlwaysVisible ? 'text-gray-200 cursor-not-allowed' : item.visible ? 'text-green-500 hover:bg-green-50' : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'}`}
                title={isAlwaysVisible ? '此工具必須顯示' : item.visible ? '點擊隱藏' : '點擊顯示'}
            >
                {item.visible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </button>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ToolbarSettings() {
    const [products, setProducts] = useState<any[]>([]);
    const [toolbarConfig, setToolbarConfig] = useState<ToolbarItemConfig[]>([...DEFAULT_TOOLBAR_CONFIG]);
    const [disclaimerText, setDisclaimerText] = useState('');
    const [disclaimerLinkText, setDisclaimerLinkText] = useState('');
    const [disclaimerLinkUrl, setDisclaimerLinkUrl] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
    );

    // Load all products; use first product's config as initial state
    useEffect(() => {
        (async () => {
            const { data } = await supabase.from('products').select('id, name, specs').order('name');
            if (data && data.length > 0) {
                setProducts(data);
                const firstProduct = data[0];
                const savedConfig: ToolbarItemConfig[] = firstProduct.specs?.toolbar_config || [];
                const merged = DEFAULT_TOOLBAR_CONFIG.map(def => {
                    const found = savedConfig.find((s: ToolbarItemConfig) => s.id === def.id);
                    return found ? { ...def, ...found } : { ...def };
                }).sort((a, b) => a.sort_order - b.sort_order);
                setToolbarConfig(merged);
                setDisclaimerText(firstProduct.specs?.upload_disclaimer_text || '');
                setDisclaimerLinkText(firstProduct.specs?.upload_disclaimer_link_text || '');
                setDisclaimerLinkUrl(firstProduct.specs?.upload_disclaimer_url || '');
            }
            setLoading(false);
        })();
    }, []);

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        setToolbarConfig(prev => {
            const oldIdx = prev.findIndex(i => i.id === active.id);
            const newIdx = prev.findIndex(i => i.id === over.id);
            return arrayMove(prev, oldIdx, newIdx).map((item, idx) => ({ ...item, sort_order: idx + 1 }));
        });
    };

    const handleToggleVisible = (id: string) => {
        if (ALWAYS_VISIBLE.has(id)) return;
        setToolbarConfig(prev => prev.map(i => i.id === id ? { ...i, visible: !i.visible } : i));
    };

    const handleRename = (id: string, val: string) => {
        setToolbarConfig(prev => prev.map(i => i.id === id ? { ...i, label: val } : i));
    };

    const handleReset = () => {
        setToolbarConfig([...DEFAULT_TOOLBAR_CONFIG]);
        setDisclaimerText('');
        setDisclaimerLinkText('');
        setDisclaimerLinkUrl('');
    };

    // Save to ALL products at once (global toolbar config)
    const handleSave = useCallback(async () => {
        setSaving(true);
        try {
            const updates = products.map(product => {
                const newSpecs = {
                    ...(product.specs || {}),
                    toolbar_config: toolbarConfig,
                    upload_disclaimer_text: disclaimerText.trim(),
                    upload_disclaimer_link_text: disclaimerLinkText.trim(),
                    upload_disclaimer_url: disclaimerLinkUrl.trim(),
                };
                return supabase.from('products').update({ specs: newSpecs }).eq('id', product.id);
            });
            const results = await Promise.all(updates);
            const failed = results.find(r => r.error);
            if (failed?.error) {
                alert('儲存失敗：' + failed.error.message);
            } else {
                setSaved(true);
                setTimeout(() => setSaved(false), 2000);
            }
        } finally {
            setSaving(false);
        }
    }, [toolbarConfig, disclaimerText, disclaimerLinkText, disclaimerLinkUrl, products]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
        );
    }

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center gap-3">
                <PanelLeft className="w-6 h-6 text-indigo-500" />
                <div>
                    <h1 className="text-xl font-bold text-gray-900">前台工具列設定</h1>
                    <p className="text-sm text-gray-500">設定前台側邊工具列的順序、名稱與顯示狀態，儲存後套用至所有商品</p>
                </div>
            </div>

            {/* Toolbar Order & Visibility */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <ArrowUpDown className="w-4 h-4 text-gray-500" />
                        <h2 className="font-semibold text-gray-800">工具列管理</h2>
                    </div>
                    <button onClick={handleReset} className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                        <RotateCcw className="w-3 h-3" /> 重置預設
                    </button>
                </div>
                <p className="text-xs text-gray-400 flex items-center gap-1">
                    <Info className="w-3 h-3" />
                    拖拉可調整順序；點擊工具名稱可修改；眼睛圖示可控制顯示/隱藏
                </p>

                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={toolbarConfig.map(i => i.id)} strategy={verticalListSortingStrategy}>
                        <div className="space-y-2">
                            {toolbarConfig.map(item => (
                                <SortableToolRow
                                    key={item.id}
                                    item={item}
                                    onToggleVisible={() => handleToggleVisible(item.id)}
                                    onRename={val => handleRename(item.id, val)}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>

            {/* Upload Disclaimer Custom Text */}
            <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-4">
                <div className="flex items-center gap-2">
                    <Type className="w-4 h-4 text-gray-500" />
                    <h2 className="font-semibold text-gray-800">上傳圖片彈窗文案</h2>
                </div>
                <p className="text-xs text-gray-400">若空白，則顯示系統預設授權聲明文字。</p>

                <div className="space-y-3">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">授權聲明文字（主文）</label>
                        <textarea
                            value={disclaimerText}
                            onChange={e => setDisclaimerText(e.target.value)}
                            rows={2}
                            placeholder="例如：上傳圖片前，請確認您擁有該圖片的使用權，並同意遵守本網站的..."
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">條款連結文字</label>
                            <input
                                type="text" value={disclaimerLinkText}
                                onChange={e => setDisclaimerLinkText(e.target.value)}
                                placeholder="例如：服務條款購買須知"
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">條款連結 URL</label>
                            <input
                                type="url" value={disclaimerLinkUrl}
                                onChange={e => setDisclaimerLinkUrl(e.target.value)}
                                placeholder="https://..."
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all ${
                        saved
                            ? 'bg-green-500 text-white'
                            : 'bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-40 disabled:cursor-not-allowed'
                    }`}
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saved ? '已儲存 ✓' : `儲存設定（套用至全部 ${products.length} 個商品）`}
                </button>
            </div>
        </div>
    );
}
