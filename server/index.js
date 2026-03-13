const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { createClient } = require('@supabase/supabase-js');
const db = require('./db');
const Replicate = require('replicate');
const multer = require('multer');
const sharp = require('sharp');
require('dotenv').config();

// Supabase Admin Client
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("⚠️ Supabase credentials missing. Database operations may fail.");
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const app = express();
const PORT = process.env.PORT || 3001;
const BUILD_ID = process.env.BUILD_ID || `server-${process.env.PORT || 3001}-${Date.now()}-FIXED-V2`;

// Config
const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const MAX_DIMENSION = 2048;

// Middleware
app.use(cors({
    origin: function (origin, callback) {
        const allowedOrigins = [
            'https://ppbears.com',
            'https://www.ppbears.com',
            'http://localhost:5173',
            'http://127.0.0.1:5173',
        ];
        // Allow requests with no origin (mobile apps, Postman in dev, server-to-server)
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Blocked request from origin: ${origin}`);
            callback(new Error('Not allowed by CORS'));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
}));
app.use((req, res, next) => {
    // Debug Log for Content-Type
    if (req.path.startsWith('/api/ai')) {
        console.log(`[DEBUG] Incoming ${req.method} ${req.path}`);
        console.log(`[DEBUG] Content-Type: ${req.headers['content-type']}`);
        // Note: req.body might not be populated yet if multer runs later, 
        // but express.json() is below, so let's move logging after parsing.
    }
    next();
});
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Identify Server Middleware & Body Debug
app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
        res.setHeader('x-ppbears-backend', BUILD_ID);
        if (req.path.startsWith('/api/ai')) {
            console.log(`[DEBUG] Parsed Body Keys:`, Object.keys(req.body || {}));
            if (req.body?.imageUrl) console.log(`[DEBUG] Found imageUrl in body: ${req.body.imageUrl.slice(0, 50)}...`);
        }
    }
    next();
});

// AI Endpoint Authentication Middleware
// Requires X-AI-Token header matching AI_ENDPOINT_SECRET env var
const AI_SECRET = process.env.AI_ENDPOINT_SECRET;
function requireAiAuth(req, res, next) {
    // Skip auth in development mode for convenience
    if (process.env.NODE_ENV === 'development' && !AI_SECRET) {
        return next();
    }
    const token = req.headers['x-ai-token'];
    if (!AI_SECRET || token !== AI_SECRET) {
        console.warn(`[AUTH] Unauthorized AI request from ${getClientIp(req)} to ${req.path}`);
        return res.status(401).json({ success: false, message: 'Unauthorized: invalid or missing AI token' });
    }
    next();
}

// Initialize Replicate
if (!process.env.REPLICATE_API_TOKEN) {
    console.error("❌ Error: Missing REPLICATE_API_TOKEN. Please set it in server/.env");
}
const replicate = new Replicate({
    auth: process.env.REPLICATE_API_TOKEN,
});

// Multer Setup (Memory Storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE_SIZE }
});

// Helper: Response Wrapper
function ok(res, payload) {
    res.setHeader('x-backend', BUILD_ID);
    return res.status(200).json({ buildId: BUILD_ID, success: true, ...payload });
}

function fail(res, message, extra = {}) {
    res.setHeader('x-backend', BUILD_ID);
    return res.status(500).json({ buildId: BUILD_ID, success: false, message, ...extra });
}

function isProbablyUrl(s) {
    return typeof s === 'string' && (
        s.startsWith('http://') ||
        s.startsWith('https://') ||
        s.startsWith('data:image/')
    );
}

function debugValue(v) {
    try {
        const ctor = v?.constructor?.name;
        const keys = v && typeof v === 'object' ? Object.keys(v) : [];
        const props = v && typeof v === 'object' ? Object.getOwnPropertyNames(v).slice(0, 50) : [];
        let str = null;
        try {
            const t = v?.toString?.();
            if (typeof t === 'string') str = t.slice(0, 500);
        } catch { }
        return { type: typeof v, ctor, keys, props, toString: str };
    } catch (e) {
        return { type: typeof v, error: String(e) };
    }
}

async function pickFirstUrl(any) {
    if (any == null) return null;

    // direct string
    if (isProbablyUrl(any)) return any;

    // URL instance
    if (typeof URL !== 'undefined' && any instanceof URL) {
        const s = any.toString();
        return isProbablyUrl(s) ? s : null;
    }

    // Replicate FileOutput / custom object with url() method (may return Promise)
    if (any && typeof any === 'object' && typeof any.url === 'function') {
        try {
            const u = await any.url();
            if (isProbablyUrl(u)) return u;
        } catch { }
    }

    // if object has href
    if (any && typeof any === 'object' && isProbablyUrl(any.href)) return any.href;

    // try common nested keys (both enumerable & non-enumerable access)
    const candidateKeys = ['url', 'image', 'href', 'output', 'result', 'data'];
    if (any && typeof any === 'object') {
        for (const k of candidateKeys) {
            try {
                const v = any[k];
                const u = await pickFirstUrl(v);
                if (u) return u;
            } catch { }
        }

        // Last resort：check if toString() returns a URL
        try {
            const s = any.toString?.();
            if (isProbablyUrl(s)) return s;
        } catch { }
    }

    // array
    if (Array.isArray(any)) {
        for (const item of any) {
            const u = await pickFirstUrl(item);
            if (u) return u;
        }
    }

    return null;
}

// Helper: Process Image (Resize & Convert to PNG)
const processImage = async (buffer) => {
    try {
        const image = sharp(buffer);
        const metadata = await image.metadata();

        if (metadata.width > MAX_DIMENSION || metadata.height > MAX_DIMENSION) {
            image.resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside' });
        }

        // Always convert to PNG for standardization
        const processedBuffer = await image.png().toBuffer();

        // Convert to Base64 Data URI for Replicate
        return `data:image/png;base64,${processedBuffer.toString('base64')}`;
    } catch (err) {
        throw new Error(`Image processing failed: ${err.message}`);
    }
};

// Routes
app.get('/', (req, res) => {
    res.send(`PPBears SaaS Backend is running! (ID: ${BUILD_ID})`);
});

// Health Check
app.get('/api/health', (req, res) => {
    // ok(res, { ok: true, ts: Date.now() });
    res.status(200).json({ ok: true, time: new Date().toISOString() });
});

// --- AI Endpoints ---

// Helper: Fetch Image Buffer from URL
async function fetchImageBuffer(url) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch image from URL: ${response.statusText}`);
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

// 1. Cartoonize
app.post('/api/ai/cartoon', requireAiAuth, upload.single('image'), async (req, res) => {
    console.log(`[AI] HIT /api/ai/cartoon (ID: ${BUILD_ID})`);
    try {
        let imageBuffer = null;

        // Case A: File Upload (Multipart)
        if (req.file && req.file.buffer) {
            console.log(`[AI] Source: File Upload (${req.file.size} bytes)`);
            imageBuffer = req.file.buffer;
        }
        // Case B: JSON Body with URL
        else if (req.body.imageUrl) {
            console.log(`[AI] Source: URL (${req.body.imageUrl})`);
            const fetchRes = await fetch(req.body.imageUrl);
            if (!fetchRes.ok) throw new Error(`Failed to fetch image: ${fetchRes.statusText}`);
            const arrayBuffer = await fetchRes.arrayBuffer();
            imageBuffer = Buffer.from(arrayBuffer);
        }

        if (!imageBuffer) {
            return fail(res, '未上傳圖片或無效的圖片連結', { errorCode: 'UPLOAD_FAILED' });
        }

        // Check API Key
        if (!process.env.REPLICATE_API_TOKEN) {
            return fail(res, 'Server configuration error (Missing API Key)', { errorCode: 'MISSING_ENV' });
        }

        // Parse meta options
        let meta = {};
        if (req.body.meta) {
            try {
                meta = typeof req.body.meta === 'string' ? JSON.parse(req.body.meta) : req.body.meta;
            } catch (e) { }
        }
        const styleId = meta.styleId || 'toon_ink';

        // Process Image
        const imageUri = await processImage(imageBuffer);

        // Model Selection
        let model = "";
        let input = { image: imageUri };

        if (styleId === 'toon_mochi') {
            model = "catacolabs/cartoonify:043a7a0bb103cd8ce5c63e64161eae63a99f01028b83aa1e28e53a42d86191d3";
        } else if (styleId === 'toon_anime') {
            model = "qwen-edit-apps/qwen-image-edit-plus-lora-photo-to-anime";
            input = { image: [imageUri], aspect_ratio: "match_input_image", output_format: "png", go_fast: true };
        } else {
            // Default: Ink
            model = "flux-kontext-apps/cartoonify:398ba4a9808131eae162741458435bcf145d03690cecef1467bdf81cc1ad654e";
            input = { input_image: imageUri, aspect_ratio: "match_input_image" };
        }

        console.log(`[AI] Calling Model: ${model}`);
        const result = await replicate.run(model, { input });
        console.log(`[AI] Replicate Output:`, result);

        // Extract Result
        const url = await pickFirstUrl(result);

        if (!url) {
            const dbg = debugValue(result);
            console.error('[AI] INVALID_OUTPUT debug:', dbg);
            return fail(res, 'AI succeeded but missing url (backend bug)', {
                errorCode: 'INVALID_OUTPUT',
                endpoint: '/api/ai/cartoon',
                rawDebug: dbg
            });
        }

        return ok(res, { url });

    } catch (error) {
        console.error('[AI] Error:', error);
        return fail(res, 'AI cartoon failed', {
            errorCode: 'AI_ERROR',
            endpoint: '/api/ai/cartoon',
            error: String(error?.message || error),
        });
    }
});

// 2. Remove Background
app.post('/api/ai/remove-bg', requireAiAuth, upload.single('image'), async (req, res) => {
    console.log(`[AI] HIT /api/ai/remove-bg (ID: ${BUILD_ID})`);
    try {
        let imageBuffer = null;

        // Case A: File Upload
        if (req.file && req.file.buffer) {
            console.log(`[AI] Source: File Upload (${req.file.size} bytes)`);
            imageBuffer = req.file.buffer;
        }
        // Case B: JSON Body with URL or Base64
        else if (req.body.imageUrl) {
            console.log(`[AI] Source: URL or Base64 (${req.body.imageUrl.substring(0, 30)}...)`);
            if (req.body.imageUrl.startsWith('data:image')) {
                const base64Data = req.body.imageUrl.split('base64,')[1];
                imageBuffer = Buffer.from(base64Data, 'base64');
            } else {
                const fetchRes = await fetch(req.body.imageUrl);
                if (!fetchRes.ok) throw new Error(`Failed to fetch image: ${fetchRes.statusText}`);
                const arrayBuffer = await fetchRes.arrayBuffer();
                imageBuffer = Buffer.from(arrayBuffer);
            }
        }

        if (!imageBuffer) {
            return fail(res, '未上傳圖片或無效的圖片連結', { errorCode: 'UPLOAD_FAILED' });
        }

        // Check API Key
        if (!process.env.REPLICATE_API_TOKEN) {
            return fail(res, 'Server configuration error (Missing API Key)', { errorCode: 'MISSING_ENV' });
        }

        // Process Image
        const imageUri = await processImage(imageBuffer);

        const model = "851-labs/background-remover:a029dff38972b5fda4ec5d75d7d1cd25aeff621d2cf4946a41055d7db66b80bc";
        const input = {
            image: imageUri,
            format: "png",
            background_type: "rgba"
        };

        console.log(`[AI] Calling Model: ${model}`);
        const result = await replicate.run(model, { input });
        console.log(`[AI] Replicate Output:`, result);

        const url = await pickFirstUrl(result);

        if (!url) {
            const dbg = debugValue(result);
            console.error('[AI] INVALID_OUTPUT debug:', dbg);
            return fail(res, 'AI succeeded but missing url (backend bug)', {
                errorCode: 'INVALID_OUTPUT',
                endpoint: '/api/ai/remove-bg',
                rawDebug: dbg
            });
        }

        return ok(res, { url });

    } catch (error) {
        console.error('[AI] Error:', error);
        return fail(res, 'AI remove-bg failed', {
            errorCode: 'AI_ERROR',
            endpoint: '/api/ai/remove-bg',
            error: String(error?.message || error),
        });
    }
});

// 2.5. Upscale / Enhance Image (Recraft Crisp Upscale)
app.post('/api/ai/upscale', requireAiAuth, upload.single('image'), async (req, res) => {
    console.log(`[AI] HIT /api/ai/upscale (ID: ${BUILD_ID})`);
    try {
        let imageBuffer = null;

        // Case A: File Upload
        if (req.file && req.file.buffer) {
            console.log(`[AI] Source: File Upload (${req.file.size} bytes)`);
            imageBuffer = req.file.buffer;
        }
        // Case B: JSON Body with URL
        else if (req.body.imageUrl) {
            console.log(`[AI] Source: URL (${req.body.imageUrl})`);
            const fetchRes = await fetch(req.body.imageUrl);
            if (!fetchRes.ok) throw new Error(`Failed to fetch image: ${fetchRes.statusText}`);
            const arrayBuffer = await fetchRes.arrayBuffer();
            imageBuffer = Buffer.from(arrayBuffer);
        }

        if (!imageBuffer) {
            return fail(res, '未上傳圖片或無效的圖片連結', { errorCode: 'UPLOAD_FAILED' });
        }

        // Use dedicated upscale API token
        const upscaleToken = process.env.REPLICATE_API_TOKEN_UPSCALE || process.env.REPLICATE_API_TOKEN;
        if (!upscaleToken) {
            return fail(res, 'Server configuration error (Missing API Key)', { errorCode: 'MISSING_ENV' });
        }
        const replicateUpscale = new Replicate({ auth: upscaleToken });

        // Process Image to Base64 (Standardization)
        let imageUri;
        try {
            imageUri = await processImage(imageBuffer);
        } catch (imgErr) {
            console.error('[AI] Image preprocessing failed:', imgErr);
            return fail(res, '圖片預處理失敗', { errorCode: 'IMAGE_PROCESS_ERROR' });
        }

        const model = "sczhou/codeformer:cc4956dd26fa5a7185d5660cc9100fab1b8070a1d1654a8bb5eb6d443b020bb2";
        const input = {
            image: imageUri,
            codeformer_fidelity: 0.7,
            background_enhance: true,
            face_upsample: true,
            upscale: 2
        };

        console.log(`[AI] Calling Model: ${model} (codeformer / 數位修復)`);
        const result = await replicateUpscale.run(model, { input });
        console.log(`[AI] Replicate Output:`, result);

        const url = await pickFirstUrl(result);

        if (!url) {
            const dbg = debugValue(result);
            console.error('[AI] INVALID_OUTPUT debug:', dbg);
            return fail(res, 'AI succeeded but missing url (backend bug)', {
                errorCode: 'INVALID_OUTPUT',
                endpoint: '/api/ai/upscale',
                rawDebug: dbg
            });
        }

        return ok(res, { url });

    } catch (error) {
        console.error('[AI] Error:', error);
        return fail(res, 'AI upscale failed', {
            errorCode: 'AI_ERROR',
            endpoint: '/api/ai/upscale',
            error: String(error?.message || error),
        });
    }
});


// 2.6. AI Design Collage (Multi-Image Fusion with FLUX Kontext)
app.post('/api/ai/design-collage', requireAiAuth, express.json({ limit: '50mb' }), async (req, res) => {
    console.log(`[AI] HIT /api/ai/design-collage (ID: ${BUILD_ID})`);
    try {
        // --- Validate inputs ---
        const { images = [], stylePrompt, widthMm, heightMm, dpi: inputDpi, mode } = req.body || {};
        const isBackgroundOnly = mode === 'background';

        if (!isBackgroundOnly && (!Array.isArray(images) || images.length === 0)) {
            return fail(res, '請至少上傳 1 張圖片', { errorCode: 'NO_IMAGES' });
        }
        if (images.length > 5) {
            return fail(res, '最多上傳 5 張圖片', { errorCode: 'TOO_MANY_IMAGES' });
        }
        if (!stylePrompt) {
            return fail(res, '請選擇設計風格', { errorCode: 'NO_STYLE' });
        }

        // Check API Key
        if (!process.env.REPLICATE_API_TOKEN) {
            return fail(res, 'Server configuration error (Missing API Key)', { errorCode: 'MISSING_ENV' });
        }

        // --- Process all images (which are now Base64 Data URIs) ---
        console.log(`[AI] Processing ${images.length} images for design collage...`);
        const imageUris = [];
        for (const base64str of images) {
            try {
                // Since processImage expects a buffer, we need to extract buffer from base64 string
                // format can be: "data:image/jpeg;base64,/9j/4AAQ..." or just pure base64
                let base64Data = base64str;
                if (base64str.includes('base64,')) {
                    base64Data = base64str.split('base64,')[1];
                }
                const buffer = Buffer.from(base64Data, 'base64');
                const uri = await processImage(buffer);
                imageUris.push(uri);
            } catch (imgErr) {
                console.error('[AI] Image preprocessing failed:', imgErr);
                return fail(res, `圖片預處理失敗: ${imgErr.message}`, { errorCode: 'IMAGE_PROCESS_ERROR' });
            }
        }

        // --- Build the prompt with product dimensions & mask awareness ---
        const dpi = parseInt(inputDpi) || 300;
        const wMm = parseFloat(widthMm) || 0;
        const hMm = parseFloat(heightMm) || 0;

        let dimensionHint = '';
        let aspectRatioStr = "9:16"; // Default standard phone case
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

        console.log(`[AI] Prompt: ${fullPrompt.substring(0, 200)}...`);

        // --- Call Replicate ---
        let actualModel = "flux-kontext-apps/multi-image-list";
        const input = {
            prompt: fullPrompt,
            aspect_ratio: aspectRatioStr,
            output_format: "png",
        };

        if (isBackgroundOnly) {
            // Text to image model for pure background
            actualModel = "black-forest-labs/flux-schnell";
            // flux-schnell doesn't use input_images
        } else {
            input.input_images = imageUris;
            
            // If only 1-2 images, use the cheaper Pro model
            if (images.length <= 2) {
                actualModel = "flux-kontext-apps/multi-image-kontext-pro";
                // Pro model uses input_image_1 / input_image_2 instead of input_images array
                delete input.input_images;
                input.input_image_1 = imageUris[0];
                if (imageUris[1]) {
                    input.input_image_2 = imageUris[1];
                }
            }
        }

        console.log(`[AI] Calling Model: ${actualModel} with ${images.length} image(s)`);
        const result = await replicate.run(actualModel, { input });
        console.log(`[AI] Replicate Output:`, result);

        const url = await pickFirstUrl(result);

        if (!url) {
            const dbg = debugValue(result);
            console.error('[AI] INVALID_OUTPUT debug:', dbg);
            return fail(res, 'AI succeeded but missing url (backend bug)', {
                errorCode: 'INVALID_OUTPUT',
                endpoint: '/api/ai/design-collage',
                rawDebug: dbg
            });
        }

        return ok(res, { url });

    } catch (error) {
        console.error('[AI] Design Collage Error:', error);
        return fail(res, 'AI 設計拼貼生成失敗', {
            errorCode: 'AI_ERROR',
            endpoint: '/api/ai/design-collage',
            error: String(error?.message || error),
        });
    }
});

// ─── AI Usage Tracking (IP-based, Supabase-backed) ───────────────────────────

// Helper: get client IP from request
function getClientIp(req) {
    return (
        req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
        req.headers['x-real-ip'] ||
        req.socket?.remoteAddress ||
        'unknown'
    );
}

// Helper: fetch/create usage row for ip+date, returns { count, limit }
async function getUsageRow(ip, productId) {
    const today = new Date().toISOString().split('T')[0];

    // Try to get existing row
    const { data, error } = await supabaseAdmin
        .from('ai_usage_log')
        .select('count')
        .eq('ip', ip)
        .eq('usage_date', today)
        .maybeSingle();

    if (error) throw error;
    return { count: data?.count ?? 0, date: today };
}

// GET /api/ai/usage-status?product_id=xxx
// Returns { count, limit, remaining, resetAt }
app.get('/api/ai/usage-status', async (req, res) => {
    try {
        const ip = getClientIp(req);
        const productId = req.query.product_id || null;

        let limit = 20; // v6.0: raised from 10 to 20
        if (productId) {
            const { data: prodData } = await supabaseAdmin
                .from('products')
                .select('specs')
                .eq('id', productId)
                .maybeSingle();
            if (prodData?.specs?.ai_usage_limit != null) {
                limit = prodData.specs.ai_usage_limit;
            }
        }

        const { count } = await getUsageRow(ip, productId);
        const remaining = Math.max(0, limit - count);

        // Reset at midnight local server time (Taiwan UTC+8)
        const now = new Date();
        const tomorrowMidnight = new Date(now);
        tomorrowMidnight.setUTCHours(16, 0, 0, 0); // UTC 16:00 = Taiwan 00:00
        if (tomorrowMidnight <= now) {
            tomorrowMidnight.setUTCDate(tomorrowMidnight.getUTCDate() + 1);
        }

        return res.json({
            success: true,
            count,
            limit,
            remaining,
            resetAt: tomorrowMidnight.toISOString(),
            ip: ip.replace(/\.\d+$/, '.xxx'), // Partially mask for privacy
        });
    } catch (err) {
        console.error('[Usage] GET usage-status error:', err);
        return res.status(500).json({ success: false, message: String(err.message) });
    }
});

// POST /api/ai/usage-check-increment
// Body: { product_id? }
// Returns { allowed: true, count, remaining } or { allowed: false, limitExceeded: true }
app.post('/api/ai/usage-check-increment', express.json(), async (req, res) => {
    try {
        const ip = getClientIp(req);
        const productId = req.body?.product_id || null;
        const cost = Math.max(1, parseInt(req.body?.cost ?? '1') || 1); // points consumed per action
        const today = new Date().toISOString().split('T')[0];

        let limit = 20; // v6.0: raised from 10 to 20
        if (productId) {
            const { data: prodData } = await supabaseAdmin
                .from('products')
                .select('specs')
                .eq('id', productId)
                .maybeSingle();
            if (prodData?.specs?.ai_usage_limit != null) {
                limit = prodData.specs.ai_usage_limit;
            }
        }

        // Upsert: increment count by 1 (but only if under limit)
        // First read current count
        const { data: existing } = await supabaseAdmin
            .from('ai_usage_log')
            .select('id, count')
            .eq('ip', ip)
            .eq('usage_date', today)
            .maybeSingle();

        const currentCount = existing?.count ?? 0;

        if (currentCount + cost > limit) {
            return res.json({
                success: true,
                allowed: false,
                limitExceeded: true,
                count: currentCount,
                limit,
                remaining: 0,
            });
        }

        // Atomically increment
        if (existing) {
            await supabaseAdmin
                .from('ai_usage_log')
                .update({ count: currentCount + cost, updated_at: new Date().toISOString() })
                .eq('id', existing.id);
        } else {
            await supabaseAdmin
                .from('ai_usage_log')
                .insert({ ip, usage_date: today, product_id: productId, count: cost });
        }

        const newCount = currentCount + cost;
        return res.json({
            success: true,
            allowed: true,
            count: newCount,
            limit,
            remaining: Math.max(0, limit - newCount),
        });
    } catch (err) {
        console.error('[Usage] POST usage-check-increment error:', err);
        // On server error, allow (fail open - don't block user due to DB issue)
        return res.json({ success: false, allowed: true, error: String(err.message) });
    }
});

// 3. Auto-Tag (Image Analysis for tagging using OpenAI GPT-4o-mini)
const OpenAI = require('openai');
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

app.post('/api/ai/auto-tag', express.json({ limit: '1mb' }), async (req, res) => {
    console.log(`[AI] HIT /api/ai/auto-tag (ID: ${BUILD_ID})`);
    try {
        const { imageUrl, existingTags } = req.body;

        if (!imageUrl) {
            return fail(res, '缺少 imageUrl 參數', { errorCode: 'MISSING_PARAM' });
        }

        if (!process.env.OPENAI_API_KEY) {
            return fail(res, 'Server configuration error (Missing OpenAI API Key)', { errorCode: 'MISSING_ENV' });
        }

        // ★ Download image on our server & compress to small base64
        // This avoids OpenAI's "Image size exceeds the limit" / timeout errors
        console.log(`[AI] Downloading image for auto-tag: ${imageUrl.slice(0, 80)}...`);
        const imgBuffer = await fetchImageBuffer(imageUrl);
        console.log(`[AI] Downloaded ${imgBuffer.length} bytes, compressing...`);

        // Resize to max 512px and convert to JPEG (much smaller than PNG for photos)
        const compressed = await sharp(imgBuffer)
            .resize(512, 512, { fit: 'inside' })
            .jpeg({ quality: 70 })
            .toBuffer();
        const imageDataUri = `data:image/jpeg;base64,${compressed.toString('base64')}`;
        console.log(`[AI] Compressed to ${compressed.length} bytes (${Math.round(compressed.length / 1024)}KB)`);

        // Build the prompt with existing tags for consistency
        const existingTagsStr = Array.isArray(existingTags) && existingTags.length > 0
            ? existingTags.join('、')
            : '';

        const userPrompt = existingTagsStr
            ? `分析這張圖片並產生標籤。系統已有標籤供參考：${existingTagsStr}`
            : `分析這張圖片並產生標籤。`;

        console.log(`[AI] Sending to OpenAI GPT-4o-mini...`);

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `你是圖片標籤產生器。請分析圖片後，嚴格按照以下順序產生 3~6 個繁體中文標籤：
第1個標籤：必須是圖片的整體主色調（例如：白色、粉色、藍色、木紋色、灰色、黑色）
第2個標籤：圖案材質或內容（例如：大理石、花朵、星空、木紋、幾何圖形）
第3個標籤：風格描述（例如：簡約、復古、可愛、奢華、自然）
第4~6個標籤（選填）：其他特徵描述

回覆規則：
- 只回覆一個 JSON 陣列，不要有任何其他文字
- 格式範例：["白色","大理石","簡約"]
- 第一個一定是顏色`
                },
                {
                    role: "user",
                    content: [
                        { type: "text", text: userPrompt },
                        {
                            type: "image_url",
                            image_url: {
                                url: imageDataUri,
                                detail: "low"
                            },
                        },
                    ],
                },
            ],
            max_tokens: 150,
            temperature: 0.3,
        });

        const rawText = response.choices[0].message.content;
        console.log(`[AI] OpenAI Output:`, rawText);

        // Extract JSON array from the response
        let tags = [];
        try {
            // Try to find a JSON array in the text
            const jsonMatch = rawText.match(/\[[\s\S]*?\]/);
            if (jsonMatch) {
                tags = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("AI did not return a JSON array");
            }
        } catch (parseErr) {
            console.warn('[AI] Failed to parse JSON from OpenAI output, trying comma split:', parseErr.message);
            // Fallback: split by commas or Chinese commas
            tags = rawText
                .replace(/[\[\]"']/g, '')
                .split(/[,、，\n]/)
                .map(t => t.trim())
                .filter(t => t.length > 0 && t.length < 20);
        }

        // Deduplicate and limit
        tags = [...new Set(tags)].slice(0, 6);

        console.log(`[AI] Final tags:`, tags);
        return ok(res, { tags });

    } catch (error) {
        console.error('[AI] Auto-tag Error:', error);
        return fail(res, 'AI auto-tag failed', {
            errorCode: 'AI_ERROR',
            endpoint: '/api/ai/auto-tag',
            error: String(error?.message || error)
        });
    }
});

// --- Existing Template Routes (LowDB) ---
app.get('/api/templates', (req, res) => {
    try {
        const templates = db.get('templates').value();
        res.json(templates);
    } catch (error) {
        res.status(500).json({ error: '無法讀取資料' });
    }
});

app.post('/api/templates', (req, res) => {
    try {
        const { name, canvasData, previewImage } = req.body;
        if (!canvasData) return res.status(400).json({ success: false, message: '缺少畫布數據' });

        const newTemplate = {
            id: uuidv4(),
            name: name || '未命名設計',
            canvasData,
            previewImage,
            createdAt: new Date().toISOString()
        };

        db.get('templates').push(newTemplate).write();
        console.log(`✅ Template Saved: ${newTemplate.id}`);
        res.status(200).json({ success: true, data: newTemplate });
    } catch (error) {
        console.error('❌ Save Error:', error);
        res.status(500).json({ success: false, message: error.message });
    }
});

// --- Product Categories (Supabase) ---
const normCategoryName = (s) => String(s || '').trim();
const sameNameCI = (a, b) => normCategoryName(a).toLowerCase() === normCategoryName(b).toLowerCase();

async function getCategorySiblings(parentId) {
    let q = supabaseAdmin.from('product_categories').select('id,name,sort_order,parent_id,layer_level');
    if (!parentId) q = q.is('parent_id', null);
    else q = q.eq('parent_id', parentId);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
}

app.get('/api/categories', async (req, res) => {
    try {
        const { data, error } = await supabaseAdmin
            .from('product_categories')
            .select('*')
            .order('parent_id', { ascending: true })
            .order('sort_order', { ascending: true });
        if (error) throw error;
        return res.json(data || []);
    } catch (error) {
        console.error('[Categories] GET failed:', error);
        return res.status(500).json({ success: false, message: String(error?.message || error) });
    }
});

app.post('/api/categories', async (req, res) => {
    try {
        const name = normCategoryName(req.body?.name);
        const parent_id = req.body?.parent_id || null;
        if (!name) return res.status(400).json({ success: false, message: 'Invalid name' });

        const siblings = await getCategorySiblings(parent_id);
        if (siblings.some((s) => sameNameCI(s.name, name))) {
            return res.status(400).json({ success: false, message: 'Duplicate category name under same parent' });
        }

        const maxSort = siblings.reduce((m, s) => Math.max(m, s.sort_order || 0), 0);
        let layer_level = 1;
        if (parent_id) {
            const { data: parent, error: parentErr } = await supabaseAdmin
                .from('product_categories')
                .select('layer_level')
                .eq('id', parent_id)
                .single();
            if (parentErr || !parent) return res.status(400).json({ success: false, message: 'Parent not found' });
            layer_level = (parent.layer_level || 1) + 1;
        }

        const payload = { name, parent_id, sort_order: maxSort + 1, layer_level };
        const { data, error } = await supabaseAdmin
            .from('product_categories')
            .insert([payload])
            .select()
            .single();
        if (error) throw error;
        return res.json(data);
    } catch (error) {
        console.error('[Categories] POST failed:', error);
        return res.status(500).json({ success: false, message: String(error?.message || error) });
    }
});

app.put('/api/categories/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const patch = {};
        if (req.body?.name !== undefined) {
            const name = normCategoryName(req.body.name);
            if (!name) return res.status(400).json({ success: false, message: 'Invalid name' });
            patch.name = name;
        }
        if (req.body?.parent_id !== undefined) patch.parent_id = req.body.parent_id || null;

        const { data: current, error: curErr } = await supabaseAdmin
            .from('product_categories')
            .select('id,name,parent_id,layer_level')
            .eq('id', id)
            .single();
        if (curErr || !current) return res.status(404).json({ success: false, message: 'Category not found' });

        const nextParentId = patch.parent_id !== undefined ? patch.parent_id : current.parent_id;
        const nextName = patch.name !== undefined ? patch.name : current.name;
        const siblings = await getCategorySiblings(nextParentId);
        if (siblings.some((s) => String(s.id) !== String(id) && sameNameCI(s.name, nextName))) {
            return res.status(400).json({ success: false, message: 'Duplicate category name under same parent' });
        }

        if (patch.parent_id !== undefined) {
            if (nextParentId) {
                const { data: parent, error: parentErr } = await supabaseAdmin
                    .from('product_categories')
                    .select('layer_level')
                    .eq('id', nextParentId)
                    .single();
                if (parentErr || !parent) return res.status(400).json({ success: false, message: 'Parent not found' });
                patch.layer_level = (parent.layer_level || 1) + 1;
            } else {
                patch.layer_level = 1;
            }
        }

        const { data, error } = await supabaseAdmin
            .from('product_categories')
            .update(patch)
            .eq('id', id)
            .select()
            .single();
        if (error) throw error;
        return res.json(data);
    } catch (error) {
        console.error('[Categories] PUT failed:', error);
        return res.status(500).json({ success: false, message: String(error?.message || error) });
    }
});

