import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { UseProductEditorReturn } from '../../hooks/useProductEditor';
import { AlertCircle, RefreshCw, Save, Loader2, Maximize2 } from 'lucide-react';
import { computeRenderedRect, computeOverlayStyle, RenderedRect } from '../../shared/visualMath';

interface VisualTabProps {
  editor: UseProductEditorReturn;
}

type DragMode = 'none' | 'move' | 'resize';

const VisualTab: React.FC<VisualTabProps> = ({ editor }) => {
  const { draft, product, setDraft, save, saving, isDirty } = editor;
  const [renderedRect, setRenderedRect] = useState<RenderedRect | null>(null);
  const [dragState, setDragState] = useState<{
    mode: DragMode;
    startX: number;
    startY: number;
    startOffset: { x: number; y: number };
    startSize: { w: number; h: number };
  } | null>(null);

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const updateImgRect = useCallback(() => {
    if (imgRef.current && containerRef.current) {
      const rect = computeRenderedRect(
        containerRef.current.clientWidth,
        containerRef.current.clientHeight,
        imgRef.current.naturalWidth,
        imgRef.current.naturalHeight
      );
      setRenderedRect(rect);
    }
  }, []);

  useEffect(() => {
    const resizeObserver = new ResizeObserver(() => updateImgRect());
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }
    return () => resizeObserver.disconnect();
  }, [updateImgRect]);

  const specs = draft?.specs || {};
  const maskConfig = draft?.mask_config || {};
  const size = maskConfig.size || { w: 0, h: 0 };
  const offset = maskConfig.offset || { x: 0, y: 0 };
  const specsWidth = specs.width || 10; 
  const specsHeight = specs.height || 10;

  const scales = useMemo(() => {
    if (!renderedRect) return { x: 1, y: 1 };
    return {
      x: renderedRect.width / specsWidth,
      y: renderedRect.height / specsHeight
    };
  }, [renderedRect, specsWidth, specsHeight]);

  const handlePointerDown = (e: React.PointerEvent, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    
    setDragState({
      mode,
      startX: e.clientX,
      startY: e.clientY,
      startOffset: { ...offset },
      startSize: { ...size }
    });
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragState || !renderedRect) return;

    const deltaPxX = e.clientX - dragState.startX;
    const deltaPxY = e.clientY - dragState.startY;
    const deltaCmX = deltaPxX / scales.x;
    const deltaCmY = deltaPxY / scales.y;

    const minVisiblePx = 12;
    const minCm = 0.2;

    if (dragState.mode === 'move') {
      let newX = dragState.startOffset.x + deltaCmX;
      let newY = dragState.startOffset.y + deltaCmY;

      // Clamping to keep box partially visible
      const leftPx = renderedRect.left + newX * scales.x;
      const topPx = renderedRect.top + newY * scales.y;
      const boxPxW = size.w * scales.x;
      const boxPxH = size.h * scales.y;

      const minLeft = renderedRect.left - boxPxW + minVisiblePx;
      const maxLeft = renderedRect.left + renderedRect.width - minVisiblePx;
      const minTop = renderedRect.top - boxPxH + minVisiblePx;
      const maxTop = renderedRect.top + renderedRect.height - minVisiblePx;

      const clampedLeftPx = Math.max(minLeft, Math.min(maxLeft, leftPx));
      const clampedTopPx = Math.max(minTop, Math.min(maxTop, topPx));

      newX = (clampedLeftPx - renderedRect.left) / scales.x;
      newY = (clampedTopPx - renderedRect.top) / scales.y;

      setDraft({
        mask_config: {
          ...maskConfig,
          offset: { x: Number(newX.toFixed(2)), y: Number(newY.toFixed(2)) }
        }
      });
    } else if (dragState.mode === 'resize') {
      let newW = Math.max(minCm, dragState.startSize.w + deltaCmX);
      let newH = Math.max(minCm, dragState.startSize.h + deltaCmY);

      setDraft({
        mask_config: {
          ...maskConfig,
          size: { w: Number(newW.toFixed(2)), h: Number(newH.toFixed(2)) }
        }
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragState) {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
      setDragState(null);
    }
  };

  if (!draft?.base_image) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl">
        <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
        <h3 className="text-lg font-medium text-gray-800">未上傳底圖</h3>
        <p className="text-gray-500 text-sm">請先在基本設定分頁上傳 Base Image 才能進行視覺校準。</p>
      </div>
    );
  }

  let overlayStyle: React.CSSProperties = { display: 'none' };
  if (renderedRect) {
    overlayStyle = {
      ...computeOverlayStyle(renderedRect, specsWidth, specsHeight, size, offset),
      cursor: dragState?.mode === 'move' ? 'grabbing' : 'grab',
      pointerEvents: 'auto',
      touchAction: 'none'
    };
  }

  const handleUpdateConfig = (path: string, value: number) => {
    const newMaskConfig = JSON.parse(JSON.stringify(maskConfig));
    const parts = path.split('.');
    let current = newMaskConfig;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!current[parts[i]]) current[parts[i]] = {};
      current = current[parts[i]];
    }
    current[parts[parts.length - 1]] = value;
    setDraft({ mask_config: newMaskConfig });
  };

  const handleReset = () => {
    if (product) {
      setDraft({ 
        mask_config: JSON.parse(JSON.stringify(product.mask_config || {})),
        specs: JSON.parse(JSON.stringify(product.specs || {}))
      });
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-4">
        <div 
          ref={containerRef}
          className="bg-gray-100 rounded-xl overflow-hidden border border-gray-200 relative h-[600px] flex items-center justify-center select-none"
        >
          <img 
            ref={imgRef}
            src={draft.base_image} 
            alt="Base Preview" 
            className="w-full h-full object-contain shadow-lg pointer-events-none"
            onLoad={updateImgRect}
          />
          <div 
            style={overlayStyle}
            onPointerDown={(e) => handlePointerDown(e, 'move')}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div className="absolute -top-6 left-0 bg-red-600 text-white text-[10px] px-1 rounded whitespace-nowrap pointer-events-none">
              印刷區域: {size.w}x{size.h} cm
            </div>
            {/* Resize Handle */}
            <div 
              className="absolute right-[-5px] bottom-[-5px] w-[10px] h-[10px] bg-red-600 cursor-nwse-resize z-20"
              onPointerDown={(e) => {
                e.stopPropagation();
                handlePointerDown(e, 'resize');
              }}
            />
          </div>
        </div>
        <div className="flex justify-between items-center text-xs text-gray-500 bg-white p-3 rounded-lg border border-gray-200">
          <div className="flex gap-4">
            <span>底圖尺寸: {specsWidth} x {specsHeight} cm</span>
            <span>比例: {renderedRect ? (renderedRect.width / specsWidth).toFixed(2) : '-'} px/cm</span>
          </div>
          <p>紅框僅為預覽，不影響底圖比例</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-800">視覺校準</h2>
            <button 
              onClick={handleReset}
              className="text-gray-400 hover:text-blue-600 p-1 rounded-md hover:bg-blue-50 transition-colors"
              title="重置為原始設定"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <Maximize2 className="w-4 h-4" />
              <span>印刷區域尺寸 (Size cm)</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">寬度 (W)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={size.w}
                  onChange={(e) => handleUpdateConfig('size.w', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">高度 (H)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={size.h}
                  onChange={(e) => handleUpdateConfig('size.h', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
              <AlertCircle className="w-4 h-4" />
              <span>印刷位移 (Offset cm)</span>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1">X 位移 (Left)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={offset.x}
                  onChange={(e) => handleUpdateConfig('offset.x', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Y 位移 (Top)</label>
                <input 
                  type="number" 
                  step="0.01"
                  value={offset.y}
                  onChange={(e) => handleUpdateConfig('offset.y', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-4 border-t border-gray-100">
             <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">底圖規格 (Read-only)</h3>
             <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
               <div className="flex justify-between p-2 bg-gray-50 rounded">
                 <span>畫布寬度</span>
                 <span className="font-mono">{specsWidth} cm</span>
               </div>
               <div className="flex justify-between p-2 bg-gray-50 rounded">
                 <span>畫布高度</span>
                 <span className="font-mono">{specsHeight} cm</span>
               </div>
             </div>
          </div>

          <button
            onClick={save}
            disabled={!isDirty || saving}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold transition-all ${
              !isDirty || saving
                ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-green-600 text-white hover:bg-green-700 shadow-md active:scale-95'
            }`}
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            儲存視覺配置
          </button>

          {isDirty && (
            <p className="text-center text-xs text-amber-600 animate-pulse">
              尚未儲存變更
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default VisualTab;
