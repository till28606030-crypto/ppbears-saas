export function getApiOrigin() {
  const env = import.meta.env.VITE_API_ORIGIN;
  if (env) return env.replace(/\/$/, "");
  // fallback: same origin (for dev proxy or if backend is on same domain)
  return window.location.origin;
}

export function apiUrl(path: string) {
  const origin = getApiOrigin();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${origin}${p}`;
}
