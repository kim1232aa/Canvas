import { describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', () => ({ fetchLiveModelsShared: vi.fn() }));
import { findLiveVideoModel, liveVideoOption } from './useLiveVideoModelMatch';

describe('live video catalog match (preset model → dropdown entry)', () => {
  it('selects the live catalog entry when the provider list contains the preset id', () => {
    const data = { wavespeed: [{ id: 'wavespeed-ai/wan-2.1/i2v-480p-lora-ultra-fast' }, { id: 'wavespeed-ai/wan-2.1/i2v-480p-lora', name: 'wavespeed-ai/wan-2.1/i2v-480p-lora' }] };
    expect(findLiveVideoModel(data, 'wavespeed', 'wavespeed-ai/wan-2.1/i2v-480p-lora')).toEqual({ value: 'wavespeed-ai/wan-2.1/i2v-480p-lora', label: 'wavespeed-ai/wan-2.1/i2v-480p-lora' });
  });
  it('never injects a model the live list lacks', () => {
    expect(findLiveVideoModel({ replicate: [{ id: 'wan-video/wan-2.5-i2v' }] }, 'replicate', 'wan-video/wan2.1-with-lora')).toBeUndefined();
    expect(findLiveVideoModel({}, 'muapi', 'wan2.1-lora-i2v')).toBeUndefined();
  });
  it('Replicate row label carries the latest_version that will be used', () => {
    expect(liveVideoOption({ id: 'wan-video/wan2.1-with-lora', latest_version: { id: 'c48fa8ec65b13e4c1e8e2c2f0d3b7a1e' } })!.label).toBe('wan-video/wan2.1-with-lora:c48fa8ec…');
  });
});
