export interface LinkPermissions {
    allowStickers?: boolean;
    allowBackgrounds?: boolean;
    allowBackgroundColor?: boolean;
    allowFrames?: boolean;
}

export interface DesignLink {
    id: string;
    name: string;
    url: string;
    type: 'default' | 'custom';
    isDefault: boolean;
    createdAt?: string;
    permissions?: LinkPermissions;
}

export interface ProductSpecs {
    dimensions?: string;
    width?: number;
    height?: number;
    dpi: number;
    format: string;
    pages?: number;
    colorSpace?: string;
    allowFlip?: boolean;
}

export interface ProductModel {
    id: string;
    name: string;
    category?: string;
    brand?: string; // e.g. Apple, Samsung
    thumbnail: string;
    specs: ProductSpecs;
    links: DesignLink[];
    // Extended properties for Canvas Editor
    width?: number;
    height?: number;
    baseImage?: string;
    maskImage?: string;
    maskOffset?: { x: number; y: number };
    cornerRadius?: number;
    compatibilityTags?: string[];
}

// [CLEANUP] MOCK_PRODUCTS removed to ensure strict DB usage.
