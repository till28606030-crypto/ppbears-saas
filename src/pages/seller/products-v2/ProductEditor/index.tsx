import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProductEditor } from '../hooks/useProductEditor';
import { Loader2, ArrowLeft, Save, AlertCircle, Upload, Image as ImageIcon, Check, ChevronRight, Layout, Info, ExternalLink, Share2, Sparkles } from 'lucide-react';
import VisualTab from './tabs/VisualTab';
import PreviewTab from './tabs/PreviewTab';
import AttributeSettingsTab from './tabs/AttributeSettingsTab';
import { buildDesignShareUrl, copyToClipboard } from '../shared/shareLink';
import { CategoryTreeSelect } from '@/components/CategoryTreeSelect';
import { useOptionItems } from '../hooks/useOptionItems';

const STEPS = [
  { id: 1, title: '基本資料與尺寸' },
  { id: 2, title: '圖檔上傳' },
  { id: 3, title: '屬性與關聯規格' },
  { id: 4, title: '視覺配置' },
  { id: 5, title: '預覽發佈' },
];

const ProductEditorV2: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<number>(1);

  const editor = useProductEditor();
  const {
    draft,
    loading,
    saving,
    isDirty,
    error,
    load,
    setDraft,
    save,
    uploadBaseImage,
    uploadMaskImage
  } = editor;

  const { optionItems, optionGroups, loading: optionItemsLoading } = useOptionItems();

  const baseImageInputRef = useRef<HTMLInputElement>(null);
  const maskImageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (id) {
      load(id);
    }
  }, [id, load]);

  const handleSaveDraft = async () => {
    const result = await save();
    if (result.success) {
      alert('草稿儲存成功！');
    } else {
      alert(`儲存失敗: ${result.error}`);
    }
  };

  const handlePublish = async () => {
    const result = await save();
    if (result.success) {
      alert('產品已成功發佈！');
      navigate(`/seller/products-v2`);
    } else {
      alert(`發佈失敗: ${result.error}`);
    }
  };

  const updateSpecs = (partial: any) => {
    setDraft({
      specs: {
        ...(draft?.specs || {}),
        ...partial
      }
    });
  };

  const checkImageRatio = (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      if (!draft?.specs?.width_mm || !draft?.specs?.height_mm) {
        resolve(true); // Skip check if dimensions are not set
        return;
      }

      const targetRatio = draft.specs.width_mm / draft.specs.height_mm;
      const img = new Image();
      img.onload = () => {
        const imgRatio = img.width / img.height;
        // Allow 5% error margin
        const diff = Math.abs(imgRatio - targetRatio) / targetRatio;
        if (diff > 0.05) {
          const proceed = window.confirm(`⚠️ 上傳警告\n\n您上傳的底圖長寬比 (${img.width}x${img.height}) 與第一步驟設定的實體尺寸 (${draft.specs.width_mm}x${draft.specs.height_mm} mm) 比例不符（誤差超過 5%）。\n\n這可能會導致印製出來的圖案變形或位移。確定仍要繼續使用此圖片嗎？`);
          resolve(proceed);
        } else {
          resolve(true);
        }
      };
      img.onerror = () => resolve(true); // Ignore read error for check
      img.src = URL.createObjectURL(file);
    });
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'base' | 'mask') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'base') {
      const isRatioOk = await checkImageRatio(file);
      if (!isRatioOk) {
        e.target.value = '';
        return; // aborted by user
      }
      await uploadBaseImage(file);
    } else {
      await uploadMaskImage(file);
    }
    // Clear input
    e.target.value = '';
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
        <p className="text-gray-500">載入產品資料中...</p>
      </div>
    );
  }

  const isSaveDisabled = !draft?.base_image || saving;

  return (
    <div className="p-6 max-w-5xl mx-auto pb-20">
      <div className="flex items-center gap-4 mb-8">
        <button
          onClick={() => navigate('/seller/products-v2')}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-bold text-gray-800">
          {id === 'new' ? '新增產品 (逐步精靈)' : `編輯產品: ${draft?.name || id}`}
        </h1>
      </div>

      {/* Editor Wizard Steps */}
      <div className="mb-10 px-4">
        <div className="flex items-center justify-between relative">
          <div className="absolute left-[10%] top-1/2 -translate-y-1/2 w-[80%] h-[2px] bg-gray-200" />
          <div
            className="absolute left-[10%] top-1/2 -translate-y-1/2 h-[2px] bg-blue-600 transition-all duration-300"
            style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 80}%` }}
          />
          {STEPS.map((step) => {
            const isActive = currentStep === step.id;
            const isCompleted = currentStep > step.id;
            return (
              <div
                key={step.id}
                className="relative z-10 flex flex-col items-center gap-2 group transition-all cursor-pointer w-20"
                onClick={() => setCurrentStep(step.id)}
              >
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm border-2 transition-colors ${isActive ? 'border-blue-600 bg-blue-600 text-white shadow-md shadow-blue-200' :
                  isCompleted ? 'border-green-500 bg-green-500 text-white' :
                    'border-gray-200 bg-white text-gray-400 hover:border-blue-300'
                  }`}>
                  {isCompleted ? <Check className="w-5 h-5" /> : step.id}
                </div>
                <div className={`text-xs font-medium whitespace-nowrap ${isActive ? 'text-blue-700 font-bold' :
                  isCompleted ? 'text-green-600' :
                    'text-gray-400'
                  }`}>
                  {step.title}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {isDirty && (
        <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-blue-700 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>尚未儲存變更，請記得在完成修改後點擊儲存。</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span>錯誤: {error}</span>
        </div>
      )}

      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-8">
          {/* STEP 1: Basic Info */}
          {currentStep === 1 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-gray-800">1. 基本資料與實體尺寸</h2>
                <p className="text-sm text-gray-500">設置產品的基礎資料與實際印製大小，此尺寸必須十分精確。</p>
              </div>

              <div className="grid grid-cols-2 gap-6 bg-gray-50 p-6 rounded-xl border border-gray-100">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">產品名稱 <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={draft?.name || ''}
                    onChange={(e) => setDraft({ name: e.target.value })}
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white shadow-sm"
                    placeholder="例如: iPhone 14 Pro 透明防摔殼"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">產品類別</label>
                  <CategoryTreeSelect
                    value={draft?.category_id || null}
                    onChange={(categoryId) => setDraft({ category_id: categoryId })}
                    placeholder="選擇產品類別"
                  />
                </div>
              </div>

              <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 relative overflow-hidden">
                <div className="absolute right-0 top-0 opacity-10 pointer-events-none">
                  <Layout className="w-32 h-32 -mt-4 -mr-4 text-blue-600" />
                </div>
                <div className="relative z-10">
                  <h3 className="text-base font-semibold text-blue-900 mb-2 flex items-center gap-2">
                    <Layout className="w-5 h-5 text-blue-600" />
                    印刷實體尺寸 (單位: 毫米 MM)
                  </h3>
                  <p className="text-sm text-blue-700/80 mb-6 max-w-2xl text-balance">
                    這組尺寸會攸關最終送印的設計檔案比例與生成結果，請精確填寫。
                    在下一步上傳圖片時，系統將會根據此處的長寬比幫您驗證圖片是否相符！
                  </p>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="block text-sm font-bold text-blue-900 mb-2">寬度 Width (MM) <span className="text-red-500">*</span></label>
                      <input
                        type="number"
                        min="1"
                        step="0.1"
                        value={draft?.specs?.width_mm || ''}
                        onChange={(e) => updateSpecs({ width_mm: Number(e.target.value) })}
                        className="w-full px-4 py-2.5 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-mono shadow-sm"
                        placeholder="例如: 76.9"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-bold text-blue-900 mb-2">高度 Height (MM) <span className="text-red-500">*</span></label>
                      <input
                        type="number"
                        min="1"
                        step="0.1"
                        value={draft?.specs?.height_mm || ''}
                        onChange={(e) => updateSpecs({ height_mm: Number(e.target.value) })}
                        className="w-full px-4 py-2.5 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-mono shadow-sm"
                        placeholder="例如: 162.0"
                      />
                    </div>
                  </div>

                  <div className="mt-6 pt-6 border-t border-blue-100">
                    <label className="block text-sm font-bold text-blue-900 mb-2 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-blue-600" />
                      AI 每日使用上限 (次數)
                    </label>
                    <div className="flex items-center gap-4">
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={draft?.specs?.ai_usage_limit ?? 10}
                        onChange={(e) => updateSpecs({ ai_usage_limit: Number(e.target.value) })}
                        className="w-32 px-4 py-2.5 border border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white font-mono shadow-sm"
                      />
                      <p className="text-xs text-blue-700/70">
                        設定使用者每天可免費使用「卡通化」或「去背」的總次數。預設為 10 次。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Images Upload */}
          {currentStep === 2 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-gray-800">2. 圖檔上傳</h2>
                <p className="text-sm text-gray-500">上傳產品的基礎圖層與裁切遮罩圖層。</p>
              </div>

              {!draft?.specs?.width_mm || !draft?.specs?.height_mm ? (
                <div className="p-4 bg-amber-50 rounded-lg border border-amber-200 flex items-start gap-3 text-amber-800">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <strong>尚未設定實體尺寸：</strong> 系統無法幫您驗證圖片比例是否正確。建議退回「上一步」填寫實體尺寸 (MM) 後再上傳，以免日後印刷產生變形問題。
                  </div>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-8">
                {/* Base Image Upload */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-sm font-bold text-gray-800">產品底圖 (Base Image) <span className="text-red-500">*</span></label>
                    {draft?.specs?.width_mm && draft?.specs?.height_mm && (
                      <span className="text-[10px] font-mono bg-gray-100 text-gray-500 px-2 py-1 rounded">
                        建議比例 {(draft.specs.width_mm / draft.specs.height_mm).toFixed(4)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">這是使用者看見的基本圖層，也是定義編輯框邊界的基礎。底圖形狀長寬必須等於「實體尺寸」。</p>
                  <div
                    onClick={() => baseImageInputRef.current?.click()}
                    className={`aspect-square w-full max-w-[300px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${draft?.base_image ? 'border-blue-300 bg-blue-50/50 shadow-sm' : 'border-gray-300 hover:border-blue-400 bg-gray-50 hover:bg-blue-50'
                      }`}
                  >
                    {draft?.base_image ? (
                      <div className="relative w-full h-full group">
                        <img src={draft.base_image} alt="Base" className="w-full h-full object-contain p-4" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-white font-medium flex items-center gap-2"><Upload className="w-4 h-4" /> 重新上傳</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-6 text-center">
                        <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4">
                          <Upload className="w-8 h-8 text-blue-500" />
                        </div>
                        <span className="text-sm font-bold text-gray-700 mb-1">點擊上傳產品底圖</span>
                        <span className="text-xs text-gray-400">支援 PNG, JPG 格式 (具透明背景尤佳)</span>
                      </div>
                    )}
                  </div>
                  <input type="file" ref={baseImageInputRef} onChange={(e) => onFileChange(e, 'base')} className="hidden" accept="image/*" />
                </div>

                {/* Mask Image Upload */}
                <div className="space-y-3">
                  <label className="block text-sm font-bold text-gray-800">遮罩圖 (Mask / Overlay Image)</label>
                  <p className="text-xs text-gray-500 leading-relaxed">遮罩層用於限制使用者的設計與預覽區域邊界（例如相機孔挖空、產品光影覆蓋等）。不需要遮罩圖的產品可忽略。</p>
                  <div
                    onClick={() => maskImageInputRef.current?.click()}
                    className={`aspect-square w-full max-w-[300px] border-2 border-dashed rounded-2xl flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden ${draft?.mask_image ? 'border-purple-300 bg-purple-50/50 shadow-sm' : 'border-gray-300 hover:border-purple-400 bg-gray-50 hover:bg-purple-50'
                      }`}
                  >
                    {draft?.mask_image ? (
                      <div className="relative w-full h-full group">
                        <img src={draft.mask_image} alt="Mask" className="w-full h-full object-contain p-4" />
                        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <span className="text-white font-medium flex items-center gap-2"><Upload className="w-4 h-4" /> 重新上傳</span>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center p-6 text-center">
                        <div className="w-16 h-16 bg-white rounded-full shadow-sm flex items-center justify-center mb-4">
                          <ImageIcon className="w-8 h-8 text-purple-500" />
                        </div>
                        <span className="text-sm font-bold text-gray-700 mb-1">點擊上傳遮罩圖</span>
                        <span className="text-xs text-gray-400">若無遮罩需求可略過此步</span>
                      </div>
                    )}
                  </div>
                  <input type="file" ref={maskImageInputRef} onChange={(e) => onFileChange(e, 'mask')} className="hidden" accept="image/*" />
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: Attributes */}
          {currentStep === 3 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-gray-800">3. 屬性與關聯規格</h2>
                <p className="text-sm text-gray-500">勾選此產品可使用的規格群組（Step），並編輯專屬進階屬性。</p>
              </div>

              <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                <h3 className="text-base font-semibold text-gray-800 mb-4 flex items-center gap-2">
                  <Check className="w-5 h-5 text-blue-600" /> 綁定通用規格群組
                </h3>
                {optionItemsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {[...optionGroups]
                      .sort((a, b) => ((a as any).ui_config?.step || 1) - ((b as any).ui_config?.step || 1))
                      .map((group) => {
                        const linkedGroups = draft?.specs?.linked_option_groups || [];
                        const isChecked = linkedGroups.includes(group.id);

                        return (
                          <label
                            key={group.id}
                            className={`flex items-center gap-3 p-3 border rounded-xl cursor-pointer transition-all ${isChecked ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-gray-200 hover:border-blue-300'}`}
                          >
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={(e) => {
                                const currentLinked = draft?.specs?.linked_option_groups || [];
                                const newLinked = e.target.checked
                                  ? [...currentLinked, group.id]
                                  : currentLinked.filter(id => id !== group.id);
                                updateSpecs({ linked_option_groups: newLinked });
                              }}
                              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 mt-1"
                            />
                            <div className="flex items-center gap-3 flex-1">
                              <div className="flex flex-col items-center justify-center bg-gray-100 rounded px-2 py-1 min-w-[2.5rem]">
                                <span className="text-[10px] text-gray-500 font-bold uppercase">Step</span>
                                <span className="text-base font-bold leading-none text-gray-800">
                                  {(group as any).ui_config?.step || 1}
                                </span>
                              </div>
                              <div className="flex-1">
                                <div className="text-sm font-bold text-gray-800">{group.name}</div>
                                {group.price_modifier !== 0 && (
                                  <div className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded w-fit mt-1">
                                    加價: {group.price_modifier > 0 ? '+' : ''}{group.price_modifier} 元
                                  </div>
                                )}
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    {optionGroups.length === 0 && (
                      <div className="text-center py-8 text-gray-400 col-span-2">尚無產品規格資料可以綁定</div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-100">
                <h3 className="text-base font-semibold text-gray-800 mb-4">進階屬性設定 (Advanced Attributes)</h3>
                <AttributeSettingsTab draft={draft} setDraft={editor.setDraft} />
              </div>
            </div>
          )}

          {/* STEP 4: Visual Layout */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-1 mb-6">
                <h2 className="text-xl font-semibold text-gray-800">4. 視覺佈局配置</h2>
                <p className="text-sm text-gray-500">預覽與調整編輯器的安全區、畫布偏移等進階渲染設定。</p>
              </div>
              <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                <VisualTab editor={editor} />
              </div>
            </div>
          )}

          {/* STEP 5: Preview */}
          {currentStep === 5 && (
            <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-gray-800">5. 預覽與發佈</h2>
                <p className="text-sm text-gray-500">最後檢視產品的呈現樣貌。確認無誤後，發佈儲存產品，並獲取客戶專屬連結。</p>
              </div>

              {/* Status and Links Box */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Publish Status */}
                <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                  <h3 className="font-semibold text-gray-800 mb-4">發佈狀態檢核</h3>
                  <ul className="space-y-3">
                    <li className="flex items-center gap-3 text-sm">
                      {draft?.name ? <Check className="w-5 h-5 text-green-500" /> : <AlertCircle className="w-5 h-5 text-amber-500" />}
                      <span className={draft?.name ? "text-gray-700 font-medium" : "text-amber-700"}>產品名稱</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      {draft?.specs?.width_mm && draft?.specs?.height_mm ? <Check className="w-5 h-5 text-green-500" /> : <AlertCircle className="w-5 h-5 text-amber-500" />}
                      <span className={draft?.specs?.width_mm ? "text-gray-700 font-medium" : "text-amber-700"}>設定實體尺寸</span>
                    </li>
                    <li className="flex items-center gap-3 text-sm">
                      {draft?.base_image ? <Check className="w-5 h-5 text-green-500" /> : <AlertCircle className="w-5 h-5 text-red-500" />}
                      <span className={draft?.base_image ? "text-gray-700 font-medium" : "text-red-700 font-bold"}>必須上傳 Base Image</span>
                    </li>
                  </ul>

                  {/* Developer Info */}
                  <div className="mt-6 pt-4 border-t border-gray-200">
                    <h4 className="text-xs font-bold text-gray-400 mb-2 uppercase tracking-wider">Debug JSON Data</h4>
                    <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg overflow-auto max-h-[150px] text-[10px] font-mono">
                      {JSON.stringify(draft, null, 2)}
                    </pre>
                  </div>
                </div>

                {/* Share Links */}
                <div className="bg-gray-50 p-6 rounded-xl border border-gray-200">
                  <h3 className="font-semibold text-gray-800 mb-4">分享連結</h3>
                  {(() => {
                    const result = buildDesignShareUrl(draft?.id);
                    if (id === 'new') {
                      return (
                        <div className="p-4 bg-white border border-gray-100 rounded-lg text-gray-500 text-sm flex gap-3 shadow-sm items-center h-[120px] justify-center">
                          <Info className="w-5 h-5 shrink-0 text-blue-400" />
                          <span>儲存並發佈後將產生客戶設計連結。</span>
                        </div>
                      );
                    }
                    if (result.url) {
                      return (
                        <div className="space-y-4">
                          <div className="p-3 bg-white rounded-lg border border-gray-200 break-all text-xs font-mono text-gray-600 shadow-inner">
                            {result.url}
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              onClick={async () => {
                                const ok = await copyToClipboard(result.url!);
                                if (ok) alert('分享連結已複製！');
                              }}
                              className="flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-gray-200 shadow-sm rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 active:scale-95 transition-all"
                            >
                              <Share2 className="w-4 h-4 text-blue-500" />
                              複製連結給客戶
                            </button>
                            <button
                              onClick={() => window.open(result.url!, '_blank')}
                              className="flex items-center justify-center gap-2 py-2.5 px-4 bg-white border border-gray-200 shadow-sm rounded-lg text-sm font-bold text-gray-700 hover:bg-gray-50 active:scale-95 transition-all"
                            >
                              <ExternalLink className="w-4 h-4 text-green-500" />
                              前台開啓首頁
                            </button>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-xs flex flex-col gap-2">
                        <strong>無效的 VITE_CANONICAL_ORIGIN，無法生成連結</strong>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Real Preview visual box */}
              <div>
                <h3 className="font-semibold text-gray-800 mb-4">最終視覺預覽</h3>
                <div className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden shadow-inner flex justify-center py-10">
                  <PreviewTab draft={draft} />
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Wizard Footer Actions Container */}
        <div className="bg-gray-50 px-8 py-5 border-t border-gray-200 flex items-center justify-between">
          <button
            onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
            disabled={currentStep === 1}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-lg font-bold transition-all ${currentStep === 1 ? 'opacity-0 pointer-events-none' : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100 shadow-sm'}`}
          >
            上一步
          </button>
          <div className="flex gap-4">
            <button
              onClick={handleSaveDraft}
              disabled={saving || !isDirty}
              className="flex items-center gap-2 px-6 py-2.5 border border-gray-300 bg-white rounded-lg text-gray-700 hover:bg-gray-50 shadow-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              隨時儲存草稿
            </button>

            {currentStep < 5 ? (
              <button
                onClick={() => setCurrentStep(prev => prev + 1)}
                className="flex items-center gap-2 px-8 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-md font-bold transition-colors shadow-blue-200"
              >
                下一步 <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={handlePublish}
                disabled={isSaveDisabled}
                className={`flex items-center justify-center gap-2 px-8 py-2.5 rounded-lg font-bold transition-all shadow-md ${isSaveDisabled
                  ? 'bg-gray-300 text-gray-500 cursor-not-allowed shadow-none'
                  : 'bg-green-600 text-white hover:bg-green-500 shadow-green-200 active:scale-95'
                  }`}
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
                確認發佈完成
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductEditorV2;
