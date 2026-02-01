-- ==========================================
-- PPBears SaaS - Advanced Product Options Schema
-- Sprint 43: "Devil Case" Style Selector
-- ==========================================

-- 1. Option Types (規格大類)
-- Example: 'case_type', 'protection', 'stamping', 'lanyard'
CREATE TABLE option_types (
    code VARCHAR(50) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Option Items (規格細項)
-- Example: 'Devil Case Standard', 'Matte Finish', 'Gold Stamping'
CREATE TABLE option_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type_code VARCHAR(50) NOT NULL REFERENCES option_types(code) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    price_modifier DECIMAL(10, 2) DEFAULT 0, -- Additional cost (e.g., +300)
    image_url TEXT, -- Thumbnail for the option
    compatibility_tags JSONB DEFAULT '["all"]'::jsonb, -- Filter by product tags (e.g., ["iphone", "samsung"])
    is_active BOOLEAN DEFAULT TRUE,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Product Prices (Base Price Configuration)
-- Links specific product models to their base price before options
CREATE TABLE product_base_prices (
    model_id VARCHAR(100) PRIMARY KEY, -- e.g., 'iphone-15-pro'
    base_price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'TWD',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Order Options (To store selected options in an order)
-- This is a junction table or JSONB column in your 'order_items' table
-- Example of how to query:
/*
SELECT 
    o.id as order_id,
    p.base_price,
    SUM(oi.price_modifier) as total_modifiers,
    (p.base_price + SUM(oi.price_modifier)) as final_price
FROM orders o
JOIN product_base_prices p ON o.product_model_id = p.model_id
LEFT JOIN order_selected_options oso ON o.id = oso.order_id
LEFT JOIN option_items oi ON oso.option_item_id = oi.id
GROUP BY o.id, p.base_price;
*/

-- ==========================================
-- Seed Data (Initial Setup)
-- ==========================================

-- Insert Option Types
INSERT INTO option_types (code, name) VALUES
('case_type', '手機殼種'),
('protection', '保護層'),
('embossing', '浮雕'),
('stamping', '燙金'),
('lanyard', '掛繩');

-- Insert Option Items
INSERT INTO option_items (type_code, name, price_modifier, image_url, display_order) VALUES
-- Case Types
('case_type', '惡魔防摔手機殼 – 標準版', 0, 'https://example.com/case-std.jpg', 1),
('case_type', '惡魔防摔手機殼 – 磁吸版', 300, 'https://example.com/case-mag.jpg', 2),
('case_type', '惡魔防摔手機殼 – PRO', 500, 'https://example.com/case-pro.jpg', 3),

-- Protection
('protection', '亮面 (Glossy)', 0, NULL, 1),
('protection', '細紋磨砂 (Matte)', 50, NULL, 2),
('protection', '皮革紋 (Leather)', 100, NULL, 3),

-- Embossing
('embossing', '無浮雕', 0, NULL, 1),
('embossing', '加購浮雕效果', 150, NULL, 2),

-- Stamping
('stamping', '無燙金', 0, NULL, 1),
('stamping', '燙金 (Gold)', 120, NULL, 2),
('stamping', '燙銀 (Silver)', 120, NULL, 3),

-- Lanyard
('lanyard', '無掛繩', 0, NULL, 1),
('lanyard', '黑色掛繩', 290, 'https://example.com/lan-blk.jpg', 2),
('lanyard', '深藍掛繩', 290, 'https://example.com/lan-blue.jpg', 3);
