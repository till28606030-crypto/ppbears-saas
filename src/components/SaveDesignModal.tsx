import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check, ChevronRight, ShoppingCart, Info, Loader2, AlertCircle, ZoomIn, Settings, ImageIcon } from 'lucide-react';
import { get } from 'idb-keyval';
import { loadOptionGroups } from '../services/optionGroups';
import { supabase } from '../lib/supabase';
import { recognizeSpecsFromImage, mapRecognizedSpecs } from '../services/aiRecognition';
import { Sparkles } from 'lucide-react';
import DOMPurify from 'dompurify';

export interface SubAttributeOption {
    id: string;
    name: string;
    priceModifier: number;
    image?: string;
}

export interface SubAttribute {
    id: string;
    name: string;
    type: 'select' | 'text';
    options?: SubAttributeOption[];
}

// --- Types (Matched with AdminOptionManager) ---
export interface OptionGroupUIConfig {
    step?: number;
    displayType?: 'cards' | 'grid' | 'list' | 'checkbox' | 'ai_recognition';
    description?: string;
    descriptionImage?: string;
}

export interface OptionGroup {
    id: string;
    code: string;
    name: string;
    priceModifier: number;
    thumbnail?: string;
    subAttributes?: SubAttribute[];
    uiConfig?: OptionGroupUIConfig;
}

export interface OptionItem {
    id: string;
    parentId: string;
    name: string;
    priceModifier: number;
    colorHex?: string;
    imageUrl?: string;
}

export interface ProductAvailability {
    modelId: string;
    optionItemId: string;
    isAvailable: boolean;
}

interface SaveDesignModalProps {
    isOpen: boolean;
    onClose: () => void;
    basePrice: number;
    productId?: string;
    productName: string;
    previewImage: string;
    onAddToCart: (finalPrice: number, selectedOptions: any) => Promise<void> | void;
}

// Storage Keys
const STORAGE_KEY_GROUPS = 'ppbears_option_groups';
const STORAGE_KEY_ITEMS = 'ppbears_option_items';
const STORAGE_KEY_AVAILABILITY = 'ppbears_product_availability';

