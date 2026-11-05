import { describe, expect, it } from 'vitest';
import { videoCancelPlan, videoProgressLine } from './videoJobControl';

describe('video cancel plans', () => {
  it('uses the Fal cancel_url with PUT', () => {
    expect(videoCancelPlan({ provider: 'fal', jobId: 'r1', cancelUrl: 'https://queue.fal.run/fal-ai/wan/requests/r1/cancel' }))
      .toEqual({ method: 'PUT', url: 'https://queue.fal.run/fal-ai/wan/requests/r1/cancel' });
  });

  it('builds the documented Replicate, Civitai, Krea and Sogni cancel calls', () => {
    const replicate = videoCancelPlan({ provider: 'replicate', jobId: 'p1' });
    const civitai = videoCancelPlan({ provider: 'civitai', jobId: 'wf1' });
    const krea = videoCancelPlan({ provider: 'krea', jobId: 'j1' });
    const sogni = videoCancelPlan({ provider: 'sogni', jobId: 'wf2' });
    if ('unsupported' in replicate || 'unsupported' in civitai || 'unsupported' in krea || 'unsupported' in sogni) {
      throw new Error('documented cancel provider was marked unsupported');
    }
    expect(replicate.url).toBe('https://api.replicate.com/v1/predictions/p1/cancel');
    expect(civitai).toEqual({ method: 'PUT', url: 'https://orchestration.civitai.com/v2/consumer/workflows/wf1', body: { status: 'canceled' } });
    expect(krea).toMatchObject({ method: 'DELETE', url: 'https://api.krea.ai/jobs/j1' });
    expect(sogni).toEqual({ method: 'POST', url: 'https://api.sogni.ai/v1/creative-agent/workflows/wf2/cancel' });
  });

  it('refuses to pretend a cancel for providers whose fetched docs have none', () => {
    for (const provider of ['nanogpt', 'wavespeed', 'muapi', 'novita', 'together', 'aimlapi', 'venice']) {
      const plan = videoCancelPlan({ provider, jobId: 'x' });
      expect('unsupported' in plan).toBe(true);
    }
  });
});

describe('video progress line', () => {
  it('names the phase, the upstream status, and the local clock separately', () => {
    expect(videoProgressLine({ phase: 'running', upstreamStatus: 'IN_PROGRESS', elapsedMs: 125_000, budgetMs: 600_000 }))
      .toBe('生成中。上游状态 IN_PROGRESS。本地已等待 125 秒 / 600 秒。');
  });
});
