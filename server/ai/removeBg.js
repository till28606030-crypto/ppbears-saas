const Replicate = require('replicate');
const sharp = require('sharp');

const MAX_DIMENSION = 2048;

const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

function isProbablyUrl(s) {
    return typeof s === 'string' && (
        s.startsWith('http://') ||
        s.startsWith('https://') ||
        s.startsWith('data:image/')
    );
}

async function pickFirstUrl(any) {
    if (any == null) return null;
    if (isProbablyUrl(any)) return any;
    if (typeof URL !== 'undefined' && any instanceof URL) {
        const s = any.toString();
        return isProbablyUrl(s) ? s : null;
    }
    if (any && typeof any === 'object' && typeof any.url === 'function') {
        try {
            const u = await any.url();
            if (isProbablyUrl(u)) return u;
        } catch {}
    }
    if (any && typeof any === 'object' && isProbablyUrl(any.href)) return any.href;
    const candidateKeys = ['url','image','href','output','result','data'];
    if (any && typeof any === 'object') {
        for (const k of candidateKeys) {
            try {
                const v = any[k];
                const u = await pickFirstUrl(v);
                if (u) return u;
            } catch {}
        }
        try {
            const s = any.toString?.();
            if (isProbablyUrl(s)) return s;
        } catch {}
    }
    if (Array.isArray(any)) {
        for (const item of any) {
            const u = await pickFirstUrl(item);
            if (u) return u;
        }
    }
    return null;
}

const processImage = async (buffer) => {
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
};

async function processRemoveBg(buffer) {
    if (!process.env.REPLICATE_API_TOKEN) {
        throw new Error('MISSING_ENV: REPLICATE_API_TOKEN');
    }

    const imageUri = await processImage(buffer);
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
        throw new Error('INVALID_OUTPUT: AI succeeded but missing url');
    }
    return url;
}

module.exports = { processRemoveBg };
