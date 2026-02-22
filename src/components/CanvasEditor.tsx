import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { apiUrl } from '../lib/apiBase';
import {
    Canvas,
    FabricImage,
    Rect,
    Circle,
    IText,
    FabricObject,
    Control,
    util,
    Shadow,
    Path,
    Polygon,
    ActiveSelection,
    Point,
    filters as fabricFilters
} from 'fabric';

// --- Race Condition Guards ---
let baseLoadToken = 0;
let maskLoadToken = 0;

// --- Robust Loading Helpers ---
const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

const loadImageElement = async (url: string): Promise<HTMLImageElement> => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const p = new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = (e) => reject(e);
    });

    img.src = url;

    // Fast path for cache
    if (img.complete && img.naturalWidth > 0) {
        try {
            await img.decode();
            return img;
        } catch (e) {
            console.warn("Image decode failed, fallback to onload", e);
        }
    }

    try {
        await img.decode();
    } catch (e) {
        await p;
    }
    return img;
};

const centerAndStabilize = async (
    canvas: Canvas,
    obj: FabricObject,
    centerX: number,
    centerY: number,
    onAfterSecondFrame?: () => void
) => {
    // 1. Initial Center: force to design-space center
    obj.set({
        originX: 'center',
        originY: 'center',
        left: centerX,
        top: centerY
    });

    obj.setCoords();
    canvas.requestRenderAll();

    // 2. Wait for Next Frame (Second Frame Stabilization)
    await nextFrame();

    // 3. Re-calculate Offset & Re-center
    canvas.calcOffset();

    obj.set({
        left: centerX,
        top: centerY
    });
    obj.setCoords();

    // 4. Optional: Run post-stabilization logic
    if (onAfterSecondFrame) {
        onAfterSecondFrame();
    }

    canvas.requestRenderAll();
};

// Helper: Calculate Polygon Centroid from points
function getPolygonCentroid(points: { x: number, y: number }[]) {
    if (!points || points.length === 0) return { x: 0, y: 0 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    points.forEach(p => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
    });
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

// --- Morphing Helpers ---

// Generate Star Points: 0 (Sharp Star) -> 100 (Pentagon-like)
function getStarPoints(outerRadius: number, param0to100: number) {
    const t = Math.max(0, Math.min(100, param0to100)) / 100;

    // Standard 5-point star inner radius ratio is ~0.382
    // A regular pentagon can be thought of as a star with inner vertices lying on the edges connecting outer vertices.
    // The inner radius for a pentagon (distance to center from midpoint of edge) is outerRadius * cos(36deg) = outerRadius * 0.809

    // We map 0 -> 0.382 (Sharp/Standard Star)
    // We map 100 -> 0.809 (Pentagon)

    const startRatio = 0.382;
    const endRatio = 0.809;
    const innerRatio = startRatio + (endRatio - startRatio) * t;

    const points = [];
    const spikes = 5;
    const innerRadius = outerRadius * innerRatio;

    // Rotate -90 deg to point up
    const offsetAngle = -Math.PI / 2;

    for (let i = 0; i < spikes * 2; i++) {
        const r = (i % 2 === 0) ? outerRadius : innerRadius;
        const angle = (Math.PI / spikes) * i + offsetAngle;
        points.push({
            x: Math.cos(angle) * r,
            y: Math.sin(angle) * r
        });
    }
    return points;
}

// Generate Heart Path: 0 (Sharp) -> 100 (Round/Bean)
function getHeartPath(width: number, height: number, t: number) {
    // t comes in as -1.2 to 1 (Sharp to Round)

    // Normalized Coordinates (-1 to 1 range approx)
    // We interpolate Control Points

    // Sharp Heart (Classic)
    // Top Dip: (0, -0.3)
    // Top Left Lobe Control: (-0.5, -0.8) -> (-1, -0.2)
    // Bottom Left Control: (-1, 0.5) -> (-0.5, 0.8) -> (0, 1) (Tip)

    // Round Heart (Bean/Oval-like)
    // Top Dip: (0, -0.8) (Much flatter top)
    // Bottom Tip: (0, 1) but with control points spreading out to make it round

    // Helper to lerp points
    const l = (a: number, b: number) => a + (b - a) * t;

    // Dimensions
    const w = width / 2;
    const h = height / 2;

    // --- Key Points Interpolation (Normalized Y: -1 Top, 1 Bottom) ---

    // 1. Top Center Dip (Start)
    // Sharp: -0.4, Round: -0.55 (Adjusted for fuller look)
    const topDipY = l(-0.4, -0.55) * h;

    // 2. Top Left Curve (C1, C2, Anchor)
    // Anchor (Top Left Edge): Sharp (-0.9w, -0.2h), Round (-1.0w, -0.3h) (Wider & higher shoulders)
    // Control 1 (From Dip): Sharp (-0.3w, -0.9h), Round (-0.4w, -1.05h) (Rounder top arc)
    // Control 2 (To Anchor): Sharp (-0.9w, -0.8h), Round (-1.0w, -0.8h)

    const tl_c1x = l(-0.3, -0.4) * w;
    const tl_c1y = l(-0.9, -1.05) * h;
    const tl_c2x = l(-0.9, -1.0) * w;
    const tl_c2y = l(-0.8, -0.8) * h;
    const tl_ax = l(-0.9, -1.0) * w;
    const tl_ay = l(-0.2, -0.3) * h;

    // 3. Bottom Left Curve (C3, C4, BottomTip)
    // Bottom Tip: (0, h) (Fixed point)
    // Control 3 (From Anchor): Sharp (-0.9w, 0.4h), Round (-1.0w, 0.6h) (Fuller bottom sides)
    // Control 4 (To Tip): Sharp (-0.3w, 0.9h), Round (-0.6w, 0.95h) (Blunt tip)

    const bl_c3x = l(-0.9, -1.0) * w;
    const bl_c3y = l(0.4, 0.6) * h;
    const bl_c4x = l(-0.3, -0.6) * w;
    const bl_c4y = l(0.9, 0.95) * h;

    const tipY = 1.0 * h;

    // Construct Path
    // M 0,topDipY
    // C tl_c1x,tl_c1y tl_c2x,tl_c2y tl_ax,tl_ay (Top Left)
    // C bl_c3x,bl_c3y bl_c4x,bl_c4y 0,tipY (Bottom Left)
    // (Reflect for Right side)

    return `M 0 ${topDipY} 
            C ${tl_c1x} ${tl_c1y} ${tl_c2x} ${tl_c2y} ${tl_ax} ${tl_ay} 
            C ${bl_c3x} ${bl_c3y} ${bl_c4x} ${bl_c4y} 0 ${tipY} 
            C ${-bl_c4x} ${bl_c4y} ${-bl_c3x} ${bl_c3y} ${-tl_ax} ${tl_ay} 
            C ${-tl_c2x} ${tl_c2y} ${-tl_c1x} ${tl_c1y} 0 ${topDipY} Z`;
}

// Helper: Rotate point around (0,0)
const rotateVector = (x: number, y: number, angleDegrees: number) => {
    const radians = (angleDegrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
        x: x * cos - y * sin,
        y: x * sin + y * cos
    };
};

// Helper: Role management for layering
function getRole(o: any) {
    return o?.data?.role;
}
function isBase(o: any) { return getRole(o) === 'product_base'; }
function isOverlay(o: any) { return getRole(o) === 'product_overlay'; }

function moveToDesignBgLayer(canvas: Canvas, bgObj: FabricObject) {
    const objs = canvas.getObjects();
    let lastBaseIndex = -1;
    let firstOverlayIndex = Infinity;

    objs.forEach((o, i) => {
        if (o === bgObj) return;
        if (isBase(o)) lastBaseIndex = Math.max(lastBaseIndex, i);
        if (isOverlay(o)) firstOverlayIndex = Math.min(firstOverlayIndex, i);
    });

    // Default after base 
    let targetIndex = lastBaseIndex >= 0 ? lastBaseIndex + 1 : 0;

    // If overlay exists, bg must be before overlay 
    if (firstOverlayIndex !== Infinity) {
        targetIndex = Math.min(targetIndex, firstOverlayIndex);
    }

    canvas.moveObjectTo(bgObj, targetIndex);
}

// Helper: Check if object is "Image-like" for gestures (Pinch Zoom/Rotate)
const isImageLikeObject = (obj: any): boolean => {
    if (!obj) return false;

    // (A) Priority: Custom Metadata
    if (obj.data?.kind === 'user_image' || obj.data?.type === 'image' || obj.data?.source === 'upload' || obj.data?.source === 'ai') {
        return true;
    }

    // (C) Exclusion List (Must be false)
    const type = obj.type;
    // Common non-image types
    if (['i-text', 'text', 'textbox', 'group', 'path', 'rect', 'circle', 'polygon', 'line', 'activeSelection'].includes(type)) return false;
    // Custom exclusions based on properties
    if (obj.isBaseLayer || obj.isMaskLayer || obj.isFrameLayer || obj.id === 'system_base_image' || obj.id === 'system_mask_image') return false;

    // (B) Type Check
    if (type === 'image') return true;

    return false;
};

type AnyObj = any;

function isRect(o: AnyObj) {
    return !!o && o.type === 'rect';
}
function isPathLike(o: AnyObj) {
    return !!o && (o.type === 'path' || o.type === 'polygon' || o.type === 'polyline');
}

/** 
 * 取「真正的愛心 mask」，避免拿到 boundary。 
 * - 若 obj.clipPath 是 path 且 obj.clipPath.clipPath 是 rect => mask = obj.clipPath 
 * - 若 obj.clipPath 是 rect 且 obj.clipPath.clipPath 是 path => mask = obj.clipPath.clipPath 
 */
function getHeartMask(obj: AnyObj): FabricObject | null {
    const cp = obj?.clipPath as AnyObj | undefined;
    if (!cp) return null;

    const nested = cp.clipPath as AnyObj | undefined;

    // 常見：mask(path) 外層，nested 是 boundary(rect) 
    if (isPathLike(cp) && nested && isRect(nested)) return cp;

    // 另一種：boundary(rect) 外層，nested 是 mask(path) 
    if (isRect(cp) && nested && isPathLike(nested)) return nested;

    // fallback：盡量回傳 path-like 
    if (isPathLike(cp)) return cp;
    if (nested && isPathLike(nested)) return nested;

    return null;
}

function ensureMaskCenteredOnOwner(owner: AnyObj, mask: AnyObj) {
    if (!owner || !mask) return;

    // 不允許旋轉 + 錨點固定中心 
    mask.set({ originX: 'center', originY: 'center', angle: 0 });

    // 相對 clip（最常見）：用 0,0 + center 
    // 這裡不要硬改 absolutePositioned，避免破壞既有座標系 
    if (!mask.absolutePositioned) {
        mask.set({ left: 0, top: 0 });
    } else {
        const c = owner.getCenterPoint();
        mask.set({ left: c.x, top: c.y });
    }

    mask.setCoords?.();
}

function getInnerClip(obj: AnyObj): FabricObject | null {
    const cp = obj?.clipPath as AnyObj | undefined;
    if (!cp) return null;
    return (cp.clipPath ? cp.clipPath : cp) as FabricObject;
}

function centerClipOnOwner(owner: AnyObj, clip: AnyObj) {
    if (!owner || !clip) return;

    // 一律鎖中心 + 不旋轉
    clip.set({ originX: 'center', originY: 'center', angle: 0 });

    // 絕對定位的 clip：用 owner 的畫布中心點
    if (clip.absolutePositioned) {
        const c = owner.getCenterPoint();
        clip.set({ left: c.x, top: c.y });
    } else {
        // 相對定位的 clip：用 (0,0) 且 center origin，避免左上錨點
        clip.set({ left: 0, top: 0 });
    }

    clip.setCoords?.();
}

function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

function getFrameMask(owner: any) {
    const seen = new Set<any>();
    let cp = owner?.clipPath;
    let depth = 0;
    while (cp && depth < 6) {
        if (seen.has(cp)) break;
        seen.add(cp);

        if (cp?.data?.frameRole === 'mask') return cp;

        // 常見 nested：root.clipPath 內再包一層 
        if (cp?.clipPath) {
            const inner = cp.clipPath;
            if (inner?.data?.frameRole === 'mask') return inner;
            // 往更深層走 
            cp = inner;
            depth++;
            continue;
        }

        break;
    }

    // fallback：如果沒標記 role，就用 shape/type 猜（避免舊稿讀入壞掉） 
    const root = owner?.clipPath;
    if (!root) return null;
    if (root.type === 'path' || root.type === 'polygon') return root;
    if (root.clipPath && (root.clipPath.type === 'path' || root.clipPath.type === 'polygon')) return root.clipPath;
    return null;
}

function markDirtyAll(canvas: any, owner: any, mask: any) {
    if (mask) { mask.dirty = true; mask.setCoords?.(); }
    if (owner) { owner.dirty = true; owner.setCoords?.(); }
    const cp: any = owner?.clipPath;
    if (cp) { cp.dirty = true; cp.setCoords?.(); }
    canvas?.requestRenderAll?.();
}

import { useProductStore } from '../store/useProductStore';
import {
    Trash2, Type, Palette, Loader2, Undo2, Redo2, Copy, FlipHorizontal, Maximize, Minimize2,
    AlignCenter, Scissors, ArrowUp, ArrowDown, Bold, Italic, GripVertical, Eye,
    EyeOff, Lock, Unlock, Image as ImageIcon, Sticker, ScanBarcode, Check, X,
    Layers, Upload, Pencil, Sparkles, RefreshCw, Crop, ArrowLeft, Square, Circle as CircleIcon, Heart, Shapes,
    AlignLeft, AlignRight, ChevronDown, PaintBucket, Baseline, Smartphone, Ban, Frame, LayoutTemplate, SlidersHorizontal, Wand2, Eraser, Sun
} from 'lucide-react';
import FontPicker from './FontPicker';
import JsBarcode from 'jsbarcode';
import { get } from 'idb-keyval';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent
} from '@dnd-kit/core';
import { useSearchParams } from 'react-router-dom';
import draftStore, { getDraft, setDraft, removeDraft, Draft } from '../lib/draftStore';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable
} from '@dnd-kit/sortable';
import {
    CSS
} from '@dnd-kit/utilities';

// --- Template Loading Helpers ---
const TEMPLATE_ROLE = 'ppbears_template';
const sessionNonce = Math.random().toString(36).slice(2);

function normalizeImageSrc(input: any): string | null {
    if (!input) return null;
    let s = String(input).trim();

    // 去掉可能的引號包裹
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1).trim();
    }

    // data/blob 直接回傳，不做任何改寫
    if (s.startsWith('data:') || s.startsWith('blob:')) return s;

    // 若看起來是純 base64（沒有 scheme，且只有 base64 字元），補上 prefix
    // 允許包含 '=' '+' '/' 以及換行空白（先清掉）
    const b64 = s.replace(/\s+/g, '');
    const looksLikeBareBase64 =
        !b64.includes('://') &&
        !b64.startsWith('/') &&
        /^[A-Za-z0-9+/=]+$/.test(b64) &&
        b64.length > 100; // 太短的不當成圖片

    if (looksLikeBareBase64) {
        return `data:image/png;base64,${b64}`;
    }

    return s;
}

function withCacheBuster(url: any, v: string) {
    const src = normalizeImageSrc(url);
    if (!src) return src;

    // ✅ data/blob 不支援 query param，直接回傳
    if (src.startsWith('data:') || src.startsWith('blob:')) return src;

    try {
        const u = new URL(src, window.location.origin);
        u.searchParams.set('v', v);
        return u.toString();
    } catch {
        // 可能是相對路徑（/xxx.png），手動拼 query
        const joiner = src.includes('?') ? '&' : '?';
        return `${src}${joiner}v=${encodeURIComponent(v)}`;
    }
}

async function loadImageElementFresh(url: string): Promise<HTMLImageElement> {
    return await new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        img.onload = async () => {
            try { await img.decode(); } catch { }
            resolve(img);
        };
        img.onerror = () => reject(new Error(`Failed to load image: ${url}`));

        // IMPORTANT: 先綁事件再設定 src，避免同步命中快取漏接 onload
        img.src = url;
    });
}

function disposeObjectDeep(obj: FabricObject) {
    // fabric.Image 才有 dispose；其他物件忽略
    // @ts-ignore
    if (typeof (obj as any).dispose === 'function') {
        try { (obj as any).dispose(); } catch { }
    }
    if ((obj as any).getObjects) {
        (obj as any).getObjects().forEach((child: FabricObject) => disposeObjectDeep(child));
    }
}

// --- Constants ---
const FONT_OPTIONS = [
    // Standard English
    { family: 'Arial', label: 'Arial' },
    { family: 'Times New Roman', label: 'Times New Roman' },
    { family: 'Courier New', label: 'Courier New' },
    { family: 'Georgia', label: 'Georgia' },
    { family: 'Verdana', label: 'Verdana' },
    { family: 'Impact', label: 'Impact' },
    // English Cursive (草寫英文)
    { family: 'Dancing Script', label: 'Dancing Script' },
    { family: 'Great Vibes', label: 'Great Vibes' },
    { family: 'Pacifico', label: 'Pacifico' },
    // Traditional Chinese (繁體中文)
    { family: 'Taipei Sans TC Beta', label: '台北黑體' },
    { family: 'LXGW WenKai TC', label: '霞鶩文楷' },
    { family: 'Cactus Classical Serif', label: '仙人掌體' },
    { family: 'Chocolate Classical Sans', label: 'Chocolate Sans' },
    { family: 'Noto Sans TC', label: '思源黑體' },
    { family: 'Noto Serif TC', label: '思源宋體' },
    // Japanese (日文)
    { family: 'Noto Sans JP', label: '日本語 (黑體)' },
    { family: 'Kiwi Maru', label: 'Kiwi Maru (圓體)' },
    { family: 'Zen Maru Gothic', label: 'Zen Maru (圓體)' },
    // Korean (韓文)
    { family: 'Noto Sans KR', label: '한국어 (黑體)' },
    { family: 'Nanum Pen Script', label: 'Nanum Pen (手寫)' }
];
const PRESET_COLORS = [
    '#000000', '#ffffff', '#808080', '#C0C0C0', '#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF',
    '#A52A2A', '#FFA500', '#FFD700', '#808000', '#008000', '#008080', '#000080', '#800080',
    '#F08080', '#F4A460', '#DAA520', '#BDB76B', '#90EE90', '#AFEEEE', '#ADD8E6', '#DDA0DD'
];

// --- Helper Components ---

interface LayerItemData {
    id: string;
    type: string;
    preview?: string;
    visible: boolean;
    locked: boolean;
    name: string;
    fabricObject?: FabricObject;
}

interface FrameTemplate {
    id: string;
    name: string;
    category?: string;
    imageUrl: string;
    clipPathPoints: { x: number; y: number }[];
    width: number;
    height: number;
}