app.delete('/api/categories/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const { error } = await supabaseAdmin.from('product_categories').delete().eq('id', id);
        if (error) throw error;
        return res.json({ success: true });
    } catch (error) {
        console.error('[Categories] DELETE failed:', error);
        return res.status(500).json({ success: false, message: String(error?.message || error) });
    }
});

app.patch('/api/categories/reorder', async (req, res) => {
    try {
        const parent_id = req.body?.parent_id || null;
        const ordered_ids = Array.isArray(req.body?.ordered_ids) ? req.body.ordered_ids.map(String) : [];
        if (ordered_ids.length === 0) return res.status(400).json({ success: false, message: 'ordered_ids required' });

        const siblings = await getCategorySiblings(parent_id);
        const siblingIds = new Set(siblings.map((s) => String(s.id)));
        if (!ordered_ids.every((id) => siblingIds.has(String(id)))) {
            return res.status(400).json({ success: false, message: 'ordered_ids contains non-sibling ids' });
        }

        for (let i = 0; i < ordered_ids.length; i++) {
            const id = ordered_ids[i];
            const { error } = await supabaseAdmin.from('product_categories').update({ sort_order: i + 1 }).eq('id', id);
            if (error) throw error;
        }

        return res.json({ success: true });
    } catch (error) {
        console.error('[Categories] REORDER failed:', error);
        return res.status(500).json({ success: false, message: String(error?.message || error) });
    }
});
// --- Product Image Deletion ---
app.post('/api/products/:id/delete-image', async (req, res) => {
    const { id } = req.params;
    const { target } = req.body; // "base", "mask", or "all"

    console.log(`[Product] Deleting image for product ${id}, target: ${target}`);

    try {
        // 1. Get current product data to find storage path
        const { data: product, error: fetchError } = await supabaseAdmin
            .from('products')
            .select('base_image, mask_image, specs')
            .eq('id', id)
            .single();

        if (fetchError || !product) {
            return fail(res, '找不到該產品', { errorCode: 'PRODUCT_NOT_FOUND' });
        }

        const updates = {};
        const pathsToDelete = [];

        // Helper to extract path and prepare update
        const extractStoragePath = (url) => {
            if (!url) return null;
            const buckets = ['models', 'products', 'design-assets', 'design-previews'];
            for (const bucket of buckets) {
                const delimiter = `/storage/v1/object/public/${bucket}/`;
                if (url.includes(delimiter)) {
                    return { bucket, path: url.split(delimiter)[1] };
                }
            }
            return null;
        };

        if (target === 'base' || target === 'all') {
            if (product.base_image) {
                const info = extractStoragePath(product.base_image);
                if (info) pathsToDelete.push(info);
            }
            updates.base_image = null;

            // Handle specs JSONB
            if (product.specs) {
                if (!updates.specs) updates.specs = { ...product.specs };
                delete updates.specs.base_image;
                delete updates.specs.base_image_path;
            }
        }

        if (target === 'mask' || target === 'all') {
            if (product.mask_image) {
                const info = extractStoragePath(product.mask_image);
                if (info) pathsToDelete.push(info);
            }
            updates.mask_image = null;

            // Handle specs JSONB
            if (product.specs) {
                if (!updates.specs) updates.specs = { ...product.specs };
                delete updates.specs.mask_image;
                delete updates.specs.mask_image_path;
            }
        }

        // 2. Update DB
        const { error: updateError } = await supabaseAdmin
            .from('products')
            .update(updates)
            .eq('id', id);

        if (updateError) {
            console.error('[DB] Update Error:', updateError);
            return fail(res, '更新資料庫失敗', { errorCode: 'DB_UPDATE_FAILED', details: updateError });
        }

        // 3. Delete from Storage (Service Role)
        const storageErrors = [];
        for (const item of pathsToDelete) {
            console.log(`[Storage] Deleting ${item.path} from bucket ${item.bucket}`);
            const { error: storageError } = await supabaseAdmin.storage
                .from(item.bucket)
                .remove([item.path]);
            if (storageError) {
                console.error(`[Storage] Failed to delete ${item.path}:`, storageError);
                storageErrors.push({ path: item.path, error: storageError.message });
            }
        }

        if (storageErrors.length > 0) {
            return res.status(200).json({
                success: true,
                message: '資料庫已更新，但部分儲存空間檔案刪除失敗',
                storageErrors
            });
        }

        return ok(res, { message: '圖片刪除成功' });

    } catch (error) {
        console.error('[Product] Delete Image Error:', error);
        return fail(res, '伺服器發生錯誤', { error: error.message });
    }
});

// 404 Fallback for /api
app.use('/api/*', (req, res) => {
    fail(res, `API Route not found: ${req.method} ${req.originalUrl}`, { errorCode: 'NOT_FOUND' });
});

// Global Error Handler (Multer)
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(413).json({
                success: false,
                code: 'FILE_TOO_LARGE',
                maxMB: 4,
                error: 'File too large (max 4MB)'
            });
        }
    }
    console.error('Unhandled Error:', err);
    res.status(500).json({ success: false, code: 'SERVER_ERROR', error: err.message });
});


// Start Server (Vercel Support)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 Server running on http://localhost:${PORT}`);
        console.log(`🆔 BUILD_ID: ${BUILD_ID}`);
    });
}

module.exports = app;
