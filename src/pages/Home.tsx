import { useState, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { update, get } from 'idb-keyval';
import { listDesignTemplates, DesignTemplate, ensureDesignTemplatesReadable } from '../lib/designTemplates';
import { listAssets, listAssetCategories } from '../lib/assets';
import { listFrames, listFrameCategories, Frame, lastFrameDebug, clearFrameCache } from '../lib/frameService';
// @ts-ignore
import { readPsd } from 'ag-psd';
import { Upload, Layers, Smartphone, Type, Wand2, Sparkles, X, ShoppingCart, Check, Sticker, Image, ScanBarcode, Scissors, Circle, Heart, Square, Ban, ChevronRight, ChevronLeft, Copy, Search, SlidersHorizontal, ChevronDown, ChevronUp, Palette, FileImage, Shapes, Lock, Unlock, Plus, Frame as FrameIcon } from 'lucide-react';
import JsBarcode from 'jsbarcode';
import CanvasEditor, { CanvasEditorRef } from '../components/CanvasEditor';
import SaveDesignModal from '../components/SaveDesignModal';
import MyGalleryModal from '../components/MyGalleryModal';
import { DEFAULT_STICKERS, DEFAULT_BACKGROUNDS, DEFAULT_FRAMES } from '../data/mockAssets';
import { AssetItem, Category } from '@/types';
import { isAdminRoute } from '../lib/isAdminRoute';
import { FIX_RLS_SQL } from './admin/Designs';
import { buildCategoryTree } from '@/utils/categoryTree';

const EMPTY_TAGS: string[] = [];

const CATEGORIES_KEY = 'ppbears_seller_categories';
const BRANDS_KEY = 'ppbears_seller_brands';

const customBrandOrder = ['Apple', 'Samsung', 'Google', 'Xiaomi', 'OPPO', 'Vivo', 'Sony', 'ASUS'];

// Default permissions should be all true if not parsing
const DEFAULT_PERMS = {
    text: true,
    stickers: true,
    backgrounds: true,
    barcode: true,
    designs: true,
    aiCartoon: true,
    aiRemoveBg: true,
    frames: true
};

const generateDesignId = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 13; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
};

const handleClearCache = async () => {
    if (!confirm('確定要清除所有快取嗎？頁面將會重新載入。')) return;

    try {
        // Clear localStorage
        localStorage.clear();

        // Clear IndexedDB
        const dbs = await window.indexedDB.databases();
        dbs.forEach(db => {
            if (db.name) window.indexedDB.deleteDatabase(db.name);
        });

        // Clear sessionStorage
        sessionStorage.clear();

        console.log('✅ Cache cleared successfully');

        // Reload page
        window.location.reload();
    } catch (error) {
        console.error('❌ Failed to clear cache:', error);
        alert('清除快取失敗，請手動清除瀏覽器快取');
    }
};

import SellerShop from "@/pages/shop/SellerShop";

