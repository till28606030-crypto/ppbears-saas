import { useState, useRef, useEffect } from 'react';
const APP_VERSION = __APP_VERSION__;
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  ShoppingBag, Image as ImageIcon, LayoutDashboard, LogOut, Menu, X,
  ArrowLeft, Palette, Shapes, Settings, FolderTree, Sparkles,
  GripVertical, Pencil, Check, RotateCcw
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { USE_PRODUCTS_V2 } from '@/config';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor,
  useSensor, useSensors, DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, verticalListSortingStrategy,
  useSortable, sortableKeyboardCoordinates
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ─── Nav item definition ───────────────────────────────────────────
type NavItem = {
  id: string;
  defaultLabel: string;
  path: string;
  activeKey: string;
  icon: React.ReactNode;
};

const DEFAULT_NAV_ITEMS: NavItem[] = [
  { id: 'orders',    defaultLabel: '訂單管理',       path: '/admin/orders',       activeKey: 'orders',    icon: <ShoppingBag className="w-5 h-5 shrink-0" /> },
  { id: 'categories',defaultLabel: '產品類別',       path: '/admin/categories',   activeKey: 'categories',icon: <FolderTree className="w-5 h-5 shrink-0" /> },
  { id: 'products',  defaultLabel: '產品模板',       path: USE_PRODUCTS_V2 ? '/seller/products-v2' : '/seller/products', activeKey: USE_PRODUCTS_V2 ? 'seller-v2' : 'seller', icon: <LayoutDashboard className="w-5 h-5 shrink-0" /> },
  { id: 'options',   defaultLabel: '購物車商品',     path: '/admin/options',      activeKey: 'options',   icon: <Settings className="w-5 h-5 shrink-0" /> },
  { id: 'assets',    defaultLabel: '素材庫',         path: '/admin/assets',       activeKey: 'assets',    icon: <ImageIcon className="w-5 h-5 shrink-0" /> },
  { id: 'designs',   defaultLabel: '設計款模板',     path: '/admin/designs',      activeKey: 'designs',   icon: <Palette className="w-5 h-5 shrink-0" /> },
  { id: 'frames',    defaultLabel: '相框設計',       path: '/seller/frames',      activeKey: 'frames',    icon: <Shapes className="w-5 h-5 shrink-0" /> },
  { id: 'media',     defaultLabel: '媒體庫 (全域儲存空間)', path: '/admin/media', activeKey: 'media',    icon: <ImageIcon className="w-5 h-5 shrink-0" /> },
  { id: 'ai-styles', defaultLabel: 'AI 創意',        path: '/admin/ai-styles',    activeKey: 'ai-styles', icon: <Sparkles className="w-5 h-5 shrink-0" /> },
  { id: 'settings',  defaultLabel: '系統設定 (空間清理)', path: '/admin/settings', activeKey: 'settings', icon: <Settings className="w-5 h-5 shrink-0" /> },
];

const STORAGE_KEY = 'ppbears_admin_nav_prefs';

type NavPrefs = { id: string; label: string }[];

function loadPrefs(): { order: string[]; labels: Record<string, string> } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return { order: DEFAULT_NAV_ITEMS.map(i => i.id), labels: {} };
}

function savePrefs(order: string[], labels: Record<string, string>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ order, labels }));
}

