-- ==========================================
-- Sprint 43-C: Availability Whitelist Control
-- ==========================================

-- 1. Create product_availability table
-- Controls which option_items (specifically colors) are available for which product_models
CREATE TABLE product_availability (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    model_id VARCHAR(100) NOT NULL, -- FK to product_models.id (text based id)
    option_item_id UUID NOT NULL REFERENCES option_items(id) ON DELETE CASCADE,
    is_available BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Ensure unique combination of Model + Option
    CONSTRAINT idx_availability_unique UNIQUE (model_id, option_item_id)
);

-- 2. Indexes for fast lookup
CREATE INDEX idx_availability_model ON product_availability(model_id);
CREATE INDEX idx_availability_option ON product_availability(option_item_id);

-- 3. Frontend Query Logic (Updated)
/*
Query Logic:
Find options that are explicitly available for the current model.

SELECT oi.* 
FROM option_items oi
JOIN product_availability pa ON oi.id = pa.option_item_id
WHERE 
  pa.model_id = :current_model_id
  AND pa.is_available = TRUE
  AND oi.parent_id = :current_case_type_id;

-- Note: If you want to support "Default All Available unless specified", logic would be more complex (Left Join + Coalesce).
-- But user requested "Whitelist Control" (From Global Open -> Whitelist), so INNER JOIN is correct.
*/
