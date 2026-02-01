import Replicate from 'replicate';
import sharp from 'sharp';
import { setCors } from '../_cors.js';

export const config = {
  api: {
    bodyParser: {
        sizeLimit: '4mb', // JSON body limit
    },
  },
};

// Helper: Process Image
const MAX_DIMENSION = 2048;

async function processImageFromUrl(imageUrl) {
    try {
        // 1. Fetch Image
        const response = await fetch(imageUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 2. Resize/Convert
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
    // 1) if typeof output === "string" && output.startsWith("http") => url = output
    if (typeof output === 'string' && output.startsWith('http')) return output;
    
    // 2) if Array.isArray(output) && typeof output[0] === "string" => url = output[0]
    if (Array.isArray(output) && typeof output[0] === 'string') return output[0];
    
    // 3) if output?.url => url = output.url
    if (output.url) return output.url;
    
    // 4) if output?.output is array => url = output.output[0]
    if (Array.isArray(output.output)) return output.output[0];
    
    // 5) if output?.output is string => url = output.output
    if (typeof output.output === 'string') return output.output;
    
    // 6) other => null
    return null;
}

// Helper: Run Prediction with Polling
async function runReplicatePrediction(replicate, modelString, input) {
    let versionId;
    
    if (modelString.includes(':')) {
        versionId = modelString.split(':')[1];
    } else {
        // Fetch latest version if not provided
        console.log(`[AI] Resolving latest version for ${modelString}...`);
        const [owner, name] = modelString.split('/');
        const model = await replicate.models.get(owner, name);
        versionId = model.latest_version.id;
    }

    console.log(`[AI] Creating prediction with version: ${versionId}`);
    const prediction = await replicate.predictions.create({
        version: versionId,
        input
    });

    console.log(`[AI] Prediction Created: ${prediction.id}`);

    // Poll for completion
    let currentPrediction = prediction;
    while (currentPrediction.status === 'starting' || currentPrediction.status === 'processing') {
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1s delay
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
        const { imageUrl } = req.body || {};
        if (!imageUrl) {
            return res.status(400).json({ success: false, code: 'MISSING_IMAGE_URL', message: 'Missing imageUrl in body' });
        }

        // 6. Process Logic
        const replicate = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
        const imageUri = await processImageFromUrl(imageUrl);
        
        const model = "851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc";
        const input = { 
            image: imageUri,
            format: "png",
            background_type: "rgba" 
        };

        console.log(`[AI] Calling Model: ${model}`);
        
        // Use custom runner instead of replicate.run
        const prediction = await runReplicatePrediction(replicate, model, input);
        const predictionId = prediction.id;

        console.log(`[AI] Prediction Finished. Status: ${prediction.status}`);

        // Handle Replicate Failures
        if (prediction.status === 'failed' || prediction.status === 'canceled') {
             return res.status(422).json({
                 success: false,
                 code: 'MODEL_REJECTED',
                 message: prediction.error || 'AI Model Failed or Canceled',
                 predictionId
             });
        }

        const output = prediction.output;
        console.log(`[AI] Replicate Output:`, output);

        const url = normalizeOutputToUrl(output);

        if (!url) {
             // 502 INVALID_OUTPUT
             return res.status(502).json({
                 success: false,
                 code: 'INVALID_OUTPUT',
                 message: 'AI succeeded but missing url',
                 predictionId,
                 outputType: Array.isArray(output) ? 'array' : typeof output,
                 outputKeys: output && typeof output === 'object' ? Object.keys(output) : []
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
