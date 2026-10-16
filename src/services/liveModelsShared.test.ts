import { afterEach, expect, it, vi } from 'vitest';
import { fetchLiveModelsShared } from './api';
afterEach(() => vi.unstubAllGlobals());
it('checkpoint list: 5 sequential mounts with same key → 1 GET; force (刷新目录) → +1', async () => {
  const f = vi.fn(async () => new Response('{"wavespeed":[]}', { status: 200 }));
  vi.stubGlobal('fetch', f);
  vi.stubGlobal('localStorage', { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  for (let i = 0; i < 5; i++) await fetchLiveModelsShared(false, 'wavespeed', '', 'Checkpoint', 'checkpoint', 'downloads', '', 1, 50, '', '');
  expect(f).toHaveBeenCalledTimes(1);
  await fetchLiveModelsShared(true, 'wavespeed', '', 'Checkpoint', 'checkpoint', 'downloads', '', 1, 50, '', '');
  expect(f).toHaveBeenCalledTimes(2);
});
