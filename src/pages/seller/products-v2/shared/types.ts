export interface ProductSpecs {
  width?: number;
  height?: number;
  printWidth?: number;
  printHeight?: number;
  safeArea?: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  [key: string]: any;
}

export interface MaskConfig {
  maskUrl?: string;
  overlayUrl?: string;
  maskType?: 'rect' | 'circle' | 'path';
  [key: string]: any;
}

export interface ProductPermissions {
  allowCustomText?: boolean;
  allowCustomImage?: boolean;
  allowAIGeneration?: boolean;
  [key: string]: any;
}

export interface ProductRow {
  id: string;
  name: string;
  category: string | null;
  brand: string | null;
  thumbnail: string | null;
  base_image: string | null;
  mask_image: string | null;
  specs: ProductSpecs;
  mask_config: MaskConfig;
  permissions: ProductPermissions;
  tags: string[];
  is_active: boolean;
  updated_at: string;
  created_at: string;
}

export type ProductV2 = ProductRow;