export default function Home() {
    // Debug Mode Check - Moved to top level for safe access in JSX
    const showDebug = import.meta.env.DEV && typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug');

    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const location = useLocation();
    const productId = searchParams.get('productId');

    const [productConfig, setProductConfig] = useState<any>(null);
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [activeTool, setActiveTool] = useState<string | null>(null);
    const [showCheckout, setShowCheckout] = useState(false);
    const [showGalleryModal, setShowGalleryModal] = useState(false);
    const [previewImage, setPreviewImage] = useState<string | null>(null);
    const [currentProduct, setCurrentProduct] = useState<any>(null);

    // [Permission Logic]
    // 1. If client_permissions exists, use it mapping to internal keys
    // 2. Fallback to old permissions? Or just default.
    const perms = (() => {
        if (currentProduct?.client_permissions) {
            const cp = currentProduct.client_permissions;
            console.log('Using client_permissions:', cp);
            return {
                text: cp.text !== false,
                stickers: cp.stickers !== false,
                backgrounds: cp.background !== false,
                barcode: cp.barcode !== false,
                designs: cp.designs !== false,
                aiCartoon: cp.ai_cartoon !== false,
                aiRemoveBg: cp.ai_remove_bg !== false,
                frames: cp.frames !== false
            };
        }
        console.log('Using DEFAULT_PERMS (no client_permissions found on product)', currentProduct);
        return DEFAULT_PERMS;
    })();

    const [designId, setDesignId] = useState('');
    const [copied, setCopied] = useState(false);
    const [isCropping, setIsCropping] = useState(false);
    const [hasClipPath, setHasClipPath] = useState(false);
    const [isImageSelected, setIsImageSelected] = useState(false);
    const [isTemplateLoading, setIsTemplateLoading] = useState(false);
    const [canvasHasUserImage, setCanvasHasUserImage] = useState(false);

    // Assets State
    const [products, setProducts] = useState<any[]>([]);
    const [isLoadingProducts, setIsLoadingProducts] = useState(true);
    const [productError, setProductError] = useState<string | null>(null);
    const [categoryTree, setCategoryTree] = useState<Category[]>([]);
    const [categoryMap, setCategoryMap] = useState<Map<string, Category>>(new Map());
    const [isLoadingCategories, setIsLoadingCategories] = useState(true);
    const [categoryError, setCategoryError] = useState<string | null>(null);
    const [expandedCategoryIds, setExpandedCategoryIds] = useState<Set<string>>(new Set());

    const [activeCategory, setActiveCategory] = useState('all');
    // Derived from DB products
    const [dynamicCategories, setDynamicCategories] = useState<{ id: string, label: string }[]>([]);
    const [dynamicBrands, setDynamicBrands] = useState<{ id: string, label: string }[]>([]);

    // Assets & Designs
    const [stickers, setStickers] = useState<AssetItem[]>([]);
    const [backgrounds, setBackgrounds] = useState<AssetItem[]>([]);
    const [frames, setFrames] = useState<Frame[]>([]);
    const [designs, setDesigns] = useState<DesignTemplate[]>([]);

    const [loadingDesigns, setLoadingDesigns] = useState(false);
    const [designError, setDesignError] = useState<string | null>(null);

    const [loadingAssets, setLoadingAssets] = useState(false);
    const [assetError, setAssetError] = useState<string | null>(null);
    const [isOffline, setIsOffline] = useState(false);

    const [dbCheckResult, setDbCheckResult] = useState<any>(null);
    const [frameDebugInfo, setFrameDebugInfo] = useState<{ rowCount: number; error: any; source: string } | null>(null);


    // Dynamic Categories for Assets
    const [stickerCategories, setStickerCategories] = useState<string[]>(['熱門活動', '主題設計', '合作設計師', '未分類']);
    const [backgroundCategories, setBackgroundCategories] = useState<string[]>(['風格類型', '節慶氛圍', '未分類']);
    const [frameCategories, setFrameCategories] = useState<string[]>(['基本相框', '節慶主題', '特殊造型', '未分類']);
    const [designCategories, setDesignCategories] = useState<string[]>(['熱門設計', '節慶主題', '風格插畫', '未分類']);

    const [activePanel, setActivePanel] = useState<'none' | 'stickers' | 'backgrounds' | 'barcode' | 'frames' | 'products' | 'designs' | 'ai'>('none');
    const [barcodeText, setBarcodeText] = useState('/');

    // Asset Search & Filter State
    const [assetSearch, setAssetSearch] = useState('');
    const [selectedAssetCategory, setSelectedAssetCategory] = useState('全部');

    // Navigation State for Products Panel
    const [navPath, setNavPath] = useState<string[]>([]); // ['all' | 'other' | categoryId]

    // Load Assets from DB (Stickers, Backgrounds, Frames)
    useEffect(() => {
        let mounted = true;
        const loadAssets = async () => {
            if (!['stickers', 'backgrounds', 'frames'].includes(activePanel)) return;

            setLoadingAssets(true);
            setAssetError(null);

            try {
                if (activePanel === 'frames') {
                    // Clear stale cache to ensure fresh data from Supabase
                    await clearFrameCache(productId || undefined);
                    const { data, source } = await listFrames(productId || undefined);
                    console.log('%c[相框面板] 載入結果', 'color: blue; font-weight: bold; font-size: 14px', `共 ${data.length} 個相框`, '| 來源:', source);
                    if (data.length > 0) console.table(data.map(f => ({ id: f.id, name: f.name, category: f.category, url: f.url })));
                    else console.warn('⚠️ [相框面板] 沒有資料！請確認 Supabase assets 表中有 type="frame" 的記錄，且 RLS 允許匿名用戶讀取。');
                    if (mounted) {
                        setFrames(data);
                        setIsOffline(source === 'cache');
                        setFrameDebugInfo({ rowCount: data.length, error: lastFrameDebug.error, source });
                    }
                } else {
                    setIsOffline(false);
                    let type: 'sticker' | 'background' = 'sticker';
                    if (activePanel === 'stickers') type = 'sticker';
                    else if (activePanel === 'backgrounds') type = 'background';

                    const { data } = await listAssets({
                        type,
                        category: selectedAssetCategory,
                        search: assetSearch
                    });

                    if (mounted) {
                        if (type === 'sticker') setStickers(data);
                        else if (type === 'background') setBackgrounds(data);
                    }
                }
            } catch (err) {
                if (mounted) {
                    console.error(`Failed to load ${activePanel}:`, err);
                    setAssetError("無法載入素材");
                }
            } finally {
                if (mounted) setLoadingAssets(false);
            }
        };

        loadAssets();
        return () => { mounted = false; };
    }, [activePanel, selectedAssetCategory, assetSearch]);

    // Load Asset Categories dynamically
    useEffect(() => {
        listAssetCategories('sticker').then(cats => setStickerCategories(['全部', ...cats]));
        listAssetCategories('background').then(cats => setBackgroundCategories(['全部', ...cats]));
        listFrameCategories().then(cats => setFrameCategories(['全部', ...cats]));
    }, []);

    // Load Designs from DB
    useEffect(() => {
        let mounted = true;
        if (activePanel === 'designs') {
            setLoadingDesigns(true);
            setDesignError(null);

            // 1. Health Check (Only in Debug Mode)
            if (showDebug) {
                ensureDesignTemplatesReadable().then(res => {
                    if (mounted) setDbCheckResult(res);
                });
            }

            // 2. Fetch Data
            listDesignTemplates({
                category: selectedAssetCategory,
                search: assetSearch
            })
                .then(({ data }) => {
                    if (mounted) setDesigns(data);
                })
                .catch(err => {
                    if (mounted) {
                        console.error("Fetch designs failed:", err);
                        setDesignError("無法載入設計，請檢查網路或權限");
                    }
                })
                .finally(() => {
                    if (mounted) setLoadingDesigns(false);
                });
        }
        return () => { mounted = false; };
    }, [activePanel, selectedAssetCategory, assetSearch]);

    const canvasRef = useRef<CanvasEditorRef>(null);
    const currentBgRef = useRef<string | null>(null); // [BG] Guard for re-entry
    const fileInputRef = useRef<HTMLInputElement>(null);
    const bgFileInputRef = useRef<HTMLInputElement>(null);
    const [bgUrlInput, setBgUrlInput] = useState('');

    const handleGalleryApply = (src: string) => {
        if (canvasRef.current) {
            canvasRef.current.insertImageFromSrc(src);
        }
    };

    // AI Action Handler
    const handleAiAction = async (action: string, payload?: any) => {
        if (!canvasRef.current) return;

        // Close menu for style actions, but maybe keep open for background input? 
        // User didn't specify, but closing is safer to see result.
        // if (action !== 'set_bg_url_input') {
        //    setIsAiMenuOpen(false);
        // }

        try {
            switch (action) {
                case 'toon_mochi':
                    await canvasRef.current.applyAiStyle('toon_mochi');
                    break;
                case 'toon_ink':
                    await canvasRef.current.applyAiStyle('toon_ink');
                    break;
                case 'toon_anime':
                    await canvasRef.current.applyAiStyle('toon_anime');
                    break;
                case 'remove_bg':
                    await canvasRef.current.removeBackgroundFromSelection();
                    break;
                case 'set_bg':
                    if (payload) {
                        currentBgRef.current = payload;
                        await canvasRef.current.setCanvasBgImage(payload);
                    }
                    break;
            }
        } catch (error: any) {
            console.error("AI Action failed:", error);
            alert(error.message || "AI 處理失敗，請稍後再試。");
        }
    };

    const handleBackgroundUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (f) => {
                if (f.target?.result) {
                    handleAiAction('set_bg', f.target.result as string);
                }
            };
            reader.readAsDataURL(file);
        }
        // Reset value to allow same file upload again
        if (e.target) e.target.value = '';
    };
    useEffect(() => {
        // 1. Load Products & Categories from Supabase (Strict Mode: No Mock Fallback)
        const fetchCategories = async () => {
            setIsLoadingCategories(true);
            setCategoryError(null);
            try {
                const { data, error } = await supabase
                    .from('product_categories')
                    .select('id,parent_id,name,sort_order')
                    .order('parent_id')
                    .order('sort_order');

                if (error) throw error;

                const { tree, map } = buildCategoryTree((data as any) || []);

                // [Flatten Logic] If only one root category (e.g., "Category"), show its children directly
                if (tree.length === 1 && tree[0].children && tree[0].children.length > 0) {
                    setCategoryTree(tree[0].children);
                    // Open all top-level items by default
                    setExpandedCategoryIds(new Set(tree[0].children.map((c: any) => c.id)));
                } else {
                    setCategoryTree(tree);
                    setExpandedCategoryIds(new Set(tree.map((c: any) => c.id)));
                }
                setCategoryMap(map);
            } catch (e: any) {
                if (e?.name === 'AbortError' || e?.message?.includes('AbortError') || e?.message?.includes('signal is aborted')) {
                    return;
                }
                console.error("Failed to load categories:", e);
                setCategoryError("無法載入商品分類，請稍後再試。");
                setCategoryTree([]);
                setCategoryMap(new Map());
            } finally {
                setIsLoadingCategories(false);
            }
        };

        const fetchProducts = async () => {
            setIsLoadingProducts(true);
            setProductError(null);
            try {
                // Only fetch active products
                const { data, error } = await supabase
                    .from('products')
                    .select('*')
                    .eq('is_active', true);

                if (error) throw error;

                if (data) {
                    setProducts(data);
                } else {
                    setProducts([]);
                    setDynamicCategories([]);
                    setDynamicBrands([]);
                }
            } catch (e: any) {
                if (e.name === 'AbortError' || e.message?.includes('AbortError') || e.message?.includes('signal is aborted')) {
                    return;
                }
                console.error("Failed to load products list:", e);
                setProductError("無法載入商品資料，請檢查網路連線。");
            } finally {
                setIsLoadingProducts(false);
            }
        };

        fetchCategories();
        fetchProducts();

        // Realtime Subscription
        const channel = supabase
            .channel('public:products')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => {
                // console.log('Products changed, reloading...', payload);
                fetchProducts();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);



    // [Task 3] Load Product Data from DB (Strict Mode: No Mock Fallback)
    useEffect(() => {
        const loadProduct = async () => {
            let targetProductId = searchParams.get('productId');

            if (targetProductId) {
                try {
                    // console.log(`Loading product from DB: ${targetProductId}`);

                    // 1. Fetch from Supabase directly
                    const { data: dbProduct, error } = await supabase
                        .from('products')
                        .select('*')
                        .eq('id', targetProductId)
                        .single();

                    if (dbProduct && !dbProduct.client_permissions) {
                        console.warn("client_permissions missing on product, refetching or check schema");
                    }

                    if (error) {
                        // Ignore AbortError (client-side cancellation)
                        if (error.message?.includes('AbortError') || error.details?.includes('AbortError') || error.message?.includes('signal is aborted')) {
                            // console.log('Product load aborted');
                            return;
                        }

                        console.error("Failed to load product from DB:", error);
                        alert("找不到指定的商品模板，請確認連結是否正確。");
                        return;
                    }

                    if (!dbProduct) {
                        console.error("Product not found in DB");
                        alert("找不到指定的商品模板，請確認連結是否正確。");
                        return;
                    }

                    // 2. Validate Essential Assets
                    if (!dbProduct.base_image && !dbProduct.mask_image) {
                        alert("此模板缺少底圖或遮罩，請先至後台補上圖片後再使用。");
                        return;
                    }

                    // console.log("Loaded Product:", dbProduct);
                    setCurrentProduct(dbProduct);

                    // Map DB fields to Editor Config
                    const specs = dbProduct.specs || {};
                    const maskConfig = dbProduct.mask_config || {};
                    const dpi = specs.dpi || 300;

                    // Helper to convert CM to PX
                    const toPx = (val: number | undefined, defaultCm: number) => {
                        if (val === undefined || val === null) return Math.round(defaultCm * dpi / 2.54);
                        return Math.round(val * dpi / 2.54);
                    };

                    const widthPx = toPx(specs.width, 7.69);
                    const heightPx = toPx(specs.height, 16.20);
                    const radiusPx = specs.cornerRadius !== undefined ? specs.cornerRadius : 0.5; // Default 0.5cm? No, keep logic consistent
                    // Note: original code used 50 as fallback for radiusPx (which is raw pixel?), but here we use specs.cornerRadius (cm)
                    // Let's assume specs.cornerRadius is in CM, need to convert to PX?
                    // Previous code: const radiusPx = product.cornerRadius !== undefined ? product.cornerRadius : 50; 
                    // If product.cornerRadius was 0.5 (cm), treating it as px (0.5px) is wrong.
                    // Let's standardise: always convert CM to PX.
                    const radiusPxConverted = Math.round((specs.cornerRadius || 0.5) * dpi / 2.54);

                    // Calculate offset
                    const offsetX = maskConfig.offset ? (maskConfig.offset.x / 20) * (dpi / 2.54) : 0;
                    const offsetY = maskConfig.offset ? (maskConfig.offset.y / 20) * (dpi / 2.54) : 0;

                    setProductConfig({
                        width: widthPx,
                        height: heightPx,
                        borderRadius: radiusPxConverted,
                        baseImage: dbProduct.base_image,
                        maskImage: dbProduct.mask_image,
                        offset: { x: offsetX, y: offsetY }
                    });

                } catch (e: any) {
                    if (e.name === 'AbortError' || e.message?.includes('AbortError') || e.message?.includes('signal is aborted')) {
                        return;
                    }
                    console.error("Critical error loading product", e);
                    alert("載入商品發生錯誤");
                }
            }
        };
        loadProduct();
    }, [searchParams]);

    // [Task 4] Load Template from DB
    useEffect(() => {
        const loadTemplate = async () => {
            const templateSlug = searchParams.get('template_slug');

            if (!templateSlug) return;

            // Wait for product to be fully loaded and canvas configured
            if (!currentProduct || !productConfig) return;

            try {
                // console.log(`Loading template: ${templateSlug}`);
                const { data: design, error } = await supabase
                    .from('designs')
                    .select('*')
                    .eq('slug', templateSlug)
                    .eq('is_published', true)
                    .single();

                if (error || !design) {
                    console.error("Template not found or not published");
                    alert("此模板不存在或尚未發布"); // User requested explicit error
                    return;
                }

                // console.log("Applying template layers:", design);
                // Small delay to ensure canvas is fully initialized with product
                setTimeout(() => {
                    handleAddDesignLayers(design);
                }, 800);

            } catch (e: any) {
                if (e.name === 'AbortError' || e.message?.includes('AbortError') || e.message?.includes('signal is aborted')) {
                    return;
                }
                console.error("Error loading template", e);
                alert("載入模板時發生錯誤");
            }
        };

        loadTemplate();
    }, [searchParams, currentProduct, productConfig]);

    const handleCopyId = () => {
        if (designId) {
            navigator.clipboard.writeText(designId);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleToolClick = (toolName: string) => {
        // console.log('正在切換工具:', toolName);

        // Reset search state
        setAssetSearch('');
        setSelectedAssetCategory('全部');
        const lowerName = toolName.toLowerCase();

        // Permission Guards
        if (lowerName === 'text' && !perms.text) return;
        if (lowerName === 'stickers' && !perms.stickers) return;
        if (lowerName === 'background' && !perms.backgrounds) return;
        if (lowerName === 'barcode' && !perms.barcode) return;
        if (lowerName === 'designs' && !perms.designs) return;
        if (lowerName === 'frames' && !perms.frames) return;
        if (lowerName === 'magic' && !(perms.aiCartoon || perms.aiRemoveBg)) return;

        if (lowerName === 'magic') {
            setActivePanel(activePanel === 'ai' ? 'none' : 'ai');
        } else if (lowerName === 'product') {
            setActivePanel(activePanel === 'products' ? 'none' : 'products');
            setNavPath([]); // Reset nav when opening
        } else if (lowerName === 'stickers') {
            setActivePanel(activePanel === 'stickers' ? 'none' : 'stickers');
        } else if (lowerName === 'background') {
            setActivePanel(activePanel === 'backgrounds' ? 'none' : 'backgrounds');
        } else if (lowerName === 'barcode') {
            setActivePanel(activePanel === 'barcode' ? 'none' : 'barcode');
        } else if (lowerName === 'frames') {
            setActivePanel(activePanel === 'frames' ? 'none' : 'frames');
        } else if (lowerName === 'designs') {
            setActivePanel(activePanel === 'designs' ? 'none' : 'designs');
        } else {
            setActiveTool(toolName);
            setActivePanel('none');
        }

        // console.log('面板狀態變更為:', activePanel);
    };

    const handleAddAsset = (item: any, type: 'sticker' | 'background' | 'frame') => {
        console.log('[handleAddAsset] Called with:', { item, type, hasCanvasRef: !!canvasRef.current });

        if (canvasRef.current) {
            if (type === 'sticker') {
                canvasRef.current.addSticker(item.url || item);
            } else if (type === 'frame') {
                // @ts-ignore
                if (canvasRef.current.addFrame) {
                    // @ts-ignore
                    canvasRef.current.addFrame(item);
                }
            } else {
                const url = item.url || item;
                console.log('[handleAddAsset] Setting background:', { url, currentBg: currentBgRef.current });
                if (currentBgRef.current === url) {
                    console.log('[handleAddAsset] Same background, skipping');
                    return;
                }
                currentBgRef.current = url;
                console.log('[handleAddAsset] Calling setCanvasBgImage');
                canvasRef.current.setCanvasBgImage(url);
            }
        } else {
            console.error('[handleAddAsset] canvasRef.current is null!');
        }
    };

    const handleAddBackgroundColor = (color: string) => {
        if (canvasRef.current && canvasRef.current.setCanvasBgColor) {
            if (currentBgRef.current === color) return;
            currentBgRef.current = color;
            canvasRef.current.setCanvasBgColor(color);
        }
    };

    const handleRemoveBackground = () => {
        if (canvasRef.current && canvasRef.current.setCanvasBgColor) {
            currentBgRef.current = null;
            canvasRef.current.setCanvasBgColor(null);
        }
    };

    const handleAddDesignLayers = async (design: any) => {
        // Scale and position based on current canvas/product size
        const psdWidth = design.width || 0;
        const psdHeight = design.height || 0;

        // 1. Legacy JSON Layers Support
        if (design.layers && Array.isArray(design.layers)) {
            // Safety check for layers
            if (!design.layers || !Array.isArray(design.layers)) {
                console.error("Design has no layers or invalid format", design);
                return;
            }

            // Clear previous design layers before adding new ones
            if (canvasRef.current?.clearLayers) {
                canvasRef.current.clearLayers();
            }

            if (psdWidth > 0 && psdHeight > 0 && productConfig && canvasRef.current?.addLayer) {
                const targetWidth = productConfig.width;
                const targetHeight = productConfig.height;

                const scaleX = targetWidth / psdWidth;
                const scaleY = targetHeight / psdHeight;
                const scale = Math.max(scaleX, scaleY);

                design.layers.forEach((layer: any) => {
                    // @ts-ignore
                    canvasRef.current.addLayer({
                        ...layer,
                        left: layer.left * scale,
                        top: layer.top * scale,
                        scaleX: scale,
                        scaleY: scale,
                    });
                });
            } else {
                // Legacy Fallback (No dimensions saved)
                design.layers.forEach((layer: any) => {
                    // @ts-ignore
                    if (canvasRef.current?.addLayer) {
                        // @ts-ignore
                        canvasRef.current.addLayer({
                            ...layer,
                            scaleX: 1,
                            scaleY: 1
                        });
                    }
                });
            }

            if (window.innerWidth < 768) setActivePanel('none');
            return;
        }

        // 2. New File-based System (PSD/Image)
        if (design.fileUrl) {
            try {
                const fileExt = design.fileType?.toLowerCase() || design.fileUrl.split('.').pop()?.toLowerCase();
                const isPsd = fileExt === 'psd' || design.name?.toLowerCase().endsWith('.psd');

                if (canvasRef.current?.clearLayers) {
                    canvasRef.current.clearLayers();
                }

                if (isPsd) {
                    console.log("Fetching and parsing PSD...", design.fileUrl);
                    const response = await fetch(design.fileUrl);
                    const buffer = await response.arrayBuffer();
                    const psd = readPsd(buffer);

                    if (!psd.children || psd.children.length === 0) {
                        // Fallback to preview if no layers found
                        if (design.previewUrl && canvasRef.current?.insertImageFromSrc) {
                            canvasRef.current.insertImageFromSrc(design.previewUrl);
                        }
                        return;
                    }

                    // Calculate Scale
                    const targetWidth = productConfig?.width || psd.width;
                    const targetHeight = productConfig?.height || psd.height;
                    const pWidth = psd.width || targetWidth;
                    const pHeight = psd.height || targetHeight;

                    const scaleX = targetWidth / pWidth;
                    const scaleY = targetHeight / pHeight;
                    const scale = Math.max(scaleX, scaleY);

                    // Add layers (Reverse order: Bottom to Top)
                    const layers = [...psd.children].reverse();

                    for (const layer of layers) {
                        if (layer.hidden) continue;
                        if (layer.canvas) {
                            const layerUrl = layer.canvas.toDataURL();
                            const l = layer as any;

                            // @ts-ignore
                            await canvasRef.current.addLayer({
                                image: layerUrl,
                                left: (l.left || 0) * scale,
                                top: (l.top || 0) * scale,
                                width: l.width || l.canvas.width,
                                height: l.height || l.canvas.height,
                                scaleX: scale,
                                scaleY: scale,
                                name: l.name
                            });
                        }
                    }
                } else {
                    // Standard Image (JPG/PNG)
                    if (canvasRef.current?.insertImageFromSrc) {
                        await canvasRef.current.insertImageFromSrc(design.fileUrl);
                    }
                }

                if (window.innerWidth < 768) setActivePanel('none');

            } catch (e) {
                console.error("Error loading design file:", e);
                alert("無法載入設計檔案 (Failed to load design)");
            }
        } else {
            console.error("Design has no layers and no fileUrl", design);
            alert("此設計檔案格式錯誤 (Invalid Design Format)");
        }
    };

    const handleAddBarcode = () => {
        if (!barcodeText || barcodeText.length < 2) return;
        if (canvasRef.current) {
            // @ts-ignore
            if (canvasRef.current.addBarcode) {
                // @ts-ignore
                canvasRef.current.addBarcode(barcodeText);
            }
        }
        setActivePanel('none');
    };

    const [selectedShape, setSelectedShape] = useState<'none' | 'rounded' | 'circle' | 'heart' | 'star'>('none');
    const [frameParam, setFrameParam] = useState(0);

    const handleApplyCrop = (shape: 'circle' | 'heart' | 'rounded' | 'star' | 'none') => {
        setSelectedShape(shape);
        // Set default param
        if (shape === 'rounded') setFrameParam(15);
        else if (shape === 'star') setFrameParam(0.4);
        else if (shape === 'heart') setFrameParam(50);
        else setFrameParam(0);

        if (canvasRef.current) {
            canvasRef.current.applyCrop(shape);
        }
    };

    const handleFrameParamChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setFrameParam(val);
        if (canvasRef.current) {
            canvasRef.current.updateFrameParams(val);
        }
    };

    const toggleCropMode = () => {
        if (canvasRef.current) {
            canvasRef.current.toggleCropMode();
        }
    };



    const handlePreviewBuy = async () => {
        if (canvasRef.current) {
            try {
                // console.log('Generating preview...');
                // Generate high quality preview
                const dataUrl = canvasRef.current.generatePreview();
                // console.log('Preview generated, dataUrl length:', dataUrl?.length);

                if (dataUrl && dataUrl.length > 100) {
                    setPreviewImage(dataUrl);
                    setDesignId(generateDesignId());
                    setShowCheckout(true);
                } else {
                    console.error('Preview generation returned empty string or invalid data');
                    setPreviewImage('https://placehold.co/600x600?text=Preview+Failed');
                    setDesignId(generateDesignId());
                    setShowCheckout(true);
                }
            } catch (error) {
                console.error('Error generating preview:', error);
                alert('預覽生成發生錯誤，請重試');
            }
        } else {
            console.error('Canvas ref is null');
        }
    };

    const handleAddToCart = async (finalPrice: number = 980, selectedOptions: any = {}) => {
        try {
            if (!previewImage || !canvasRef.current) return;

            // Generate Production File (Clean, No Layers)
            const printImage = canvasRef.current.generatePrintFile();

            if (!printImage) {
                throw new Error("Failed to generate print file");
            }

            // Add Template Slug to options if present
            const templateSlug = searchParams.get('template_slug');
            const finalOptions = { ...selectedOptions };
            if (templateSlug) {
                finalOptions.template_slug = templateSlug;
            }

            console.log('[Cart] Starting checkout process...');
            console.log('[Cart] Price:', finalPrice);
            console.log('[Cart] Options:', finalOptions);

            // Product ID: 123835 - 客製化手機殼 (line3)
            const WOOCOMMERCE_PRODUCT_ID = 123835;

            console.log('[Cart] Saving design to Supabase...');

            // Save complete design to Supabase
            const { data: designData, error: designError } = await supabase
                .from('custom_designs')
                .insert({
                    design_id: designId,
                    product_name: currentProduct?.name || '客製化手機殼',
                    phone_model: currentProduct?.name || 'Unknown',
                    price: finalPrice,
                    options: finalOptions
                })
                .select()
                .single();

            if (designError) {
                console.error('[Cart] Failed to save design:', designError);
                throw new Error(`無法保存設計: ${designError.message}`);
            }

            console.log('[Cart] Design saved successfully:', designData);

            // Build WooCommerce add-to-cart URL (只傳 design_id)
            const checkoutUrl = new URL('https://ppbears.com/');
            checkoutUrl.searchParams.set('add-to-cart', String(WOOCOMMERCE_PRODUCT_ID));
            checkoutUrl.searchParams.set('quantity', '1');
            checkoutUrl.searchParams.set('design_id', designId);

            console.log('[Cart] Checkout URL:', checkoutUrl.toString());

            // Save images to IndexedDB for reference
            const { update } = await import('idb-keyval');
            await update('pending_order_images', (images) => {
                const currentImages = images || {};
                currentImages[designId] = {
                    previewImage,
                    printImage,
                    timestamp: new Date().toISOString()
                };
                return currentImages;
            });

            // Redirect to WooCommerce
            window.location.href = checkoutUrl.toString();

        } catch (error: any) {
            console.error("[Cart] Order processing error:", error);
            alert(`處理失敗: ${error.message}\n\n請查看瀏覽器 Console (F12) 了解詳細錯誤訊息。`);
        }
    };

    const toggleCategoryExpand = (id: string) => {
        setExpandedCategoryIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const getDescendantIds = (rootId: string) => {
        const root = categoryMap.get(rootId);
        if (!root) return [];
        const out: string[] = [];
        const stack: Category[] = [...(root.children || [])];
        while (stack.length > 0) {
            const node = stack.pop()!;
            out.push(node.id);
            if (node.children && node.children.length > 0) {
                stack.push(...node.children);
            }
        }
        return out;
    };

    // If no product ID is present, render the Shop Catalog
    if (!productId) {
        return <SellerShop />;
    }

    return (
        <div className="flex h-screen w-screen overflow-hidden bg-gray-50 text-gray-900 font-sans relative">

            {/* Checkout Modal (Replaced with SaveDesignModal) */}
            <SaveDesignModal
                isOpen={showCheckout}
                onClose={() => setShowCheckout(false)}
                basePrice={0}
                productId={currentProduct?.id}
                productName={currentProduct?.name || '客製化商品'}
                previewImage={previewImage || ''}
                onAddToCart={handleAddToCart}
            />

            <MyGalleryModal
                isOpen={showGalleryModal}
                onClose={() => setShowGalleryModal(false)}
                onApply={handleGalleryApply}
            />

            {/* Hidden File Input for Mobile/Desktop */}
            <input
                ref={bgFileInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                onChange={handleBackgroundUpload}
                onClick={(e) => (e.currentTarget.value = '')}
            />

            {/* Left Sidebar - Toolbar (Desktop Only) */}
            <aside className="hidden md:flex md:w-20 md:flex-col md:border-r md:order-first bg-white z-40 justify-start items-center py-6 space-y-2 h-full relative shadow-sm">
                <div className="mb-4">
                    <div className="w-10 h-10 bg-black rounded-full flex items-center justify-center text-white font-bold text-xs shadow-md">PP</div>
                </div>

                {/* Tool: Product */}
                <button
                    onClick={() => handleToolClick('Product')}
                    className={`group relative flex flex-col items-center justify-center w-16 h-16 rounded-xl transition-all duration-200 border border-transparent hover:border-blue-200 ${activePanel === 'products' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600'}`}
                    title="商品"
                >
                    <Smartphone className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium">
                        商品
                    </span>
                </button>

                {/* Tool: Upload Image */}
                <button
                    onClick={() => setShowGalleryModal(true)}
                    className="group relative flex flex-col items-center justify-center w-16 h-16 rounded-xl text-gray-500 hover:bg-blue-50 hover:text-blue-600 cursor-pointer transition-all duration-200 border border-transparent hover:border-blue-200"
                    title="上傳圖片"
                >
                    <Upload className="w-6 h-6 mb-1" />
                    <span className="text-xs font-medium">
                        上傳
                    </span>
                </button>

                {/* Tool: Text */}
                {perms.text && (
                    <button
                        onClick={() => handleToolClick('Text')}
                        className="group relative flex flex-col items-center justify-center w-16 h-16 rounded-xl text-gray-500 hover:bg-blue-50 hover:text-blue-600 transition-all duration-200 border border-transparent hover:border-blue-200"
                        title="新增文字"
                    >
                        <Type className="w-6 h-6 mb-1" />
                        <span className="text-xs font-medium">
                            文字
                        </span>
                    </button>
                )}

                {/* Tool: Stickers */}
                {perms.stickers && (
                    <button
                        onClick={() => handleToolClick('Stickers')}
                        className={`group relative flex flex-col items-center justify-center w-16 h-16 rounded-xl transition-all duration-200 border border-transparent hover:border-blue-200 ${activePanel === 'stickers' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600'}`}
                        title="貼圖"
                    >
                        <Sticker className="w-6 h-6 mb-1" />
                        <span className="text-xs font-medium">
                            貼圖
                        </span>
                    </button>
                )}

                {/* Tool: Background */}
                {perms.backgrounds && (
                    <button
                        onClick={() => handleToolClick('Background')}
                        className={`group relative flex flex-col items-center justify-center w-16 h-16 rounded-xl transition-all duration-200 border border-transparent hover:border-blue-200 ${activePanel === 'backgrounds' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600'}`}
                        title="背景"
                    >
                        <Image className="w-6 h-6 mb-1" />
                        <span className="text-xs font-medium">
                            背景
                        </span>
                    </button>
                )}

                {/* Tool: Frames (New) */}
                {perms.frames && (
                    <button
                        onClick={() => handleToolClick('Frames')}
                        className={`group relative flex flex-col items-center justify-center w-16 h-16 rounded-xl transition-all duration-200 border border-transparent hover:border-blue-200 ${activePanel === 'frames' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600'}`}
                        title="相框"
                    >
                        <FrameIcon className="w-6 h-6 mb-1" />
                        <span className="text-xs font-medium">
                            相框
                        </span>
                    </button>
                )}

                {/* Tool: Barcode */}
                {perms.barcode && (
                    <button
                        onClick={() => handleToolClick('Barcode')}
                        className={`group relative flex flex-col items-center justify-center w-16 h-16 rounded-xl transition-all duration-200 border border-transparent hover:border-blue-200 ${activePanel === 'barcode' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600'}`}
                        title="手機條碼"
                    >
                        <ScanBarcode className="w-6 h-6 mb-1" />
                        <span className="text-xs font-medium">
                            條碼
                        </span>
                    </button>
                )}



                {/* Tool: Designs */}
                {perms.designs && (
                    <button
                        onClick={() => handleToolClick('Designs')}
                        className={`group relative flex flex-col items-center justify-center w-16 h-16 rounded-xl transition-all duration-200 border border-transparent hover:border-blue-200 ${activePanel === 'designs' ? 'bg-blue-100 text-blue-600' : 'text-gray-500 hover:bg-blue-50 hover:text-blue-600'}`}
                        title="設計"
                    >
                        <Palette className="w-6 h-6 mb-1" />
                        <span className="text-xs font-medium">
                            設計
                        </span>
                    </button>
                )}

                {/* Tool: Cartoonize (Ink) - Direct Action */}
                {perms.aiCartoon && (
                    <button
                        onClick={() => {
                            handleAiAction('toon_ink');
                            setActivePanel('none');
                        }}
                        className="group relative flex flex-col items-center justify-center w-16 h-16 rounded-xl text-gray-500 hover:bg-purple-50 hover:text-purple-600 transition-all duration-200 border border-transparent hover:border-purple-200"
                        title="卡通化"
                    >
                        <Wand2 className="w-6 h-6 mb-1" />
                        <span className="text-xs font-medium">
                            卡通化
                        </span>
                    </button>
                )}

                {/* Tool: Remove BG - Direct Action */}
                {perms.aiRemoveBg && (
                    <button
                        onClick={() => {
                            handleAiAction('remove_bg');
                            setActivePanel('none');
                        }}
                        className="group relative flex flex-col items-center justify-center w-16 h-16 rounded-xl text-gray-500 hover:bg-red-50 hover:text-red-600 transition-all duration-200 border border-transparent hover:border-red-200"
                        title="一鍵去背"
                    >
                        <Scissors className="w-6 h-6 mb-1" />
                        <span className="text-xs font-medium">
                            去背
                        </span>
                    </button>
                )}

            </aside>

            {/* Center - Canvas Area */}
            <main className="flex-1 relative bg-gray-100 flex flex-col">
                {/* Assets Panel (Responsive: Sidebar on Desktop, Bottom Sheet on Mobile) */}
                {activePanel !== 'none' && (
                    <div className={`
                absolute z-[120] bg-white shadow-xl flex flex-col overflow-hidden animate-in duration-200
                md:left-0 md:top-0 md:bottom-0 md:w-64 md:border-r md:border-t-0 md:slide-in-from-left-5 md:rounded-none
                fixed inset-x-0 bottom-0 top-auto h-[50vh] rounded-t-2xl border-t slide-in-from-bottom-5
            `}>
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 sticky top-0 z-10 shrink-0">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                {activePanel === 'products' && <><Smartphone className="w-4 h-4" /> 選擇商品</>}
                                {activePanel === 'designs' && <><Palette className="w-4 h-4" /> 選擇設計</>}
                                {activePanel === 'stickers' && <><Sticker className="w-4 h-4" /> 貼圖</>}
                                {activePanel === 'backgrounds' && <><Image className="w-4 h-4" /> 背景</>}
                                {activePanel === 'barcode' && <><ScanBarcode className="w-4 h-4" /> 手機條碼</>}
                                {activePanel === 'frames' && <><FrameIcon className="w-4 h-4" /> 精選相框 {isOffline && <span className="ml-2 text-[10px] bg-amber-100 text-amber-600 px-1.5 py-0.5 rounded-full font-normal">離線/快取</span>}</>}
                                {activePanel === 'ai' && <><Sparkles className="w-4 h-4" /> AI 魔法</>}
                            </h3>
                            <button onClick={() => setActivePanel('none')} className="text-gray-400 hover:text-gray-600">
                                <X className="w-4 h-4" />
                            </button>
                        </div>

                        {activePanel === 'products' ? (
                            <div className="flex flex-col flex-1 min-h-0 bg-white">
                                {/* Header with Back Button if deeper in hierarchy */}
                                {navPath.length > 0 && (
                                    <div className="px-4 py-2 border-b border-gray-100 flex items-center gap-2 shrink-0">
                                        <button
                                            onClick={() => setNavPath(prev => prev.slice(0, -1))}
                                            className="p-1 hover:bg-gray-100 rounded text-gray-600"
                                        >
                                            <ChevronLeft className="w-5 h-5" />
                                        </button>
                                        <span className="font-semibold text-sm text-gray-800">
                                            選擇商品
                                        </span>
                                    </div>
                                )}

                                <div className="p-2 pb-20 overflow-y-auto flex-1">
                                    {/* Level 0: Categories */}
                                    {navPath.length === 0 && (
                                        <div className="space-y-1">
                                            <div className="px-2 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">請選擇產品類型</div>

                                            {/* Loading State */}
                                            {(isLoadingProducts || isLoadingCategories) && (
                                                <div className="p-4 text-center text-gray-400 text-sm flex flex-col items-center">
                                                    <div className="w-5 h-5 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mb-2"></div>
                                                    載入中...
                                                </div>
                                            )}

                                            {/* Error State */}
                                            {(productError || categoryError) && (
                                                <div className="p-4 text-center text-red-500 text-sm bg-red-50 rounded-lg mx-2">
                                                    {productError || categoryError}
                                                </div>
                                            )}

                                            {/* Empty State */}
                                            {!isLoadingProducts && !isLoadingCategories && !productError && !categoryError && categoryTree.length === 0 && (
                                                <div className="p-8 text-center text-gray-400 text-sm">
                                                    目前沒有可用的分類。
                                                </div>
                                            )}

                                            {!isLoadingProducts && !isLoadingCategories && !productError && !categoryError && (
                                                <>
                                                    <div className="pt-2">
                                                        {categoryTree.map(category => {
                                                            const renderCat = (c: Category, depth: number) => {
                                                                const hasChildren = !!(c.children && c.children.length > 0);
                                                                const isExpanded = expandedCategoryIds.has(c.id);
                                                                return (
                                                                    <div key={c.id}>
                                                                        <button
                                                                            onClick={() => setNavPath([c.id])}
                                                                            className="w-full flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl transition-colors group"
                                                                            style={{ paddingLeft: `${depth * 12 + 12}px` }}
                                                                        >
                                                                            <div className="flex items-center gap-2 min-w-0">
                                                                                {hasChildren ? (
                                                                                    <span
                                                                                        onClick={(e) => {
                                                                                            e.preventDefault();
                                                                                            e.stopPropagation();
                                                                                            toggleCategoryExpand(c.id);
                                                                                        }}
                                                                                        className="p-1 -ml-1 rounded hover:bg-gray-200 text-gray-500"
                                                                                    >
                                                                                        {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="w-6" />
                                                                                )}
                                                                                <span className="font-medium text-gray-700 truncate">{c.name}</span>
                                                                            </div>
                                                                            <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 flex-shrink-0" />
                                                                        </button>
                                                                        {hasChildren && isExpanded && c.children!.map(child => renderCat(child, depth + 1))}
                                                                    </div>
                                                                );
                                                            };
                                                            return renderCat(category, 0);
                                                        })}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}

                                    {/* Level 1: Products (Filtered by category_id with descendants) */}
                                    {navPath.length === 1 && (
                                        <div className="space-y-1">
                                            <div className="px-2 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">選擇商品</div>
                                            {(productError || categoryError) ? (
                                                <div className="p-4 text-center text-red-500 text-sm bg-red-50 rounded-lg mx-2">
                                                    {productError || categoryError}
                                                </div>
                                            ) : (() => {
                                                const selected = navPath[0];
                                                let filtered = products;

                                                if (selected === 'other') {
                                                    filtered = products.filter(p => !p?.category_id);
                                                } else if (selected !== 'all') {
                                                    const allowed = new Set<string>([selected, ...getDescendantIds(selected)]);
                                                    filtered = products.filter(p => p?.category_id && allowed.has(p.category_id));
                                                }

                                                return (
                                                    <>
                                                        {filtered.map(product => (
                                                            <button
                                                                key={product.id}
                                                                disabled={isTemplateLoading}
                                                                onClick={() => {
                                                                    setSearchParams({ productId: product.id });
                                                                    if (window.innerWidth < 768) setActivePanel('none');
                                                                }}
                                                                className={`w-full flex items-center gap-3 p-2 bg-white border rounded-xl hover:border-blue-500 hover:shadow-md transition-all text-left group mb-2 ${searchParams.get('productId') === product.id ? 'border-blue-500 ring-1 ring-blue-500 bg-blue-50' : 'border-gray-200'
                                                                    } ${isTemplateLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            >
                                                                <div className="w-12 h-16 bg-gray-100 rounded-md overflow-hidden flex-shrink-0 flex items-center justify-center">
                                                                    <img src={product.thumbnail || product.base_image || ''} alt={product.name} className="max-w-full max-h-full object-contain mix-blend-multiply" />
                                                                </div>
                                                                <div className="flex-1 min-w-0">
                                                                    <h4 className="font-semibold text-gray-800 text-sm truncate">{product.name}</h4>
                                                                </div>
                                                                {searchParams.get('productId') === product.id && <Check className="w-4 h-4 text-blue-500" />}
                                                            </button>
                                                        ))}
                                                        {filtered.length === 0 && (
                                                            <div className="text-center py-8 text-gray-400 text-sm">此分類尚無商品。</div>
                                                        )}
                                                    </>
                                                );
                                            })()}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : activePanel === 'barcode' ? (
                            <div className="p-6 space-y-4 flex-1 overflow-y-auto">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium text-gray-700">輸入載具號碼 (如 /ABC1234)</label>
                                    <input
                                        type="text"
                                        value={barcodeText}
                                        onChange={(e) => setBarcodeText(e.target.value.toUpperCase())}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono tracking-widest uppercase"
                                        placeholder="/ABC1234"
                                        maxLength={8}
                                    />
                                    <p className="text-xs text-gray-500">台灣電子發票手機載具格式。</p>
                                </div>
                                <button
                                    onClick={handleAddBarcode}
                                    disabled={!barcodeText || barcodeText.length < 2}
                                    className="w-full py-2.5 bg-black text-white rounded-lg font-medium hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    <ScanBarcode className="w-4 h-4" />
                                    生成條碼
                                </button>
                            </div>
                        ) : activePanel === 'ai' ? (
                            <div className="p-6 space-y-6 flex-1 overflow-y-auto">
                                {/* Cartoonize Section */}
                                {perms.aiCartoon && (
                                    <div className="space-y-3">
                                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                            <Wand2 className="w-4 h-4" />
                                            照片卡通化
                                        </h4>
                                        <div className="grid grid-cols-1 gap-2">
                                            {[
                                                { id: 'toon_ink', label: '水墨風格 (Ink)', desc: '藝術感強烈' },
                                            ].map((style) => (
                                                <button
                                                    key={style.id}
                                                    onClick={() => {
                                                        handleAiAction(style.id);
                                                        if (window.innerWidth < 768) setActivePanel('none');
                                                    }}
                                                    className="flex items-center p-3 border border-gray-200 rounded-xl hover:border-purple-500 hover:bg-purple-50 transition-all text-left group"
                                                >
                                                    <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center text-purple-600 mr-3 group-hover:scale-110 transition-transform">
                                                        <Sparkles className="w-5 h-5" />
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-gray-800 text-sm">{style.label}</div>
                                                        <div className="text-xs text-gray-500">{style.desc}</div>
                                                    </div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Remove BG Section */}
                                {perms.aiRemoveBg && (
                                    <div className="space-y-3 pt-4 border-t border-gray-100">
                                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                                            <Scissors className="w-4 h-4" />
                                            智能去背
                                        </h4>
                                        <button
                                            onClick={() => {
                                                handleAiAction('remove_bg');
                                                if (window.innerWidth < 768) setActivePanel('none');
                                            }}
                                            className="w-full flex items-center p-3 border border-gray-200 rounded-xl hover:border-red-500 hover:bg-red-50 transition-all text-left group"
                                        >
                                            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 mr-3 group-hover:scale-110 transition-transform">
                                                <Ban className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <div className="font-semibold text-gray-800 text-sm">一鍵去背</div>
                                                <div className="text-xs text-gray-500">自動移除圖片背景</div>
                                            </div>
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex flex-col flex-1 min-h-0 bg-white relative">
                                {/* Search & Filter Header */}
                                <div className="p-3 border-b border-gray-100 z-20 bg-white shadow-sm">
                                    {/* Search Input */}
                                    <div className="relative">
                                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                                            <Search className="w-4 h-4" />
                                        </div>
                                        <input
                                            type="text"
                                            value={assetSearch}
                                            onChange={(e) => setAssetSearch(e.target.value)}
                                            placeholder={activePanel === 'designs' ? "搜尋設計..." : "搜尋素材..."}
                                            className="block w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all"
                                        />
                                    </div>
                                </div>

                                {/* Basic Shapes for Frames Panel */}
                                {activePanel === 'frames' && (
                                    <div className="p-2 border-b border-gray-100 bg-white z-10">
                                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">基本形狀</div>
                                        <div className="grid grid-cols-4 gap-1">
                                            <button onClick={() => handleApplyCrop('rounded')} className={`flex flex-col items-center gap-0.5 group p-1.5 rounded-lg transition-all border ${selectedShape === 'rounded' ? 'bg-blue-50 border-blue-200' : 'border-transparent hover:bg-gray-50'}`}>
                                                <div className={`w-6 h-6 border-2 rounded-lg transition-all ${selectedShape === 'rounded' ? 'border-blue-500 bg-blue-100' : 'border-gray-300 group-hover:border-blue-500 group-hover:bg-white'}`}></div>
                                                <span className={`text-[9px] ${selectedShape === 'rounded' ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>圓角</span>
                                            </button>
                                            <button onClick={() => handleApplyCrop('circle')} className={`flex flex-col items-center gap-0.5 group p-1.5 rounded-lg transition-all border ${selectedShape === 'circle' ? 'bg-blue-50 border-blue-200' : 'border-transparent hover:bg-gray-50'}`}>
                                                <div className={`w-6 h-6 border-2 rounded-full transition-all ${selectedShape === 'circle' ? 'border-blue-500 bg-blue-100' : 'border-gray-300 group-hover:border-blue-500 group-hover:bg-white'}`}></div>
                                                <span className={`text-[9px] ${selectedShape === 'circle' ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>圓形</span>
                                            </button>
                                            <button onClick={() => handleApplyCrop('heart')} className={`flex flex-col items-center gap-0.5 group p-1.5 rounded-lg transition-all border ${selectedShape === 'heart' ? 'bg-blue-50 border-blue-200' : 'border-transparent hover:bg-gray-50'}`}>
                                                <Heart className={`w-6 h-6 p-0.5 transition-all ${selectedShape === 'heart' ? 'text-blue-500 fill-blue-100' : 'text-gray-300 group-hover:text-blue-500'}`} />
                                                <span className={`text-[9px] ${selectedShape === 'heart' ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>愛心</span>
                                            </button>
                                            <button onClick={() => handleApplyCrop('star')} className={`flex flex-col items-center gap-0.5 group p-1.5 rounded-lg transition-all border ${selectedShape === 'star' ? 'bg-blue-50 border-blue-200' : 'border-transparent hover:bg-gray-50'}`}>
                                                <div className={`w-6 h-6 flex items-center justify-center border-2 rounded-lg transition-all ${selectedShape === 'star' ? 'border-blue-200 bg-blue-100' : 'border-transparent group-hover:bg-white'}`}>
                                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 ${selectedShape === 'star' ? 'text-blue-500 fill-blue-100' : 'text-gray-300 group-hover:text-blue-500'}`}>
                                                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                                                    </svg>
                                                </div>
                                                <span className={`text-[9px] ${selectedShape === 'star' ? 'text-blue-600 font-medium' : 'text-gray-500'}`}>五角星</span>
                                            </button>
                                        </div>

                                        {/* Shape Settings Slider */}
                                        {selectedShape !== 'none' && selectedShape !== 'circle' && (
                                            <div className="mt-4 px-2 animate-in fade-in slide-in-from-top-2 duration-200">
                                                <div className="flex items-center justify-between mb-1">
                                                    <span className="text-xs font-medium text-gray-500">
                                                        {selectedShape === 'rounded' ? '圓角大小' :
                                                            selectedShape === 'star' ? '星形變化' :
                                                                selectedShape === 'heart' ? '圓潤程度' : '參數調整'}
                                                    </span>
                                                    <span className="text-xs font-bold text-blue-600">
                                                        {Math.round(frameParam)}%
                                                    </span>
                                                </div>

                                                {/* Slider Control */}
                                                <input
                                                    type="range"
                                                    min="0"
                                                    max="100"
                                                    step="1"
                                                    value={frameParam}
                                                    onChange={handleFrameParamChange}
                                                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
                                                />

                                                {selectedShape === 'star' && (
                                                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                                                        <span>標準星型</span>
                                                        <span>五角形</span>
                                                    </div>
                                                )}
                                                {selectedShape === 'heart' && (
                                                    <div className="flex justify-between text-[10px] text-gray-400 mt-1">
                                                        <span>尖銳</span>
                                                        <span>圓潤</span>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Background Colors Section */}
                                {activePanel === 'backgrounds' && (
                                    <div className="p-3 border-b border-gray-100 bg-white z-10">
                                        <div className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">純色背景</div>
                                        <div className="flex flex-wrap gap-2">
                                            {/* Remove Background */}
                                            <button
                                                onClick={handleRemoveBackground}
                                                className="w-8 h-8 rounded-full border border-gray-200 hover:scale-110 transition-transform shadow-sm relative bg-white flex items-center justify-center text-red-500"
                                                title="移除背景"
                                            >
                                                <Ban className="w-4 h-4" />
                                            </button>

                                            {/* Custom Color Picker */}
                                            <label className="w-8 h-8 rounded-full border border-gray-300 cursor-pointer relative overflow-hidden flex items-center justify-center bg-gradient-to-br from-red-500 via-green-500 to-blue-500 hover:shadow-md transition-shadow" title="自訂顏色">
                                                <input
                                                    type="color"
                                                    className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                                                    onChange={(e) => handleAddBackgroundColor(e.target.value)}
                                                />
                                                <div className="bg-white/80 p-0.5 rounded-full pointer-events-none">
                                                    <Plus className="w-3 h-3 text-gray-600" />
                                                </div>
                                            </label>

                                            {/* Presets */}
                                            {['#FF0000', '#FFA500', '#FFFF00', '#008000', '#0000FF', '#4B0082', '#EE82EE', '#000000'].map(color => (
                                                <button
                                                    key={color}
                                                    onClick={() => handleAddBackgroundColor(color)}
                                                    className="w-8 h-8 rounded-full border border-gray-200 hover:scale-110 transition-transform shadow-sm relative"
                                                    style={{ backgroundColor: color }}
                                                    title={color}
                                                >
                                                    {color === '#ffffff' && <div className="absolute inset-0 border border-gray-100 rounded-full" />}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {/* Basic Shapes for Frames Panel or Active Image Selection */}
                                {isImageSelected && (
                                    /* Basic Shapes (Crop) Section - Moved to Frame Modal inside CanvasEditor */
                                    <div className="hidden"></div>
                                )}

                                {/* Category Tabs (Responsive: Moved below specific settings like colors/shapes) */}
                                <div className="p-2 border-b border-gray-100 bg-white z-10">
                                    <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                                        <div className="flex items-center px-2 py-1 bg-gray-100 text-gray-600 rounded-md text-[10px] font-medium whitespace-nowrap shrink-0">
                                            {activePanel === 'stickers' ? '貼圖風格' : activePanel === 'backgrounds' ? '背景風格' : activePanel === 'frames' ? '相框風格' : '設計分類'}
                                        </div>
                                        <button
                                            onClick={() => setSelectedAssetCategory('全部')}
                                            className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${selectedAssetCategory === '全部' ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                                        >
                                            全部
                                        </button>
                                        {(() => {
                                            let cats: string[] = [];
                                            if (activePanel === 'stickers') cats = stickerCategories;
                                            else if (activePanel === 'backgrounds') cats = backgroundCategories;
                                            else if (activePanel === 'frames') cats = frameCategories;
                                            else if (activePanel === 'designs') cats = designCategories;

                                            return cats.filter(c => c !== '全部').map(cat => (
                                                <button
                                                    key={cat}
                                                    onClick={() => setSelectedAssetCategory(cat)}
                                                    className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${selectedAssetCategory === cat ? 'bg-red-600 text-white shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200'}`}
                                                >
                                                    {cat}
                                                </button>
                                            ));
                                        })()}
                                    </div>
                                </div>

                                {/* Grid Content */}
                                <div className={`p-2 pb-20 overflow-y-auto flex-1 ${activePanel === 'designs' ? 'grid grid-cols-3 md:grid-cols-2 gap-x-2 gap-y-3' : 'grid grid-cols-4 gap-x-1 gap-y-1 content-start'}`}>
                                    {activePanel === 'designs' && (
                                        <>
                                            {/* Debug UI for Dev */}
                                            {showDebug && dbCheckResult && (
                                                <div className="col-span-2 mb-4 p-3 bg-gray-900 text-green-400 text-xs font-mono rounded-lg overflow-x-auto shadow-lg border border-gray-700">
                                                    <div className="font-bold border-b border-gray-700 pb-1 mb-1 flex justify-between">
                                                        <span>[DEBUG] Design Templates</span>
                                                        <span className={dbCheckResult.ok ? "text-green-500" : "text-red-500"}>
                                                            {dbCheckResult.ok ? "CONNECTED" : "ERROR"}
                                                        </span>
                                                    </div>
                                                    <div>Project Ref: <span className="text-white">{dbCheckResult.projectRef}</span></div>
                                                    <div>Table: <span className="text-white">design_templates</span></div>
                                                    <div>Query Count: <span className="text-white">{dbCheckResult.count ?? 'N/A'}</span></div>

                                                    {dbCheckResult.error && (
                                                        <div className="mt-2 p-2 bg-red-900/30 text-red-300 rounded border border-red-900/50">
                                                            <div>Code: {dbCheckResult.error.code}</div>
                                                            <div>Message: {dbCheckResult.error.message}</div>
                                                            <div className="mt-1 opacity-75">{dbCheckResult.error.details}</div>

                                                            <button
                                                                onClick={() => {
                                                                    navigator.clipboard.writeText(FIX_RLS_SQL);
                                                                    alert("SQL 腳本已複製！");
                                                                }}
                                                                className="mt-2 px-2 py-1 bg-red-800 text-white rounded hover:bg-red-700 transition-colors w-full text-center"
                                                            >
                                                                複製 RLS 修復腳本 (SQL v2)
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Loading State for Assets */}
                                            {loadingAssets && activePanel !== 'designs' && (
                                                <div className="col-span-full flex justify-center py-8">
                                                    <div className="w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
                                                </div>
                                            )}
                                            {/* Error State for Assets */}
                                            {assetError && activePanel !== 'designs' && (
                                                <div className="col-span-full text-center text-red-500 py-4 text-sm">
                                                    {assetError}
                                                    <button onClick={() => setAssetSearch(assetSearch + ' ')} className="block mx-auto mt-2 text-blue-500 underline">重試</button>
                                                </div>
                                            )}

                                            {loadingDesigns && (
                                                <div className="col-span-2 flex justify-center py-8">
                                                    <div className="w-6 h-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin"></div>
                                                </div>
                                            )}
                                            {designError && (
                                                <div className="col-span-2 text-center text-red-500 py-4 text-sm">
                                                    {designError}
                                                    <button onClick={() => setAssetSearch(assetSearch + ' ')} className="block mx-auto mt-2 text-blue-500 underline">重試</button>
                                                </div>
                                            )}
                                            {!loadingDesigns && !designError && activePanel === 'designs' && designs.length === 0 && (
                                                <div className="col-span-2 text-center text-gray-400 py-8">
                                                    找不到相關設計。
                                                </div>
                                            )}

                                            {/* Empty State for Assets */}
                                            {/* Empty State for Assets */}
                                            {!loadingAssets && !assetError && activePanel !== 'designs' && activePanel !== 'none' &&
                                                (activePanel === 'stickers' ? stickers : activePanel === 'backgrounds' ? backgrounds : frames).length === 0 && (
                                                    <div className="col-span-full text-center text-gray-400 py-8">
                                                        找不到相關素材。
                                                    </div>
                                                )}

                                        </>
                                    )}

                                    {(() => {
                                        // For designs, we use the fetched state directly (already filtered by API)
                                        // For others, we filter locally
                                        let displayItems: any[] = [];

                                        if (activePanel === 'designs') {
                                            displayItems = designs;
                                        } else {
                                            const source = activePanel === 'stickers' ? stickers :
                                                activePanel === 'backgrounds' ? backgrounds :
                                                    activePanel === 'frames' ? frames :
                                                        [];

                                            // Frames logic in original code seemed missing in 'source' assignment above?
                                            // Original: activePanel === 'stickers' ? stickers : activePanel === 'backgrounds' ? backgrounds : designs;
                                            // Wait, where were frames?
                                            // Original code:
                                            // const source = activePanel === 'stickers' ? stickers : 
                                            //              activePanel === 'backgrounds' ? backgrounds : 
                                            //              designs;
                                            // Frames were probably missing in the original switch or I missed it.
                                            // Let's check the original Read output.
                                            // Original line 1172: activePanel === 'stickers' ? stickers : activePanel === 'backgrounds' ? backgrounds : designs;
                                            // Frames seem to use their own UI or logic? 
                                            // Line 1291: onOpenFrames: ... handleToolClick('Frames')
                                            // But activePanel 'frames' logic in line 814 is for header.
                                            // But in the grid... wait.
                                            // Line 1105: activePanel === 'frames' cats = frameCategories.
                                            // But line 1172 didn't include frames. This might be a bug in original code or I missed it.
                                            // Ah, frames are handled?
                                            // Let's stick to the user task: Fix DESIGNS.

                                            displayItems = source.filter(item => {
                                                const matchesSearch = !assetSearch ||
                                                    item.name.toLowerCase().includes(assetSearch.toLowerCase()) ||
                                                    (('tags' in item && Array.isArray(item.tags)) && (item.tags as string[]).some((t: string) => t.toLowerCase().includes(assetSearch.toLowerCase())));

                                                const matchesCategory = selectedAssetCategory === '全部' || item.category === selectedAssetCategory;

                                                return matchesSearch && matchesCategory;
                                            });
                                        }

                                        return displayItems.map((item, idx) => {
                                            if (activePanel === 'designs') {
                                                const design = item as DesignTemplate;
                                                return (
                                                    <button
                                                        key={design.id}
                                                        onClick={() => handleAddDesignLayers(design)}
                                                        className="group flex flex-col items-center gap-2 w-full"
                                                    >
                                                        <div className="aspect-[1/2] w-full bg-gray-50 rounded-xl overflow-hidden relative shadow-sm group-hover:shadow-md transition-all border border-gray-100">
                                                            {/* Background Preview (Product Template) */}
                                                            {productConfig?.baseImage && (
                                                                <div className="absolute inset-0 p-1 flex items-center justify-center">
                                                                    <img
                                                                        src={productConfig.baseImage}
                                                                        className="w-full h-full object-contain opacity-50 mix-blend-multiply"
                                                                        alt="template"
                                                                    />
                                                                </div>
                                                            )}

                                                            {design.previewUrl ? (
                                                                <img src={design.previewUrl} alt={design.name} className="w-full h-full object-contain p-1 relative z-10" />
                                                            ) : (
                                                                <div className="w-full h-full flex items-center justify-center relative z-10">
                                                                    <FileImage className="w-8 h-8 text-gray-300" />
                                                                </div>
                                                            )}

                                                            {/* Hover Effect Overlay */}
                                                            <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity z-20" />
                                                        </div>
                                                    </button>
                                                );
                                            } else {
                                                return (
                                                    <button
                                                        key={item.id || idx}
                                                        onClick={() => handleAddAsset(item, activePanel === 'stickers' ? 'sticker' : activePanel === 'frames' ? 'frame' : 'background')}
                                                        className="aspect-square rounded-md border border-gray-200 p-0.5 hover:border-blue-500 hover:shadow-md transition-all bg-white flex items-center justify-center relative group"
                                                        title={item.name}
                                                    >
                                                        <img src={item.url} alt={item.name} className="max-w-full max-h-full object-contain" />
                                                    </button>
                                                );
                                            }
                                        });
                                    })()}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Top Header */}
                <header className="h-16 bg-white border-b border-gray-200 flex items-center px-4 md:px-6 justify-between shadow-sm z-10 shrink-0">
                    <div className="flex items-center gap-4">
                        <h1 className="text-lg font-semibold text-gray-800 truncate">客製化手機殼</h1>
                        {/* Only show Admin Link in admin/seller routes */}
                        {isAdminRoute(location.pathname) && (
                            <button
                                onClick={() => navigate('/seller/products')}
                                className="px-3 py-1.5 bg-red-600 text-white text-xs font-bold rounded-md hover:bg-red-700 transition-colors shadow-sm"
                            >賣家後台</button>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Clear Cache Button (Dev Only) */}
                        {import.meta.env.DEV && (
                            <button
                                onClick={handleClearCache}
                                className="px-3 py-2 bg-orange-500 text-white rounded-lg text-xs font-medium hover:bg-orange-600 transition-colors shadow-sm whitespace-nowrap"
                                title="清除快取並重新載入（開發工具）"
                            >
                                🗑️ 清除快取
                            </button>
                        )}
                        <button
                            onClick={handlePreviewBuy}
                            className="px-4 py-2 bg-black text-white rounded-full text-sm font-medium hover:bg-gray-800 transition-colors shadow-md whitespace-nowrap"
                        >預覽 / 購買</button>
                    </div>
                </header>

                <div className="flex-1 overflow-hidden relative flex flex-col">
                    <CanvasEditor
                        ref={canvasRef}
                        uploadedImage={uploadedImage}
                        activeTool={activeTool}
                        onToolUsed={() => setActiveTool(null)}
                        previewConfig={productConfig || undefined}
                        currentProduct={currentProduct}
                        onCropModeChange={setIsCropping}
                        onTemplateLoadingChange={setIsTemplateLoading}
                        onImageLayerChange={setCanvasHasUserImage}
                        onSelectionChange={(obj) => {
                            setHasClipPath(!!obj?.clipPath);
                            setIsImageSelected(obj?.type === 'image');
                        }}
                        mobileActions={{
                            onUpload: () => setShowGalleryModal(true),
                            onAddText: perms.text ? () => handleToolClick('Text') : undefined,
                            onOpenStickers: perms.stickers ? () => handleToolClick('Stickers') : undefined,
                            onOpenBackgrounds: perms.backgrounds ? () => handleToolClick('Background') : undefined,
                            onOpenBarcode: perms.barcode ? () => handleToolClick('Barcode') : undefined,
                            onOpenFrames: perms.frames ? () => handleToolClick('Frames') : undefined,
                            onOpenDesigns: perms.designs ? () => handleToolClick('Designs') : undefined,
                            // Split AI Actions for Mobile
                            onAiCartoon: perms.aiCartoon ? () => { handleAiAction('toon_ink'); setActivePanel('none'); } : undefined,
                            onAiRemoveBg: perms.aiRemoveBg ? () => { handleAiAction('remove_bg'); setActivePanel('none'); } : undefined,
                            onOpenProduct: () => handleToolClick('Product')
                        }}
                    />
                </div>
            </main>
        </div>
    );
}
