import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Sparkles, Loader2, Trash2, ImagePlus } from 'lucide-react';
import MyGalleryModal from './MyGalleryModal';
import AiUsageBadge from './AiUsageBadge';

interface StylePreset {
  id: string;
  label: string;
  emoji: string;
  prompt: string;
  max_photos: number;
}

interface DesignCollageModalProps {
  isOpen: boolean;
  onClose: () => void;
  onResult: (result: { bgUrl: string; cutoutUrls: string[] }) => void;
  productSpecs?: {
    width_mm?: number;
    height_mm?: number;
    dpi?: number;
  };
  initialImages?: string[];
  /** 呼叫前先檢查使用次數，若已到上限回傳 false 並自動顯示限制 Modal */
  onCheckAndIncrementUsage?: () => Promise<boolean> | boolean;
  /** 傳入 product ID 供 badge 顯示當日點數 */
  productId?: string | null;
  /** 外部觸發 badge 更新 */
  usageRefreshTrigger?: number;
}

export default function DesignCollageModal({
  isOpen,
  onClose,
  onResult,
  productSpecs,
  initialImages,
  onCheckAndIncrementUsage,
  productId,
  usageRefreshTrigger = 0,
}: DesignCollageModalProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [styles, setStyles] = useState<StylePreset[]>([]);
  const [selectedStyle, setSelectedStyle] = useState<StylePreset | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingStyles, setLoadingStyles] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showGallery, setShowGallery] = useState(false);

  // Load styles from Supabase
  useEffect(() => {
    if (!isOpen) return;
    const loadStyles = async () => {
      setLoadingStyles(true);
      try {
        const { data, error } = await supabase
          .from('ai_style_presets')
          .select('id, label, emoji, prompt, max_photos')
          .eq('is_active', true)
          .order('sort_order', { ascending: true });
        if (error) throw error;
        setStyles(data || []);
      } catch (err) {
        console.error('Failed to load AI styles:', err);
      } finally {
        setLoadingStyles(false);
      }
    };
    loadStyles();
  }, [isOpen]);

  // Clean up previews on unmount
  useEffect(() => {
    return () => {
      previews.forEach(url => URL.revokeObjectURL(url));
    };
  }, [previews]);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setFiles([]);
      setPreviews([]);
      setSelectedStyle(null);
      setError(null);
      setIsGenerating(false);
      
      if (initialImages && initialImages.length > 0) {
        handleGalleryApply(initialImages);
      }
    }
  }, [isOpen, initialImages]);

  const handleGalleryApply = async (src: string | string[]) => {
    try {
      const srcArray = Array.isArray(src) ? src : [src];
      
      const limit = selectedStyle?.max_photos ?? (styles.length > 0 ? styles[0].max_photos : 3);
      if (files.length + srcArray.length > limit) {
        setError(`最多上傳 ${limit} 張照片`);
        return; // Alternatively, we could just slice the array, but rejecting is safer
      }

      // Convert all base64 dataURLs back to Files
      const newFiles = await Promise.all(
        srcArray.map(async (dataUrl, index) => {
          const res = await fetch(dataUrl);
          const blob = await res.blob();
          return new File([blob], `gallery_image_${Date.now()}_${index}.png`, { type: blob.type });
        })
      );

      const combinedLimit = selectedStyle?.max_photos ?? (styles.length > 0 ? styles[0].max_photos : 3);
      const combined = [...files, ...newFiles].slice(0, combinedLimit);
      setFiles(combined);

      // Generate local previews
      const newPreviews = combined.map(f => URL.createObjectURL(f));
      previews.forEach(url => URL.revokeObjectURL(url));
      setPreviews(newPreviews);
      
      setError(null);
    } catch (err) {
      console.error('Failed to process gallery image:', err);
      setError('無法處理選擇的圖片');
    }
  };

  const removeFile = (index: number) => {
    URL.revokeObjectURL(previews[index]);
    setFiles(prev => prev.filter((_, i) => i !== index));
    setPreviews(prev => prev.filter((_, i) => i !== index));
  };

  const handleGenerate = async () => {
    if (files.length === 0 || !selectedStyle) return;

    // Check & increment daily AI usage limit before generating
    if (onCheckAndIncrementUsage) {
      const allowed = await onCheckAndIncrementUsage();
      if (!allowed) return; // limit reached, modal already shown by parent
    }

    setIsGenerating(true);
    setError(null);

    try {
      // Convert Files to Base64
      const getBase64 = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.readAsDataURL(file);
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = error => reject(error);
        });
      };
      
      const base64Images = await Promise.all(files.map(getBase64));

      const apiOrigin = import.meta.env.VITE_API_ORIGIN || '';

      // 1. Generate stylized background
      const bgPayload = {
        mode: 'background',
        stylePrompt: selectedStyle.prompt,
        widthMm: productSpecs?.width_mm,
        heightMm: productSpecs?.height_mm,
        dpi: productSpecs?.dpi
      };

      const bgPromise = fetch(`${apiOrigin}/api/ai/design-collage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bgPayload),
      }).then(async r => {
        if (!r.ok) {
          let errData;
          try { errData = await r.json(); } catch { errData = {}; }
          throw new Error(errData.message || '背景生成失敗');
        }
        const data = await r.json();
        if (!data.success || !data.url) throw new Error('背景生成無效');
        return data.url;
      });

      // 2. Remove backgrounds for each character image
      const cutoutPromises = base64Images.map(imgB64 =>
        fetch(`${apiOrigin}/api/ai/remove-bg`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageUrl: imgB64 })
        }).then(async r => {
          if (!r.ok) {
            let errData;
            try { errData = await r.json(); } catch { errData = {}; }
            throw new Error(errData.message || '去背處理失敗');
          }
          const data = await r.json();
          if (!data.success || !data.url) throw new Error('去背結果無效');
          return data.url;
        })
      );

      // Wait for all to finish
      const [bgUrl, ...cutoutUrls] = await Promise.all([bgPromise, ...cutoutPromises]);

      onResult({ bgUrl, cutoutUrls });
      onClose();
    } catch (err: any) {
      console.error('Design collage failed:', err);
      setError(err.message || 'AI 生成失敗，請稍後再試');
    } finally {
      setIsGenerating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col mr-auto ml-4">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between shrink-0">
          <h3 className="font-bold text-gray-900 flex items-center gap-2 text-lg">
            <Sparkles className="w-5 h-5 text-purple-600" />
            AI 創意生成
          </h3>
          <button onClick={onClose} disabled={isGenerating} className="text-gray-400 hover:text-gray-600 disabled:opacity-50">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* AI 點數徽章 */}
        <AiUsageBadge productId={productId} refreshTrigger={usageRefreshTrigger} />

        {/* Body - scrollable */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Step 1: Upload Photos */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              📸 上傳照片（1-{selectedStyle?.max_photos ?? (styles.length > 0 ? styles[0].max_photos : 3)} 張）
            </label>
            <div className="grid grid-cols-5 gap-2 mb-2">
              {previews.map((src, i) => (
                <div key={i} className="relative aspect-square rounded-lg overflow-hidden border-2 border-purple-200 group">
                  <img src={src} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
                  <button
                    onClick={() => removeFile(i)}
                    disabled={isGenerating}
                    className="absolute top-1 right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {files.length < (selectedStyle?.max_photos ?? (styles.length > 0 ? styles[0].max_photos : 3)) && (
                <button
                  onClick={() => setShowGallery(true)}
                  disabled={isGenerating}
                  className="aspect-square rounded-lg border-2 border-dashed border-gray-300 hover:border-purple-400 flex flex-col items-center justify-center text-gray-400 hover:text-purple-500 transition-colors disabled:opacity-50"
                >
                  <ImagePlus className="w-6 h-6" />
                  <span className="text-[9px] mt-1">新增</span>
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-400">
              已選 {files.length} / {selectedStyle?.max_photos ?? (styles.length > 0 ? styles[0].max_photos : 3)} 張
            </p>
          </div>

          {/* Step 2: Choose Style */}
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              🎨 選擇設計風格
            </label>
            {loadingStyles ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="w-5 h-5 animate-spin text-purple-500" />
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {styles.map(style => {
                  const isSelected = selectedStyle?.id === style.id;
                  const isExceeding = files.length > (style.max_photos || 3);
                  return (
                  <button
                    key={style.id}
                    onClick={() => {
                        if (isExceeding) {
                            setError(`切換至 ${style.label} 失敗：該風格最多允許 ${style.max_photos || 3} 張照片`);
                            return;
                        }
                        setSelectedStyle(style);
                        setError(null);
                    }}
                    disabled={isGenerating || isExceeding}
                    className={`p-3 rounded-xl border-2 text-center transition-all ${
                      isSelected
                        ? 'border-purple-500 bg-purple-50 shadow-sm scale-[1.02]'
                        : isExceeding 
                          ? 'border-gray-200 opacity-40 cursor-not-allowed'
                          : 'border-gray-200 hover:border-purple-300 hover:bg-purple-50/50'
                    } disabled:opacity-50 relative`}
                  >
                    <span className="text-2xl block mb-1">{style.emoji}</span>
                    <span className="text-xs font-bold text-gray-700">{style.label}</span>
                    {isExceeding && (
                      <div className="absolute inset-0 bg-white/50 flex items-center justify-center rounded-xl">
                        <span className="text-[10px] bg-red-100 text-red-600 px-1 py-0.5 rounded font-bold">上限 {style.max_photos||5} 張</span>
                      </div>
                    )}
                  </button>
                )})}
              </div>
            )}
          </div>

          {/* Error Display */}
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              ❌ {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2.5 text-gray-600 hover:bg-gray-100 rounded-lg font-medium disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleGenerate}
            disabled={isGenerating || files.length === 0 || !selectedStyle}
            className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-bold hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                正在施展 AI 魔法...✨
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                開始 AI 生成
              </>
            )}
          </button>
        </div>

        {/* Generating Overlay */}
        {isGenerating && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10 rounded-2xl">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-gradient-to-r from-purple-500 to-indigo-500 animate-pulse flex items-center justify-center">
                <Sparkles className="w-10 h-10 text-white animate-spin" style={{ animationDuration: '3s' }} />
              </div>
              <div className="absolute -inset-2 rounded-full border-4 border-purple-300 animate-ping opacity-30" />
            </div>
            <p className="mt-6 text-lg font-bold text-gray-800">正在施展 AI 魔法... ✨</p>
            <p className="mt-2 text-sm text-gray-500">AI 正在將您的照片融合成精美設計，請稍候...</p>
            <p className="mt-1 text-xs text-gray-400">通常需要 15-30 秒</p>
          </div>
        )}
      </div>

      <MyGalleryModal
        isOpen={showGallery}
        onClose={() => setShowGallery(false)}
        onApply={handleGalleryApply}
        maxSelection={(selectedStyle?.max_photos ?? (styles.length > 0 ? styles[0].max_photos : 3)) - files.length}
      />
    </div>
  );
}
