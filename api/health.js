export default function handler(req, res) {
  // 先在最外層就設 CORS，確保就算後面錯也有 header
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  try {
    res.status(200).json({ ok: true, time: new Date().toISOString() });
  } catch (e) {
    // 即使錯也要回 JSON + CORS（上面已設）
    res.status(500).json({ ok: false, error: String(e?.message || e) });
  }
}
