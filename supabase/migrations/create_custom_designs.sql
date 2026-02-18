-- 創建客製化設計表
CREATE TABLE IF NOT EXISTS custom_designs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_id TEXT UNIQUE NOT NULL,
    product_name TEXT,
    phone_model TEXT,
    price DECIMAL(10,2) NOT NULL,
    options JSONB NOT NULL DEFAULT '{}',
    preview_image_url TEXT,
    print_image_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 創建索引提升查詢性能
CREATE INDEX idx_custom_designs_design_id ON custom_designs(design_id);
CREATE INDEX idx_custom_designs_created_at ON custom_designs(created_at DESC);

-- 啟用 RLS（Row Level Security）
ALTER TABLE custom_designs ENABLE ROW LEVEL SECURITY;

-- 允許所有人插入（設計器可以保存設計）
CREATE POLICY "Allow public insert" ON custom_designs
    FOR INSERT
    TO public
    WITH CHECK (true);

-- 允許所有人通過 design_id 查詢（WordPress 需要讀取）
CREATE POLICY "Allow public select by design_id" ON custom_designs
    FOR SELECT
    TO public
    USING (true);

-- 自動更新 updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_custom_designs_updated_at
    BEFORE UPDATE ON custom_designs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 添加註釋
COMMENT ON TABLE custom_designs IS '客製化設計數據，用於傳遞到 WooCommerce';
COMMENT ON COLUMN custom_designs.design_id IS '唯一設計標識符';
COMMENT ON COLUMN custom_designs.options IS 'JSON 格式的完整規格選項';
