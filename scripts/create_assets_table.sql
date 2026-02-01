-- Create Assets Table if not exists
create table if not exists public.assets (
    id uuid default uuid_generate_v4() primary key,
    type text not null check (type in ('sticker', 'background', 'frame')),
    url text not null,
    name text,
    category text,
    tags text[] default '{}',
    metadata jsonb default '{}'::jsonb,
    created_at timestamptz default now()
);

-- Enable RLS
alter table public.assets enable row level security;

-- Storage Bucket Setup (if not exists)
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

-- Storage Policies (Drop first to avoid conflicts if re-running)
drop policy if exists "Public Access" on storage.objects;
drop policy if exists "Authenticated Upload" on storage.objects;
drop policy if exists "Authenticated Update" on storage.objects;
drop policy if exists "Authenticated Delete" on storage.objects;

create policy "Public Access"
  on storage.objects for select
  using ( bucket_id = 'assets' );

create policy "Authenticated Upload"
  on storage.objects for insert
  to authenticated
  with check ( bucket_id = 'assets' );

create policy "Authenticated Update"
  on storage.objects for update
  to authenticated
  using ( bucket_id = 'assets' );

create policy "Authenticated Delete"
  on storage.objects for delete
  to authenticated
  using ( bucket_id = 'assets' );

-- Table Policies (Drop first to avoid conflicts)
drop policy if exists "Public Read" on public.assets;
drop policy if exists "Public Read Assets" on public.assets;
drop policy if exists "Authenticated Insert" on public.assets;
drop policy if exists "Authenticated Update" on public.assets;
drop policy if exists "Authenticated Delete" on public.assets;
drop policy if exists "Auth Write Assets" on public.assets;

create policy "Public Read Assets"
  on public.assets for select
  using ( true );

create policy "Auth Write Assets"
  on public.assets for all
  to authenticated
  using ( true );
