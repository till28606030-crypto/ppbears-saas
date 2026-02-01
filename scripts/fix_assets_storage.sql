-- Enable RLS
alter table public.assets enable row level security;

-- Add metadata column if not exists (for Frames clipPathPoints)
alter table public.assets add column if not exists metadata jsonb default '{}'::jsonb;

-- Storage Bucket Setup
insert into storage.buckets (id, name, public)
values ('assets', 'assets', true)
on conflict (id) do nothing;

-- Storage Policies
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

-- Table Policies
create policy "Public Read"
  on public.assets for select
  using ( true );

create policy "Authenticated Insert"
  on public.assets for insert
  to authenticated
  with check ( true );

create policy "Authenticated Update"
  on public.assets for update
  to authenticated
  using ( true );

create policy "Authenticated Delete"
  on public.assets for delete
  to authenticated
  using ( true );
