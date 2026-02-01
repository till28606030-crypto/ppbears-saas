-- Create designs table if it doesn't exist
create table if not exists designs (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  thumbnail text,
  layers jsonb not null default '[]'::jsonb,
  category text default '未分類',
  tags text[] default array[]::text[],
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  width numeric,
  height numeric,
  slug text unique,
  is_published boolean default false not null,
  default_context jsonb
);

-- Enable RLS
alter table designs enable row level security;

-- Policy: Everyone can read published designs
create policy "Public designs are viewable by everyone"
  on designs for select
  using ( is_published = true );

-- Policy: Authenticated users (admins) can do everything
create policy "Admins can do everything on designs"
  on designs for all
  using ( auth.role() = 'authenticated' );

-- Create index on slug
create index if not exists designs_slug_idx on designs (slug);
