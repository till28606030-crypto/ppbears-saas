-- 1. Create Product Categories Table
create table if not exists public.product_categories (
    id uuid default uuid_generate_v4() primary key,
    name text not null,
    parent_id uuid references public.product_categories(id) on delete cascade,
    layer_level integer default 1 check (layer_level between 1 and 3),
    sort_order integer default 0,
    created_at timestamptz default now()
);

-- 2. Enable RLS
alter table public.product_categories enable row level security;

-- 3. Policies
create policy "Public Read Categories"
  on public.product_categories for select
  using (true);

create policy "Auth Write Categories"
  on public.product_categories for all
  to authenticated
  using (true);

-- 4. Update Products Table
-- Add category_id if not exists
do $$
begin
    if not exists (select 1 from information_schema.columns where table_name = 'products' and column_name = 'category_id') then
        alter table public.products add column category_id uuid references public.product_categories(id);
    end if;
end $$;
