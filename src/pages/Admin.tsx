import { useState, useEffect } from 'react';
import { get, update } from 'idb-keyval';
import { useProductStore } from '../store/useProductStore';
import { Settings, Save, LayoutDashboard, LogOut, Upload, Image as ImageIcon, ShoppingBag, Download, Clock, Sticker, Image, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Order {
  id: string;
  productName: string;
  timestamp: string;
  previewImage: string;
  printImage: string;
  price: number;
}

export default function Admin() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'product' | 'orders' | 'assets'>('orders'); // Default to orders for now
  const [activeAssetTab, setActiveAssetTab] = useState<'stickers' | 'backgrounds'>('stickers');
  const [orders, setOrders] = useState<Order[]>([]);
  const [stickers, setStickers] = useState<string[]>([]);
  const [backgrounds, setBackgrounds] = useState<string[]>([]);

  // Load orders and assets on mount
  useEffect(() => {
    const fetchData = async () => {
        try {
            const loadedOrders = await get('mock_orders');
            setOrders(loadedOrders || []);
            
            const loadedStickers = await get('store_stickers');
            setStickers(loadedStickers || []);

            const loadedBackgrounds = await get('store_backgrounds');
            setBackgrounds(loadedBackgrounds || []);
        } catch (err) {
            console.error("Failed to load data:", err);
        }
    };
    fetchData();
  }, []);

  const handleAssetUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'stickers' | 'backgrounds') => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onload = async (f) => {
              if (f.target?.result) {
                  const base64 = f.target.result as string;
                  const key = type === 'stickers' ? 'store_stickers' : 'store_backgrounds';
                  
                  await update(key, (items) => {
                      const current = items || [];
                      return [...current, base64];
                  });

                  // Update local state
                  if (type === 'stickers') setStickers(prev => [...prev, base64]);
                  else setBackgrounds(prev => [...prev, base64]);
              }
          };
          reader.readAsDataURL(file);
      }
  };

  const deleteAsset = async (index: number, type: 'stickers' | 'backgrounds') => {
      if (!confirm('Are you sure you want to delete this asset?')) return;
      
      const key = type === 'stickers' ? 'store_stickers' : 'store_backgrounds';
      await update(key, (items) => {
          const current = items || [];
          return current.filter((_, i) => i !== index);
      });

      if (type === 'stickers') setStickers(prev => prev.filter((_, i) => i !== index));
      else setBackgrounds(prev => prev.filter((_, i) => i !== index));
  };

  const handleDownloadImage = (dataUrl: string, orderId: string) => {
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `order-${orderId}-PRINT.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // --- Product Store Logic ---
  const { 
    canvasWidth, 
    canvasHeight, 
    borderRadius, 
    productName, 
    baseImage, 
    maskImage,
    setProductParams 
  } = useProductStore();

  const [formState, setFormState] = useState({
    canvasWidth,
    canvasHeight,
    borderRadius,
    productName,
    baseImage,
    maskImage,
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormState((prev) => ({
      ...prev,
      [name]: name === 'productName' ? value : Number(value),
    }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, fieldName: 'baseImage' | 'maskImage') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (f) => {
        if (f.target?.result) {
          setFormState((prev) => ({
            ...prev,
            [fieldName]: f.target.result as string,
          }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSave = () => {
    setProductParams(formState);
    alert('Product parameters saved!');
  };

  return (
    <div className="flex h-screen bg-gray-100 font-sans text-gray-900">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-bold mr-3">
            A
          </div>
          <span className="font-semibold text-lg">Admin Panel</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          <button 
            onClick={() => setActiveTab('orders')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'orders' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <ShoppingBag className="w-5 h-5" />
            Orders
          </button>
          <button 
            onClick={() => setActiveTab('assets')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'assets' ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-50'}`}
          >
            <ImageIcon className="w-5 h-5" />
            Assets
          </button>
          <button 
            onClick={() => navigate('/seller/products')}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors text-gray-600 hover:bg-gray-50"
          >
            <LayoutDashboard className="w-5 h-5" />
            Seller Center
          </button>
        </nav>

        <div className="p-4 border-t border-gray-200">
          <button 
            onClick={() => navigate('/')}
            className="w-full flex items-center gap-3 px-4 py-3 text-gray-600 hover:bg-red-50 hover:text-red-600 rounded-lg font-medium transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Back to Site
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <header className="h-16 bg-white border-b border-gray-200 flex items-center px-8 shadow-sm">
          <h1 className="text-xl font-semibold text-gray-800">
            {activeTab === 'orders' && 'Incoming Orders'}
            {activeTab === 'assets' && 'Asset Library'}
          </h1>
        </header>

        <div className="p-8 max-w-5xl mx-auto">
          
          {/* --- ORDERS TAB --- */}
          {activeTab === 'orders' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                {!orders || orders.length === 0 ? (
                    <div className="p-12 text-center text-gray-500">
                        <ShoppingBag className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                        <p className="text-lg">No orders received yet.</p>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-100">
                        {orders.map((order) => (
                            <div key={order.id} className="p-6 flex items-center gap-6 hover:bg-gray-50 transition-colors">
                                {/* Thumbnail (Shows PREVIEW) */}
                                <div className="w-24 h-32 bg-gray-100 rounded-lg overflow-hidden border border-gray-200 flex-shrink-0">
                                    <img src={order.previewImage} alt="Preview" className="w-full h-full object-contain" />
                                </div>
                                
                                {/* Info */}
                                <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-1">
                                        <h3 className="font-bold text-gray-900">{order.id}</h3>
                                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full font-medium">Paid</span>
                                    </div>
                                    <p className="text-gray-600 font-medium">{order.productName}</p>
                                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3" />
                                            {new Date(order.timestamp).toLocaleString()}
                                        </span>
                                        <span>NT$ {order.price}</span>
                                    </div>
                                </div>

                                {/* Actions (Downloads PRINT FILE) */}
                                <button 
                                    onClick={() => handleDownloadImage(order.printImage, order.id)}
                                    className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors shadow-sm"
                                >
                                    <Download className="w-4 h-4" />
                                    Download Print File
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
          )}

          {/* --- PRODUCT SETTINGS TAB --- */}
          {activeTab === 'product' && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-200 bg-gray-50">
              <h2 className="text-lg font-medium text-gray-900">Base Model Parameters</h2>
              <p className="text-sm text-gray-500 mt-1">Adjust the dimensions and assets of the phone case model.</p>
            </div>
            
            <div className="p-8 space-y-8">
              {/* Basic Info */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Product Name</label>
                <input
                  type="text"
                  name="productName"
                  value={formState.productName}
                  onChange={handleChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                />
              </div>

              {/* Dimensions */}
              <div className="grid grid-cols-3 gap-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Width (px)</label>
                  <input
                    type="number"
                    name="canvasWidth"
                    value={formState.canvasWidth}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Height (px)</label>
                  <input
                    type="number"
                    name="canvasHeight"
                    value={formState.canvasHeight}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Border Radius (px)</label>
                  <input
                    type="number"
                    name="borderRadius"
                    value={formState.borderRadius}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Asset Uploads */}
              <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-100">
                {/* Base Image Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Base Layer Image</label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:bg-gray-50 transition-colors text-center cursor-pointer relative h-48 flex flex-col items-center justify-center">
                    {formState.baseImage ? (
                      <img src={formState.baseImage} alt="Base" className="h-full object-contain" />
                    ) : (
                      <div className="text-gray-400">
                        <ImageIcon className="w-8 h-8 mx-auto mb-2" />
                        <span className="text-sm">Click to upload base</span>
                      </div>
                    )}
                    <input 
                      type="file" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, 'baseImage')}
                    />
                  </div>
                  {formState.baseImage && (
                    <button 
                      onClick={() => setFormState(prev => ({ ...prev, baseImage: null }))}
                      className="text-xs text-red-500 mt-2 hover:underline"
                    >
                      Remove Image
                    </button>
                  )}
                </div>

                {/* Mask Image Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Mask Layer Image (PNG)</label>
                  <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:bg-gray-50 transition-colors text-center cursor-pointer relative h-48 flex flex-col items-center justify-center">
                    {formState.maskImage ? (
                      <img src={formState.maskImage} alt="Mask" className="h-full object-contain" />
                    ) : (
                      <div className="text-gray-400">
                        <Upload className="w-8 h-8 mx-auto mb-2" />
                        <span className="text-sm">Click to upload mask</span>
                      </div>
                    )}
                    <input 
                      type="file" 
                      className="absolute inset-0 opacity-0 cursor-pointer" 
                      accept="image/*"
                      onChange={(e) => handleImageUpload(e, 'maskImage')}
                    />
                  </div>
                  {formState.maskImage && (
                    <button 
                      onClick={() => setFormState(prev => ({ ...prev, maskImage: null }))}
                      className="text-xs text-red-500 mt-2 hover:underline"
                    >
                      Remove Image
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="px-8 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors shadow-sm"
              >
                <Save className="w-4 h-4" />
                Save Changes
              </button>
            </div>
          </div>
          )}

          {/* --- ASSETS TAB --- */}
          {activeTab === 'assets' && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  <div className="border-b border-gray-200 flex">
                      <button 
                          onClick={() => setActiveAssetTab('stickers')}
                          className={`flex-1 py-4 text-center font-medium border-b-2 transition-colors ${activeAssetTab === 'stickers' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                      >
                          <Sticker className="w-4 h-4 inline-block mr-2" /> Stickers
                      </button>
                      <button 
                          onClick={() => setActiveAssetTab('backgrounds')}
                          className={`flex-1 py-4 text-center font-medium border-b-2 transition-colors ${activeAssetTab === 'backgrounds' ? 'border-blue-500 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                      >
                          <Image className="w-4 h-4 inline-block mr-2" /> Backgrounds
                      </button>
                  </div>

                  <div className="p-8">
                      {/* Upload Area */}
                      <div className="mb-8">
                          <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
                              <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                  <Upload className="w-8 h-8 mb-3 text-gray-400" />
                                  <p className="mb-2 text-sm text-gray-500"><span className="font-semibold">Click to upload</span> {activeAssetTab === 'stickers' ? 'Sticker' : 'Background'}</p>
                                  <p className="text-xs text-gray-500">PNG, JPG (Max 5MB)</p>
                              </div>
                              <input 
                                  type="file" 
                                  className="hidden" 
                                  accept="image/*"
                                  onChange={(e) => handleAssetUpload(e, activeAssetTab)}
                              />
                          </label>
                      </div>

                      {/* Gallery */}
                      <div className="grid grid-cols-4 md:grid-cols-6 gap-4">
                          {(activeAssetTab === 'stickers' ? stickers : backgrounds).map((src, idx) => (
                              <div key={idx} className="group relative aspect-square bg-gray-100 rounded-lg border border-gray-200 overflow-hidden flex items-center justify-center p-2">
                                  <img src={src} alt="Asset" className="max-w-full max-h-full object-contain" />
                                  <button 
                                      onClick={() => deleteAsset(idx, activeAssetTab)}
                                      className="absolute top-1 right-1 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-red-600"
                                  >
                                      <Trash2 className="w-3 h-3" />
                                  </button>
                              </div>
                          ))}
                      </div>
                      
                      {(activeAssetTab === 'stickers' ? stickers : backgrounds).length === 0 && (
                          <p className="text-center text-gray-400 py-8">No assets uploaded yet.</p>
                      )}
                  </div>
              </div>
          )}

        </div>
      </main>
    </div>
  );
}