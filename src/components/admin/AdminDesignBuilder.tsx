import React, { useState, useEffect, useRef, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { listAssets } from '../../lib/assets';
import { listFrames, Frame } from '../../lib/frameService';
import CanvasEditor, { CanvasEditorRef } from '../../components/CanvasEditor';
import FontPicker from '../../components/FontPicker';
import { AssetItem } from '@/types';
import { Palette, X, Layers, Image as ImageIcon, Sparkles, Loader2, Save, Type, Plus, Undo2, Redo2, Trash2, Ban } from 'lucide-react';

interface AdminDesignBuilderProps {
    onClose: () => void;
    onSave: (canvasData: any, previewUrl: string) => Promise<void>;
    canvasWidthMM: number;
    canvasHeightMM: number;
}

const FONT_OPTIONS = [
    { family: 'Arial', label: 'Arial' },
    { family: 'Georgia', label: 'Georgia' },
    { family: 'Verdana', label: 'Verdana' },
    { family: 'Noto Sans TC', label: '思源黑體' },
    { family: 'Noto Serif TC', label: '思源明體' },
    { family: 'LXGW WenKai TC', label: '霞鶩文楷' },
    { family: 'Dela Gothic One', label: 'Dela Gothic' },
    { family: 'Pacifico', label: 'Pacifico' },
    { family: 'Dancing Script', label: 'Dancing Script' },
    { family: 'Lobster', label: 'Lobster' },
];

export default function AdminDesignBuilder({ onClose, onSave, canvasWidthMM, canvasHeightMM }: AdminDesignBuilderProps) {
    const canvasRef = useRef<CanvasEditorRef>(null);

    const [productConfig] = useState({
        width: Math.round(canvasWidthMM * 300 / 25.4),
        height: Math.round(canvasHeightMM * 300 / 25.4),
        borderRadius: 0,
        baseImage: '',
        maskImage: '',
        offset: { x: 0, y: 0 }
    });

    const currentProductProp = useMemo(() => ({
        id: 'admin_design_builder',
        base_image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        mask_image: '',
    }), []);

    const [activePanel, setActivePanel] = useState<'stickers' | 'backgrounds' | 'frames' | 'text'>('stickers');

    const [stickers, setStickers] = useState<AssetItem[]>([]);
    const [backgrounds, setBackgrounds] = useState<AssetItem[]>([]);
    const [frames, setFrames] = useState<Frame[]>([]);
    const [stickerCategories, setStickerCategories] = useState<string[]>(['全部']);
    const [backgroundCategories, setBackgroundCategories] = useState<string[]>(['全部']);
    const [frameCategories, setFrameCategories] = useState<string[]>(['全部']);
    const [selectedAssetCategory, setSelectedAssetCategory] = useState<string>('全部');
    const [loadingAssets, setLoadingAssets] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Text tool state
    const [textInput, setTextInput] = useState('您的文字');
    const [textFont, setTextFont] = useState('Noto Sans TC');
    const [textColor, setTextColor] = useState('#000000');
    const [textSize, setTextSize] = useState(48);

    useEffect(() => {
        const loadAssets = async () => {
            if (activePanel === 'text') return;
            setLoadingAssets(true);
            try {
                if (activePanel === 'stickers' || activePanel === 'backgrounds') {
                    const type = activePanel === 'stickers' ? 'sticker' : 'background';
                    const { data } = await listAssets({ type, category: '全部', limit: 300 }); // Increased limit to fetch all categories
                    if (type === 'sticker') {
                        setStickers(data);
                        setStickerCategories(['全部', ...Array.from(new Set(data.map(item => item.category).filter(Boolean) as string[]))]);
                    } else {
                        setBackgrounds(data);
                        setBackgroundCategories(['全部', ...Array.from(new Set(data.map(item => item.category).filter(Boolean) as string[]))]);
                    }
                } else if (activePanel === 'frames') {
                    const { data } = await listFrames();
                    setFrames(data);
                    setFrameCategories(['全部', ...Array.from(new Set(data.map(item => item.category).filter(Boolean) as string[]))]);
                }
            } catch (e) {
                console.error("Failed to load assets", e);
            } finally {
                setLoadingAssets(false);
            }
        };
        loadAssets();
    }, [activePanel]);

    const handleAddText = () => {
        if (!textInput.trim()) return;
        canvasRef.current?.addTextLayer({
            text: textInput,
            fontFamily: textFont,
            fill: textColor,
            fontSize: textSize,
        });
    };

    const handleSave = async () => {
        if (!canvasRef.current) return;
        setIsSaving(true);
        try {
            const canvasData = await canvasRef.current.exportAsJSON();
            const previewDataUrl = await canvasRef.current.exportAsDataURL({ withMask: true });
            await onSave(canvasData, previewDataUrl);
            onClose();
        } catch (error) {
            console.error("Save failed:", error);
            alert("儲存失敗，請重試");
        } finally {
            setIsSaving(false);
        }
    };

    const tabClass = (panel: string) =>
        `flex-1 py-3 text-sm font-medium border-b-2 transition-colors flex flex-col items-center gap-1 ${activePanel === panel ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'}`;

    const handleTabSwitch = (panel: 'stickers' | 'backgrounds' | 'frames' | 'text') => {
        setActivePanel(panel);
        setSelectedAssetCategory('全部');
    };

    const renderCategoryTabs = (categories: string[]) => (
        <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-2 scrollbar-none border-b border-gray-100 shrink-0">
            {categories.map((cat) => (
                <button
                    key={cat}
                    onClick={() => setSelectedAssetCategory(cat)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors shrink-0 
                        ${selectedAssetCategory === cat 
                            ? 'bg-blue-600 text-white shadow-sm' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                    {cat}
                </button>
            ))}
        </div>
    );

    return (
        <div className="flex flex-col h-full bg-gray-50">
            {/* Header */}
            <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <Palette className="w-5 h-5 text-blue-600" />
                    <h2 className="text-lg font-bold text-gray-800">建立設計款模板</h2>
                    <span className="text-xs text-gray-500 ml-2 bg-gray-100 px-2 py-1 rounded">在此排版好的圖樣，客戶可直接套用到不同型號的手機殼</span>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors" disabled={isSaving}>
                        取消
                    </button>
                    <button onClick={handleSave} disabled={isSaving} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2">
                        {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        儲存並產生連結
                    </button>
                </div>
            </header>

            {/* Main Workspace */}
            <div className="flex flex-1 overflow-hidden relative">

                {/* Left Sidebar */}
                <div className="w-80 bg-white border-r border-gray-200 flex flex-col shrink-0 z-10">
                    {/* Tabs */}
                    <div className="flex border-b border-gray-100">
                        <button onClick={() => handleTabSwitch('stickers')} className={tabClass('stickers')}>
                            <Sparkles className="w-4 h-4" /> 貼紙
                        </button>
                        <button onClick={() => handleTabSwitch('frames')} className={tabClass('frames')}>
                            <ImageIcon className="w-4 h-4" /> 相框
                        </button>
                        <button onClick={() => handleTabSwitch('backgrounds')} className={tabClass('backgrounds')}>
                            <Layers className="w-4 h-4" /> 背景
                        </button>
                        <button onClick={() => handleTabSwitch('text')} className={tabClass('text')}>
                            <Type className="w-4 h-4" /> 字體
                        </button>
                    </div>

                    {/* Panel Content */}
                    <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
                        {activePanel === 'text' ? (
                            /* ── 文字工具面板 ── */
                            <div className="space-y-5">
                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">文字內容</label>
                                    <textarea
                                        value={textInput}
                                        onChange={e => setTextInput(e.target.value)}
                                        rows={3}
                                        placeholder="輸入文字..."
                                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 resize-none"
                                        style={{ fontFamily: textFont }}
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-gray-600 mb-1.5">字型</label>
                                    <FontPicker value={textFont} onChange={setTextFont} options={FONT_OPTIONS} />
                                </div>

                                <div className="flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-xs font-semibold text-gray-600 mb-1.5">顏色</label>
                                        <div className="flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={textColor}
                                                onChange={e => setTextColor(e.target.value)}
                                                className="w-9 h-9 rounded-lg border border-gray-200 cursor-pointer p-0.5"
                                            />
                                            <span className="text-xs text-gray-500 font-mono">{textColor}</span>
                                        </div>
                                    </div>
                                    <div className="flex-1">
                                        <label className="block text-xs font-semibold text-gray-600 mb-1.5">大小 <span className="text-blue-600">{textSize}px</span></label>
                                        <input
                                            type="range"
                                            min={12}
                                            max={200}
                                            value={textSize}
                                            onChange={e => setTextSize(Number(e.target.value))}
                                            className="w-full accent-blue-600"
                                        />
                                    </div>
                                </div>

                                {/* Preview */}
                                <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 flex items-center justify-center min-h-[80px]">
                                    <span style={{ fontFamily: textFont, color: textColor, fontSize: Math.min(textSize, 48) }} className="break-all text-center">
                                        {textInput || '預覽文字'}
                                    </span>
                                </div>

                                <button
                                    onClick={handleAddText}
                                    className="w-full py-3 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 shadow-sm active:scale-[0.98]"
                                >
                                    <Plus className="w-4 h-4" />
                                    加入畫布
                                </button>

                                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 leading-relaxed">
                                    💡 <strong>提示：</strong>客戶套用此模板後，可<strong>雙擊文字</strong>直接編輯修改內容，非常方便！
                                </p>
                            </div>
                        ) : loadingAssets ? (
                            <div className="flex items-center justify-center h-32">
                                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                            </div>
                        ) : activePanel === 'stickers' ? (
                            <div className="flex flex-col h-full">
                                {renderCategoryTabs(stickerCategories)}
                                <div className="grid grid-cols-4 gap-2">
                                    {stickers.filter(s => selectedAssetCategory === '全部' || s.category === selectedAssetCategory).map((s) => (
                                        <button key={s.id} onClick={() => canvasRef.current?.addSticker(s.url)}
                                            className="aspect-square bg-gray-50 rounded-lg p-2 border border-gray-100 hover:border-blue-400 hover:shadow-sm transition-all flex items-center justify-center group">
                                            <img src={s.url} alt={s.name} className="max-w-full max-h-full object-contain group-hover:scale-110 transition-transform" crossOrigin="anonymous" />
                                        </button>
                                    ))}
                                    {stickers.filter(s => selectedAssetCategory === '全部' || s.category === selectedAssetCategory).length === 0 && <p className="col-span-4 text-center text-sm text-gray-400 py-8">這個分類沒有素材</p>}
                                </div>
                            </div>
                        ) : activePanel === 'frames' ? (
                            <div className="flex flex-col h-full">
                                {renderCategoryTabs(frameCategories)}
                                <div className="grid grid-cols-3 gap-2">
                                    {frames.filter(f => selectedAssetCategory === '全部' || f.category === selectedAssetCategory).map((f) => (
                                        <button key={f.id} onClick={() => canvasRef.current?.addFrame({
                                            id: f.id, name: f.name, imageUrl: f.url,
                                            clipPathPoints: f.clipPathPoints, width: f.width, height: f.height, category: f.category
                                        })}
                                            className="aspect-[3/4] bg-gray-50 rounded-lg p-1.5 border border-gray-100 hover:border-blue-400 hover:shadow-sm transition-all flex flex-col items-center justify-center group">
                                            <div className="flex-1 w-full flex items-center justify-center mb-1">
                                                <img src={f.url} alt={f.name} className="max-w-full max-h-full object-contain drop-shadow-sm group-hover:scale-105 transition-transform" crossOrigin="anonymous" />
                                            </div>
                                            <span className="text-[9px] text-gray-500 truncate w-full text-center px-0.5">{f.name}</span>
                                        </button>
                                    ))}
                                    {frames.filter(f => selectedAssetCategory === '全部' || f.category === selectedAssetCategory).length === 0 && <p className="col-span-3 text-center text-sm text-gray-400 py-8">這個分類沒有相框</p>}
                                </div>
                            </div>
                        ) : activePanel === 'backgrounds' ? (
                            <div className="flex flex-col gap-5">
                                {/* 純色背景區塊 */}
                                <div className="border border-gray-100 rounded-xl p-4 bg-white shadow-sm">
                                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">純色背景</div>
                                    <div className="flex flex-wrap gap-2.5">
                                        {/* Remove Background */}
                                        <button
                                            onClick={() => {
                                                canvasRef.current?.setCanvasBgImage("");
                                                canvasRef.current?.setCanvasBgColor(null);
                                            }}
                                            className="w-8 h-8 flex-shrink-0 rounded-full border border-gray-200 hover:scale-110 transition-transform shadow-sm relative bg-white flex items-center justify-center text-red-500"
                                            title="移除背景"
                                        >
                                            <Ban className="w-4 h-4" />
                                        </button>

                                        {/* Custom Color Picker */}
                                        <label className="w-8 h-8 flex-shrink-0 rounded-full border border-gray-300 cursor-pointer relative overflow-hidden flex items-center justify-center bg-gradient-to-br from-red-500 via-green-500 to-blue-500 hover:shadow-md transition-shadow" title="自訂顏色">
                                            <input
                                                type="color"
                                                className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                                                onChange={(e) => canvasRef.current?.setCanvasBgColor(e.target.value)}
                                            />
                                            <div className="bg-white/80 p-0.5 rounded-full pointer-events-none">
                                                <Plus className="w-3 h-3 text-gray-600" />
                                            </div>
                                        </label>

                                        {/* Presets */}
                                        {['#FF0000', '#FFA500', '#FFFF00', '#008000', '#0000FF', '#4B0082', '#EE82EE', '#1C1C1E', '#FFFFFF'].map(color => (
                                            <button
                                                key={color}
                                                onClick={() => canvasRef.current?.setCanvasBgColor(color)}
                                                className="w-8 h-8 flex-shrink-0 rounded-full border border-gray-200 hover:scale-110 transition-transform shadow-sm relative cursor-pointer"
                                                style={{ backgroundColor: color }}
                                                title={color}
                                            >
                                                {color === '#FFFFFF' && <div className="absolute inset-0 border border-gray-100 rounded-full" />}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {/* 圖片背景區塊 */}
                                <div>
                                    <div className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">圖片背景</div>
                                    {renderCategoryTabs(backgroundCategories)}
                                    <div className="grid grid-cols-3 gap-2 mt-2">
                                        <button onClick={() => canvasRef.current?.setCanvasBgImage("")}
                                            className="aspect-[9/16] bg-gray-50 rounded-lg border-2 border-dashed border-gray-300 hover:border-red-400 hover:text-red-500 text-gray-400 transition-all flex flex-col items-center justify-center">
                                            <X className="w-5 h-5 mb-1" />
                                            <span className="text-[10px] font-medium">移除圖片</span>
                                        </button>
                                        {backgrounds.filter(bg => selectedAssetCategory === '全部' || bg.category === selectedAssetCategory).map((bg) => (
                                            <button key={bg.id} onClick={() => canvasRef.current?.setCanvasBgImage(bg.url)}
                                                className="aspect-[9/16] rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-md transition-all overflow-hidden relative group">
                                                <img src={bg.url} alt={bg.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" crossOrigin="anonymous" />
                                            </button>
                                        ))}
                                    </div>
                                    {backgrounds.filter(bg => selectedAssetCategory === '全部' || bg.category === selectedAssetCategory).length === 0 && <p className="text-center text-sm text-gray-400 py-8">這個分類沒有圖片</p>}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>

                {/* Canvas Area - no extra wrapper div so CanvasEditor fills all available space */}
                <div className="flex-1 relative overflow-hidden">
                    <CanvasEditor
                        ref={canvasRef}
                        currentProduct={currentProductProp}
                        previewConfig={{
                            ...productConfig,
                            width: Math.round(canvasWidthMM * 300 / 25.4),
                            height: Math.round(canvasHeightMM * 300 / 25.4)
                        }}
                        uploadedImage={null}
                        readOnly={false}
                        disableDraft={true}
                        disableFrameUpload={true}
                        isAdminMode={true}
                    />
                </div>

                {/* Right Sidebar */}
                <div className="w-72 bg-white border-l border-gray-200 shrink-0 z-10 flex flex-col shadow-[-4px_0_15px_-3px_rgba(0,0,0,0.05)]">
                    {/* 圖層與工具 header with undo/redo/clear */}
                    <div className="p-3 border-b border-gray-100 bg-gray-50 flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                            <Layers className="w-4 h-4 text-gray-500" />
                            <h3 className="text-sm font-medium text-gray-700 flex-1">圖層與工具</h3>
                        </div>
                        {/* 工具列：復原 / 重做 / 清空 */}
                        <div className="flex items-center gap-1">
                            <button
                                onClick={() => canvasRef.current?.undo()}
                                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 px-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-lg transition-all text-xs"
                                title="復原"
                            >
                                <Undo2 className="w-4 h-4" />
                                <span className="text-[10px] font-medium">復原</span>
                            </button>
                            <button
                                onClick={() => canvasRef.current?.redo()}
                                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 px-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 rounded-lg transition-all text-xs"
                                title="重做"
                            >
                                <Redo2 className="w-4 h-4" />
                                <span className="text-[10px] font-medium">重做</span>
                            </button>
                            <div className="w-px h-8 bg-gray-200 mx-0.5" />
                            <button
                                onClick={() => canvasRef.current?.clearCanvas()}
                                className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 px-2 text-gray-500 hover:bg-red-50 hover:text-red-600 rounded-lg transition-all text-xs"
                                title="清空畫布"
                            >
                                <Trash2 className="w-4 h-4" />
                                <span className="text-[10px] font-medium">清空</span>
                            </button>
                        </div>
                    </div>
                    <div className="p-4 flex-1 overflow-y-auto">
                        <p className="text-xs text-gray-500 mb-4 bg-blue-50 p-3 rounded text-blue-800 leading-relaxed border border-blue-100">
                            🔔 <strong>設計技巧：</strong><br />
                            於左側點擊即可新增素材、相框、背景或文字。<br />
                            可以直接在畫布上拖曳、旋轉、縮放。<br />
                            所有素材套用到不同殼型時都會完整保留！
                        </p>
                        <p className="text-xs text-amber-700 bg-amber-50 p-3 rounded border border-amber-100 leading-relaxed">
                            💡 <strong>相框提醒：</strong><br />
                            加入相框後，客戶在前台套用此模板時，可點擊相框中心直接替換成自己的照片。
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
}
