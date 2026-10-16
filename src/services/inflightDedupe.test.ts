import { afterEach, describe, expect, it, vi } from 'vitest';
import { tracedFetch, getExecutions, tracedGetInFlightSize } from './executionTrace';
import { fetchLiveModels, liveModelsInFlightSize } from './api';

afterEach(() => { vi.unstubAllGlobals(); });

describe('in-flight GET dedupe (StrictMode double effect)', () => {
  it('two identical GETs while pending → one network call, one exec-log record, both callers get a body', async () => {
    let resolve!: (r: Response) => void;
    const fetchMock = vi.fn(() => new Promise<Response>((r) => { resolve = r; }));
    vi.stubGlobal('fetch', fetchMock);
    const before = getExecutions().length;
    const a = tracedFetch('/api/models?provider=venice&category=lora', { headers: { x: '1' } });
    const b = tracedFetch('/api/models?provider=venice&category=lora', { headers: { x: '1' } });
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    resolve(new Response('{"ok":true,"n":1}', { status: 200 }));
    const [ra, rb] = await Promise.all([a, b]);
    expect(await ra.json()).toEqual({ ok: true, n: 1 });
    expect(await rb.json()).toEqual({ ok: true, n: 1 });
    expect(getExecutions().length - before).toBe(1);
    expect(tracedGetInFlightSize()).toBe(0);
    // settled → next identical call fetches fresh (no caching)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"n":2}', { status: 200 })));
    expect(await (await tracedFetch('/api/models?provider=venice&category=lora', { headers: { x: '1' } })).json()).toEqual({ n: 2 });
  });
  it('different key or POST is not deduped; errors propagate to both callers', async () => {
    const fetchMock = vi.fn(async () => new Response('{"error":"x"}', { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await Promise.allSettled([tracedFetch('/api/models?p=1'), tracedFetch('/api/models?p=1'), tracedFetch('/api/models?p=2')]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(r.every((x) => x.status === 'rejected')).toBe(true);
    const post = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', post);
    await Promise.all([tracedFetch('/api/x', { method: 'POST', body: '{}' }), tracedFetch('/api/x', { method: 'POST', body: '{}' })]);
    expect(post).toHaveBeenCalledTimes(2);
  });
  it('fetchLiveModels: same args twice → one call, same result object', async () => {
    const fetchMock = vi.fn(async () => new Response('{"venice":[]}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
    const [a, b] = await Promise.all([fetchLiveModels('venice', '', 'LORA', 'lora'), fetchLiveModels('venice', '', 'LORA', 'lora')]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(a).toBe(b);
    expect(liveModelsInFlightSize()).toBe(0);
  });
});
