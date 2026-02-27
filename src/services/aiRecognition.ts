export interface RecognizedSpec {
    category: string;
    value: string;
}

/** 辨識結果中包含的完整商品資訊 */
export interface RecognizedProductInfo {
    phoneName: string;       // 手機型號，例如 "Apple iPhone 17 Pro Max"
    caseName: string;        // 殼種款式，例如 "惡魔防摔殼 PRO 3 磁吸版"
    specs: RecognizedSpec[]; // 其餘規格
}

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

/**
 * Helper to convert a File or Blob to a base64 string.
 */
function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const base64String = (reader.result as string).split(',')[1];
            resolve(base64String);
        };
        reader.onerror = error => reject(error);
    });
}

/**
 * Recognizes product specifications from an image (screenshot) using OpenAI GPT-4o-mini.
 * Returns full product info including phone model, case name, and attribute specs.
 */
export async function recognizeProductFromImage(file: File): Promise<RecognizedProductInfo> {
    if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API Key is missing. Please check your environment variables.');
    }

    console.log('[AI Recognition] Starting OpenAI Vision recognition for:', file.name);

    const base64Image = await fileToBase64(file);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
                {
                    role: 'system',
                    content: `你是手機殼商品規格辨識專家，專門處理 Devilcase 官網截圖。
請從截圖中提取：
1. 手機型號（如 Apple - iPhone 17 Pro Max）
2. 殼種款式名稱（如 惡魔防摔殼 PRO 3 磁吸版、惡魔防摔殼 標準版 等）
3. 所有配件規格屬性（外框、鏡頭造型、按鍵組、動作按鍵、相機按鍵 等）

請用以下 JSON 格式回傳（只回傳 JSON，不要其他文字）。
【以下僅為 JSON 格式範例，請務必根據圖片「實際內容」填寫，絕對不要直接抄襲範例的值】：
{
  "phoneName": "填入實際的手機型號",
  "caseName": "填入實際的殼種款式",
  "specs": [
    {"category": "外框", "value": "填入實際外框規格"},
    {"category": "鏡頭造型", "value": "填入實際鏡頭規格"}
  ]
}

注意：
- ！！！極度重要：請【逐字完整照抄】圖片上的繁體中文文字，絕對不能自行猜測、翻譯或修改成相似的詞語。例如圖片寫「羅賓橘(不耐髒)」，就必須輸出「羅賓橘(不耐髒)」，絕對不能辨識為「羅家莊(不滅)」。
- caseName 請完整包含版本資訊（根據圖片實際文字，可能是 PRO 3、磁吸版、標準版 等）
- 動作按鍵和相機按鍵是不同的欄位，請分開辨識
- 若截圖中看不到某欄位，就不要包含在 specs 裡`
                },
                {
                    role: 'user',
                    content: [
                        {
                            type: 'text',
                            text: '請辨識這張截圖中的商品規格。請確保嚴格逐字照抄，不可有任何自行猜測修改的字眼。'
                        },
                        {
                            type: 'image_url',
                            image_url: {
                                url: `data:image/jpeg;base64,${base64Image}`
                            }
                        }
                    ]
                }
            ],
            max_tokens: 800,
            temperature: 0.1
        })
    });

    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
        throw new Error('No content received from OpenAI');
    }

    // 嘗試解析 JSON（GPT 有時會回傳帶有 markdown code block 的格式）
    let jsonStr = content.trim();
    const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
    }

    try {
        const parsed = JSON.parse(jsonStr);
        const result: RecognizedProductInfo = {
            phoneName: parsed.phoneName || parsed.phone_name || '',
            caseName: parsed.caseName || parsed.case_name || '',
            specs: Array.isArray(parsed.specs) ? parsed.specs.map((item: any) => ({
                category: String(item.category || item.name || ''),
                value: String(item.value || item.option || '')
            })) : []
        };

        // 針對特定欄位，若截圖中沒有辨識到，則強制補上「無選項」
        const requiredCategories = ['鏡頭造型', '相機按鍵', '動作按鍵'];
        requiredCategories.forEach(cat => {
            if (!result.specs.some(s => s.category.includes(cat))) {
                result.specs.push({ category: cat, value: '無選項' });
                console.log(`[AI Recognition] Missing ${cat}, explicitly adding "無選項"`);
            }
        });

        console.log('[AI Recognition] Recognized product info:', result);
        return result;
    } catch (e) {
        console.error('[AI Recognition] JSON parse error:', e, 'Raw content:', content);
        throw new Error('AI 辨識結果格式錯誤，請重試。');
    }
}

