import { supabase } from './supabase';

/**
 * Uploads a file to Supabase Storage.
 * @param file The file to upload
 * @param bucket The storage bucket name (default: 'assets')
 * @param folder Optional folder path within the bucket
 * @returns The public URL of the uploaded file or null if failed
 */
export const uploadToSupabase = async (
    file: File, 
    bucket: 'assets' | 'models' | 'designs' = 'assets',
    folder: string = ''
): Promise<string | null> => {
    // 1. Check Auth Session
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
        console.error('User not authenticated');
        alert('請先登入後再上傳圖片');
        return null;
    }

    try {
        const fileExt = file.name.split('.').pop();
        // Create a unique file name: timestamp_random.ext
        const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.${fileExt}`;
        const filePath = folder ? `${folder}/${fileName}` : fileName;

        // 2. Upload to Supabase Storage
        const { error: uploadError, data: uploadData } = await supabase.storage
            .from(bucket)
            .upload(filePath, file, {
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) {
             console.error('Supabase Upload Error:', uploadError);
             // Handle "The object already exists" or other specific errors if needed
             alert(`上傳失敗: ${uploadError.message || '未知錯誤'} (Code: ${(uploadError as any).statusCode})`);
             return null;
        }

        // 3. Get Public URL
        const { data } = supabase.storage
            .from(bucket)
            .getPublicUrl(filePath);
        
        console.log(`[Upload Success] Bucket: ${bucket}, Path: ${filePath}, URL: ${data.publicUrl}`);
        return data.publicUrl;

    } catch (error: any) {
        // Ignore AbortError which happens in dev environment sometimes
        if (error.name === 'AbortError' || error.message?.includes('AbortError')) {
            console.warn('Upload aborted (likely dev environment hot reload), ignoring.');
            return null;
        }
        
        console.error('Upload Critical Error:', error);
        alert('圖片上傳發生嚴重錯誤: ' + (error.message || '未知錯誤'));
        return null;
    }
};