export default function SaveDesignModal({
    isOpen,
    onClose,
    basePrice,
    productId,
    productName,
    previewImage,
    onAddToCart
}: SaveDesignModalProps) {
    const [currentStep, setCurrentStep] = useState(1);
    const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
    const [inlineError, setInlineError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Lightbox State
    const [zoomedImage, setZoomedImage] = useState<string | null>(null);

    // AI Recognition State
    const [isRecognizing, setIsRecognizing] = useState(false);
    const [matchedFields, setMatchedFields] = useState<Set<string>>(new Set());
    const aiFileInputRef = React.useRef<HTMLInputElement>(null);

    // Data State
    const [groups, setGroups] = useState<OptionGroup[]>([]);
    const [items, setItems] = useState<OptionItem[]>([]);
    const [availability, setAvailability] = useState<ProductAvailability[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Helpers
    const getUI = (g: any) => {
        const raw =
            g?.uiConfig ??
            g?.ui ??
            g?.ui_config ??
            g?.uiConfigJson ??
            g?.ui_json ??
            null;

        if (!raw) return {};

        // uiConfig 可能被存成 JSON string
        if (typeof raw === 'string') {
            try {
                const parsed = JSON.parse(raw);
                return parsed && typeof parsed === 'object' ? parsed : {};
            } catch {
                return {};
            }
        }

        return raw && typeof raw === 'object' ? raw : {};
    };

    const normalizeDisplayType = (dt: any): 'cards' | 'grid' | 'list' | 'checkbox' | 'ai_recognition' | undefined => {
        if (!dt) return undefined;
        const s = String(dt).trim();

        // already normalized
        if (s === 'cards' || s === 'grid' || s === 'list' || s === 'checkbox' || s === 'ai_recognition') return s as any;

        // Chinese labels from admin dropdown
        if (s.includes('大卡片')) return 'cards';
        if (s.includes('網格')) return 'grid';
        if (s.includes('列表')) return 'list';
        if (s.includes('勾選框') || s.includes('勾選')) return 'checkbox';
        if (s.includes('圖片辨識')) return 'ai_recognition';

        return undefined;
    };

    const getStep = (g: any): number => {
        const ui = getUI(g);

        // Top-level step（可能被 normalize 成預設 1）
        const topRaw = g?.stepIndex ?? g?.step_index ?? g?.step ?? null;
        const top = typeof topRaw === 'number' ? topRaw : parseInt(String(topRaw ?? ''), 10);

        // UI step（以 UI 為準，因為後台是從 Steps & UI 設定的）
        const uiRaw = ui?.stepIndex ?? ui?.step_index ?? ui?.step ?? ui?.stepOrder ?? null;
        const uiStep = typeof uiRaw === 'number' ? uiRaw : parseInt(String(uiRaw ?? ''), 10);

        if (Number.isFinite(uiStep) && uiStep > 0) return uiStep;
        if (Number.isFinite(top) && top > 0) return top;
        return 1;
    };

    const getGroupKey = (g: any): string => {
        const code = (g?.code ?? '').trim();
        return code ? code : String(g?.id ?? '');
    };

    // State for selected Case Group ID (for Step 1 navigation)
    const [activeCaseGroupId, setActiveCaseGroupId] = useState<string | null>(null);
    // NEW: Persistent selection for advanced options across steps
    const [selectedCaseGroupId, setSelectedCaseGroupId] = useState<string | null>(null);

    // Reset activeCaseGroupId when leaving Step 1 to prevent drill-down state persistence
    useEffect(() => {
        if (currentStep !== 1) {
            setActiveCaseGroupId(null);
        }
    }, [currentStep]);

    // Identify the persistent Case Group for advanced options
    // MOVED: useMemo must be called unconditionally before any early return
    const selectedCaseGroup = React.useMemo(
        () => groups.find(g => g.id === selectedCaseGroupId) || null,
        [groups, selectedCaseGroupId]
    );

    // 2. All groups are valid (filtering now handled by linked_option_groups)
    const validGroups = React.useMemo(() => {
        return groups || [];
    }, [groups]);

    // Grouping by Step
    const { stepGroups, maxStep, availableSteps } = React.useMemo(() => {
        const map = new Map<number, OptionGroup[]>();
        let max = 1;
        const steps: number[] = [];

        console.log("Processing Groups for Steps:", validGroups.length);

        validGroups.forEach(g => {
            // Support Snake Case from API
            const groupData = g as any;
            let s = getStep(groupData);

            if (!map.has(s)) {
                map.set(s, []);
                steps.push(s);
            }
            map.get(s)?.push(g);
            max = Math.max(max, s);
        });

        // ✅ Force include Step 1 to prevent jumping to Step 6 if Step 1 is empty
        if (!steps.includes(1)) {
            steps.push(1);
            map.set(1, []);
        }

        // Ensure steps are sorted
        steps.sort((a, b) => a - b);

        return { stepGroups: map, maxStep: max, availableSteps: steps };
    }, [validGroups]);

    // Initialize Step (Auto-skip empty steps)
    useEffect(() => {
        // If current step is not in availableSteps, jump to the nearest valid step or first one
        if (availableSteps.length > 0 && !availableSteps.includes(currentStep)) {
            // Find closest step? Or just first.
            // If we are at step 2 and it disappears, maybe go to 1?
            if (currentStep > availableSteps[availableSteps.length - 1]) {
                setCurrentStep(availableSteps[availableSteps.length - 1]);
            } else {
                const next = availableSteps.find(s => s > currentStep);
                setCurrentStep(next || availableSteps[0]);
            }
        }
    }, [availableSteps, currentStep]);

    // Debugging
    useEffect(() => {
        if (isOpen) {
            console.log("=== Debug Checkout Modal ===");
            console.log("All Groups:", groups);
            console.log("Valid Groups:", validGroups);
            console.log("Step Groups:", Object.fromEntries(stepGroups));
            console.log("Available Steps:", availableSteps);
        }
    }, [isOpen, groups, validGroups, stepGroups, availableSteps]);

    // Helper to get item details
    const getItem = (id: string) => items.find(i => i.id === id);

    // Identify Case Type Groups (Primary Options)
    // Kept for logic compatibility, but now derived from step 1
    const caseGroups = stepGroups.get(1) || [];

    // Effect: If activeCaseGroupId is not set, but we have a selection in selectedOptions that matches a group, set it?
    // MODIFIED: Do NOT auto-set activeCaseGroupId if user explicitly went back (i.e. if it is null, keep it null unless it's initial load)
    // We can use a ref to track if initial load is done? Or just rely on user interaction.
    // If we remove this effect, the user starts at Level 1 (List of Groups), which is what they want ("Re-select other case types")
    // So let's REMOVE this auto-jump effect entirely.
    /*
    useEffect(() => {
        if (!activeCaseGroupId && caseGroups.length > 0) {
             const preSelectedGroup = caseGroups.find(g => selectedOptions[g.code]);
             if (preSelectedGroup) {
                 setActiveCaseGroupId(preSelectedGroup.id);
             }
        }
    }, [caseGroups, selectedOptions]);
    */

    // Cleanup duplicate hooks

    // Fetch Data & Restore State
    useEffect(() => {
        if (isOpen) {
            setLoading(true);
            setError(null);

            // Restore State from LocalStorage
            const storageKey = `ppbears_checkout_progress_${productId || 'default'}`;
            const savedData = localStorage.getItem(storageKey);
            let restored = false;

            if (savedData) {
                try {
                    const parsed = JSON.parse(savedData);
                    if (parsed && typeof parsed === 'object') {
                        console.log('Restoring progress:', parsed);
                        setSelectedOptions(parsed.selectedOptions || {});
                        setCurrentStep(parsed.currentStep || 1);
                        // Optional: Restore drill-down state if saved? 
                        // For now, let's reset drill-down to let user re-orient unless we store it.
                        // But if they were in Step 1 drill-down, they might want to be back there.
                        // Let's keep it simple: Reset drill-down view to main list for Step 1.
                        setActiveCaseGroupId(null);
                        setSelectedCaseGroupId(null);
                        restored = true;
                    }
                } catch (e) {
                    console.error('Failed to parse saved progress', e);
                }
            }

            if (!restored) {
                // Default Reset
                setSelectedOptions({});
                setCurrentStep(1);
                setActiveCaseGroupId(null);
                setSelectedCaseGroupId(null);
            }

            // Timeout wrapper for IndexedDB operations
            const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number, fallback: T): Promise<T> => {
                return Promise.race([
                    promise,
                    new Promise<T>((resolve) =>
                        setTimeout(() => {
                            console.warn(`[SaveDesignModal] Operation timeout after ${timeoutMs}ms, using fallback`);
                            resolve(fallback);
                        }, timeoutMs)
                    )
                ]);
            };

            const fetchData = async () => {
                try {
                    console.log("[SaveDesignModal] fetchData started");

                    // Break Promise.all to debug potentially hanging promises
                    console.log("[SaveDesignModal] Loading Option Groups...");
                    const g = await loadOptionGroups();
                    console.log("[SaveDesignModal] Option Groups Loaded:", g.length);

                    console.log("[SaveDesignModal] Loading Items from IDB...");
                    const i = await withTimeout(
                        get(STORAGE_KEY_ITEMS).catch(err => {
                            console.error("Failed to load items from IDB", err);
                            return [];
                        }),
                        2000,
                        []
                    );
                    console.log("[SaveDesignModal] Items Loaded", Array.isArray(i) ? i.length : 0);

                    console.log("[SaveDesignModal] Loading Availability from IDB...");
                    const a = await withTimeout(
                        get(STORAGE_KEY_AVAILABILITY).catch(err => {
                            console.error("Failed to load availability from IDB", err);
                            return [];
                        }),
                        2000,
                        []
                    );
                    console.log("[SaveDesignModal] Availability Loaded", Array.isArray(a) ? a.length : 0);


                    // Filter groups by product's linked_option_groups
                    let filteredGroups = g;
                    if (productId) {
                        try {
                            const { data: product, error } = await supabase
                                .from('products')
                                .select('specs')
                                .eq('id', productId)
                                .single();

                            if (!error && product?.specs) {
                                const linkedGroups = (product.specs as any)?.linked_option_groups;
                                if (Array.isArray(linkedGroups) && linkedGroups.length > 0) {
                                    console.log('[SaveDesignModal] Filtering by linked_option_groups:', linkedGroups);
                                    filteredGroups = g.filter(group => linkedGroups.includes(group.id));
                                    console.log('[SaveDesignModal] Filtered groups count:', filteredGroups.length);
                                } else {
                                    console.log('[SaveDesignModal] No linked_option_groups found, showing all groups');
                                }
                            }
                        } catch (err) {
                            console.error('[SaveDesignModal] Failed to load product specs:', err);
                            // On error, show all groups (backward compatible)
                        }
                    }

                    setGroups(filteredGroups);

                    // Debug Log
                    console.log('=== Option Groups Debug ===');
                    console.log('Total Groups (before filter):', g.length);
                    console.log('Total Groups (after filter):', filteredGroups.length);
                    const distribution: Record<number, number> = {};
                    filteredGroups.forEach(grp => {
                        // @ts-ignore
                        const s = getStep(grp);
                        distribution[s] = (distribution[s] || 0) + 1;
                    });
                    console.log('Step Distribution:', distribution);
                    console.log('Filtered Groups:', filteredGroups);

                    // Merge hydrated items from groups into the main items list
                    // Because loadOptionGroups now might hydrate "self-items" into group.items
                    const hydratedItems = filteredGroups.reduce((acc: any[], grp: any) => {
                        if (grp.items && Array.isArray(grp.items)) {
                            return [...acc, ...grp.items];
                        }
                        return acc;
                    }, []);

                    const allItems = [...(Array.isArray(i) ? i : []), ...hydratedItems];

                    console.log("[wizard] groups step2 list", filteredGroups.filter(grp => {
                        // @ts-ignore
                        const s = getStep(grp);
                        return s === 2;
                    }).map(grp => ({
                        id: grp.id,
                        name: grp.name,
                        // @ts-ignore
                        stepIndex: getStep(grp),
                        // @ts-ignore
                        itemsLen: (grp.items?.length || 0) + (allItems.filter(it => it.parentId === grp.id).length)
                    })));

                    console.log("[wizard] groups step3 list", filteredGroups.filter(grp => {
                        // @ts-ignore
                        const s = getStep(grp);
                        return s === 3;
                    }).map(grp => ({
                        id: grp.id,
                        name: grp.name,
                        // @ts-ignore
                        stepIndex: getStep(grp),
                        // @ts-ignore
                        itemsLen: (grp.items?.length || 0) + (allItems.filter(it => it.parentId === grp.id).length)
                    })));

                    setItems(allItems);
                    setAvailability(Array.isArray(a) ? a : []);
                } catch (err) {
                    console.error("Failed to load options data", err);
                    setError("無法載入選項資料");
                } finally {
                    console.log("[SaveDesignModal] fetchData finished, setting loading=false");
                    setLoading(false);
                }
            };
            console.log("[SaveDesignModal] Calling fetchData");
            fetchData();
        } else {
            // When closed, reset loading to true for next open?
            // setLoading(true); // Optional
        }
    }, [isOpen, productId]);

    // Debug Loading State
    useEffect(() => {
        console.log("[SaveDesignModal] Loading State Changed:", loading);
    }, [loading]);

    // Persist State to LocalStorage
    useEffect(() => {
        if (isOpen) {
            const storageKey = `ppbears_checkout_progress_${productId || 'default'}`;
            const data = {
                selectedOptions,
                currentStep,
                timestamp: Date.now()
            };
            localStorage.setItem(storageKey, JSON.stringify(data));
        }
    }, [selectedOptions, currentStep, isOpen, productId]);

    // Core Logic: Filter Items
    const getFilteredItems = (groupId: string) => {
        // 1. Get items for this group
        let groupItems = items.filter(i => i.parentId === groupId);

        // 2. Filter by Whitelist Availability (Strict Mode)
        // Only apply if we have a productId
        if (productId) {
            // Check if ANY availability rules exist for this model
            // If NO rules exist for this model, we assume "Legacy/Open Mode" (Allow all that matched tags)
            // If ANY rule exists, we switch to "Strict Whitelist Mode"
            const hasRules = availability.some(a => a.modelId === productId);

            if (hasRules) {
                groupItems = groupItems.filter(item => {
                    const rule = availability.find(a => a.modelId === productId && a.optionItemId === item.id);
                    return rule && rule.isAvailable;
                });
            }
        }

        return groupItems;
    };

    // Auto-select first item for 'list' type groups if not already selected
    useEffect(() => {
        if (!loading && validGroups.length > 0) {
            setSelectedOptions(prev => {
                const next = { ...prev };
                let hasChanges = false;

                validGroups.forEach(group => {
                    const ui = getUI(group);
                    const displayType = normalizeDisplayType(ui.displayType || ui.display_type);

                    // IF it's a list, we pre-select the first available option
                    if (displayType === 'list') {
                        const groupKey = getGroupKey(group);
                        if (!next[groupKey]) {
                            const validItems = getFilteredItems(group.id);
                            if (validItems.length > 0) {
                                next[groupKey] = validItems[0].id;
                                hasChanges = true;
                            }
                        }
                    }
                });

                return hasChanges ? next : prev;
            });
        }
    }, [loading, validGroups, items, availability, productId]);

    if (!isOpen) return null;

    // Helper to get item details
    // const getItem = (id: string) => items.find(i => i.id === id); // Removed duplicate

    // Calculate Price
    // ✅ Pricing Mode: SPEC_ABSOLUTE (no basePrice)
    // Step1 = main product price source
    // Step2/3 = add-ons
    const calculateTotal = () => {
        // helper: find group by selection key
        const findGroupByKey = (key: string) => validGroups.find(g => getGroupKey(g) === key);

        let specBase = 0;   // Step1 main price
        let addons = 0;     // Step2/3 add-ons

        Object.entries(selectedOptions).forEach(([key, val]) => {
            // subAttributes: `${groupKey}:${attrId}` (Step 1) OR `${groupKey}:ca:${attrId}` (Step 2+)
            if (key.includes(':')) {
                const parts = key.split(':');
                // Handle Step 2+ Custom Attributes (groupKey:ca:attrId)
                const isCustomAttr = parts[1] === 'ca';
                const gKey = parts[0];
                const attrId = isCustomAttr ? parts[2] : parts[1];

                const group = findGroupByKey(gKey);
                if (!group?.subAttributes?.length) return;

                const attr = group.subAttributes.find(a => String(a.id) === String(attrId));
                const opt = attr?.options?.find(o => String(o.id) === String(val));
                if (!opt) return;

                const step = getStep(group);
                const delta = Number(opt.priceModifier) || 0;

                if (step === 1) specBase += delta;
                else addons += delta;
                return;
            }

            const group = findGroupByKey(key);
            if (!group) return;

            const step = getStep(group);
            const item = getItem(String(val));
            const itemPrice = Number(item?.priceModifier) || 0;
            const groupPrice = Number((group as any)?.priceModifier) || 0;
            const isSelf = String(val).includes('__self');

            if (step === 1) {
                // Step1: main price comes from selected item if it has price, 
                // otherwise fallback to group.priceModifier (for color items = 0 but group has price)
                specBase += isSelf ? itemPrice : (itemPrice > 0 ? itemPrice : groupPrice);
            } else {
                // Step2/3: add-on price
                addons += itemPrice;
                // If your data uses groupPrice as additional fixed fee (rare), keep it only when not __self
                if (!isSelf) addons += groupPrice;
            }
        });

        // ✅ No spec chosen => do not show price 
        const step1KeySet = new Set((stepGroups.get(1) || []).map(g => getGroupKey(g)));
        const hasChosenSpec = Object.keys(selectedOptions).some(k => step1KeySet.has(k));

        if (!hasChosenSpec) return 0;

        // Debug Price Breakdown
        console.log('[Pricing Breakdown]', {
            specBase,
            addons,
            finalTotal: specBase + addons
        });

        return specBase + addons;
    };

    const currentTotal = calculateTotal();

    // --- Section 9: Summary Logic ---
    const fmtDelta = (n: number | string) => {
        const num = Number(n) || 0;
        if (num > 0) return `+NT$ ${num}`;
        if (num < 0) return `-NT$ ${Math.abs(num)}`;
        return '包含';
    };

    const findGroupByKey = (key: string) => validGroups.find(g => getGroupKey(g) === key);

    // step1 的 groupKey 集合，用來判斷「規格」vs「加購」
    const step1KeySet = new Set((stepGroups.get(1) || []).map(g => getGroupKey(g)));

    // Check if any Step 1 spec is selected
    const hasChosenSpec = (stepGroups.get(1) || []).some(g => selectedOptions[getGroupKey(g)]);

    // 已選規格（Step1 + 其 subAttributes）
    const specLines: { label: string; delta: number }[] = [];
    // 加購明細（Step2/3）
    const addonLines: { label: string; delta: number }[] = [];

    console.log('[Summary Debug] Processing selectedOptions:', selectedOptions);

    Object.entries(selectedOptions).forEach(([key, val]) => {
        // subAttributes：key 會長得像 `${groupKey}:${attrId}` or `${groupKey}:ca:${attrId}`
        if (key.includes(':')) {
            const parts = key.split(':');
            const isCustomAttr = parts[1] === 'ca';
            const gKey = parts[0];
            const attrId = isCustomAttr ? parts[2] : parts[1];

            const group = findGroupByKey(gKey);
            if (!group?.subAttributes?.length) {
                console.log(`[Summary Debug] No group or subAttributes for key: ${key}`);
                return;
            }

            const attr = group.subAttributes.find(a => String(a.id) === String(attrId));
            if (!attr) {
                console.log(`[Summary Debug] No attr found for ${key}`);
                return;
            }

            // Handle text vs select types
            let displayLabel: string;
            let delta = 0;

            if (attr.type === 'text') {
                // Text input: use value directly
                displayLabel = `${attr.name}: ${val}`;
            } else {
                // Select: find option
                const opt = attr.options?.find(o => String(o.id) === String(val));
                if (!opt) {
                    console.log(`[Summary Debug] No opt found for ${key}:`, { attr: attr.name, val });
                    return;
                }
                displayLabel = `${attr.name}: ${opt.name}`;
                delta = Number(opt.priceModifier) || 0;
            }

            // subAttributes 視為規格的一部分
            const step = getStep(group);
            console.log(`[Summary Debug] SubAttribute ${key}: ${displayLabel} (Step ${step})`);

            if (step === 1) {
                specLines.push({
                    label: displayLabel,
                    delta
                });
            } else {
                // Step 2+ Custom Attributes
                addonLines.push({
                    label: `${group.name}: ${displayLabel}`,
                    delta
                });
            }
            return;
        }

        // 一般 item
        const group = findGroupByKey(key);
        const item = getItem(String(val));
        if (!group || !item) return;

        const step = getStep(group);
        const delta = Number(item.priceModifier) || 0;

        // Step1 規格（殼種/顏色等）
        if (step === 1 || step1KeySet.has(key)) {
            // 這裡不要顯示「group.name: item.name」避免出現「大惡魔殼: 大惡魔殼」
            specLines.push({ label: item.name, delta });
            return;
        }

        // Step2/3 加購
        addonLines.push({
            label: `${group.name}: ${item.name}`,
            delta
        });
    });

    console.log('[Summary Debug] Final specLines:', specLines);
    console.log('[Summary Debug] Final addonLines:', addonLines);

    const protectionId = selectedOptions['protection'];
    const protectionItem = getItem(protectionId || '');
    const showEmbossing = protectionItem && !protectionItem.name.includes('亮面');

    const handleSelectOption = (groupKey: string, itemId: string) => {
        setInlineError(null); // Clear errors when user makes a selection
        setSelectedOptions(prev => {
            let next = { ...prev };

            const group = validGroups.find(g => getGroupKey(g) === groupKey);
            const step = group ? getStep(group) : 1;
            const ui = getUI(group);
            const rawDisplayType =
                ui?.displayType ?? ui?.display_type ?? (group as any)?.displayType ?? (group as any)?.display_type;
            const displayType = normalizeDisplayType(rawDisplayType);

            const isStep1 = step === 1;
            const isSame = next[groupKey] === itemId;

            const clearSubAttributes = (gKey: string) => {
                Object.keys(next).forEach(k => {
                    if (k.startsWith(`${gKey}:`)) {
                        delete next[k];
                    }
                });
            };

            // Step1：維持「必選」+ 同層互斥
            if (isStep1) {
                (stepGroups.get(1) || []).forEach(g => {
                    const k = getGroupKey(g);
                    if (k !== groupKey) {
                        delete next[k];
                        clearSubAttributes(k);
                    }
                });
                next[groupKey] = itemId;
            } else {
                // ✅ Step2/3：允許「不選」→ 點同一個選項可取消
                if (isSame) {
                    delete next[groupKey];
                    clearSubAttributes(groupKey);
                } else {
                    next[groupKey] = itemId;
                }
            }

            // 亮面保護層 → 自動把燙金燙銀改成「無」：保留原邏輯
            if (groupKey === 'protection') {
                const item = getItem(itemId);
                if (item?.name.includes('亮面')) {
                    const embossGroup = validGroups.find(g => g.code === 'embossing');
                    if (embossGroup) {
                        const noneItem = items.find(i => i.parentId === embossGroup.id && i.name.includes('無'));
                        if (noneItem) {
                            next['embossing'] = noneItem.id;
                        }
                    }
                }
            }
            return next;
        });

        // Debug: Log if next button conditions are met
        // setTimeout(() => {
        //     console.log('[DEBUG] Selection Changed:', groupKey, itemId);
        // }, 100);

        // Ensure selectedCaseGroupId is set if we are in drill-down mode
        if (!selectedCaseGroupId && activeCaseGroupId) {
            setSelectedCaseGroupId(activeCaseGroupId);
        }
    };

    const handleAISpecRecognition = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsRecognizing(true);
        setInlineError(null);

        try {
            const recognized = await recognizeSpecsFromImage(file);
            const updatedOptions = mapRecognizedSpecs(recognized, groups, selectedOptions);

            // Identify which fields were updated
            const newMatched = new Set<string>();
            Object.keys(updatedOptions).forEach(key => {
                if (updatedOptions[key] !== selectedOptions[key]) {
                    newMatched.add(key);
                }
            });

            setSelectedOptions(updatedOptions);
            setMatchedFields(newMatched);

            // Clear highlight after 5 seconds
            setTimeout(() => setMatchedFields(new Set()), 5000);

            if (newMatched.size > 0) {
                alert(`AI 辨識成功！已自動為您填入 ${newMatched.size} 項規格。`);
            } else {
                alert('AI 辨識完成，但未發現相符的規格。請手動檢查。');
            }
        } catch (err) {
            console.error('[AI Recognition] Error:', err);
            setInlineError('AI 辨識失敗，請重試。');
        } finally {
            setIsRecognizing(false);
            if (aiFileInputRef.current) aiFileInputRef.current.value = '';
        }
    };

    // Reusable Custom Attributes Render (Step 2+)
    const renderCustomAttributes = (group: OptionGroup) => {
        if (!group?.subAttributes?.length) return null;
        const groupKey = getGroupKey(group);
        return (
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4 mt-4">
                <h4 className="font-bold text-gray-800 flex items-center gap-2">
                    <Settings className="w-4 h-4" /> 選項
                </h4>
                <div className="space-y-4">
                    {group.subAttributes.map(attr => {
                        // Check if any option has an image
                        const hasImages = attr.options?.some(opt => opt.image);

                        return (
                            <div key={attr.id} className="space-y-2">
                                <label className="text-sm font-bold text-gray-700">{attr.name}</label>
                                {attr.type === 'select' ? (
                                    hasImages ? (
                                        // Image Grid Selection
                                        <div className="grid grid-cols-3 gap-3">
                                            {attr.options?.map(opt => {
                                                const isSelected = selectedOptions[`${groupKey}:ca:${attr.id}`] === opt.id;
                                                return (
                                                    <button
                                                        key={opt.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setInlineError(null);
                                                            setSelectedOptions(prev => ({ ...prev, [`${groupKey}:ca:${attr.id}`]: opt.id }));
                                                        }}
                                                        className={`relative flex flex-col items-center p-2 rounded-xl border-2 transition-all ${isSelected
                                                            ? 'border-black bg-white shadow-sm'
                                                            : 'border-gray-100 bg-white hover:border-gray-200 hover:bg-gray-50'
                                                            }`}
                                                    >
                                                        {opt.image ? (
                                                            <div className="w-full aspect-square rounded-lg overflow-hidden bg-gray-100 mb-2">
                                                                <img src={opt.image} alt={opt.name} className="w-full h-full object-cover" />
                                                            </div>
                                                        ) : (
                                                            <div className="w-full aspect-square rounded-lg overflow-hidden bg-gray-100 mb-2 flex items-center justify-center text-gray-300">
                                                                <ImageIcon className="w-6 h-6" />
                                                            </div>
                                                        )}
                                                        <div className="text-center w-full">
                                                            <div className="text-xs font-bold text-gray-900 truncate w-full">{opt.name}</div>
                                                            {opt.priceModifier > 0 && (
                                                                <div className="text-[10px] text-gray-500">
                                                                    +${opt.priceModifier}
                                                                </div>
                                                            )}
                                                        </div>
                                                        {isSelected && (
                                                            <div className="absolute top-2 right-2 bg-black text-white rounded-full p-0.5">
                                                                <Check className="w-3 h-3" />
                                                            </div>
                                                        )}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        // Standard Select
                                        <select
                                            className="w-full p-2 border rounded-lg text-sm bg-white"
                                            value={selectedOptions[`${groupKey}:ca:${attr.id}`] || ''}
                                            onChange={(e) => {
                                                setInlineError(null);
                                                setSelectedOptions(prev => ({ ...prev, [`${groupKey}:ca:${attr.id}`]: e.target.value }));
                                            }}
                                        >
                                            <option value="">請選擇...</option>
                                            {attr.options?.map(opt => (
                                                <option key={opt.id} value={opt.id}>
                                                    {opt.name}{opt.priceModifier > 0 ? ` (+$${opt.priceModifier})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    )
                                ) : (
                                    <input
                                        className="w-full p-2 border rounded-lg text-sm bg-white"
                                        value={selectedOptions[`${groupKey}:ca:${attr.id}`] || ''}
                                        onChange={(e) => {
                                            setInlineError(null);
                                            setSelectedOptions(prev => ({ ...prev, [`${groupKey}:ca:${attr.id}`]: e.target.value }));
                                        }}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    if (!isOpen) return null;

    const currentStepGroups = stepGroups.get(currentStep) || [];

    // Reusable Advanced Options Render (Step 1 Drill-down)
    const renderAdvancedOptions = (group: OptionGroup) => {
        if (!group?.subAttributes?.length) return null;
        const groupKey = getGroupKey(group);
        return (
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-200 space-y-4">
                <div className="flex justify-between items-center">
                    <h4 className="font-bold text-gray-800 flex items-center gap-2">
                        <Settings className="w-4 h-4" /> 進階選項
                    </h4>
                    <div className="flex items-center gap-2">
                        <input
                            type="file"
                            accept="image/*"
                            ref={aiFileInputRef}
                            className="hidden"
                            onChange={handleAISpecRecognition}
                        />
                        <button
                            type="button"
                            onClick={() => aiFileInputRef.current?.click()}
                            disabled={isRecognizing}
                            className={`flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-purple-high to-indigo-600 text-white rounded-lg text-xs font-bold shadow-sm hover:opacity-90 transition-all ${isRecognizing ? 'opacity-50 cursor-not-allowed' : ''}`}
                            title="上傳官網截圖自動辨識規格"
                        >
                            {isRecognizing ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                                <Sparkles className="w-3.5 h-3.5" />
                            )}
                            {isRecognizing ? '辨識中...' : 'AI 辨識規格'}
                        </button>
                    </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {group.subAttributes.map(attr => {
                        const fieldKey = `${groupKey}:${attr.id}`;
                        const isMatched = matchedFields.has(fieldKey);
                        return (
                            <div key={attr.id} className="space-y-1">
                                <label className="text-sm font-bold text-gray-700 flex items-center justify-between">
                                    {attr.name}
                                    {isMatched && <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full animate-pulse">AI 辨識</span>}
                                </label>
                                {attr.type === 'select' ? (
                                    <select
                                        className={`w-full p-2 border rounded-lg text-sm bg-white transition-all duration-500 ${isMatched ? 'border-purple-500 ring-2 ring-purple-100' : ''}`}
                                        value={selectedOptions[fieldKey] || ''}
                                        onChange={(e) => {
                                            setMatchedFields(prev => {
                                                const next = new Set(prev);
                                                next.delete(fieldKey);
                                                return next;
                                            });
                                            setSelectedOptions(prev => ({ ...prev, [fieldKey]: e.target.value }));
                                        }}
                                    >
                                        <option value="">請選擇...</option>
                                        {attr.options?.map(opt => (
                                            <option key={opt.id} value={opt.id}>
                                                {opt.name}{opt.priceModifier > 0 ? ` (+$${opt.priceModifier})` : ''}
                                            </option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        className={`w-full p-2 border rounded-lg text-sm bg-white transition-all duration-500 ${isMatched ? 'border-purple-500 ring-2 ring-purple-100' : ''}`}
                                        value={selectedOptions[fieldKey] || ''}
                                        onChange={(e) => {
                                            setMatchedFields(prev => {
                                                const next = new Set(prev);
                                                next.delete(fieldKey);
                                                return next;
                                            });
                                            setSelectedOptions(prev => ({ ...prev, [fieldKey]: e.target.value }));
                                        }}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    };

    // Helper for Accordion Data
    const specList = [
        ...specLines.map(line => {
            const parts = line.label.split(':');
            if (parts.length > 1) return [parts[0].trim(), parts.slice(1).join(':').trim()];
            return ['規格', line.label];
        }),
        ...addonLines.map(line => {
            const parts = line.label.split(':');
            // Handle "Group Name: Attr Name: Option Name" (Custom Attributes in Addons)
            if (parts.length >= 3) {
                return [parts[1].trim(), parts.slice(2).join(':').trim()];
            }
            if (parts.length > 1) return [parts[0].trim(), parts.slice(1).join(':').trim()];
            return ['加購', line.label];
        })
    ];

    return createPortal(
        <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0,0,0,0.8)',
            zIndex: 99999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
        }}>
            <div className="bg-white relative z-[100000] flex flex-col md:flex-row overflow-hidden w-[100vw] h-[100dvh] rounded-none md:w-[min(1100px,92vw)] md:h-[min(760px,92vh)] md:rounded-2xl p-0">
                <button
                    onClick={onClose}
                    className="absolute top-3 right-3 z-[100001] p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
                >
                    <X className="w-5 h-5 text-gray-600" />
                </button>

                {loading ? (
                    <div className="w-full h-full flex items-center justify-center flex-col gap-4">
                        <Loader2 className="w-10 h-10 animate-spin text-blue-600" />
                        <p className="text-gray-500">載入商品選項中...</p>
                    </div>
                ) : error ? (
                    <div className="w-full h-full flex items-center justify-center flex-col gap-4">
                        <AlertCircle className="w-10 h-10 text-red-500" />
                        <p className="text-red-500 font-bold">{error}</p>
                        <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">關閉</button>
                    </div>
                ) : (
                    <div className="h-full w-full min-h-0 flex flex-col md:grid md:grid-cols-[360px_1fr] md:grid-rows-[minmax(0,1fr)]">
                        {/* Left: Preview & Summary */}
                        <div className="md:border-r border-b md:border-b-0 border-gray-200 md:p-6 p-4 bg-gray-50 flex flex-col min-h-0 h-auto shrink-0 md:h-full">
                            <div className="p-4 flex items-start md:items-center justify-center bg-gray-100/50 shrink-0 h-28 md:h-1/3 rounded-xl overflow-hidden">
                                <img src={previewImage} alt="Preview" className="max-w-full max-h-full object-contain" />
                            </div>

                            {/* Summary - Hidden on Mobile, Visible on Desktop */}
                            <div className="hidden md:flex flex-1 pt-6 flex-col min-h-0 overflow-hidden">
                                <h3 className="font-bold text-gray-900 text-lg mb-1 shrink-0">{productName}</h3>

                                {!hasChosenSpec ? (
                                    <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
                                        請先選擇產品規格
                                    </div>
                                ) : (
                                    <>
                                        <div className="space-y-3 mb-4 text-sm flex-1 overflow-y-auto pr-2 custom-scrollbar">
                                            {/* 已選規格（Step1） */}
                                            {specLines.length > 0 && (
                                                <div>
                                                    <div className="text-xs font-semibold text-gray-500 mb-2">已選規格</div>
                                                    <div className="space-y-1">
                                                        {specLines.map((l, idx) => (
                                                            <div key={`spec-${idx}`} className="flex justify-between text-gray-600">
                                                                <span>{l.label}</span>
                                                                <span>{fmtDelta(l.delta)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}

                                            {/* 加購明細（Step2/3） */}
                                            <div>
                                                <div className="text-xs font-semibold text-gray-500 mb-2">加購明細</div>
                                                {addonLines.length === 0 ? (
                                                    <div className="text-gray-400 italic">尚未加購任何項目</div>
                                                ) : (
                                                    <div className="space-y-1">
                                                        {addonLines.map((l, idx) => (
                                                            <div key={`addon-${idx}`} className="flex justify-between text-gray-600">
                                                                <span>{l.label}</span>
                                                                <span>{fmtDelta(l.delta)}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-end pt-4 border-t border-gray-200 shrink-0">
                                            <span className="text-gray-500 font-medium">總金額</span>
                                            <span className="text-2xl font-bold text-blue-600">NT$ {currentTotal}</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Right: Steps */}
                        <div className="md:h-full flex-1 min-h-0 flex flex-col relative bg-white overflow-hidden">
                            {/* Dynamic Stepper */}
                            <div className="shrink-0 flex items-center justify-between p-4 md:p-6 border-b border-gray-100 bg-white">
                                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide max-w-full">
                                    {availableSteps.map((stepNum, idx) => {
                                        // Use index + 1 for display number, or use stepNum directly?
                                        // The user wants dynamic steps. If steps are [1, 6], showing "1" then "6" is honest but maybe confusing.
                                        // Let's show them as "1", "2" ... using index+1.
                                        const displayNum = idx + 1;

                                        return (
                                            <React.Fragment key={stepNum}>
                                                <button
                                                    type="button"
                                                    onClick={() => setCurrentStep(stepNum)}
                                                    disabled={stepNum > currentStep && !hasChosenSpec} // Allow navigation if spec is chosen? Or enforce sequence?
                                                    // Current logic: disabled={stepNum > currentStep} which forces sequential.
                                                    // But user wants "Direct Checkout". If spec is chosen, maybe allow jumping?
                                                    // For now, let's keep it sequential but allow jumping back.
                                                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 transition-colors ${currentStep === stepNum
                                                        ? 'bg-black text-white'
                                                        : (stepNum < currentStep || hasChosenSpec) // Allow jump if visited OR if main spec selected
                                                            ? 'bg-gray-800 text-white cursor-pointer'
                                                            : 'bg-gray-100 text-gray-400'
                                                        }`}
                                                >
                                                    {displayNum}
                                                </button>
                                                {idx < availableSteps.length - 1 && (
                                                    <div className={`h-1 w-4 sm:w-8 shrink-0 ${availableSteps[idx + 1] <= currentStep || (hasChosenSpec && currentStep >= stepNum) // Logic for bar coloring
                                                        ? 'bg-gray-800'
                                                        : 'bg-gray-200'
                                                        }`}></div>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-8">
                                {/* Step 3: Product Specs Accordion - REMOVED (Redundant) */}


                                {currentStepGroups.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-4">
                                        <AlertCircle className="w-12 h-12 opacity-20" />
                                        <p>此步驟尚無可用的選項</p>
                                        <div className="text-xs text-gray-300 max-w-xs text-center bg-gray-900/5 p-2 rounded">
                                            <span className="font-bold">Debug Info:</span><br />
                                            Step: {currentStep} (Groups: {stepGroups.get(currentStep)?.length || 0})<br />
                                            Valid Groups: {validGroups.length} / Total: {groups.length}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setCurrentStep(prev => Math.min(prev + 1, maxStep))}
                                            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm text-gray-600"
                                        >
                                            跳過此步驟
                                        </button>
                                    </div>
                                ) : (
                                    /* Existing Content Logic */
                                    <>
                                        {/* Step 1 Specific: Case Type Drill Down Logic */}
                                        {currentStep === 1 && activeCaseGroupId ? (
                                            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <button type="button" onClick={() => setActiveCaseGroupId(null)} className="p-1 hover:bg-gray-100 rounded-full transition-colors">
                                                        <ChevronRight className="w-5 h-5 rotate-180 text-gray-500" />
                                                    </button>
                                                    <h2 className="text-2xl font-bold text-gray-900">
                                                        選擇{currentStepGroups.find(g => g.id === activeCaseGroupId)?.name}顏色
                                                    </h2>
                                                </div>

                                                {/* Step 1 Drill-down Description Images */}
                                                {(() => {
                                                    const group = currentStepGroups.find(g => g.id === activeCaseGroupId);
                                                    if (!group) return null;

                                                    const ui = getUI(group);
                                                    const descriptionImages = ui?.descriptionImages || (ui?.descriptionImage ? [ui.descriptionImage] : []);

                                                    if (!descriptionImages || descriptionImages.length === 0) return null;

                                                    return (
                                                        <>
                                                            <div className={`mb-4 grid gap-2 ${descriptionImages.length > 1 ? 'grid-cols-4' : 'grid-cols-2'}`}>
                                                                {descriptionImages.map((img: string, idx: number) => (
                                                                    <div key={idx} className="relative group cursor-pointer" onClick={() => setZoomedImage(img)}>
                                                                        <img
                                                                            src={img}
                                                                            className="w-full h-24 object-cover rounded-xl border border-gray-200 transition-transform group-hover:scale-105"
                                                                            alt={`${group.name} 說明圖片 ${idx + 1}`}
                                                                        />
                                                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-xl transition-colors flex items-center justify-center">
                                                                            <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-md" />
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                            {ui?.description && (
                                                                <div
                                                                    className="mb-6 text-xs text-gray-400 prose prose-xs max-w-none [&>p]:mb-1 [&>a]:text-blue-500 [&>a]:underline"
                                                                    dangerouslySetInnerHTML={{
                                                                        __html: DOMPurify.sanitize(
                                                                            ui.description
                                                                                .replace(/&amp;/g, '&')
                                                                                .replace(/&lt;/g, '<')
                                                                                .replace(/&gt;/g, '>')
                                                                                .replace(/&quot;/g, '"'),
                                                                            { ADD_ATTR: ['target', 'style'] }
                                                                        )
                                                                    }}
                                                                />
                                                            )}
                                                        </>
                                                    );
                                                })()}

                                                {/* Color Grid */}
                                                <div className="grid grid-cols-2 gap-4">
                                                    {(() => {
                                                        const group = currentStepGroups.find(g => g.id === activeCaseGroupId);
                                                        if (!group) return null;
                                                        const groupKey = getGroupKey(group);
                                                        const validItems = getFilteredItems(group.id);
                                                        return validItems.map(item => (
                                                            <button
                                                                type="button"
                                                                key={item.id}
                                                                onClick={() => handleSelectOption(groupKey, item.id)}
                                                                className={`relative p-4 rounded-xl border-2 text-left transition-all group hover:shadow-md ${selectedOptions[groupKey] === item.id ? 'border-black bg-gray-50' : 'border-gray-100 hover:border-gray-300'}`}
                                                            >
                                                                <div className="flex gap-4">
                                                                    <div className="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                                                                        {item.imageUrl ? <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" /> : <div className="w-full h-full" style={{ backgroundColor: item.colorHex || '#ddd' }} />}
                                                                    </div>
                                                                    <div className="flex-1">
                                                                        <div className="flex justify-between items-start">
                                                                            <h3 className="font-bold text-gray-900">{item.name}</h3>
                                                                            {selectedOptions[groupKey] === item.id && <div className="bg-black text-white rounded-full p-1"><Check className="w-3 h-3" /></div>}
                                                                        </div>
                                                                        <div className="mt-3 font-medium text-blue-600">{item.priceModifier > 0 ? `NT$ ${item.priceModifier}` : '標準方案'}</div>
                                                                    </div>
                                                                </div>
                                                            </button>
                                                        ));
                                                    })()}
                                                </div>

                                                {/* Custom Attributes */}
                                                {(() => {
                                                    const group = currentStepGroups.find(g => g.id === activeCaseGroupId);
                                                    if (!group?.subAttributes?.length) return null;
                                                    return renderAdvancedOptions(group);
                                                })()}
                                            </div>
                                        ) : (
                                            <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                                                <h2 className="text-2xl font-bold text-gray-900 mb-6">
                                                    {currentStep === 1 ? '選擇產品規格' : `步驟 ${currentStep}: 客製化選項`}
                                                </h2>

                                                {/* Dynamic Groups Rendering */}
                                                {currentStepGroups.map(group => {
                                                    // Embossing Logic check
                                                    if (group.code === 'embossing' && !showEmbossing) return null;

                                                    const ui = getUI(group);
                                                    const groupKey = getGroupKey(group);

                                                    let displayType = normalizeDisplayType(ui.displayType || ui.display_type) || (currentStep === 1 ? 'cards' : 'grid');
                                                    if (currentStep !== 1 && (displayType === ('cards' as any) || displayType === ('grid' as any))) {
                                                        // Ensure displayType is correctly typed for subsequent checks
                                                    }

                                                    // Determine items (before filtering) to check if we have items at all
                                                    const rawGroupItems = items.filter(i => i.parentId === group.id);
                                                    const validItems = getFilteredItems(group.id);

                                                    // Render Card (Step 1 Style)
                                                    if (currentStep === 1 && displayType === 'cards') {
                                                        return (
                                                            <div key={group.id} className="mb-4">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        // 1. Set Active Group for Drill Down
                                                                        setActiveCaseGroupId(group.id);
                                                                        setSelectedCaseGroupId(group.id); // ✅ Persist selection for Step 2+ Advanced Options

                                                                        // 2. Auto-Preselect First Valid Item (if not already selected)
                                                                        // This ensures the drill-down view is not empty/unselected by default
                                                                        if (!selectedOptions[groupKey] && validItems.length > 0) {
                                                                            handleSelectOption(groupKey, validItems[0].id);
                                                                        }
                                                                    }}
                                                                    className="w-full p-4 rounded-xl border-2 border-gray-100 hover:border-black hover:bg-gray-50 transition-all text-left group flex items-center justify-between"
                                                                >
                                                                    <div className="flex items-center gap-4">
                                                                        {group.thumbnail && (
                                                                            <div className="w-16 h-16 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                                                                                <img src={group.thumbnail} alt={group.name} className="w-full h-full object-cover" />
                                                                            </div>
                                                                        )}
                                                                        <div>
                                                                            <h3 className="font-bold text-gray-900 text-lg">{group.name}</h3>
                                                                            <p className="text-sm text-gray-500">{group.priceModifier > 0 ? `方案價格 NT$ ${group.priceModifier}` : '標準方案'}</p>
                                                                        </div>
                                                                    </div>
                                                                    <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-black" />
                                                                </button>
                                                            </div>
                                                        );
                                                    }

                                                    // Render Description Images (Step 2+)
                                                    const descriptionImages = ui?.descriptionImages || (ui?.descriptionImage ? [ui.descriptionImage] : []);
                                                    // Removed useState from loop: const [zoomedDescImage, setZoomedDescImage] = useState<string | null>(null);

                                                    if (displayType === 'cards' && currentStep !== 1) {
                                                        return (
                                                            <div key={group.id} className="mb-8">
                                                                <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{group.name}</h3>

                                                                {validItems.length > 0 ? (
                                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                        {validItems.map(item => (
                                                                            <button
                                                                                type="button"
                                                                                key={item.id}
                                                                                onClick={() => handleSelectOption(groupKey, item.id)}
                                                                                className={`relative p-4 rounded-xl border-2 text-left transition-all hover:shadow-md ${selectedOptions[groupKey] === item.id ? 'border-black bg-gray-50' : 'border-gray-100 hover:border-gray-300'
                                                                                    }`}
                                                                            >
                                                                                <div className="flex gap-4 items-center">
                                                                                    {/* Checkbox UI */}
                                                                                    <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${selectedOptions[groupKey] === item.id
                                                                                        ? 'bg-black border-black'
                                                                                        : 'border-gray-300 bg-white'
                                                                                        }`}>
                                                                                        {selectedOptions[groupKey] === item.id && <Check className="w-4 h-4 text-white" />}
                                                                                    </div>

                                                                                    <div className="w-16 h-16 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0 flex items-center justify-center">
                                                                                        {item.imageUrl ? (
                                                                                            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
                                                                                        ) : group.thumbnail ? (
                                                                                            <img src={group.thumbnail} alt={group.name} className="w-full h-full object-cover" />
                                                                                        ) : (
                                                                                            <div className="w-full h-full" />
                                                                                        )}
                                                                                    </div>
                                                                                    <div className="flex-1">
                                                                                        <div className="flex justify-between items-start">
                                                                                            <h4 className="font-bold text-gray-900">{item.name}</h4>
                                                                                        </div>
                                                                                        <div className="mt-1 font-medium text-blue-600">
                                                                                            {item.priceModifier > 0 ? `+NT$ ${item.priceModifier}` : '不加價'}
                                                                                        </div>
                                                                                        {selectedOptions[groupKey] === item.id && (
                                                                                            <div className="mt-1 text-xs text-gray-400">再點一次可取消</div>
                                                                                        )}
                                                                                    </div>
                                                                                </div>
                                                                            </button>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div className="p-4 border border-dashed border-gray-300 rounded-lg text-center text-gray-400 text-sm">
                                                                        尚無選項 (請至後台新增子項目)
                                                                    </div>
                                                                )}

                                                                {/* Description Images */}
                                                                {descriptionImages.length > 0 && (
                                                                    <div className={`mt-4 mb-4 grid gap-2 ${descriptionImages.length > 1 ? 'grid-cols-4' : 'grid-cols-2'}`}>
                                                                        {descriptionImages.map((img: string, idx: number) => (
                                                                            <div key={idx} className="relative group cursor-pointer" onClick={() => setZoomedImage(img)}>
                                                                                <img
                                                                                    src={img}
                                                                                    className="w-full h-24 object-cover rounded-xl border border-gray-200 transition-transform group-hover:scale-105"
                                                                                    alt={`${group.name} 說明圖片 ${idx + 1}`}
                                                                                />
                                                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-xl transition-colors flex items-center justify-center">
                                                                                    <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-md" />
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {/* Lightbox moved to global scope */}

                                                                {ui?.description && (
                                                                    <div
                                                                        className="mt-3 text-xs text-gray-400 mb-2 prose prose-xs max-w-none [&>p]:mb-1 [&>a]:text-blue-500 [&>a]:underline"
                                                                        dangerouslySetInnerHTML={{
                                                                            __html: DOMPurify.sanitize(
                                                                                ui.description
                                                                                    .replace(/&amp;/g, '&')
                                                                                    .replace(/&lt;/g, '<')
                                                                                    .replace(/&gt;/g, '>')
                                                                                    .replace(/&quot;/g, '"'),
                                                                                { ADD_ATTR: ['target', 'style'] }
                                                                            )
                                                                        }}
                                                                    />
                                                                )}

                                                                {/* Custom Attributes (Step 2+) - Only show if group is selected */}
                                                                {selectedOptions[groupKey] && group.subAttributes && group.subAttributes.length > 0 && (
                                                                    <div className="mt-4 rounded-xl border border-gray-200 bg-white overflow-hidden animate-in slide-in-from-top-2">
                                                                        <div className="p-4">
                                                                            {renderCustomAttributes(group)}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    }

                                                    // Render Checkbox (New Feature)
                                                    if (displayType === 'checkbox') {
                                                        return (
                                                            <div key={group.id} className="mb-6 bg-white border border-gray-200 rounded-xl p-4">
                                                                {/* Removed redundant group.name heading for checkbox type */}

                                                                {validItems.length > 0 ? (
                                                                    <div className="space-y-3 mb-6">
                                                                        {validItems.map(item => (
                                                                            <label key={item.id} className="flex items-center p-4 border-2 rounded-xl cursor-pointer transition-all hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100">
                                                                                <input
                                                                                    type="checkbox"
                                                                                    name={groupKey}
                                                                                    checked={selectedOptions[groupKey] === item.id}
                                                                                    onChange={() => handleSelectOption(groupKey, item.id)}
                                                                                    className="w-5 h-5 text-black border-gray-300 focus:ring-black rounded"
                                                                                />
                                                                                <span className="ml-3 font-bold text-gray-800 text-base">{item.name}</span>
                                                                                {item.priceModifier > 0 && <span className="ml-auto text-sm font-semibold text-blue-600 bg-blue-50 px-2 py-1 rounded">+${item.priceModifier}</span>}
                                                                            </label>
                                                                        ))}
                                                                    </div>
                                                                ) : (
                                                                    <div className="text-center text-gray-400 text-sm py-4 mb-4">
                                                                        {rawGroupItems.length > 0 ? (
                                                                            <div className="flex flex-col items-center gap-2">
                                                                                <span className="text-red-400 font-medium">此機型不適用</span>
                                                                                <span className="text-xs opacity-70">(無可用選項)</span>
                                                                            </div>
                                                                        ) : (
                                                                            <span className="italic">此區域尚無選項 (請至後台新增子項目)</span>
                                                                        )}
                                                                    </div>
                                                                )}

                                                                {/* Description Images */}
                                                                {descriptionImages.length > 0 && (
                                                                    <div className={`mb-4 grid gap-2 ${descriptionImages.length > 1 ? 'grid-cols-4' : 'grid-cols-2'}`}>
                                                                        {descriptionImages.map((img: string, idx: number) => (
                                                                            <div key={idx} className="relative group cursor-pointer" onClick={() => setZoomedImage(img)}>
                                                                                <img
                                                                                    src={img}
                                                                                    className="w-full h-24 object-cover rounded-xl border border-gray-200 transition-transform group-hover:scale-105"
                                                                                    alt={`${group.name} 說明圖片 ${idx + 1}`}
                                                                                />
                                                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-xl transition-colors flex items-center justify-center">
                                                                                    <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-md" />
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                {ui?.description && (
                                                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-4">
                                                                        <div className="text-sm text-gray-600 leading-relaxed mb-3">
                                                                            <span className="font-semibold text-gray-800 block mb-1">說明：</span>
                                                                            <div
                                                                                dangerouslySetInnerHTML={{
                                                                                    __html: DOMPurify.sanitize(
                                                                                        // Robust fix: Ensure unescaped HTML before sanitizing
                                                                                        // Must replace &amp; first to handle double escaping (e.g. &amp;lt;)
                                                                                        ui.description
                                                                                            .replace(/&amp;/g, '&')
                                                                                            .replace(/&lt;/g, '<')
                                                                                            .replace(/&gt;/g, '>')
                                                                                            .replace(/&quot;/g, '"'),
                                                                                        { ADD_ATTR: ['target', 'style'] }
                                                                                    )
                                                                                }}
                                                                                className="prose prose-sm max-w-none [&>a]:text-blue-600 [&>a]:underline [&>a]:hover:text-blue-800"
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                )}

                                                                {/* Custom Attributes (Step 2+) */}
                                                                {group.subAttributes && group.subAttributes.length > 0 && (
                                                                    <div className="mt-4 rounded-xl border border-gray-200 bg-white overflow-hidden">
                                                                        <div className="p-4">
                                                                            {renderCustomAttributes(group)}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    }

                                                    // Render AI Recognition (New Feature)
                                                    if (displayType === 'ai_recognition') {
                                                        return (
                                                            <div key={group.id} className="mb-6 bg-white border-2 border-dashed border-purple-200 rounded-2xl p-6 text-center">
                                                                <h3 className="text-lg font-bold text-gray-900 mb-2">{group.name}</h3>

                                                                {ui?.description && (
                                                                    <div
                                                                        className="mb-6 text-sm text-gray-500 prose prose-sm max-w-none [&>p]:mb-1"
                                                                        dangerouslySetInnerHTML={{
                                                                            __html: DOMPurify.sanitize(
                                                                                ui.description
                                                                                    .replace(/&amp;/g, '&')
                                                                                    .replace(/&lt;/g, '<')
                                                                                    .replace(/&gt;/g, '>')
                                                                                    .replace(/&quot;/g, '"'),
                                                                                { ADD_ATTR: ['target', 'style'] }
                                                                            )
                                                                        }}
                                                                    />
                                                                )}

                                                                {/* Description Images (Instructional Screenshots) */}
                                                                {descriptionImages.length > 0 && (
                                                                    <div className={`mb-6 grid gap-3 max-w-lg mx-auto ${descriptionImages.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                                                        {descriptionImages.map((img: string, idx: number) => (
                                                                            <div key={idx} className="relative group cursor-pointer" onClick={() => setZoomedImage(img)}>
                                                                                <img
                                                                                    src={img}
                                                                                    className="w-full aspect-[4/3] object-cover rounded-xl border border-gray-100 shadow-sm transition-transform group-hover:scale-[1.02]"
                                                                                    alt={`${group.name} 範例圖片 ${idx + 1}`}
                                                                                />
                                                                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-xl transition-colors flex items-center justify-center">
                                                                                    <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-md" />
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}

                                                                <div className="max-w-md mx-auto">
                                                                    <input
                                                                        type="file"
                                                                        accept="image/*"
                                                                        ref={aiFileInputRef}
                                                                        className="hidden"
                                                                        onChange={handleAISpecRecognition}
                                                                    />
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => aiFileInputRef.current?.click()}
                                                                        disabled={isRecognizing}
                                                                        className={`w-full py-4 px-6 bg-gradient-to-r from-purple-high to-indigo-600 text-white rounded-2xl font-bold shadow-lg shadow-purple-100 hover:shadow-purple-200 transition-all flex items-center justify-center gap-3 ${isRecognizing ? 'opacity-70 cursor-not-allowed' : 'hover:-translate-y-1'}`}
                                                                    >
                                                                        {isRecognizing ? (
                                                                            <Loader2 className="w-6 h-6 animate-spin" />
                                                                        ) : (
                                                                            <Sparkles className="w-6 h-6" />
                                                                        )}
                                                                        <span className="text-lg">{isRecognizing ? '正在辨識規格...' : '上傳截圖辨識規格'}</span>
                                                                    </button>
                                                                    <p className="mt-4 text-xs text-gray-400">
                                                                        請上傳包含產品完整規格的官網截圖<br />
                                                                        AI 將自動為您填入所有選項
                                                                    </p>
                                                                </div>

                                                                {/* Custom Attributes rendered below if group is "active" or needed */}
                                                                {group.subAttributes && group.subAttributes.length > 0 && (
                                                                    <div className="mt-8 text-left border-t border-gray-100 pt-6">
                                                                        <h4 className="text-sm font-bold text-gray-700 mb-4 flex items-center gap-2">
                                                                            <Settings className="w-4 h-4" /> 您也可以手動調整：
                                                                        </h4>
                                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                                            {group.subAttributes.map(attr => {
                                                                                const fieldKey = `${groupKey}:${attr.id}`;
                                                                                const isMatched = matchedFields.has(fieldKey);
                                                                                return (
                                                                                    <div key={attr.id} className="space-y-1">
                                                                                        <label className="text-xs font-bold text-gray-500 flex items-center justify-between">
                                                                                            {attr.name}
                                                                                            {isMatched && <span className="text-[10px] text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded-full animate-pulse">AI 辨識</span>}
                                                                                        </label>
                                                                                        {attr.type === 'select' ? (
                                                                                            <select
                                                                                                className={`w-full p-2 border rounded-lg text-sm bg-white transition-all duration-500 ${isMatched ? 'border-purple-500 ring-1 ring-purple-100' : 'border-gray-200'}`}
                                                                                                value={selectedOptions[fieldKey] || ''}
                                                                                                onChange={(e) => {
                                                                                                    setMatchedFields(prev => {
                                                                                                        const next = new Set(prev);
                                                                                                        next.delete(fieldKey);
                                                                                                        return next;
                                                                                                    });
                                                                                                    setSelectedOptions(prev => ({ ...prev, [fieldKey]: e.target.value }));
                                                                                                }}
                                                                                            >
                                                                                                <option value="">請選擇...</option>
                                                                                                {attr.options?.map(opt => (
                                                                                                    <option key={opt.id} value={opt.id}>
                                                                                                        {opt.name}{opt.priceModifier > 0 ? ` (+$${opt.priceModifier})` : ''}
                                                                                                    </option>
                                                                                                ))}
                                                                                            </select>
                                                                                        ) : (
                                                                                            <input
                                                                                                className={`w-full p-2 border rounded-lg text-sm bg-white transition-all duration-500 ${isMatched ? 'border-purple-500 ring-1 ring-purple-100' : 'border-gray-200'}`}
                                                                                                value={selectedOptions[fieldKey] || ''}
                                                                                                onChange={(e) => {
                                                                                                    setMatchedFields(prev => {
                                                                                                        const next = new Set(prev);
                                                                                                        next.delete(fieldKey);
                                                                                                        return next;
                                                                                                    });
                                                                                                    setSelectedOptions(prev => ({ ...prev, [fieldKey]: e.target.value }));
                                                                                                }}
                                                                                            />
                                                                                        )}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    }

                                                    // Default: Grid / List (Standard Buttons)
                                                    return (
                                                        <div key={group.id} className="mb-8">
                                                            <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">{group.name}</h3>

                                                            {validItems.length > 0 ? (
                                                                <div className={`grid gap-3 ${group.code === 'lanyard' || displayType === 'list' || displayType === 'ai_recognition' ? 'grid-cols-1' : 'grid-cols-3'}`}>
                                                                    {validItems.map(item => (
                                                                        <button
                                                                            type="button"
                                                                            key={item.id}
                                                                            onClick={() => handleSelectOption(groupKey, item.id)}
                                                                            className={`${(group.code === 'lanyard' || displayType === 'list') ? 'w-full flex items-center justify-between px-4 py-3' : 'px-4 py-3 text-center flex flex-col items-center justify-center'} rounded-lg border transition-all ${selectedOptions[groupKey] === item.id ? 'border-black bg-black text-white shadow-md' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}
                                                                        >
                                                                            <span className="font-medium text-sm">{item.name}</span>
                                                                            {item.priceModifier > 0 && <span className={`text-xs opacity-70 ${(group.code === 'lanyard' || displayType === 'list') ? 'ml-2' : 'mt-1'}`}>+${item.priceModifier}</span>}
                                                                        </button>
                                                                    ))}
                                                                </div>
                                                            ) : (
                                                                <div className="p-4 border border-dashed border-gray-300 rounded-lg text-center text-gray-400 text-sm">
                                                                    {rawGroupItems.length > 0 ? (
                                                                        <div className="flex flex-col items-center gap-1">
                                                                            <span className="text-red-400 font-medium">此機型不適用</span>
                                                                            <span className="text-xs opacity-70">(無可用選項)</span>
                                                                        </div>
                                                                    ) : (
                                                                        <span>尚無選項 (請至後台新增子項目)</span>
                                                                    )}
                                                                </div>
                                                            )}

                                                            {/* Description Images */}
                                                            {descriptionImages.length > 0 && (
                                                                <div className={`mt-4 mb-4 grid gap-2 ${descriptionImages.length > 1 ? 'grid-cols-4' : 'grid-cols-2'}`}>
                                                                    {descriptionImages.map((img: string, idx: number) => (
                                                                        <div key={idx} className="relative group cursor-pointer" onClick={() => setZoomedImage(img)}>
                                                                            <img
                                                                                src={img}
                                                                                className="w-full h-24 object-cover rounded-xl border border-gray-200 transition-transform group-hover:scale-105"
                                                                                alt={`${group.name} 說明圖片 ${idx + 1}`}
                                                                            />
                                                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 rounded-xl transition-colors flex items-center justify-center">
                                                                                <ZoomIn className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 drop-shadow-md" />
                                                                            </div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}

                                                            {ui?.description && (
                                                                <>
                                                                    <div
                                                                        className="mt-3 text-xs text-gray-400 mb-2 prose prose-xs max-w-none [&>p]:mb-1 [&>a]:text-blue-500 [&>a]:underline"
                                                                        dangerouslySetInnerHTML={{
                                                                            __html: DOMPurify.sanitize(
                                                                                ui.description
                                                                                    .replace(/&amp;/g, '&')
                                                                                    .replace(/&lt;/g, '<')
                                                                                    .replace(/&gt;/g, '>')
                                                                                    .replace(/&quot;/g, '"'),
                                                                                { ADD_ATTR: ['target', 'style'] }
                                                                            )
                                                                        }}
                                                                    />
                                                                </>
                                                            )}

                                                            {/* Custom Attributes (Step 2+) */}
                                                            {group.subAttributes && group.subAttributes.length > 0 && (
                                                                <div className="mt-4 rounded-xl border border-gray-200 bg-white overflow-hidden">
                                                                    <div className="p-4">
                                                                        {renderCustomAttributes(group)}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </>
                                )}

                                {/* Mobile bottom summary (md:hidden) - Moved to scrollable content per user request */}
                                <div className="md:hidden mt-6 mb-2">
                                    <details className="group rounded-lg border border-gray-200 bg-gray-50/50 overflow-hidden">
                                        <summary className="flex cursor-pointer items-center justify-between px-3 py-2 select-none hover:bg-gray-100 transition-colors">
                                            <span className="text-sm font-bold text-gray-700">已選規格與明細</span>
                                            <ChevronRight className="w-4 h-4 rotate-90 text-gray-400 transition-transform group-open:rotate-[270deg]" />
                                        </summary>
                                        {!hasChosenSpec ? (
                                            <div className="px-3 py-2 text-xs text-gray-400">請先選擇產品規格</div>
                                        ) : (
                                            <div className="px-3 pb-3 pt-0 space-y-2 text-sm">
                                                <div className="font-semibold text-gray-900 pt-2 border-t border-gray-100">{productName}</div>
                                                {specLines.length > 0 && (
                                                    <div>
                                                        <div className="text-xs font-semibold text-gray-500 mb-1">已選規格</div>
                                                        <div className="space-y-1">
                                                            {specLines.map((l, idx) => (
                                                                <div key={`m-spec-${idx}`} className="flex justify-between text-gray-600 text-xs">
                                                                    <span>{l.label}</span>
                                                                    <span>{fmtDelta(l.delta)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                                <div>
                                                    <div className="text-xs font-semibold text-gray-500 mb-1">加購明細</div>
                                                    {addonLines.length === 0 ? (
                                                        <div className="text-xs text-gray-400 italic">無</div>
                                                    ) : (
                                                        <div className="space-y-1">
                                                            {addonLines.map((l, idx) => (
                                                                <div key={`m-addon-${idx}`} className="flex justify-between text-gray-600 text-xs">
                                                                    <span>{l.label}</span>
                                                                    <span>{fmtDelta(l.delta)}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex justify-between items-center pt-2 border-t border-gray-200 mt-2">
                                                    <span className="text-xs font-bold text-gray-500">總金額</span>
                                                    <span className="text-sm font-bold text-blue-600">NT$ {currentTotal}</span>
                                                </div>
                                            </div>
                                        )}
                                    </details>
                                </div>
                            </div>

                            {/* Navigation */}
                            <div className="relative shrink-0 border-t border-gray-100 bg-white md:bg-gray-50 px-4 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] md:shadow-none">
                                <div className="flex gap-3 md:justify-between items-center relative">
                                    {/* Previous Button: Find previous available step */}
                                    {(() => {
                                        const currentIndex = availableSteps.indexOf(currentStep);
                                        return currentIndex > 0 ? (
                                            <button
                                                type="button"
                                                onClick={() => setCurrentStep(availableSteps[currentIndex - 1])}
                                                className="px-4 py-3 text-gray-600 font-medium bg-gray-100 hover:bg-gray-200 rounded-2xl transition-colors md:px-6 md:bg-transparent md:hover:bg-gray-200"
                                            >
                                                <span className="hidden md:inline">上一步</span>
                                                <ChevronRight className="w-5 h-5 rotate-180 md:hidden" />
                                            </button>
                                        ) : <div className="hidden md:block" />;
                                    })()}

                                    {/* Next Button / Add to Cart Logic */}
                                    {(() => {
                                        const currentIndex = availableSteps.indexOf(currentStep);
                                        const isLastStep = currentIndex === availableSteps.length - 1;
                                        const nextStep = !isLastStep ? availableSteps[currentIndex + 1] : null;

                                        const validateCurrentStep = () => {
                                            const currentGroups = stepGroups.get(currentStep) || [];
                                            for (const group of currentGroups) {
                                                const groupKey = getGroupKey(group);
                                                const isGroupSelected = !!selectedOptions[groupKey];
                                                if (isGroupSelected && group.subAttributes?.length) {
                                                    for (const attr of group.subAttributes) {
                                                        const attrKeyCa = `${groupKey}:ca:${attr.id}`;
                                                        const attrKeyNormal = `${groupKey}:${attr.id}`;
                                                        const valCa = selectedOptions[attrKeyCa];
                                                        const valNormal = selectedOptions[attrKeyNormal];

                                                        const isSelected = (valCa && valCa.toString().trim() !== '') || (valNormal && valNormal.toString().trim() !== '');

                                                        if (!isSelected) {
                                                            setInlineError(`請完成【${group.name}】的選項：${attr.name}`);
                                                            return false;
                                                        }
                                                    }
                                                }
                                            }
                                            setInlineError(null);
                                            return true;
                                        };

                                        return (
                                            <>
                                                {/* Inline Error Display */}
                                                {inlineError && (
                                                    <div className="absolute bottom-full left-0 right-0 flex justify-center w-full px-4 md:px-0 mb-4 pointer-events-none">
                                                        <div className="bg-red-50 text-red-600 px-4 py-3 rounded-xl font-bold text-sm shadow-md border border-red-200 flex items-start gap-2 animate-in slide-in-from-bottom-2 fade-in w-full max-w-sm mx-auto shadow-red-500/10 pointer-events-auto">
                                                            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                                                            <span className="leading-snug flex-1 break-words">{inlineError}</span>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* "Next" button - Show if not last step */}
                                                {!isLastStep && (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            if (!nextStep) return;
                                                            if (!validateCurrentStep()) return;
                                                            setCurrentStep(nextStep);
                                                        }}
                                                        disabled={currentStep === 1 && !hasChosenSpec}
                                                        className={`flex-1 md:flex-none md:w-auto px-8 py-3 rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg ${currentStep === 1 && !hasChosenSpec
                                                            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                            : 'bg-black text-white hover:bg-gray-800'
                                                            }`}
                                                    >
                                                        下一步 <ChevronRight className="w-5 h-5" />
                                                    </button>
                                                )}

                                                {/* "Add to Cart" button - Show only if Last Step */}
                                                {isLastStep && (
                                                    <button
                                                        type="button"
                                                        onClick={async () => {
                                                            if (!validateCurrentStep()) return;

                                                            const storageKey = `ppbears_checkout_progress_${productId || 'default'}`;
                                                            localStorage.removeItem(storageKey);

                                                            const customOptions: Record<string, any> = {};

                                                            // Do NOT add Product Name as a duplicate header option anymore
                                                            // customOptions[productName] = productName;

                                                            // 2. Iterate Steps to ensure order (Main Specs -> Add-ons)
                                                            availableSteps.forEach(step => {
                                                                const groupsInStep = stepGroups.get(step) || [];

                                                                groupsInStep.forEach(group => {
                                                                    const groupKey = getGroupKey(group);
                                                                    const selectedVal = selectedOptions[groupKey];

                                                                    // 2a. Main Item of the Group
                                                                    if (selectedVal) {
                                                                        const item = items.find(i => i.id === selectedVal);
                                                                        if (item) {
                                                                            if (step === 1) {
                                                                                // Main Spec: Just Group Name (e.g. "版本")
                                                                                customOptions[group.name] = item.name;
                                                                            } else {
                                                                                // Add-on: Group Name with Brackets (e.g. "【保護圖層】")
                                                                                customOptions[`【${group.name}】`] = item.name;
                                                                            }
                                                                        }
                                                                    }

                                                                    // 2b. Sub-Attributes of the Group
                                                                    if (group.subAttributes) {
                                                                        group.subAttributes.forEach(attr => {
                                                                            // Find keys in selectedOptions that match this attribute
                                                                            const relevantKeys = Object.keys(selectedOptions).filter(k => {
                                                                                if (k.endsWith('_label')) return false;
                                                                                if (!k.startsWith(`${groupKey}:`)) return false;

                                                                                const parts = k.split(':');
                                                                                // k = groupKey:attrId OR groupKey:ca:attrId
                                                                                const isCustomAttr = parts[1] === 'ca';
                                                                                const attrId = isCustomAttr ? parts[2] : parts[1];
                                                                                return String(attrId) === String(attr.id);
                                                                            });

                                                                            relevantKeys.forEach(k => {
                                                                                const val = selectedOptions[k];
                                                                                let displayVal = val;

                                                                                if (attr.type === 'select') {
                                                                                    const opt = attr.options?.find(o => String(o.id) === String(val));
                                                                                    if (opt) displayVal = opt.name;
                                                                                }

                                                                                if (step === 1) {
                                                                                    // Main Spec Sub-Attr: Just Attr Name
                                                                                    customOptions[attr.name] = displayVal;
                                                                                } else {
                                                                                    // Add-on Sub-Attr: Group Context (e.g. "【保護圖層】樣式")
                                                                                    // Use a separator that looks good? Space is fine.
                                                                                    customOptions[`【${group.name}】${attr.name}`] = displayVal;
                                                                                }
                                                                            });
                                                                        });
                                                                    }
                                                                });
                                                            });

                                                            console.log('[SaveDesignModal] Submitting Ordered Options:', customOptions);
                                                            try {
                                                                setIsSubmitting(true);
                                                                await onAddToCart(currentTotal, customOptions);
                                                            } finally {
                                                                // We only reset this if the modal stays open (e.g. error),
                                                                // otherwise the redirect will handle the navigation lock.
                                                                setIsSubmitting(false);
                                                            }
                                                        }}
                                                        disabled={isSubmitting}
                                                        className={`flex-1 md:flex-none md:w-auto px-8 py-3 text-white rounded-2xl font-bold transition-all flex items-center justify-center gap-2 shadow-lg ${isSubmitting ? 'bg-blue-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'
                                                            }`}
                                                        title="加入購物車"
                                                    >
                                                        {isSubmitting ? (
                                                            <>
                                                                <Loader2 className="w-5 h-5 animate-spin" />
                                                                處理中...
                                                            </>
                                                        ) : (
                                                            <>
                                                                <ShoppingCart className="w-5 h-5" />
                                                                加入購物車
                                                            </>
                                                        )}
                                                        <span className="md:inline hidden ml-1">(NT$ {currentTotal})</span>
                                                        <span className="md:hidden ml-1">(${currentTotal})</span>
                                                    </button>
                                                )}
                                            </>
                                        );
                                    })()}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {zoomedImage && (
                <div className="fixed inset-0 z-[100002] bg-black/90 flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200" onClick={() => setZoomedImage(null)}>
                    <div className="relative max-w-4xl max-h-[90vh]">
                        <button onClick={() => setZoomedImage(null)} className="absolute -top-12 right-0 text-white hover:text-gray-300 p-2"><X className="w-8 h-8" /></button>
                        <img src={zoomedImage} alt="Zoomed" className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" onClick={(e) => e.stopPropagation()} />
                    </div>
                </div>
            )}
        </div>,
        document.body
    );
}