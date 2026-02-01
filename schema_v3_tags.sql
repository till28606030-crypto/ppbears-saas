-- ==========================================
-- Sprint 43-B: Tag Matching System & Advanced Options
-- ==========================================

-- 1. Upgrade product_models table
-- Add 'tags' array for system compatibility (e.g., ['iphone', 'magsafe'])
ALTER TABLE product_models 
ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- 2. Upgrade option_items table
-- Add 'required_tags' for matching (e.g., ['magsafe'])
-- Add 'parent_id' for hierarchy (Parent Option -> Child Option)
-- Add 'color_hex' for UI display
ALTER TABLE option_items 
ADD COLUMN IF NOT EXISTS required_tags TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES option_items(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS color_hex VARCHAR(20);

-- 3. Indexes for array searching (PostgreSQL GIN index)
CREATE INDEX IF NOT EXISTS idx_product_models_tags ON product_models USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_option_items_required_tags ON option_items USING GIN (required_tags);

-- 4. Example Data Migration (Optional)
-- Update existing items to have empty tags if null
UPDATE option_items SET required_tags = '{}' WHERE required_tags IS NULL;
UPDATE product_models SET tags = '{}' WHERE tags IS NULL;

-- 5. Helper Comment for Frontend Query
/*
Query Logic:
Find all options where the option's required_tags are contained within the product's tags.
(Universal options with empty required_tags should also be included)

SELECT * FROM option_items 
WHERE 
  (required_tags = '{}') 
  OR 
  (required_tags <@ :current_product_tags);
*/