/**
 * 舊版 API 相容介面（保留給其他地方可能的引用）
 */
export async function recognizeSpecsFromImage(file: File): Promise<RecognizedSpec[]> {
    const info = await recognizeProductFromImage(file);
    return info.specs;
}

/**
 * Normalizes strings for better matching
 */
function normalizeString(str: string): string {
    return str.toLowerCase()
        .replace(/\s+/g, '')
        .trim();
}

/**
 * 模糊比對：判斷 a 和 b 是否夠相似
 */
function isFuzzyMatch(a: string, b: string): boolean {
    const na = normalizeString(a);
    const nb = normalizeString(b);
    return na === nb || na.includes(nb) || nb.includes(na);
}

export interface MappedSpecResult {
    /** 正常套入的選項 key → optionId */
    matched: Record<string, string>;
    /** 無法在選單中找到對應選項，改用文字填入的欄位 key → 識別到的文字 */
    textFallback: Record<string, string>;
}

/**
 * 將辨識到的 specs 對應到 OptionGroup subAttributes。
 * - 若找到對應選項 → 填入 option id
 * - 若分類匹配但選項不在清單 → 以文字填入（textFallback）
 * - 把結果合併回 selectedOptions
 */
export function mapRecognizedSpecs(
    recognized: RecognizedSpec[],
    groups: any[],
    selectedOptions: Record<string, string>
): { nextOptions: Record<string, string>; textFallback: Record<string, string> } {
    const nextOptions = { ...selectedOptions };
    const textFallback: Record<string, string> = {};
    let matchCount = 0;

    recognized.forEach(rec => {
        if (!rec.category || !rec.value) return;

        groups.forEach(group => {
            const subAttributes = group.subAttributes || [];
            const groupKey = group.code || group.id;
            const step = group.step || (group.uiConfig?.step) || 1;

            subAttributes.forEach((attr: any) => {
                // 分類名稱模糊比對
                if (!isFuzzyMatch(attr.name, rec.category)) return;

                const attrKey = step === 1 ? `${groupKey}:${attr.id}` : `${groupKey}:ca:${attr.id}`;

                if (attr.type === 'select' && attr.options?.length) {
                    // 先找完全匹配，再找模糊匹配
                    let matchedOption = attr.options.find((opt: any) =>
                        normalizeString(opt.name) === normalizeString(rec.value)
                    );
                    if (!matchedOption) {
                        matchedOption = attr.options.find((opt: any) =>
                            isFuzzyMatch(opt.name, rec.value)
                        );
                    }

                    if (matchedOption) {
                        nextOptions[attrKey] = matchedOption.id;
                        matchCount++;
                        console.log(`[AI] ✓ 匹配 ${rec.category} (${attr.name}) -> "${matchedOption.name}"`);
                    } else {
                        // 嘗試尋找並選擇「其他」
                        const otherOption = attr.options.find((opt: any) =>
                            normalizeString(opt.name) === '其他' || normalizeString(opt.name) === '其它'
                        );

                        if (otherOption) {
                            nextOptions[attrKey] = otherOption.id;
                            matchCount++;
                            // 依然保留 fallback 文字，以便 UI 仍能顯示橘色標記與原始辨識文字
                            textFallback[attrKey] = rec.value;
                            nextOptions[`${attrKey}_text_fallback`] = rec.value;
                            console.log(`[AI] ⚠ 找不到對應選項 ${rec.category} -> "${rec.value}"，自動選擇 "${otherOption.name}"`);
                        } else {
                            // 選單沒有這個顏色，也沒有「其他」 → 用文字標記，由 UI 顯示
                            textFallback[attrKey] = rec.value;
                            nextOptions[`${attrKey}_text_fallback`] = rec.value;
                            console.log(`[AI] ✗ 找不到對應選項 ${rec.category} -> "${rec.value}"，改用文字`);
                        }
                    }
                } else if (attr.type === 'text') {
                    // 文字型欄位直接填入
                    nextOptions[attrKey] = rec.value;
                    matchCount++;
                }
            });
        });
    });

    console.log(`[AI Recognition] Total matches: ${matchCount}, text fallbacks: ${Object.keys(textFallback).length}`);
    return { nextOptions, textFallback };
}
