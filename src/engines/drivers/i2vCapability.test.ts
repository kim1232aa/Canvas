// The three drivers must route img2video (was: 「尚未接入 [img2video]」) and send the video fields as filled.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { tracedFetch } from '../../services/executionTrace';
import { ReplicateDriver } from './ReplicateDriver';
import { SchemaProviderDriver } from './SchemaProviderDriver';

vi.mock('../../services/executionTrace', () => ({ tracedFetch: vi.fn(), isApiTraceError: () => false, recordLocalEvent: vi.fn() }));
vi.mock('../../services/sharedGet', () => ({ sharedGetJson: vi.fn(async () => ({ ok: true, status: 200, data: {} })), peekSharedGetMeta: () => undefined }));
const mockFetch = vi.mocked(tracedFetch);
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } });
const base = { prompt: 'p', image_url: 'data:image/png;base64,AAAA', isVideo: true, videoDuration: 5, videoFps: 16, seed: 7, cfg: 4,
  loras: [{ name: 'https://h/l.safetensors', path: 'https://h/l.safetensors', strength: 1 }] };

afterEach(() => { mockFetch.mockReset(); vi.useRealTimers(); });

describe('img2video capability', () => {
  for (const id of ['wavespeed', 'muapi'] as const) {
    it(`${id}: submits duration/fps/image/loras to the Schema route and reports a video`, async () => {
      vi.useFakeTimers();
      mockFetch.mockImplementation(async (url: any) => String(url).endsWith('/submit')
        ? json({ taskId: 't', pollUrl: '/poll' })
        : String(url) === '/poll' ? json({ status: 'completed', outputs: ['https://cdn/x.mp4'] }) : json({ historyItems: [] }));
      const p = new SchemaProviderDriver(id).generate({ ...base, model: id === 'muapi' ? 'wan2.1-lora-i2v' : 'wavespeed-ai/wan-2.1/i2v-480p-lora' } as any, {});
      await vi.advanceTimersByTimeAsync(2500);
      const out = await p;
      const body = JSON.parse(String((mockFetch.mock.calls[0][1] as any).body));
      expect(mockFetch.mock.calls[0][0]).toBe(`/api/schema-provider/${id}/submit`);
      expect(body).toMatchObject({ image_url: base.image_url, duration: 5, fps: 16, seed: 7, cfg: 4, loras: [{ path: 'https://h/l.safetensors', strength: 1 }] });
      expect(out.mediaType).toBe('video');
    });
  }
  it('replicate: sends isVideo + video fields to /api/engine/replicate/generate and reports a video', async () => {
    mockFetch.mockResolvedValue(json({ mediaUrl: 'data:video/mp4;base64,AAAA' }));
    const out = await new ReplicateDriver().generate({ ...base, model: 'wan-video/wan2.1-with-lora', videoFrames: 81 } as any, {});
    expect(mockFetch.mock.calls[0][0]).toBe('/api/engine/replicate/generate');
    const body = JSON.parse(String((mockFetch.mock.calls[0][1] as any).body));
    expect(body).toMatchObject({ model: 'wan-video/wan2.1-with-lora', image_url: base.image_url, isVideo: true, duration: 5, fps: 16, num_frames: 81, seed: 7, loras: [{ path: 'https://h/l.safetensors', strength: 1 }] });
    expect(out.mediaType).toBe('video');
  });
  it('replicate: upstream error text reaches the node verbatim', async () => {
    mockFetch.mockResolvedValue(json({ error: 'Replicate 图像接口上游 HTTP 402: {"detail":"Insufficient credit"}' }, 402));
    await expect(new ReplicateDriver().generate({ ...base, model: 'wan-video/wan2.1-with-lora' } as any, {})).rejects.toThrow('HTTP 402: {"detail":"Insufficient credit"}');
  });
});
