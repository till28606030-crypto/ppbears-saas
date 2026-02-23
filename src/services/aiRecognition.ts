export interface RecognizedSpec {
    category: string;
    value: string;
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
 */
export async function recognizeSpecsFromImage(file: File): Promise<RecognizedSpec[]> {
    if (!OPENAI_API_KEY) {
        throw new Error('OpenAI API Key is missing. Please check your environment variables.');
    }

    console.log('[AI Recognition] Starting OpenAI Vision recognition for:', file.name);

    try {
        const base64Image = await fileToBase64(file);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    {
                        role: 'system',
                        content: 'You are a product specification expert. You will receive a screenshot of a product configuration table (likely from Devilcase or RhinoShield). Extract all attribute-value pairs and return them as a clean JSON array. Example output: [{"category": "外框", "value": "透明"}, {"category": "按鍵組", "value": "黑色"}]. Only return the JSON array, no extra text.'
                    },
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'text',
                                text: 'Please extract the specifications from this screenshot.'
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
                max_tokens: 500,
                response_format: { type: 'json_object' }
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

        // The response might be wrapped in an object depending on the prompt
        let parsed = JSON.parse(content);

        // If it's an object like { "specifications": [...] }, extract the list
        if (!Array.isArray(parsed)) {
            const key = Object.keys(parsed)[0];
            if (Array.isArray(parsed[key])) {
                parsed = parsed[key];
            } else {
                // Try to find any array property
                const arrayKey = Object.keys(parsed).find(k => Array.isArray(parsed[k]));
                if (arrayKey) parsed = parsed[arrayKey];
            }
        }

        if (Array.isArray(parsed)) {
            console.log('[AI Recognition] Successfully recognized:', parsed);
            return parsed.map((item: any) => ({
                category: String(item.category || item.name || ''),
                value: String(item.value || item.option || '')
            }));
        }

        return [];
    } catch (error) {
        console.error('[AI Recognition] Recognition failed:', error);
        throw error;
    }
}

/**
 * Normalizes strings for better matching by removing common suffixes and symbols.
 */
function normalizeString(str: string): string {
    return str.toLowerCase()
        .replace(/顏色|組|造型|型|鏡頭|按鍵|組件/g, '') // Remove common suffixes
        .replace(/\s+/g, '')             // Remove spaces
        .trim();
}

/**
 * Matches recognized specs to internal OptionGroups and SubAttributes.
 */
export function mapRecognizedSpecs(
    recognized: RecognizedSpec[],
    groups: any[],
    selectedOptions: Record<string, string>
): Record<string, string> {
    const nextOptions = { ...selectedOptions };
    let matchCount = 0;

    recognized.forEach(rec => {
        const normCategory = normalizeString(rec.category);
        const normValue = normalizeString(rec.value);

        if (!normCategory || !normValue) return;

        groups.forEach(group => {
            const subAttributes = group.subAttributes || [];

            // Match Sub-Attribute Names (Advanced Options)
            subAttributes.forEach((attr: any) => {
                const normAttrName = normalizeString(attr.name);

                // Fuzzy match for category
                if (normAttrName.includes(normCategory) || normCategory.includes(normAttrName)) {
                    // Find option within this attribute
                    const matchedOption = attr.options?.find((opt: any) => {
                        const normOptName = normalizeString(opt.name);
                        return normOptName.includes(normValue) || normValue.includes(normOptName);
                    });

                    if (matchedOption) {
                        const groupKey = group.code || group.id;
                        const step = group.step || 1;
                        // Format depends on Step 1 vs Step 2+
                        const key = step === 1 ? `${groupKey}:${attr.id}` : `${groupKey}:ca:${attr.id}`;

                        // Only update if not already set or we want to overwrite
                        nextOptions[key] = matchedOption.id;
                        matchCount++;
                        console.log(`[AI Recognition] Matched ${rec.category} -> ${attr.name}: ${matchedOption.name}`);
                    }
                }
            });
        });
    });

    if (matchCount > 0) {
        console.log(`[AI Recognition] Total matches: ${matchCount}`);
    }

    return nextOptions;
}
