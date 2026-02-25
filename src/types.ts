export interface AssetItem {
    id: string;
    url: string;
    name: string;      // For keyword search
    category: string;  // Main grouping (e.g. "Themes", "Styles")
    tags: string[];    // Specific tags (e.g. "Cute", "Red", "New Year")
}

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

export interface OptionGroupUIConfig {
    step?: number; // 1, 2, 3...
    displayType?: 'cards' | 'grid' | 'list' | 'checkbox' | 'ai_recognition';
    description?: string;
    descriptionImage?: string; // Legacy (single image)
    descriptionImages?: string[]; // New (multi image)
    category?: string; // 分類標籤，同 Step 內相同分類的商品會被折疊收合
}

export interface OptionGroup {
    id: string;
    code: string;
    name: string;
    priceModifier: number;
    thumbnail?: string;
    subAttributes?: SubAttribute[];
    uiConfig?: OptionGroupUIConfig;
    min?: number;
    max?: number;
    matchingTags?: string[];
}

export interface OptionItem {
    id: string;
    parentId: string;
    name: string;
    priceModifier: number;
    colorHex?: string;
    imageUrl?: string;
    requiredTags?: string[];
}

export interface ProductAvailability {
    id: string;
    modelId: string;
    optionItemId: string;
    isAvailable: boolean;
}

export interface Category {
    id: string;
    name: string;
    parent_id: string | null;
    layer_level?: number | null;
    sort_order?: number | null;
    children?: Category[];
}
