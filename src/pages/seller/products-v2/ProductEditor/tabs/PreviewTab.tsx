import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ProductRow } from '../../shared/types';
import { AlertCircle, Info, Maximize2, Move } from 'lucide-react';
import { computeRenderedRect, computeOverlayStyle, RenderedRect } from '../../shared/visualMath';

interface PreviewTabProps {
  draft: ProductRow | null;
}

const PreviewTab: React.FC<PreviewTabProps> = ({ draft }) => {
  const [renderedRect, setRenderedRect] = useState<RenderedRect | null>(null);
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

  if (!draft?.base_image) {
    return (
      <div className="flex flex-col items-center justify-center h-64 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl">
        <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
        <h3 className="text-lg font-medium text-gray-800">無預覽資料</h3>
        <p className="text-gray-500 text-sm">請先上傳底圖。</p>
      </div>
    );
  }

  const specs = draft.specs || {};
  const maskConfig = draft.mask_config || {};
  const size = maskConfig.size || { w: 0, h: 0 };
  const offset = maskConfig.offset || { x: 0, y: 0 };
  const specsWidth = specs.width || 10; 
  const specsHeight = specs.height || 10;

  const renderBoxStyle: React.CSSProperties = renderedRect ? {
    position: 'absolute',
    width: `${renderedRect.width}px`,
    height: `${renderedRect.height}px`,
    left: `${renderedRect.left}px`,
    top: `${renderedRect.top}px`,
  } : { display: 'none' };

  let overlayStyle: React.CSSProperties = { display: 'none' };
  if (renderedRect) {
    overlayStyle = computeOverlayStyle(renderedRect, specsWidth, specsHeight, size, offset);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      {/* Left: Read-only Preview */}
      <div className="lg:col-span-2 space-y-4">
        <div 
          ref={containerRef}
          className="bg-white rounded-xl overflow-hidden border border-gray-200 relative h-[600px] flex items-center justify-center"
        >
          <img 
            ref={imgRef}
            src={draft.base_image} 
            alt="Base Preview" 
            className="object-contain"
            style={renderBoxStyle}
            onLoad={updateImgRect}
          />
          <div style={overlayStyle}>
            <div className="absolute -top-6 left-0 bg-red-600/80 text-white text-[10px] px-1 rounded whitespace-nowrap">
              印刷區域: {size.w}x{size.h} cm
            </div>
          </div>
          
          {/* Mask Image Overlay (Semi-transparent) */}
          {draft.mask_image && (
            <img 
              src={draft.mask_image} 
              alt="Mask Overlay" 
              className="pointer-events-none opacity-30 mix-blend-multiply"
              style={renderBoxStyle}
            />
          )}
        </div>
      </div>

      {/* Right: Info Panel (Read-only) */}
      <div className="space-y-6">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-6">
          <div className="flex items-center gap-2 mb-2">
            <Info className="w-5 h-5 text-blue-500" />
            <h2 className="text-lg font-bold text-gray-800">預覽資訊</h2>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-600">
                <Maximize2 className="w-4 h-4" />
                <span>印刷尺寸 (cm)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <span className="block text-xs text-gray-400">寬度</span>
                  <span className="font-mono font-bold">{size.w}</span>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <span className="block text-xs text-gray-400">高度</span>
                  <span className="font-mono font-bold">{size.h}</span>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-600">
                <Move className="w-4 h-4" />
                <span>印刷位移 (cm)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <span className="block text-xs text-gray-400">X (Left)</span>
                  <span className="font-mono font-bold">{offset.x}</span>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <span className="block text-xs text-gray-400">Y (Top)</span>
                  <span className="font-mono font-bold">{offset.y}</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-gray-100 space-y-3">
              <h3 className="text-xs font-bold text-gray-400 uppercase">產品規格摘要</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">底圖寬度</span>
                  <span className="font-mono">{specsWidth} cm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">底圖高度</span>
                  <span className="font-mono">{specsHeight} cm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">DPI</span>
                  <span className="font-mono">{specs.dpi || 300}</span>
                </div>
                {specs.bleed && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">出血 (T/R/B/L)</span>
                    <span className="font-mono text-xs">
                      {specs.bleed.top}/{specs.bleed.right}/{specs.bleed.bottom}/{specs.bleed.left}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-xs text-blue-700 leading-relaxed">
          <p className="font-bold mb-1">Preview 模式</p>
          <p>此分頁為唯讀狀態，僅用於最終效果檢查。若需調整位置或尺寸，請切換至「視覺配置」分頁。</p>
        </div>
      </div>
    </div>
  );
};

export default PreviewTab;
