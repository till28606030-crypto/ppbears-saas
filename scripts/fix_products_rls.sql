-- Enable RLS on products table
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

-- Policy 1: Allow public read access (SELECT) for everyone (anon and authenticated)
-- This ensures that users in Trae browser (anon) can see the products
DROP POLICY IF EXISTS "Public read access" ON products;
CREATE POLICY "Public read access"
ON products FOR SELECT
TO anon, authenticated
USING (true);

-- Policy 2: Allow authenticated users (admin) to insert/update/delete
-- Adjust this if you have specific admin roles, but for now authenticated is standard for dashboard
DROP POLICY IF EXISTS "Admin full access" ON products;
CREATE POLICY "Admin full access"
ON products FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
