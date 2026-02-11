alter table public.product_categories drop constraint if exists product_categories_layer_level_check;

create index if not exists idx_product_categories_parent_sort
  on public.product_categories (parent_id, sort_order, id);

create unique index if not exists uq_product_categories_parent_name_ci
  on public.product_categories (parent_id, lower(name));

alter table public.products
  add column if not exists category_id uuid references public.product_categories(id) on delete set null;

create index if not exists idx_products_category_id
  on public.products (category_id);
