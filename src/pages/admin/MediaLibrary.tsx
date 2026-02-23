import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Loader2, RefreshCw, Trash2, Search, ImageIcon, FolderOpen } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { format } from 'date-fns';

export default function MediaLibrary() {
    const [activeTab, setActiveTab] = useState<'models' | 'assets' | 'designs'>('models');
    const [files, setFiles] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());

    const fetchFiles = async () => {
        setIsLoading(true);
        setSelectedFiles(new Set());

        try {
            // List all objects in the selected bucket. Note: This gets up to 1000 items at a time without pagination.
            // A more robust implementation would use offset/limit pagination.
            const { data, error } = await supabase.storage.from(activeTab).list('', {
                limit: 1000,
                sortBy: { column: 'created_at', order: 'desc' }
            });

            if (error) throw error;

            // Filter out 'emptyFolderPlaceholder' or similar internal Supabase files
            const validFiles = data?.filter(file => file.name !== '.emptyFolderPlaceholder') || [];
            setFiles(validFiles);
        } catch (error) {
            console.error('Error fetching files:', error);
            alert('載入檔案失敗');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchFiles();
    }, [activeTab]);

    const handleDelete = async (fileNames: string[]) => {
        if (!window.confirm(`確定要刪除這 ${fileNames.length} 個檔案嗎？\n此動作無法復原！`)) return;

        setIsLoading(true);
        try {
            const { error } = await supabase.storage.from(activeTab).remove(fileNames);
            if (error) throw error;
            await fetchFiles();
        } catch (error) {
            console.error('Error deleting files:', error);
            alert('刪除檔案失敗');
        } finally {
            setIsLoading(false);
        }
    };

    const toggleSelect = (name: string) => {
        const next = new Set(selectedFiles);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        setSelectedFiles(next);
    };

    const getPublicUrl = (name: string) => {
        return supabase.storage.from(activeTab).getPublicUrl(name).data.publicUrl;
    };

    const filteredFiles = files.filter(f => f.name.toLowerCase().includes(search.toLowerCase()));

    return (
        <div className="p-6 md:p-8 max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
                <div>
                    <h1 className="text-2xl font-bold mb-1">媒體庫 (全域儲存空間)</h1>
                    <p className="text-gray-500">瀏覽與管理 Supabase Storage 內的原始檔案</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 overflow-x-auto pb-4 mb-6">
                {[
                    { id: 'models', label: '設計模板 (Models)' },
                    { id: 'assets', label: '素材圖片 (Assets)' },
                    { id: 'designs', label: '客戶設計大圖 (Designs)' },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as any)}
                        className={`px-4 py-2 rounded-full whitespace-nowrap transition-colors ${activeTab === tab.id
                                ? 'bg-blue-600 text-white shadow-sm'
                                : 'bg-white text-gray-600 hover:bg-gray-100'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col h-[70vh]">

                {/* Toolbar */}
                <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="relative max-w-xs w-full">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        <input
                            type="text"
                            placeholder="搜尋檔案名稱..."
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={fetchFiles}
                            className="flex items-center gap-2 px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors border border-gray-200"
                        >
                            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                            重新整理
                        </button>
                        {selectedFiles.size > 0 && (
                            <button
                                onClick={() => handleDelete(Array.from(selectedFiles))}
                                className="flex items-center gap-2 px-3 py-2 text-sm text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors shadow-sm"
                            >
                                <Trash2 className="w-4 h-4" />
                                刪除所選 ({selectedFiles.size})
                            </button>
                        )}
                    </div>
                </div>

                {/* Grid View */}
                <div className="flex-1 overflow-y-auto p-4 bg-gray-50/50">
                    {isLoading && files.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <Loader2 className="w-8 h-8 animate-spin mb-2" />
                            載入中...
                        </div>
                    ) : filteredFiles.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-gray-500">
                            <FolderOpen className="w-12 h-12 mb-3 text-gray-300" />
                            沒有找到檔案
                        </div>
                    ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                            {filteredFiles.map(file => {
                                const url = getPublicUrl(file.name);
                                const isSelected = selectedFiles.has(file.name);
                                const isImage = file.metadata?.mimetype?.startsWith('image/') || file.name.match(/\.(jpg|jpeg|png|gif|webp|svg)$/i);

                                return (
                                    <div
                                        key={file.id || file.name}
                                        title={file.name}
                                        className={`relative group bg-white border rounded-lg overflow-hidden cursor-pointer hover:shadow-md transition-all ${isSelected ? 'ring-2 ring-blue-500 border-transparent shadow-sm' : 'border-gray-200'
                                            }`}
                                        onClick={() => toggleSelect(file.name)}
                                    >
                                        <div className="aspect-square bg-gray-100 flex items-center justify-center relative">
                                            {isImage ? (
                                                <img
                                                    src={url}
                                                    alt={file.name}
                                                    className="w-full h-full object-cover"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <ImageIcon className="w-8 h-8 text-gray-400" />
                                            )}

                                            {/* Checkbox Overlay */}
                                            <div className={`absolute top-2 left-2 w-5 h-5 rounded-full border-2 ${isSelected
                                                    ? 'bg-blue-500 border-blue-500 text-white'
                                                    : 'border-white/80 bg-black/20 group-hover:border-white opacity-0 group-hover:opacity-100 transition-opacity'
                                                } flex items-center justify-center`}>
                                                {isSelected && <svg viewBox="0 0 24 24" fill="none" className="w-3 h-3 " stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>}
                                            </div>
                                        </div>

                                        <div className="p-2 text-xs truncate">
                                            <div className="font-medium text-gray-800 truncate" title={file.name}>{file.name}</div>
                                            <div className="text-gray-500 mt-0.5 flex justify-between">
                                                <span>{formatBytes(file.metadata?.size || 0)}</span>
                                                <span>{file.created_at ? format(new Date(file.created_at), 'MM/dd') : ''}</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
