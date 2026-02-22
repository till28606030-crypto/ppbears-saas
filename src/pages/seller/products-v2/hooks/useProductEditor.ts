import { useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { ProductRow } from '../shared/types';
import { uploadToSupabase } from '@/lib/upload';

export interface UseProductEditorReturn {
  product: ProductRow | null;
  draft: ProductRow | null;
  loading: boolean;
  saving: boolean;
  isDirty: boolean;
  error: string | null;
  setDraft: (partial: Partial<ProductRow>) => void;
  load: (id: string) => Promise<void>;
  save: () => Promise<{ success: boolean; error?: string }>;
  uploadBaseImage: (file: File) => Promise<string | null>;
  uploadMaskImage: (file: File) => Promise<string | null>;
  deleteProduct: (id: string) => Promise<{ success: boolean; error?: string }>;
  duplicateProduct: (id: string) => Promise<{ success: boolean; newId?: string; error?: string }>;
  validate: () => { valid: boolean; errors: string[] };
  getChangedFields: () => Partial<ProductRow>;
}

const MUTABLE_KEYS: (keyof ProductRow)[] = [
  'name',
  'category',
  'category_id',
  'brand',
  'thumbnail',
  'base_image',
  'mask_image',
  'specs',
  'mask_config',
  'permissions',
  'client_permissions',
  'is_active',
];

export const useProductEditor = (): UseProductEditorReturn => {
  const [product, setProduct] = useState<ProductRow | null>(null);
  const [draft, setDraftState] = useState<ProductRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setDraft = useCallback((partial: Partial<ProductRow>) => {
    setDraftState((prev) => (prev ? { ...prev, ...partial } : null));
  }, []);

  const load = useCallback(async (id: string) => {
    if (id === 'new') {
      const newProduct: ProductRow = {
        id: `p_${Date.now()}`,
        name: '新產品',
        category: null,
        category_id: null,
        brand: null,
        thumbnail: null,
        base_image: null,
        mask_image: null,
        specs: {},
        mask_config: {},
        permissions: {},
        is_active: true,
        updated_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
      };
      setProduct(null);
      setDraftState(newProduct);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      // Auto-migrate standard CM specs to MM if missing
      const loadedData = { ...data };
      loadedData.specs = loadedData.specs || {};
      if (loadedData.specs.width && !loadedData.specs.width_mm) {
        loadedData.specs.width_mm = loadedData.specs.width * 10;
      }
      if (loadedData.specs.height && !loadedData.specs.height_mm) {
        loadedData.specs.height_mm = loadedData.specs.height * 10;
      }

      setProduct(loadedData);
      setDraftState(loadedData);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const getChangedFields = useCallback(() => {
    if (!draft) return {};
    if (!product) return draft; // For new products

    const changed: Partial<ProductRow> = {};
    MUTABLE_KEYS.forEach((key) => {
      if (JSON.stringify(draft[key]) !== JSON.stringify(product[key])) {
        (changed as any)[key] = draft[key];
      }
    });
    return changed;
  }, [product, draft]);

  const isDirty = useMemo(() => {
    const changed = getChangedFields();
    return !!product && Object.keys(changed).length > 0;
  }, [product, getChangedFields]);

  const validate = useCallback(() => {
    const errors: string[] = [];
    if (!draft) return { valid: false, errors: ['資料未載入'] };
    if (!draft.name?.trim()) errors.push('名稱為必填');
    if (!draft.base_image) errors.push('必須上傳產品底圖 (base_image)');

    if (typeof draft.specs !== 'object') {
      errors.push('Specs 格式錯誤');
    } else {
      if (!draft.specs.width_mm || draft.specs.width_mm <= 0) errors.push('實體寬度 (MM) 為必填且必須大於 0');
      if (!draft.specs.height_mm || draft.specs.height_mm <= 0) errors.push('實體高度 (MM) 為必填且必須大於 0');
    }
    if (typeof draft.mask_config !== 'object') errors.push('Mask Config 格式錯誤');
    if (typeof draft.permissions !== 'object') errors.push('Permissions 格式錯誤');

    return { valid: errors.length === 0, errors };
  }, [draft]);

  const save = useCallback(async () => {
    if (!draft?.base_image) {
      return { success: false, error: '缺失 base_image，無法儲存' };
    }

    const { valid, errors } = validate();
    if (!valid) return { success: false, error: errors.join(', ') };

    try {
      setSaving(true);
      setError(null);

      const isNew = !product;
      const changedFields = isNew ? draft : getChangedFields();

      if (Object.keys(changedFields).length === 0) {
        return { success: true };
      }

      const payload = {
        ...changedFields,
        updated_at: new Date().toISOString()
      };

      const { data, error: saveError } = isNew
        ? await supabase.from('products').insert([payload]).select().single()
        : await supabase.from('products').update(payload).eq('id', product.id).select().single();

      if (saveError) throw saveError;

      setProduct(data);
      setDraftState(data);
      return { success: true };
    } catch (err: any) {
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setSaving(false);
    }
  }, [draft, product, validate, getChangedFields]);

  const uploadBaseImage = useCallback(async (file: File) => {
    const url = await uploadToSupabase(file, 'models');
    if (url) {
      setDraft({ base_image: url });
    }
    return url;
  }, [setDraft]);

  const uploadMaskImage = useCallback(async (file: File) => {
    const url = await uploadToSupabase(file, 'models');
    if (url) {
      setDraft({ mask_image: url });
    }
    return url;
  }, [setDraft]);

  const deleteProduct = useCallback(async (id: string) => {
    try {
      const { error: delError } = await supabase.from('products').delete().eq('id', id);
      if (delError) throw delError;
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, []);

  const duplicateProduct = useCallback(async (id: string) => {
    try {
      const { data: source, error: fetchError } = await supabase
        .from('products')
        .select('*')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      const payload: any = {};
      MUTABLE_KEYS.forEach(key => {
        payload[key] = source[key];
      });
      payload.name = `${source.name} (複製)`;

      // Try insert without ID first (let DB handle it if possible)
      let { data: inserted, error: insError } = await supabase
        .from('products')
        .insert([payload])
        .select('id')
        .single();

      // Fallback if ID is required
      if (insError && insError.code === '23502' && insError.message.includes('id')) {
        const prefix = source.id.includes('_') ? source.id.split('_')[0] : 'prod';
        const newId = `${prefix}_${Date.now()}`;
        payload.id = newId;

        const retryResult = await supabase
          .from('products')
          .insert([payload])
          .select('id')
          .single();

        if (retryResult.error) throw retryResult.error;
        inserted = retryResult.data;
      } else if (insError) {
        throw insError;
      }

      return { success: true, newId: inserted?.id };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }, []);

  return {
    product,
    draft,
    loading,
    saving,
    isDirty,
    error,
    setDraft,
    load,
    save,
    uploadBaseImage,
    uploadMaskImage,
    deleteProduct,
    duplicateProduct,
    validate,
    getChangedFields,
  };
};
