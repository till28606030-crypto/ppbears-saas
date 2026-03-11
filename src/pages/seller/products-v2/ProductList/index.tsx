import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { ProductRow } from '../shared/types';
import { useProductEditor } from '../hooks/useProductEditor';
import { Loader2, Plus, AlertCircle, CheckCircle2, XCircle, Copy, Trash2, Share2, ExternalLink, Search, Filter } from 'lucide-react';
import { buildDesignShareUrl, copyToClipboard } from '../shared/shareLink';
import { Category } from '@/types';
import { buildCategoryTree } from '@/utils/categoryTree';
import CategorySelect from '@/components/CategorySelect';
import BulkAttributeModal from './BulkAttributeModal';
import SingleAttributeModal from './SingleAttributeModal';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface SortableRowProps {
  product: Partial<ProductRow>;
  isSelected?: boolean;
  onToggleSelection?: (id: string) => void;
  onOpenSingleEdit?: (product: Partial<ProductRow>) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  navigate: (path: string) => void;
}

const SortableRow: React.FC<SortableRowProps> = ({ product, isSelected, onToggleSelection, onOpenSingleEdit, onDelete, onDuplicate, navigate }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: product.id! });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
    position: 'relative' as const,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <tr ref={setNodeRef} style={style} className={`hover:bg-gray-50 transition-colors ${isDragging ? 'bg-blue-50' : ''}`}>
      <td className="px-6 py-4">
        <div className="flex items-center gap-3">
          {onToggleSelection && (
            <input
              type="checkbox"
              className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
              checked={isSelected || false}
              onChange={() => onToggleSelection(product.id!)}
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <button {...attributes} {...listeners} className="p-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing">
            <GripVertical className="w-4 h-4" />
          </button>
          <div>
            <div className="font-medium text-gray-900">{product.name}</div>
            <div className="text-xs text-gray-400 mt-1 font-mono">{product.id}</div>
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-center">
        {product.base_image ? (
          <div className="flex items-center justify-center gap-1 text-green-600 text-sm">
            <CheckCircle2 className="w-4 h-4" />
            <span>已設定</span>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-1 text-red-500 text-sm">
            <XCircle className="w-4 h-4" />
            <span>未設定</span>
          </div>
        )}
      </td>
      <td className="px-6 py-4 text-center">
        {(() => {
          const linkedCount = (product as any).specs?.linked_option_groups?.length || 0;
          return (
            <button
              onClick={(e) => {
                e.stopPropagation();
                if (onOpenSingleEdit) onOpenSingleEdit(product);
              }}
              className="flex items-center justify-center gap-1 mx-auto hover:bg-gray-100 px-2 py-1 rounded-md transition-colors"
            >
              {linkedCount > 0 ? (
                <div className="flex items-center gap-1 text-blue-600 text-sm">
                  <span className="font-semibold underline underline-offset-2">{linkedCount} 個規格</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-gray-400 text-sm">
                  <span className="underline underline-offset-2 hover:text-blue-600">未設定</span>
                </div>
              )}
            </button>
          );
        })()}
      </td>
      <td className="px-6 py-4 text-center">
        <div className="flex flex-col items-center gap-1">
          <div className="flex items-center justify-center gap-2">
            {(() => {
              const result = buildDesignShareUrl(product.id);
              if (result.url) {
                return (
                  <>
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        const ok = await copyToClipboard(result.url!);
                        if (ok) alert('分享連結已複製！');
                      }}
                      className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                      title="複製分享連結"
                    >
                      <Share2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        window.open(result.url!, '_blank');
                      }}
                      className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
                      title="在新分頁開啟"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  </>
                );
              }
              return (
                <span className="text-[10px] text-gray-400 italic" title={result.reason}>
                  無法分享
                </span>
              );
            })()}
          </div>
        </div>
      </td>
      <td className="px-6 py-4 text-sm text-gray-500">
        {(product as any).created_at ? new Date((product as any).created_at).toLocaleString() : '-'}
      </td>
      <td className="px-6 py-4 text-right">
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); onDuplicate(product.id!); }}
            className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-all"
            title="複製產品"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(product.id!); }}
            className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all"
            title="刪除產品"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); navigate(`/seller/products-v2/${product.id}`); }}
            className="text-blue-600 hover:text-blue-800 font-medium text-sm ml-2"
          >
            編輯
          </button>
        </div>
      </td>
    </tr>
  );
};

