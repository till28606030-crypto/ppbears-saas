-- =====================================================
-- AI Style Presets 資料表建立 + 初始化
-- 用於 AI 設計拼貼功能的風格管理
-- =====================================================

-- 1. 建立資料表
CREATE TABLE IF NOT EXISTS ai_style_presets (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label      TEXT NOT NULL,
  emoji      TEXT NOT NULL DEFAULT '✨',
  prompt     TEXT NOT NULL,
  is_active  BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. 啟用 RLS
ALTER TABLE ai_style_presets ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policy：所有人可讀取（前台需要顯示風格清單）
CREATE POLICY "Anyone can read active styles"
  ON ai_style_presets
  FOR SELECT
  USING (true);

-- 4. RLS Policy：已登入用戶可管理（後台管理者）
CREATE POLICY "Authenticated users can manage styles"
  ON ai_style_presets
  FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- 5. 初始化 6 個預設風格
INSERT INTO ai_style_presets (label, emoji, prompt, sort_order) VALUES
(
  '偶像應援',
  '🌟',
  'idol fan art, kpop aesthetic, vibrant neon colors, sparkles, K-pop poster style, dynamic composition, dreamy pink and purple tones',
  1
),
(
  '旅遊紀念',
  '🌍',
  'travel photo collage, postcard style, warm golden tones, wanderlust aesthetic, scenic backgrounds, vintage travel poster feel',
  2
),
(
  '寵物專屬',
  '🐾',
  'cute pet portrait collage, pastel colors, playful kawaii style, soft watercolor background, adorable and heartwarming layout',
  3
),
(
  '節日慶典',
  '🎉',
  'festive celebration collage, confetti, bokeh lights, joyful and colorful, party atmosphere, golden and red tones',
  4
),
(
  '日本動漫',
  '🎌',
  'Japanese anime panel layout, manga-inspired composition, bold ink outlines, cel-shading colors, sakura petals, dynamic action lines, anime poster style, vibrant saturated colors, Japanese typography accents',
  5
),
(
  '情侶愛情',
  '❤️',
  'romantic couple photo collage, soft rose petals, warm blush pink and cream tones, heart motifs, bokeh background, dreamy golden hour lighting, love aesthetic, gentle vignette, elegant serif typography accents',
  6
);
