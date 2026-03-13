/**
 * SortableLayerItem.tsx
 * Extracted from CanvasEditor.tsx — draggable layer row in the Layers panel.
 */
import React from 'react';
import { GripVertical, Eye, EyeOff, Lock, Unlock, Trash2, Type } from 'lucide-react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { LayerItemData } from './CanvasEditor.types';

interface SortableLayerItemProps {
    layer: LayerItemData;
    isActive: boolean;
    onToggleVisible: (e: React.MouseEvent) => void;
    onToggleLock: (e: React.MouseEvent) => void;
    onDelete: (e: React.MouseEvent) => void;
    onSelect: (e: React.MouseEvent) => void;
}

export const SortableLayerItem: React.FC<SortableLayerItemProps> = ({
    layer, isActive, onToggleVisible, onToggleLock, onDelete, onSelect
}) => {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id: layer.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 999 : 'auto' as any,
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-2 p-2 rounded-md mb-1 text-sm border select-none ${isActive ? 'border-yellow-400 bg-[#FFFFE0]' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
            onClick={onSelect}
        >
            {/* Drag Handle */}
            <div
                {...attributes}
                {...listeners}
                className="w-10 h-10 -ml-2 flex items-center justify-center cursor-grab text-gray-400 hover:text-gray-600 flex-shrink-0 touch-none"
                style={{ touchAction: 'none' }}
            >
                <GripVertical className="w-5 h-5" />
            </div>

            {/* Preview Icon */}
            <div className="w-8 h-8 flex-shrink-0 bg-gray-100 rounded overflow-hidden flex items-center justify-center border border-gray-200">
                {layer.preview ? (
                    <img src={layer.preview} alt="layer" className="w-full h-full object-cover" />
                ) : (
                    <Type className="w-4 h-4 text-gray-500" />
                )}
            </div>

            {/* Name */}
            <div className="flex-1 truncate font-medium text-gray-700 min-w-0">
                {layer.name}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={onToggleVisible} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-200" title={layer.visible ? "Hide" : "Show"}>
                    {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <button onClick={onToggleLock} className="p-1 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-200" title={layer.locked ? "Unlock" : "Lock"}>
                    {layer.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                </button>
                <button onClick={onDelete} className="p-1 text-gray-400 hover:text-red-600 rounded hover:bg-red-50" title="Delete">
                    <Trash2 className="w-3.5 h-3.5" />
                </button>
            </div>
        </div>
    );
};