const ProductListV2: React.FC = () => {
  const [products, setProducts] = useState<Partial<ProductRow>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Bulk / Single Selection State
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Partial<ProductRow> | null>(null);

  // Search & Filter State
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  const navigate = useNavigate();
  const { deleteProduct, duplicateProduct } = useProductEditor();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Load Categories on mount
  useEffect(() => {
    const fetchCategories = async () => {
      const { data } = await supabase.from('product_categories').select('*').order('sort_order');
      if (data) {
        const { tree } = buildCategoryTree(data as any);
        // [Flatten Logic] If single root, hoist children
        if (tree.length === 1 && tree[0].children && tree[0].children.length > 0) {
          setCategories(tree[0].children);
        } else {
          setCategories(tree);
        }
      }
    };
    fetchCategories();
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch products when filters change
  useEffect(() => {
    fetchProducts();
  }, [selectedCategory, debouncedSearch, categories]); // Added categories dependency

  const fetchProducts = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('products')
        .select('id, name, updated_at, created_at, base_image, specs, category_id, sort_order')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: false });

      // Apply Filters
      if (selectedCategory !== 'all') {
        // [Recursive Filter] Get all descendant category IDs
        const getAllCategoryIds = (catId: string, cats: Category[]): string[] => {
          let ids = [catId];
          const findCategory = (nodes: Category[]): Category | undefined => {
            for (const node of nodes) {
              if (node.id === catId) return node;
              if (node.children) {
                const found = findCategory(node.children);
                if (found) return found;
              }
            }
            return undefined;
          };

          const targetCat = findCategory(cats);

          if (targetCat && targetCat.children) {
            const collectIds = (nodes: Category[]) => {
              nodes.forEach(node => {
                ids.push(node.id);
                if (node.children) collectIds(node.children);
              });
            };
            collectIds(targetCat.children);
          }
          return ids;
        };

        const idsToFilter = getAllCategoryIds(selectedCategory, categories);
        query = query.in('category_id', idsToFilter);
      }

      if (debouncedSearch) {
        query = query.ilike('name', `%${debouncedSearch}%`);
      }

      const { data, error: fetchError } = await query.limit(50);

      if (fetchError) throw fetchError;
      setProducts(data || []);
    } catch (err: any) {
      console.error('Error fetching products:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedProductIds(products.map(p => p.id!));
    } else {
      setSelectedProductIds([]);
    }
  };

  const handleToggleSelection = (id: string) => {
    setSelectedProductIds(prev =>
      prev.includes(id) ? prev.filter(pid => pid !== id) : [...prev, id]
    );
  };

  const handleOpenSingleEdit = (product: Partial<ProductRow>) => {
    setEditingProduct(product);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除此產品嗎？此操作無法復原。')) return;

    const result = await deleteProduct(id);
    if (result.success) {
      setProducts((prev) => prev.filter((p) => p.id !== id));
    } else {
      alert(`刪除失敗: ${result.error}`);
    }
  };

  const handleDuplicate = async (id: string) => {
    const result = await duplicateProduct(id);
    if (result.success) {
      alert('複製成功！');
      fetchProducts(); // Refresh list to show new item
    } else {
      alert(`複製失敗: ${result.error}`);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = products.findIndex((p) => p.id === active.id);
      const newIndex = products.findIndex((p) => p.id === over.id);

      const newProducts = arrayMove(products, oldIndex, newIndex);
      setProducts(newProducts);

      // Persist to DB
      try {
        const updates = newProducts.map((p, index) => ({
          id: p.id,
          sort_order: index
        }));

        // Supabase update doesn't support bulk update with different values easily in one call
        // We do individual updates or a stored procedure. For simplicity here, individual updates.
        const updatePromises = updates.map(u =>
          supabase.from('products').update({ sort_order: u.sort_order }).eq('id', u.id)
        );

        await Promise.all(updatePromises);
      } catch (err) {
        console.error('Failed to update product order:', err);
      }
    }
  };



  return (
    <div className="p-6">
      <BulkAttributeModal
        isOpen={showBulkModal}
        onClose={() => setShowBulkModal(false)}
        selectedProducts={products
          .filter(p => selectedProductIds.includes(p.id!))
          .map(p => ({ id: p.id!, name: p.name || '未命名產品' }))}
        onSuccess={() => {
          setSelectedProductIds([]);
          fetchProducts();
        }}
      />
      <SingleAttributeModal
        isOpen={!!editingProduct}
        product={editingProduct}
        onClose={() => setEditingProduct(null)}
        onSuccess={() => {
          fetchProducts();
        }}
      />

      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-800">產品管理 V2</h1>
        <button
          onClick={() => navigate('/seller/products-v2/new')}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新增產品
        </button>
      </div>

      <div className="mb-6 flex flex-col md:flex-row gap-4">
        {/* Category Filter */}
        <div className="min-w-[240px]">
          <CategorySelect
            categories={categories}
            selectedId={selectedCategory}
            onChange={setSelectedCategory}
          />
        </div>

        {/* Text Search */}
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            <Search className="w-4 h-4" />
          </div>
          <input
            type="text"
            placeholder="搜尋產品名稱..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          />
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3 text-red-700">
          <AlertCircle className="w-5 h-5" />
          <span>錯誤: {error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
          <p className="text-gray-500">載入產品列表中...</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-bottom border-gray-200">
                <th className="px-6 py-4 font-semibold text-gray-600 flex items-center gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500 cursor-pointer"
                    checked={products.length > 0 && selectedProductIds.length === products.length}
                    onChange={handleSelectAll}
                  />
                  <span>ID / 名稱</span>
                </th>
                <th className="px-6 py-4 font-semibold text-gray-600 text-center">Base Image</th>
                <th className="px-6 py-4 font-semibold text-gray-600 text-center">關聯規格</th>
                <th className="px-6 py-4 font-semibold text-gray-600 text-center">分享連結</th>
                <th className="px-6 py-4 font-semibold text-gray-600">建立時間</th>
                <th className="px-6 py-4 font-semibold text-gray-600 text-right">操作</th>
              </tr>
            </thead>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={products.map(p => p.id!)}
                strategy={verticalListSortingStrategy}
              >
                <tbody className="divide-y divide-gray-100">
                  {products.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                        尚無產品資料
                      </td>
                    </tr>
                  ) : (
                    products.map((product) => (
                      <SortableRow
                        key={product.id}
                        product={product}
                        isSelected={selectedProductIds.includes(product.id!)}
                        onToggleSelection={handleToggleSelection}
                        onOpenSingleEdit={handleOpenSingleEdit}
                        onDelete={handleDelete}
                        onDuplicate={handleDuplicate}
                        navigate={navigate}
                      />
                    ))
                  )}
                </tbody>
              </SortableContext>
            </DndContext>
          </table>
        </div>
      )}

      {/* Floating Bulk Action Toolbar */}
      {selectedProductIds.length > 0 && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-[100] bg-white shadow-2xl rounded-2xl p-4 border border-gray-200 flex items-center gap-4 animate-in slide-in-from-bottom-10 fade-in duration-300">
          <div className="px-4 py-2 bg-blue-50 text-blue-700 rounded-lg font-medium text-sm">
            已選取 {selectedProductIds.length} 個產品
          </div>
          <button
            onClick={() => {
              setShowBulkModal(true);
            }}
            className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium text-sm hover:bg-blue-700 shadow-md transition-all flex items-center gap-2"
          >
            批次設定關聯規格
          </button>
          <button
            onClick={() => setSelectedProductIds([])}
            className="px-4 py-2 text-gray-500 bg-gray-100 hover:text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-medium transition-all"
            title="取消選取"
          >
            取消選取
          </button>
        </div>
      )}
    </div>
  );
};

export default ProductListV2;
