import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface FontOption {
    family: string;
    label: string;
}

interface FontPickerProps {
    value: string;
    onChange: (fontFamily: string) => void;
    options: FontOption[];
}

export default function FontPicker({ value, onChange, options }: FontPickerProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const selectedFont = options.find(f => f.family === value) || options[0];

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={containerRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 bg-transparent text-xs font-medium text-gray-700 border border-gray-200 rounded-lg py-1.5 pl-3 pr-2 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-100 min-w-[100px] justify-between"
                title="選擇字體"
            >
                <span className="truncate" style={{ fontFamily: selectedFont?.family }}>
                    {selectedFont?.label || 'Font'}
                </span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
            </button>

            {isOpen && (
                <div className="absolute bottom-full mb-2 left-0 w-[200px] max-h-[300px] overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-xl z-50 animate-in fade-in zoom-in-95 duration-100">
                    <div className="p-1">
                        {options.map((font) => (
                            <button
                                key={font.family}
                                onClick={() => {
                                    onChange(font.family);
                                    setIsOpen(false);
                                }}
                                className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between hover:bg-gray-50 transition-colors ${
                                    value === font.family ? 'bg-blue-50 text-blue-600' : 'text-gray-700'
                                }`}
                            >
                                <span style={{ fontFamily: font.family }} className="text-base">
                                    {font.label}
                                </span>
                                {value === font.family && (
                                    <Check className="w-4 h-4 text-blue-600" />
                                )}
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
