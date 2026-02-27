import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import {
    Smartphone,
    Headphones,
    Coffee,
    GripHorizontal,
    Search,
    Filter,
    ShoppingBag,
    LayoutDashboard,
    LogIn,
    ChevronDown,
    ChevronRight
} from 'lucide-react';

import { isAdminRoute } from '../../lib/isAdminRoute';

// --- Types ---

import { Category } from '../../types';
import { buildCategoryTree } from '../../utils/categoryTree';

interface ShopCategory {
    id: string;
    name: string;
    icon?: React.ReactNode;
    children?: Category[];
}


interface ShopItem {
    id: string;
    name: string;
    category: string; // Legacy string
    categoryId?: string; // New UUID
    brand?: string;
    image: string;
    price: number;
    tags?: string[];
}

// --- Component ---

const SellerShop: React.FC = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [activeCategory, setActiveCategory] = useState(searchParams.get('category') || 'all');
    const [activeBrand, setActiveBrand] = useState(searchParams.get('brand') || 'all'); // Task 2: Brand State
    const [searchQuery, setSearchQuery] = useState('');
    const [items, setItems] = useState<ShopItem[]>([]);

    const [categories, setCategories] = useState<Category[]>([]);
    const [categoryMap, setCategoryMap] = useState<Map<string, Category>>(new Map());
    const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(new Set());
    const navigate = useNavigate();
    const location = useLocation();
    const { isAuthenticated } = useAuth();
    const showAdminEntry = isAdminRoute(location.pathname);

    // Task 2: Sync URL Params
    useEffect(() => {
        const params: any = {};
        if (activeCategory !== 'all') params.category = activeCategory;
        if (activeBrand !== 'all') params.brand = activeBrand;
        setSearchParams(params, { replace: true });
    }, [activeCategory, activeBrand, setSearchParams]);

    // Task 2: Distinct Brands Logic
    const distinctBrands = React.useMemo(() => {
        // Get brands from currently filtered items by category? Or global?
        // Requirement: "若該分類沒有該品牌則自動回到全部品牌" -> means dependent on category
        // Requirement: "全部品牌 + 由目前商品清單動態產生的品牌列表"

        let sourceItems = items;
        if (activeCategory !== 'all') {
            sourceItems = items.filter(item => item.category === activeCategory);
        }

        const brands = Array.from(new Set(sourceItems.map(item => item.brand).filter(Boolean))).sort();
        return brands;
    }, [items, activeCategory]);

    // Task 2: Auto-reset brand if not in current category
    useEffect(() => {
        if (activeBrand !== 'all' && distinctBrands.length > 0 && !distinctBrands.includes(activeBrand!)) {
            // Check if it's because it's not in distinctBrands (which is filtered by category)
            // Wait, if I switch category, distinctBrands updates. If activeBrand is not in new list, reset it.
            setActiveBrand('all');
        }
    }, [activeCategory, distinctBrands]);

    // Load Data from Supabase
    useEffect(() => {
        const loadData = async () => {
            try {
                // 0. Load Categories Logic
                const { data: dbCats } = await supabase.from('product_categories').select('*').order('parent_id').order('sort_order');
                if (dbCats) {
                    const { tree, map } = buildCategoryTree(dbCats as any);
                    setCategories(tree);
                    setCategoryMap(map);
                    setExpandedCategoryIds(new Set(tree.map(c => c.id)));
                }

                // 1. Load Products from Supabase
                const { data: dbProducts, error } = await supabase.from('products').select('*').eq('is_active', true);

                if (error) {
                    console.error('Failed to load products (SellerShop):', error);
                    return;
                }

                if (dbProducts && Array.isArray(dbProducts)) {
                    const mappedItems: ShopItem[] = dbProducts.map((p: any) => ({
                        id: p.id,
                        name: p.name,
                        category: p.category || 'other',
                        categoryId: p.category_id,
                        brand: p.brand || '', // Task 2: Map Brand
                        image: p.thumbnail || p.base_image || 'https://placehold.co/300x400?text=No+Image',
                        price: 990, // Default price (Hidden in UI)
                        tags: p.tags || []
                    }));
                    setItems(mappedItems);
                }
            } catch (err) {
                console.error("Failed to load shop data", err);
            }
        };

        loadData();

        // Realtime Subscription
        const channel = supabase
            .channel('public:products:shop')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
                console.log('Shop products changed, reloading...', payload);
                loadData();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Filter Logic
    const filteredItems = items.filter(item => {
        let matchesCategory = false;
        if (activeCategory === 'all') {
            matchesCategory = true;
        } else {
            // Check if item.categoryId matches activeCategory OR any of its children
            if (item.categoryId) {
                // Get all descendant IDs
                const getDescendants = (id: string): string[] => {
                    const list = [id];
                    const node = categoryMap.get(id);
                    if (node && node.children) {
                        node.children.forEach(c => list.push(...getDescendants(c.id)));
                    }
                    return list;
                };
                const allowedIds = getDescendants(activeCategory);
                matchesCategory = allowedIds.includes(item.categoryId);
            } else {
                // Fallback to legacy string match if categoryId missing
                // This is legacy behavior, probably 'activeCategory' is UUID now so this won't match much unless we map names.
                // But for newly created categories, they have UUIDs.
                // For old products, they have 'phone-case'.
                // If user selects 'Phone Case' category (UUID), we need to know its legacy code? 
                // We don't have that mapping easily unless we added 'code' to Category.
                // But we assume migrating forward.
                matchesCategory = item.category === activeCategory;
            }
        }

        const matchesBrand = activeBrand === 'all' || item.brand === activeBrand; // Task 2: Brand Filter
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesCategory && matchesBrand && matchesSearch;
    });

    const handleProductClick = (item: ShopItem) => {
        console.log(`Navigating to editor for ${item.name} (${item.id})`);
        navigate(`/?productId=${item.id}`);
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">

            {/* Header / Banner */}
            <header className="bg-white shadow-sm sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center text-white font-bold text-xl">P</div>
                        <span className="text-xl font-bold text-gray-900">PPBears Shop</span>
                    </div>

                    <div className="flex-1 max-w-md mx-4 hidden md:block">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="搜尋商品..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-full text-sm focus:ring-2 focus:ring-black/5 transition-all outline-none"
                            />
                        </div>
                    </div>

                    {showAdminEntry && (
                        <>
                            <button
                                onClick={() => navigate('/seller')}
                                className="mr-4 hidden md:flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition-colors"
                            >
                                <LayoutDashboard className="w-4 h-4" />
                                <span>商家後台</span>
                            </button>

                            <div className="w-8 h-8 rounded-full bg-gray-200 overflow-hidden">
                                <img src="https://api.dicebear.com/7.x/avataaars/svg?seed=Felix" alt="User" />
                            </div>
                        </>
                    )}
                </div>

                {/* Mobile Search Bar */}
                <div className="md:hidden px-4 pb-3">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="搜尋商品..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-gray-100 border-none rounded-lg text-sm outline-none"
                        />
                    </div>
                </div>
            </header>

            <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8 flex gap-8">

                {/* Left Navigation (Sidebar) */}
                <aside className="w-64 hidden md:block flex-shrink-0">
                    <div className="sticky top-24 space-y-1">
                        <div className="mb-6">
                            <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">管理功能</h3>
                            {isAuthenticated ? (
                                <button
                                    onClick={() => navigate('/seller')}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors bg-black text-white shadow-md hover:bg-gray-800"
                                >
                                    <LayoutDashboard className="w-5 h-5" />
                                    進入後台
                                </button>
                            ) : (
                                <button
                                    onClick={() => navigate('/login')}
                                    className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors text-gray-600 hover:bg-gray-100 border border-gray-200"
                                >
                                    <LogIn className="w-5 h-5" />
                                    商家登入
                                </button>
                            )}
                        </div>

                        <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">商品分類</h3>
                        <button
                            onClick={() => setActiveCategory('all')}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-lg transition-colors ${activeCategory === 'all' ? 'bg-black text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                            <ShoppingBag className="w-5 h-5" /> 全部商品
                        </button>

                        <div className="space-y-1 mt-1">
                            {categories.map(category => {
                                const renderCat = (c: Category, depth: number) => {
                                    const isActive = activeCategory === c.id;
                                    const hasChildren = !!(c.children && c.children.length > 0);
                                    const isExpanded = expandedCategoryIds.has(c.id);
                                    return (
                                        <div key={c.id}>
                                            <button
                                                onClick={() => setActiveCategory(c.id)}
                                                className={`w-full flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${isActive
                                                    ? 'bg-gray-200 text-gray-900 font-bold'
                                                    : 'text-gray-600 hover:bg-gray-100'
                                                    }`}
                                                style={{ paddingLeft: `${depth * 12 + 12}px` }}
                                            >
                                                {hasChildren ? (
                                                    <span
                                                        onClick={(e) => {
                                                            e.preventDefault();
                                                            e.stopPropagation();
                                                            setExpandedCategoryIds(prev => {
                                                                const next = new Set(prev);
                                                                if (next.has(c.id)) next.delete(c.id);
                                                                else next.add(c.id);
                                                                return next;
                                                            });
                                                        }}
                                                        className="p-1 -ml-1 rounded hover:bg-gray-200 text-gray-500"
                                                    >
                                                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                    </span>
                                                ) : (
                                                    depth === 0 ? <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span> : <span className="w-4"></span>
                                                )}
                                                {c.name}
                                            </button>
                                            {hasChildren && isExpanded && c.children!.map(child => renderCat(child, depth + 1))}
                                        </div>
                                    );
                                };
                                return renderCat(category, 0);
                            })}
                        </div>

                        {/* Brand Filter */}
                        {(['phone-case', '手機殼'].includes(activeCategory) || distinctBrands.length > 0) && (
                            <div className="pt-6 mt-2 border-t border-gray-100">
                                <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">品牌篩選</h3>
                                <div className="space-y-1">
                                    <button
                                        onClick={() => setActiveBrand('all')}
                                        className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${activeBrand === 'all' ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50'
                                            }`}
                                    >
                                        全部品牌
                                    </button>
                                    {(() => {
                                        const customBrandOrder = ['Apple', 'Samsung', 'Google', 'Xiaomi', 'OPPO', 'Vivo', 'Sony', 'ASUS'];
                                        const displayBrands = ['phone-case', '手機殼'].includes(activeCategory)
                                            ? Array.from(new Set([...customBrandOrder, ...distinctBrands]))
                                            : [...distinctBrands];

                                        // Sort using custom order
                                        const sortedBrands = displayBrands.sort((a, b) => {
                                            const idxA = customBrandOrder.indexOf(a);
                                            const idxB = customBrandOrder.indexOf(b);
                                            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                                            if (idxA !== -1) return -1;
                                            if (idxB !== -1) return 1;
                                            return a.localeCompare(b);
                                        });

                                        return sortedBrands.map(brand => (
                                            <button
                                                key={brand}
                                                onClick={() => setActiveBrand(brand)}
                                                className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${activeBrand === brand ? 'bg-gray-100 text-gray-900 font-medium' : 'text-gray-600 hover:bg-gray-50'
                                                    }`}
                                            >
                                                {brand}
                                            </button>
                                        ));
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>
                </aside>

                {/* Right Product Grid */}
                <div className="flex-1 min-w-0 md:mt-0">
                    {/* Mobile Category Filter (Horizontal Scroll) */}
                    <div className="md:hidden w-full overflow-x-auto flex gap-2 no-scrollbar mb-6 pb-2">
                        <button
                            onClick={() => setActiveCategory('all')}
                            className={`flex-shrink-0 px-4 py-1.5 text-[13px] font-medium rounded-full border transition-colors whitespace-nowrap ${activeCategory === 'all'
                                ? 'bg-black text-white border-black'
                                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                }`}
                        >
                            全部商品
                        </button>
                        {Array.from(categoryMap.values()).map(category => (
                            <button
                                key={category.id}
                                onClick={() => setActiveCategory(category.id)}
                                className={`flex-shrink-0 px-4 py-1.5 text-[13px] font-medium rounded-full border transition-colors whitespace-nowrap ${activeCategory === category.id
                                    ? 'bg-black text-white border-black'
                                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                                    }`}
                            >
                                {category.name}
                            </button>
                        ))}
                    </div>
                    <div className="flex justify-between items-center mb-6">

                        <h2 className="text-xl font-bold text-gray-900">
                            {categoryMap.get(activeCategory)?.name || (activeCategory === 'all' ? '全部商品' : activeCategory)}
                        </h2>
                        <span className="text-sm text-gray-500">{filteredItems.length} 個商品</span>
                    </div>

                    {filteredItems.length > 0 ? (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                            {filteredItems.map((item) => (
                                <div
                                    key={item.id}
                                    onClick={() => handleProductClick(item)}
                                    className="group bg-white rounded-xl overflow-hidden border border-gray-100 hover:shadow-xl transition-all duration-300 cursor-pointer flex flex-col"
                                >
                                    {/* Image Container - Adjusted Aspect Ratio */}
                                    <div className="aspect-[3/4] bg-gray-100 relative overflow-hidden">
                                        <div className="absolute inset-0 p-4 flex items-center justify-center">
                                            <img
                                                src={item.image}
                                                alt={item.name}
                                                className="w-full h-full object-contain transition-transform duration-700 group-hover:scale-105"
                                            />
                                        </div>
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                                            <button className="bg-white text-black font-semibold py-2 px-6 rounded-full shadow-lg transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                                立即設計
                                            </button>
                                        </div>

                                        {/* Task 1: Removed System Tags Display */}
                                        {/* {item.tags && (
                                            <div className="absolute top-3 left-3 flex flex-col gap-1">
                                                {item.tags.map(tag => (
                                                    <span key={tag} className="px-2 py-1 bg-black/70 backdrop-blur-md text-white text-[10px] font-bold rounded">
                                                        {tag}
                                                    </span>
                                                ))}
                                            </div>
                                        )} */}
                                    </div>

                                    {/* Info */}
                                    <div className="p-4 flex-1 flex flex-col">
                                        <h3 className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors line-clamp-2 mb-1">
                                            {item.name}
                                        </h3>
                                        <div className="mt-auto flex items-center justify-between">
                                            <span className="text-sm text-gray-500">

                                                {categoryMap.get(item.categoryId || '')?.name || item.category}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center py-20 text-center">
                            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                                <Search className="w-8 h-8 text-gray-400" />
                            </div>
                            <h3 className="text-lg font-medium text-gray-900">沒有找到相關商品</h3>
                            <p className="text-gray-500 mt-1">請嘗試切換分類或使用其他關鍵字搜尋</p>
                            <button
                                onClick={() => { setActiveCategory('all'); setSearchQuery(''); }}
                                className="mt-4 text-blue-600 font-medium hover:underline"
                            >
                                清除所有篩選
                            </button>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default SellerShop;
