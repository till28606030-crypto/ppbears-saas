import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { X, Search, ImageIcon, FolderOpen, Upload, Loader2, Check } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { format } from 'date-fns';

interface MediaSelectorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelect: (publicUrl: string) => void;
    onSelectMultiple?: (urls: string[]) => void;
    isMultiple?: boolean;
    existingUrls?: string[];
    defaultBucket?: 'models' | 'assets' | 'designs';
}

export default function MediaSelectorModal({
    isOpen,
    onClose,
    onSelect,
    onSelectMultiple,
    isMultiple = false,
    existingUrls = [],
    defaultBucket = 'models'
}: MediaSelectorModalProps) {
    const [activeTab, setActiveTab] = useState<'models' | 'assets' | 'designs'>(defaultBucket);
    const [files, setFiles] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isUploading, setIsUploading] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedUrls, setSelectedUrls] = useState<string[]>([]);

    const fetchFiles = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await supabase.storage.from(activeTab).list('', {
                limit: 100,
                sortBy: { column: 'created_at', order: 'desc' }
            });
            if (error) throw error;
            const validFiles = data?.filter(file => file.name !== '.emptyFolderPlaceholder') || [];
            setFiles(validFiles);
        } catch (error) {
            console.error('Error fetching files:', error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            fetchFiles();
            setSelectedUrls([]); // Reset selection when modal opens
        }
    }, [isOpen, activeTab]);

    const handleUploadNew = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const ext = file.name.split('.').pop()?.toLowerCase();
            const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`;

            const { error: uploadError } = await supabase.storage
                .from(activeTab)
                .upload(fileName, file);

            if (uploadError) {
                if (uploadError.name === 'AbortError' || uploadError.message?.includes('signal is aborted')) {
                    console.warn('Supabase upload aborted ignoring.');
                } else {
                    throw uploadError;
                }
            }

            // Fetch the public URL after upload
            const { data: publicUrlData } = supabase.storage.from(activeTab).getPublicUrl(fileName);

            // Auto select the newly uploaded file
            onSelect(publicUrlData.publicUrl);
        } catch (error) {
            console.error('Upload failed:', error);
            alert('上傳失敗');
        } finally {
            setIsUploading(false);
        }
    };

    const handleSelectExisting = (fileName: string) => {
        const { data: publicUrlData } = supabase.storage.from(activeTab).getPublicUrl(fileName);
        const url = publicUrlData.publicUrl;

        if (isMultiple) {
            setSelectedUrls(prev => {
                if (prev.includes(url)) {
                    return prev.filter(u => u !== url);
                }
                return [...prev, url];
            });
        } else {
            onSelect(url);
        }
    };

    const handleConfirmSelection = () => {
        if (isMultiple && onSelectMultiple) {
            onSelectMultiple(selectedUrls);
        }
    };

    if (!isOpen) return null;

    const filteredFiles = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">

                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <div>
                        <h2 className="text-xl font-bold flex items-center gap-2">
                            <ImageIcon className="w-6 h-6 text-blue-600" />
                            選取媒體
                        </h2>
                        <p className="text-sm text-gray-500 mt-0.5">從媒體庫選擇圖片，或直接上傳新圖檔</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Toolbar */}
                <div className="flex flex-col sm:flex-row items-center justify-between p-4 border-b border-gray-100 gap-4 bg-gray-50/50">
                    <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 hide-scrollbar">
                        {[
                            { id: 'models', label: '設計模板' },
                            { id: 'assets', label: '素材庫' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`px-4 py-2 text-sm rounded-lg font-medium whitespace-nowrap transition-colors ${activeTab === tab.id
                                    ? 'bg-blue-100 text-blue-700 shadow-sm'
                                    : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
                                    }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto">
                        <div className="relative w-full sm:w-64">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="搜尋..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                            />
                        </div>

                        <label className={`cursor-pointer whitespace-nowrap flex items-center gap-2 px-4 py-2 bg-black text-white rounded-lg font-medium text-sm hover:bg-gray-800 transition-colors ${isUploading ? 'opacity-50 pointer-events-none' : ''}`}>
                            {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                            {isUploading ? '上傳中...' : '新圖檔'}
                            <input type="file" accept="image/*" className="hidden" onChange={handleUploadNew} disabled={isUploading} />
                        </label>
                    </div>
                </div>

                {/* Grid */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50/30 min-h-0">
                    {isLoading && files.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <Loader2 className="w-8 h-8 animate-spin mb-2" />
                            載入中...
                        </div>
                    ) : filteredFiles.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <FolderOpen className="w-12 h-12 mb-3 text-gray-300" />
                            沒有找到可用圖檔
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3 content-start">
                            {filteredFiles.map(file => {
                                const url = supabase.storage.from(activeTab).getPublicUrl(file.name).data.publicUrl;
                                const isImage = file.metadata?.mimetype?.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i);

                                return (
                                    <div
                                        key={file.name}
                                        onClick={() => handleSelectExisting(file.name)}
                                        className="group relative bg-white border border-gray-200 rounded-lg overflow-hidden cursor-pointer hover:border-blue-500 hover:ring-1 hover:ring-blue-500 transition-all shadow-sm"
                                    >
                                        <div className="aspect-square bg-gray-100 flex items-center justify-center overflow-hidden">
                                            {isImage ? (
                                                <img
                                                    src={url}
                                                    alt={file.name}
                                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <ImageIcon className="w-8 h-8 text-gray-400" />
                                            )}

                                            {/* Selection Overlay / Status */}
                                            <div className={`absolute inset-0 transition-opacity flex flex-col items-center justify-center gap-2 ${selectedUrls.includes(url) || existingUrls.includes(url)
                                                ? 'bg-blue-600/20 opacity-100'
                                                : 'bg-black/40 opacity-0 group-hover:opacity-100'
                                                }`}>
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center shadow-lg transform transition-transform ${selectedUrls.includes(url) || existingUrls.includes(url)
                                                    ? 'bg-blue-600 text-white scale-100'
                                                    : 'bg-white text-blue-600 translate-y-2 group-hover:translate-y-0 scale-90'
                                                    }`}>
                                                    <Check className="w-5 h-5" />
                                                </div>
                                                {(existingUrls.includes(url)) && (
                                                    <span className="bg-blue-600 text-white text-[10px] px-2 py-0.5 rounded-full font-bold">已在清單中</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer for Multiple Selection */}
                {isMultiple && (
                    <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-white">
                        <div className="text-sm text-gray-500">
                            已選取 <span className="font-bold text-blue-600">{selectedUrls.length}</span> 個項目
                        </div>
                        <div className="flex gap-3">
                            <button
                                onClick={onClose}
                                className="px-6 py-2 border border-gray-300 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleConfirmSelection}
                                disabled={selectedUrls.length === 0}
                                className={`px-8 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold transition-all shadow-md active:scale-95 ${selectedUrls.length === 0 ? 'opacity-50 grayscale cursor-not-allowed shadow-none' : 'hover:bg-blue-700'
                                    }`}
                            >
                                確認選取
                            </button>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
}
