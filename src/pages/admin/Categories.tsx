import React, { useEffect, useMemo, useState } from 'react';
import type { Category } from '@/types';
import { supabase } from '@/lib/supabase';
import { buildCategoryTree, reorderByIds } from '@/utils/categoryTree';
import { DndContext, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown, ChevronRight, Edit2, FolderTree, GripVertical, Plus, Save, Trash2, X } from 'lucide-react';

type NodeProps = {
  node: Category;
  depth: number;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  editingId: string | null;
  editName: string;
  setEditName: (v: string) => void;
  onStartEdit: (node: Category) => void;
  onSaveEdit: (id: string) => void;
  onCancelEdit: () => void;
  onDelete: (id: string) => void;
  addingParentId: string | null;
  isAdding: boolean;
  addName: string;
  setAddName: (v: string) => void;
  onStartAdd: (parentId: string | null) => void;
  onSubmitAdd: () => void;
  onCancelAdd: () => void;
  onReorder: (parentId: string | null, orderedIds: string[]) => Promise<void>;
};

const SortableRow: React.FC<NodeProps> = (props) => {
  const { node, depth, expandedIds, onToggleExpand, editingId, editName, setEditName, onStartEdit, onSaveEdit, onCancelEdit, onDelete, addingParentId, isAdding, addName, setAddName, onSubmitAdd, onCancelAdd } = props;
  const isExpanded = expandedIds.has(node.id);
  const hasChildren = (node.children?.length || 0) > 0;
  const isEditing = editingId === node.id;
  const isAddingChild = isAdding && addingParentId === node.id;

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: node.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <div className="flex items-center gap-2 py-1.5 group rounded pr-2 hover:bg-gray-50" style={{ paddingLeft: `${depth * 12 + 8}px` }}>
        <button
          onClick={() => onToggleExpand(node.id)}
          className={`p-1 rounded hover:bg-gray-200 text-gray-500 ${!hasChildren && !isAddingChild ? 'opacity-20 cursor-default' : ''}`}
          disabled={!hasChildren && !isAddingChild}
        >
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>

        <button {...attributes} {...listeners} className="p-1 text-gray-400 hover:text-gray-600 cursor-grab active:cursor-grabbing">
          <GripVertical className="w-4 h-4" />
        </button>

        {isEditing ? (
          <div className="flex items-center gap-2 flex-1">
            <input
              autoFocus
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="border px-2 py-1 rounded text-sm w-full"
              onKeyDown={(e) => e.key === 'Enter' && onSaveEdit(node.id)}
            />
            <button onClick={() => onSaveEdit(node.id)} className="text-green-600">
              <Save className="w-4 h-4" />
            </button>
            <button onClick={onCancelEdit} className="text-gray-400">
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-between">
            <span className="text-sm font-medium text-gray-800">{node.name}</span>
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => props.onStartAdd(node.id)} title="新增子類別" className="p-1 hover:text-blue-600">
                <Plus className="w-4 h-4" />
              </button>
              <button onClick={() => onStartEdit(node)} title="編輯" className="p-1 hover:text-green-600">
                <Edit2 className="w-4 h-4" />
              </button>
              <button onClick={() => onDelete(node.id)} title="刪除" className="p-1 hover:text-red-600">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {isExpanded && (
        <div>
          {node.children && node.children.length > 0 && (
            <SortableCategoryList
              parentId={node.id}
              nodes={node.children}
              depth={depth + 1}
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              editingId={editingId}
              editName={editName}
              setEditName={setEditName}
              onStartEdit={onStartEdit}
              onSaveEdit={onSaveEdit}
              onCancelEdit={onCancelEdit}
              onDelete={onDelete}
              addingParentId={addingParentId}
              isAdding={isAdding}
              addName={addName}
              setAddName={setAddName}
              onStartAdd={props.onStartAdd}
              onSubmitAdd={onSubmitAdd}
              onCancelAdd={onCancelAdd}
              onReorder={props.onReorder}
            />
          )}

          {isAddingChild && (
            <div className="flex items-center gap-2 py-1.5" style={{ paddingLeft: `${(depth + 1) * 12 + 32}px` }}>
              <input
                autoFocus
                placeholder="輸入子類別名稱..."
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                className="border px-2 py-1 rounded text-sm w-64"
                onKeyDown={(e) => e.key === 'Enter' && onSubmitAdd()}
              />
              <button onClick={onSubmitAdd} className="text-green-600">
                <Save className="w-4 h-4" />
              </button>
              <button onClick={onCancelAdd} className="text-gray-400">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

type ListProps = Omit<NodeProps, 'node'> & {
  parentId: string | null;
  nodes: Category[];
  onReorder: (parentId: string | null, orderedIds: string[]) => Promise<void>;
};

const SortableCategoryList: React.FC<ListProps> = ({ parentId, nodes, depth, onReorder, ...rest }) => {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const ids = nodes.map((n) => n.id);
  const [localIds, setLocalIds] = useState(ids);

  useEffect(() => {
    setLocalIds(ids);
  }, [ids.join('|')]);

  const onDragEnd = async (e: DragEndEvent) => {
    const activeId = String(e.active.id);
    const overId = e.over?.id ? String(e.over.id) : null;
    if (!overId || activeId === overId) return;
    const oldIndex = localIds.indexOf(activeId);
    const newIndex = localIds.indexOf(overId);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(localIds, oldIndex, newIndex);
    setLocalIds(next);
    await onReorder(parentId, next);
  };

  const orderedNodes = useMemo(() => reorderByIds(nodes, localIds), [nodes, localIds]);

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <SortableContext items={localIds} strategy={verticalListSortingStrategy}>
        <div>
          {orderedNodes.map((node) => (
            <SortableRow
              key={node.id}
              node={node}
              depth={depth}
              onReorder={onReorder}
              {...rest}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

const AdminCategories: React.FC = () => {
  const [flat, setFlat] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const [addingParentId, setAddingParentId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [addName, setAddName] = useState('');

  const fetchCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: supaError } = await supabase
        .from('product_categories')
        .select('*')
        .order('parent_id')
        .order('sort_order');
      if (supaError) throw supaError;
      setFlat((data as any) || []);
    } catch (e: any) {
      setError(e?.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  const { tree, map } = useMemo(() => buildCategoryTree(flat), [flat]);

  useEffect(() => {
    const next = new Set<string>();
    tree.forEach((c) => next.add(c.id));
    setExpandedIds(next);
  }, [tree.map((c) => c.id).join('|')]);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const startEdit = (cat: Category) => {
    setEditingId(cat.id);
    setEditName(cat.name);
    setIsAdding(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const saveEdit = async (id: string) => {
    const name = editName.trim();
    if (!name) return;
    const { error: supaError } = await supabase.from('product_categories').update({ name }).eq('id', id);
    if (supaError) {
      alert(supaError.message);
      return;
    }
    cancelEdit();
    await fetchCategories();
  };

  const startAdd = (parentId: string | null) => {
    setAddingParentId(parentId);
    setIsAdding(true);
    setAddName('');
    setEditingId(null);
    if (parentId) setExpandedIds((prev) => new Set(prev).add(parentId));
  };

  const cancelAdd = () => {
    setIsAdding(false);
    setAddingParentId(null);
    setAddName('');
  };

  const submitAdd = async () => {
    const name = addName.trim();
    if (!name) return;
    try {
      let siblingsQuery = supabase.from('product_categories').select('id,sort_order');
      if (addingParentId) siblingsQuery = siblingsQuery.eq('parent_id', addingParentId);
      else siblingsQuery = siblingsQuery.is('parent_id', null);

      const { data: siblings, error: sibErr } = await siblingsQuery;
      if (sibErr) throw sibErr;
      const maxSort = (siblings || []).reduce((m: number, s: any) => Math.max(m, s.sort_order || 0), 0);

      let layer_level = 1;
      if (addingParentId) {
        const { data: parent, error: parentErr } = await supabase
          .from('product_categories')
          .select('layer_level')
          .eq('id', addingParentId)
          .single();
        if (parentErr) throw parentErr;
        layer_level = ((parent as any)?.layer_level || 1) + 1;
      }

      const { error: insErr } = await supabase.from('product_categories').insert([
        {
          name,
          parent_id: addingParentId,
          sort_order: maxSort + 1,
          layer_level,
        },
      ]);
      if (insErr) throw insErr;
    } catch (e: any) {
      alert(e?.message || String(e));
      return;
    }
    cancelAdd();
    await fetchCategories();
  };

  const deleteCategory = async (id: string) => {
    const ok = confirm('確定要刪除此分類？其下子分類也會一併刪除。');
    if (!ok) return;
    const { error: supaError } = await supabase.from('product_categories').delete().eq('id', id);
    if (supaError) {
      alert(supaError.message);
      return;
    }
    await fetchCategories();
  };

  const reorder = async (parentId: string | null, orderedIds: string[]) => {
    try {
      const updates = orderedIds.map((id, idx) =>
        supabase.from('product_categories').update({ sort_order: idx + 1 }).eq('id', id)
      );
      const results = await Promise.all(updates);
      const firstError = results.find((r) => r.error)?.error;
      if (firstError) throw firstError;
    } catch (e: any) {
      alert(e?.message || String(e));
      return;
    }
    setFlat((prev) => {
      const updated = prev.map((c) => ({ ...c }));
      const byId = new Map(updated.map((c) => [c.id, c]));
      orderedIds.forEach((id, idx) => {
        const c = byId.get(id);
        if (c) c.sort_order = idx + 1;
      });
      return updated;
    });
  };

  return (
    <div className="p-6 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FolderTree className="w-6 h-6 text-blue-600" />
          <h1 className="text-2xl font-bold text-gray-800">產品類別管理</h1>
        </div>
        <button
          onClick={() => startAdd(null)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          新增主類別
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">{error}</div>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
          <div className="text-sm text-gray-600">拖曳同層級項目可調整排序</div>
          <button onClick={fetchCategories} className="text-sm text-blue-600 hover:underline">
            重新載入
          </button>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="text-gray-500">載入中...</div>
          ) : (
            <div>
              {isAdding && addingParentId === null && (
                <div className="flex items-center gap-2 mb-4 p-3 bg-blue-50 rounded border border-blue-100">
                  <input
                    autoFocus
                    value={addName}
                    onChange={(e) => setAddName(e.target.value)}
                    className="border px-2 py-1 rounded text-sm w-64"
                    placeholder="輸入主類別名稱..."
                    onKeyDown={(e) => e.key === 'Enter' && submitAdd()}
                  />
                  <button onClick={submitAdd} className="text-green-600">
                    <Save className="w-4 h-4" />
                  </button>
                  <button onClick={cancelAdd} className="text-gray-400">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              <SortableCategoryList
                parentId={null}
                nodes={tree}
                depth={0}
                expandedIds={expandedIds}
                onToggleExpand={toggleExpand}
                editingId={editingId}
                editName={editName}
                setEditName={setEditName}
                onStartEdit={startEdit}
                onSaveEdit={saveEdit}
                onCancelEdit={cancelEdit}
                onDelete={deleteCategory}
                addingParentId={addingParentId}
                isAdding={isAdding}
                addName={addName}
                setAddName={setAddName}
                onStartAdd={startAdd}
                onSubmitAdd={submitAdd}
                onCancelAdd={cancelAdd}
                onReorder={reorder}
              />
            </div>
          )}
        </div>
      </div>

      <div className="mt-6 text-xs text-gray-500">
        <div>總類別數：{flat.length}</div>
        <div>Root 類別數：{tree.length}</div>
        <div>Map size：{map.size}</div>
      </div>
    </div>
  );
};

export default AdminCategories;
