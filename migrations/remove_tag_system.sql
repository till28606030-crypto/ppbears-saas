-- Migration: Remove Tag-Based Filtering System
-- Date: 2026-02-12
-- Description: Remove matching_tags, required_tags, and tags columns as they are no longer used in V2

-- 1. Remove matching_tags from option_groups
ALTER TABLE option_groups 
DROP COLUMN IF EXISTS matching_tags;

-- 2. Remove required_tags from option_items
ALTER TABLE option_items 
DROP COLUMN IF EXISTS required_tags;

-- 3. Remove tags from products (V2 does not use this field)
ALTER TABLE products 
DROP COLUMN IF EXISTS tags;

-- Note: assets.tags is kept for asset categorization purposes
