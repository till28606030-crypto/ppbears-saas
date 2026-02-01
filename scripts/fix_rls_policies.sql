-- Fix RLS Policies for Design Templates
-- 確保匿名用戶 (前台) 可以讀取已啟用的設計

-- 1. 重設 design_templates 的讀取權限
drop policy if exists "Public can view active designs" on public.design_templates;
drop policy if exists "Admins can do everything" on public.design_templates;

-- 明確開放給 anon (未登入) 與 authenticated (已登入)
create policy "Public can view active designs" 
on public.design_templates for select 
to anon, authenticated
using (is_active = true);

-- 管理員權限維持不變
create policy "Admins can do everything" 
on public.design_templates for all 
to authenticated
using (auth.role() = 'authenticated');

-- 2. 確保 Storage Buckets 是公開的 (Public)
update storage.buckets
set public = true
where id in ('design-assets', 'design-previews');

-- 3. 重設 Storage 讀取權限 (確保前台能看到圖)
drop policy if exists "Public Access Assets" on storage.objects;
drop policy if exists "Public Access Previews" on storage.objects;

create policy "Public Access Assets"
on storage.objects for select
to anon, authenticated
using ( bucket_id = 'design-assets' );

create policy "Public Access Previews"
on storage.objects for select
to anon, authenticated
using ( bucket_id = 'design-previews' );

-- 4. 補齊上傳權限 (避免後台下次上傳失敗)
drop policy if exists "Auth Upload Assets" on storage.objects;
drop policy if exists "Auth Upload Previews" on storage.objects;

create policy "Auth Upload Assets"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'design-assets' );

create policy "Auth Upload Previews"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'design-previews' );

-- 其他 Update/Delete 權限
create policy "Auth Update Storage"
on storage.objects for update
to authenticated
using ( bucket_id in ('design-assets', 'design-previews') );

create policy "Auth Delete Storage"
on storage.objects for delete
to authenticated
using ( bucket_id in ('design-assets', 'design-previews') );
