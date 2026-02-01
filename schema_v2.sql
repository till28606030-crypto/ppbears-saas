-- ==========================================
-- PPBears SaaS - Tag-Based Option System (Sprint 43-B)
-- ==========================================

-- 1. Option Groups (規格大類)
-- Replaces previous 'option_types' if exists, or extends it.
-- Using 'option_groups' as requested.
CREATE TABLE option_groups (
    code VARCHAR(50) PRIMARY KEY, -- e.g., 'case_type', 'lanyard'
    name VARCHAR(100) NOT NULL,   -- e.g., '手機殼種', '掛繩'
    description TEXT,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Option Items (規格細項)
-- Supports Tag Matching via 'required_tags'
CREATE TABLE option_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    group_code VARCHAR(50) NOT NULL REFERENCES option_groups(code) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    price_modifier DECIMAL(10, 2) DEFAULT 0,
    image_url TEXT,
    
    -- Tag Matching Logic:
    -- If NULL or Empty Array: Universal Option (Available for all models)
    -- If ["magsafe", "iphone"]: Only models having BOTH tags will show this option.
    -- (Or logic can be ANY match depending on business rule, usually ALL match is stricter)
    required_tags JSONB DEFAULT '[]'::jsonb, 
    
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Product Models (Modifying existing table)
-- Add 'compatibility_tags' to enable matching
ALTER TABLE product_models 
ADD COLUMN compatibility_tags JSONB DEFAULT '[]'::jsonb; 
-- Example: ["iphone", "15_series", "magsafe", "devil_case_compatible"]

-- ==========================================
-- Seed Data
-- ==========================================

-- Groups
INSERT INTO option_groups (code, name, display_order) VALUES
('case_type', '手機殼種', 1),
('lens_protector', '鏡頭貼', 2),
('lanyard', '掛繩', 3);

-- Items with Tags
INSERT INTO option_items (group_code, name, price_modifier, required_tags) VALUES
-- Universal Options (No tags required)
('lanyard', '黑色掛繩', 290, '[]'),
('lanyard', '深藍掛繩', 290, '[]'),

-- Specific Options
('case_type', '惡魔防摔殼 標準版', 0, '["devil_case_compatible"]'),
('case_type', '惡魔防摔殼 磁吸版', 300, '["devil_case_compatible", "magsafe"]'), -- Needs both tags

('lens_protector', '藍寶石鏡頭貼 (iPhone 15)', 450, '["iphone", "15_series"]'),
('lens_protector', '藍寶石鏡頭貼 (iPhone 14)', 450, '["iphone", "14_series"]');
