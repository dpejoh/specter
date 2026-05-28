const fetchCache = new Map<string, { data: unknown; expiry: number }>();

export function escapeHtml(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function shellEscape(str: string): string {
  return "'" + String(str).replace(/'/g, `'"'"'`) + "'";
}

export async function fetchJson<T>(url: string, ttlMs = 0): Promise<T | null> {
  if (ttlMs > 0) {
    const cached = fetchCache.get(url);
    if (cached && cached.expiry > Date.now()) return cached.data as T;
  }
  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = await res.json();
    if (ttlMs > 0) fetchCache.set(url, { data, expiry: Date.now() + ttlMs });
    return data as T;
  } catch (e) {
    console.warn('Fetch failed:', url, e);
    return null;
  }
}

export function setText(id: string, value: string) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}
