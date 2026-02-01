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
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.warn("⚠️ Supabase credentials missing in server/.env. Database operations may fail.");
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
app.use(cors());
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
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

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
        } catch {}
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
        } catch {}
    }

    // if object has href
    if (any && typeof any === 'object' && isProbablyUrl(any.href)) return any.href;

    // try common nested keys (both enumerable & non-enumerable access)
    const candidateKeys = ['url','image','href','output','result','data'];
    if (any && typeof any === 'object') {
        for (const k of candidateKeys) {
            try {
                const v = any[k];
                const u = await pickFirstUrl(v);
                if (u) return u;
            } catch {}
        }

        // Last resort：check if toString() returns a URL
        try {
            const s = any.toString?.();
            if (isProbablyUrl(s)) return s;
        } catch {}
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
app.post('/api/ai/cartoon', upload.single('image'), async (req, res) => {
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
            } catch (e) {}
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
            stack: error?.stack 
        });
    }
});

// 2. Remove Background
app.post('/api/ai/remove-bg', upload.single('image'), async (req, res) => {
    console.log(`[AI] HIT /api/ai/remove-bg (ID: ${BUILD_ID})`);
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
            stack: error?.stack 
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
