import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Trash2, Search, Loader2, Database, AlertTriangle } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { format } from 'date-fns';

export default function SystemSettings() {
    const [isScanning, setIsScanning] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);
    const [scanResult, setScanResult] = useState<{
        bucket: string;
        orphanedFiles: any[];
        totalScanned: number;
        totalReferenced: number;
    } | null>(null);

    const scanStorage = async () => {
        setIsScanning(true);
        setScanResult(null);
        try {
            // PHASE 1: Scan storage buckets
            console.log('Scanning storage...');
            const { data: modelsData, error: modelsError } = await supabase.storage.from('models').list('', { limit: 1000 });
            if (modelsError) throw modelsError;

            const { data: assetsData, error: assetsError } = await supabase.storage.from('assets').list('', { limit: 1000 });
            if (assetsError) throw assetsError;

            const allStorageFiles = [
                ...(modelsData?.filter(f => f.name !== '.emptyFolderPlaceholder').map(f => ({ ...f, bucket: 'models' })) || []),
                ...(assetsData?.filter(f => f.name !== '.emptyFolderPlaceholder').map(f => ({ ...f, bucket: 'assets' })) || [])
            ];

            // PHASE 2: Fetch all database references
            console.log('Scanning DB references...');

            const referencedUrls = new Set<string>();

            // 1. Stickers
            const { data: stickers } = await supabase.from('stickers').select('file_url');
            stickers?.forEach(s => s.file_url && referencedUrls.add(s.file_url));

            // 2. Backgrounds
            const { data: backgrounds } = await supabase.from('backgrounds').select('file_url');
            backgrounds?.forEach(b => b.file_url && referencedUrls.add(b.file_url));

            // 3. Custom Products (preview_url, print_url)
            const { data: products } = await supabase.from('custom_products').select('preview_url, print_url');
            products?.forEach(p => {
                if (p.preview_url) referencedUrls.add(p.preview_url);
                if (p.print_url) referencedUrls.add(p.print_url);
            });

            // 4. Option Groups (Image Items and Sub attributes)
            // This is a complex JSON structure, we might need a distinct query or fetch all active option_groups
            const { data: optionGroups } = await supabase.from('option_groups').select('items');
            optionGroups?.forEach(group => {
                if (Array.isArray(group.items)) {
                    group.items.forEach((item: any) => {
                        if (item.image) referencedUrls.add(item.image);
                        if (item.sub_attributes && Array.isArray(item.sub_attributes)) {
                            item.sub_attributes.forEach((sub: any) => {
                                if (sub.image) referencedUrls.add(sub.image);
                            });
                        }
                    });
                }
            });

            // PHASE 3: Compare
            console.log('Comparing arrays...');
            // Extract filename from the referenced URL to compare against storage filenames
            const referencedFilenames = new Set(
                Array.from(referencedUrls).map(url => {
                    try {
                        // URLs look like: .../storage/v1/object/public/models/preview-123.jpg
                        const parts = url.split('/');
                        return decodeURIComponent(parts[parts.length - 1]);
                    } catch (e) {
                        return url;
                    }
                })
            );

            const orphanedFiles = allStorageFiles.filter(f => !referencedFilenames.has(f.name));

            setScanResult({
                bucket: 'All (models, assets)',
                orphanedFiles: orphanedFiles,
                totalScanned: allStorageFiles.length,
                totalReferenced: referencedFilenames.size,
            });

        } catch (error) {
            console.error('Scan error:', error);
            alert('掃描失敗，請查看控制台。');
        } finally {
            setIsScanning(false);
        }
    };

    const handleBulkDelete = async () => {
        if (!scanResult || scanResult.orphanedFiles.length === 0) return;

        if (!window.confirm(`確定要徹底刪除這 ${scanResult.orphanedFiles.length} 個無效檔案嗎？\n此動作無法復原！`)) return;

        setIsDeleting(true);
        try {
            // Split by bucket
            const modelsToDelete = scanResult.orphanedFiles.filter(f => f.bucket === 'models').map(f => f.name);
            const assetsToDelete = scanResult.orphanedFiles.filter(f => f.bucket === 'assets').map(f => f.name);

            if (modelsToDelete.length > 0) {
                const { error } = await supabase.storage.from('models').remove(modelsToDelete);
                if (error) throw error;
            }

            if (assetsToDelete.length > 0) {
                const { error } = await supabase.storage.from('assets').remove(assetsToDelete);
                if (error) throw error;
            }

            alert('清理完成！');
            setScanResult(null); // Clear result to force rescan
        } catch (error) {
            console.error('Delete error:', error);
            alert('刪除失敗');
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="p-6 md:p-8 max-w-5xl mx-auto">
            <div className="mb-8">
                <h1 className="text-2xl font-bold mb-1">系統設定</h1>
                <p className="text-gray-500">維護與清理系統檔案資源</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6 border-b border-gray-200 bg-gray-50/50">
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
                        <div>
                            <h2 className="text-lg font-semibold flex items-center gap-2">
                                <Database className="w-5 h-5 text-blue-600" />
                                儲存空間孤兒檔案清理
                            </h2>
                            <p className="text-sm text-gray-500 mt-1 max-w-2xl">
                                當您在編輯器中刪除模板或素材選項後，實體圖片可能仍殘留在伺服器上（稱為孤兒檔案）。
                                您可以使用此工具掃描並一鍵刪除所有未被資料庫引用的圖片，釋放雲端空間。
                            </p>
                        </div>
                        <button
                            onClick={scanStorage}
                            disabled={isScanning || isDeleting}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 font-medium whitespace-nowrap disabled:opacity-50"
                        >
                            {isScanning ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> 掃描中...</>
                            ) : (
                                <><Search className="w-4 h-4" /> 開始掃描</>
                            )}
                        </button>
                    </div>
                </div>

                {scanResult && (
                    <div className="p-6">
                        <div className="grid grid-cols-3 gap-4 mb-6">
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                                <div className="text-sm text-gray-500 mb-1">總掃描檔案數</div>
                                <div className="text-2xl font-bold">{scanResult.totalScanned}</div>
                            </div>
                            <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                                <div className="text-sm text-gray-500 mb-1">資料庫有效引用數</div>
                                <div className="text-2xl font-bold">{scanResult.totalReferenced}</div>
                            </div>
                            <div className={`p-4 rounded-lg border ${scanResult.orphanedFiles.length > 0 ? 'bg-red-50 border-red-100' : 'bg-green-50 border-green-100'}`}>
                                <div className={`text-sm mb-1 ${scanResult.orphanedFiles.length > 0 ? 'text-red-700' : 'text-green-700'}`}>找出的孤兒檔案</div>
                                <div className={`text-2xl font-bold ${scanResult.orphanedFiles.length > 0 ? 'text-red-700' : 'text-green-700'}`}>{scanResult.orphanedFiles.length}</div>
                            </div>
                        </div>

                        {scanResult.orphanedFiles.length > 0 ? (
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold flex items-center gap-2 text-red-700">
                                        <AlertTriangle className="w-5 h-5" />
                                        需清理的檔案列表
                                    </h3>
                                    <button
                                        onClick={handleBulkDelete}
                                        disabled={isDeleting}
                                        className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors flex items-center gap-2 font-medium text-sm disabled:opacity-50"
                                    >
                                        {isDeleting ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" /> 刪除中...</>
                                        ) : (
                                            <><Trash2 className="w-4 h-4" /> 批次刪除全部孤兒檔案</>
                                        )}
                                    </button>
                                </div>

                                <div className="border border-gray-200 rounded-lg overflow-y-auto max-h-96">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-50 sticky top-0 border-b border-gray-200">
                                            <tr>
                                                <th className="px-4 py-3 font-medium text-gray-600">檔案名稱</th>
                                                <th className="px-4 py-3 font-medium text-gray-600">類型 (Bucket)</th>
                                                <th className="px-4 py-3 font-medium text-gray-600">大小</th>
                                                <th className="px-4 py-3 font-medium text-gray-600">建立時間</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-200">
                                            {scanResult.orphanedFiles.map((file, idx) => (
                                                <tr key={idx} className="hover:bg-gray-50">
                                                    <td className="px-4 py-3 font-medium text-gray-800 break-all">{file.name}</td>
                                                    <td className="px-4 py-3 text-gray-500">
                                                        <span className="px-2 py-1 bg-gray-100 rounded text-xs">{file.bucket}</span>
                                                    </td>
                                                    <td className="px-4 py-3 text-gray-500">{formatBytes(file.metadata?.size || 0)}</td>
                                                    <td className="px-4 py-3 text-gray-500">{file.created_at ? format(new Date(file.created_at), 'yyyy-MM-dd HH:mm') : '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500">
                                <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                </div>
                                太棒了！目前儲存空間非常乾淨，沒有任何多餘的孤兒檔案。
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
