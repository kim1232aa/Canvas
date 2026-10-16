/** URL-type LoRA id → last path segment (file name, query/hash dropped); non-URL names unchanged. Full value goes to title. */
export function loraDisplayName(name: unknown): string {
  const v = typeof name === 'string' ? name.trim() : String(name ?? '');
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(v)) return v;
  try {
    const seg = new URL(v).pathname.split('/').filter(Boolean).pop();
    return seg ? decodeURIComponent(seg) : v;
  } catch { return v; }
}
