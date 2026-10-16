import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchLiveModels, getStoredApiKeys, saveStoredApiKeys } from './api';
import { readFileSync } from 'node:fs';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, val: string) => store.set(key, String(val)),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
});

describe('Gemini catalog key wiring', () => {
  beforeEach(() => {
    store.clear();
    vi.restoreAllMocks();
  });

  it('fetchLiveModels attaches x-gemini-key when geminiKey is stored', async () => {
    const keys = getStoredApiKeys();
    keys.geminiKey = 'browser-gemini-key';
    saveStoredApiKeys(keys);
    let captured: Record<string, string> = {};
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      captured = (init?.headers as Record<string, string>) || {};
      return new Response(JSON.stringify({ results: { gemini: [] } }), { status: 200 });
    }));
    await fetchLiveModels('gemini', '', 'Checkpoint');
    expect(captured['x-gemini-key']).toBe('browser-gemini-key');
  });

  it('server catalog resolves gemini via x-gemini-key before env/settings', () => {
    const serverSource = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
    const idx = serverSource.indexOf('// 8. Google Gemini & Imagen Real Dynamic Models Endpoint');
    const slice = serverSource.slice(idx, idx + 1200);
    expect(slice).toContain("req.headers['x-gemini-key']");
    expect(slice).toContain("keyPoolManager.getNextKey('gemini'");
    // Header path must appear before bare env fallback in this block
    expect(slice.indexOf("req.headers['x-gemini-key']")).toBeLessThan(slice.indexOf('process.env.GEMINI_API_KEY'));
  });
});
