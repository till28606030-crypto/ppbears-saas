import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { get, set } from 'idb-keyval';
import { X, Upload, Smartphone, Clock, Image as ImageIcon, Trash2, Check } from 'lucide-react';

interface GalleryImage {
    id: string;
    src: string; // dataURL
    createdAt: number;
    name: string;
}

interface MyGalleryModalProps {
    isOpen: boolean;
    onClose: () => void;
    onApply: (src: string) => void;
}

const STORAGE_KEY = 'ppbears_gallery_v1';
const MAX_HISTORY = 20;

export default function MyGalleryModal({ isOpen, onClose, onApply }: MyGalleryModalProps) {
    const [activeTab, setActiveTab] = useState<'computer' | 'history'>('computer');
    const [historyImages, setHistoryImages] = useState<GalleryImage[]>([]);
    const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Load history on mount (Migrate from LocalStorage to IndexedDB if needed)
    useEffect(() => {
        const loadImages = async () => {
            try {
                // 1. Try to get from IndexedDB first
                const savedIDB = await get(STORAGE_KEY);
                if (savedIDB && Array.isArray(savedIDB)) {
                    setHistoryImages(savedIDB);
                    return;
                }

                // 2. If not in IDB, check LocalStorage (Migration path)
                const savedLS = localStorage.getItem(STORAGE_KEY);
                if (savedLS) {
                    try {
                        const parsed = JSON.parse(savedLS);
                        if (Array.isArray(parsed)) {
                            setHistoryImages(parsed);
                            // Migrate to IDB
                            await set(STORAGE_KEY, parsed);
                            // Clear LocalStorage to fix QuotaExceededError
                            localStorage.removeItem(STORAGE_KEY);
                            console.log('Migrated gallery from LocalStorage to IndexedDB');
                        }
                    } catch (e) {
                        console.error("Failed to parse LocalStorage gallery", e);
                    }
                }
            } catch (e) {
                console.error("Failed to load gallery history", e);
            }
        };

        loadImages();
    }, []);

    // Save history whenever it changes (to IndexedDB)
    useEffect(() => {
        const saveImages = async () => {
            if (historyImages.length > 0) {
                try {
                    await set(STORAGE_KEY, historyImages);
                } catch (e) {
                    console.error("Failed to save gallery to IndexedDB", e);
                }
            }
        };
        saveImages();
    }, [historyImages]);

    // Reset selection when opening
    useEffect(() => {
        if (isOpen) {
            setSelectedImageId(null);
            // Default to computer tab if no history, otherwise maybe stay on last tab? 
            // Let's reset to computer tab for simplicity unless user prefers otherwise
            // setActiveTab('computer'); 
        }
    }, [isOpen]);

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        // Clear input value to allow re-selecting same file
        e.target.value = '';

        if (file) {
            processFile(file);
        }
    };

    const processFile = (file: File) => {
        const reader = new FileReader();
        reader.onload = (f) => {
            if (f.target?.result && typeof f.target.result === 'string') {
                const newImage: GalleryImage = {
                    id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                    src: f.target.result,
                    createdAt: Date.now(),
                    name: file.name
                };

                setHistoryImages(prev => {
                    const updated = [newImage, ...prev].slice(0, MAX_HISTORY);
                    return updated;
                });
                
                // Auto select the new image
                setSelectedImageId(newImage.id);
                
                // Switch to history tab to show it's added? Or just show preview in upload tab?
                // The requirement says: "Auto select the new image (allow user to apply directly)"
                // Let's switch to history view or just show it as selected.
                // Requirement B-3: "Computer Upload tab... Auto select latest"
                // It might be better to just add it and maybe switch to History tab where user can see it selected?
                // Or maybe the upload tab shows the current selection too?
                // Let's switch to 'history' tab so they see it in the grid
                setActiveTab('history');
            }
        };
        reader.readAsDataURL(file);
    };

    const handleApply = () => {
        const selected = historyImages.find(img => img.id === selectedImageId);
        if (selected) {
            onApply(selected.src);
            onClose();
        }
    };

    const handleDelete = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setHistoryImages(prev => {
            const next = prev.filter(img => img.id !== id);
            // set(STORAGE_KEY, next); // useEffect will handle save, but we can do it here too if needed for immediate consistency
            // Actually relying on useEffect is safer to avoid race conditions with state updates
            return next;
        });
        if (selectedImageId === id) {
            setSelectedImageId(null);
        }
    };

    if (!isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[80vh] overflow-hidden animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-lg text-gray-800 flex items-center gap-2">
                        <ImageIcon className="w-5 h-5 text-blue-600" />
                        我的圖庫
                    </h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-gray-100 bg-white">
                    <button
                        onClick={() => setActiveTab('computer')}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
                            activeTab === 'computer' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        <Upload className="w-4 h-4" />
                        圖片上傳
                    </button>
                    <button
                        onClick={() => setActiveTab('history')}
                        className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 border-b-2 transition-colors ${
                            activeTab === 'history' ? 'border-blue-500 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                        }`}
                    >
                        <Clock className="w-4 h-4" />
                        從歷史圖片中選擇
                    </button>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50 min-h-[300px]">
                    {activeTab === 'computer' && (
                        <div className="h-full flex flex-col items-center justify-center space-y-4">
                            <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mb-2">
                                <Upload className="w-10 h-10 text-blue-600" />
                            </div>
                            <h4 className="text-lg font-semibold text-gray-800">上傳照片</h4>
                            <p className="text-gray-500 text-sm max-w-xs text-center">
                                支援 JPG, PNG 格式。上傳後將自動儲存至歷史圖庫。
                            </p>
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="mt-4 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 active:translate-y-0"
                            >
                                選擇檔案
                            </button>
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={handleFileSelect}
                            />
                        </div>
                    )}

                    {activeTab === 'history' && (
                        <div>
                            {historyImages.length === 0 ? (
                                <div className="text-center py-20 text-gray-400">
                                    <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                    <p>尚未有上傳紀錄</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                    {historyImages.map((img) => (
                                        <div
                                            key={img.id}
                                            onClick={() => setSelectedImageId(img.id)}
                                            className={`aspect-square rounded-lg overflow-hidden cursor-pointer relative group border-2 transition-all ${
                                                selectedImageId === img.id ? 'border-blue-500 ring-2 ring-blue-200' : 'border-gray-200 hover:border-blue-300'
                                            }`}
                                        >
                                            <img src={img.src} alt={img.name} className="w-full h-full object-cover" />
                                            
                                            {/* Selected Indicator */}
                                            {selectedImageId === img.id && (
                                                <div className="absolute top-1 right-1 w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center shadow-sm z-10">
                                                    <Check className="w-3 h-3 text-white" />
                                                </div>
                                            )}

                                            {/* Delete Button (Hover) */}
                                            <button
                                                onClick={(e) => handleDelete(img.id, e)}
                                                className="absolute bottom-1 right-1 p-1.5 bg-white/90 rounded-full text-red-500 opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all shadow-sm z-10"
                                                title="刪除"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-white flex justify-between items-center">
                    <div className="text-sm text-gray-500">
                        {activeTab === 'history' && (
                            <span>已選擇: {selectedImageId ? '1' : '0'} 張，共 {historyImages.length} 張</span>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors text-sm font-medium"
                        >
                            取消
                        </button>
                        <button
                            onClick={handleApply}
                            disabled={!selectedImageId}
                            className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            套用
                        </button>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
