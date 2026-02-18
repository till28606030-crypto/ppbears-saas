-- Add client_permissions column to products table
ALTER TABLE products 
ADD COLUMN IF NOT EXISTS client_permissions JSONB DEFAULT '{
  "text": true,
  "background": true,
  "designs": true,
  "ai_remove_bg": true,
  "stickers": true,
  "barcode": true,
  "ai_cartoon": true
}'::jsonb;

-- Comment on the column
COMMENT ON COLUMN products.client_permissions IS 'Controls which design features are available to customers';
