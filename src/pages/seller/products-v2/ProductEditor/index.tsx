import React, { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProductEditor } from '../hooks/useProductEditor';
import { Loader2, ArrowLeft, Save, AlertCircle, Upload, Image as ImageIcon, Settings, Eye, Layout, Share2, ExternalLink, Info } from 'lucide-react';
import VisualTab from './tabs/VisualTab';
import PreviewTab from './tabs/PreviewTab';
import { buildDesignShareUrl, copyToClipboard } from '../shared/shareLink';
import { CategoryTreeSelect } from '@/components/CategoryTreeSelect';
import { useOptionItems } from '../hooks/useOptionItems';

const ProductEditorV2: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'base' | 'visual' | 'preview'>('base');

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

  const handleSave = async () => {
    const result = await save();
    if (result.success) {
      if (id === 'new') {
        navigate(`/seller/products-v2`);
      } else {
        alert('儲存成功！');
      }
    } else {
      alert(`儲存失敗: ${result.error}`);
    }
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>, type: 'base' | 'mask') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'base') {
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
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={() => navigate('/seller/products-v2')}
          className="p-2 hover:bg-gray-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>
        <h1 className="text-2xl font-bold text-gray-800">
          {id === 'new' ? '新增產品 V2' : `編輯產品: ${draft?.name || id}`}
        </h1>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-gray-200 mb-6 gap-8">
        <button
          onClick={() => setActiveTab('base')}
          className={`flex items-center gap-2 pb-4 text-sm font-medium transition-colors relative ${activeTab === 'base' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
        >
          <Settings className="w-4 h-4" />
          基本設定
          {activeTab === 'base' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button
          onClick={() => setActiveTab('visual')}
          className={`flex items-center gap-2 pb-4 text-sm font-medium transition-colors relative ${activeTab === 'visual' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
        >
          <Eye className="w-4 h-4" />
          視覺配置 (Visual)
          {activeTab === 'visual' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`flex items-center gap-2 pb-4 text-sm font-medium transition-colors relative ${activeTab === 'preview' ? 'text-blue-600' : 'text-gray-500 hover:text-gray-700'
            }`}
        >
          <Layout className="w-4 h-4" />
          預覽 (Preview)
          {activeTab === 'preview' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-600" />}
        </button>
      </div>

      {isDirty && (
        <div className="mb-6 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-2 text-blue-700 text-sm">
          <AlertCircle className="w-4 h-4" />
          <span>尚未儲存變更</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span>錯誤: {error}</span>
        </div>
      )}

      {activeTab === 'base' ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left Column: Form */}
          <div className="md:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 space-y-4">
              <h2 className="text-lg font-semibold">基本設定</h2>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">產品名稱</label>
                <input
                  type="text"
                  value={draft?.name || ''}
                  onChange={(e) => setDraft({ name: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="請輸入產品名稱"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">產品類別</label>
                <CategoryTreeSelect
                  value={draft?.category_id || null}
                  onChange={(categoryId) => setDraft({ category_id: categoryId })}
                  placeholder="選擇產品類別"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                {/* Base Image Upload */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">產品底圖 (Base Image) *</label>
                  <div
                    onClick={() => baseImageInputRef.current?.click()}
                    className={`aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors overflow-hidden ${draft?.base_image ? 'border-blue-200 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
                      }`}
                  >
                    {draft?.base_image ? (
                      <img src={draft.base_image} alt="Base" className="w-full h-full object-contain" />
                    ) : (
                      <>
                        <Upload className="w-8 h-8 text-gray-400 mb-2" />
                        <span className="text-xs text-gray-500">點擊上傳底圖</span>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    ref={baseImageInputRef}
                    onChange={(e) => onFileChange(e, 'base')}
                    className="hidden"
                    accept="image/*"
                  />
                </div>

                {/* Mask Image Upload */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">遮罩圖 (Mask Image)</label>
                  <div
                    onClick={() => maskImageInputRef.current?.click()}
                    className={`aspect-square border-2 border-dashed rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors overflow-hidden ${draft?.mask_image ? 'border-purple-200 bg-purple-50' : 'border-gray-300 hover:border-blue-400'
                      }`}
                  >
                    {draft?.mask_image ? (
                      <img src={draft.mask_image} alt="Mask" className="w-full h-full object-contain" />
                    ) : (
                      <>
                        <ImageIcon className="w-8 h-8 text-gray-400 mb-2" />
                        <span className="text-xs text-gray-500">點擊上傳遮罩</span>
                      </>
                    )}
                  </div>
                  <input
                    type="file"
                    ref={maskImageInputRef}
                    onChange={(e) => onFileChange(e, 'mask')}
                    className="hidden"
                    accept="image/*"
                  />
                </div>
              </div>
            </div>

            {/* 關聯的產品規格 */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold mb-4">關聯的產品規格</h2>
              <p className="text-sm text-gray-500 mb-4">選擇此產品模板可搭配的規格大類（Step 選項）</p>

              {optionItemsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                </div>
              ) : (
                <div className="space-y-3">
                  {[...optionGroups]
                    .sort((a, b) => ((a as any).ui_config?.step || 1) - ((b as any).ui_config?.step || 1))
                    .map((group) => {
                      const linkedGroups = draft?.specs?.linked_option_groups || [];
                      const isChecked = linkedGroups.includes(group.id);

                      return (
                        <label
                          key={group.id}
                          className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={(e) => {
                              const currentLinked = draft?.specs?.linked_option_groups || [];
                              const newLinked = e.target.checked
                                ? [...currentLinked, group.id]
                                : currentLinked.filter(id => id !== group.id);

                              setDraft({
                                specs: {
                                  ...(draft?.specs || {}),
                                  linked_option_groups: newLinked
                                }
                              });
                            }}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                          />
                          <div className="flex items-center gap-3 flex-1">
                            {/* Step Badge */}
                            <div className="flex flex-col items-center justify-center bg-gray-100 rounded px-2 py-1 min-w-[2.5rem]">
                              <span className="text-[10px] text-gray-500 font-bold uppercase">Step</span>
                              <span className="text-base font-bold leading-none text-gray-800">
                                {(group as any).ui_config?.step || 1}
                              </span>
                            </div>
                            {/* Group Info */}
                            <div className="flex-1">
                              <div className="text-sm font-medium text-gray-800">{group.name}</div>
                              {group.price_modifier !== 0 && (
                                <div className="text-xs text-gray-500">
                                  基礎加價: {group.price_modifier > 0 ? '+' : ''}{group.price_modifier} 元
                                </div>
                              )}
                            </div>
                            {/* Thumbnail */}
                            {(group as any).thumbnail && (
                              <img
                                src={(group as any).thumbnail}
                                alt={group.name}
                                className="w-12 h-12 object-cover rounded border border-gray-200"
                              />
                            )}
                          </div>
                        </label>
                      );
                    })}

                  {optionGroups.length === 0 && (
                    <div className="text-center py-8 text-gray-400">
                      尚無產品規格資料
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold mb-4">資料預覽 (JSON)</h2>
              <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto max-h-[400px] text-xs font-mono">
                {JSON.stringify(draft, null, 2)}
              </pre>
            </div>
          </div>

          {/* Right Column: Actions */}
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold mb-4">發佈狀態</h2>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Base Image:</span>
                  {draft?.base_image ? (
                    <span className="text-green-600 font-medium text-sm">已就緒</span>
                  ) : (
                    <span className="text-red-500 font-medium text-sm">未上傳</span>
                  )}
                </div>

                {!draft?.base_image && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>必須上傳 Base Image 才能儲存產品。</span>
                  </div>
                )}

                <button
                  onClick={handleSave}
                  disabled={isSaveDisabled}
                  className={`w-full flex items-center justify-center gap-2 py-3 rounded-lg font-bold transition-all ${isSaveDisabled
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg active:scale-95'
                    }`}
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                  {id === 'new' ? '建立產品' : '儲存變更'}
                </button>
              </div>
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-lg font-semibold mb-4">分享連結</h2>
              {(() => {
                const result = buildDesignShareUrl(draft?.id);

                if (id === 'new') {
                  return (
                    <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-400 text-xs flex gap-2">
                      <Info className="w-4 h-4 shrink-0" />
                      <span>請先儲存產品後才會產生分享連結。</span>
                    </div>
                  );
                }

                if (result.url) {
                  return (
                    <div className="space-y-3">
                      <div className="p-2 bg-gray-50 rounded border border-gray-100 break-all text-[10px] font-mono text-gray-500">
                        {result.url}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          onClick={async () => {
                            const ok = await copyToClipboard(result.url!);
                            if (ok) alert('分享連結已複製！');
                          }}
                          className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all"
                        >
                          <Share2 className="w-3.5 h-3.5" />
                          複製連結
                        </button>
                        <button
                          onClick={() => window.open(result.url!, '_blank')}
                          className="flex items-center justify-center gap-1.5 py-2 px-3 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 transition-all"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          開啟預覽
                        </button>
                      </div>
                      {import.meta.env.DEV && (
                        <div className="text-[10px] text-green-600 bg-green-50 p-2 rounded border border-green-100 mt-2">
                          DEV: VITE_CANONICAL_ORIGIN={import.meta.env.VITE_CANONICAL_ORIGIN}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-700 text-xs flex flex-col gap-2">
                      <div className="flex gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span className="font-bold">
                          {result.reason === 'MISSING_ORIGIN' ? '缺少環境變數' : '環境變數格式錯誤'}
                        </span>
                      </div>
                      <p className="text-[10px] leading-relaxed">
                        請在 <code className="bg-amber-100 px-1 rounded">.env.local</code> 設定
                        <code className="bg-amber-100 px-1 rounded">VITE_CANONICAL_ORIGIN=https://ppbears.com</code>
                        並重啟 <code className="bg-amber-100 px-1 rounded">npm run dev</code>。
                      </p>
                      {import.meta.env.DEV && (
                        <div className="text-[10px] text-gray-500 mt-1 pt-2 border-t border-amber-100">
                          目前讀取值: {result.originValue || '(空值)'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h3 className="font-semibold text-gray-800 mb-2">使用提示</h3>
              <ul className="text-xs text-gray-500 space-y-2 list-disc pl-4">
                <li>名稱為必填項目。</li>
                <li>底圖為產品渲染的基礎，必填。</li>
                <li>遮罩圖決定了客製化設計的顯示範圍。</li>
                <li>所有變更均直接同步至 Supabase 資料庫。</li>
              </ul>
            </div>
          </div>
        </div>
      ) : activeTab === 'visual' ? (
        <VisualTab editor={editor} />
      ) : (
        <PreviewTab draft={draft} />
      )}
    </div>
  );
};

export default ProductEditorV2;
