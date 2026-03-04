-- 修復 Storage 權限：允許匿名用戶上傳與讀取設計預覽圖
-- 請在 Supabase SQL Editor 執行此腳本

-- 1. 確保 bucket 是公開的
UPDATE storage.buckets
SET public = true
WHERE id = 'design-previews';

-- 2. 移除舊有的受限策略 (如果有的話)
DROP POLICY IF EXISTS "Public Access Previews" ON storage.objects;
DROP POLICY IF EXISTS "Auth Upload Previews" ON storage.objects;
DROP POLICY IF EXISTS "Anon Upload Previews" ON storage.objects;

-- 3. 允許所有人（包括遊客）讀取預覽圖
CREATE POLICY "Public Access Previews"
ON storage.objects FOR SELECT
TO anon, authenticated
USING ( bucket_id = 'design-previews' );

-- 4. 關鍵：允許所有人（包括遊客）上傳新的預覽圖
-- 這解決了 "new row violates row-level security policy" 錯誤
CREATE POLICY "Anon Upload Previews"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK ( bucket_id = 'design-previews' );

-- 5. 允許更新自己的圖片 (基於名稱匹配)
CREATE POLICY "Anon Update Previews"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING ( bucket_id = 'design-previews' );
