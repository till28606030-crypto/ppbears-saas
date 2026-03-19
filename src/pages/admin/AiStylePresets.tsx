import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Pencil, Trash2, GripVertical, Sparkles, Save, X, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface StylePreset {
  id: string;
  label: string;
  emoji: string;
  prompt: string;
  is_active: boolean;
  sort_order: number;
  max_photos: number;
}

// -- Sortable Row Component --
function SortableStyleRow({
  style,
  onEdit,
  onToggle,
  onDelete,
}: {
  style: StylePreset;
  onEdit: (s: StylePreset) => void;
  onToggle: (s: StylePreset) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: style.id });
  const dragStyle = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={dragStyle}
      className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
        style.is_active
          ? 'bg-white border-gray-200 shadow-sm'
          : 'bg-gray-50 border-gray-100 opacity-60'
      }`}
    >
      {/* Drag Handle */}
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 p-1">
        <GripVertical className="w-5 h-5" />
      </button>

      {/* Emoji + Label */}
      <div className="flex items-center gap-3 min-w-[180px]">
        <span className="text-2xl">{style.emoji}</span>
        <div>
          <div className="font-bold text-gray-800">{style.label}</div>
          <div className="text-[10px] text-gray-400">排序: {style.sort_order}</div>
          <div className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded w-fit mt-0.5 font-medium">最多 {style.max_photos ?? 3} 張照</div>
        </div>
      </div>

      {/* Prompt preview */}
      <div className="flex-1 text-xs text-gray-500 line-clamp-2 bg-gray-50 p-2 rounded-lg border border-gray-100 font-mono">
        {style.prompt}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => onToggle(style)}
          className={`p-2 rounded-lg transition-colors ${
            style.is_active ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'
          }`}
          title={style.is_active ? '點擊停用' : '點擊啟用'}
        >
          {style.is_active ? <ToggleRight className="w-5 h-5" /> : <ToggleLeft className="w-5 h-5" />}
        </button>
        <button
          onClick={() => onEdit(style)}
          className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="編輯"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={() => onDelete(style.id)}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="刪除"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

// ---- Common Emoji Picker ----
const EMOJI_OPTIONS = ['✨','🌟','🌍','🐾','🎉','🎌','❤️','🎨','🖼️','🔥','💎','🌸','🎵','🏖️','🎄','🎃','👑','🌈','🐶','🐱','💖','🪐','🎀','🍀'];

// ---- Main Component ----
export default function AiStylePresets() {
  const [styles, setStyles] = useState<StylePreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingStyle, setEditingStyle] = useState<StylePreset | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Settings
  const [products, setProducts] = useState<any[]>([]);
  const [resetHour, setResetHour] = useState<number>(0);
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedSettings, setSavedSettings] = useState(false);

  // New style form
  const [formLabel, setFormLabel] = useState('');
  const [formEmoji, setFormEmoji] = useState('✨');
  const [formPrompt, setFormPrompt] = useState('');
  const [formMaxPhotos, setFormMaxPhotos] = useState(3);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  // --- Load styles ---
  const loadStyles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_style_presets')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      setStyles(data || []);
    } catch (err) {
      console.error('Failed to load AI styles:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStyles(); }, []);

  // --- Load Settings ---
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from('products').select('id, specs');
      if (!error && data && data.length > 0) {
        setProducts(data);
        const specs = data[0].specs || {};
        const hours = specs.ai_reset_hours !== undefined 
          ? Number(specs.ai_reset_hours) 
          : (specs.ai_reset_time !== undefined ? 24 : 24); // default 24h
        setResetHour(hours);
      }
    })();
  }, []);

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try {
      const updates = products.map(p => {
        const newSpecs = { ...(p.specs || {}), ai_reset_hours: resetHour };
        return supabase.from('products').update({ specs: newSpecs }).eq('id', p.id);
      });
      const results = await Promise.all(updates);
      const failed = results.find(r => r.error);
      if (failed?.error) throw failed.error;
      setSavedSettings(true);
      setTimeout(() => setSavedSettings(false), 2000);
    } catch (err: any) {
      alert('儲存失敗：' + err.message);
    } finally {
      setSavingSettings(false);
    }
  };

  // --- Create ---
  const handleCreate = async () => {
    if (!formLabel.trim() || !formPrompt.trim()) return;
    setSaving(true);
    try {
      const maxOrder = styles.length > 0 ? Math.max(...styles.map(s => s.sort_order)) : 0;
      const { error } = await supabase.from('ai_style_presets').insert({
        label: formLabel.trim(),
        emoji: formEmoji,
        prompt: formPrompt.trim(),
        sort_order: maxOrder + 1,
        max_photos: formMaxPhotos,
      });
      if (error) throw error;
      setFormLabel('');
      setFormEmoji('✨');
      setFormPrompt('');
      setFormMaxPhotos(3);
      setIsCreating(false);
      await loadStyles();
    } catch (err) {
      console.error('Create failed:', err);
      alert('新增失敗：' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // --- Update ---
  const handleUpdate = async () => {
    if (!editingStyle) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('ai_style_presets')
        .update({
          label: editingStyle.label,
          emoji: editingStyle.emoji,
          prompt: editingStyle.prompt,
          max_photos: editingStyle.max_photos,
        })
        .eq('id', editingStyle.id);
      if (error) throw error;
      setEditingStyle(null);
      await loadStyles();
    } catch (err) {
      console.error('Update failed:', err);
      alert('更新失敗：' + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // --- Toggle Active ---
  const handleToggle = async (style: StylePreset) => {
    try {
      const { error } = await supabase
        .from('ai_style_presets')
        .update({ is_active: !style.is_active })
        .eq('id', style.id);
      if (error) throw error;
      setStyles(prev => prev.map(s => s.id === style.id ? { ...s, is_active: !s.is_active } : s));
    } catch (err) {
      console.error('Toggle failed:', err);
    }
  };

  // --- Delete ---
  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除此風格嗎？')) return;
    try {
      const { error } = await supabase.from('ai_style_presets').delete().eq('id', id);
      if (error) throw error;
      setStyles(prev => prev.filter(s => s.id !== id));
    } catch (err) {
      console.error('Delete failed:', err);
      alert('刪除失敗：' + (err as Error).message);
    }
  };

  // --- Drag Sort ---
  const handleDragEnd = async (event: any) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = styles.findIndex(s => s.id === active.id);
    const newIndex = styles.findIndex(s => s.id === over.id);
    const reordered = arrayMove(styles, oldIndex, newIndex);

    // Optimistic update
    setStyles(reordered);

    // Persist sort_order
    try {
      const updates = reordered.map((s, i) =>
        supabase.from('ai_style_presets').update({ sort_order: i + 1 }).eq('id', s.id)
      );
      await Promise.all(updates);
    } catch (err) {
      console.error('Sort save failed:', err);
      await loadStyles(); // rollback
    }
  };

  return (
    <>
      <header className="h-16 bg-white border-b border-gray-200 flex items-center px-8 shadow-sm">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-purple-600" />
          <h1 className="text-xl font-semibold text-gray-800">AI 創意管理</h1>
        </div>
      </header>

      <div className="p-8 max-w-4xl mx-auto">
        {/* Settings Box */}
        <div className="mb-8">
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="p-5">
              <div className="flex items-start gap-3 mb-4">
                <Sparkles className="w-5 h-5 text-purple-600 mt-0.5 shrink-0" />
                <p className="text-sm text-gray-600 leading-relaxed">
                  管理 AI 創意功能的風格選單。客戶在前台可選擇一種風格，AI 會根據此處設定的 Prompt 關鍵字來生成設計圖。您可以隨時新增、編輯、停用或拖曳排序。
                </p>
              </div>
              
              <div className="pt-5 border-t border-gray-100 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <label className="text-sm font-bold text-gray-800 flex items-center">
                    AI 點數重置週期 
                    <span className="text-gray-500 font-normal text-xs ml-2">(自首度使用點數起算)</span>
                  </label>
                  <select 
                    className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-700 bg-gray-50 focus:ring-2 focus:ring-purple-500 focus:bg-white cursor-pointer outline-none hover:border-purple-300 transition-all w-36"
                    value={resetHour}
                    onChange={e => setResetHour(Number(e.target.value))}
                  >
                    <option value={1}>1 小時 (測試用)</option>
                    <option value={6}>6 小時</option>
                    <option value={12}>12 小時</option>
                    <option value={24}>24 小時</option>
                    <option value={48}>48 小時</option>
                  </select>
                </div>
                
                <button 
                  onClick={handleSaveSettings}
                  disabled={savingSettings}
                  className={`flex items-center justify-center gap-2 px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                    savedSettings 
                      ? 'bg-green-500 text-white shadow-green-500/20 shadow-lg' 
                      : 'bg-purple-600 hover:bg-purple-700 text-white shadow-purple-600/20 hover:shadow-lg disabled:opacity-50 disabled:hover:shadow-none'
                  }`}
                >
                  {savingSettings ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {savedSettings ? '已儲存 ✓' : '儲存設定'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Add Button & Style List Header */}
        <div className="flex justify-between items-center mb-5 px-1 pr-5">
          <h2 className="text-lg font-bold text-gray-800">風格清單（{styles.filter(s => s.is_active).length} 個啟用中）</h2>
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-bold text-sm transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            新增風格
          </button>
        </div>

        {/* Style List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
          </div>
        ) : styles.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>尚無任何風格，請點擊上方「新增風格」開始建立。</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={styles.map(s => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-3">
                {styles.map(style => (
                  <SortableStyleRow
                    key={style.id}
                    style={style}
                    onEdit={setEditingStyle}
                    onToggle={handleToggle}
                    onDelete={handleDelete}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* Create Modal */}
      {isCreating && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Plus className="w-5 h-5 text-purple-600" />
                新增 AI 創意風格
              </h3>
              <button onClick={() => setIsCreating(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">風格名稱</label>
                <input
                  type="text"
                  value={formLabel}
                  onChange={e => setFormLabel(e.target.value)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  placeholder="例如：偶像應援"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">選擇 Emoji 圖示</label>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map(e => (
                    <button
                      key={e}
                      onClick={() => setFormEmoji(e)}
                      className={`w-10 h-10 text-xl rounded-lg border-2 flex items-center justify-center transition-all ${
                        formEmoji === e ? 'border-purple-500 bg-purple-50 scale-110 shadow-sm' : 'border-gray-200 hover:border-purple-300'
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">AI Prompt 關鍵字（英文）</label>
                <textarea
                  value={formPrompt}
                  onChange={e => setFormPrompt(e.target.value)}
                  rows={4}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
                  placeholder="例如：idol fan art, kpop aesthetic, vibrant neon colors, sparkles..."
                />
                <p className="text-xs text-gray-400 mt-1">用英文逗號分隔的關鍵字，AI 將根據這些關鍵字生成對應風格的設計圖。</p>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">上傳照片數量上限</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={formMaxPhotos}
                  onChange={e => setFormMaxPhotos(parseInt(e.target.value) || 1)}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-400 mt-1">限制使用者最多能上傳幾張照片進行合成（建議 1-3 張）。</p>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button onClick={() => setIsCreating(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">取消</button>
              <button
                onClick={handleCreate}
                disabled={saving || !formLabel.trim() || !formPrompt.trim()}
                className="px-6 py-2 bg-purple-600 text-white rounded-lg font-bold hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                建立風格
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingStyle && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <Pencil className="w-5 h-5 text-blue-600" />
                編輯風格：{editingStyle.emoji} {editingStyle.label}
              </h3>
              <button onClick={() => setEditingStyle(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">風格名稱</label>
                <input
                  type="text"
                  value={editingStyle.label}
                  onChange={e => setEditingStyle({ ...editingStyle, label: e.target.value })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">選擇 Emoji 圖示</label>
                <div className="flex flex-wrap gap-2">
                  {EMOJI_OPTIONS.map(e => (
                    <button
                      key={e}
                      onClick={() => setEditingStyle({ ...editingStyle, emoji: e })}
                      className={`w-10 h-10 text-xl rounded-lg border-2 flex items-center justify-center transition-all ${
                        editingStyle.emoji === e ? 'border-blue-500 bg-blue-50 scale-110 shadow-sm' : 'border-gray-200 hover:border-blue-300'
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">AI Prompt 關鍵字（英文）</label>
                <textarea
                  value={editingStyle.prompt}
                  onChange={e => setEditingStyle({ ...editingStyle, prompt: e.target.value })}
                  rows={4}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">上傳照片數量上限</label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={editingStyle.max_photos ?? 3}
                  onChange={e => setEditingStyle({ ...editingStyle, max_photos: parseInt(e.target.value) || 1 })}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
              <button onClick={() => setEditingStyle(null)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium">取消</button>
              <button
                onClick={handleUpdate}
                disabled={saving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                儲存變更
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
