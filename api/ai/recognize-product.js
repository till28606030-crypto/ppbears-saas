import OpenAI from 'openai';
import sharp from 'sharp';
import { setCors } from '../_cors.js';

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

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
      return res.status(500).json({ success: false, message: 'Server configuration error (Missing OpenAI API Key)', errorCode: 'MISSING_ENV' });
    }

    // 6. Parse body
    const { imageBase64, mimeType = 'image/jpeg' } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ success: false, message: '缺少 imageBase64 參數', errorCode: 'MISSING_PARAM' });
    }

    // 7. Compress image using sharp
    let imageDataUri;
    try {
      const inputBuffer = Buffer.from(imageBase64, 'base64');
      const compressed = await sharp(inputBuffer)
        .resize(1280, 1280, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
      imageDataUri = `data:image/jpeg;base64,${compressed.toString('base64')}`;
      console.log(`[AI] recognize-product: image compressed to ${Math.round(compressed.length / 1024)}KB`);
    } catch (imgErr) {
      console.warn('[AI] Image compression failed, using original:', imgErr.message);
      imageDataUri = `data:${mimeType};base64,${imageBase64}`;
    }

    // 8. Call OpenAI GPT-4o Vision
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const promptText = `你是手機殼商品規格辨識專家，專門處理 Devilcase 官網截圖。
請從截圖中提取：
1. 手機型號（如 Apple - iPhone 17 Pro Max）
2. 殼種款式名稱（如 惡魔防摔殼 PRO 3 磁吸版、惡魔防摔殼 標準版 等）
3. 所有配件規格屬性（外框、鏡頭造型、按鍵組、動作按鍵、相機按鍵 等）

請用以下 JSON 格式回傳（只回傳 JSON，不要其他文字）：
{
  "phoneName": "填入實際的手機型號",
  "caseName": "填入實際的殼種款式",
  "specs": [
    {"category": "外框", "value": "填入實際外框規格"},
    {"category": "鏡頭造型", "value": "填入實際鏡頭規格"}
  ]
}

注意：
- 極度重要：請逐字完整照抄圖片上的繁體中文文字，絕對不能自行猜測、翻譯或修改成相似的詞語。
- caseName 請完整包含版本資訊（根據圖片實際文字，可能是 PRO 3、磁吸版、標準版 等）
- 動作按鍵和相機按鍵是不同的欄位，請分開辨識
- 若截圖中看不到某欄位，就不要包含在 specs 裡`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: promptText },
        {
          role: 'user',
          content: [
            { type: 'text', text: '請辨識這張截圖中的商品規格。請確保嚴格逐字照抄，不可有任何自行猜測修改的字眼。' },
            { type: 'image_url', image_url: { url: imageDataUri } }
          ]
        }
      ],
      max_tokens: 800,
      temperature: 0.1
    });

    const content = response.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({ success: false, message: 'No content from OpenAI', errorCode: 'EMPTY_RESPONSE' });
    }

    // 9. Extract JSON from response
    let jsonStr = content.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) jsonStr = codeBlockMatch[1];

    let productInfo;
    try {
      productInfo = JSON.parse(jsonStr);
    } catch (parseErr) {
      console.error('[AI] recognize-product JSON parse error:', parseErr.message, 'Raw:', content.slice(0, 200));
      return res.status(502).json({ success: false, message: 'AI 辨識結果格式錯誤，請重試', errorCode: 'PARSE_ERROR' });
    }

    console.log('[AI] recognize-product result:', JSON.stringify(productInfo).slice(0, 300));
    return res.status(200).json({ success: true, productInfo });

  } catch (error) {
    console.error('[AI] recognize-product Error:', error);
    return res.status(500).json({
      success: false,
      message: 'AI 商品辨識失敗',
      errorCode: 'AI_ERROR',
      error: String(error?.message || error)
    });
  }
}
