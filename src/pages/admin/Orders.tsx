import { useState, useEffect } from 'react';
import { get, set } from 'idb-keyval';
import { ShoppingBag, Download, Clock, Search, Trash2, Settings, Save, AlertCircle } from 'lucide-react';

interface Order {
  id: string;
  designId?: string;
  productName: string;
  timestamp: string;
  previewImage: string;
  printImage: string;
  price: number;
}

export default function AdminOrders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [autoDeleteDays, setAutoDeleteDays] = useState<string>('');
  const [isAutoDeleteRunning, setIsAutoDeleteRunning] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
        try {
            const [loadedOrders, settings] = await Promise.all([
                get('mock_orders'),
                get('admin_settings')
            ]);
            
            let currentOrders = loadedOrders || [];
            
            // Auto Delete Logic
            if (settings?.autoDeleteDays) {
                const days = parseInt(settings.autoDeleteDays, 10);
                if (days > 0) {
                    setIsAutoDeleteRunning(true);
                    const cutoff = new Date();
                    cutoff.setDate(cutoff.getDate() - days);
                    
                    const newOrders = currentOrders.filter((o: Order) => {
                        return new Date(o.timestamp) > cutoff;
                    });
                    
                    if (newOrders.length !== currentOrders.length) {
                        console.log(`Auto-deleted ${currentOrders.length - newOrders.length} old orders.`);
                        await set('mock_orders', newOrders);
                        currentOrders = newOrders;
                    }
                    setIsAutoDeleteRunning(false);
                }
                setAutoDeleteDays(settings.autoDeleteDays);
            }
            
            setOrders(currentOrders);
        } catch (err) {
            console.error("Failed to load data:", err);
        }
    };
    fetchData();
  }, []);

  const handleSaveSettings = async () => {
      try {
          await set('admin_settings', { autoDeleteDays });
          setShowSettings(false);
          
          // Re-run auto delete immediately if enabled
          if (autoDeleteDays && parseInt(autoDeleteDays) > 0) {
             const days = parseInt(autoDeleteDays);
             const cutoff = new Date();
             cutoff.setDate(cutoff.getDate() - days);
             
             const newOrders = orders.filter(o => new Date(o.timestamp) > cutoff);
             if (newOrders.length !== orders.length) {
                 if (window.confirm(`即將刪除 ${orders.length - newOrders.length} 筆超過 ${days} 天的舊訂單，確定嗎？`)) {
                    await set('mock_orders', newOrders);
                    setOrders(newOrders);
                 }
             } else {
                 alert('設定已儲存 (目前沒有需要刪除的舊訂單)');
             }
          } else {
             alert('設定已儲存');
          }
      } catch (err) {
          console.error("Failed to save settings:", err);
          alert("儲存設定失敗");
      }
  };

  const handleDelete = async (orderId: string) => {
      if (!window.confirm('確定要刪除此訂單嗎？此操作無法復原。')) return;
      
      try {
          const newOrders = orders.filter(o => o.id !== orderId);
          await set('mock_orders', newOrders);
          setOrders(newOrders);
      } catch (err) {
          console.error("Failed to delete order:", err);
          alert("刪除失敗");
      }
  };

  const filteredOrders = orders.filter(order => 
    order.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
    order.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (order.designId && order.designId.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleDownloadImage = (dataUrl: string, orderId: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `order-${orderId}-PRINT.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <>
        <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-800">新訂單列表</h1>
          <button 
            onClick={() => setShowSettings(!showSettings)}
            className={`p-2 rounded-lg transition-colors ${showSettings ? 'bg-gray-100 text-blue-600' : 'text-gray-500 hover:bg-gray-50'}`}
            title="訂單設定"
          >
            <Settings className="w-5 h-5" />
          </button>
        </header>

        {/* Settings Panel */}
        {showSettings && (
            <div className="bg-gray-50 border-b border-gray-200 p-8 animate-in slide-in-from-top-2">
                <div className="max-w-5xl mx-auto bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                    <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Settings className="w-5 h-5" />
                        訂單列表設定
                    </h2>
                    <div className="flex items-end gap-4">
                        <div className="flex-1 max-w-sm">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                自動刪除舊訂單
                            </label>
                            <div className="relative">
                                <input
                                    type="number"
                                    min="0"
                                    placeholder="輸入天數 (例如 30)"
                                    value={autoDeleteDays}
                                    onChange={(e) => setAutoDeleteDays(e.target.value)}
                                    className="block w-full pl-3 pr-10 py-2.5 bg-white border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                                />
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-gray-400 text-sm">
                                    天
                                </div>
                            </div>
                            <p className="mt-2 text-xs text-gray-500">
                                設定為 0 或空白則不自動刪除。系統將在每次載入時檢查並刪除超過此天數的訂單。
                            </p>
                        </div>
                        <button
                            onClick={handleSaveSettings}
                            className="px-4 py-2.5 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
                        >
                            <Save className="w-4 h-4" />
                            儲存設定
                        </button>
                    </div>
                </div>
            </div>
        )}

        <div className="p-8 max-w-5xl mx-auto">
            {/* Search Bar */}
            <div className="mb-6 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <Search className="w-5 h-5" />
                </div>
                <input
                    type="text"
                    placeholder="搜尋訂單編號、商品名稱或設計 ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="block w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all shadow-sm"
                />
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {!filteredOrders || filteredOrders.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <ShoppingBag className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <p className="text-lg">
                            {searchTerm ? '找不到符合搜尋條件的訂單' : '目前尚無訂單'}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {filteredOrders.map((order) => (
                            <div key={order.id} className="p-6 flex items-center gap-6 hover:bg-gray-50 transition-colors">
                                {/* Thumbnail (Shows PREVIEW) */}
                                <div className="w-24 h-32 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                                    <img src={order.previewImage} alt="Preview" className="w-full h-full object-contain" />
                                </div>
                                
                                {/* Info */}
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="font-bold text-gray-900">{order.id}</h3>
                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">已付款</span>
                                    </div>
                                    <p className="text-gray-600 font-medium">{order.productName}</p>
                                    {order.designId && (
                                        <p className="text-xs text-gray-500 font-mono mt-1 bg-gray-100 inline-block px-2 py-1 rounded">
                                            設計 ID: {order.designId}
                                        </p>
                                    )}
                                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {new Date(order.timestamp).toLocaleString('zh-TW')}
                                        </span>
                                        <span>NT$ {order.price}</span>
                                    </div>
                                </div>

                                {/* Actions (Downloads PRINT FILE) */}
                                <div className="flex items-center gap-2">
                                    <button 
                                        onClick={() => handleDownloadImage(order.printImage, order.id)}
                                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors shadow-sm"
                                    >
                                        <Download className="w-4 h-4" />
                                        下載印刷檔
                                    </button>
                                    <button 
                                        onClick={() => handleDelete(order.id)}
                                        className="p-2 bg-white border border-gray-200 text-red-500 rounded-lg hover:bg-red-50 hover:border-red-200 transition-colors shadow-sm"
                                        title="刪除訂單"
                                    >
                                        <Trash2 className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    </>
  );
}
