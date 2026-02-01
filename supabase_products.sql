
-- 1. Create Products Table
create table if not exists public.products (
    id text primary key,
    name text not null,
    category text,
    brand text,
    thumbnail text,
    base_image text,
    mask_image text,
    specs jsonb default '{}'::jsonb,
    mask_config jsonb default '{}'::jsonb,
    permissions jsonb default '{}'::jsonb,
    tags text[] default '{}',
    is_active boolean default true,
    created_at timestamptz default now()
);

-- 2. Enable RLS
alter table public.products enable row level security;

-- 3. Create Policies
create policy "Public Read Products"
  on public.products for select
  using (true);

create policy "Auth Write Products"
  on public.products for all
  to authenticated
  using (true);
