/**
 * ColorPickerSection.tsx
 * Extracted from CanvasEditor.tsx — inline color-picker widget used in the right panel.
 */
import React, { useState, useEffect } from 'react';

interface ColorPickerSectionProps {
    label: string;
    property: string;
    currentVal: string;
    onChange: (prop: string, val: string) => void;
}

export const ColorPickerSection: React.FC<ColorPickerSectionProps> = ({
    label, property, currentVal, onChange
}) => {
    const [tempHex, setTempHex] = useState(currentVal);

    useEffect(() => { setTempHex(currentVal); }, [currentVal]);

    const handleHexChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setTempHex(val);
        if (/^#[0-9A-F]{6}$/i.test(val)) { onChange(property, val); }
    };

    const checkerStyle: React.CSSProperties = {
        backgroundImage:
            'linear-gradient(45deg, #eee 25%, transparent 25%), ' +
            'linear-gradient(-45deg, #eee 25%, transparent 25%), ' +
            'linear-gradient(45deg, transparent 75%, #eee 75%), ' +
            'linear-gradient(-45deg, transparent 75%, #eee 75%)',
        backgroundSize: '4px 4px',
    };

    return (
        <div className="flex flex-col gap-1 px-1 py-0.5">
            <div className="flex items-center justify-between gap-1">
                <span className="text-[11px] text-gray-500 font-bold whitespace-nowrap">{label}</span>
                <div className="flex items-center border border-gray-300 rounded overflow-hidden bg-white shadow-sm h-8 w-[160px] flex-shrink-0">
                    {/* Swatch */}
                    <div className="relative w-8 h-full flex-shrink-0 border-r border-gray-200">
                        <div className="absolute inset-0" style={{ backgroundColor: currentVal === 'transparent' ? 'transparent' : currentVal }} />
                        <div className="absolute inset-0 bg-white -z-10" style={checkerStyle} />
                        <input
                            type="color"
                            value={currentVal === 'transparent' ? '#ffffff' : currentVal}
                            onChange={(e) => onChange(property, e.target.value)}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        />
                    </div>

                    {/* Hex input */}
                    <input
                        type="text"
                        value={tempHex.toUpperCase()}
                        onChange={handleHexChange}
                        className="flex-1 min-w-0 text-[10px] px-2 outline-none font-mono text-gray-700"
                        placeholder="#RRGGBB"
                    />

                    {/* Transparent toggle (only for bg / stroke) */}
                    {(property === 'backgroundColor' || property === 'stroke') ? (
                        <button
                            className={`w-9 h-full flex items-center justify-center border-l border-gray-300 bg-white relative overflow-hidden hover:bg-gray-50 transition-colors ${currentVal === 'transparent' ? 'ring-2 ring-blue-500 ring-inset' : ''}`}
                            onClick={() => onChange(property, 'transparent')}
                            title="透明"
                        >
                            <div className="absolute inset-0 bg-white" style={{ ...checkerStyle, backgroundSize: '6px 6px' }} />
                            <div className="absolute inset-0 flex items-center justify-center text-red-500 text-sm font-bold z-10">/</div>
                        </button>
                    ) : (
                        <div className="w-9 h-full border-l border-gray-50 bg-gray-50/30 flex-shrink-0" />
                    )}
                </div>
            </div>
        </div>
    );
};
