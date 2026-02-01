import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ProductState {
  canvasWidth: number;
  canvasHeight: number;
  borderRadius: number;
  productName: string;
  baseImage: string | null;
  maskImage: string | null;
  setProductParams: (params: Partial<ProductState>) => void;
}

export const useProductStore = create<ProductState>()(
  persist(
    (set) => ({
      canvasWidth: 300,
      canvasHeight: 500,
      borderRadius: 40,
      productName: 'Default Phone Case',
      baseImage: null,
      maskImage: null,
      setProductParams: (params) => set((state) => ({ ...state, ...params })),
    }),
    {
      name: 'product-storage',
    }
  )
);
