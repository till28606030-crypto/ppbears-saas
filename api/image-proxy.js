import sharp from 'sharp';
import { setCors } from '../_cors.js';

export const config = {
  api: {
    responseLimit: '15mb',
  },
};

export default async function handler(req, res) {
  // CORS needed if frontend requests images directly via JS, though img tags don't strictly require it
  setCors(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const { url, w, q } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  if (!url.startsWith('http')) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const width = w ? parseInt(w, 10) : 800;
    const quality = q ? parseInt(q, 10) : 80;

    // Fetch the original image
    const response = await fetch(url);
    if (!response.ok) {
      console.error(`[Image Proxy] Failed to fetch image: ${url}, Status: ${response.status}`);
      return res.redirect(url); // Fallback to original
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('image')) {
      return res.redirect(url); // Not an image
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Compress using sharp
    // We auto-convert to JPEG to save space for opaque images, 
    // but if it's a PNG that might have transparency, we might want to keep it PNG?
    // Let's use webp for best size/quality if supported, or stick to resize
    const optimizedBuffer = await sharp(buffer)
      .resize({ width, withoutEnlargement: true })
      .webp({ quality }) // webp handles both transparency and compression excellently
      .toBuffer();

    // Cache heavily at the edge and browser for 1 year
    res.setHeader('Cache-Control', 'public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=86400');
    res.setHeader('Content-Type', 'image/webp');
    
    return res.send(optimizedBuffer);
  } catch (error) {
    console.error('[Image Proxy] Error processing image:', error);
    // On any error (e.g. sharp fails to parse format), fallback to original url
    return res.redirect(url);
  }
}
