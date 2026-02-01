-- Fix Upload Permissions for Localhost Development
-- 允許 localhost 匿名/登入用戶上傳到 design-assets 和 design-previews
-- 注意：這是為了開發方便，正式環境若需要嚴格權限請謹慎使用

-- 1. 確保 Buckets 是公開的
update storage.buckets
set public = true
where id in ('design-assets', 'design-previews');

-- 2. 允許所有用戶 (包含 anon) 讀取
drop policy if exists "Public Access Assets" on storage.objects;
create policy "Public Access Assets"
on storage.objects for select
to public
using ( bucket_id = 'design-assets' );

drop policy if exists "Public Access Previews" on storage.objects;
create policy "Public Access Previews"
on storage.objects for select
to public
using ( bucket_id = 'design-previews' );

-- 3. 允許 Authenticated 用戶上傳 (基本)
drop policy if exists "Auth Upload Assets" on storage.objects;
create policy "Auth Upload Assets"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'design-assets' );

drop policy if exists "Auth Upload Previews" on storage.objects;
create policy "Auth Upload Previews"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'design-previews' );

-- 4. [開發用] 允許 Anon 用戶上傳 (若 Localhost 無法維持登入狀態)
-- 若您在 localhost 遇到 "new row violates row-level security policy"，請執行此段
drop policy if exists "Anon Upload Assets" on storage.objects;
create policy "Anon Upload Assets"
on storage.objects for insert
to anon
with check ( bucket_id = 'design-assets' );

drop policy if exists "Anon Upload Previews" on storage.objects;
create policy "Anon Upload Previews"
on storage.objects for insert
to anon
with check ( bucket_id = 'design-previews' );

-- 5. 允許 Update/Delete (Auth Only)
drop policy if exists "Auth Update Storage" on storage.objects;
create policy "Auth Update Storage"
on storage.objects for update
to authenticated
using ( bucket_id in ('design-assets', 'design-previews') );

drop policy if exists "Auth Delete Storage" on storage.objects;
create policy "Auth Delete Storage"
on storage.objects for delete
to authenticated
using ( bucket_id in ('design-assets', 'design-previews') );
