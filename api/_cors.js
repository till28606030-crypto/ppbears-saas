export function setCors(req, res) {
    const allowedOrigins = [
        'https://ppbears.com',
        'https://www.ppbears.com',
        'http://localhost:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:5174'
    ];

    const origin = req.headers.origin;
    
    // Dynamic Origin Check
    if (origin) {
        if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
    } else {
         // Fallback for non-browser tools or missing header
         res.setHeader('Access-Control-Allow-Origin', 'https://ppbears.com');
    }

    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
}