const SortableLayerItem = ({ layer, isActive, onToggleVisible, onToggleLock, onDelete, onSelect }: {
    layer: LayerItemData;
    isActive: boolean;
    onToggleVisible: (e: React.MouseEvent) => void;
    onToggleLock: (e: React.MouseEvent) => void;
    onDelete: (e: React.MouseEvent) => void;
    onSelect: (e: React.MouseEvent) => void;
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: layer.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 999 : 'auto',
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-2 p-2 rounded-md mb-1 text-sm border select-none ${isActive ? 'border-yellow-400 bg-[#FFFFE0]' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
            onClick={onSelect}
        >
            {/* Drag Handle */}
            <div {...attributes} {...listeners} className="cursor-grab text-gray-400 hover:text-gray-600 flex-shrink-0">
                <GripVertical className="w-4 h-4" />
            </div>

            {/* Preview Icon */}
            <div className="w-8 h-8 flex-shrink-0 bg-gray-100 rounded overflow-hidden flex items-center justify-center border border-gray-200">
                {layer.preview ? (
                    <img src={layer.preview} alt="layer" className="w-full h-full object-cover" />
                ) : (
                    <Type className="w-4 h-4 text-gray-500" />
                )}
            </div>

            {/* Name */}
            <div className="flex-1 truncate font-medium text-gray-700 min-w-0">
                {layer.name}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={onToggleVisible} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-200" title={layer.visible ? "Hide" : "Show"}>
                    {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button onClick={onToggleLock} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-200" title={layer.locked ? "Unlock" : "Lock"}>
                    {layer.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </button>
                <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
};

// Internal Helper: Color Picker Section
const ColorPickerSection = ({ label, property, currentVal, onChange }: { label: string, property: string, currentVal: string, onChange: (prop: string, val: string) => void }) => {
    const [tempHex, setTempHex] = useState(currentVal);

    useEffect(() => { setTempHex(currentVal); }, [currentVal]);

    const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setTempHex(val);
        if (/^#[0-9A-F]{6}$/i.test(val)) { onChange(property, val); }
    };

    return (
        <div className="flex flex-col gap-1 px-2 py-1">
            <div className="text-xs text-gray-500 font-medium flex justify-between items-center">
                {label}
                <div className="flex items-center border border-gray-300 rounded overflow-hidden bg-white">
                    <div className="relative w-8 h-8 flex-shrink-0 border-r border-gray-200">
                        <div className="absolute inset-0" style={{ backgroundColor: currentVal }}></div>
                        <input
                            type="color"
                            value={currentVal}
                            onChange={(e) => onChange(property, e.target.value)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                    </div>
                    <input type="text" value={tempHex.toUpperCase()} onChange={handleHexChange} className="w-20 text-xs p-1 outline-none font-mono" placeholder="#RRGGBB" maxLength={7} />

                    {property === 'backgroundColor' && (
                        <button
                            className={`w-8 h-8 flex items-center justify-center border-l border-gray-300 bg-white relative overflow-hidden hover:bg-gray-50 ${currentVal === 'transparent' ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
                            onClick={() => onChange(property, 'transparent')}
                            title="Transparent"
                        >
                            <div className="absolute inset-0 bg-white" style={{ backgroundImage: 'linear-gradient(45deg, #ccc 25%, transparent 25%), linear-gradient(-45deg, #ccc 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #ccc 75%), linear-gradient(-45deg, transparent 75%, #ccc 75%)', backgroundSize: '8px 8px', backgroundPosition: '0 0, 0 4px, 4px -4px, -4px 0px' }}></div>
                            <div className="absolute inset-0 flex items-center justify-center text-red-500 text-xs font-bold z-10">/</div>
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Fabric V7 Global Configuration ---
// @ts-ignore
IText.prototype._renderBackground = function (ctx) {
    if (!this.backgroundColor) return;
    const dim = this._getNonTransformedDimensions();
    const pad = this.padding || 0;
    // @ts-ignore
    const rad = this.bgCornerRadius || 0;

    const x = -dim.x / 2 - pad;
    const y = -dim.y / 2 - pad;
    const w = dim.x + pad * 2;
    const h = dim.y + pad * 2;

    ctx.save();
    ctx.fillStyle = this.backgroundColor;
    ctx.beginPath();

    if (ctx.roundRect) {
        ctx.roundRect(x, y, w, h, rad);
    } else {
        ctx.rect(x, y, w, h);
    }

    ctx.fill();
    ctx.restore();
};

const renderIcon = (ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: any, fabricObject: any) => {
    const size = 24;
    ctx.save();
    ctx.translate(left, top);
    ctx.rotate(util.degreesToRadians(fabricObject.angle));
    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, 2 * Math.PI);
    ctx.fillStyle = '#ff4d4f';
    ctx.fill();
    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.lineCap = 'round';
    ctx.moveTo(-size / 4, -size / 4);
    ctx.lineTo(size / 4, size / 4);
    ctx.moveTo(size / 4, -size / 4);
    ctx.lineTo(-size / 4, size / 4);
    ctx.stroke();
    ctx.restore();
};

const renderRotateIcon = (ctx: CanvasRenderingContext2D, left: number, top: number, styleOverride: any, fabricObject: any) => {
    const size = 24;
    ctx.save();
    ctx.translate(left, top);
    ctx.rotate(util.degreesToRadians(fabricObject.angle));

    // Background (White Circle with Shadow)
    ctx.shadowColor = "rgba(0,0,0,0.3)";
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 3;

    ctx.beginPath();
    ctx.arc(0, 0, size / 2, 0, 2 * Math.PI);
    ctx.fillStyle = '#ef4444'; // Red background for rotate handle
    ctx.fill();

    // Remove shadow for icon
    ctx.shadowColor = "transparent";

    // Icon (White Refresh Arrow)
    ctx.beginPath();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Circular arrow path
    ctx.arc(0, 0, 5, Math.PI / 2, Math.PI * 2);
    ctx.stroke();

    // Arrow head
    ctx.beginPath();
    ctx.fillStyle = '#ffffff';
    ctx.moveTo(5, -5);
    ctx.lineTo(2, -5);
    ctx.lineTo(5, -8);
    ctx.lineTo(8, -5);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
};

if (FabricObject && FabricObject.prototype && FabricObject.prototype.controls) {
    // Customize Default Controls appearance
    FabricObject.prototype.transparentCorners = false;
    FabricObject.prototype.cornerColor = '#ffffff';
    FabricObject.prototype.cornerStrokeColor = '#ef4444'; // red-500
    FabricObject.prototype.borderColor = '#ef4444'; // red-500 (Big Red)
    FabricObject.prototype.cornerSize = 14; // Slightly larger
    FabricObject.prototype.cornerStyle = 'circle';
    FabricObject.prototype.borderScaleFactor = 3; // Thicker border
    FabricObject.prototype.borderDashArray = undefined; // Solid line
    // Add Shadow to selection border (simulated via global props if supported, or rely on thick red)
    // FabricJS doesn't support direct shadow on selection border easily without custom render.
    // But we can make it very prominent with red and thickness.


    // @ts-ignore
    delete FabricObject.prototype.controls.deleteControl;

    // Customize Rotation Control (mtr) -> Move to Bottom Right
    if (FabricObject.prototype.controls.mtr) {
        FabricObject.prototype.controls.mtr.x = 0.5;
        FabricObject.prototype.controls.mtr.y = 0.5;
        FabricObject.prototype.controls.mtr.offsetY = 24; // Offset outside more
        FabricObject.prototype.controls.mtr.offsetX = 24;
        FabricObject.prototype.controls.mtr.render = renderRotateIcon;
        FabricObject.prototype.controls.mtr.cursorStyle = 'pointer';
        FabricObject.prototype.controls.mtr.withConnection = false; // No line connecting to center
    }
}

// --- Component Definition ---

interface CanvasEditorProps {
    uploadedImage: string | null;
    activeTool?: string | null;
    activePanel?: string | null;
    onToolUsed?: () => void;
    onTemplateLoadingChange?: (isLoading: boolean) => void;
    currentProduct?: any;
    permissions?: {
        text: boolean;
        stickers: boolean;
        backgrounds: boolean;
        barcode: boolean;
        designs: boolean;
        aiCartoon: boolean;
        aiRemoveBg: boolean;
    };
    mobileActions?: {
        onUpload: () => void;
        onAddText: () => void;
        onOpenStickers: () => void;
        onOpenBackgrounds: () => void;
        onOpenBarcode: () => void;
        onOpenFrames: () => void;
        onOpenDesigns?: () => void;
        onOpenAI?: () => void; // Deprecated in favor of separate actions
        onAiCartoon?: () => void;
        onAiRemoveBg?: () => void;
        onOpenProduct: () => void;
    };
    onImageLayerChange?: (hasImage: boolean) => void;
    previewConfig?: {
        width: number;
        height: number;
        borderRadius: number;
        baseImage: string | null;
        maskImage: string | null;
        offset?: { x: number; y: number };
    };
    onCropModeChange?: (isCropping: boolean) => void;
    onSelectionChange?: (object: FabricObject | null) => void;
}

export interface CanvasEditorRef {
    generatePreview: () => string;
    generatePrintFile: () => string;
    addSticker: (url: string) => void;
    addBackground: (url: string) => void;
    setBackgroundColor: (color: string) => void;
    setCanvasBgColor: (color: string | null) => void;
    setCanvasBgImage: (url: string | null) => Promise<void>;
    removeBackground: () => void;
    addBarcode: (text: string) => void;
    addLayer: (layer: { image: string; left: number; top: number; width: number; height: number; name?: string; scaleX?: number; scaleY?: number }) => void;
    addDesignLayers: (layers: any[]) => Promise<void>;
    addFrame: (frame: FrameTemplate) => void;
    applyCrop: (shape: 'circle' | 'heart' | 'rounded' | 'star' | 'none', value?: number) => void;
    updateFrameParams: (value: number) => void;
    clearLayers: () => void;
    removeUserObjects: (predicate?: (obj: any) => boolean) => void;
    upsertUserBg: (config: { type: 'color' | 'image', value: string }) => Promise<void>;
    toggleCropMode: () => void;
    applyAiStyle: (styleId: "toon_mochi" | "toon_ink" | "toon_anime") => Promise<void>;
    removeBackgroundFromSelection: () => Promise<void>;
    setBackgroundImage: (url: string) => Promise<void> | void;
    insertImageFromSrc: (src: string) => Promise<void>;
    getCanvasJSON: () => object;
    restoreFromJSON: (json: object) => Promise<void>;
}

const CanvasEditor = forwardRef((props: CanvasEditorProps, ref: React.ForwardedRef<CanvasEditorRef>) => {
    const {
        uploadedImage,
        activeTool,
        activePanel,
        onToolUsed,
        onTemplateLoadingChange,
        mobileActions,
        previewConfig,
        currentProduct,
        onCropModeChange,
        onSelectionChange,
        permissions,
        onImageLayerChange
    } = props;

    const [searchParams] = useSearchParams();
    const [isTemplateLoading, setIsTemplateLoading] = useState(false);
    const [hasTemplateLoaded, setHasTemplateLoaded] = useState(false); // Track if template has loaded at least once
    const templateLoadSeqRef = useRef(0);
    const enterSeqRef = useRef(0);
    const enterInFlightRef = useRef(false);
    const suppressDraftSaveRef = useRef(false);
    const templateFinalSrcRef = useRef<{ baseFinal: string; maskFinal: string } | null>(null);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isRestoringDraft = useRef(false);
    const initOnceRef = useRef(false);
    const templateApplyInFlightRef = useRef(false); // [TPL] 防重入鎖
    const appliedTemplateKeyRef = useRef<string | null>(null); // [TPL] 同產品跳過標記
    const isHistoryProcessing = useRef(false);
    const isRestoring = useRef(false);
    const activeBaseImageRef = useRef<FabricImage | null>(null);
    const activeMaskImageRef = useRef<FabricImage | null>(null);
    const latestBaseUrlRef = useRef<string>("");
    const latestMaskUrlRef = useRef<string>("");
    const toggleCropModeRef = useRef<() => void>(() => { });
    const toolbarRef = useRef<HTMLDivElement>(null);

    const DEFAULT_PERMS = {
        text: true,
        stickers: true,
        backgrounds: true,
        barcode: true,
        designs: true,
        aiCartoon: true,
        aiRemoveBg: true
    };
    const p = { ...DEFAULT_PERMS, ...(permissions || {}) };

    const containerRef = useRef<HTMLDivElement>(null);
    const canvasEl = useRef<HTMLCanvasElement>(null);
    const fabricCanvas = useRef<Canvas | null>(null);
    const maskLayerRef = useRef<FabricObject | null>(null);
    const baseLayerRef = useRef<FabricObject | null>(null);
    const onImageLayerChangeRef = useRef<((hasImage: boolean) => void) | undefined>(onImageLayerChange);
    useEffect(() => { onImageLayerChangeRef.current = onImageLayerChange; }, [onImageLayerChange]);

    // Selected Object State
    const [selectedObject, setSelectedObject] = useState<FabricObject | null>(null);
    const [textValue, setTextValue] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isCropping, setIsCropping] = useState(false);
    const [showCropMenu, setShowCropMenu] = useState(false); // Mobile crop sub-menu state
    const [showMobileTextInput, setShowMobileTextInput] = useState(false); // Mobile text input modal
    const [showMobilePropertyBar, setShowMobilePropertyBar] = useState(true); // Mobile property bar visibility
    const [showBrightnessSlider, setShowBrightnessSlider] = useState(false); // Show brightness slider popover
    const [brightness, setBrightness] = useState(0); // Brightness value: -1 (dark) to 1 (bright)
    const [showClearConfirm, setShowClearConfirm] = useState(false); // Clear confirm dialog

    useEffect(() => {
        onTemplateLoadingChange?.(isTemplateLoading);
    }, [isTemplateLoading, onTemplateLoadingChange]);



    // When opening mobile text input, ensure textValue is fresh
    useEffect(() => {
        if (showMobileTextInput && selectedObject && (selectedObject.type === 'i-text' || selectedObject.type === 'text')) {
            // @ts-ignore
            setTextValue(selectedObject.text || "");
        }
    }, [showMobileTextInput, selectedObject]);

    // Notify parent about selection changes
    useEffect(() => {
        if (onSelectionChange) {
            onSelectionChange(selectedObject);
        }
    }, [selectedObject, onSelectionChange]);

    // Sync brightness state when selected image changes
    useEffect(() => {
        setShowBrightnessSlider(false); // Close the slider popover
        if (selectedObject && selectedObject.type === 'image') {
            const img = selectedObject as FabricImage;
            const existingFilter: any = (img.filters || []).find((f: any) => f.type === 'Brightness');
            setBrightness(existingFilter?.brightness ?? 0);
        } else {
            setBrightness(0);
        }
    }, [selectedObject]);

    // History & Toolbar State
    const [history, setHistory] = useState<string[]>([]);
    const [historyStep, setHistoryStep] = useState<number>(-1);

    // ✅ 真相放 ref，避免 Fabric event listener 捕捉到舊 state
    const historyRef = useRef<string[]>([]);
    const historyStepRef = useRef<number>(-1);

    const syncHistoryState = (nextHistory: string[], nextStep: number) => {
        historyRef.current = nextHistory;
        historyStepRef.current = nextStep;
        setHistory(nextHistory);
        setHistoryStep(nextStep);
    };

    // ✅ 產生/保證物件 id
    const genId = (prefix = 'obj') =>
        `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const ensureObjectId = (obj: any, prefix = 'obj') => {
        if (!obj) return;
        if (!obj.id || typeof obj.id !== 'string') obj.id = genId(prefix);
    };

    // ✅ 批次操作：關閉 object:added/modified/removed listener 的存檔（避免重複）
    // 批次結束後只存一次
    const historyLockDepthRef = useRef(0);
    const lockHistory = () => {
        historyLockDepthRef.current += 1;
        isHistoryProcessing.current = true;
    };
    const unlockHistory = () => {
        historyLockDepthRef.current = Math.max(0, historyLockDepthRef.current - 1);
        if (historyLockDepthRef.current === 0) {
            isHistoryProcessing.current = false;
        }
    };

    const withHistoryTransaction = async (fn: () => Promise<void> | void) => {
        lockHistory();
        try {
            await fn();
        } finally {
            unlockHistory();
        }
        // transaction 結束後只存一次
        saveHistory();
        updateLayers();
    };

    // --- Auto Save / Restore Logic ---
    const getDraftKey = () => {
        const productId = searchParams.get('productId') || currentProduct?.id;
        if (!productId) return null;

        const deviceHandle = searchParams.get('device_handle') || 'na';
        const productColor = searchParams.get('product_color') || 'na';
        const productHandle = searchParams.get('product_handle') || 'na';
        const productType = searchParams.get('product_type') || 'na';

        const rawBase = String(previewConfig?.baseImage ?? '').trim();
        const rawMask = String(previewConfig?.maskImage ?? '').trim();
        if (!rawBase || !rawMask) return null;

        const templateRev = currentProduct?.updated_at || btoa(rawBase + '|' + rawMask).substr(0, 10);
        if (!templateRev) return null;

        return `draft:v3:${productId}:${deviceHandle}:${productColor}:${productHandle}:${productType}:${templateRev}`;
    };

    const saveDraft = async (isForced = false) => {
        const canvas = fabricCanvas.current;
        if (!canvas || isRestoringDraft.current) return;
        if (suppressDraftSaveRef.current) return;
        if (templateApplyInFlightRef.current || isTemplateLoading) return;
        const tplCounts = getTemplateCounts(canvas);
        if (tplCounts.base !== 1 || tplCounts.mask !== 1) return;

        const key = getDraftKey();
        if (!key) return;

        // Define properties to include in JSON
        const JSON_PROPERTIES = [
            'id', 'selectable', 'evented', 'locked', 'excludeFromExport',
            'isUserBackground', 'isBaseLayer', 'isMaskLayer', 'isFrameLayer', 'frameId', 'perPixelTargetFind',
            'lockMovementX', 'lockMovementY', 'lockRotation', 'lockScalingX', 'lockScalingY',
            'lockUniScaling', 'lockSkewingX', 'lockSkewingY', 'hasControls', 'hasBorders',
            'hoverCursor', 'moveCursor', 'clipPath', 'visible', 'bgCornerRadius', 'padding', 'originX', 'originY',
            'name', 'scaleX', 'scaleY', 'left', 'top', 'width', 'height', 'angle', 'fill', 'stroke', 'strokeWidth',
            'data', 'hasClipPath', 'isCropLocked', 'frameMeta', '__baseScale'
        ];

        // [DRAFT] T1: Draft serialization filtering
        const json = (canvas as any).toJSON(JSON_PROPERTIES);

        if (json.objects) {
            json.objects = json.objects.filter((obj: any) => {
                const sid = String(obj.data?.systemId || obj.id || '').trim();
                const kind = obj.data?.kind;
                const role = obj.data?.role;
                const isSystem = obj.excludeFromExport === true ||
                    obj.data?.isSystem === true ||
                    sid.startsWith('system_') ||
                    ['system_base_image', 'system_mask_image', 'system_template_group'].includes(sid) ||
                    ['product_base', 'product_overlay', 'guide'].includes(kind) ||
                    role === TEMPLATE_ROLE ||
                    role === 'product_base' ||
                    role === 'product_overlay' ||
                    obj.isBaseLayer === true ||
                    obj.isMaskLayer === true;

                return !isSystem;
            });
        }

        const draftStr = JSON.stringify(json);
        if (draftStr.length > 8 * 1024 * 1024) {
            console.warn("Draft too large, skipping auto-save");
            // Only show alert if forced (e.g. unload) or maybe just once? 
            // User said: "Show prompt... and stop writing".
            // To avoid spamming, we might use a toast or just log if it happens often.
            // But requirements say "show prompt".
            // We'll use a simple alert but throttle it? Or just alert.
            if (isForced) alert("草稿太大，請先減少圖片或重新上傳較小檔案");
            return;
        }

        const draftData: Draft = {
            version: 1,
            updatedAt: new Date().toISOString(),
            context: {
                productId: searchParams.get('productId') || currentProduct?.id || '',
                deviceHandle: searchParams.get('device_handle') || undefined,
                productColor: searchParams.get('product_color') || undefined,
                productHandle: searchParams.get('product_handle') || undefined,
                productType: searchParams.get('product_type') || undefined
            },
            canvasJson: json,
            extraState: {
                zoom: canvas.getZoom(),
                pan: { x: canvas.viewportTransform?.[4] || 0, y: canvas.viewportTransform?.[5] || 0 }
            }
        };

        try {
            await setDraft(key, draftData);
            // console.log("Draft saved", key);
        } catch (e) {
            console.error("Failed to save draft", e);
        }
    };

    const triggerAutoSave = () => {
        if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = setTimeout(() => saveDraft(), 800);
    };

    // Event Listeners for Auto Save
    useEffect(() => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        const events = ['object:added', 'object:modified', 'object:removed', 'path:created', 'text:changed'];
        const handler = () => triggerAutoSave();

        events.forEach((evt: any) => canvas.on(evt, handler));

        // Visibility Change
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                saveDraft(true);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Before Unload
        const handleBeforeUnload = () => {
            saveDraft(true);
        };
        window.addEventListener('beforeunload', handleBeforeUnload);

        return () => {
            events.forEach((evt: any) => canvas.off(evt, handler));
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [fabricCanvas.current, searchParams, currentProduct]); // Re-bind if context changes

    const [showToolbar, setShowToolbar] = useState(false);
    const [showDesktopFramesMenu, setShowDesktopFramesMenu] = useState(false); // Desktop frames menu state
    const [activeMobileSubMenu, setActiveMobileSubMenu] = useState<'edit' | 'font' | 'color' | 'align' | 'image'>('edit'); // Mobile Text Menu State

    // Layer Management State
    const [layers, setLayers] = useState<LayerItemData[]>([]);
    const [isMobileLayersOpen, setIsMobileLayersOpen] = useState(false); // Mobile state
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    // Sync text value, cropping state, and mobile menu from selected object
    useEffect(() => {
        if (selectedObject) {
            if (selectedObject.type === 'i-text' || selectedObject.type === 'text') {
                // @ts-ignore
                setTextValue(selectedObject.text || "");
            }

            // Auto-open image property bar for morphable shapes
            if (selectedObject.type === 'image' && ((selectedObject as any).clipPath?.data?.frameShape === 'heart' || (selectedObject as any).clipPath?.data?.frameShape === 'star')) {
                setActiveMobileSubMenu('image');
                setShowMobilePropertyBar(true);
            }

            // Sync isCropping state
            if ((selectedObject as any).frameId) {
                // Frame object: isCropping if NOT locked
                setIsCropping((selectedObject as any).isCropLocked === false);
            } else if (selectedObject.clipPath) {
                // Regular object with clipPath: isCropping if absolutePositioned
                setIsCropping(selectedObject.clipPath.absolutePositioned === true);
            } else {
                setIsCropping(false);
            }
        } else {
            setIsCropping(false);
        }
    }, [selectedObject, history]);

    // --- Diagnostic Helpers ---
    const assignOid = (obj: any) => {
        if (!obj.data) obj.data = {};
        if (!obj.data.__oid) {
            obj.data.__oid = `oid_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        }
        return obj.data.__oid;
    };

    const collectAllObjects = (canvas: Canvas): FabricObject[] => {
        const all: FabricObject[] = [];
        const traverse = (objs: FabricObject[]) => {
            objs.forEach(o => {
                all.push(o);
                if ((o as any)._objects) traverse((o as any)._objects);
                if ((o as any).objects) traverse((o as any).objects);
            });
        };
        traverse(canvas.getObjects());
        return all;
    };

    const removeByPredicate = (canvas: Canvas, predicate: (obj: any) => boolean) => {
        const objects = canvas.getObjects();
        [...objects].forEach(obj => {
            if (predicate(obj)) {
                canvas.remove(obj);
                if (typeof obj.dispose === 'function') obj.dispose();
            }
        });
    };

    const getTemplateCounts = (canvas: Canvas) => {
        const allObjects = collectAllObjects(canvas);
        const stats = {
            base: 0,
            mask: 0,
            group: 0,
            product_base_kind: 0,
            product_overlay_kind: 0,
            user_bg: 0,
            user_objects: 0,
            nonSystem: 0,
            bgMode: 'none' as 'none' | 'color' | 'image',
            total: allObjects.length
        };
        const bgHasImage = !!(canvas as any).backgroundImage;
        const bgColor = (canvas as any).backgroundColor;
        stats.bgMode = bgHasImage ? 'image' : (bgColor && bgColor !== 'transparent' ? 'color' : 'none');

        allObjects.forEach((obj: any) => {
            const sid = obj.data?.systemId || obj.id;
            const kind = obj.data?.kind;

            let isSystem = false;
            if (sid === 'system_base_image') { stats.base++; isSystem = true; }
            if (sid === 'system_mask_image') { stats.mask++; isSystem = true; }
            if (sid === 'system_template_group') { stats.group++; isSystem = true; }

            if (kind === 'product_base') stats.product_base_kind++;
            if (kind === 'product_overlay') stats.product_overlay_kind++;
            if (kind === 'user_bg') stats.user_bg++;

            const isTemplateKind = kind === 'product_base' || kind === 'product_overlay';
            if (!isSystem && sid !== 'system_template_group' && kind !== 'user_bg') {
                stats.user_objects++;
            }
            if (!isSystem && sid !== 'system_template_group' && kind !== 'user_bg' && !isTemplateKind) {
                stats.nonSystem++;
            }
        });
        return stats;
    };

    const hasTemplate = (canvas: Canvas) => {
        const stats = getTemplateCounts(canvas);
        return stats.base >= 1 && stats.mask >= 1;
    };

    const dumpCanvas = (canvas: Canvas | null, label: string = 'manual') => {
        if (!canvas) return { stats: {}, dump: [] };

        const allObjects = collectAllObjects(canvas);
        const stats = getTemplateCounts(canvas);

        const dump = allObjects.map((obj: any, idx) => {
            const oid = assignOid(obj);
            return {
                idx,
                oid,
                type: obj.type,
                id: obj.id || null,
                kind: obj.data?.kind || null,
                systemId: obj.data?.systemId || null,
                role: obj.data?.role || obj.data?.layerRole || null,
                fill: obj.fill ?? null,
                selectable: obj.selectable,
                evented: obj.evented,
                visible: obj.visible,
                opacity: obj.opacity,
                left: Math.round(obj.left),
                top: Math.round(obj.top),
                scaleX: obj.scaleX?.toFixed(3),
                scaleY: obj.scaleY?.toFixed(3),
                width: Math.round(obj.width),
                height: Math.round(obj.height),
                angle: obj.angle,
                src: (obj.type === 'image' || obj instanceof FabricImage) ? (obj.getSrc?.() || obj._originalElement?.src || null) : null
            };
        });

        console.log(`[DIAG] Canvas Dump (${label}):`, {
            product: {
                id: currentProduct?.id,
                base: previewConfig?.baseImage,
                mask: previewConfig?.maskImage,
                updated_at: currentProduct?.updated_at
            },
            stats,
            dump
        });
        return { stats, dump };
    };

    const removeTemplateObjects = (canvas: Canvas) => {
        console.groupCollapsed('[TPL] removeTemplateObjects');

        const allObjects = collectAllObjects(canvas);
        const targets = allObjects.filter((o: any) => {
            const sid = o.data?.systemId || o.id;
            const kind = o.data?.kind;
            return [
                'system_base_image',
                'system_mask_image',
                'system_template_group'
            ].includes(sid) || ['product_base', 'product_overlay'].includes(kind);
        });

        targets.forEach(obj => {
            // If it's a top-level object, remove from canvas
            if (canvas.getObjects().includes(obj)) {
                canvas.remove(obj);
            }
            // Recursively cleanup children if any
            if ((obj as any)._objects || (obj as any).objects) {
                const children = (obj as any)._objects || (obj as any).objects;
                [...children].forEach(child => {
                    if (typeof child.dispose === 'function') child.dispose();
                });
            }
            if (typeof obj.dispose === 'function') obj.dispose();
        });

        dumpCanvas(canvas, 'tpl_removed_baseline');
        console.groupEnd();
    };

    // Helper: Robust find system layers (only via systemId)
    const isSystemObject = (obj: any) => {
        if (!obj) return false;
        const systemId = obj.data?.systemId;

        return [
            'system_base_image',
            'system_mask_image',
            'system_template_group'
        ].includes(systemId);
    };

    const isSystemRuntimeObject = (obj: any) => {
        if (!obj) return false;
        if (obj.excludeFromExport === true) return true;
        if (obj.data?.isSystem === true) return true;
        const sid = String(obj.data?.systemId || obj.id || '').trim();
        if (sid.startsWith('system_')) return true;
        const kind = obj.data?.kind;
        const role = obj.data?.role;
        if (['product_base', 'product_overlay', 'guide'].includes(kind)) return true;
        if (role === TEMPLATE_ROLE || role === 'product_base' || role === 'product_overlay') return true;
        if (obj.isBaseLayer || obj.isMaskLayer) return true;
        return false;
    };

    const removeAllUserObjects = (canvas: Canvas) => {
        removeByPredicate(canvas, (o: any) => !isSystemRuntimeObject(o));
    };

    // --- Background Helpers (No-Layer Approach) ---
    const getPrintRectPx = (canvas: Canvas, product: any) => {
        const base = canvas.getObjects().find(o =>
            (o as any).data?.systemId === 'system_base_image' || (o as any).id === 'system_base_image'
        ) as FabricImage;

        if (!base) return null;

        // [BG] Get base scaled size correctly
        const baseScaledW = base.getScaledWidth();
        const baseScaledH = base.getScaledHeight();
        const baseRect = base.getBoundingRect();

        // Physical dimensions from product specs (cm)
        const specsWcm = product?.specs?.width || 7.69;
        const specsHcm = product?.specs?.height || 16.20;

        // Calculate pixels per centimeter based on current scale
        const pxPerCmX = baseScaledW / specsWcm;
        const pxPerCmY = baseScaledH / specsHcm;

        // Print area configuration (cm)
        const sizeCm = product?.mask_config?.size || { w: specsWcm, h: specsHcm };
        const offsetCm = product?.mask_config?.offset || { x: 0, y: 0 };

        return {
            left: baseRect.left + (offsetCm.x * pxPerCmX),
            top: baseRect.top + (offsetCm.y * pxPerCmY),
            width: sizeCm.w * pxPerCmX,
            height: sizeCm.h * pxPerCmY
        };
    };

    const setCanvasBgColor = (color: string | null) => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        console.groupCollapsed('[BG] apply color (as layer)', { color });

        // Remove existing user background layer
        const existingBg = canvas.getObjects().find((o: any) => o.data?.kind === 'user_bg');
        if (existingBg) {
            console.log('[BG] Removing existing bg layer (color mode)');
            canvas.remove(existingBg);
        }

        // Clear canvas background
        canvas.backgroundColor = 'transparent';
        canvas.backgroundImage = undefined;

        if (!color) {
            canvas.requestRenderAll();
            dumpCanvas(canvas, 'bg_apply_color');
            console.groupEnd();
            return;
        }

        // Find base layer to get actual visual dimensions
        const baseLayer = canvas.getObjects().find((o: any) =>
            o.data?.systemId === 'system_base_image' || o.id === 'system_base_image'
        ) as FabricImage;

        // If no base layer exists yet, defer background creation
        // This prevents creating background with wrong dimensions during initial load
        if (!baseLayer) {
            console.warn('[BG] No base layer found, skipping background creation. Call setCanvasBgColor again after product loads.');
            canvas.requestRenderAll();
            dumpCanvas(canvas, 'bg_apply_color_deferred');
            console.groupEnd();
            return;
        }

        // Use base layer's bounding box for full visual coverage
        const baseBounds = baseLayer.getBoundingRect();
        const targetRect = {
            left: baseBounds.left,
            top: baseBounds.top,
            width: baseBounds.width,
            height: baseBounds.height
        };
        console.log('[BG] Using base layer dimensions for color:', targetRect);

        // Create color rectangle as layer
        const rect = new Rect({
            left: targetRect.left + targetRect.width / 2,
            top: targetRect.top + targetRect.height / 2,
            width: targetRect.width,
            height: targetRect.height,
            fill: color,
            originX: 'center',
            originY: 'center',
            selectable: false,
            evented: false,
            excludeFromExport: false
        });

        // Mark as user background
        (rect as any).data = {
            kind: 'user_bg',
            systemId: 'user_background_layer'
        };
        (rect as any).id = 'user_background_layer';

        canvas.add(rect);

        // Position between base and mask
        const maskLayer = canvas.getObjects().find((o: any) =>
            o.data?.systemId === 'system_mask_image' || o.id === 'system_mask_image'
        );

        if (baseLayer) {
            const baseIndex = canvas.getObjects().indexOf(baseLayer);
            canvas.moveObjectTo(rect, baseIndex + 1);
            console.log('[BG] Color positioned after base layer');
        } else {
            canvas.sendObjectToBack(rect);
            console.log('[BG] No base layer, sent to back');
        }

        // Ensure mask is on top
        if (maskLayer) {
            canvas.bringObjectToFront(maskLayer);
        }

        canvas.requestRenderAll();
        console.log('[BG] Color background layer added successfully');

        dumpCanvas(canvas, 'bg_apply_color_layer');
        console.groupEnd();
    };


    const setCanvasBgImage = async (url: string | null) => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        console.groupCollapsed('[BG] apply image (as layer)', { url, hasCurrentProduct: !!currentProduct });

        // Remove existing user background layer
        const existingBg = canvas.getObjects().find((o: any) => o.data?.kind === 'user_bg');
        if (existingBg) {
            console.log('[BG] Removing existing bg layer');
            canvas.remove(existingBg);
        }

        // Clear canvas background image
        canvas.backgroundImage = undefined;

        if (!url) {
            canvas.requestRenderAll();
            console.groupEnd();
            return;
        }

        const printRect = getPrintRectPx(canvas, currentProduct);

        // Find base layer to get actual visual dimensions
        const baseLayer = canvas.getObjects().find((o: any) =>
            o.data?.systemId === 'system_base_image' || o.id === 'system_base_image'
        ) as FabricImage;

        let targetRect;
        if (baseLayer) {
            // Use base layer's bounding box for full visual coverage
            const baseBounds = baseLayer.getBoundingRect();
            targetRect = {
                left: baseBounds.left,
                top: baseBounds.top,
                width: baseBounds.width,
                height: baseBounds.height
            };
            console.log('[BG-DEBUG] Using base layer dimensions:', targetRect);
        } else {
            // Fallback to canvas dimensions
            const canvasWidth = canvas.getWidth();
            const canvasHeight = canvas.getHeight();
            targetRect = {
                left: 0,
                top: 0,
                width: canvasWidth,
                height: canvasHeight
            };
            console.warn('[BG-DEBUG] No base layer found, using canvas dimensions:', targetRect);
        }

        try {
            const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
            const imgW = img.width || 1;
            const imgH = img.height || 1;

            console.log('[BG-DEBUG] Original image size:', { imgW, imgH });

            // Cover Logic - fill entire target area
            const scale = Math.max(targetRect.width / imgW, targetRect.height / imgH);

            console.log('[BG-DEBUG] Calculated scale:', scale);

            img.set({
                scaleX: scale,
                scaleY: scale,
                left: targetRect.left + targetRect.width / 2,
                top: targetRect.top + targetRect.height / 2,
                originX: 'center',
                originY: 'center',
                selectable: false,
                evented: false,
                excludeFromExport: false
            });

            console.log('[BG-DEBUG] Image positioned at:', {
                left: img.left,
                top: img.top,
                scaleX: img.scaleX,
                scaleY: img.scaleY,
                finalWidth: imgW * scale,
                finalHeight: imgH * scale
            });

            // Mark as user background
            (img as any).data = {
                kind: 'user_bg',
                systemId: 'user_background_layer'
            };
            (img as any).id = 'user_background_layer';

            // No clipping - full coverage background
            // User requested full coverage, so we don't clip to print area

            canvas.add(img);

            // Position between base and mask
            const baseLayer = canvas.getObjects().find((o: any) =>
                o.data?.systemId === 'system_base_image' || o.id === 'system_base_image'
            );
            const maskLayer = canvas.getObjects().find((o: any) =>
                o.data?.systemId === 'system_mask_image' || o.id === 'system_mask_image'
            );

            if (baseLayer) {
                const baseIndex = canvas.getObjects().indexOf(baseLayer);
                canvas.moveObjectTo(img, baseIndex + 1);
                console.log('[BG] Positioned after base layer');
            } else {
                canvas.sendObjectToBack(img);
                console.log('[BG] No base layer, sent to back');
            }

            // Ensure mask is on top
            if (maskLayer) {
                canvas.bringObjectToFront(maskLayer);
            }

            canvas.requestRenderAll();
            console.log('[BG] Background layer added successfully');
        } catch (e) {
            console.error("[BG] Failed to set background image:", e);
        } finally {
            dumpCanvas(canvas, 'bg_apply_image_layer');
            console.groupEnd();
        }
    };

    const upsertUserBg = async (canvas: Canvas, config: { type: 'color' | 'image', value: string }) => {
        // Legacy wrapper for Home.tsx compatibility during migration
        if (config.type === 'color') {
            setCanvasBgColor(config.value);
        } else {
            await setCanvasBgImage(config.value);
        }
        // Step 2 Cleanup: Ensure no user_bg object exists
        removeByPredicate(canvas, o => o?.data?.kind === 'user_bg');
    };

    // Legacy helper for backward compatibility within this file
    const isSystemLayer = (obj: any, type: 'base' | 'mask') => {
        if (type === 'base') return obj.id === 'system_base_image' || obj.isBaseLayer;
        if (type === 'mask') return obj.id === 'system_mask_image' || obj.isMaskLayer;
        return isSystemObject(obj);
    };

    const [showGalleryModal, setShowGalleryModal] = useState(false); // Gallery Modal State
    const [showFrameSelectionModal, setShowFrameSelectionModal] = useState(false); // Custom Frame Modal
    const [customFrames, setCustomFrames] = useState<FrameTemplate[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('全部');
    const [frameCategories, setFrameCategories] = useState<string[]>([]);
    const [uploadedHistory, setUploadedHistory] = useState<string[]>([]); // Track history

    useEffect(() => {
        if (showFrameSelectionModal) {
            Promise.all([
                get<FrameTemplate[]>('custom_frames'),
                get<string[]>('frame_categories')
            ]).then(([f, c]) => {
                if (Array.isArray(f)) {
                    setCustomFrames(f);
                } else {
                    setCustomFrames([]);
                }
                if (Array.isArray(c)) {
                    setFrameCategories(c);
                } else {
                    setFrameCategories([]);
                }
            }).catch(() => {
                setCustomFrames([]);
                setFrameCategories([]);
            });
        }
    }, [showFrameSelectionModal]);

    const filteredFrames = customFrames.filter(f =>
        selectedCategory === '全部' || f.category === selectedCategory
    );
    // Get parameters from Store (Default)
    const {
        canvasWidth: STORE_WIDTH,
        canvasHeight: STORE_HEIGHT,
        borderRadius: STORE_RADIUS,
        baseImage: STORE_BASE,
        maskImage: STORE_MASK
    } = useProductStore();

    // Use Preview Config if provided (for Seller Editor), otherwise use Store (for Customer View)
    const REAL_WIDTH = previewConfig ? previewConfig.width : STORE_WIDTH;
    const REAL_HEIGHT = previewConfig ? previewConfig.height : STORE_HEIGHT;
    const CASE_RADIUS = previewConfig ? previewConfig.borderRadius : STORE_RADIUS;
    const baseImage = previewConfig ? previewConfig.baseImage : STORE_BASE;
    const maskImage = previewConfig ? previewConfig.maskImage : STORE_MASK;
    const offset = previewConfig?.offset || { x: 0, y: 0 };

    // --- Layer Management System ---
    const updateLayers = () => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        const objects = canvas.getObjects();
        const newLayers: LayerItemData[] = [];

        objects.forEach((obj) => {
            const id = (obj as any).id;
            // Strict System Layer Filtering
            const d = (obj as any).data;
            if (
                d?.system === true ||
                d?.role === TEMPLATE_ROLE ||
                id === 'system_base_image' ||
                id === 'system_mask_image' ||
                (obj as any).isBaseLayer ||
                (obj as any).isMaskLayer ||
                (obj as any).isUserBackground
            ) {
                return;
            }
            if (!id) {
                (obj as any).id = `layer-${Math.random().toString(36).substr(2, 9)}`;
            }
            let preview = undefined;
            if (obj.type === 'image' || obj instanceof FabricImage) {
                // Fix: Use getSrc() if available to avoid tainted canvas issues and improve performance
                // Only use toDataURL as fallback or for modified/cropped images
                const src = (obj as FabricImage).getSrc();
                // If it's a simple image without complex filters/crops, use the source URL
                // But if it has crop, we might need the actual preview.
                // However, reliable display is better than perfect crop preview in small icon.
                if (src && src.startsWith('http')) {
                    preview = src;
                } else {
                    try {
                        const dataUrl = obj.toDataURL({ format: 'png', multiplier: 0.1 });
                        // Check for empty/invalid data URL (e.g. tainted canvas result)
                        if (dataUrl && dataUrl !== 'data:,' && dataUrl.length > 10) {
                            preview = dataUrl;
                        } else {
                            preview = src; // Fallback to source
                        }
                    } catch (e) {
                        // Fallback to source if dataURL fails (e.g. CORS)
                        preview = src;
                    }
                }
            }
            let name = 'Layer';
            if (obj.type === 'i-text' || obj.type === 'text') {
                name = (obj as any).text?.substring(0, 15) || 'Text Layer';
            } else if (obj.type === 'image') {
                name = 'Image Layer';
            }

            newLayers.push({
                id: (obj as any).id,
                type: obj.type || 'unknown',
                preview,
                visible: obj.visible !== false,
                locked: !(obj.selectable),
                name,
                fabricObject: obj
            });
        });
        setLayers(newLayers.reverse());

        // Notify parent if canvas has any user image layers
        if (onImageLayerChangeRef.current) {
            const hasUserImage = newLayers.some(l => l.type === 'image');
            onImageLayerChangeRef.current(hasUserImage);
        }
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (active.id !== over?.id) {
            setLayers((items) => {
                const oldIndex = items.findIndex((item) => item.id === active.id);
                const newIndex = items.findIndex((item) => item.id === over?.id);
                const newItems = arrayMove(items, oldIndex, newIndex);

                const canvas = fabricCanvas.current;
                if (canvas) {
                    const allObjects = canvas.getObjects();
                    const baseLayers = allObjects.filter(o => (o as any).isBaseLayer || (o as any).isUserBackground);
                    const maskLayers = allObjects.filter(o => (o as any).isMaskLayer);

                    const sortedUserObjects = [...newItems].reverse().map(item => {
                        return allObjects.find(o => (o as any).id === item.id);
                    }).filter(o => o !== undefined) as FabricObject[];

                    let currentIndex = baseLayers.length;
                    sortedUserObjects.forEach(obj => {
                        canvas.moveObjectTo(obj, currentIndex);
                        currentIndex++;
                    });
                    maskLayers.forEach(mask => {
                        canvas.bringObjectToFront(mask);
                    });

                    canvas.requestRenderAll();
                    saveHistory();
                }
                return newItems;
            });
        }
    };

    const toggleLayerVisibility = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const canvas = fabricCanvas.current;
        if (!canvas) return;
        const obj = canvas.getObjects().find(o => (o as any).id === id);
        if (obj) {
            obj.visible = !obj.visible;
            if (!obj.visible) {
                canvas.discardActiveObject();
            }
            canvas.requestRenderAll();
            saveHistory();
            updateLayers();
        }
    };

    const toggleLayerLock = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const canvas = fabricCanvas.current;
        if (!canvas) return;
        const obj = canvas.getObjects().find(o => (o as any).id === id);
        if (obj) {
            const isLocked = !obj.selectable;
            const newLocked = !isLocked;
            obj.set({
                selectable: !newLocked,
                evented: !newLocked,
                lockMovementX: newLocked,
                lockMovementY: newLocked,
                lockRotation: newLocked,
                lockScalingX: newLocked,
                lockScalingY: newLocked
            });
            if (newLocked) {
                canvas.discardActiveObject();
            }
            canvas.requestRenderAll();
            saveHistory();
            updateLayers();
        }
    };

    const deleteLayer = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const canvas = fabricCanvas.current;
        if (!canvas) return;
        const obj = canvas.getObjects().find(o => (o as any).id === id);
        if (obj) {
            canvas.remove(obj);
            canvas.requestRenderAll();
            saveHistory();
        }
    };

    const selectLayer = (id: string, e?: React.MouseEvent) => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;
        const targetObj = canvas.getObjects().find(o => (o as any).id === id);

        if (targetObj && targetObj.visible && targetObj.selectable) {
            // Identify all objects to be selected (Target + Linked)
            let objectsToSelect = [targetObj];

            // Case 1: Target is Frame -> Add Linked Photos
            if ((targetObj as any).isFrameLayer) {
                const photos = canvas.getObjects().filter(o => (o as any).frameId === (targetObj as any).id);
                objectsToSelect.push(...photos);
            }
            // Case 2: Target is Photo with Frame -> Add Linked Frame
            else if ((targetObj as any).frameId) {
                const frame = canvas.getObjects().find(o => (o as any).id === (targetObj as any).frameId);
                if (frame) objectsToSelect.push(frame);
            }

            // Multi-selection Logic (Ctrl/Cmd)
            if (e && (e.ctrlKey || e.metaKey)) {
                const activeObject = canvas.getActiveObject();
                let currentSelected: FabricObject[] = [];

                if (activeObject) {
                    if (activeObject.type === 'activeSelection') {
                        currentSelected = (activeObject as ActiveSelection).getObjects();
                    } else {
                        currentSelected = [activeObject];
                    }
                }

                // Check if ANY of the objectsToSelect are already selected
                // If target (or its partner) is selected, we DESELECT them.
                // If not, we ADD them.
                const isTargetSelected = currentSelected.some(o => objectsToSelect.some(to => (to as any).id === (o as any).id));

                let newSelection = [...currentSelected];
                if (isTargetSelected) {
                    // Remove objectsToSelect from selection
                    newSelection = newSelection.filter(o => !objectsToSelect.some(to => (to as any).id === (o as any).id));
                } else {
                    // Add objectsToSelect
                    objectsToSelect.forEach(obj => {
                        if (!newSelection.some(existing => (existing as any).id === (obj as any).id)) {
                            newSelection.push(obj);
                        }
                    });
                }

                if (newSelection.length === 0) {
                    canvas.discardActiveObject();
                } else if (newSelection.length === 1) {
                    canvas.setActiveObject(newSelection[0]);
                } else {
                    const sel = new ActiveSelection(newSelection, { canvas });
                    canvas.setActiveObject(sel);
                }
                canvas.requestRenderAll();
            } else {
                // Single Select (Standard) -> Select Group if linked
                if (objectsToSelect.length === 1) {
                    canvas.setActiveObject(objectsToSelect[0]);
                } else {
                    // Create ActiveSelection for linked items
                    const sel = new ActiveSelection(objectsToSelect, { canvas });
                    canvas.setActiveObject(sel);
                }
                canvas.requestRenderAll();
                // Mobile: Close layer drawer only on single select
                setIsMobileLayersOpen(false);
            }
        }
    };

    // --- History System ---
    // --- History System ---
    const saveHistory = () => {
        if (!fabricCanvas.current || isHistoryProcessing.current || isRestoring.current) return;
        const canvas = fabricCanvas.current;

        // 避免 ActiveSelection 污染 JSON 
        const activeObj = canvas.getActiveObject();
        if (activeObj && activeObj.type === 'activeSelection') {
            canvas.discardActiveObject();
            canvas.requestRenderAll();
        }

        // Reverted: Do not force system layers into history. 
        // We will preserve them manually during undo/redo.

        const json = JSON.stringify((canvas as any).toJSON([
            'id', 'selectable', 'evented', 'locked', 'excludeFromExport',
            'isUserBackground', 'isBaseLayer', 'isMaskLayer', 'isFrameLayer', 'frameId', 'perPixelTargetFind',
            'lockMovementX', 'lockMovementY', 'lockRotation', 'lockScalingX', 'lockScalingY',
            'lockUniScaling', 'lockSkewingX', 'lockSkewingY', 'hasControls', 'hasBorders',
            'hoverCursor', 'moveCursor', 'clipPath', 'visible', 'bgCornerRadius', 'padding', 'originX', 'originY',
            'left', 'top', 'scaleX', 'scaleY', 'angle', 'width', 'height', 'fill', 'stroke', 'strokeWidth', 'transformMatrix',
            'data', 'hasClipPath', 'isCropLocked', 'frameMeta', '__baseScale'
        ]));

        const base = historyRef.current;
        const step = historyStepRef.current;

        const next = base.slice(0, step + 1);
        next.push(json);
        if (next.length > 50) next.shift();

        const nextStep = next.length - 1;
        syncHistoryState(next, nextStep);
    };

    const getImgSrc = (obj: any) => {
        return (obj instanceof FabricImage && typeof obj.getSrc === 'function') ? obj.getSrc() : '';
    };

    const restoreLocks = (currentCanvas: Canvas | null = fabricCanvas.current) => {
        const canvas = currentCanvas;
        if (!canvas) return;
        const objects = canvas.getObjects();
        const baseCandidates: FabricObject[] = [];
        const maskCandidates: FabricObject[] = [];

        const isSystemLayerLike = (obj: any, type: 'base' | 'mask') => {
            // 1. Explicit Tags
            if (type === 'base') {
                if (obj.id === 'system_base_image' || obj.isBaseLayer) return true;
            } else {
                if (obj.id === 'system_mask_image' || obj.isMaskLayer) return true;
            }

            // 2. Image Source Match (Strong signal)
            const src = getImgSrc(obj);
            if (src) {
                if (type === 'base' && baseImage && src === baseImage) return true;
                if (type === 'mask' && maskImage && src === maskImage) return true;
            }

            // 3. Fallback Heuristics for untagged objects
            // Only consider if object is locked/non-selectable to avoid false positives on user images
            if (!obj.selectable && !obj.evented) {
                // Base Fallback Detection (Rect with specific gray fill)
                if (type === 'base') {
                    // Fallback Base is a Rect with fill #e5e7eb (gray-200)
                    if (obj.type === 'rect' && (obj.fill === '#e5e7eb' || obj.fill === 'rgba(229, 231, 235, 1)')) {
                        return true;
                    }
                }
                // Mask Fallback Detection (Rect with darker gray fill)
                else {
                    // Fallback Mask is a Rect with fill #4b5563 (gray-600)
                    if (obj.type === 'rect' && (obj.fill === '#4b5563' || obj.fill === 'rgba(75, 85, 99, 1)')) {
                        return true;
                    }
                }

                return false;
            }
            return false;
        };

        objects.forEach((obj) => {
            if (isSystemLayerLike(obj, 'base')) baseCandidates.push(obj);
            if (isSystemLayerLike(obj, 'mask')) maskCandidates.push(obj);
        });

        if (baseCandidates.length === 0 && objects.length > 0) {
            const bottomObj = objects[0];
            // Last resort: Bottom object that isn't user background/object
            if (!(bottomObj as any).isUserBackground && !((bottomObj as any).id as string)?.startsWith('user-')) {
                if ((bottomObj as any).id === undefined || (bottomObj as any).id === 'system_base_image') {
                    baseCandidates.push(bottomObj);
                }
            }
        }

        if (baseCandidates.length > 0) {
            baseCandidates.sort((a, b) => {
                const aTagged = (a as any).isBaseLayer === true;
                const bTagged = (b as any).isBaseLayer === true;
                if (aTagged && !bTagged) return -1;
                if (!aTagged && bTagged) return 1;
                return objects.indexOf(a) - objects.indexOf(b);
            });
            const winner = baseCandidates[0];
            for (let i = 1; i < baseCandidates.length; i++) {
                canvas.remove(baseCandidates[i]);
            }
            winner.set({
                id: 'system_base_image',
                // @ts-ignore
                isBaseLayer: true,
                selectable: false,
                evented: false,
                hasControls: false,
                lockMovementX: true,
                lockMovementY: true,
                lockRotation: true,
                lockScalingX: true,
                lockScalingY: true,
                hoverCursor: 'default',
                moveCursor: 'default'
            });
            canvas.sendObjectToBack(winner);
            baseLayerRef.current = winner;
        }

        if (maskCandidates.length > 0) {
            maskCandidates.sort((a, b) => {
                const aTagged = (a as any).isMaskLayer === true;
                const bTagged = (b as any).isMaskLayer === true;
                if (aTagged && !bTagged) return -1;
                if (!aTagged && bTagged) return 1;
                return objects.indexOf(a) - objects.indexOf(b);
            });
            const winner = maskCandidates[0];
            for (let i = 1; i < maskCandidates.length; i++) {
                canvas.remove(maskCandidates[i]);
            }
            winner.set({
                id: 'system_mask_image',
                // @ts-ignore
                isMaskLayer: true,
                selectable: false,
                evented: false,
                hasControls: false,
                lockMovementX: true,
                lockMovementY: true,
                lockRotation: true,
                lockScalingX: true,
                lockScalingY: true,
                hoverCursor: 'default',
                moveCursor: 'default'
            });
            canvas.bringObjectToFront(winner);
            maskLayerRef.current = winner;
        }

        canvas.getObjects().forEach(obj => {
            if ((obj as any).isBaseLayer || (obj as any).isMaskLayer || (obj as any).isUserBackground) {
                obj.set({
                    selectable: false,
                    evented: false,
                    hasControls: false,
                    lockMovementX: true,
                    lockMovementY: true,
                    lockRotation: true,
                    lockScalingX: true,
                    lockScalingY: true
                });
            }
        });

        canvas.requestRenderAll();
    };

    // --- Helper: Reorder Layers (Enforce Z-Index) ---
    const reorderLayers = (canvasInstance: Canvas) => {
        const objects = canvasInstance.getObjects();
        objects.forEach(obj => {
            if ((obj as any).isBaseLayer) {
                canvasInstance.sendObjectToBack(obj);
            } else if ((obj as any).isMaskLayer) {
                canvasInstance.bringObjectToFront(obj);
            }
        });
        canvasInstance.requestRenderAll();
    };

    const undo = async () => {
        const step = historyStepRef.current;
        if (step <= 0 || isHistoryProcessing.current) return;

        isHistoryProcessing.current = true;
        isRestoring.current = true;

        const prevStep = step - 1;
        const json = historyRef.current[prevStep];

        if (fabricCanvas.current && json) {
            try {
                const parsedData = JSON.parse(json);
                if (!parsedData || !Array.isArray(parsedData.objects) || parsedData.objects.length === 0) {
                    isHistoryProcessing.current = false;
                    isRestoring.current = false;
                    return;
                }

                // 你原本的策略：載入前刪 clipPath，後面再重綁
                const canvas = fabricCanvas.current;

                // --- Hybrid Restore Strategy ---
                // 1. Preserve current system system objects (Base & Mask)
                // They are static and should not be part of undo/redo JSON cycle to avoid property loss.
                const currentObjects = canvas.getObjects();
                const preservedBase = currentObjects.find(o =>
                    (o as any).isBaseLayer || (o as any).id === 'system_base_image'
                );
                const preservedMask = currentObjects.find(o =>
                    (o as any).isMaskLayer || (o as any).id === 'system_mask_image'
                );

                // 2. Load User History (this will clear canvas)
                // Reviver ensuring other custom props are kept (e.g. user background)
                const reviver = (o: any, object: any) => {
                    if (o.isUserBackground) object.isUserBackground = true;
                };

                await canvas.loadFromJSON(parsedData, reviver);

                // 3. Re-add System Objects
                if (preservedBase) {
                    // Ensure it's at the bottom
                    // Check if it's already there (loadFromJSON might have added a duplicate if history was mixed)
                    // But we chose NOT to save them in history, so loadFromJSON shouldn't add them.
                    canvas.add(preservedBase);
                    canvas.sendObjectToBack(preservedBase);
                }

                if (preservedMask) {
                    // Ensure it's at the top
                    canvas.add(preservedMask);
                    canvas.bringObjectToFront(preservedMask);
                    // Force properties just in case
                    preservedMask.set({
                        selectable: false,
                        evented: false,
                        excludeFromExport: true,
                        opacity: 1,
                        visible: true
                    });
                    preservedMask.setCoords();
                }

                console.log('[UNDO] Hybrid restore complete. Preserved Base:', !!preservedBase, 'Preserved Mask:', !!preservedMask);

                canvas.discardActiveObject();
                canvas.requestRenderAll();

                try {
                    const objects = canvas.getObjects();

                    activeBaseImageRef.current = null;
                    activeMaskImageRef.current = null;
                    maskLayerRef.current = null;
                    baseLayerRef.current = null;

                    const baseObj = objects.find(obj => (obj as any).isBaseLayer) as FabricImage;
                    if (baseObj) {
                        activeBaseImageRef.current = baseObj;
                        baseLayerRef.current = baseObj;
                    }

                    // --- FORCE MASK RE-BINDING (保留你原本邏輯) ---
                    const systemBaseObj = objects.find(obj => (obj as any).isBaseLayer) as FabricImage;
                    if (systemBaseObj) {
                        const rawWidth = systemBaseObj.width || 0;
                        const rawHeight = systemBaseObj.height || 0;
                        const rawScaleX = systemBaseObj.scaleX || 1;
                        const rawScaleY = systemBaseObj.scaleY || 1;

                        const finalWidth = (rawWidth * rawScaleX) || 3000;
                        const finalHeight = (rawHeight * rawScaleY) || 3000;
                        const finalLeft = systemBaseObj.left ?? (canvas.width! / 2);
                        const finalTop = systemBaseObj.top ?? (canvas.height! / 2);

                        objects.forEach(obj => {
                            const isSystem = (obj as any).isBaseLayer || (obj as any).isMaskLayer || (obj as any).isFrameLayer || (obj as any).id === 'system_base_image';

                            if (isSystem) return;

                            const boundary = new Rect({
                                left: finalLeft,
                                top: finalTop,
                                originX: systemBaseObj.originX || 'center',
                                originY: systemBaseObj.originY || 'center',
                                width: finalWidth,
                                height: finalHeight,
                                scaleX: 1,
                                scaleY: 1,
                                angle: systemBaseObj.angle || 0,
                                rx: (systemBaseObj as any).rx || CASE_RADIUS || 0,
                                ry: (systemBaseObj as any).ry || CASE_RADIUS || 0,
                                absolutePositioned: true,
                            });

                            const preserveInner = (obj as any).hasClipPath === true || (obj as any).frameId;

                            if (preserveInner && obj.clipPath) {
                                // 保留內層裁切（愛心/星形/圓角/相框洞），只補 boundary 做交集
                                (obj.clipPath as any).clipPath = boundary;
                                (obj.clipPath as any).dirty = true;
                                obj.dirty = true;
                            } else {
                                // 沒有內層裁切：直接用 boundary
                                obj.set({ clipPath: boundary, dirty: true });
                            }
                        });
                    }

                    restoreLocks(canvas);
                    reorderLayers(canvas);

                    historyStepRef.current = prevStep;
                    setHistoryStep(prevStep);

                    updateLayers();

                    // --- FINAL LAYER CHECK ---
                    // 確保遮罩層在最上層，但不會遮擋使用者操作 (穿透點擊)
                    // 並且確保它是視覺上正確的 (例如中間透明)

                    // DEBUG: Log all objects to see what we have
                    console.log('[UNDO] All canvas objects after restore:', canvas.getObjects().map(obj => ({
                        type: obj.type,
                        id: (obj as any).id,
                        isMaskLayer: (obj as any).isMaskLayer,
                        isBaseLayer: (obj as any).isBaseLayer,
                        dataSystemId: (obj as any).data?.systemId,
                        dataKind: (obj as any).data?.kind
                    })));

                    // Enhanced: Use multi-identifier search to find mask reliably
                    const topMask = canvas.getObjects().find(obj =>
                        (obj as any).isMaskLayer ||
                        (obj as any).data?.systemId === 'system_mask_image' ||
                        (obj as any).id === 'system_mask_image'
                    );

                    if (topMask) {
                        console.log('[UNDO] Restoring mask layer to front');
                        canvas.bringObjectToFront(topMask);
                        topMask.set({
                            evented: false, // 讓滑鼠可以穿透遮罩點擊下面的文字
                            selectable: false,
                            opacity: 1, // 確保可見
                            visible: true, // 明確設置可見狀態
                            excludeFromExport: true
                        });
                        topMask.setCoords(); // 更新坐標
                    } else {
                        console.warn('[UNDO] Mask layer not found after restore!');
                    }
                    // --- FINAL LAYER CHECK END ---

                    canvas.requestRenderAll();
                } catch (postLoadError) {
                    console.error("Undo post-processing failed:", postLoadError);
                }
            } catch (e) {
                console.error("Undo failed:", e);
            }
        }

        isHistoryProcessing.current = false;
        isRestoring.current = false;
    };

    const redo = async () => {
        const step = historyStepRef.current;
        const h = historyRef.current;
        if (step >= h.length - 1 || isHistoryProcessing.current) return;
        const nextStep = step + 1;
        if (!fabricCanvas.current) return;
        const canvas = fabricCanvas.current;

        isHistoryProcessing.current = true;
        isRestoring.current = true;

        console.log('[REDO] Hybrid restore complete');

        canvas.discardActiveObject();
        canvas.requestRenderAll();

        try {
            const objects = canvas.getObjects();

            activeBaseImageRef.current = null;
            activeMaskImageRef.current = null;
            maskLayerRef.current = null;
            baseLayerRef.current = null;

            const baseObj = objects.find(obj => (obj as any).isBaseLayer) as FabricImage;
            if (baseObj) {
                activeBaseImageRef.current = baseObj;
                baseLayerRef.current = baseObj;
            }

            const systemBaseObj = objects.find(obj => (obj as any).isBaseLayer) as FabricImage;
            if (systemBaseObj) {
                const rawWidth = systemBaseObj.width || 0;
                const rawHeight = systemBaseObj.height || 0;
                const rawScaleX = systemBaseObj.scaleX || 1;
                const rawScaleY = systemBaseObj.scaleY || 1;

                const finalWidth = (rawWidth * rawScaleX) || 3000;
                const finalHeight = (rawHeight * rawScaleY) || 3000;
                const finalLeft = systemBaseObj.left ?? (canvas.width! / 2);
                const finalTop = systemBaseObj.top ?? (canvas.height! / 2);

                objects.forEach(obj => {
                    const isSystem = (obj as any).isBaseLayer || (obj as any).isMaskLayer || (obj as any).isFrameLayer || (obj as any).id === 'system_base_image';
                    if (!isSystem) {
                        const clipRect = new Rect({
                            left: finalLeft,
                            top: finalTop,
                            originX: systemBaseObj.originX || 'center',
                            originY: systemBaseObj.originY || 'center',
                            width: finalWidth,
                            height: finalHeight,
                            scaleX: 1,
                            scaleY: 1,
                            angle: systemBaseObj.angle || 0,
                            rx: (systemBaseObj as any).rx || CASE_RADIUS || 0,
                            ry: (systemBaseObj as any).ry || CASE_RADIUS || 0,
                            absolutePositioned: true,
                        });

                        obj.set({ clipPath: clipRect, dirty: true });
                    }
                });
            }

            restoreLocks(canvas);
            reorderLayers(canvas);

            historyStepRef.current = nextStep;
            setHistoryStep(nextStep);

            updateLayers();

            // --- FINAL LAYER CHECK ---
            // Enhanced: Use multi-identifier search to find mask reliably
            const topMask = canvas.getObjects().find(obj =>
                (obj as any).isMaskLayer ||
                (obj as any).data?.systemId === 'system_mask_image' ||
                (obj as any).id === 'system_mask_image'
            );

            if (topMask) {
                console.log('[REDO] Restoring mask layer to front');
                canvas.bringObjectToFront(topMask);
                topMask.set({
                    evented: false,
                    selectable: false,
                    opacity: 1,
                    visible: true,
                    excludeFromExport: true
                });
                topMask.setCoords();
            } else {
                console.warn('[REDO] Mask layer not found after restore!');
            }
            // --- FINAL LAYER CHECK END ---

            canvas.requestRenderAll();
        } catch (e) {
            console.error("Redo failed:", e);
        }

        isHistoryProcessing.current = false;
        isRestoring.current = false;
    };

    const clearCanvas = () => {
        console.log('[CLEAR] Request to clear canvas');
        setShowClearConfirm(true);
    };

    const confirmClearCanvas = () => {
        const canvas = fabricCanvas.current;
        if (!canvas) {
            console.warn('[CLEAR] No canvas available');
            setShowClearConfirm(false);
            return;
        }

        console.log('[CLEAR] Clearing user objects');

        // Temporarily allow operation (clear should not be blocked)
        const wasProcessing = isHistoryProcessing.current;
        const wasRestoring = isRestoring.current;
        isHistoryProcessing.current = false;
        isRestoring.current = false;

        const objects = canvas.getObjects();
        // Remove all objects except Base and Mask layers
        // We iterate backwards or use a filter to avoid index issues during removal
        [...objects].forEach(obj => {
            if ((obj as any).isBaseLayer || (obj as any).isMaskLayer || (obj as any).isUserBackground) {
                // Keep background if it's user background? usually Clear All means clear user additions.
                // If isUserBackground is true, it means it's a background image added by user. 
                // Let's decide to clear user background too if "Clear All".
                // But let's keep it simple: Clear everything that is selectable/user added.
                if ((obj as any).isUserBackground) {
                    canvas.remove(obj);
                    return;
                }
                return;
            }
            canvas.remove(obj);
        });

        canvas.discardActiveObject();
        canvas.requestRenderAll();
        setSelectedObject(null);

        saveHistory();

        console.log('[CLEAR] Canvas cleared successfully');
        setShowClearConfirm(false);
    };

    // --- Toolbar Logic ---
    const updateToolbar = () => {
        const canvas = fabricCanvas.current;
        const activeObj = canvas?.getActiveObject();

        if (!activeObj || !canvas) {
            setShowToolbar(false);
            return;
        }

        // Ensure it's marked as shown in state
        setShowToolbar(true);
    };

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore if user is typing in an input field
            const target = e.target as HTMLElement;
            if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
                return;
            }

            if (!fabricCanvas.current) return;
            const canvas = fabricCanvas.current;
            const activeObject = canvas.getActiveObject();
            if (activeObject && (e.key === 'Delete' || e.key === 'Backspace')) {
                if (activeObject instanceof IText && activeObject.isEditing) {
                    return;
                }
                e.preventDefault();
                canvas.remove(activeObject);
                canvas.discardActiveObject();
                canvas.requestRenderAll();
                setSelectedObject(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, []);

    const [containerDimensions, setContainerDimensions] = useState({ width: 800, height: 600 });

    // --- Refactored Internal Methods (Exposed via Ref) ---

    const updateFrameParams = (value: number) => {
        const canvas = fabricCanvas.current;
        const activeObject = canvas?.getActiveObject();

        if (!canvas || !activeObject || activeObject.type !== 'image' || !activeObject.clipPath) return;

        const frameMeta = (activeObject as any).frameMeta;
        if (!frameMeta) return;

        frameMeta.param = value;
        const clipPath = activeObject.clipPath as any;

        if (frameMeta.type === 'rounded') {
            const width = activeObject.width || 0;
            const height = activeObject.height || 0;
            const size = Math.min(width, height);
            // value is percentage 0..100
            const r = (value / 100) * (size / 2);
            clipPath.set({ rx: r, ry: r });
            clipPath.dirty = true;
        } else if (frameMeta.type === 'star') {
            // Star Morphing: Sharp -> Pentagon
            const r = clipPath.data?.__baseR || (Math.min(activeObject.width || 0, activeObject.height || 0) / 2) * 0.9;
            const points = getStarPoints(r, value);

            clipPath.set({ points: points });

            // Ensure centering
            const dims = clipPath._calcDimensions();
            clipPath.width = dims.width;
            clipPath.height = dims.height;
            clipPath.pathOffset = { x: dims.width / 2 + dims.left, y: dims.height / 2 + dims.top };

            clipPath.dirty = true;
        } else if (frameMeta.type === 'heart') {
            // Heart Morphing: Sharp -> Round
            // Mapping Logic: 50% = Most Round (t=1), 0% = Extra Sharp (t=-1.2)
            let t = 1;
            if (value < 50) {
                t = -1.2 + (value / 50) * 2.2;
            }

            const w = clipPath.data?.__baseW || (activeObject.width || 0) * 0.9;
            const h = clipPath.data?.__baseH || (activeObject.height || 0) * 0.9;

            const d = getHeartPath(w, h, t);

            const tmp = new Path(d);
            clipPath.path = tmp.path;

            const dims = clipPath._calcDimensions();
            clipPath.width = dims.width;
            clipPath.height = dims.height;
            clipPath.pathOffset = { x: dims.width / 2 + dims.left, y: dims.height / 2 + dims.top };

            clipPath.dirty = true;
        } else if (frameMeta.type === 'heart' || frameMeta.type === 'star') {
            // Fallback for aspect ratio (if not using morphing logic, though above blocks catch it)
            // Keeping for safety or mixed types
        }

        activeObject.dirty = true;
        canvas.requestRenderAll();
    };

    const applyCrop = (type: 'circle' | 'heart' | 'rounded' | 'star' | 'none', value?: number) => {
        const canvas = fabricCanvas.current;
        const activeObject = canvas?.getActiveObject();

        if (!canvas || !activeObject || activeObject.type !== 'image') return;

        // Skip for stickers/barcodes/backgrounds if marked
        if ((activeObject as any).hasClipPath === false) return;

        const width = activeObject.width || 0;
        const height = activeObject.height || 0;
        const size = Math.min(width, height);

        // Initialize frameMeta if needed
        (activeObject as any).frameMeta = { type, param: value !== undefined ? value : 0 };

        if (type === 'none') {
            activeObject.clipPath = undefined;
            (activeObject as any).hasClipPath = false;
            (activeObject as any).frameMeta = undefined;
        } else {
            let clipPath;
            if (type === 'circle') {
                clipPath = new Circle({
                    radius: size / 2,
                    originX: 'center',
                    originY: 'center',
                    absolutePositioned: false
                });
                clipPath.data = { frameRole: 'mask', frameShape: 'circle' };
                (activeObject as any).frameMeta.param = 0;
            } else if (type === 'rounded') {
                const defaultPct = 15;
                const pct = value !== undefined ? value : defaultPct;
                (activeObject as any).frameMeta.param = pct;

                const r = (pct / 100) * (size / 2);

                clipPath = new Rect({
                    width: width,
                    height: height,
                    rx: r,
                    ry: r,
                    originX: 'center',
                    originY: 'center',
                    absolutePositioned: false
                });
                clipPath.data = { frameRole: 'mask', frameShape: 'rounded' };
            } else if (type === 'heart') {
                const defaultParam = 50;
                (activeObject as any).frameMeta.param = defaultParam;

                const w = size * 0.9;
                const h = size * 0.9;

                const heartD = getHeartPath(w, h, 1);

                clipPath = new Path(heartD, {
                    originX: 'center',
                    originY: 'center',
                    absolutePositioned: false,
                    scaleX: 1,
                    scaleY: 1
                });

                clipPath.data = { frameRole: 'mask', frameShape: 'heart', __baseW: w, __baseH: h };

            } else if (type === 'star') {
                const defaultParam = 0;
                (activeObject as any).frameMeta.param = defaultParam;

                const outerRadius = (size / 2) * 0.9;
                const points = getStarPoints(outerRadius, defaultParam);

                clipPath = new Polygon(points, {
                    originX: 'center',
                    originY: 'center',
                    absolutePositioned: false,
                    scaleX: 1,
                    scaleY: 1
                });

                clipPath.data = { frameRole: 'mask', frameShape: 'star', __baseR: outerRadius };
            }

            if (clipPath) {
                clipPath.left = 0;
                clipPath.top = 0;
                clipPath.originX = 'center';
                clipPath.originY = 'center';
                clipPath.absolutePositioned = false;

                activeObject.clipPath = clipPath;
                (activeObject as any).hasClipPath = true;
                (activeObject as any).isCropLocked = true;
            }
        }

        activeObject.dirty = true;
        canvas.requestRenderAll();
        saveHistory();

        // Force switch to image property bar to show the slider
        setActiveMobileSubMenu('image');
        setShowMobilePropertyBar(true);
    };

    const addFrameToCanvas = async (input: string | FrameTemplate) => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        await withHistoryTransaction(async () => {
            // Check if there is a selected image to frame (before adding the frame object)
            const activeObj = canvas.getActiveObject();
            const targetImage = (activeObj && activeObj.type === 'image' && !(activeObj as any).isFrameLayer) ? activeObj : null;

            try {
                let img;
                let clipPathPoints = null;

                if (typeof input === 'string') {
                    img = await FabricImage.fromURL(input, { crossOrigin: 'anonymous' });
                } else {
                    // Support both AssetItem (url, metadata) and legacy FrameTemplate (imageUrl, clipPathPoints)
                    const url = (input as any).url || (input as any).imageUrl;
                    if (!url) throw new Error("Frame URL not found");

                    img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
                    clipPathPoints = (input as any).clipPathPoints || (input as any).metadata?.clipPathPoints;
                }

                // Scale frame to fit canvas width initially if too big
                if ((img.width || 0) > REAL_WIDTH) {
                    img.scaleToWidth(REAL_WIDTH);
                }

                ensureObjectId(img, 'frame');

                img.set({
                    left: REAL_WIDTH / 2,
                    top: REAL_HEIGHT / 2,
                    originX: 'center',
                    originY: 'center',
                    // Key properties for Frame Overlay behavior:
                    // @ts-ignore
                    isFrameLayer: true,
                    perPixelTargetFind: true, // Allow clicking through transparent areas
                    lockUniScaling: true,
                    clipPathPoints: clipPathPoints
                });

                canvas.add(img);

                // If we have a target image, move it INTO the frame
                if (targetImage) {
                    ensureObjectId(targetImage, 'img');
                    // 1. Center image to frame
                    targetImage.set({
                        left: img.left,
                        top: img.top,
                        originX: img.originX,
                        originY: img.originY,
                        // @ts-ignore
                        frameId: img.id // Link to frame
                    });

                    // 2. Scale to cover frame area
                    const frameW = img.getScaledWidth();
                    const frameH = img.getScaledHeight();
                    const scaleX = frameW / (targetImage.width || 1);
                    const scaleY = frameH / (targetImage.height || 1);
                    const scale = Math.max(scaleX, scaleY);

                    targetImage.scale(scale);

                    // 3. Apply Absolute ClipPath matching the Frame (Locked by default)
                    if (clipPathPoints) {
                        // Calculate centroid offset relative to frame center (unscaled)
                        const centroid = getPolygonCentroid(clipPathPoints);

                        // Calculate rotated offset vector in canvas space
                        const offsetVec = rotateVector(
                            centroid.x * img.scaleX,
                            centroid.y * img.scaleY,
                            img.angle
                        );

                        const clipPathObj = new Polygon(clipPathPoints, {
                            left: img.left + offsetVec.x,
                            top: img.top + offsetVec.y,
                            originX: 'center', // Polygon's origin is its own centroid
                            originY: 'center',
                            scaleX: img.scaleX,
                            scaleY: img.scaleY,
                            angle: img.angle,
                            absolutePositioned: true
                        });

                        // Store offset for sync
                        (clipPathObj as any).frameOffsetX = centroid.x;
                        (clipPathObj as any).frameOffsetY = centroid.y;

                        targetImage.clipPath = clipPathObj;

                    } else {
                        targetImage.clipPath = new Rect({
                            left: img.left,
                            top: img.top,
                            originX: img.originX,
                            originY: img.originY,
                            width: img.width,
                            height: img.height,
                            scaleX: img.scaleX,
                            scaleY: img.scaleY,
                            angle: img.angle,
                            absolutePositioned: true
                        });
                    }

                    // Mark as Locked
                    (targetImage as any).isCropLocked = true;

                    // 4. Move image BEHIND the frame
                    const frameIndex = canvas.getObjects().indexOf(img);
                    if (frameIndex > -1) {
                        canvas.moveObjectTo(targetImage, frameIndex);
                    }

                    targetImage.setCoords();
                }

                canvas.bringObjectToFront(img); // Ensure it's on top

                // If there's a system mask layer (e.g. camera bump), that should probably still be ON TOP of the frame?
                // Usually camera bumps are physical holes. So yes.
                if (maskLayerRef.current) canvas.bringObjectToFront(maskLayerRef.current);

                canvas.setActiveObject(img);
                canvas.renderAll();
            } catch (error) {
                console.error("Failed to add frame", error);
            }
        });
    };

    const handleInsertImageFromSrc = async (src: string) => {
        if (!fabricCanvas.current) return;
        const canvas = fabricCanvas.current;
        try {
            const img = await FabricImage.fromURL(src, { crossOrigin: "anonymous" });
            ensureObjectId(img, 'img');

            const selectedObj = canvas.getActiveObject();
            if (selectedObj && (selectedObj as any).isFrameLayer) {
                const frame = selectedObj;
                img.set({
                    left: frame.left,
                    top: frame.top,
                    originX: frame.originX,
                    originY: frame.originY,
                    lockUniScaling: true,
                    // @ts-ignore
                    frameId: frame.id
                });

                const frameW = frame.getScaledWidth();
                const frameH = frame.getScaledHeight();
                const scaleX = frameW / (img.width || 1);
                const scaleY = frameH / (img.height || 1);
                const scale = Math.max(scaleX, scaleY);

                img.scale(scale);

                const clipPoints = (frame as any).clipPathPoints;
                if (clipPoints) {
                    img.clipPath = new Polygon(clipPoints, {
                        left: frame.left,
                        top: frame.top,
                        originX: frame.originX,
                        originY: frame.originY,
                        scaleX: frame.scaleX,
                        scaleY: frame.scaleY,
                        angle: frame.angle,
                        absolutePositioned: true
                    });
                } else {
                    img.clipPath = new Rect({
                        left: frame.left,
                        top: frame.top,
                        originX: frame.originX,
                        originY: frame.originY,
                        width: frame.width,
                        height: frame.height,
                        scaleX: frame.scaleX,
                        scaleY: frame.scaleY,
                        angle: frame.angle,
                        absolutePositioned: true
                    });
                }

                canvas.add(img);

                const objects = canvas.getObjects();
                const frameIndex = objects.indexOf(frame);

                if (frameIndex > -1) {
                    canvas.moveObjectTo(img, frameIndex);
                } else {
                    canvas.sendObjectToBack(img);
                    if (baseLayerRef.current) {
                        const baseIndex = objects.indexOf(baseLayerRef.current);
                        if (baseIndex > -1) canvas.moveObjectTo(img, baseIndex + 1);
                    }
                }

                if (maskLayerRef.current) canvas.bringObjectToFront(maskLayerRef.current);

                canvas.setActiveObject(img);
            } else {
                img.set({
                    scaleX: 0.5,
                    scaleY: 0.5,
                    cornerColor: '#3b82f6',
                    cornerStyle: 'circle',
                    borderColor: '#3b82f6',
                    transparentCorners: false,
                });

                canvas.viewportCenterObject(img);
                canvas.add(img);
                canvas.setActiveObject(img);

                // Bring new image to front (below mask if exists)
                canvas.bringObjectToFront(img);

                if (maskLayerRef.current) {
                    // Ensure mask is ALWAYS on top
                    canvas.bringObjectToFront(maskLayerRef.current);
                }
            }

            canvas.requestRenderAll();
            saveHistory();
            updateLayers();
        } catch (err) {
            console.error("Failed to insert image", err);
            throw err;
        }
    };

    // --- Toolbar Logic ---

    useImperativeHandle(ref, () => ({
        insertImageFromSrc: handleInsertImageFromSrc,
        getCanvasJSON: () => {
            const canvas = fabricCanvas.current;
            if (!canvas) return {};
            const JSON_PROPERTIES = [
                'id', 'selectable', 'evented', 'locked', 'excludeFromExport',
                'isUserBackground', 'isBaseLayer', 'isMaskLayer', 'isFrameLayer', 'frameId', 'perPixelTargetFind',
                'lockMovementX', 'lockMovementY', 'lockRotation', 'lockScalingX', 'lockScalingY',
                'lockUniScaling', 'lockSkewingX', 'lockSkewingY', 'hasControls', 'hasBorders',
                'hoverCursor', 'moveCursor', 'clipPath', 'visible', 'bgCornerRadius', 'padding', 'originX', 'originY',
                'name', 'scaleX', 'scaleY', 'left', 'top', 'width', 'height', 'angle', 'fill', 'stroke', 'strokeWidth',
                'data', 'hasClipPath', 'isCropLocked', 'frameMeta', '__baseScale'
            ];
            const json = (canvas as any).toJSON(JSON_PROPERTIES);
            // Strip system objects before saving
            if (json.objects) {
                json.objects = json.objects.filter((obj: any) => {
                    const sid = String(obj.data?.systemId || obj.id || '').trim();
                    const kind = obj.data?.kind;
                    const role = obj.data?.role;
                    return !(
                        obj.excludeFromExport === true ||
                        obj.data?.isSystem === true ||
                        sid.startsWith('system_') ||
                        ['system_base_image', 'system_mask_image', 'system_template_group'].includes(sid) ||
                        ['product_base', 'product_overlay', 'guide'].includes(kind) ||
                        role === 'template' ||
                        role === 'product_base' ||
                        role === 'product_overlay' ||
                        obj.isBaseLayer === true ||
                        obj.isMaskLayer === true
                    );
                });
            }
            return json;
        },
        restoreFromJSON: async (json: object) => {
            const canvas = fabricCanvas.current;
            if (!canvas) return;
            try {
                await new Promise<void>((resolve, reject) => {
                    (canvas as any).loadFromJSON(json, () => {
                        canvas.requestRenderAll();
                        resolve();
                    });
                });
                updateLayers();
            } catch (e) {
                console.error('[CanvasEditor] restoreFromJSON failed:', e);
            }
        },
        generatePreview: () => {
            if (!fabricCanvas.current) return '';
            const canvas = fabricCanvas.current;
            canvas.discardActiveObject();
            canvas.requestRenderAll();
            const currentZoom = canvas.getZoom();
            const multiplier = 2 / currentZoom;
            return canvas.toDataURL({
                format: 'png',
                quality: 1,
                multiplier: multiplier,
                enableRetinaScaling: true
            });
        },
        generatePrintFile: () => {
            if (!fabricCanvas.current) return '';
            const canvas = fabricCanvas.current;
            canvas.discardActiveObject();
            const originalBg = canvas.backgroundColor;
            const baseLayer = baseLayerRef.current;
            const maskLayer = maskLayerRef.current;
            const originalBaseVisible = baseLayer ? baseLayer.visible : true;
            const originalMaskVisible = maskLayer ? maskLayer.visible : true;

            canvas.backgroundColor = 'transparent';
            if (baseLayer) baseLayer.visible = false;
            if (maskLayer) maskLayer.visible = false;

            canvas.renderAll();

            const currentZoom = canvas.getZoom();
            const multiplier = 3 / currentZoom;

            const dataUrl = canvas.toDataURL({
                format: 'png',
                quality: 1,
                multiplier: multiplier,
                enableRetinaScaling: true
            });

            canvas.backgroundColor = originalBg;
            if (baseLayer) baseLayer.visible = originalBaseVisible;
            if (maskLayer) maskLayer.visible = originalMaskVisible;

            canvas.requestRenderAll();
            return dataUrl;
        },
        // --- Image Crop (Mask) System ---
        applyCrop,
        updateFrameParams,


        applyMask: async (item: any) => {
            const canvas = fabricCanvas.current;
            const activeObject = canvas?.getActiveObject() || selectedObject;
            if (!canvas || !activeObject) return;

            try {
                // 1. If item has explicit clipPathPoints (Polygon)
                if (item.clipPathPoints) {
                    const width = activeObject.width || 0;
                    const height = activeObject.height || 0;

                    // We need to scale the polygon to fit the image
                    // Assuming points are normalized or we just fit them?
                    // Usually points are absolute. If they are from a frame, they match that frame's size.
                    // We should probably fit the polygon to the image's bounding box.

                    const polygon = new Polygon(item.clipPathPoints, {
                        originX: 'center',
                        originY: 'center',
                        left: 0,
                        top: 0,
                        absolutePositioned: false,
                        scaleX: 1,
                        scaleY: 1
                    });

                    // Fit polygon to image
                    if (polygon.width && polygon.height) {
                        const scaleX = width / polygon.width;
                        const scaleY = height / polygon.height;
                        // Stretch to fit? or Contain?
                        // Let's stretch to fill the image area for a mask
                        polygon.set({ scaleX, scaleY });
                    }

                    activeObject.clipPath = polygon;
                }
                // 2. Else load image/SVG from URL
                else if (item.url || typeof item === 'string') {
                    const url = typeof item === 'string' ? item : item.url;
                    const maskObj = await FabricImage.fromURL(url);

                    maskObj.set({
                        originX: 'center',
                        originY: 'center',
                        left: 0,
                        top: 0,
                        absolutePositioned: false
                    });

                    // Scale mask to cover the image
                    const width = activeObject.width || 0;
                    const height = activeObject.height || 0;

                    if (maskObj.width && maskObj.height) {
                        // Default to stretch to fit for now, as most masks are expected to match aspect ratio or be shaped
                        maskObj.scaleX = width / maskObj.width;
                        maskObj.scaleY = height / maskObj.height;
                    }

                    activeObject.clipPath = maskObj;
                }

                activeObject.dirty = true;
                canvas.requestRenderAll();
                saveHistory();
            } catch (err) {
                console.error("Failed to apply mask", err);
            }
        },
        addSticker: async (url: string) => {
            if (!p.stickers) return;
            const canvas = fabricCanvas.current;
            if (!canvas) return;
            await withHistoryTransaction(async () => {
                try {
                    const img = await FabricImage.fromURL(url, { crossOrigin: 'anonymous' });
                    ensureObjectId(img, 'sticker');
                    const targetWidth = REAL_WIDTH * 0.3;
                    img.scaleToWidth(targetWidth);
                    img.set({
                        left: REAL_WIDTH / 2,
                        top: REAL_HEIGHT / 2,
                        originX: 'center',
                        originY: 'center',
                        clipPath: new Rect({
                            left: REAL_WIDTH / 2,
                            top: REAL_HEIGHT / 2,
                            originX: 'center',
                            originY: 'center',
                            width: REAL_WIDTH,
                            height: REAL_HEIGHT,
                            rx: CASE_RADIUS,
                            ry: CASE_RADIUS,
                            absolutePositioned: true,
                        }),
                        lockUniScaling: true,
                        data: { kind: 'user_image', source: 'sticker' },
                        isStickerLayer: true
                    });
                    img.setControlsVisibility({
                        mt: false,
                        mb: false,
                        ml: false,
                        mr: false
                    });
                    // Ensure hasClipPath is FALSE for stickers so they don't show crop controls
                    // @ts-ignore
                    img.hasClipPath = false;

                    canvas.add(img);
                    canvas.setActiveObject(img);
                    if (maskLayerRef.current) canvas.bringObjectToFront(maskLayerRef.current);
                    canvas.renderAll();
                } catch (error) {
                    console.error("Failed to add sticker", error);
                }
            });
        },
        setBackgroundColor: async (color: string) => {
            await setCanvasBgColor(color);
            saveHistory();
        },
        setCanvasBgColor: (color: string | null) => {
            setCanvasBgColor(color);
            saveHistory();
        },
        setCanvasBgImage: async (url: string | null) => {
            await setCanvasBgImage(url);
            saveHistory();
        },
        removeBackground: () => {
            setCanvasBgColor(null);
            saveHistory();
        },
        addBarcode: async (text: string) => {
            if (!p.barcode) return;
            const canvas = fabricCanvas.current;
            if (!canvas) return;
            await withHistoryTransaction(async () => {
                try {
                    const isValid = /^[A-Z0-9\-\.\ \$\/\+\%]+$/.test(text);
                    if (!isValid) {
                        alert("Invalid characters. Only A-Z, 0-9, and - . $ / + % space are allowed.");
                        return;
                    }
                    const tempCanvas = document.createElement('canvas');
                    JsBarcode(tempCanvas, text, {
                        format: "CODE39",
                        displayValue: true,
                        fontSize: 40,
                        margin: 10,
                        background: "#ffffff",
                        lineColor: "#000000",
                        width: 4,
                        height: 100
                    });
                    const barcodeUrl = tempCanvas.toDataURL("image/png");
                    const img = await FabricImage.fromURL(barcodeUrl, { crossOrigin: 'anonymous' });
                    ensureObjectId(img, 'barcode');
                    const targetW = REAL_WIDTH * 0.6;
                    img.scaleToWidth(targetW);

                    img.set({
                        left: REAL_WIDTH / 2,
                        top: REAL_HEIGHT / 2,
                        originX: 'center',
                        originY: 'center',
                        clipPath: new Rect({
                            left: REAL_WIDTH / 2,
                            top: REAL_HEIGHT / 2,
                            originX: 'center',
                            originY: 'center',
                            width: REAL_WIDTH,
                            height: REAL_HEIGHT,
                            rx: CASE_RADIUS,
                            ry: CASE_RADIUS,
                            absolutePositioned: true,
                        }),
                        lockUniScaling: true,
                        isBarcodeLayer: true
                    });
                    img.setControlsVisibility({
                        mt: false,
                        mb: false,
                        ml: false,
                        mr: false
                    });
                    // @ts-ignore
                    img.hasClipPath = false;

                    canvas.add(img);
                    canvas.setActiveObject(img);
                    if (maskLayerRef.current) canvas.bringObjectToFront(maskLayerRef.current);
                    canvas.renderAll();
                } catch (error) {
                    console.error("Failed to generate barcode", error);
                    alert("Failed to generate barcode. Please check format.");
                }
            });
        },
        addBackground: async (url: string) => {
            await setCanvasBgImage(url);
            saveHistory();
        },
        // --- AI Integration ---
        handleGenerateAI: async (styleId: "toon_mochi" | "toon_ink" | "toon_anime" | "remove_bg") => {
            const canvas = fabricCanvas.current;
            const activeObject = canvas?.getActiveObject();
            if (!canvas || !activeObject || activeObject.type !== 'image') {
                alert("請先選擇一張圖片");
                return;
            }

            const imageObj = activeObject as FabricImage;
            const imageUrl = imageObj.getSrc();

            // Optimistic UI
            const originalOpacity = imageObj.opacity;
            imageObj.set('opacity', 0.5);
            canvas.renderAll();

            try {
                // console.log("Calling AI API...", styleId);

                // Convert to Blob
                const blob = await fetch(imageUrl).then(r => r.blob());
                const formData = new FormData();
                formData.append('image', blob);

                if (styleId !== 'remove_bg') {
                    formData.append('meta', JSON.stringify({ styleId }));
                }

                const endpoint = styleId === 'remove_bg'
                    ? `${import.meta.env.VITE_API_ORIGIN}/api/ai/remove-bg`
                    : `${import.meta.env.VITE_API_ORIGIN}/api/ai/cartoon`;

                // console.log(`[AI] Fetching: ${endpoint}`);

                const response = await fetch(endpoint, {
                    method: 'POST',
                    body: formData,
                    mode: 'cors', // Essential for CORS
                    credentials: 'omit' // Essential for public API without cookies
                });

                if (!response.ok) {
                    const errText = await response.text();
                    throw new Error(`API Error: ${response.status} ${errText}`);
                }

                const data = await response.json();
                if (!data.success || !data.url) {
                    throw new Error(data.message || "AI processing failed");
                }

                // Replace Image
                const newImg = await FabricImage.fromURL(data.url, { crossOrigin: 'anonymous' });

                // Maintain geometry
                newImg.set({
                    left: imageObj.left,
                    top: imageObj.top,
                    scaleX: imageObj.scaleX,
                    scaleY: imageObj.scaleY,
                    angle: imageObj.angle,
                    flipX: imageObj.flipX,
                    flipY: imageObj.flipY,
                    originX: imageObj.originX,
                    originY: imageObj.originY,
                    clipPath: imageObj.clipPath // Preserve crop if any
                });

                // Replace in canvas
                const idx = canvas.getObjects().indexOf(imageObj);
                if (idx !== -1) {
                    canvas.remove(imageObj);
                    canvas.insertAt(idx, newImg);
                    canvas.setActiveObject(newImg);
                } else {
                    canvas.add(newImg);
                }

                canvas.renderAll();
                saveHistory(); // Save state

            } catch (error: any) {
                console.error("AI Error:", error);
                imageObj.set('opacity', originalOpacity); // Restore opacity
                canvas.renderAll();

                // [Task 4] Enhanced Error Message
                const endpoint = styleId === 'remove_bg'
                    ? `${import.meta.env.VITE_API_ORIGIN}/api/ai/remove-bg`
                    : `${import.meta.env.VITE_API_ORIGIN}/api/ai/cartoon`;

                alert(`AI 處理失敗 (Connection Failed)\n\nEndpoint: ${endpoint}\nError: ${error.message}\n\n請檢查瀏覽器 Console (F12) 的 Network 分頁，確認 OPTIONS 是否回傳 204，POST 是否回傳 200。`);
            }
        },

        addDesignLayers: async (layers: any[]) => {
            const canvas = fabricCanvas.current;
            if (!canvas) return;

            await withHistoryTransaction(async () => {
                const loadedObjects: FabricObject[] = [];

                for (const layer of layers) {
                    try {
                        let obj: FabricObject;
                        if (layer.type === 'i-text' || layer.type === 'text') {
                            obj = new IText(layer.text || '', {
                                ...layer,
                                left: layer.left,
                                top: layer.top,
                                originX: layer.originX || 'left',
                                originY: layer.originY || 'top',
                            });
                        } else {
                            if (!layer.image) continue;
                            obj = await FabricImage.fromURL(layer.image, { crossOrigin: 'anonymous' });
                            const scaleX = layer.scaleX || 1;
                            const scaleY = layer.scaleY || 1;
                            obj.set({
                                ...layer,
                                left: layer.left,
                                top: layer.top,
                                originX: layer.originX || 'center',
                                originY: layer.originY || 'center',
                                scaleX: scaleX,
                                scaleY: scaleY,
                            });
                        }

                        // Apply clip path for mold
                        obj.set({
                            clipPath: new Rect({
                                left: REAL_WIDTH / 2,
                                top: REAL_HEIGHT / 2,
                                originX: 'center',
                                originY: 'center',
                                width: REAL_WIDTH,
                                height: REAL_HEIGHT,
                                rx: CASE_RADIUS,
                                ry: CASE_RADIUS,
                                absolutePositioned: true,
                            }),
                            lockUniScaling: true
                        });

                        ensureObjectId(obj, 'layer');
                        loadedObjects.push(obj);
                    } catch (err) {
                        console.error("Failed to load a design layer", err);
                    }
                }

                if (loadedObjects.length === 0) return;

                // Add all to canvas first
                loadedObjects.forEach(obj => canvas.add(obj));

                // Create ActiveSelection to group them
                const activeSelection = new ActiveSelection(loadedObjects, {
                    canvas: canvas,
                });

                // Center the entire selection to the middle of the case
                activeSelection.set({
                    left: REAL_WIDTH / 2,
                    top: REAL_HEIGHT / 2,
                    originX: 'center',
                    originY: 'center',
                });

                // Update coordinates of children
                activeSelection.setCoords();

                // Bring mask to front
                if (maskLayerRef.current) {
                    canvas.bringObjectToFront(maskLayerRef.current);
                }

                canvas.setActiveObject(activeSelection);
                canvas.requestRenderAll();
            });
        },

        addLayer: async (layer: any) => {
            const canvas = fabricCanvas.current;
            if (!canvas) return;
            await withHistoryTransaction(async () => {
                try {
                    const img = await FabricImage.fromURL(layer.image, { crossOrigin: 'anonymous' });
                    ensureObjectId(img, 'layer');

                    const scaleX = layer.scaleX || 1;
                    const scaleY = layer.scaleY || 1;
                    const isExplicit = layer.scaleX !== undefined;

                    img.set({
                        ...layer,
                        left: layer.left,
                        top: layer.top,
                        originX: layer.originX || 'center',
                        originY: layer.originY || 'center',
                        scaleX: scaleX,
                        scaleY: scaleY,
                        clipPath: new Rect({
                            left: REAL_WIDTH / 2,
                            top: REAL_HEIGHT / 2,
                            originX: 'center',
                            originY: 'center',
                            width: REAL_WIDTH,
                            height: REAL_HEIGHT,
                            rx: CASE_RADIUS,
                            ry: CASE_RADIUS,
                            absolutePositioned: true,
                        }),
                        lockUniScaling: true
                    });

                    // If NOT explicit (fallback behavior), scale down if too big
                    if (!isExplicit && ((img.width || 0) > REAL_WIDTH || (img.height || 0) > REAL_HEIGHT)) {
                        img.scaleToWidth(REAL_WIDTH * 0.8);
                    }

                    canvas.add(img);
                    canvas.setActiveObject(img);
                    if (maskLayerRef.current) canvas.bringObjectToFront(maskLayerRef.current);
                    canvas.renderAll();
                } catch (error) {
                    console.error("Failed to add layer", error);
                }
            });
        },
        addFrame: addFrameToCanvas,
        clearLayers: () => {
            const canvas = fabricCanvas.current;
            if (!canvas) return;

            // Step 4: 清空只清 user，絕不清 system
            removeByPredicate(canvas, o => {
                const sid = o?.data?.systemId || o?.id;
                const isSystem = ['system_base_image', 'system_mask_image', 'system_template_group'].includes(sid);
                return !isSystem;
            });

            // Step 4: 同時清掉 Canvas 背景
            canvas.backgroundColor = 'transparent';
            canvas.backgroundImage = undefined;

            canvas.discardActiveObject();
            canvas.requestRenderAll();
            saveHistory();
        },
        removeUserObjects: (predicate?: (obj: any) => boolean) => {
            const canvas = fabricCanvas.current;
            if (!canvas) return;

            // Step 4: 清空只清 user，絕不清 system
            removeByPredicate(canvas, o => {
                const sid = o?.data?.systemId || o?.id;
                const isSystem = ['system_base_image', 'system_mask_image', 'system_template_group'].includes(sid);
                if (isSystem) return false; // 保護
                if (predicate && !predicate(o)) return false; // 額外過濾
                return true;
            });

            // Step 4: 同時清掉 Canvas 背景
            canvas.backgroundColor = 'transparent';
            canvas.backgroundImage = undefined;

            canvas.discardActiveObject();
            canvas.requestRenderAll();
            saveHistory();
        },
        upsertUserBg: async (config: { type: 'color' | 'image', value: string }) => {
            const canvas = fabricCanvas.current;
            if (!canvas) return;
            await upsertUserBg(canvas, config);
            saveHistory();
        },
        // Expose toggleCropMode via ref for external buttons if needed
        toggleCropMode: () => {
            if (toggleCropModeRef.current) {
                toggleCropModeRef.current();
            }
        },
        applyAiStyle: async (styleId: "toon_mochi" | "toon_ink" | "toon_anime") => {
            if (!p.aiCartoon) return;
            await handleGenerateAI(styleId);
        },
        removeBackgroundFromSelection: async () => {
            if (!p.aiRemoveBg) return;
            await handleGenerateAI('remove_bg');
        },
        setBackgroundImage: async (url: string) => {
            await setCanvasBgImage(url);
            saveHistory();
        }
    }));

    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                setContainerDimensions({
                    width: containerRef.current.clientWidth,
                    height: containerRef.current.clientHeight
                });
            }
        };

        // Initial measure
        updateDimensions();

        // Use ResizeObserver for robust size detection
        const resizeObserver = new ResizeObserver(() => {
            updateDimensions();
        });

        if (containerRef.current) {
            resizeObserver.observe(containerRef.current);
        }

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    // Internal function to fit canvas to container
    const fitCanvasToContainer = () => {
        if (!fabricCanvas.current || !containerRef.current) return;

        const canvas = fabricCanvas.current;
        const PADDING = 60;
        const availableWidth = containerDimensions.width - PADDING * 2;
        const availableHeight = containerDimensions.height - PADDING * 2;

        // Prevent division by zero or negative values
        if (availableWidth <= 0 || availableHeight <= 0 || REAL_WIDTH <= 0 || REAL_HEIGHT <= 0) return;

        const scaleX = availableWidth / REAL_WIDTH;
        const scaleY = availableHeight / REAL_HEIGHT;
        const zoom = Math.min(scaleX, scaleY) * 0.8; // 0.8 factor for spacing

        const visualWidth = REAL_WIDTH * zoom;
        const visualHeight = REAL_HEIGHT * zoom;

        canvas.setDimensions({
            width: visualWidth,
            height: visualHeight
        });
        canvas.setZoom(zoom);
        canvas.calcOffset(); // Ensure offset is correct after resize
        canvas.requestRenderAll();
    };

    const handleFrameSync = (e: any) => {
        const obj = e.target;
        const canvas = fabricCanvas.current;
        if (!canvas || !obj) return;

        // Debug Frame Sync
        if ((obj as any).isFrameLayer) {
            // console.log('[FrameSync] Frame Moving:', obj.id);
            const objects = canvas.getObjects();
            const photos = objects.filter(o => (o as any).frameId === obj.id);
            // console.log('[FrameSync] Linked Photos:', photos.length);

            photos.forEach(photo => {
                // Always Sync ClipPath (Hole) to Frame
                if (photo.clipPath) {
                    // Calculate offset based on frameOffsetX/Y
                    const frameOffsetX = (photo.clipPath as any).frameOffsetX || 0;
                    const frameOffsetY = (photo.clipPath as any).frameOffsetY || 0;

                    const offsetVec = rotateVector(
                        frameOffsetX * obj.scaleX,
                        frameOffsetY * obj.scaleY,
                        obj.angle
                    );

                    photo.clipPath.set({
                        left: obj.left + offsetVec.x,
                        top: obj.top + offsetVec.y,
                        scaleX: obj.scaleX,
                        scaleY: obj.scaleY,
                        angle: obj.angle,
                        skewX: obj.skewX,
                        skewY: obj.skewY,
                        originX: obj.originX,
                        originY: obj.originY,
                    });
                    photo.clipPath.setCoords();
                }

                // Always Sync Photo Position to Frame (Container carries Content)
                // This allows moving the "Whole Composition" even if Crop Mode (Unlock) is active.
                // Unlock Mode only affects "Moving Photo moves Frame" (Part 2).

                // Calculate Translation Delta
                const prevLeft = (obj as any)._prevLeft ?? obj.left;
                const prevTop = (obj as any)._prevTop ?? obj.top;
                const dx = obj.left - prevLeft;
                const dy = obj.top - prevTop;

                // Calculate Rotation Delta
                const prevAngle = (obj as any)._prevAngle ?? obj.angle;
                const dAngle = obj.angle - prevAngle;

                if (dx !== 0 || dy !== 0) {
                    photo.left += dx;
                    photo.top += dy;
                }

                if (dAngle !== 0) {
                    // Rotate Photo Angle
                    photo.angle += dAngle;

                    // Rotate Photo Position around Frame Center
                    // 1. Get Frame Center (New Position)
                    const frameCenter = new Point(obj.left, obj.top);

                    // 2. Rotate Photo Center around Frame Center
                    const photoCenter = new Point(photo.left, photo.top);
                    // Use Point.rotate instead of util.rotatePoint in Fabric v6
                    const newPhotoCenter = photoCenter.rotate(util.degreesToRadians(dAngle), frameCenter);

                    photo.left = newPhotoCenter.x;
                    photo.top = newPhotoCenter.y;
                }

                if (dx !== 0 || dy !== 0 || dAngle !== 0) {
                    photo.setCoords();
                }

                photo.dirty = true;
            });

            // Update prev coords for next delta
            (obj as any)._prevLeft = obj.left;
            (obj as any)._prevTop = obj.top;
            (obj as any)._prevAngle = obj.angle;
        }

        // 2. Photo Moved -> Sync Frame Overlay
        if ((obj as any).frameId) {
            const isLocked = (obj as any).isCropLocked !== false;
            if (isLocked) {
                const frame = canvas.getObjects().find(o => (o as any).id === (obj as any).frameId);
                if (frame) {
                    // Locked: Frame follows Photo
                    // Calculate Delta from last known position (or current difference if no prev)
                    // Using current difference is safer against drift

                    // Current Photo State
                    const pLeft = obj.left;
                    const pTop = obj.top;

                    // We need to maintain the INITIAL relative offset between Frame and Photo.
                    // But we don't store that.
                    // Instead, let's use the delta approach but robustly.

                    const prevLeft = (obj as any)._prevLeft ?? pLeft;
                    const prevTop = (obj as any)._prevTop ?? pTop;

                    const dx = pLeft - prevLeft;
                    const dy = pTop - prevTop;

                    if (dx !== 0 || dy !== 0) {
                        frame.left += dx;
                        frame.top += dy;
                        frame.setCoords();

                        // Update ClipPath absolute position to match Frame
                        // This is crucial: ClipPath MUST exactly match Frame
                        if (obj.clipPath) {
                            obj.clipPath.set({
                                left: frame.left,
                                top: frame.top,
                                scaleX: frame.scaleX,
                                scaleY: frame.scaleY,
                                angle: frame.angle,
                                skewX: frame.skewX,
                                skewY: frame.skewY,
                                originX: frame.originX,
                                originY: frame.originY,
                            });
                            obj.clipPath.setCoords();
                        }

                        frame.dirty = true;
                    }
                }
            }
            // Update prev coords
            (obj as any)._prevLeft = obj.left;
            (obj as any)._prevTop = obj.top;
        }

        canvas.requestRenderAll();
    };

    // --- Optimized Update Functions (Race-Condition Proof) ---
    const normalizeUrl = (u: any): string => {
        return String(u ?? '').trim();
    };

    const isDataOrBlob = (u: string): boolean => {
        const v = normalizeUrl(u).toLowerCase();
        return v.startsWith('data:') || v.startsWith('blob:');
    };

    const safeCacheBust = (u: string, v: any): string => {
        const url = normalizeUrl(u);
        if (!url) return url;
        if (isDataOrBlob(url)) return url;

        try {
            const parsed = new URL(url, window.location.origin);
            parsed.searchParams.set('v', String(v));
            return parsed.toString();
        } catch {
            const sep = url.includes('?') ? '&' : '?';
            return `${url}${sep}v=${encodeURIComponent(String(v))}`;
        }
    };

    const applyTemplateForProduct = useCallback(async (productCtx: { base_image: string, mask_image: string, id?: string, updated_at?: any, specs?: any, mask_config?: any }) => {
        const canvas = fabricCanvas.current;
        if (!canvas) return;

        // [TPL] 1. 防重入鎖 (Anti-reentry)
        if (templateApplyInFlightRef.current) {
            console.warn("[TPL] apply already in flight, skipping...");
            return;
        }

        const rawBase = normalizeUrl(productCtx?.base_image);
        const rawMask = normalizeUrl(productCtx?.mask_image);

        const templateRev = productCtx?.updated_at ||
            (rawBase && rawMask ? btoa(rawBase + '|' + rawMask).substr(0, 10) : 'latest');

        const baseFinal = safeCacheBust(rawBase, templateRev);
        const maskFinal = safeCacheBust(rawMask, templateRev);

        if (normalizeUrl(baseFinal).toLowerCase().startsWith('data:') && baseFinal.includes('?')) {
            console.error('[TPL] INVALID data URL with query', baseFinal);
            throw new Error('Invalid data URL (base) with query');
        }
        if (normalizeUrl(maskFinal).toLowerCase().startsWith('data:') && maskFinal.includes('?')) {
            console.error('[TPL] INVALID data URL with query', maskFinal);
            throw new Error('Invalid data URL (mask) with query');
        }

        console.log('[TPL] raw', { rawBase, rawMask });
        templateFinalSrcRef.current = { baseFinal, maskFinal };

        // [TPL] T2: (4) 早退條件：Key 相同 且 模板存在 且 src 一致
        const nextKey = `${productCtx.id || 'unknown'}|${baseFinal}|${maskFinal}`;
        if (appliedTemplateKeyRef.current === nextKey) {
            const stats = getTemplateCounts(canvas);
            const baseObj = canvas.getObjects().find(o => (o as any).data?.systemId === 'system_base_image') as any;
            const maskObj = canvas.getObjects().find(o => (o as any).data?.systemId === 'system_mask_image') as any;

            const currentBaseSrc = baseObj?.getSrc?.() || baseObj?._originalElement?.src;
            const currentMaskSrc = maskObj?.getSrc?.() || maskObj?._originalElement?.src;

            if (stats.base === 1 && stats.mask === 1 && currentBaseSrc === baseFinal && currentMaskSrc === maskFinal) {
                console.log("[TPL] same product, template exists and src matches, skipping apply.");
                return;
            }
            console.log("[TPL] key matched but state inconsistent, re-applying...", { stats, currentBaseSrc, baseFinal });
        } else {
            // console.log('[TPL] Keys do not match, proceeding with template application'); // Removed
        }

        templateApplyInFlightRef.current = true;
        suppressDraftSaveRef.current = true;
        console.groupCollapsed(`[TPL] apply start: ${productCtx?.id || 'unknown'}`, {
            base: baseFinal,
            mask: maskFinal
        });
        dumpCanvas(canvas, 'tpl_start');

        // [TPL] T2: (1) Anti-race sequence
        const seq = ++templateLoadSeqRef.current;
        const isAborted = () => seq !== templateLoadSeqRef.current;

        setIsTemplateLoading(true);

        const prevRenderOnAddRemove = canvas.renderOnAddRemove;
        canvas.renderOnAddRemove = false;

        const safeDisposeLocal = (group?: FabricObject, imgs?: FabricObject[]) => {
            try {
                if (group && canvas) {
                    if (canvas.getObjects().includes(group)) canvas.remove(group);
                    disposeObjectDeep(group);
                }
            } catch { }
            try { imgs?.forEach(i => disposeObjectDeep(i)); } catch { }
        };

        try {
            // [TPL] T2: (3) 冪等清理
            removeTemplateObjects(canvas);
            canvas.requestRenderAll();

            const [baseEl, maskEl] = await Promise.all([
                loadImageElement(baseFinal),
                loadImageElement(maskFinal),
            ]);

            if (isAborted()) {
                try { if (baseEl) baseEl.src = ''; } catch { }
                try { if (maskEl) maskEl.src = ''; } catch { }
                return;
            }

            const baseImg = new FabricImage(baseEl, { selectable: false, evented: false });
            const maskImg = new FabricImage(maskEl, { selectable: false, evented: false });

            baseImg.set({ objectCaching: false, noScaleCache: true });
            maskImg.set({ objectCaching: false, noScaleCache: true });

            if (isAborted()) { safeDisposeLocal(undefined, [baseImg, maskImg]); return; }

            // [TPL] T2: (3) 三重標記
            baseImg.scaleX = REAL_WIDTH / (baseImg.width || 1);
            baseImg.scaleY = REAL_HEIGHT / (baseImg.height || 1);
            baseImg.set({
                left: REAL_WIDTH / 2,
                top: REAL_HEIGHT / 2,
                originX: 'center',
                originY: 'center',
                opacity: 0,
                selectable: false,
                evented: false,
                excludeFromExport: true,
                id: 'system_base_image',
                data: {
                    systemId: 'system_base_image',
                    kind: 'product_base',
                    role: TEMPLATE_ROLE,
                    system: true,
                    isSystem: true
                }
            });

            // CRITICAL: Set isBaseLayer flag for history serialization
            (baseImg as any).isBaseLayer = true;

            maskImg.scaleX = REAL_WIDTH / (maskImg.width || 1);
            maskImg.scaleY = REAL_HEIGHT / (maskImg.height || 1);
            maskImg.set({
                left: REAL_WIDTH / 2,
                top: REAL_HEIGHT / 2,
                originX: 'center',
                originY: 'center',
                opacity: 0,
                selectable: false,
                evented: false,
                excludeFromExport: true,
                id: 'system_mask_image',
                data: {
                    systemId: 'system_mask_image',
                    kind: 'product_overlay',
                    role: TEMPLATE_ROLE,
                    system: true,
                    isSystem: true
                }
            });

            // CRITICAL: Set isMaskLayer flag for history serialization
            (maskImg as any).isMaskLayer = true;

            activeBaseImageRef.current = baseImg;
            baseLayerRef.current = baseImg;
            canvas.add(baseImg);
            canvas.sendObjectToBack(baseImg);

            activeMaskImageRef.current = maskImg;
            maskLayerRef.current = maskImg;
            canvas.add(maskImg);
            canvas.bringObjectToFront(maskImg);

            if (isAborted()) { safeDisposeLocal(undefined, [baseImg, maskImg]); return; }

            canvas.requestRenderAll();

            await new Promise<void>((resolve) => {
                requestAnimationFrame(() => {
                    if (isAborted()) {
                        safeDisposeLocal(undefined, [baseImg, maskImg]);
                        resolve();
                        return;
                    }

                    if (!canvas) {
                        resolve();
                        return;
                    }
                    baseImg.set({ opacity: 1 });
                    maskImg.set({ opacity: 1 });
                    baseImg.setCoords();
                    maskImg.setCoords();

                    canvas.renderOnAddRemove = prevRenderOnAddRemove;
                    canvas.requestRenderAll();

                    if (!isAborted()) {
                        setIsTemplateLoading(false);
                        setHasTemplateLoaded(true); // Mark that template has loaded at least once
                        appliedTemplateKeyRef.current = nextKey;
                    }
                    resolve();
                });
            });

        } catch (e) {
            canvas.renderOnAddRemove = prevRenderOnAddRemove;
            if (!isAborted()) setIsTemplateLoading(false);
            if (isAborted()) return;

            console.error("[TPL] Template application failed:", e);
            addFallbackBase(canvas, REAL_WIDTH / 2, REAL_HEIGHT / 2);
            addFallbackMask(canvas, REAL_WIDTH / 2, REAL_HEIGHT / 2);
        } finally {
            templateApplyInFlightRef.current = false;
            suppressDraftSaveRef.current = false;
            dumpCanvas(canvas, 'tpl_end');
            console.groupEnd();
        }
    }, [REAL_WIDTH, REAL_HEIGHT, currentProduct, previewConfig]);

    // 1. Canvas Initialization Effect (Runs on mount or product change)
    useEffect(() => {
        if (!canvasEl.current) return;
        initOnceRef.current = false; // Reset guard for new initialization

        // Dispose existing if any (for product change)
        if (fabricCanvas.current) {
            fabricCanvas.current.dispose();
        }

        // Initialize with container size initially
        const canvas = new Canvas(canvasEl.current, {
            width: containerDimensions.width,
            height: containerDimensions.height,
            backgroundColor: 'transparent',
            preserveObjectStacking: true,
        });


        // =====================================================================
        // [PPBears] ENFORCE IMAGE UNIFORM SCALING (NO DISTORT) - START
        // 目的：所有「使用者圖片」（含相框照片）只能等比縮放，永遠不能被拉伸變形
        // =====================================================================
        const enforceImageUniformScaling = (obj: any) => {
            if (!obj || obj.type !== 'image') return;
            // 排除系統底圖/遮罩（或你標記過的系統層）
            if ((obj as any).isBaseLayer || (obj as any).isMaskLayer) return;

            obj.set({
                lockUniScaling: true,
                lockSkewingX: true,
                lockSkewingY: true,
                lockScalingFlip: true,
            });

            // 隱藏邊中點控制柄（避免左右/上下拉伸），只留四角
            if (typeof obj.setControlsVisibility === 'function') {
                obj.setControlsVisibility({
                    mt: false,
                    mb: false,
                    ml: false,
                    mr: false,
                });
            }

            obj.setCoords?.();
        };

        // ✅ 手機端也要等比：Fabric 預設行為改成「不用按 Shift 也等比」
        if ('uniformScaling' in canvas) (canvas as any).uniformScaling = true;
        if ('uniScaleTransform' in canvas) (canvas as any).uniScaleTransform = true;
        if ('uniScaleKey' in canvas) (canvas as any).uniScaleKey = null;

        // ✅ 最終保險：不管 Fabric 算出什麼縮放，都把 scaleY 硬鎖回 scaleX
        canvas.on('object:scaling', (e: any) => {
            const obj = e?.target;
            if (!obj || obj.type !== 'image') return;
            if ((obj as any).isBaseLayer || (obj as any).isMaskLayer) return;

            // 避免遞迴抖動
            if ((obj as any).__lockingUniform) return;
            (obj as any).__lockingUniform = true;

            enforceImageUniformScaling(obj);
            const sx = obj.scaleX ?? 1;
            if (obj.scaleY !== sx) obj.scaleY = sx;

            obj.setCoords?.();
            (obj as any).__lockingUniform = false;
        });

        // ✅ Undo/Redo(loadFromJSON) 時 controlsVisibility 不會被 JSON 保存
        // 所以加一個「永遠執行」的 object:added 監聽：每次物件被加入都重新套用
        canvas.on('object:added', (e: any) => {
            const obj = e?.target;
            enforceImageUniformScaling(obj);
        });

        // =====================================================================
        // [PPBears] ENFORCE IMAGE UNIFORM SCALING (NO DISTORT) - END
        // =====================================================================

        fabricCanvas.current = canvas;

        // [DIAG] Expose dump API to globalThis for Console access
        // @ts-ignore
        globalThis.__ppbDumpCanvas = (label: string = 'manual') => dumpCanvas(canvas, label);
        // @ts-ignore
        globalThis.__ppbDumpCanvasStats = () => getTemplateCounts(canvas);
        // @ts-ignore
        globalThis.__ppbPrintBaselineSrc = () => {
            // @ts-ignore
            const r = globalThis.__ppbDumpCanvas?.('baseline_enter_manual');
            const dump = (r && (r.dump || r)) || [];
            const base = dump.find((x: any) => x.systemId === 'system_base_image' || x.id === 'system_base_image');
            const mask = dump.find((x: any) => x.systemId === 'system_mask_image' || x.id === 'system_mask_image');
            console.log('[BASELINE] BASE src =', base?.src);
            console.log('[BASELINE] MASK src =', mask?.src);
            console.log('[BASELINE] stats =', r?.stats || null);
            return { base: base?.src, mask: mask?.src, stats: r?.stats || null };
        };
        // @ts-ignore
        globalThis.__ppbGetDraftKey = () => getDraftKey();
        // @ts-ignore
        globalThis.__ppbClearCurrentDraft = async () => {
            const key = getDraftKey();
            if (!key) {
                console.log('[DRAFT] clear current: key is null');
                return { removed: [] };
            }
            const removed: string[] = [];
            try {
                localStorage.removeItem(key);
                removed.push(key);
            } catch { }
            try { await removeDraft(key); } catch { }
            console.log('[DRAFT] clear current removed', removed);
            return { removed };
        };
        // @ts-ignore
        globalThis.__ppbClearAllDrafts = async () => {
            const removed: string[] = [];
            try {
                const keys = Object.keys(localStorage);
                keys.forEach(k => {
                    if (k.startsWith('draft:')) {
                        localStorage.removeItem(k);
                        removed.push(k);
                    }
                });
            } catch { }
            try {
                const storeKeys = await (draftStore as any).keys?.();
                if (Array.isArray(storeKeys)) {
                    for (const k of storeKeys) {
                        if (typeof k === 'string' && k.startsWith('draft:')) {
                            try { await removeDraft(k); } catch { }
                            removed.push(k);
                        }
                    }
                }
            } catch { }
            console.log('[DRAFT] clear all removed', removed);
            return { removed };
        };

        // Mirror onto window (explicit) for Console usage
        // @ts-ignore
        (window as any).__ppbDumpCanvas = globalThis.__ppbDumpCanvas;
        // @ts-ignore
        (window as any).__ppbDumpCanvasStats = globalThis.__ppbDumpCanvasStats;
        // @ts-ignore
        (window as any).__ppbPrintBaselineSrc = globalThis.__ppbPrintBaselineSrc;
        // @ts-ignore
        (window as any).__ppbGetDraftKey = globalThis.__ppbGetDraftKey;
        // @ts-ignore
        (window as any).__ppbClearCurrentDraft = globalThis.__ppbClearCurrentDraft;
        // @ts-ignore
        (window as any).__ppbClearAllDrafts = globalThis.__ppbClearAllDrafts;
        console.info('[DIAG] __ppbDumpCanvas ready');
        dumpCanvas(canvas, '[NAV] after canvas init');

        // =====================================================================
        // [PPBears] UNIVERSAL 2-FINGER GESTURES (Pinch Zoom + Rotate)
        // =====================================================================
        const upperCanvasEl = canvas.upperCanvasEl;
        if (upperCanvasEl) {
            let isGestureActive = false;
            let startDist = 0;
            let startAngle = 0;
            let startScale = 1;
            let startObjAngle = 0;

            const getDist = (t1: Touch, t2: Touch) => Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
            const getAng = (t1: Touch, t2: Touch) => Math.atan2(t1.clientY - t2.clientY, t1.clientX - t2.clientX) * 180 / Math.PI;

            const handleTouchStart = (e: TouchEvent) => {
                if (e.touches.length === 2) {
                    const activeObject = canvas.getActiveObject();
                    if (activeObject && isImageLikeObject(activeObject)) {
                        isGestureActive = true;
                        const t1 = e.touches[0];
                        const t2 = e.touches[1];
                        startDist = getDist(t1, t2);
                        startAngle = getAng(t1, t2);
                        startScale = activeObject.scaleX || 1;
                        startObjAngle = activeObject.angle || 0;
                    }
                }
            };

            const handleTouchMove = (e: TouchEvent) => {
                if (!isGestureActive) return;
                if (e.cancelable) e.preventDefault(); // Prevent scroll

                if (e.touches.length === 2) {
                    const activeObject = canvas.getActiveObject();
                    if (!activeObject || !isImageLikeObject(activeObject)) {
                        isGestureActive = false;
                        return;
                    }
                    const t1 = e.touches[0];
                    const t2 = e.touches[1];

                    const currDist = getDist(t1, t2);
                    const currAng = getAng(t1, t2);

                    const scaleFactor = currDist / startDist;
                    const newScale = Math.min(Math.max(startScale * scaleFactor, 0.05), 10);
                    const deltaAng = currAng - startAngle;

                    activeObject.set({
                        scaleX: newScale,
                        scaleY: newScale,
                        angle: startObjAngle + deltaAng
                    });
                    activeObject.setCoords();
                    canvas.requestRenderAll();
                } else {
                    isGestureActive = false;
                }
            };

            const handleTouchEnd = (e: TouchEvent) => {
                if (isGestureActive) {
                    isGestureActive = false;
                    canvas.fire('object:modified', { target: canvas.getActiveObject() });
                }
            };

            upperCanvasEl.addEventListener('touchstart', handleTouchStart, { passive: false });
            upperCanvasEl.addEventListener('touchmove', handleTouchMove, { passive: false });
            upperCanvasEl.addEventListener('touchend', handleTouchEnd, { passive: false });
        }

        syncHistoryState([], -1);

        // Immediately fit to container to prevent "big" flash
        fitCanvasToContainer();

        // --- Event Listeners ---
        canvas.on('selection:created', (e) => {
            if (e.selected && e.selected.length > 0) {
                setSelectedObject(e.selected[0]);

                const objType = e.selected[0].type;
                const isText = objType === 'i-text' || objType === 'text';
                const isImage = objType === 'image';

                // Open property bar for Text OR Image
                setShowMobilePropertyBar(isText || isImage);

                if (isText) {
                    // @ts-ignore
                    setTextValue(e.selected[0].text || '');
                    setActiveMobileSubMenu('edit'); // Default to Edit tab on selection
                } else if (isImage) {
                    // [PPBears] 每次選到圖片都強制套用（修復 Undo/Redo 後控制點復活）
                    enforceImageUniformScaling(e.selected[0] as any);
                    setActiveMobileSubMenu('image');
                }
                updateToolbar();
            }
        });
        canvas.on('selection:updated', (e) => {
            // Handle Multi-Selection
            const activeObj = canvas.getActiveObject();
            if (activeObj) {
                setSelectedObject(activeObj);

                // Only open property bar if single object selected
                if (activeObj.type !== 'activeSelection') {
                    const objType = activeObj.type;
                    const isText = objType === 'i-text' || objType === 'text';
                    const isImage = objType === 'image';

                    setShowMobilePropertyBar(isText || isImage);

                    if (isText) {
                        // @ts-ignore
                        setTextValue(activeObj.text || '');
                    } else if (isImage) {
                        // [PPBears] 每次選到圖片都強制套用（修復 Undo/Redo 後控制點復活）
                        enforceImageUniformScaling(activeObj as any);
                        setActiveMobileSubMenu('image');
                    }
                } else {
                    // Hide property bar for multi-selection for now (or show common props)
                    setShowMobilePropertyBar(false);
                }
                updateToolbar();
            }
        });

        // Removed mouse:down listener that re-opened the bar

        canvas.on('selection:cleared', () => {
            setSelectedObject(null);
            setShowToolbar(false);
        });

        canvas.on('mouse:dblclick', (e) => {
            if (e.target && e.target instanceof FabricImage && e.target.clipPath) {
                toggleCropModeRef.current();
            }
        });

        canvas.on('object:moving', updateToolbar);
        canvas.on('object:scaling', updateToolbar);
        canvas.on('object:rotating', updateToolbar);
        canvas.on('object:resizing', updateToolbar);

        // Sync Frame ClipPaths & Rotation
        const handleSyncWrapper = (e: any) => {
            // Initialize prev coords/angle on start of interaction
            if (e.target) {
                if ((e.target as any)._prevLeft === undefined) {
                    (e.target as any)._prevLeft = e.target.left;
                    (e.target as any)._prevTop = e.target.top;
                    (e.target as any)._prevAngle = e.target.angle;
                }
            }
            handleFrameSync(e);

            // 3. ActiveSelection Moved -> Sync ClipPaths for any contained objects
            const obj = e.target;
            if (obj && obj.type === 'activeSelection') {
                const activeSel = obj as ActiveSelection;
                activeSel.getObjects().forEach(innerObj => {
                    // Sync absolute ClipPath (Hole) to innerObj's new absolute position
                    if (innerObj.clipPath && innerObj.clipPath.absolutePositioned) {
                        const matrix = innerObj.calcTransformMatrix();
                        const options = util.qrDecompose(matrix);

                        innerObj.clipPath.set({
                            left: options.translateX,
                            top: options.translateY,
                            scaleX: options.scaleX,
                            scaleY: options.scaleY,
                            angle: options.angle,
                            skewX: options.skewX,
                            skewY: options.skewY,
                        });
                        innerObj.clipPath.setCoords();
                    }

                    // If Frame is in selection, but Photo is NOT... (same logic as before)
                    if ((innerObj as any).isFrameLayer) {
                        const photos = canvas.getObjects().filter(o => (o as any).frameId === (innerObj as any).id);
                        photos.forEach(photo => {
                            if (!activeSel.getObjects().includes(photo)) {
                                const isLocked = (photo as any).isCropLocked !== false;
                                if (isLocked) {
                                    // Frame moved, Photo didn't. 
                                    // We should sync ClipPath at least.
                                    if (photo.clipPath && photo.clipPath.absolutePositioned) {
                                        const matrix = innerObj.calcTransformMatrix();
                                        const options = util.qrDecompose(matrix);

                                        // Apply stored offset
                                        const frameOffsetX = (photo.clipPath as any).frameOffsetX || 0;
                                        const frameOffsetY = (photo.clipPath as any).frameOffsetY || 0;

                                        const offsetVec = rotateVector(
                                            frameOffsetX * options.scaleX,
                                            frameOffsetY * options.scaleY,
                                            options.angle
                                        );

                                        photo.clipPath.set({
                                            left: options.translateX + offsetVec.x,
                                            top: options.translateY + offsetVec.y,
                                            scaleX: options.scaleX,
                                            scaleY: options.scaleY,
                                            angle: options.angle,
                                            skewX: options.skewX,
                                            skewY: options.skewY,
                                        });
                                        photo.clipPath.setCoords();
                                        photo.dirty = true;
                                    }
                                }
                            }
                        });
                    }
                });
            }
        };

        canvas.on('object:moving', handleSyncWrapper);
        canvas.on('object:rotating', handleSyncWrapper);
        canvas.on('object:scaling', handleSyncWrapper);

        canvas.on('mouse:down', (e) => {
            if (e.target) {
                (e.target as any)._prevLeft = e.target.left;
                (e.target as any)._prevTop = e.target.top;
            }
        });
        canvas.on('object:scaling', handleFrameSync);
        canvas.on('object:rotating', handleFrameSync);
        canvas.on('object:resizing', handleFrameSync);

        canvas.on('selection:created', () => {
            // Handle Multi-Selection
            const activeObj = canvas.getActiveObject();
            if (activeObj) {
                setSelectedObject(activeObj);
            }
            updateToolbar();
            updateLayers();
        });
        canvas.on('selection:updated', () => { updateToolbar(); updateLayers(); });
        canvas.on('selection:cleared', () => {
            updateToolbar();
            updateLayers();
        });

        canvas.on('object:added', () => {
            if (isHistoryProcessing.current) return;
            saveHistory();
            updateLayers();
        });

        canvas.on('object:modified', () => {
            if (isHistoryProcessing.current) return;
            // Use setTimeout to allow Fabric to finish all internal updates (coords, cache)
            setTimeout(() => {
                saveHistory();
                updateLayers();
            }, 0);
        });

        canvas.on('object:removed', () => {
            if (isHistoryProcessing.current) return;
            saveHistory();
            updateLayers();
        });

        saveHistory();
        updateLayers();

        // --- Content Initialization ---
        let isMounted = true;
        const CENTER_X = REAL_WIDTH / 2;
        const CENTER_Y = REAL_HEIGHT / 2;

        // --- Optimized Update Functions (Race-Condition Proof) ---

        // KEEPING LEGACY FUNCTIONS FOR SAFETY but modifying initLayers to use new one
        const updateBaseModel = async (url: string): Promise<void> => {
            // Token Guard
            const token = ++baseLoadToken;

            if (!fabricCanvas.current || !isMounted || isRestoring.current) return;
            const canvas = fabricCanvas.current;

            // 1. Mark latest request (Keep legacy ref)
            latestBaseUrlRef.current = url;

            // 2. Immediate Cleanup (Sync)
            if (activeBaseImageRef.current) {
                canvas.remove(activeBaseImageRef.current);
                activeBaseImageRef.current = null;
            }
            for (const obj of canvas.getObjects()) {
                if (isSystemLayer(obj, 'base')) canvas.remove(obj);
            }

            // 3. Async Load
            try {
                const el = await loadImageElement(url);

                if (token !== baseLoadToken) {
                    // console.log("Base image load superseded:", url);
                    return;
                }
                if (!isMounted || isRestoring.current) return;

                // 4. Create Fabric Image
                const img = new FabricImage(el);

                // 5. Final Safety Sweep
                for (const obj of canvas.getObjects()) {
                    if (isSystemLayer(obj, 'base')) canvas.remove(obj);
                }

                // 6. Setup Properties
                img.set({
                    selectable: false,
                    evented: false,
                    excludeFromExport: true,
                    // @ts-ignore
                    id: 'system_base_image',
                    isBaseLayer: true,
                    data: { systemId: 'system_base_image', role: TEMPLATE_ROLE, kind: 'product_base', system: true, isSystem: true }
                });

                img.scaleX = REAL_WIDTH / (img.width || 1);
                img.scaleY = REAL_HEIGHT / (img.height || 1);

                activeBaseImageRef.current = img;
                baseLayerRef.current = img;

                canvas.add(img);
                canvas.sendObjectToBack(img);

                // Re-position background layer if exists
                const bgObj = canvas.getObjects().find(o => getRole(o) === 'design_bg');
                if (bgObj) moveToDesignBgLayer(canvas, bgObj);

                // 7. Stabilize
                await centerAndStabilize(canvas, img, CENTER_X, CENTER_Y, () => {
                    if (!isMounted || !canvas) return;
                    // Ensure z-index again in case of drift, though unlikely
                    const bgObj2 = canvas.getObjects().find(o => getRole(o) === 'design_bg');
                    if (bgObj2) moveToDesignBgLayer(canvas, bgObj2);
                });

            } catch (e) {
                if (token === baseLoadToken) {
                    console.error("Failed to load base image", e);
                    addFallbackBase(canvas, CENTER_X, CENTER_Y);
                }
            }
        };

        const updateMaskModel = async (url: string): Promise<void> => {
            // Token Guard
            const token = ++maskLoadToken;

            if (!fabricCanvas.current || !isMounted || isRestoring.current) return;
            const canvas = fabricCanvas.current;

            // 1. Mark latest request
            latestMaskUrlRef.current = url;

            // 2. Immediate Cleanup (Sync)
            if (activeMaskImageRef.current) {
                canvas.remove(activeMaskImageRef.current);
                activeMaskImageRef.current = null;
            }
            for (const obj of canvas.getObjects()) {
                if (isSystemLayer(obj, 'mask')) canvas.remove(obj);
            }

            // 3. Async Load
            try {
                const el = await loadImageElement(url);

                if (token !== maskLoadToken) {
                    // console.log("Mask image load superseded:", url);
                    return;
                }
                if (!isMounted || isRestoring.current) return;

                const img = new FabricImage(el);

                // 5. Final Safety Sweep
                for (const obj of canvas.getObjects()) {
                    if (isSystemLayer(obj, 'mask')) canvas.remove(obj);
                }

                // 6. Setup & Add
                img.set({
                    selectable: false,
                    evented: false,
                    excludeFromExport: true,
                    // @ts-ignore
                    id: 'system_mask_image',
                    isMaskLayer: true,
                    data: { systemId: 'system_mask_image', role: TEMPLATE_ROLE, kind: 'product_overlay', system: true, isSystem: true }
                });
                img.scaleX = REAL_WIDTH / (img.width || 1);
                img.scaleY = REAL_HEIGHT / (img.height || 1);

                activeMaskImageRef.current = img;
                maskLayerRef.current = img;

                canvas.add(img);
                canvas.bringObjectToFront(img);

                const bgObj = canvas.getObjects().find(o => getRole(o) === 'design_bg');
                if (bgObj) moveToDesignBgLayer(canvas, bgObj);

                // 7. Stabilize
                await centerAndStabilize(canvas, img, CENTER_X, CENTER_Y, () => {
                    if (!isMounted || !canvas) return;
                    // Ensure z-index again in case of drift
                    const bgObj2 = canvas.getObjects().find(o => getRole(o) === 'design_bg');
                    if (bgObj2) moveToDesignBgLayer(canvas, bgObj2);
                });

            } catch (e) {
                if (token === maskLoadToken) {
                    console.error("Failed to load mask image", e);
                    addFallbackMask(canvas, CENTER_X, CENTER_Y);
                }
            }
        };

        const loadDraftUserObjects = async (draftKey: string, seq: number) => {
            if (!isMounted || isRestoring.current) return;
            if (seq !== enterSeqRef.current) return;

            console.log('[DRAFT] load start', { seq, ts: Date.now(), draftKey });
            try {
                const draft = await getDraft(draftKey);
                const currentPid = searchParams.get('productId') || currentProduct?.id;

                if (!draft || draft.context.productId !== currentPid) {
                    console.log('[DRAFT] skip (no draft or pid mismatch)', { seq, hasDraft: !!draft, currentPid, draftPid: draft?.context?.productId });
                    return;
                }

                isRestoringDraft.current = true;

                if (draft.canvasJson && Array.isArray(draft.canvasJson.objects)) {
                    const baseFinal = templateFinalSrcRef.current?.baseFinal || '';
                    const maskFinal = templateFinalSrcRef.current?.maskFinal || '';

                    const stripV = (u: string) => {
                        const url = String(u || '').trim();
                        if (!url) return url;
                        const low = url.toLowerCase();
                        if (low.startsWith('data:') || low.startsWith('blob:')) return url;
                        try {
                            const parsed = new URL(url, window.location.origin);
                            parsed.searchParams.delete('v');
                            return parsed.toString();
                        } catch {
                            return url.replace(/([?&])v=[^&]*(&?)/, (m, p1, p2) => (p1 === '?' && p2 ? '?' : p1 === '?' ? '' : p2 ? p1 : ''));
                        }
                    };

                    const isTemplateSrc = (src: any) => {
                        const s = String(src || '').trim();
                        if (!s) return false;
                        const s0 = stripV(s);
                        const b0 = stripV(baseFinal);
                        const m0 = stripV(maskFinal);
                        if (b0 && s0 === b0) return true;
                        if (m0 && s0 === m0) return true;
                        if (s.includes('/storage/v1/object/public/models/')) return true;
                        return false;
                    };

                    const isSystemDraftJsonObject = (o: any) => {
                        if (!o) return true;
                        const sid = String(o.data?.systemId || o.id || '').trim();
                        const kind = o.data?.kind;
                        const role = o.data?.role;
                        if (o.excludeFromExport === true) return true;
                        if (o.data?.isSystem === true) return true;
                        if (sid.startsWith('system_')) return true;
                        if (['system_base_image', 'system_mask_image', 'system_template_group'].includes(sid)) return true;
                        if (['product_base', 'product_overlay', 'guide'].includes(kind)) return true;
                        if (role === TEMPLATE_ROLE || role === 'product_base' || role === 'product_overlay') return true;
                        if (o.isBaseLayer === true || o.isMaskLayer === true) return true;
                        if (o.type === 'image' && isTemplateSrc(o.src)) return true;
                        return false;
                    };

                    const rawObjects = draft.canvasJson.objects;
                    const filteredRawObjects = rawObjects.filter((o: any) => !isSystemDraftJsonObject(o));
                    console.log('[DRAFT] filter', { seq, before: rawObjects.length, after: filteredRawObjects.length, dropped: rawObjects.length - filteredRawObjects.length });

                    removeAllUserObjects(canvas);

                    const objects = await util.enlivenObjects(filteredRawObjects);
                    let added = 0;
                    objects.forEach((obj: any) => {
                        if (isSystemRuntimeObject(obj)) return;

                        ensureObjectId(obj);
                        canvas.add(obj);
                        added += 1;
                    });

                    if (draft.extraState) {
                        if (draft.extraState.zoom) canvas.setZoom(draft.extraState.zoom);
                        if (draft.extraState.pan) {
                            const vpt = canvas.viewportTransform;
                            if (vpt) {
                                vpt[4] = draft.extraState.pan.x;
                                vpt[5] = draft.extraState.pan.y;
                                canvas.setViewportTransform(vpt);
                            }
                        }
                    }

                    if (activeBaseImageRef.current) canvas.sendObjectToBack(activeBaseImageRef.current);
                    if (activeMaskImageRef.current) canvas.bringObjectToFront(activeMaskImageRef.current);

                    console.log('[DRAFT] load end', { seq, ts: Date.now(), added });
                } else {
                    console.log('[DRAFT] load end (no objects)', { seq, ts: Date.now() });
                }
            } catch (e) {
                console.error('[DRAFT] load failed', e);
                try { await removeDraft(draftKey); } catch { }
            } finally {
                isRestoringDraft.current = false;
            }
        };

        const initLayers = async () => {
            if (!isMounted || isRestoring.current) return;
            if (initOnceRef.current) return;
            initOnceRef.current = true;

            // Start initialization - lock history
            isHistoryProcessing.current = true;

            try {
                const seq = ++enterSeqRef.current;
                console.log('[ENTER] start', { seq, ts: Date.now() });

                if (enterInFlightRef.current) {
                    console.warn('[ENTER] in flight, superseding', { seq });
                }
                enterInFlightRef.current = true;

                // (1) Template first
                if (baseImage && maskImage) {
                    const productForTemplate = currentProduct || { id: 'unknown', updated_at: Date.now() };
                    await applyTemplateForProduct({
                        ...productForTemplate,
                        base_image: baseImage,
                        mask_image: maskImage
                    });
                } else {
                    // Don't create fallback rectangles during initialization!
                    // Fallbacks should only be created when actual image loading fails (in catch block)
                    // Just wait for product data to load, then apply template in next sequence
                    console.log('[ENTER] No base/mask URLs yet, skipping template application');
                    // if (!baseImage) addFallbackBase(canvas, CENTER_X, CENTER_Y);
                    // if (!maskImage) addFallbackMask(canvas, CENTER_X, CENTER_Y);
                }

                if (seq !== enterSeqRef.current) return;
                console.log('[ENTER] tpl done', { seq, ts: Date.now(), counts: getTemplateCounts(canvas) });

                // (2) Draft after template is stable
                const draftKey = getDraftKey();
                if (draftKey) {
                    await loadDraftUserObjects(draftKey, seq);
                } else {
                    console.log('[DRAFT] skip (draftKey null)', { seq, ts: Date.now() });
                }

                if (seq !== enterSeqRef.current) return;
                const finalDump = dumpCanvas(canvas, 'after_enter_final');
                const nonSystemList = (finalDump?.dump || []).filter((x: any) => {
                    const sid = x.systemId || x.id;
                    const kind = x.kind;
                    const isSystem = ['system_base_image', 'system_mask_image', 'system_template_group'].includes(sid) ||
                        ['product_base', 'product_overlay'].includes(kind);
                    return !isSystem;
                });
                console.log('[ENTER] after_enter_final nonSystem', { seq, count: nonSystemList.length, sample: nonSystemList.slice(0, 10) });

                canvas.requestRenderAll();
                restoreLocks(canvas);

                // Reset History - Lock Initial State
                // Use same toJSON props as saveHistory for consistency
                const initialJson = JSON.stringify((canvas as any).toJSON([
                    'id', 'selectable', 'evented', 'locked', 'excludeFromExport',
                    'isUserBackground', 'isBaseLayer', 'isMaskLayer', 'isFrameLayer', 'frameId', 'perPixelTargetFind',
                    'lockMovementX', 'lockMovementY', 'lockRotation', 'lockScalingX', 'lockScalingY',
                    'lockUniScaling', 'lockSkewingX', 'lockSkewingY', 'hasControls', 'hasBorders',
                    'hoverCursor', 'moveCursor', 'clipPath', 'visible', 'bgCornerRadius', 'padding', 'originX', 'originY'
                ]));
                syncHistoryState([initialJson], 0);
            } catch (error) {
                console.error("Layer initialization failed:", error);
            } finally {
                // Unlock history regardless of success/failure
                isHistoryProcessing.current = false;
                enterInFlightRef.current = false;
            }

            // Note: uploadedImage is handled by a separate useEffect to avoid duplication
            // if (uploadedImage) {
            //    addImageToCanvas(canvas, uploadedImage, CENTER_X, CENTER_Y);
            // }
        };

        initLayers();

        return () => {
            console.log("[NAV] CanvasEditor cleanup/unmount");
            isMounted = false;

            // [NAV] T3: Reset refs on unmount to prevent stale state in new canvas
            appliedTemplateKeyRef.current = null;
            templateApplyInFlightRef.current = false;
            templateLoadSeqRef.current++; // Invalidate any in-flight loads

            if (fabricCanvas.current) {
                fabricCanvas.current.dispose();
                fabricCanvas.current = null;
            }
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [applyTemplateForProduct, REAL_WIDTH, REAL_HEIGHT, CASE_RADIUS, baseImage, maskImage, offset.x, offset.y]); // REMOVED containerDimensions to prevent re-init on resize

    // 2. Resize Effect (Handles responsive layout without destroying canvas)
    useEffect(() => {
        fitCanvasToContainer();
    }, [containerDimensions, REAL_WIDTH, REAL_HEIGHT]);

    useEffect(() => {
        if (!activeTool || !fabricCanvas.current) return;

        const canvas = fabricCanvas.current;
        const CENTER_X = REAL_WIDTH / 2;
        const CENTER_Y = REAL_HEIGHT / 2;

        if (activeTool === 'Text') {
            if (!p.text) return;
            const text = new IText('Your Name', {
                left: CENTER_X,
                top: CENTER_Y,
                originX: 'center',
                originY: 'center',
                fontSize: 40,
                fill: '#000000',
                fontFamily: 'Arial',
                lockUniScaling: true, // Enforce uniform scaling
            });
            // Disable side controls to prevent stretching/distortion
            text.setControlsVisibility({
                mt: false,
                mb: false,
                ml: false,
                mr: false
            });
            const clipPath = new Rect({
                left: CENTER_X,
                top: CENTER_Y,
                originX: 'center',
                originY: 'center',
                width: REAL_WIDTH,
                height: REAL_HEIGHT,
                rx: CASE_RADIUS,
                ry: CASE_RADIUS,
                absolutePositioned: true,
            });
            text.clipPath = clipPath;
            (text as any).id = genId('text');
            canvas.add(text);
            canvas.setActiveObject(text);
            if (maskLayerRef.current) canvas.bringObjectToFront(maskLayerRef.current);
            canvas.renderAll();
            onToolUsed();
            setShowMobilePropertyBar(true); // Automatically open for NEW text
        } else if (activeTool.startsWith('AI:')) {
            if (!p.aiCartoon) return;
            const style = activeTool.split(':')[1];
            handleGenerateAI(style);
            onToolUsed();
        }
    }, [activeTool, REAL_WIDTH, REAL_HEIGHT, CASE_RADIUS]);

    const handleGenerateAI = async (style: string) => {
        const canvas = fabricCanvas.current;
        const activeObject = canvas?.getActiveObject();

        if (!canvas || !activeObject || !(activeObject instanceof FabricImage)) {
            alert("請先選取一張圖片");
            return;
        }
        setIsGenerating(true);
        try {
            // 1. Convert Canvas Object to Blob (Auto-handles HEIC -> PNG conversion)
            // We clone to get the raw image data without canvas transformations (scale/rotate)
            // but we want to respect the original image resolution.
            const clone = await activeObject.clone();

            // Reset transforms to get the "original-like" image content
            // Note: If user cropped, we might want to respect that? 
            // For now, let's send the full image content to ensure best AI quality
            clone.scaleX = 1;
            clone.scaleY = 1;
            clone.angle = 0;
            clone.skewX = 0;
            clone.skewY = 0;
            // Reset crop to ensure full image is sent? Or keep crop? 
            // Keeping crop is complex. Let's send the full underlying image source.
            // Fabric's toDataURL on object respects cropX/cropY.

            const dataUrl = clone.toDataURL({ format: 'png', multiplier: 1 });
            const res = await fetch(dataUrl);
            const blob = await res.blob();

            // 2. Validation & Pre-Compression
            let blobToSend = blob;

            // Thresholds
            const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10MB
            const COMPRESSION_THRESHOLD = 7 * 1024 * 1024; // 7MB
            const MAX_DIMENSION = 2500; // Client-side pre-resize limit

            if (blob.size > MAX_SIZE_BYTES) {
                throw new Error("圖片過大 (超過 10MB)，請先壓縮");
            }

            // Check if compression is needed (Size > 7MB or Large Dimensions)
            // We use a temp image to check dimensions
            const checkDimensions = async (b: Blob): Promise<{ width: number, height: number }> => {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.onload = () => resolve({ width: img.width, height: img.height });
                    img.src = URL.createObjectURL(b);
                });
            };

            const { width, height } = await checkDimensions(blob);
            const needsResize = width > MAX_DIMENSION || height > MAX_DIMENSION;
            const needsCompression = blob.size > COMPRESSION_THRESHOLD;

            if (needsResize || needsCompression) {
                // console.log(`[AI] Pre-compressing image. Size: ${(blob.size/1024/1024).toFixed(2)}MB, Dim: ${width}x${height}`);

                // Create a temporary canvas for resizing
                const tempCanvas = document.createElement('canvas');
                let newWidth = width;
                let newHeight = height;

                if (needsResize) {
                    const scale = Math.min(MAX_DIMENSION / width, MAX_DIMENSION / height);
                    newWidth = Math.round(width * scale);
                    newHeight = Math.round(height * scale);
                }

                tempCanvas.width = newWidth;
                tempCanvas.height = newHeight;
                const ctx = tempCanvas.getContext('2d');
                if (ctx) {
                    const imgBitmap = await createImageBitmap(blob);
                    ctx.drawImage(imgBitmap, 0, 0, newWidth, newHeight);

                    // Compress to JPEG 0.85 for efficiency if not removing BG, else PNG
                    const format = style === 'remove_bg' ? 'image/png' : 'image/jpeg';
                    const quality = style === 'remove_bg' ? 1.0 : 0.85;

                    blobToSend = await new Promise<Blob>((resolve, reject) => {
                        tempCanvas.toBlob(
                            (b) => b ? resolve(b) : reject(new Error("Compression failed")),
                            format,
                            quality
                        );
                    });
                    console.log(`[AI] Compressed to: ${(blobToSend.size / 1024 / 1024).toFixed(2)}MB`);
                }
            }

            // 3. Upload to Supabase Storage (New Flow)
            console.log('[AI] Uploading to Supabase Storage...');
            const timestamp = Date.now();
            const uploadPath = `temp/ai_input_${timestamp}.png`;

            // Ensure blobToSend is the right type
            const { data: uploadData, error: uploadError } = await supabase.storage
                .from('design-assets')
                .upload(uploadPath, blobToSend, {
                    contentType: 'image/png',
                    upsert: true
                });

            if (uploadError) {
                throw new Error(`Upload failed: ${uploadError.message}`);
            }

            const { data: { publicUrl } } = supabase.storage
                .from('design-assets')
                .getPublicUrl(uploadPath);

            if (!publicUrl) {
                throw new Error('Failed to get public URL for uploaded image');
            }

            console.log('[AI] Uploaded:', publicUrl);

            // 4. Determine Endpoint & Payload
            const path = style === 'remove_bg'
                ? '/api/ai/remove-bg'
                : '/api/ai/cartoon';

            const endpoint = apiUrl(path);

            // JSON Payload
            const payload: any = { imageUrl: publicUrl };
            if (style !== 'remove_bg') {
                payload.meta = { styleId: style };
            }

            if (import.meta.env.DEV) {
                console.log('[AI Debug] Calling API:', endpoint, payload);
            }

            // 5. Send Request (JSON)
            try {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(payload),
                    credentials: 'omit',
                    mode: 'cors',
                });

                // 6. Handle Response (Existing Logic)
                const responseText = await response.text();

                // Debug Headers
                const backendHeader = response.headers.get('x-ppbears-backend');
                console.log('[AI] endpoint=', endpoint, 'status=', response.status, 'x-backend=', backendHeader, 'body=', responseText.slice(0, 200));

                let result;
                try {
                    result = JSON.parse(responseText);
                } catch (e) {
                    // Not JSON - likely a server error page (500/404)
                    console.error('[AI] Non-JSON Response:', responseText);
                    throw new Error(`Server Error (${response.status}): ${responseText.slice(0, 200)} | x-backend:${backendHeader}`);
                }

                // Flexible URL extraction
                const outputUrl = result.url || result.imageUrl || result.image_url || result.outputUrl || result?.data?.url || result?.data?.imageUrl;

                if (!response.ok || !result.success || !outputUrl) {
                    console.error('[AI] API Error:', result);
                    const errorCode = result.errorCode || result.code || 'UNKNOWN';
                    const errorMessage = result.message || result.error || '未知錯誤';

                    const mapError = (code: string, msg: string) => {
                        if (code === 'FILE_TOO_LARGE') return '圖片太大 (超過 4MB)，請換小一點或自動壓縮';
                        if (code === 'MISSING_ENV') return '系統設定錯誤 (Missing ENV)，請聯繫管理員';
                        if (code === 'IMAGE_TOO_LARGE') return '圖片過大（超過 10MB），請換一張或先壓縮';
                        if (code === 'UPLOAD_FAILED') return '上傳失敗';
                        if (code === 'AI_TIMEOUT') return 'AI 處理超時，請稍後再試';

                        // Special handling for INVALID_OUTPUT
                        if (code === 'INVALID_OUTPUT') {
                            console.log('[AI Debug] INVALID_OUTPUT Response:', result);
                            return 'AI 回傳格式異常，請稍後再試；若持續發生請回報客服。';
                        }

                        // B2. New Explicit Error for success:true but missing url
                        if (result?.success === true && !outputUrl) {
                            return `後端回傳 success:true 但缺少 url（後端錯誤） | endpoint:${endpoint} | Status:${response.status} | x-backend:${backendHeader} | Body:${responseText.slice(0, 200)}`;
                        }

                        // Show status and snippet for debugging
                        return `處理失敗 (${code}): ${msg} | endpoint:${endpoint} | Status:${response.status} | x-backend:${backendHeader} | Body:${responseText.slice(0, 200)}`;
                    };
                    throw new Error(mapError(errorCode, errorMessage));
                }

                const outputImage = outputUrl;

                // B1. Only proceed with canvas modification if we have a valid outputImage
                await withHistoryTransaction(async () => {
                    const img = await FabricImage.fromURL(outputImage, { crossOrigin: 'anonymous' });
                    ensureObjectId(img, 'ai_generated');

                    img.set({
                        left: activeObject.left,
                        top: activeObject.top,
                        scaleX: activeObject.scaleX,
                        scaleY: activeObject.scaleY,
                        angle: activeObject.angle,
                        flipX: activeObject.flipX,
                        flipY: activeObject.flipY,
                        skewX: activeObject.skewX,
                        skewY: activeObject.skewY,
                        originX: activeObject.originX,
                        originY: activeObject.originY,
                        clipPath: activeObject.clipPath, // Preserve crop
                        data: { kind: 'user_image', source: 'ai' }
                    });

                    // If it was crop locked, preserve that
                    if ((activeObject as any).isCropLocked) {
                        (img as any).isCropLocked = true;
                        (img as any).hasClipPath = true;
                    }

                    // Replace in canvas
                    const idx = canvas.getObjects().indexOf(activeObject);
                    if (idx > -1) {
                        canvas.insertAt(idx, img);
                        canvas.remove(activeObject);
                        canvas.setActiveObject(img);
                    } else {
                        canvas.add(img);
                        canvas.remove(activeObject);
                        canvas.setActiveObject(img);
                    }
                });

                canvas.renderAll();

            } catch (error: any) {
                console.error("AI Generation Error:", error);
                if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
                    console.error('[AI] CORS/Network Error Details:', {
                        endpoint,
                        origin: window.location.origin,
                        hint: 'Check CORS, CSP, or if the server is down.'
                    });
                    alert(`AI 連線失敗 (CORS/Network Error): 請檢查網路或稍後再試。`);
                } else {
                    alert(`AI 處理失敗: ${error.message}`);
                }
            }
            // B1. Do NOT reset canvas or template here.
        } finally {
            setIsGenerating(false);
        }
    };

    const addFallbackBase = (canvas: Canvas, cx: number, cy: number) => {
        // SINGLETON PATTERN: Clean BEFORE Add
        // (We duplicate logic or move helper outside? Helper is inside useEffect scope currently.)
        // Let's manually clean here for now or move helper up. 
        // Moving helper up is cleaner but requires refactoring. 
        // For minimal diff, I will just implement the same robust clean here.

        const objects = canvas.getObjects();
        const layersToRemove = objects.filter(obj => {
            const isTagged = (obj as any).id === 'system_base_image' || (obj as any).isBaseLayer;
            const isFallback = obj.type === 'rect' && !obj.selectable && !obj.evented &&
                (obj.fill === '#e5e7eb' || obj.fill === 'rgba(229, 231, 235, 1)');
            return isTagged || isFallback;
        });
        layersToRemove.forEach(obj => canvas.remove(obj));

        const baseLayer = new Rect({
            left: cx,
            top: cy,
            originX: 'center',
            originY: 'center',
            width: REAL_WIDTH,
            height: REAL_HEIGHT,
            rx: CASE_RADIUS,
            ry: CASE_RADIUS,
            fill: '#e5e7eb',
            selectable: false,
            evented: false,
            excludeFromExport: true,
            // @ts-ignore
            id: 'system_base_image',
            isBaseLayer: true,
            data: { systemId: 'system_base_image', role: TEMPLATE_ROLE, system: true, isSystem: true, kind: 'product_base' },
            shadow: new Shadow({
                color: 'rgba(0,0,0,0.2)',
                blur: 20,
                offsetX: 10,
                offsetY: 10,
            }),
        });
        baseLayerRef.current = baseLayer;
        canvas.add(baseLayer);
        canvas.sendObjectToBack(baseLayer);
    };

    const addFallbackMask = (canvas: Canvas, cx: number, cy: number) => {
        // SINGLETON PATTERN: Clean BEFORE Add
        const objects = canvas.getObjects();
        const layersToRemove = objects.filter(obj => {
            const isTagged = (obj as any).id === 'system_mask_image' || (obj as any).isMaskLayer;
            const isFallback = obj.type === 'rect' && !obj.selectable && !obj.evented &&
                (obj.fill === '#4b5563' || obj.fill === 'rgba(75, 85, 99, 1)');
            return isTagged || isFallback;
        });
        layersToRemove.forEach(obj => canvas.remove(obj));

        const cameraBump = new Rect({
            left: cx - REAL_WIDTH / 2 + 20,
            top: cy - REAL_HEIGHT / 2 + 20,
            width: 100,
            height: 100,
            rx: 20,
            ry: 20,
            fill: '#4b5563',
            selectable: false,
            evented: false,
            excludeFromExport: true,
            // @ts-ignore
            id: 'system_mask_image',
            isMaskLayer: true,
            data: { systemId: 'system_mask_image', role: TEMPLATE_ROLE, system: true, isSystem: true, kind: 'product_overlay' }
        });
        maskLayerRef.current = cameraBump;
        canvas.add(cameraBump);
    };

    const addImageToCanvas = async (canvas: Canvas, imageUrl: string, cx: number, cy: number, extraData: any = {}) => {
        await withHistoryTransaction(async () => {
            try {
                const img = await FabricImage.fromURL(imageUrl, { crossOrigin: 'anonymous' });
                ensureObjectId(img, 'img');

                // --- ClipPath Logic ---
                let clipPath: FabricObject;

                // @ts-ignore
                if (previewConfig?.clipMaskImage) {
                    // @ts-ignore
                    const maskImg = await FabricImage.fromURL(previewConfig.clipMaskImage, { crossOrigin: 'anonymous' });
                    maskImg.set({
                        left: cx,
                        top: cy,
                        originX: 'center',
                        originY: 'center',
                        absolutePositioned: true,
                        selectable: false,
                        evented: false
                    });

                    const scaleX = REAL_WIDTH / (maskImg.width || 1);
                    const scaleY = REAL_HEIGHT / (maskImg.height || 1);
                    const scale = Math.max(scaleX, scaleY);

                    maskImg.scaleX = scale;
                    maskImg.scaleY = scale;

                    clipPath = maskImg;
                } else {
                    clipPath = new Rect({
                        left: cx,
                        top: cy,
                        originX: 'center',
                        originY: 'center',
                        width: REAL_WIDTH,
                        height: REAL_HEIGHT,
                        rx: CASE_RADIUS,
                        ry: CASE_RADIUS,
                        absolutePositioned: true,
                    });
                }

                img.set({
                    left: cx,
                    top: cy,
                    originX: 'center',
                    originY: 'center',
                    clipPath: clipPath,
                    lockUniScaling: true,
                    data: { kind: 'user_image', source: 'upload', ...extraData }
                });
                img.setControlsVisibility({
                    mt: false,
                    mb: false,
                    ml: false,
                    mr: false
                });

                // [PPBears] 最終一槍：新增圖片當下也強制等比 + 禁止拉伸 
                // （避免某些手機/某些 Fabric 狀態仍出現非等比）
                // @ts-ignore (enforceImageUniformScaling 在 useEffect scope，這裡同檔案可見即可)
                // NOTE: This will FAIL at runtime if addImageToCanvas is called outside of the useEffect scope where enforceImageUniformScaling is defined.
                // HOWEVER, based on the user request "don't split, don't change other files", I must paste it.
                // To make it work, I must move enforceImageUniformScaling OUTSIDE useEffect or duplicate it.
                // BUT the user said "enforceImageUniformScaling 在 useEffect scope". This implies they think it's visible.
                // If I paste it as requested, it will break.
                // I will define enforceImageUniformScaling again here locally to satisfy the requirement without breaking the app.
                const enforceImageUniformScalingLocal = (obj: any) => {
                    if (!obj || obj.type !== 'image') return;
                    if ((obj as any).isBaseLayer || (obj as any).isMaskLayer) return;
                    obj.set({
                        lockUniScaling: true,
                        lockSkewingX: true,
                        lockSkewingY: true,
                        lockScalingFlip: true,
                    });
                    if (typeof obj.setControlsVisibility === 'function') {
                        obj.setControlsVisibility({ mt: false, mb: false, ml: false, mr: false });
                    }
                    obj.setCoords?.();
                };
                enforceImageUniformScalingLocal(img as any);

                if (img.width && img.width > REAL_WIDTH) {
                    img.scaleToWidth(REAL_WIDTH);
                }
                canvas.add(img);

                const objects = canvas.getObjects();
                const frames = objects.filter(o => (o as any).isFrameLayer);
                frames.forEach(frame => canvas.bringObjectToFront(frame));

                canvas.setActiveObject(img);
                if (maskLayerRef.current) canvas.bringObjectToFront(maskLayerRef.current);
                canvas.renderAll();
            } catch (err) {
                console.error("Error re-adding image", err);
            }
        });
    };

    useEffect(() => {
        if (!fabricCanvas.current) return;
        const canvas = fabricCanvas.current;

        // Always clear previous prop-uploaded image if it exists
        const prevImg = canvas.getObjects().find(o => (o as any).data?.isPropUploaded === true);
        if (prevImg) {
            canvas.remove(prevImg);
            canvas.requestRenderAll();
        }

        if (!uploadedImage) return;

        const cx = REAL_WIDTH / 2;
        const cy = REAL_HEIGHT / 2;
        addImageToCanvas(canvas, uploadedImage, cx, cy, { isPropUploaded: true });
    }, [uploadedImage, REAL_WIDTH, REAL_HEIGHT]);

    const updateSelectedObject = (key: string, value: any) => {
        if (!fabricCanvas.current || !selectedObject) return;
        selectedObject.set(key, value);
        fabricCanvas.current.renderAll();
        saveHistory();
    };

    const deleteSelected = () => {
        if (!fabricCanvas.current || !selectedObject) return;
        fabricCanvas.current.remove(selectedObject);
        fabricCanvas.current.discardActiveObject();
        fabricCanvas.current.renderAll();
        setSelectedObject(null);
        saveHistory();
    };

    const duplicateObject = () => {
        const canvas = fabricCanvas.current;
        const activeObject = canvas?.getActiveObject();
        if (!canvas || !activeObject) return;

        withHistoryTransaction(async () => {
            const cloned: any = await activeObject.clone();
            const reId = (obj: any) => {
                const t = obj?.type || 'obj';
                if (t === 'image') ensureObjectId(obj, 'img');
                else if (t === 'i-text' || t === 'text') ensureObjectId(obj, 'text');
                else ensureObjectId(obj, 'obj');
            };

            canvas.discardActiveObject();

            if (cloned.type === 'activeSelection') {
                cloned.canvas = canvas;
                const objs: any[] = [];
                (cloned as any).forEachObject((obj: any) => {
                    reId(obj);
                    obj.set({ left: (obj.left || 0) + 10, top: (obj.top || 0) + 10, evented: true });
                    canvas.add(obj);
                    objs.push(obj);
                });
                const sel = new ActiveSelection(objs, { canvas });
                canvas.setActiveObject(sel);
            } else {
                reId(cloned);
                cloned.set({
                    left: (cloned.left || 0) + 10,
                    top: (cloned.top || 0) + 10,
                    evented: true,
                });
                canvas.add(cloned);
                canvas.setActiveObject(cloned);
            }
            canvas.requestRenderAll();
        });
    };

    const flipObject = () => {
        const canvas = fabricCanvas.current;
        const activeObject = canvas?.getActiveObject();
        if (!canvas || !activeObject) return;

        activeObject.set('flipX', !activeObject.flipX);
        canvas.requestRenderAll();
        saveHistory();
    };

    const centerObject = () => {
        const canvas = fabricCanvas.current;
        const activeObject = canvas?.getActiveObject();
        if (!canvas || !activeObject) return;

        activeObject.set({
            left: REAL_WIDTH / 2,
            top: REAL_HEIGHT / 2,
            originX: 'center',
            originY: 'center'
        });
        activeObject.setCoords();
        if (maskLayerRef.current) {
            canvas.bringObjectToFront(maskLayerRef.current);
        }
        canvas.requestRenderAll();
        saveHistory();
    };

    const toggleFillCanvas = () => {
        const canvas = fabricCanvas.current;
        const activeObject = canvas?.getActiveObject();
        if (!canvas || !activeObject) return;

        // Check if maximized
        if ((activeObject as any).isMaximized) {
            // RESTORE
            const prevState = (activeObject as any)._preMaxState;
            if (prevState) {
                activeObject.set({
                    scaleX: prevState.scaleX,
                    scaleY: prevState.scaleY,
                    left: prevState.left,
                    top: prevState.top,
                    angle: prevState.angle,
                    originX: prevState.originX,
                    originY: prevState.originY
                });
            } else {
                // Fallback
                activeObject.scaleToWidth(REAL_WIDTH * 0.5);
                activeObject.set({
                    left: REAL_WIDTH / 2,
                    top: REAL_HEIGHT / 2,
                    originX: 'center',
                    originY: 'center'
                });
                activeObject.setCoords();
            }
            (activeObject as any).isMaximized = false;
        } else {
            // MAXIMIZE
            // Save state first
            (activeObject as any)._preMaxState = {
                scaleX: activeObject.scaleX,
                scaleY: activeObject.scaleY,
                left: activeObject.left,
                top: activeObject.top,
                angle: activeObject.angle,
                originX: activeObject.originX,
                originY: activeObject.originY
            };

            const scaleX = REAL_WIDTH / (activeObject.width || 1);
            const scaleY = REAL_HEIGHT / (activeObject.height || 1);
            const scale = Math.max(scaleX, scaleY);

            activeObject.scale(scale);
            activeObject.set({
                left: REAL_WIDTH / 2,
                top: REAL_HEIGHT / 2,
                originX: 'center',
                originY: 'center',
                angle: 0
            });
            (activeObject as any).isMaximized = true;
        }

        activeObject.setCoords();

        if (maskLayerRef.current) {
            canvas.bringObjectToFront(maskLayerRef.current);
        }

        canvas.requestRenderAll();
        saveHistory();
        // Force UI update
        updateToolbar();
    };

    const toggleCropMode = () => {
        const canvas = fabricCanvas.current;
        // Use selectedObject as fallback if activeObject is lost (common on mobile)
        const activeObject = canvas?.getActiveObject() || selectedObject;

        if (!canvas || !activeObject || !activeObject.clipPath) return;

        // Ensure the object is active on canvas if we recovered it from state
        if (canvas.getActiveObject() !== activeObject) {
            canvas.setActiveObject(activeObject);
        }

        const isCurrentlyLocked = (activeObject as any).isCropLocked !== false;
        const newLockedState = !isCurrentlyLocked;
        (activeObject as any).isCropLocked = newLockedState;

        // For Frame-linked photos, we ONLY toggle the lock state.
        // The clipPath MUST remain AbsolutePositioned to match the Frame Overlay.
        if ((activeObject as any).frameId) {
            setIsCropping(!newLockedState);
            activeObject.dirty = true;
            canvas.requestRenderAll();
            saveHistory();
            return;
        }

        const clipPath = activeObject.clipPath;
        const toRad = (deg: number) => (deg * Math.PI) / 180;
        const isAbs = clipPath.absolutePositioned;

        if (isAbs) {
            const oCenter = activeObject.getCenterPoint();
            const oAngle = activeObject.angle;
            const oScaleX = activeObject.scaleX || 1;
            const oScaleY = activeObject.scaleY || 1;
            const cLeft = clipPath.left || 0;
            const cTop = clipPath.top || 0;
            const cAngle = clipPath.angle || 0;
            const cScaleX = clipPath.scaleX || 1;
            const cScaleY = clipPath.scaleY || 1;

            const dx = cLeft - oCenter.x;
            const dy = cTop - oCenter.y;
            const rRad = -toRad(oAngle);
            const rCos = Math.cos(rRad);
            const rSin = Math.sin(rRad);

            const relX = (dx * rCos - dy * rSin) / oScaleX;
            const relY = (dx * rSin + dy * rCos) / oScaleY;
            const relAngle = cAngle - oAngle;
            const relScaleX = cScaleX / oScaleX;
            const relScaleY = cScaleY / oScaleY;

            clipPath.set({
                left: relX,
                top: relY,
                angle: relAngle,
                scaleX: relScaleX,
                scaleY: relScaleY,
                absolutePositioned: false
            });
            setIsCropping(false);
        } else {
            const oCenter = activeObject.getCenterPoint();
            const oAngle = activeObject.angle;
            const oScaleX = activeObject.scaleX || 1;
            const oScaleY = activeObject.scaleY || 1;
            const relLeft = clipPath.left || 0;
            const relTop = clipPath.top || 0;
            const relAngle = clipPath.angle || 0;
            const relScaleX = clipPath.scaleX || 1;
            const relScaleY = clipPath.scaleY || 1;

            const scaledRelX = relLeft * oScaleX;
            const scaledRelY = relTop * oScaleY;
            const rRad = toRad(oAngle);
            const rCos = Math.cos(rRad);
            const rSin = Math.sin(rRad);

            const absDx = scaledRelX * rCos - scaledRelY * rSin;
            const absDy = scaledRelX * rSin + scaledRelY * rCos;
            const absLeft = oCenter.x + absDx;
            const absTop = oCenter.y + absDy;
            const absAngle = oAngle + relAngle;
            const absScaleX = oScaleX * relScaleX;
            const absScaleY = oScaleY * relScaleY;

            clipPath.set({
                left: absLeft,
                top: absTop,
                angle: absAngle,
                scaleX: absScaleX,
                scaleY: absScaleY,
                absolutePositioned: true
            });
            setIsCropping(true);
        }

        activeObject.dirty = true;
        canvas.requestRenderAll();
    };

    const moveLayerUp = () => {
        const canvas = fabricCanvas.current;
        const activeObject = canvas?.getActiveObject();
        if (!canvas || !activeObject) return;

        if (typeof canvas.bringObjectForward === 'function') {
            canvas.bringObjectForward(activeObject);
        } else {
            const objects = canvas.getObjects();
            const index = objects.indexOf(activeObject);
            if (index < objects.length - 1) {
                canvas.moveObjectTo(activeObject, index + 1);
            }
        }
        if (maskLayerRef.current) {
            canvas.bringObjectToFront(maskLayerRef.current);
        }
        canvas.requestRenderAll();
        saveHistory();
    };

    const moveLayerDown = () => {
        const canvas = fabricCanvas.current;
        const activeObject = canvas?.getActiveObject();
        if (!canvas || !activeObject) return;

        if (typeof canvas.sendObjectBackwards === 'function') {
            canvas.sendObjectBackwards(activeObject);
        } else {
            const objects = canvas.getObjects();
            const index = objects.indexOf(activeObject);
            if (index > 0) {
                canvas.moveObjectTo(activeObject, index - 1);
            }
        }
        if (baseLayerRef.current) {
            canvas.sendObjectToBack(baseLayerRef.current);
        }
        canvas.requestRenderAll();
        saveHistory();
    };

    const alignCanvas = (alignment: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom') => {
        const canvas = fabricCanvas.current;
        const activeObject = canvas?.getActiveObject();
        if (!canvas || !activeObject) return;

        const w = REAL_WIDTH;
        const h = REAL_HEIGHT;
        const objW = activeObject.getScaledWidth();
        const objH = activeObject.getScaledHeight();

        if (alignment === 'left') {
            // Ensure we respect the current origin or force center
            if (activeObject.originX === 'center') {
                activeObject.set({ left: objW / 2 });
            } else {
                activeObject.set({ left: 0 });
            }
        } else if (alignment === 'center') {
            activeObject.set({ left: w / 2, originX: 'center' });
        } else if (alignment === 'right') {
            if (activeObject.originX === 'center') {
                activeObject.set({ left: w - objW / 2 });
            } else {
                activeObject.set({ left: w - objW });
            }
        } else if (alignment === 'top') {
            if (activeObject.originY === 'center') {
                activeObject.set({ top: objH / 2 });
            } else {
                activeObject.set({ top: 0 });
            }
        } else if (alignment === 'middle') {
            activeObject.set({ top: h / 2, originY: 'center' });
        } else if (alignment === 'bottom') {
            if (activeObject.originY === 'center') {
                activeObject.set({ top: h - objH / 2 });
            } else {
                activeObject.set({ top: h - objH });
            }
        }

        activeObject.setCoords();
        canvas.requestRenderAll();
        saveHistory();
    };

    toggleCropModeRef.current = toggleCropMode;

    // Apply brightness filter to selected image
    const applyBrightness = (value: number) => {
        const canvas = fabricCanvas.current;
        const obj = selectedObject;
        if (!canvas || !obj || obj.type !== 'image') return;
        const img = obj as FabricImage;
        // Find existing brightness filter or create new one
        const existingFilterIdx = (img.filters || []).findIndex((f: any) => f.type === 'Brightness');
        const brightnessFilter = new fabricFilters.Brightness({ brightness: value });
        if (existingFilterIdx >= 0) {
            img.filters[existingFilterIdx] = brightnessFilter;
        } else {
            img.filters = [...(img.filters || []), brightnessFilter];
        }
        img.applyFilters();
        canvas.requestRenderAll();
    };

    const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();

        const files = e.dataTransfer.files;
        if (files && files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = async (f) => {
                    const dataUrl = f.target?.result as string;
                    if (dataUrl) await handleInsertImageFromSrc(dataUrl);
                };
                reader.readAsDataURL(file);
            }
        }
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'copy';
    };

    return (
        <div className="relative h-full w-full flex flex-col md:flex-row overflow-hidden">
            {/* Clear Confirm Modal */}
            {showClearConfirm && (
                <div className="absolute inset-0 z-[200] bg-black/50 flex flex-col items-center justify-center backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
                        <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4 text-red-600">
                            <Eraser className="w-6 h-6" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900 mb-2">確定要清空設計嗎？</h3>
                        <p className="text-sm text-gray-500 mb-6">這將會清除您在畫布上的所有設計，且<span className="font-semibold text-red-500">無法復原</span>。確定要繼續嗎？</p>
                        <div className="flex gap-3 w-full">
                            <button
                                onClick={() => setShowClearConfirm(false)}
                                className="flex-1 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold rounded-xl transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={confirmClearCanvas}
                                className="flex-1 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl shadow-sm shadow-red-200 transition-colors"
                            >
                                確定清空
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Template Loading Overlay (Prevents Flash) */}
            {isTemplateLoading && (
                <div className="absolute inset-0 z-50 bg-white/80 flex items-center justify-center backdrop-blur-sm">
                    {/* Full opacity white to mask the canvas clearing/redrawing */}
                    <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
                </div>
            )}

            {/* Loading Overlay */}
            {isGenerating && (
                <div className="absolute inset-0 z-50 bg-white/80 flex flex-col items-center justify-center backdrop-blur-sm">
                    <Loader2 className="w-12 h-12 text-purple-600 animate-spin mb-4" />
                    <h3 className="text-xl font-semibold text-gray-800">正在施展 AI 魔法...</h3>
                    <p className="text-gray-500">正在轉換您的圖片風格</p>
                </div>
            )}

            {/* Canvas Area */}
            <div
                ref={containerRef}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="flex-1 flex flex-col md:flex-row items-center justify-start md:justify-center bg-[radial-gradient(circle_at_center,_#ffffff_0%,_#d1d5db_100%)] px-4 pb-32 pt-24 md:p-4 overflow-y-auto md:overflow-hidden relative order-first md:order-none"
            >
                <div
                    className={`shadow-2xl rounded-lg overflow-hidden bg-white max-w-full max-h-full transition-opacity duration-300 ${hasTemplateLoaded ? 'opacity-100' : 'opacity-0'
                        }`}
                    style={{ touchAction: 'none', overscrollBehavior: 'none' }}
                >
                    <canvas ref={canvasEl} />
                </div>

                {/* Unified Top Controls & Floating Actions Container */}
                <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none flex flex-col items-center gap-2 w-max max-w-full px-2">

                    {/* 1. Static Top Controls (Layers, Undo, Redo, Clear) */}
                    <div className="pointer-events-auto flex items-center gap-2 bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-xl shadow-lg border border-gray-100/50">
                        <button
                            onClick={() => setIsMobileLayersOpen(true)}
                            className="group relative flex flex-col items-center justify-center gap-0.5 text-gray-600 hover:text-gray-900 active:scale-95 transition-all min-w-[2.5rem]"
                            title="圖層"
                        >
                            <Layers className="w-4 h-4" />
                            <span className="text-[9px] font-bold tracking-wider text-gray-500 group-hover:text-gray-900">圖層</span>
                            {layers.length > 0 && <span className="absolute top-0 right-0 w-1.5 h-1.5 bg-red-500 rounded-full ring-1 ring-white"></span>}
                        </button>

                        <div className="w-px h-6 bg-gray-200"></div>

                        <button
                            onClick={undo}
                            disabled={historyStep <= 0}
                            className="group relative flex flex-col items-center justify-center gap-0.5 text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all min-w-[2.5rem]"
                            title="復原"
                        >
                            <Undo2 className="w-4 h-4" />
                            <span className="text-[9px] font-bold tracking-wider text-gray-500 group-hover:text-gray-900">復原</span>
                        </button>

                        <button
                            onClick={redo}
                            disabled={historyStep >= history.length - 1}
                            className="group relative flex flex-col items-center justify-center gap-0.5 text-gray-600 hover:text-gray-900 disabled:opacity-30 disabled:cursor-not-allowed active:scale-95 transition-all min-w-[2.5rem]"
                            title="重做"
                        >
                            <Redo2 className="w-4 h-4" />
                            <span className="text-[9px] font-bold tracking-wider text-gray-500 group-hover:text-gray-900">重做</span>
                        </button>

                        <div className="w-px h-6 bg-gray-200"></div>

                        <button
                            onClick={clearCanvas}
                            className="group relative flex flex-col items-center justify-center gap-0.5 text-gray-600 hover:text-red-600 active:scale-95 transition-all min-w-[2.5rem]"
                            title="清空全部"
                        >
                            <Eraser className="w-4 h-4" />
                            <span className="text-[9px] font-bold tracking-wider text-gray-500 group-hover:text-red-600">清空</span>
                        </button>
                    </div>

                    {/* 2. Dynamic Floating Quick Actions (The "Pill") - Automatically stacked below */}
                    {selectedObject && !showMobileTextInput && (
                        <div className="pointer-events-auto bg-white/90 backdrop-blur-md rounded-xl shadow-lg border border-gray-100/50 flex flex-row items-center p-1.5 gap-1 animate-in slide-in-from-top-2 fade-in duration-200">
                            <button onClick={deleteSelected} className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-red-500 hover:bg-red-50 rounded-lg min-w-[2.5rem] transition-colors">
                                <Trash2 className="w-4 h-4" />
                                <span className="text-[9px] font-bold">刪除</span>
                            </button>
                            <div className="w-px h-6 bg-gray-200"></div>
                            <button onClick={duplicateObject} className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-gray-600 hover:bg-gray-50 rounded-lg min-w-[2.5rem] transition-colors">
                                <Copy className="w-4 h-4" />
                                <span className="text-[9px] font-bold">複製</span>
                            </button>

                            {(selectedObject as any).isFrameLayer && (
                                <>
                                    <div className="w-px h-6 bg-gray-200"></div>
                                    {/* Frame-specific actions could go here */}
                                </>
                            )}

                            {(selectedObject.type === 'i-text' || selectedObject.type === 'text') && (
                                <>
                                    <div className="w-px h-6 bg-gray-200"></div>
                                    <button onClick={() => { setActiveMobileSubMenu('edit'); setShowMobileTextInput(false); setShowMobilePropertyBar(true); }} className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-blue-600 hover:bg-blue-50 rounded-lg min-w-[2.5rem] transition-colors">
                                        <Pencil className="w-4 h-4" />
                                        <span className="text-[9px] font-bold">編輯</span>
                                    </button>
                                </>
                            )}

                            {selectedObject.type === 'image' && (
                                <>
                                    <div className="w-px h-6 bg-gray-200"></div>

                                    <button onClick={toggleFillCanvas} className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-gray-600 hover:bg-gray-50 rounded-lg min-w-[2.5rem] transition-colors">
                                        {(selectedObject as any).isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                                        <span className="text-[9px] font-bold">{(selectedObject as any).isMaximized ? "還原" : "滿版"}</span>
                                    </button>

                                    <button onClick={flipObject} className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-gray-600 hover:bg-gray-50 rounded-lg min-w-[2.5rem] transition-colors">
                                        <FlipHorizontal className="w-4 h-4" />
                                        <span className="text-[9px] font-bold">鏡像</span>
                                    </button>

                                    <button onClick={() => {
                                        const obj = selectedObject;
                                        // Rotate 90
                                        obj.rotate((obj.angle || 0) + 90);
                                        fabricCanvas.current?.requestRenderAll();
                                        saveHistory();
                                    }} className="flex flex-col items-center justify-center gap-0.5 px-2 py-1 text-gray-600 hover:bg-gray-50 rounded-lg min-w-[2.5rem] transition-colors">
                                        <RefreshCw className="w-4 h-4" />
                                        <span className="text-[9px] font-bold">旋轉</span>
                                    </button>

                                    {/* Brightness Button with inline popover */}
                                    <div className="relative">
                                        <button onClick={() => setShowBrightnessSlider(v => !v)} className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg min-w-[2.5rem] transition-colors ${showBrightnessSlider ? 'text-amber-600 bg-amber-50' : 'text-gray-600 hover:bg-gray-50'}`}>
                                            <Sun className="w-4 h-4" />
                                            <span className="text-[9px] font-bold">亮度</span>
                                        </button>
                                        {showBrightnessSlider && (
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 p-3 z-50 w-48 animate-in fade-in slide-in-from-top-2 duration-150">
                                                <div className="flex justify-between items-center mb-2">
                                                    <span className="text-xs font-bold text-gray-700">亮度</span>
                                                    <span className="text-xs font-mono text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">{Math.round(brightness * 100)}%</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <Sun className="w-3 h-3 text-gray-400" />
                                                    <input
                                                        type="range"
                                                        min="-1" max="1" step="0.01"
                                                        value={brightness}
                                                        onTouchStart={(e) => e.stopPropagation()}
                                                        onTouchMove={(e) => e.stopPropagation()}
                                                        onChange={(e) => {
                                                            const val = parseFloat(e.target.value);
                                                            setBrightness(val);
                                                            applyBrightness(val);
                                                        }}
                                                        onMouseUp={saveHistory}
                                                        onTouchEnd={saveHistory}
                                                        className="flex-1 accent-amber-500"
                                                    />
                                                    <Sun className="w-4 h-4 text-amber-400" />
                                                </div>
                                                <button onClick={() => { setBrightness(0); applyBrightness(0); saveHistory(); }} className="mt-2 w-full text-[10px] text-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded py-1">重置</button>
                                            </div>
                                        )}
                                    </div>

                                    <div className="w-px h-6 bg-gray-200"></div>

                                    {/* Only show Lock/Unlock if object has a clipPath (Crop/Frame) */}
                                    {selectedObject.clipPath && (
                                        <button onClick={toggleCropMode} className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 rounded-lg hover:bg-gray-50 min-w-[2.5rem] transition-colors ${isCropping ? 'text-blue-600 bg-blue-50' : 'text-gray-600'}`}>
                                            {isCropping ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                                            <span className="text-[9px] font-bold">{isCropping ? "解鎖" : "鎖定"}</span>
                                        </button>
                                    )}
                                </>
                            )}
                        </div>
                    )}
                </div>

            </div>

            {/* --- Mobile Only: Bottom Tab Bar OR Context Edit Panel --- */}





            {/* 3. Context Property Bar (Bottom) - Visible when object selected */}
            <div className={`
        md:hidden fixed left-0 right-0 z-[110] bg-white border-t border-gray-200 rounded-t-2xl shadow-[0_-5px_15px_rgba(0,0,0,0.1)]
        transition-transform duration-300 ease-in-out
        ${selectedObject && !isMobileLayersOpen && !showCropMenu && showMobilePropertyBar && (selectedObject.type === 'i-text' || selectedObject.type === 'text') ? 'translate-y-0' : 'translate-y-[150%]'}
        ${(selectedObject?.type === 'i-text' || selectedObject?.type === 'text') ? 'bottom-[64px] rounded-b-none border-b-0' : 'bottom-[72px]'} 
      `}>
                {selectedObject && (
                    <>
                        {/* Header / Done Bar */}
                        <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white sticky top-0 z-10">
                            <span className="font-semibold text-xs text-gray-500 uppercase tracking-wider">
                                {selectedObject.type === 'i-text' || selectedObject.type === 'text'
                                    ? (activeMobileSubMenu === 'edit' ? '編輯文字' : activeMobileSubMenu)
                                    : '圖片屬性'}
                            </span>
                            <button
                                onClick={() => setShowMobilePropertyBar(false)}
                                className="px-4 py-1.5 bg-black text-white text-xs font-bold rounded-full shadow-sm active:scale-95 transition-transform"
                            >
                                完成
                            </button>
                        </div>

                        {/* Content Body */}
                        <div className="bg-gray-50 max-h-[40vh] overflow-y-auto">
                            <div className="p-4 min-h-[160px]">
                                {/* TAB: EDIT */}
                                {activeMobileSubMenu === 'edit' && (
                                    <div className="flex flex-col gap-3">
                                        <input
                                            type="text"
                                            autoFocus
                                            value={textValue}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setTextValue(val);
                                                if (selectedObject) {
                                                    if (selectedObject instanceof IText && selectedObject.isEditing) selectedObject.exitEditing();
                                                    selectedObject.set('text', val);
                                                    if (!(selectedObject as any).fontFamily) selectedObject.set('fontFamily', 'Arial');
                                                    selectedObject.dirty = true;
                                                    fabricCanvas.current?.requestRenderAll();
                                                }
                                            }}
                                            className="w-full border border-gray-300 rounded-lg px-4 py-3 text-base outline-none focus:border-blue-500 bg-white shadow-sm"
                                            placeholder="在此輸入文字..."
                                        />
                                        <p className="text-xs text-gray-400 text-center">在上方輸入以更新文字</p>
                                    </div>
                                )}

                                {/* TAB: FONT */}
                                {activeMobileSubMenu === 'font' && (
                                    <div className="grid grid-cols-2 gap-2">
                                        {FONT_OPTIONS.map(font => (
                                            <button
                                                key={font.family}
                                                onClick={() => updateSelectedObject('fontFamily', font.family)}
                                                className={`p-3 rounded-lg border text-sm text-left ${(selectedObject as any).fontFamily === font.family
                                                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                                                    : 'border-gray-200 bg-white text-gray-700'
                                                    }`}
                                                style={{ fontFamily: font.family }}
                                            >
                                                {font.label}
                                            </button>
                                        ))}
                                    </div>
                                )}

                                {/* TAB: COLOR */}
                                {activeMobileSubMenu === 'color' && (
                                    <div className="space-y-4">
                                        <ColorPickerSection label="文字顏色" property="fill" currentVal={selectedObject.fill as string} onChange={updateSelectedObject} />
                                        <div className="h-px bg-gray-200"></div>

                                        <div className="space-y-2">
                                            <ColorPickerSection label="背景顏色" property="backgroundColor" currentVal={(selectedObject.backgroundColor as string) || 'transparent'} onChange={updateSelectedObject} />

                                            {/* Corner Radius Slider */}
                                            <div className="flex items-center justify-between px-2 pt-1">
                                                <span className="text-xs text-gray-500 font-medium">圓角半徑</span>
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="range"
                                                        min="0"
                                                        max="50"
                                                        value={(selectedObject as any).bgCornerRadius || 0}
                                                        onChange={(e) => updateSelectedObject('bgCornerRadius', parseInt(e.target.value))}
                                                        className="w-24 accent-black"
                                                    />
                                                    <span className="text-xs text-gray-500 w-4 text-right">{(selectedObject as any).bgCornerRadius || 0}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* TAB: ALIGN / STYLE */}
                                {activeMobileSubMenu === 'align' && (
                                    <div className="space-y-4">
                                        {/* Style (Bold/Italic) */}
                                        <div className="flex justify-center gap-4">
                                            <button onClick={() => updateSelectedObject('fontWeight', (selectedObject as any).fontWeight === 'bold' ? 'normal' : 'bold')} className={`flex flex-col items-center gap-1 p-3 rounded-xl border w-20 ${(selectedObject as any).fontWeight === 'bold' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}`}>
                                                <Bold className="w-6 h-6" />
                                                <span className="text-[10px] font-medium">粗體</span>
                                            </button>
                                            <button onClick={() => updateSelectedObject('fontStyle', (selectedObject as any).fontStyle === 'italic' ? 'normal' : 'italic')} className={`flex flex-col items-center gap-1 p-3 rounded-xl border w-20 ${(selectedObject as any).fontStyle === 'italic' ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-700 border-gray-200'}`}>
                                                <Italic className="w-6 h-6" />
                                                <span className="text-[10px] font-medium">斜體</span>
                                            </button>
                                        </div>

                                        {/* Canvas Align */}
                                        <div>
                                            <p className="text-[10px] text-gray-400 mb-1 ml-1 font-medium">畫布位置</p>
                                            <div className="bg-white p-2 rounded-xl border border-gray-200 flex justify-between gap-2">
                                                <button onClick={() => alignCanvas('left')} className="p-2 rounded-lg flex-1 flex justify-center text-gray-600 hover:bg-gray-50 hover:text-blue-600 active:scale-95 transition-all" title="靠左">
                                                    <AlignLeft className="w-5 h-5" />
                                                </button>
                                                <button onClick={() => alignCanvas('center')} className="p-2 rounded-lg flex-1 flex justify-center text-gray-600 hover:bg-gray-50 hover:text-blue-600 active:scale-95 transition-all" title="水平置中">
                                                    <AlignCenter className="w-5 h-5" />
                                                </button>
                                                <button onClick={() => alignCanvas('right')} className="p-2 rounded-lg flex-1 flex justify-center text-gray-600 hover:bg-gray-50 hover:text-blue-600 active:scale-95 transition-all" title="靠右">
                                                    <AlignRight className="w-5 h-5" />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                                {/* TAB: IMAGE (Cleaned for Frame Morph Focus) */}
                                {activeMobileSubMenu === 'image' && (
                                    <div className="space-y-4">
                                        {/* Only show Scale/Size tools if NOT a morphable frame (Heart/Star), OR if user wants standard image tools. 
                                         But user requested REMOVING the scale slider when frame morph is active. 
                                         Actually, user said "remove the move function slider" entirely from this view based on the screenshot.
                                         So we will hide the standard image tools if a frame shape is active, OR just hide them generally 
                                         if the user only wants frame morph in this specific UI context. 
                                         
                                         Let's hide the scale slider block completely for now as requested.
                                     */}

                                        {/* Removed Scale Slider Block per user request */}

                                        {/* Keep Flip/Fill if needed, or hide them too? User's screenshot was VERY clean. 
                                         Let's hide them if it's a Heart/Star to match the "red box only" request perfectly.
                                         If it's a standard image (no shape), we might still want them? 
                                         User said "click Frame -> ... -> Red box area is frame morph slider".
                                         So for Heart/Star, we show ONLY the Morph slider.
                                     */}

                                        {(!((selectedObject as any).clipPath?.data?.frameShape === 'heart' || (selectedObject as any).clipPath?.data?.frameShape === 'star')) && (
                                            <>
                                                <div className="flex justify-between items-center px-1">
                                                    <span className="text-xs text-gray-500 font-medium">尺寸 (寬 x 高)</span>
                                                    <span className="text-xs font-mono bg-gray-100 px-2 py-1 rounded text-gray-600">
                                                        {Math.round(selectedObject.getScaledWidth())} x {Math.round(selectedObject.getScaledHeight())} px
                                                    </span>
                                                </div>

                                                <div className="space-y-2 bg-white p-3 rounded-xl border border-gray-200">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <span className="text-xs font-bold text-gray-700">縮放比例</span>
                                                        <button
                                                            onClick={() => {
                                                                selectedObject.scale(1);
                                                                selectedObject.setCoords();
                                                                fabricCanvas.current?.requestRenderAll();
                                                                saveHistory();
                                                            }}
                                                            className="text-[10px] text-blue-600 hover:bg-blue-50 px-2 py-0.5 rounded"
                                                        >
                                                            重置 (100%)
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        <Minimize2 className="w-4 h-4 text-gray-400" />
                                                        <input
                                                            type="range"
                                                            min="0.1"
                                                            max="3.0"
                                                            step="0.1"
                                                            value={selectedObject.scaleX || 1}
                                                            onChange={(e) => {
                                                                const val = parseFloat(e.target.value);
                                                                selectedObject.scale(val);
                                                                selectedObject.setCoords();
                                                                fabricCanvas.current?.requestRenderAll();
                                                            }}
                                                            onMouseUp={saveHistory}
                                                            onTouchEnd={saveHistory}
                                                            className="flex-1 accent-blue-600"
                                                        />
                                                        <Maximize className="w-4 h-4 text-gray-400" />
                                                    </div>
                                                    <div className="text-center text-xs text-gray-500 font-mono mt-1">
                                                        {Math.round((selectedObject.scaleX || 1) * 100)}%
                                                    </div>
                                                </div>

                                                <div className="flex gap-2">
                                                    <button onClick={toggleFillCanvas} className="flex-1 flex items-center justify-center gap-2 p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 active:scale-95 transition-all text-gray-700">
                                                        {(selectedObject as any).isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
                                                        <span className="text-xs font-medium">{(selectedObject as any).isMaximized ? "還原大小" : "填滿畫布"}</span>
                                                    </button>
                                                    <button onClick={flipObject} className="flex-1 flex items-center justify-center gap-2 p-3 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 active:scale-95 transition-all text-gray-700">
                                                        <FlipHorizontal className="w-4 h-4" />
                                                        <span className="text-xs font-medium">水平翻轉</span>
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                )}

                                {/* TAB: FRAME PARAMS (Removed as requested) */}
                                {/* 
                            {selectedObject.type === 'image' && activeMobileSubMenu === 'image' && ((selectedObject as any).clipPath?.data?.frameShape === 'heart' || (selectedObject as any).clipPath?.data?.frameShape === 'star') && (
                                <div className="mt-4 px-1 animate-in fade-in slide-in-from-bottom-2 duration-200 border-t pt-4">
                                     {(() => {
                                          const activeObj = selectedObject; 
                                          const frameShape = (activeObj?.clipPath as any)?.data?.frameShape;
                                          const frameMeta = (activeObj as any)?.frameMeta;
                                          
                                          if (!frameMeta) return null;

                                          return (
                                              <>
                                                  <div className="flex items-center justify-between mb-4">
                                                      <span className="text-sm font-medium text-gray-600">
                                                          {frameShape === 'star' ? '星形變化' : '圓潤程度'}
                                                      </span>
                                                      <span className="text-sm font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded">
                                                          {Math.round(frameMeta.param)}%
                                                      </span>
                                                  </div>
                                                  
                                                  <div className="relative h-10 flex items-center">
                                                      <input 
                                                          type="range" 
                                                          min="0" 
                                                          max="100" 
                                                          step="1"
                                                          value={frameMeta.param} 
                                                          onChange={(e) => {
                                                              const val = parseFloat(e.target.value);
                                                              updateFrameParams(val);
                                                              // Force update state to re-render slider UI
                                                              // @ts-ignore
                                                              setSelectedObject({...selectedObject}); 
                                                          }}
                                                          onTouchStart={(e) => e.stopPropagation()}
                                                          onTouchMove={(e) => e.stopPropagation()}
                                                          className="w-full h-6 bg-gray-200 rounded-full appearance-none cursor-pointer accent-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                                                      />
                                                  </div>

                                                  <div className="flex justify-between text-xs text-gray-400 font-medium mt-1">
                                                      <span>{frameShape === 'star' ? '標準星型' : '尖銳'}</span>
                                                      <span>{frameShape === 'star' ? '五角形' : '圓潤'}</span>
                                                  </div>
                                              </>
                                          );
                                     })()}
                                </div>
                            )}
                            */}
                            </div>
                            {!activeMobileSubMenu && (
                                <div className="p-4 flex items-center justify-center gap-2 text-gray-400 text-sm">
                                    請使用下方工具列進行編輯
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* 4. Tab Bar (Always visible when selected) */}
            {selectedObject && !isMobileLayersOpen && !showCropMenu &&
                ((selectedObject.type === 'i-text' || selectedObject.type === 'text') ||
                    (selectedObject.type === 'image' && !(selectedObject as any).isStickerLayer && !(selectedObject as any).isBarcodeLayer && (!activePanel || activePanel === 'none'))) && (
                    <div className="md:hidden fixed bottom-0 left-0 right-0 z-[120] bg-white border-t border-gray-200 pb-safe pt-2 pb-2 h-[72px] flex justify-center items-center overflow-x-auto">

                        {/* TEXT TOOLS */}
                        {(selectedObject.type === 'i-text' || selectedObject.type === 'text') && (
                            <div className="flex w-full justify-around">
                                <button onClick={() => { setActiveMobileSubMenu('edit'); setShowMobilePropertyBar(true); }} className={`flex flex-col items-center gap-1 p-2 min-w-[4rem] ${activeMobileSubMenu === 'edit' ? 'text-blue-600' : 'text-gray-400'}`}>
                                    <Pencil className="w-6 h-6" />
                                    <span className="text-[10px] font-medium">編輯</span>
                                </button>
                                <button onClick={() => { setActiveMobileSubMenu('font'); setShowMobilePropertyBar(true); }} className={`flex flex-col items-center gap-1 p-2 min-w-[4rem] ${activeMobileSubMenu === 'font' ? 'text-blue-600' : 'text-gray-400'}`}>
                                    <Type className="w-6 h-6" />
                                    <span className="text-[10px] font-medium">字體</span>
                                </button>
                                <button onClick={() => { setActiveMobileSubMenu('color'); setShowMobilePropertyBar(true); }} className={`flex flex-col items-center gap-1 p-2 min-w-[4rem] ${activeMobileSubMenu === 'color' ? 'text-blue-600' : 'text-gray-400'}`}>
                                    <Palette className="w-6 h-6" />
                                    <span className="text-[10px] font-medium">顏色</span>
                                </button>
                                <button onClick={() => { setActiveMobileSubMenu('align'); setShowMobilePropertyBar(true); }} className={`flex flex-col items-center gap-1 p-2 min-w-[4rem] ${activeMobileSubMenu === 'align' ? 'text-blue-600' : 'text-gray-400'}`}>
                                    <AlignLeft className="w-6 h-6" />
                                    <span className="text-[10px] font-medium">對齊</span>
                                </button>
                            </div>
                        )}

                        {/* IMAGE TOOLS */}
                        {selectedObject.type === 'image' && !(selectedObject as any).isStickerLayer && (!activePanel || activePanel === 'none') && (
                            <div className="flex items-center gap-4 px-4 w-full justify-around">
                                {/* Frame Upload Button */}
                                {(selectedObject as any).isFrameLayer && mobileActions?.onUpload && (
                                    <button onClick={mobileActions.onUpload} className="flex flex-col items-center gap-1 p-2 min-w-[4rem] text-blue-600">
                                        <Upload className="w-6 h-6" />
                                        <span className="text-[10px] font-medium">上傳照片</span>
                                    </button>
                                )}
                                {/* AI Tools: Cartoonize */}
                                {mobileActions?.onAiCartoon && (
                                    <button onClick={mobileActions?.onAiCartoon} className="flex flex-col items-center gap-1 p-2 min-w-[4rem] text-purple-600">
                                        <Wand2 className="w-6 h-6" />
                                        <span className="text-[10px] font-medium">卡通化</span>
                                    </button>
                                )}

                                {/* AI Tools: Remove BG */}
                                {mobileActions?.onAiRemoveBg && (
                                    <button onClick={mobileActions?.onAiRemoveBg} className="flex flex-col items-center gap-1 p-2 min-w-[4rem] text-red-600">
                                        <Scissors className="w-6 h-6" />
                                        <span className="text-[10px] font-medium">去背</span>
                                    </button>
                                )}

                                {/* 相框 Button - shown when image is selected */}
                                {mobileActions?.onOpenFrames && !(selectedObject as any).isFrameLayer && (
                                    <button onClick={mobileActions?.onOpenFrames} className="flex flex-col items-center gap-1 p-2 min-w-[4rem] text-amber-600">
                                        <Frame className="w-6 h-6" />
                                        <span className="text-[10px] font-medium">相框</span>
                                    </button>
                                )}

                                {/* Fallback Legacy AI */}
                                {!mobileActions?.onAiCartoon && !mobileActions?.onAiRemoveBg && mobileActions?.onOpenAI && (
                                    <button onClick={mobileActions?.onOpenAI} className="flex flex-col items-center gap-1 p-2 min-w-[4rem] text-purple-600">
                                        <Sparkles className="w-6 h-6" />
                                        <span className="text-[10px] font-medium">AI 魔法</span>
                                    </button>
                                )}



                                <button onClick={centerObject} className="flex flex-col items-center gap-1 p-2 min-w-[4rem] text-gray-500 active:text-blue-600">
                                    <AlignCenter className="w-6 h-6" />
                                    <span className="text-[10px] font-medium">置中</span>
                                </button>
                            </div>
                        )}
                    </div>
                )}

            {/* 4. Main Mobile Bottom Tab Bar (Visible when NO Object Selected) */}
            <div className={`
        md:hidden fixed bottom-0 left-0 right-0 h-auto bg-white border-t border-gray-200 z-[100] 
        flex flex-col w-full
        transition-transform duration-300 touch-pan-x snap-x snap-mandatory overscroll-x-contain
        ${(selectedObject && !(selectedObject as any).isStickerLayer && !(selectedObject as any).isBarcodeLayer) || isMobileLayersOpen || showCropMenu ? 'translate-y-full' : 'translate-y-0'}
      `}>
                {/* Mobile Product Info Bar (Top of Toolbar) */}
                {currentProduct && !showCropMenu && (
                    <button
                        onClick={mobileActions?.onOpenProduct}
                        className="w-full flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-gray-50/50 active:bg-gray-100 transition-colors"
                    >
                        <div className="flex flex-col items-start">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{currentProduct.brand || '產品'}</span>
                            <div className="flex items-center gap-1">
                                <span className="text-sm font-semibold text-gray-800">{currentProduct.name}</span>
                                <ChevronDown className="w-3 h-3 text-gray-400" />
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-medium text-gray-500 bg-white border border-gray-200 px-2 py-0.5 rounded-full shadow-sm">
                                更換
                            </span>
                        </div>
                    </button>
                )}

                <div
                    className="flex items-center overflow-x-auto flex-nowrap w-full no-scrollbar gap-2 px-4 py-3"
                    style={{ scrollbarWidth: 'none' }}
                >
                    {showCropMenu ? (
                        // === 狀態 B: 裁切子選單 (Crop Sub-menu) ===
                        <>
                            <button
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => setShowCropMenu(false)}
                                className="flex flex-col items-center justify-center gap-1 min-w-[4.5rem] flex-shrink-0 text-gray-500"
                            >
                                <ArrowLeft className="w-6 h-6" />
                                <span className="text-[10px] font-medium">返回</span>
                            </button>

                            <div className="w-px h-8 bg-gray-300 mx-2"></div> {/* 分隔線 */}

                            {/* Removed all Frame/Crop buttons from here as requested by user to "remove all mobile frame functions" */}

                            {selectedObject?.clipPath && (
                                <>
                                    <div className="w-px h-8 bg-gray-300 mx-2"></div>
                                    <button
                                        onMouseDown={(e) => e.preventDefault()}
                                        onClick={toggleCropMode}
                                        className={`flex flex-col items-center justify-center gap-1 min-w-[4.5rem] flex-shrink-0 transition-colors ${isCropping ? 'text-yellow-600 bg-yellow-50' : 'text-gray-500 active:text-blue-600'}`}
                                    >
                                        {isCropping ? <Unlock className="w-6 h-6" /> : <Lock className="w-6 h-6" />}
                                        <span className="text-[10px] font-medium">{isCropping ? '解鎖' : '鎖定'}</span>
                                    </button>
                                </>
                            )}
                        </>
                    ) : (
                        // === 狀態 A: 主功能選單 (Main Menu) ===
                        <>
                            <button
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={mobileActions?.onUpload}
                                className="flex flex-col items-center justify-center gap-1 min-w-[4.5rem] flex-shrink-0 whitespace-nowrap p-2 text-gray-500 active:text-blue-600"
                            >
                                <Upload className="w-6 h-6" />
                                <span className="text-[10px] font-medium">上傳</span>
                            </button>

                            {mobileActions?.onAddText && (
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={mobileActions?.onAddText}
                                    className="flex flex-col items-center justify-center gap-1 min-w-[4.5rem] flex-shrink-0 whitespace-nowrap p-2 text-gray-500 active:text-blue-600"
                                >
                                    <Type className="w-6 h-6" />
                                    <span className="text-[10px] font-medium">文字</span>
                                </button>
                            )}

                            {mobileActions?.onOpenStickers && (
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={mobileActions?.onOpenStickers}
                                    className="flex flex-col items-center justify-center gap-1 min-w-[4.5rem] flex-shrink-0 whitespace-nowrap p-2 text-gray-500 active:text-blue-600"
                                >
                                    <Sticker className="w-6 h-6" />
                                    <span className="text-[10px] font-medium">貼圖</span>
                                </button>
                            )}

                            {mobileActions?.onOpenBackgrounds && (
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={mobileActions?.onOpenBackgrounds}
                                    className="flex flex-col items-center justify-center gap-1 min-w-[4.5rem] flex-shrink-0 whitespace-nowrap p-2 text-gray-500 active:text-blue-600"
                                >
                                    <ImageIcon className="w-6 h-6" />
                                    <span className="text-[10px] font-medium">背景</span>
                                </button>
                            )}

                            {mobileActions?.onOpenFrames && (
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={mobileActions?.onOpenFrames}
                                    className="flex flex-col items-center justify-center gap-1 min-w-[4.5rem] flex-shrink-0 whitespace-nowrap p-2 text-gray-500 active:text-blue-600"
                                >
                                    <Frame className="w-6 h-6" />
                                    <span className="text-[10px] font-medium">相框</span>
                                </button>
                            )}

                            {mobileActions?.onOpenBarcode && (
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={mobileActions?.onOpenBarcode}
                                    className="flex flex-col items-center justify-center gap-1 min-w-[4.5rem] flex-shrink-0 whitespace-nowrap p-2 text-gray-500 active:text-blue-600"
                                >
                                    <ScanBarcode className="w-6 h-6" />
                                    <span className="text-[10px] font-medium">條碼</span>
                                </button>
                            )}

                            {mobileActions?.onOpenDesigns && (
                                <button
                                    onMouseDown={(e) => e.preventDefault()}
                                    onClick={mobileActions?.onOpenDesigns}
                                    className="flex flex-col items-center justify-center gap-1 min-w-[4.5rem] flex-shrink-0 whitespace-nowrap p-2 text-gray-500 active:text-blue-600"
                                >
                                    <LayoutTemplate className="w-6 h-6" />
                                    <span className="text-[10px] font-medium">設計</span>
                                </button>
                            )}

                            <div className="w-4 flex-shrink-0" />
                        </>
                    )}
                </div>
            </div>

            {/* Layers Sidebar / Mobile Drawer */}
            <div className={`
          bg-white border-l border-gray-200 flex flex-col z-50
          md:w-72 md:static md:translate-y-0
          fixed inset-x-0 bottom-0 rounded-t-2xl shadow-[0_-10px_40px_rgba(0,0,0,0.2)] transition-transform duration-300
          ${isMobileLayersOpen ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
          h-[60vh] md:h-full
      `}>
                <div className="p-3 border-b border-gray-200 bg-gray-50 font-semibold text-gray-700 flex justify-between items-center rounded-t-2xl md:rounded-none sticky top-0 z-10">
                    <div className="flex items-center gap-2">
                        <span>圖層</span>
                        <span className="text-xs font-normal text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full">{layers.length}</span>
                    </div>

                    {/* Mobile Close Button */}
                    <button
                        onClick={() => setIsMobileLayersOpen(false)}
                        className="md:hidden p-1 bg-gray-200 rounded-full text-gray-600"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-2 bg-gray-50 pb-8 md:pb-2">
                    <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                    >
                        <SortableContext
                            items={layers.map(l => l.id)}
                            strategy={verticalListSortingStrategy}
                        >
                            {layers.length === 0 ? (
                                <div className="text-center py-8 text-gray-400 text-sm">
                                    尚無圖層。<br />請添加文字或圖片以開始設計。
                                </div>
                            ) : (
                                layers.map(layer => (
                                    <SortableLayerItem
                                        key={layer.id}
                                        layer={layer}
                                        isActive={
                                            selectedObject && (
                                                (selectedObject as any).id === layer.id ||
                                                (selectedObject.type === 'activeSelection' && (selectedObject as any).getObjects().some((o: any) => o.id === layer.id))
                                            )
                                        }
                                        onToggleVisible={(e) => toggleLayerVisibility(layer.id, e)}
                                        onToggleLock={(e) => toggleLayerLock(layer.id, e)}
                                        onDelete={(e) => deleteLayer(layer.id, e)}
                                        onSelect={(e) => selectLayer(layer.id, e)}
                                    />
                                ))
                            )}
                        </SortableContext>
                    </DndContext>
                </div>
            </div>

            {/* Custom Frame Selection Modal - REMOVED: Use PC frames panel via onOpenFrames instead */}
            {false && (
                <div className="absolute inset-0 z-[150] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh] animate-in fade-in zoom-in duration-200">
                        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                <Shapes className="w-5 h-5" />
                                選擇相框
                            </h3>
                            <button onClick={() => setShowFrameSelectionModal(false)} className="p-1 hover:bg-gray-100 rounded-full text-gray-500">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        {/* Basic Shapes Section REMOVED as per user request to delete "Basic Shapes (Crop)" on mobile */}

                        <div className="p-4 bg-gray-50 border-b border-gray-100 flex gap-2 overflow-x-auto scrollbar-hide">
                            <button
                                onClick={() => setSelectedCategory('全部')}
                                className={`px-4 py-2 rounded-lg text-sm font-medium shadow-sm whitespace-nowrap transition-colors ${selectedCategory === '全部' ? 'bg-blue-50 border border-blue-200 text-blue-700' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                            >
                                全部
                            </button>
                            {frameCategories.map(cat => (
                                <button
                                    key={cat}
                                    onClick={() => setSelectedCategory(cat)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium shadow-sm whitespace-nowrap transition-colors ${selectedCategory === cat ? 'bg-blue-50 border border-blue-200 text-blue-700' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 bg-white min-h-[300px]">
                            {filteredFrames.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-400 gap-3">
                                    <Shapes className="w-12 h-12 text-gray-200" />
                                    <p>尚無相框</p>
                                    {selectedCategory !== '全部' && (
                                        <button onClick={() => setSelectedCategory('全部')} className="text-blue-500 hover:underline text-sm">
                                            查看全部
                                        </button>
                                    )}
                                    <a href="/seller/frame/new" target="_blank" className="text-blue-500 hover:underline text-sm mt-2">
                                        前往後台建立 (新分頁)
                                    </a>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 gap-4">
                                    {filteredFrames.map(frame => (
                                        <button
                                            key={frame.id}
                                            onClick={() => {
                                                addFrameToCanvas(frame);
                                                setShowFrameSelectionModal(false);
                                            }}
                                            className="group relative aspect-[3/4] rounded-xl border border-gray-200 overflow-hidden hover:border-blue-500 hover:shadow-md transition-all"
                                        >
                                            <img src={frame.imageUrl} alt={frame.name} className="w-full h-full object-contain bg-gray-50 p-2" />
                                            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3 pt-8 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <span className="text-white text-xs font-medium">{frame.name}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

export default CanvasEditor;
