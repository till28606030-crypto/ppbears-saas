-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Create Storage Buckets
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true), ('models', 'models', true)
on conflict (id) do nothing;

-- Storage Policies (Allow public read, authenticated upload)
create policy "Public Access"
  on storage.objects for select
  using ( bucket_id in ('assets', 'models') );

create policy "Authenticated Upload"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id in ('assets', 'models') );

create policy "Authenticated Update"
  on storage.objects for update
  to authenticated
  using ( bucket_id in ('assets', 'models') );

create policy "Authenticated Delete"
  on storage.objects for delete
  to authenticated
  using ( bucket_id in ('assets', 'models') );

-- 2. Create Database Tables

-- Option Groups (規格大類)
create table if not exists public.option_groups (
    id text primary key, -- Use text ID to match existing logic (e.g. 'case_type')
    code text not null,
    name text not null,
    price_modifier integer default 0,
    matching_tags text[] default '{}',
    thumbnail text,
    ui_config jsonb default '{}'::jsonb,
    is_active boolean default true,
    created_at timestamptz default now()
);

-- Option Items (規格細項)
create table if not exists public.option_items (
    id text primary key,
    parent_id text references public.option_groups(id) on delete cascade,
    name text not null,
    price_modifier integer default 0,
    color_hex text,
    image_url text,
    required_tags text[] default '{}',
    is_active boolean default true,
    created_at timestamptz default now()
);

-- Assets (素材庫)
create table if not exists public.assets (
    id uuid default uuid_generate_v4() primary key,
    type text not null check (type in ('sticker', 'background', 'frame')),
    url text not null,
    name text,
    category text,
    tags text[] default '{}',
    created_at timestamptz default now()
);

-- 3. Enable RLS (Row Level Security)
alter table public.option_groups enable row level security;
alter table public.option_items enable row level security;
alter table public.assets enable row level security;

-- 4. Create Access Policies (Public Read, Authenticated Write)

-- Option Groups
create policy "Public Read Groups"
  on public.option_groups for select
  using (true);

create policy "Auth Insert Groups"
  on public.option_groups for insert
  to authenticated
  with check (true);

create policy "Auth Update Groups"
  on public.option_groups for update
  to authenticated
  using (true);

create policy "Auth Delete Groups"
  on public.option_groups for delete
  to authenticated
  using (true);

-- Option Items
create policy "Public Read Items"
  on public.option_items for select
  using (true);

create policy "Auth Insert Items"
  on public.option_items for insert
  to authenticated
  with check (true);

create policy "Auth Update Items"
  on public.option_items for update
  to authenticated
  using (true);

create policy "Auth Delete Items"
  on public.option_items for delete
  to authenticated
  using (true);

-- Assets
create policy "Public Read Assets"
  on public.assets for select
  using (true);

create policy "Auth Write Assets"
  on public.assets for all
  to authenticated
  using (true);
