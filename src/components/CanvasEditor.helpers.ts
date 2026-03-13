/**
 * CanvasEditor.helpers.ts
 * Pure utility functions extracted from CanvasEditor.tsx.
 * None of these functions depend on React state or hooks.
 */
import type { Canvas, FabricObject } from 'fabric';

// --- Image Loading Helpers ---

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

export const loadImageElement = async (url: string): Promise<HTMLImageElement> => {
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

export const loadImageElementFresh = async (url: string): Promise<HTMLImageElement> => {
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
};

// --- Canvas Positioning Helpers ---

export const centerAndStabilize = async (
    canvas: Canvas,
    obj: FabricObject,
    centerX: number,
    centerY: number,
    onAfterSecondFrame?: () => void
) => {
    obj.set({
        originX: 'center',
        originY: 'center',
        left: centerX,
        top: centerY
    });

    obj.setCoords();
    canvas.requestRenderAll();

    await nextFrame();

    canvas.calcOffset();
    obj.set({ left: centerX, top: centerY });
    obj.setCoords();

    if (onAfterSecondFrame) onAfterSecondFrame();

    canvas.requestRenderAll();
};

// --- Shape Generation Helpers ---

/**
 * Generate Star Points: 0 (Sharp Star) -> 100 (Pentagon-like)
 */
export function getStarPoints(outerRadius: number, param0to100: number) {
    const t = Math.max(0, Math.min(100, param0to100)) / 100;
    const startRatio = 0.382;
    const endRatio = 0.809;
    const innerRatio = startRatio + (endRatio - startRatio) * t;

    const points = [];
    const spikes = 5;
    const innerRadius = outerRadius * innerRatio;
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

/**
 * Generate Heart SVG Path: t=0 (Sharp) -> t=1 (Round/Bean)
 */
export function getHeartPath(width: number, height: number, t: number) {
    const l = (a: number, b: number) => a + (b - a) * t;
    const w = width / 2;
    const h = height / 2;

    const topDipY = l(-0.4, -0.55) * h;
    const tl_c1x = l(-0.3, -0.4) * w;
    const tl_c1y = l(-0.9, -1.05) * h;
    const tl_c2x = l(-0.9, -1.0) * w;
    const tl_c2y = l(-0.8, -0.8) * h;
    const tl_ax = l(-0.9, -1.0) * w;
    const tl_ay = l(-0.2, -0.3) * h;
    const bl_c3x = l(-0.9, -1.0) * w;
    const bl_c3y = l(0.4, 0.6) * h;
    const bl_c4x = l(-0.3, -0.6) * w;
    const bl_c4y = l(0.9, 0.95) * h;
    const tipY = 1.0 * h;

    return `M 0 ${topDipY} 
            C ${tl_c1x} ${tl_c1y} ${tl_c2x} ${tl_c2y} ${tl_ax} ${tl_ay} 
            C ${bl_c3x} ${bl_c3y} ${bl_c4x} ${bl_c4y} 0 ${tipY} 
            C ${-bl_c4x} ${bl_c4y} ${-bl_c3x} ${bl_c3y} ${-tl_ax} ${tl_ay} 
            C ${-tl_c2x} ${tl_c2y} ${-tl_c1x} ${tl_c1y} 0 ${topDipY} Z`;
}

// --- Vector / Math Helpers ---

export const rotateVector = (x: number, y: number, angleDegrees: number) => {
    const radians = (angleDegrees * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    return {
        x: x * cos - y * sin,
        y: x * sin + y * cos
    };
};

export function getPolygonCentroid(points: { x: number, y: number }[]) {
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

export function clamp01(v: number) { return Math.max(0, Math.min(1, v)); }
export function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }

// --- Image Source Normalisation ---

export function normalizeImageSrc(input: any): string | null {
    if (!input) return null;
    let s = String(input).trim();

    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
        s = s.slice(1, -1).trim();
    }

    if (s.startsWith('data:') || s.startsWith('blob:')) return s;

    const b64 = s.replace(/\s+/g, '');
    const looksLikeBareBase64 =
        !b64.includes('://') &&
        !b64.startsWith('/') &&
        /^[A-Za-z0-9+/=]+$/.test(b64) &&
        b64.length > 100;

    if (looksLikeBareBase64) {
        return `data:image/png;base64,${b64}`;
    }

    return s;
}

export function withCacheBuster(url: any, v: string) {
    const src = normalizeImageSrc(url);
    if (!src) return src;
    if (src.startsWith('data:') || src.startsWith('blob:')) return src;

    try {
        const u = new URL(src, window.location.origin);
        u.searchParams.set('v', v);
        return u.toString();
    } catch {
        const joiner = src.includes('?') ? '&' : '?';
        return `${src}${joiner}v=${encodeURIComponent(v)}`;
    }
}

// --- Fabric Object Disposal ---

export function disposeObjectDeep(obj: FabricObject) {
    if (typeof (obj as any).dispose === 'function') {
        try { (obj as any).dispose(); } catch { }
    }
    if ((obj as any).getObjects) {
        (obj as any).getObjects().forEach((child: FabricObject) => disposeObjectDeep(child));
    }
}

// --- Canvas Layer Helpers ---

function getRole(o: any) { return o?.data?.role; }
export function isBase(o: any) { return getRole(o) === 'product_base'; }
export function isOverlay(o: any) { return getRole(o) === 'product_overlay'; }

export function moveToDesignBgLayer(canvas: Canvas, bgObj: FabricObject) {
    const objs = canvas.getObjects();
    let lastBaseIndex = -1;
    let firstOverlayIndex = Infinity;

    objs.forEach((o, i) => {
        if (o === bgObj) return;
        if (isBase(o)) lastBaseIndex = Math.max(lastBaseIndex, i);
        if (isOverlay(o)) firstOverlayIndex = Math.min(firstOverlayIndex, i);
    });

    let targetIndex = lastBaseIndex >= 0 ? lastBaseIndex + 1 : 0;
    if (firstOverlayIndex !== Infinity) {
        targetIndex = Math.min(targetIndex, firstOverlayIndex);
    }
    canvas.moveObjectTo(bgObj, targetIndex);
}

export const isImageLikeObject = (obj: any): boolean => {
    if (!obj) return false;
    if (obj.data?.kind === 'user_image' || obj.data?.type === 'image' || obj.data?.source === 'upload' || obj.data?.source === 'ai') {
        return true;
    }
    const type = obj.type;
    if (['i-text', 'text', 'textbox', 'group', 'path', 'rect', 'circle', 'polygon', 'line', 'activeSelection'].includes(type)) return false;
    if (obj.isBaseLayer || obj.isMaskLayer || obj.isFrameLayer || obj.id === 'system_base_image' || obj.id === 'system_mask_image') return false;
    if (type === 'image') return true;
    return false;
};

// --- ClipPath Helpers ---

type AnyObj = any;

function isRect(o: AnyObj) { return !!o && o.type === 'rect'; }
function isPathLike(o: AnyObj) { return !!o && (o.type === 'path' || o.type === 'polygon' || o.type === 'polyline'); }

export function getHeartMask(obj: AnyObj): FabricObject | null {
    const cp = obj?.clipPath as AnyObj | undefined;
    if (!cp) return null;
    const nested = cp.clipPath as AnyObj | undefined;
    if (isPathLike(cp) && nested && isRect(nested)) return cp;
    if (isRect(cp) && nested && isPathLike(nested)) return nested;
    if (isPathLike(cp)) return cp;
    if (nested && isPathLike(nested)) return nested;
    return null;
}

export function ensureMaskCenteredOnOwner(owner: AnyObj, mask: AnyObj) {
    if (!owner || !mask) return;
    mask.set({ originX: 'center', originY: 'center', angle: 0 });
    if (!mask.absolutePositioned) {
        mask.set({ left: 0, top: 0 });
    } else {
        const c = owner.getCenterPoint();
        mask.set({ left: c.x, top: c.y });
    }
    mask.setCoords?.();
}

export function getInnerClip(obj: AnyObj): FabricObject | null {
    const cp = obj?.clipPath as AnyObj | undefined;
    if (!cp) return null;
    return (cp.clipPath ? cp.clipPath : cp) as FabricObject;
}

export function centerClipOnOwner(owner: AnyObj, clip: AnyObj) {
    if (!owner || !clip) return;
    clip.set({ originX: 'center', originY: 'center', angle: 0 });
    if (clip.absolutePositioned) {
        const c = owner.getCenterPoint();
        clip.set({ left: c.x, top: c.y });
    } else {
        clip.set({ left: 0, top: 0 });
    }
    clip.setCoords?.();
}

export function getFrameMask(owner: any) {
    const seen = new Set<any>();
    let cp = owner?.clipPath;
    let depth = 0;
    while (cp && depth < 6) {
        if (seen.has(cp)) break;
        seen.add(cp);
        if (cp?.data?.frameRole === 'mask') return cp;
        if (cp?.clipPath) {
            const inner = cp.clipPath;
            if (inner?.data?.frameRole === 'mask') return inner;
            cp = inner;
            depth++;
            continue;
        }
        break;
    }
    const root = owner?.clipPath;
    if (!root) return null;
    if (root.type === 'path' || root.type === 'polygon') return root;
    if (root.clipPath && (root.clipPath.type === 'path' || root.clipPath.type === 'polygon')) return root.clipPath;
    return null;
}

export function markDirtyAll(canvas: any, owner: any, mask: any) {
    if (mask) { mask.dirty = true; mask.setCoords?.(); }
    if (owner) { owner.dirty = true; owner.setCoords?.(); }
    const cp: any = owner?.clipPath;
    if (cp) { cp.dirty = true; cp.setCoords?.(); }
    canvas?.requestRenderAll?.();
}
