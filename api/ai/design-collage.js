import Replicate from 'replicate';
import sharp from 'sharp';
import { setCors } from '../_cors.js';

export const config = {
  api: {
    bodyParser: {
        sizeLimit: '50mb', // JSON body limit
    },
  },
};

const MAX_DIMENSION = 2048;

async function processImage(buffer) {
    try {
        const image = sharp(buffer);
        const metadata = await image.metadata();

        if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
            image.resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside' });
        }

        const processedBuffer = await image.png().toBuffer();
        return `data:image/png;base64,${processedBuffer.toString('base64')}`;
    } catch (err) {
        throw new Error(`Image processing failed: ${err.message}`);
    }
}

// Helper: Normalize Output
function normalizeOutputToUrl(output) {
    if (!output) return null;
    if (typeof output === 'string' && output.startsWith('http')) return output;
    if (Array.isArray(output) && typeof output[0] === 'string') return output[0];
    if (output.url) return output.url;
    if (Array.isArray(output.output)) return output.output[0];
    if (typeof output.output === 'string') return output.output;
    return null;
}

// Helper: Run Prediction with Polling
async function runReplicatePrediction(replicate, modelString, input) {
    let versionId;
    
    if (modelString.includes(':')) {
        versionId = modelString.split(':')[1];
    } else {
        const [owner, name] = modelString.split('/');
        const model = await replicate.models.get(owner, name);
        versionId = model.latest_version.id;
    }

    const prediction = await replicate.predictions.create({
        version: versionId,
        input
    });

    let currentPrediction = prediction;
    while (currentPrediction.status === 'starting' || currentPrediction.status === 'processing') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        currentPrediction = await replicate.predictions.get(prediction.id);
    }

    return currentPrediction;
}

export default async function handler(req, res) {
    // 1. Always set CORS first
    setCors(req, res);

    // 2. Handle OPTIONS
    if (req.method === 'OPTIONS') {
        return res.status(204).end();
    }

    // 3. Reject non-POST
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            success: false, 
            code: 'METHOD_NOT_ALLOWED', 
            allow: ['POST'],
            message: 'Only POST method is allowed' 
        });
    }

    try {
        // 4. Check Env
        if (!process.env.REPLICATE_API_TOKEN) {
            return res.status(500).json({ success: false, code: 'MISSING_ENV', message: 'Missing REPLICATE_API_TOKEN' });
        }

        // 5. Parse Body
        const { images = [], stylePrompt, widthMm, heightMm, dpi: inputDpi, mode } = req.body || {};
        const isBackgroundOnly = mode === 'background';

        if (!isBackgroundOnly && (!Array.isArray(images) || images.length === 0)) {
            return res.status(400).json({ success: false, code: 'NO_IMAGES', message: '請至少上傳 1 張圖片' });
        }
        if (images.length > 5) {
            return res.status(400).json({ success: false, code: 'TOO_MANY_IMAGES', message: '最多上傳 5 張圖片' });
        }
        if (!stylePrompt) {
            return res.status(400).json({ success: false, code: 'NO_STYLE', message: '請選擇設計風格' });
        }

        // 6. Process Images
        const imageUris = [];
        for (const base64str of images) {
            try {
                let base64Data = base64str;
                if (base64str.includes('base64,')) {
                    base64Data = base64str.split('base64,')[1];
                }
                const buffer = Buffer.from(base64Data, 'base64');
                const uri = await processImage(buffer);
                imageUris.push(uri);
            } catch (imgErr) {
                return res.status(422).json({ success: false, code: 'IMAGE_PROCESS_ERROR', message: `圖片預處理失敗: ${imgErr.message}` });
            }
        }

        // 7. Prompt Generation
        const dpi = parseInt(inputDpi) || 300;
        const wMm = parseFloat(widthMm) || 0;
        const hMm = parseFloat(heightMm) || 0;

        let dimensionHint = '';
        let aspectRatioStr = "9:16";
        if (wMm > 0 && hMm > 0) {
            const ratio = wMm / hMm;
            if (ratio >= 1.5) aspectRatioStr = "16:9";
            else if (ratio >= 1.2) aspectRatioStr = "3:2";
            else if (ratio >= 0.8) aspectRatioStr = "1:1";
            else if (ratio >= 0.6) aspectRatioStr = "2:3";
            else aspectRatioStr = "9:16";

            const wPx = Math.round(wMm / 25.4 * dpi);
            const hPx = Math.round(hMm / 25.4 * dpi);
            dimensionHint = `Output image at ${wPx}x${hPx} pixels, print-ready quality at ${dpi} DPI, correct aspect ratio ${wMm}:${hMm}mm, high detail and sharp focus.`;
        }

        const fullPrompt = isBackgroundOnly
            ? [
                `Create a beautiful, abstract background or scenery fitting for a phone case design.`,
                `Style: ${stylePrompt}`,
                `Do NOT include any people, character subjects, or text. Just a pure stylistic background that seamlessly blends.`,
                dimensionHint,
            ].filter(Boolean).join(' ')
            : [
                `Create a beautiful, print-ready design collage using the provided ${images.length} photo(s).`,
                `Style: ${stylePrompt}`,
                `Layout: aesthetically balanced composition with seamless photo blending.`,
                `Output: high quality, vibrant colors suitable for phone case printing.`,
                `Keep all main subjects clearly visible.`,
                `Place all key subjects and faces in the lower 70% of the composition, away from the camera cutout area at the top. Keep the upper area decorative with patterns rather than important elements.`,
                dimensionHint,
            ].filter(Boolean).join(' ');

        // 8. Call Replicate
        const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
        
        let actualModel = "flux-kontext-apps/multi-image-list";
        const input = {
            prompt: fullPrompt,
            aspect_ratio: aspectRatioStr,
            output_format: "png",
        };

        if (isBackgroundOnly) {
            actualModel = "black-forest-labs/flux-schnell";
            // flux-schnell doesn't use input_images
        } else {
            input.input_images = imageUris;
            
            if (images.length <= 2) {
                actualModel = "flux-kontext-apps/multi-image-kontext-pro";
                delete input.input_images;
                input.input_image_1 = imageUris[0];
                if (imageUris[1]) {
                    input.input_image_2 = imageUris[1];
                }
            }
        }

        const prediction = await runReplicatePrediction(replicate, actualModel, input);
        const predictionId = prediction.id;

        if (prediction.status === 'failed' || prediction.status === 'canceled') {
             return res.status(422).json({
                 success: false,
                 code: 'MODEL_REJECTED',
                 message: prediction.error || 'AI Model Failed or Canceled',
                 predictionId
             });
        }

        const output = prediction.output;
        const url = normalizeOutputToUrl(output);

        if (!url) {
             return res.status(502).json({
                 success: false,
                 code: 'INVALID_OUTPUT',
                 message: 'AI succeeded but missing url',
                 predictionId
             });
        }

        return res.status(200).json({ success: true, url, predictionId });

    } catch (error) {
        console.error('API Error:', error);
        return res.status(500).json({ 
            success: false, 
            code: 'SERVER_ERROR', 
            message: error.message || 'Internal Server Error' 
        });
    }
}
