import OpenAI from 'openai';
import sharp from 'sharp';
import { setCors } from '../_cors.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '5mb',
    },
  },
};

/**
 * Fetch an image from a URL and return its buffer.
 */
async function fetchImageBuffer(imageUrl) {
  const response = await fetch(imageUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; PPBears-AutoTag/1.0)' },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export default async function handler(req, res) {
  // 1. Always set CORS first
  setCors(req, res);

  // 2. Handle OPTIONS preflight
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  // 3. Require POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Only POST method is allowed' });
  }

  // 4. Auth check (X-AI-Token)
  const expectedToken = process.env.AI_ENDPOINT_SECRET;
  const receivedToken = req.headers['x-ai-token'];
  if (expectedToken && receivedToken !== expectedToken) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  try {
    // 5. Check env
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Server configuration error (Missing OpenAI API Key)',
        errorCode: 'MISSING_ENV',
      });
    }

    // 6. Parse body
    const { imageUrl, existingTags } = req.body || {};
    if (!imageUrl) {
      return res.status(400).json({ success: false, message: '缺少 imageUrl 參數', errorCode: 'MISSING_PARAM' });
    }

    // 7. Download and compress the image (server-side to avoid CORS / size issues)
    console.log(`[AI] Downloading image for auto-tag: ${imageUrl.slice(0, 80)}...`);
    const imgBuffer = await fetchImageBuffer(imageUrl);
    console.log(`[AI] Downloaded ${imgBuffer.length} bytes, compressing...`);

    const compressed = await sharp(imgBuffer)
      .resize(512, 512, { fit: 'inside' })
      .jpeg({ quality: 70 })
      .toBuffer();
    const imageDataUri = `data:image/jpeg;base64,${compressed.toString('base64')}`;
    console.log(`[AI] Compressed to ${compressed.length} bytes (${Math.round(compressed.length / 1024)}KB)`);

    // 8. Build the prompt with existing tags for consistency
    const existingTagsStr =
      Array.isArray(existingTags) && existingTags.length > 0 ? existingTags.join('、') : '';
    const userPrompt = existingTagsStr
      ? `分析這張圖片並產生標籤。系統已有標籤供參考：${existingTagsStr}`
      : `分析這張圖片並產生標籤。`;

    // 9. Call OpenAI GPT-4o-mini
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: `你是圖片標籤產生器。請分析圖片後，嚴格按照以下順序產生 3~6 個繁體中文標籤：
第1個標籤：必須是圖片的整體主色調（例如：白色、粉色、藍色、木紋色、灰色、黑色）
第2個標籤：圖案材質或內容（例如：大理石、花朵、星空、木紋、幾何圖形）
第3個標籤：風格描述（例如：簡約、復古、可愛、奢華、自然）
第4~6個標籤（選填）：其他特徵描述

回覆規則：
- 只回覆一個 JSON 陣列，不要有任何其他文字
- 格式範例：["白色","大理石","簡約"]
- 第一個一定是顏色`,
        },
        {
          role: 'user',
          content: [
            { type: 'text', text: userPrompt },
            {
              type: 'image_url',
              image_url: { url: imageDataUri, detail: 'low' },
            },
          ],
        },
      ],
      max_tokens: 150,
      temperature: 0.3,
    });

    const rawText = response.choices[0].message.content;
    console.log(`[AI] OpenAI Output:`, rawText);

    // 10. Parse the JSON array from the response
    let tags = [];
    try {
      const jsonMatch = rawText.match(/\[[\s\S]*?\]/);
      if (jsonMatch) {
        tags = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('AI did not return a JSON array');
      }
    } catch (parseErr) {
      console.warn('[AI] Failed to parse JSON, falling back to comma split:', parseErr.message);
      tags = rawText
        .replace(/[\[\]"']/g, '')
        .split(/[,、，\n]/)
        .map((t) => t.trim())
        .filter((t) => t.length > 0 && t.length < 20);
    }

    // Deduplicate and limit
    tags = [...new Set(tags)].slice(0, 6);
    console.log(`[AI] Final tags:`, tags);

    return res.status(200).json({ success: true, tags });
  } catch (error) {
    console.error('[AI] Vision Analyze Error:', error);
    return res.status(500).json({
      success: false,
      message: 'AI 圖片分析失敗',
      errorCode: 'AI_ERROR',
      error: String(error?.message || error),
    });
  }
}