// ─── Sortable nav row ───────────────────────────────────────────────
function SortableNavItem({
  item, isActive, isEditMode, customLabel,
  onNavigate, onRename,
}: {
  item: NavItem;
  isActive: boolean;
  isEditMode: boolean;
  customLabel: string;
  onNavigate: () => void;
  onRename: (val: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.7 : 1,
  };

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(customLabel);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setDraft(customLabel); }, [customLabel]);
  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  const commitRename = () => {
    const trimmed = draft.trim();
    onRename(trimmed || item.defaultLabel);
    setEditing(false);
  };

  if (isEditMode) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className={`flex items-center gap-1 px-2 py-1.5 rounded-lg transition-colors ${
          isDragging ? 'bg-blue-50 shadow-lg' : 'bg-gray-50 border border-dashed border-gray-200'
        }`}
      >
        {/* Drag handle */}
        <button
          {...attributes}
          {...listeners}
          className="p-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing touch-none"
          tabIndex={-1}
        >
          <GripVertical className="w-4 h-4" />
        </button>

        {/* Icon */}
        <span className="text-gray-400 shrink-0">{item.icon}</span>

        {/* Inline rename input */}
        {editing ? (
          <div className="flex items-center gap-1 flex-1 min-w-0">
            <input
              ref={inputRef}
              value={draft}
              onChange={e => setDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditing(false); }}
              onBlur={commitRename}
              className="flex-1 min-w-0 text-sm px-1.5 py-0.5 border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white"
            />
          </div>
        ) : (
          <span className="flex-1 min-w-0 text-sm font-medium text-gray-700 truncate">{customLabel}</span>
        )}

        {/* Rename button */}
        <button
          onClick={() => { setDraft(customLabel); setEditing(true); }}
          className="p-1 text-gray-400 hover:text-blue-600 transition-colors shrink-0"
          title="重新命名"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  // Normal mode
  return (
    <div ref={setNodeRef} style={style}>
      <button
        onClick={onNavigate}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors text-left ${
          isActive ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'
        }`}
      >
        {item.icon}
        <span className="truncate flex-1">{customLabel}</span>
      </button>
    </div>
  );
}

// ─── Main Layout ────────────────────────────────────────────────────
export default function AdminLayout() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const location = useLocation();
  const path = location.pathname;
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Load persisted prefs
  const [prefs, setPrefs] = useState(loadPrefs);
  const [isEditMode, setIsEditMode] = useState(false);

  // Build ordered item list
  const orderedItems = (() => {
    const map = Object.fromEntries(DEFAULT_NAV_ITEMS.map(i => [i.id, i]));
    const validOrder = prefs.order.filter(id => map[id]);
    const missing = DEFAULT_NAV_ITEMS.map(i => i.id).filter(id => !validOrder.includes(id));
    return [...validOrder, ...missing].map(id => map[id]);
  })();

  const getCustomLabel = (item: NavItem) => prefs.labels[item.id] || item.defaultLabel;

  const getActiveTab = () => {
    if (path.includes('/seller/frames')) return 'frames';
    if (path.includes('/seller/products-v2')) return 'seller-v2';
    if (path.includes('/seller/products')) return 'seller';
    if (path.includes('/admin/categories')) return 'categories';
    if (path.includes('/admin/assets')) return 'assets';
    if (path.includes('/admin/designs')) return 'designs';
    if (path.includes('/admin/media')) return 'media';
    if (path.includes('/admin/settings')) return 'settings';
    if (path.includes('/admin/ai-styles')) return 'ai-styles';
    if (path.includes('/admin/options')) return 'options';
    return 'orders';
  };
  const activeTab = getActiveTab();

  const handleNavigation = (p: string) => {
    navigate(p);
    setIsMobileMenuOpen(false);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIdx = orderedItems.findIndex(i => i.id === active.id);
    const newIdx = orderedItems.findIndex(i => i.id === over.id);
    const newOrder = arrayMove(orderedItems, oldIdx, newIdx).map(i => i.id);
    const newPrefs = { ...prefs, order: newOrder };
    setPrefs(newPrefs);
    savePrefs(newPrefs.order, newPrefs.labels);
  };

  const handleRename = (id: string, val: string) => {
    const newLabels = { ...prefs.labels, [id]: val };
    const newPrefs = { ...prefs, labels: newLabels };
    setPrefs(newPrefs);
    savePrefs(newPrefs.order, newPrefs.labels);
  };

  const handleReset = () => {
    const fresh = { order: DEFAULT_NAV_ITEMS.map(i => i.id), labels: {} };
    setPrefs(fresh);
    savePrefs(fresh.order, fresh.labels);
  };

  const Sidebar = (
    <aside className={`
      fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-300 ease-in-out
      md:static md:translate-x-0
      ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
    `}>
      <div className="h-16 flex items-center px-6 border-b border-gray-200">
        <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-bold mr-3">A</div>
        <span className="font-semibold text-lg flex items-center gap-2">
          管理後台 <span className="text-xs font-normal bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full">V{APP_VERSION}</span>
        </span>
      </div>

      {/* Edit mode toggle */}
      <div className="px-4 pt-3 flex items-center gap-2">
        <button
          onClick={() => setIsEditMode(v => !v)}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-semibold transition-colors ${
            isEditMode
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {isEditMode ? <Check className="w-3.5 h-3.5" /> : <Pencil className="w-3.5 h-3.5" />}
          {isEditMode ? '完成編輯' : '自訂選單'}
        </button>
        {isEditMode && (
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
            title="重置為預設"
          >
            <RotateCcw className="w-3 h-3" /> 重置
          </button>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={orderedItems.map(i => i.id)}
            strategy={verticalListSortingStrategy}
          >
            {orderedItems.map(item => (
              <SortableNavItem
                key={item.id}
                item={item}
                isActive={activeTab === item.activeKey}
                isEditMode={isEditMode}
                customLabel={getCustomLabel(item)}
                onNavigate={() => handleNavigation(item.path)}
                onRename={val => handleRename(item.id, val)}
              />
            ))}
          </SortableContext>
        </DndContext>
      </nav>

      <div className="p-4 border-t border-gray-200 space-y-2">
        <button
          onClick={() => handleNavigation('/')}
          className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-gray-50 rounded-lg font-medium transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
          返回前台
        </button>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-lg font-medium transition-colors"
        >
          <LogOut className="w-5 h-5" />
          登出
        </button>
        <div className="text-center text-[10px] text-gray-400 mt-4 font-mono">Version {APP_VERSION}</div>
      </div>
    </aside>
  );

  return (
    <div className="flex h-screen bg-gray-100 font-sans text-gray-900 overflow-hidden">
      {/* Mobile Header */}
      <div className="md:hidden fixed top-0 left-0 right-0 h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 z-30">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-black rounded flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <span className="font-semibold text-gray-800">管理後台</span>
          <span className="px-2 py-0.5 whitespace-nowrap bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full ml-1">
            V{APP_VERSION}
          </span>
        </div>
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg">
          {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {Sidebar}

      {/* Mobile overlay */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setIsMobileMenuOpen(false)} />
      )}

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-gray-50 pt-16 md:pt-0 w-full relative">
        <Outlet />
      </main>
    </div>
  );
}
