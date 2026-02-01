// DEPRECATED: replaced by products-v2 (flag controlled)
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
    QrCode, 
    Link as LinkIcon, 
    Edit2, 
    Trash2, 
    Plus, 
    Copy, 
    ExternalLink,
    Smartphone,
    Printer,
    FileImage,
    Palette,
    Layers,
    Search,
    X
} from 'lucide-react';
import { get } from 'idb-keyval';
import LinkConfigModal, { LinkConfigData } from './LinkConfigModal';
import { ProductModel, DesignLink } from '../../data/mockStore';
import { supabase } from '../../lib/supabase';
import { ORIGIN, BASE_PATH } from '../../config';

// --- 2. Constants ---

const CATEGORIES_KEY = 'ppbears_seller_categories';

const DEFAULT_CATEGORIES = [
    { id: 'all', label: '全部' },
    // { id: 'bottle', label: '水杯' },
    // { id: 'phone-case', label: '手機殼' },
    // { id: 'decor', label: '家居裝飾' },
    // { id: 'apparel', label: '服裝飾品' },
    // { id: 'accessories', label: '燭台/相框' },
    // { id: 'other', label: '其他' }
];

// --- 3. Component Implementation ---

const ProductList: React.FC = () => {
    const navigate = useNavigate();
    const [products, setProducts] = useState<ProductModel[]>([]);
    const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
    const [isLoaded, setIsLoaded] = useState(false);
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [activeProductId, setActiveProductId] = useState<string | null>(null);
    const [editingLink, setEditingLink] = useState<LinkConfigData | undefined>(undefined);
    const [searchQuery, setSearchQuery] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');

    // Load from Supabase on mount
    React.useEffect(() => {
        const load = async () => {
            try {
                // Fetch from Supabase
                const { data: dbProducts, error } = await supabase
                    .from('products')
                    .select('*')
                    .order('created_at', { ascending: false });

                if (error) {
                    // Ignore AbortError (page navigation or cleanup)
                    if (error.message?.includes('AbortError') || error.message?.includes('signal is aborted')) {
                        // Silent return or debug log
                        return;
                    }
                    console.error("Failed to load products from Supabase:", error);
                    alert(`Load Error: ${error.code} - ${error.message}`); // Explicit Alert for Debugging
                }

                if (dbProducts) {
                    // Map DB products to ProductModel
                    const mappedProducts = dbProducts.map(p => ({
                        id: p.id,
                        name: p.name,
                        category: p.category,
                        brand: p.brand,
                        thumbnail: p.thumbnail,
                        specs: p.specs || {},
                        maskConfig: p.mask_config || {},
                        permissions: p.permissions || {},
                        tags: p.tags || [],
                        links: [
                            {
                                id: `link_def_${p.id}`,
                                name: '系統默認設計地址',
                                url: `https://ppbears.com/design/def/${p.id}`,
                                type: 'default',
                                isDefault: true
                            }
                        ]
                    }));
                    // @ts-ignore
                    setProducts(mappedProducts);
                } else {
                    setProducts([]);
                }
            } catch (e) {
                console.error("Failed to load products", e);
                setProducts([]);
            }
            setIsLoaded(true);
        };
        load();
    }, []);

    // Load Categories
    React.useEffect(() => {
        get(CATEGORIES_KEY).then(saved => {
            if (saved && Array.isArray(saved)) {
                setCategories(saved);
            }
        });
    }, []);

    const filteredProducts = products.filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesCategory = activeCategory === 'all' || p.category === activeCategory;
        return matchesSearch && matchesCategory;
    });

    const handleDuplicateProduct = (product: ProductModel) => {
        const newProduct: ProductModel = {
            ...product,
            id: `prod_${Date.now()}`,
            name: `${product.name} (Copy)`,
            links: product.links.map(l => ({
                ...l,
                id: `link_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
            }))
        };
        setProducts(prev => [newProduct, ...prev]);
    };

    const handleDeleteProduct = async (id: string) => {
        if (confirm('確定要刪除此商品模型嗎？所有相關連結都將失效。')) {
            // [Task 2] Real DB Delete
            const { error } = await supabase.from('products').delete().eq('id', id);
            
            if (error) {
                console.error('Delete product failed:', error);
                alert('刪除失敗: ' + error.message);
                return;
            }

            // Only remove from UI if DB delete succeeded
            setProducts(prev => prev.filter(p => p.id !== id));
        }
    };

    const handleCopyLink = (url: string) => {
        navigator.clipboard.writeText(url);
        alert('連結已複製！');
    };

    const handleDeleteLink = (productId: string, linkId: string) => {
        if (confirm('確定要刪除此設計連結嗎？此操作無法復原。')) {
            setProducts(prev => prev.map(p => {
                if (p.id === productId) {
                    return {
                        ...p,
                        links: p.links.filter(l => l.id !== linkId)
                    };
                }
                return p;
            }));
        }
    };

    const handleAddLink = (productId: string) => {
        setActiveProductId(productId);
        setEditingLink(undefined);
        setIsModalOpen(true);
    };

    const handleEditLink = (productId: string, link: DesignLink) => {
        setActiveProductId(productId);
        // Map DesignLink to LinkConfigData structure (Mocking missing fields)
        setEditingLink({
            id: link.id,
            productName: link.name,
            redirectUrl: link.url,
            productType: 'custom',
            shipping: 'required',
            colorSpace: 'rgb',
            operationMode: 'simple',
            permissions: {
                allowStickers: true,
                allowBackgrounds: true,
                allowBackgroundColor: true,
                allowFrames: true
            }
        });
        setIsModalOpen(true);
    };

    const handleModalSubmit = (data: LinkConfigData) => {
        if (!activeProductId) return;

        console.log("Configuration Submitted:", data);

        setProducts(prev => prev.map(p => {
            if (p.id === activeProductId) {
                if (editingLink && editingLink.id) {
                    // Update existing
                    return {
                        ...p,
                        links: p.links.map(l => l.id === editingLink.id ? {
                            ...l,
                            name: data.productName,
                        } : l)
                    };
                } else {
                    // Create new
                    const newLink: DesignLink = {
                        id: `link_new_${Date.now()}`,
                        name: data.productName,
                        url: `https://ppbears.com/design/cus/${Date.now()}`,
                        type: 'custom',
                        isDefault: false,
                        createdAt: new Date().toISOString().split('T')[0]
                    };
                    return { ...p, links: [...p.links, newLink] };
                }
            }
            return p;
        }));
    };

    const getDynamicLink = (productId: string, linkId: string) => {
        return `${ORIGIN}${BASE_PATH}?productId=${productId}&linkId=${linkId}`;
    };

    return (
        <div className="p-4 md:p-6 max-w-7xl mx-auto bg-gray-50 min-h-screen">
            {/* Header Area */}
            <div className="bg-white p-4 rounded-t-xl border border-gray-200 border-b-0 shadow-sm">
                <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
                    <div className="flex items-center gap-4 w-full md:w-auto">
                        <button 
                            onClick={() => navigate('/seller/product/new')}
                            className="px-4 py-2 bg-[#1c64f2] text-white rounded hover:bg-[#1a56db] transition-colors flex items-center gap-2 text-sm font-medium shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            添加商品模型
                        </button>
                        <a href="#" className="text-blue-600 text-sm hover:underline font-medium">查看教程</a>
                    </div>
                    
                    <div className="relative w-full md:w-96">
                        <input 
                            type="text" 
                            placeholder="輸入查詢關鍵字" 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-4 pr-10 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-gray-50 focus:bg-white transition-colors"
                        />
                        <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                    </div>
                </div>

                <div className="flex items-center gap-1 border-t border-gray-100 pt-4 overflow-x-auto no-scrollbar">
                    <span className="text-sm text-gray-500 font-medium px-2 whitespace-nowrap bg-gray-100 py-1 rounded mr-2">類別</span>
                    {categories.map(cat => (
                        <button
                            key={cat.id}
                            onClick={() => setActiveCategory(cat.id)}
                            className={`px-4 py-1.5 text-sm font-medium transition-colors whitespace-nowrap border-b-2 ${
                                activeCategory === cat.id 
                                    ? 'border-[#1c64f2] text-[#1c64f2]' 
                                    : 'border-transparent text-gray-500 hover:text-gray-700'
                            }`}
                        >
                            {cat.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-4 bg-white border border-gray-200 border-t-0 p-4 rounded-b-xl shadow-sm min-h-[400px]">
                {filteredProducts.length === 0 ? (
                    <div className="text-center py-20 text-gray-400">
                        <Search className="w-12 h-12 mx-auto mb-2 opacity-20" />
                        <p>沒有找到符合條件的商品模型</p>
                    </div>
                ) : (
                    filteredProducts.map((product) => (
                    <div key={product.id} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden flex flex-col mb-4">
                        {/* 1. Header Bar: Name & Actions */}
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-gray-800 text-sm">{product.name}</h3>
                            <div className="flex items-center gap-2">
                                <button 
                                    onClick={() => navigate(`/admin/models/${product.id}`)} 
                                    className="px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded border border-blue-200 transition-colors"
                                    title="查看詳情"
                                >
                                    查看詳情
                                </button>
                                <button 
                                    onClick={() => handleDuplicateProduct(product)} 
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" 
                                    title="複製模型"
                                >
                                    <Copy className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => navigate(`/seller/product/${product.id}`)} 
                                    className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded" 
                                    title="編輯模型"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                    onClick={() => handleDeleteProduct(product.id)} 
                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded" 
                                    title="刪除模型"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>

                        <div className="flex flex-col md:flex-row">
                            {/* 2. Left Side: Image & Specs (40%) */}
                            <div className="md:w-[40%] p-4 border-r border-gray-100 flex gap-4 bg-[#e5e5e5]/20">
                                {/* Image - Fixed width */}
                                <div className="w-24 h-32 bg-white border border-gray-200 flex-shrink-0 flex items-center justify-center p-1">
                                    <img 
                                        src={product.thumbnail} 
                                        alt={product.name} 
                                        className="max-w-full max-h-full object-contain"
                                        onError={(e) => {
                                            e.currentTarget.src = 'https://placehold.co/300x400?text=No+Image';
                                            e.currentTarget.onerror = null;
                                        }}
                                    />
                                </div>
                                
                                {/* Specs */}
                                <div className="space-y-1.5 text-xs text-gray-600 flex-1">
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-gray-500 w-16">尺寸:</span> 
                                        <span>{product.specs.dimensions}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-gray-500 w-16">頁數:</span> 
                                        <span>{product.specs.pages || 1}</span>
                                    </div>
                                    {product.specs.colorSpace && (
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-gray-500 w-16">色域:</span> 
                                            <span className="flex items-center gap-1">
                                                <div className={`w-3 h-3 rounded-full bg-gradient-to-br ${product.specs.colorSpace === 'CMYK' ? 'from-cyan-400 to-blue-600' : 'from-red-400 to-yellow-400'}`} />
                                            </span>
                                        </div>
                                    )}
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-gray-500 w-16">文件格式:</span> 
                                        <span>{product.specs.format}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-gray-500 w-16">出血內容:</span> 
                                        <span>全圖</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-gray-500 w-16">出血擴邊:</span> 
                                        <span>否</span>
                                    </div>
                                    <div className="text-gray-400 mt-2 text-[10px]">
                                        客戶可選模版來源: 在本類別中篩選適用
                                    </div>
                                </div>
                            </div>

                            {/* 3. Right Side: Links (60%) */}
                            <div className="md:w-[60%] p-4 flex flex-col justify-center">
                                {/* Links List */}
                                <div className="space-y-4">
                                    {/* Default Link */}
                                    {product.links.filter(l => l.isDefault).map(link => {
                                        const finalUrl = getDynamicLink(product.id, link.id);
                                        return (
                                        <div key={link.id} className="flex items-center justify-between text-sm group">
                                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                                <span className="font-bold text-gray-800 w-28 flex-shrink-0 text-right">系統默認設計地址</span>
                                                <a href={finalUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate">
                                                    {finalUrl}
                                                </a>
                                            </div>
                                            <div className="flex items-center gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                                <QrCode className="w-5 h-5 text-red-500 cursor-pointer" onClick={() => handleCopyLink(finalUrl)} />
                                            </div>
                                        </div>
                                        );
                                    })}
                                    
                                    {/* Custom Links */}
                                    {product.links.filter(l => !l.isDefault).map(link => {
                                        const finalUrl = getDynamicLink(product.id, link.id);
                                        return (
                                        <div key={link.id} className="flex items-center justify-between text-sm group">
                                            <div className="flex items-center gap-4 flex-1 min-w-0">
                                                <span className="font-bold text-gray-800 w-28 flex-shrink-0 text-right truncate" title={link.name}>{link.name}</span>
                                                <a href={finalUrl} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline truncate">
                                                    {finalUrl}
                                                </a>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button onClick={() => handleEditLink(product.id, link)} className="w-6 h-6 bg-[#1c64f2] text-white rounded flex items-center justify-center hover:bg-blue-700">
                                                    <Edit2 className="w-3 h-3" />
                                                </button>
                                                <button onClick={() => handleDeleteLink(product.id, link.id)} className="w-6 h-6 bg-[#d32f2f] text-white rounded flex items-center justify-center hover:bg-red-700">
                                                    <X className="w-3 h-3" />
                                                </button>
                                                <div className="flex gap-1 ml-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                                     <QrCode className="w-5 h-5 text-red-500 cursor-pointer" onClick={() => handleCopyLink(finalUrl)} />
                                                </div>
                                            </div>
                                        </div>
                                        );
                                    })}
                                </div>
                                
                                <div className="mt-6 flex justify-end">
                                     <button 
                                        onClick={() => handleAddLink(product.id)}
                                        className="bg-[#d32f2f] text-white px-4 py-1.5 text-xs font-bold rounded hover:bg-[#b71c1c] transition-colors shadow-sm"
                                    >
                                        添加自定義設計地址
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                ))
                )}
            </div>

            <LinkConfigModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onSubmit={handleModalSubmit}
                initialData={editingLink}
                productName={products.find(p => p.id === activeProductId)?.name || ''}
            />
        </div>
    );
};

export default ProductList;
