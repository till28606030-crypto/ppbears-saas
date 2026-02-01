import { supabase } from './supabase';

export type DesignTemplate = {
  id: string;
  name: string;
  category: string | null;
  tags: string[];
  isFeatured: boolean;
  isActive: boolean;
  previewUrl: string | null;
  fileUrl: string;
  fileType: string | null;
  createdAt: string;
};

export type DesignCategory = '全部' | '熱門設計' | '節慶主題' | '風格插畫' | '未分類';

export async function listDesignTemplates(params: {
  category?: DesignCategory | string;
  search?: string;
  limit?: number;
  offset?: number;
}): Promise<{ data: DesignTemplate[]; total: number }> {
  const { category = '全部', search = '', limit = 50, offset = 0 } = params;

  let query = supabase
    .from('design_templates')
    .select('id,name,category,tags,is_featured,is_active,preview_bucket,preview_path,file_bucket,file_path,file_type,created_at', { count: 'exact' })
    .eq('is_active', true);

  // Category Filter
  if (category === '全部') {
    // No filter
  } else if (category === '熱門設計') {
    query = query.eq('is_featured', true);
  } else if (category === '未分類') {
    query = query.is('category', null);
  } else {
    query = query.eq('category', category);
  }

  // Search Filter
  if (search) {
    // ilike for name, contains for tags array
    // Since supabase-js doesn't support OR across different column types easily in one string without raw SQL,
    // we use the .or() syntax. 
    // tags is text[], name is text. 
    // .or(`name.ilike.%${search}%,tags.cs.{${search}}`) might work if syntax is correct.
    // However, tags.cs (contains) expects array syntax.
    // Let's try a simpler approach or rely on name search mainly if complex.
    // User requested: "search: name ilike OR tags contains".
    // Correct Supabase syntax: .or(`name.ilike.%${search}%,tags.cs.{"${search}"}`)
    query = query.or(`name.ilike.%${search}%,tags.cs.{"${search}"}`);
  }

  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    if (error.message?.includes('AbortError') || error.message?.includes('signal is aborted')) {
        // Return empty result to avoid crashing UI during navigation
        return { data: [], total: 0 };
    }
    console.error('Error fetching design templates:', error);
    throw error;
  }

  const formattedData: DesignTemplate[] = (data || []).map((item) => {
    const previewUrl = item.preview_path
      ? supabase.storage.from(item.preview_bucket).getPublicUrl(item.preview_path).data.publicUrl
      : null;

    const fileUrl = item.file_path
      ? supabase.storage.from(item.file_bucket).getPublicUrl(item.file_path).data.publicUrl
      : '';

    return {
      id: item.id,
      name: item.name,
      category: item.category,
      tags: item.tags || [],
      isFeatured: item.is_featured,
      isActive: item.is_active,
      previewUrl,
      fileUrl,
      fileType: item.file_type,
      createdAt: item.created_at,
    };
  });

  return { data: formattedData, total: count || 0 };
}

export async function createDesignTemplate(
  payload: {
    name: string;
    category: string;
    tags: string[];
    isFeatured: boolean;
    fileType: string;
  },
  file: File,
  preview?: File
) {
  // 1. Upload File (Asset)
  const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
  const filePath = `${fileName}`; // root or folder? User didn't specify. Root is fine.

  const { error: fileUploadError } = await supabase.storage
    .from('design-assets')
    .upload(filePath, file);

  if (fileUploadError) throw fileUploadError;

  // 2. Upload Preview (if exists)
  let previewPath: string | null = null;
  if (preview) {
    const previewExt = preview.name.split('.').pop()?.toLowerCase() || 'png';
    const previewName = `preview-${Date.now()}-${Math.random().toString(36).substring(7)}.${previewExt}`;
    
    const { error: previewUploadError } = await supabase.storage
      .from('design-previews')
      .upload(previewName, preview);
    
    if (previewUploadError) throw previewUploadError;
    previewPath = previewName;
  } else {
    // Validation: if file is psd or ai, preview is required.
    const type = payload.fileType.toLowerCase();
    if (['psd', 'ai'].includes(type) || payload.name.toLowerCase().endsWith('.psd') || payload.name.toLowerCase().endsWith('.ai')) {
       throw new Error('PSD/AI 原始檔必須上傳預覽圖 (Preview Image is required for PSD/AI)');
    }
  }

  // 3. Insert DB Record
  const { data, error } = await supabase
    .from('design_templates')
    .insert({
      name: payload.name,
      category: payload.category === '未分類' ? null : payload.category,
      tags: payload.tags,
      is_featured: payload.isFeatured,
      is_active: true,
      file_bucket: 'design-assets',
      file_path: filePath,
      preview_bucket: 'design-previews',
      preview_path: previewPath,
      file_type: payload.fileType
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function ensureDesignTemplatesReadable(): Promise<{
  ok: boolean;
  error?: { code: string; message: string; details: string; hint: string };
  count?: number;
  projectRef: string;
}> {
  // Extract project ref from URL
  // URL format: https://<project_ref>.supabase.co
  const supabaseUrl = (import.meta as any).env.VITE_SUPABASE_URL || '';
  const projectRef = supabaseUrl.split('//')[1]?.split('.')[0] || 'unknown';

  try {
    const { count, error } = await supabase
      .from('design_templates')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .limit(1);

    if (error) {
      return {
        ok: false,
        error: {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint
        },
        projectRef
      };
    }

    return {
      ok: true,
      count: count || 0,
      projectRef
    };
  } catch (err: any) {
    return {
      ok: false,
      error: {
          code: 'CLIENT_ERROR',
          message: err.message,
          details: JSON.stringify(err),
          hint: 'Check network or client config'
      },
      projectRef
    };
  }
}
