import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchRefineModelCatalog,
  getRefineModelSelection,
  refinePromptWithGemini,
  saveRefineModelSelection,
  subscribeRefineModelSelection,
  getStoredApiKeys,
  saveStoredApiKeys,
} from './api';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, String(value)),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
});

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('refine model selection and request', () => {
  it('persists the selected provider/model in current and legacy storage for reloads', () => {
    const keys = getStoredApiKeys();
    keys.geminiKey = 'configured-gemini-key';
    saveStoredApiKeys(keys);
    const selection = saveRefineModelSelection('gemini', 'runtime-model-id');

    expect(selection).toEqual({ provider: 'gemini', model: 'runtime-model-id' });
    expect(getRefineModelSelection()).toEqual(selection);
    expect(JSON.parse(store.get('comfycanvas_api_keys') || '{}')).toMatchObject({ refineProvider: 'gemini', refineModel: 'runtime-model-id' });
    expect(store.get('comfycanvas_refine_provider')).toBe('gemini');
    expect(store.get('comfycanvas_refine_model')).toBe('runtime-model-id');
  });

  it('notifies mounted selectors when selection changes', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeRefineModelSelection(listener);
    saveRefineModelSelection('dynamic-provider', 'dynamic-model');
    unsubscribe();

    expect(listener).toHaveBeenCalledWith({ provider: 'dynamic-provider', model: 'dynamic-model' });
  });

  it('builds picker options from the live configured model catalog without embedding model names', async () => {
    const keys = getStoredApiKeys();
    keys.geminiKey = 'unique-live-catalog-key';
    saveStoredApiKeys(keys);
    const rows = [
      { id: 'runtime-chat-model-1', name: 'Runtime Chat Model', category: 'Edit', type: 'Reasoning' },
      { id: 'image-endpoint', name: 'Image Endpoint', category: 'Checkpoint', type: 'Checkpoint' },
    ];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/refine-prompt/capabilities')) {
        expect((init?.headers as Record<string, string>)['x-gemini-key']).toBe('unique-live-catalog-key');
        return new Response(JSON.stringify({ providers: [{ provider: 'gemini', label: 'Google Gemini', catalog: 'live' }, { provider: 'agnes', label: 'Agnes AI', catalog: 'manual' }] }), { status: 200 });
      }
      expect(url).toContain('/api/models?provider=gemini');
      return new Response(JSON.stringify({ results: { gemini: rows }, _pagination: {} }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const catalog = await fetchRefineModelCatalog(true);

    expect(catalog.providers).toEqual([
      { provider: 'gemini', label: 'Google Gemini', catalog: 'live' },
      { provider: 'agnes', label: 'Agnes AI', catalog: 'manual' },
    ]);
    expect(catalog.options).toEqual([
      { provider: 'gemini', model: 'runtime-chat-model-1', label: 'Runtime Chat Model' },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('sends the exact selected provider, model, prompt and preserves upstream failure status/body', async () => {
    const raw = '{"error":{"code":429,"message":"quota exceeded"}}';
    let requestBody: Record<string, unknown> = {};
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body));
      return new Response(raw, { status: 429, statusText: 'Too Many Requests', headers: { 'content-type': 'application/json' } });
    }));

    const error = await refinePromptWithGemini('a lighthouse above the foggy coast at dawn', {
      provider: 'live_provider',
      model: 'runtime-chat-model-1',
    }).then(() => { throw new Error('expected refine request to reject'); }, (value) => value as Error & { status?: number; responseBody?: string });

    expect(requestBody).toMatchObject({
      prompt: 'a lighthouse above the foggy coast at dawn',
      provider: 'live_provider',
      model: 'runtime-chat-model-1',
    });
    expect(error.status).toBe(429);
    expect(error.responseBody).toBe(raw);
    expect(error.message).toContain('429');
  });
});
