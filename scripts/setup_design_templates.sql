-- 1) Table: design_templates
create table if not exists public.design_templates ( 
  id uuid primary key default gen_random_uuid(), 
  name text not null, 
  category text null,                 -- 節慶主題 / 風格插畫 / (null=未分類) 
  tags text[] not null default '{}'::text[], 
  is_featured boolean not null default false,  -- 熱門設計 
  is_active boolean not null default true, 

  preview_bucket text not null default 'design-previews', 
  preview_path text null,             -- 預覽圖存放路徑（必須能顯示縮圖） 
  file_bucket text not null default 'design-assets', 
  file_path text not null,            -- 原檔路徑（PSD/AI/PNG/JPG） 

  file_type text null,                -- psd / ai / png / jpg / jpeg 
  created_at timestamptz not null default now(), 
  updated_at timestamptz not null default now() 
); 

-- 2) Updated_at trigger
do $$ 
begin 
  if not exists (select 1 from pg_proc where proname = 'set_updated_at') then 
    create or replace function public.set_updated_at() 
    returns trigger as $fn$ 
    begin 
      new.updated_at = now(); 
      return new; 
    end; 
    $fn$ language plpgsql; 
  end if; 
end $$; 

do $$ 
begin 
  if not exists (select 1 from pg_trigger where tgname = 'trg_design_templates_updated_at') then 
    create trigger trg_design_templates_updated_at 
    before update on public.design_templates 
    for each row execute function public.set_updated_at(); 
  end if; 
end $$; 

-- 3) Indexes
create index if not exists idx_design_templates_active on public.design_templates (is_active); 
create index if not exists idx_design_templates_category on public.design_templates (category); 
create index if not exists idx_design_templates_featured on public.design_templates (is_featured); 
create index if not exists idx_design_templates_created_at on public.design_templates (created_at desc); 

-- 4) RLS Policy (Table)
alter table public.design_templates enable row level security;

create policy "Public can view active designs" 
on public.design_templates for select 
using (is_active = true);

create policy "Admins can do everything" 
on public.design_templates for all 
using (auth.role() = 'authenticated');

-- 5) Storage Buckets & Policies (Critical for "Bucket not found" error)
-- Create Buckets
insert into storage.buckets (id, name, public)
values ('design-assets', 'design-assets', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('design-previews', 'design-previews', true)
on conflict (id) do nothing;

-- Storage Policies (Assets)
create policy "Public Access Assets" on storage.objects for select using ( bucket_id = 'design-assets' );
create policy "Auth Upload Assets" on storage.objects for insert with check ( bucket_id = 'design-assets' and auth.role() = 'authenticated' );
create policy "Auth Update Assets" on storage.objects for update using ( bucket_id = 'design-assets' and auth.role() = 'authenticated' );
create policy "Auth Delete Assets" on storage.objects for delete using ( bucket_id = 'design-assets' and auth.role() = 'authenticated' );

-- Storage Policies (Previews)
create policy "Public Access Previews" on storage.objects for select using ( bucket_id = 'design-previews' );
create policy "Auth Upload Previews" on storage.objects for insert with check ( bucket_id = 'design-previews' and auth.role() = 'authenticated' );
create policy "Auth Update Previews" on storage.objects for update using ( bucket_id = 'design-previews' and auth.role() = 'authenticated' );
create policy "Auth Delete Previews" on storage.objects for delete using ( bucket_id = 'design-previews' and auth.role() = 'authenticated' );
