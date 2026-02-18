import React, { useState, useRef, useEffect } from 'react';
import { ChevronRight, ChevronDown, Check } from 'lucide-react';
import { Category } from '@/types';

interface CategorySelectProps {
    categories: Category[];
    selectedId: string;
    onChange: (id: string) => void;
    placeholder?: string;
    className?: string; // Allow custom styling
}

const CategorySelect: React.FC<CategorySelectProps> = ({
    categories,
    selectedId,
    onChange,
    placeholder = 'Select Category',
    className = ''
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Helper: Find selected category name recursively
    const findCategoryName = (cats: Category[], id: string): string | null => {
        if (id === 'all') return '所有類別';
        for (const cat of cats) {
            if (cat.id === id) return cat.name;
            if (cat.children) {
                const found = findCategoryName(cat.children, id);
                if (found) return found;
            }
        }
        return null;
    };

    const selectedName = findCategoryName(categories, selectedId) || placeholder;

    const toggleExpand = (e: React.MouseEvent, id: string) => {
        e.stopPropagation(); // Prevent selecting the category
        setExpandedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleSelect = (id: string) => {
        onChange(id);
        setIsOpen(false);
    };

    // Recursive render function
    const renderCategory = (cat: Category, depth: number = 0) => {
        const hasChildren = cat.children && cat.children.length > 0;
        const isExpanded = expandedIds.has(cat.id);
        const isSelected = cat.id === selectedId;

        return (
            <div key={cat.id}>
                <div
                    className={`flex items-center px-3 py-2 cursor-pointer hover:bg-gray-100 transition-colors ${isSelected ? 'bg-blue-50 text-blue-600' : 'text-gray-700'}`}
                    style={{ paddingLeft: `${depth * 16 + 12}px` }}
                    onClick={() => handleSelect(cat.id)}
                >
                    {/* Arrow for toggling expansion */}
                    <div
                        className={`mr-2 p-1 rounded-sm hover:bg-gray-200 ${hasChildren ? 'text-gray-500 cursor-pointer' : 'text-transparent pointer-events-none'}`}
                        onClick={(e) => hasChildren && toggleExpand(e, cat.id)}
                    >
                        {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                    </div>

                    {/* Category Name */}
                    <span className="flex-1 text-sm">{cat.name}</span>

                    {/* Checkmark for selected item */}
                    {isSelected && <Check className="w-3 h-3 text-blue-600" />}
                </div>

                {/* Render Children */}
                {hasChildren && isExpanded && (
                    <div>
                        {cat.children!.map(child => renderCategory(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className={`relative ${className}`} ref={dropdownRef}>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-2 bg-white border border-gray-300 rounded-lg hover:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all text-sm"
            >
                <span className="truncate text-gray-700 font-medium">{selectedName}</span>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {/* "All Categories" Option */}
                    <div
                        className={`flex items-center px-3 py-2 cursor-pointer hover:bg-gray-100 transition-colors ${selectedId === 'all' ? 'bg-blue-50 text-blue-600' : 'text-gray-700'}`}
                        onClick={() => handleSelect('all')}
                    >
                        <div className="w-6 mr-2"></div> {/* Spacer for alignment */}
                        <span className="flex-1 text-sm">所有類別</span>
                        {selectedId === 'all' && <Check className="w-3 h-3 text-blue-600" />}
                    </div>

                    {categories.map(cat => renderCategory(cat))}
                </div>
            )}
        </div>
    );
};

export default CategorySelect;
