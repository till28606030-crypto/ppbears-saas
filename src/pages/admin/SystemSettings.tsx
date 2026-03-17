import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Trash2, Search, Loader2, Database, AlertTriangle, Image as ImageIcon } from 'lucide-react';
import { formatBytes } from '@/lib/utils';
import { format } from 'date-fns';

// Build the public URL for a file in a given bucket
function getPublicUrl(bucket: string, filename: string): string {
  const base = import.meta.env.VITE_SUPABASE_URL as string;
  return `${base}/storage/v1/object/public/${bucket}/${encodeURIComponent(filename)}`;
}

export default function SystemSettings() {
  const [isScanning, setIsScanning] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [scanResult, setScanResult] = useState<{
    orphanedFiles: any[];
    totalScanned: number;
    totalReferenced: number;
  } | null>(null);

  const scanStorage = async () => {
    setIsScanning(true);
    setScanResult(null);
    try {
      // ── PHASE 1: Scan ONLY the "models" bucket ──────────────────
      // This bucket holds product template images (base & mask images).
      // We deliberately skip the "assets" bucket because it contains
      // stickers, backgrounds, frames and design templates that are managed
      // independently and should NOT be treated as orphans here.
      const { data: modelsData, error: modelsError } = await supabase.storage
        .from('models')
        .list('', { limit: 2000 });
      if (modelsError) throw modelsError;

      const allStorageFiles = (modelsData ?? [])
        .filter(f => f.name !== '.emptyFolderPlaceholder')
        .map(f => ({ ...f, bucket: 'models' }));

      // ── PHASE 2: Collect ONLY product-template references ────────
      // We only look at the `products` table columns base_image & mask_image.
      // Sticker / background / frame / design-template URLs are intentionally
      // excluded so those bucket files are never flagged as orphans.
      const referencedUrls = new Set<string>();

      const { data: products } = await supabase
        .from('products')
        .select('base_image, mask_image');
      products?.forEach(p => {
        if (p.base_image) referencedUrls.add(p.base_image);
        if (p.mask_image)  referencedUrls.add(p.mask_image);
      });

      // ── PHASE 3: Extract filenames from URLs ─────────────────────
      const referencedFilenames = new Set(
        Array.from(referencedUrls).map(url => {
          try {
            const parts = url.split('/');
            return decodeURIComponent(parts[parts.length - 1]);
          } catch {
            return url;
          }
        })
      );

      const orphanedFiles = allStorageFiles.filter(
        f => !referencedFilenames.has(f.name)
      );

      setScanResult({
        orphanedFiles,
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
    if (!window.confirm(
      `確定要徹底刪除這 ${scanResult.orphanedFiles.length} 個孤兒檔案嗎？\n此動作無法復原！`
    )) return;

    setIsDeleting(true);
    try {
      const names = scanResult.orphanedFiles.map(f => f.name);
      const { error } = await supabase.storage.from('models').remove(names);
      if (error) throw error;
      alert('清理完成！');
      setScanResult(null);
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
                掃描<strong>產品模板（底圖 / 遮罩圖）</strong>的孤兒檔案。
                素材庫（貼圖、背景、相框）、設計款模板圖片<span className="text-blue-600 font-medium">不在此清理範圍</span>。
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
            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                <div className="text-sm text-gray-500 mb-1">總掃描檔案數</div>
                <div className="text-2xl font-bold">{scanResult.totalScanned}</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                <div className="text-sm text-gray-500 mb-1">產品模板有效引用數</div>
                <div className="text-2xl font-bold">{scanResult.totalReferenced}</div>
              </div>
              <div className={`p-4 rounded-lg border ${
                scanResult.orphanedFiles.length > 0
                  ? 'bg-red-50 border-red-100'
                  : 'bg-green-50 border-green-100'
              }`}>
                <div className={`text-sm mb-1 ${
                  scanResult.orphanedFiles.length > 0 ? 'text-red-700' : 'text-green-700'
                }`}>找出的孤兒檔案</div>
                <div className={`text-2xl font-bold ${
                  scanResult.orphanedFiles.length > 0 ? 'text-red-700' : 'text-green-700'
                }`}>{scanResult.orphanedFiles.length}</div>
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

                <div className="border border-gray-200 rounded-lg overflow-y-auto max-h-[560px]">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 sticky top-0 border-b border-gray-200 z-10">
                      <tr>
                        <th className="px-4 py-3 font-medium text-gray-600 w-16">縮圖</th>
                        <th className="px-4 py-3 font-medium text-gray-600">檔案名稱</th>
                        <th className="px-4 py-3 font-medium text-gray-600">大小</th>
                        <th className="px-4 py-3 font-medium text-gray-600">建立時間</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {scanResult.orphanedFiles.map((file, idx) => {
                        const publicUrl = getPublicUrl(file.bucket, file.name);
                        const isImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(file.name);
                        return (
                          <tr key={idx} className="hover:bg-gray-50 transition-colors">
                            {/* Thumbnail */}
                            <td className="px-4 py-2">
                              {isImage ? (
                                <a href={publicUrl} target="_blank" rel="noopener noreferrer">
                                  <img
                                    src={publicUrl}
                                    alt={file.name}
                                    className="w-12 h-12 object-cover rounded border border-gray-200 hover:scale-110 transition-transform cursor-pointer"
                                    loading="lazy"
                                    onError={e => {
                                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                                    }}
                                  />
                                </a>
                              ) : (
                                <div className="w-12 h-12 flex items-center justify-center bg-gray-100 rounded border border-gray-200">
                                  <ImageIcon className="w-5 h-5 text-gray-400" />
                                </div>
                              )}
                            </td>
                            {/* Filename */}
                            <td className="px-4 py-3">
                              <a
                                href={publicUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-gray-800 hover:text-blue-600 break-all"
                              >
                                {file.name}
                              </a>
                            </td>
                            {/* Size */}
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                              {formatBytes(file.metadata?.size || 0)}
                            </td>
                            {/* Date */}
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                              {file.created_at
                                ? format(new Date(file.created_at), 'yyyy-MM-dd HH:mm')
                                : '-'}
                            </td>
                          </tr>
                        );
                      })}
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
                太棒了！產品模板的儲存空間非常乾淨，沒有任何多餘的孤兒檔案。
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
