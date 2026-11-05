import { describe, expect, it } from 'vitest';
import { clearVideoJobStatus, latestVideoJobStatus, resetVideoJobStatusForTests, updateVideoJobStatus } from './videoJobStatus';

describe('video job status store', () => {
  it('records one running job per provider and drops it when the job ends', () => {
    resetVideoJobStatusForTests();
    for (const provider of ['fal', 'nanogpt', 'civitai', 'replicate', 'krea', 'sogni']) {
      updateVideoJobStatus({ jobId: `${provider}-1`, provider, phase: 'running', upstreamStatus: 'processing', budgetMs: 600_000, now: 1_000 });
      const found = latestVideoJobStatus(provider, 1_000);
      expect(found?.jobId).toBe(`${provider}-1`);
      expect(found?.text).toContain('processing');
      expect(found?.text).toContain('600 秒');
      clearVideoJobStatus(`${provider}-1`);
      expect(latestVideoJobStatus(provider, 1_000)).toBeUndefined();
    }
  });

  it('drops an abandoned job once its budget plus the grace has passed', () => {
    resetVideoJobStatusForTests();
    updateVideoJobStatus({ jobId: 'left-behind', provider: 'krea', phase: 'queued', upstreamStatus: 'queued', budgetMs: 600_000, now: 0 });
    expect(latestVideoJobStatus('krea', 600_000)?.jobId).toBe('left-behind');
    expect(latestVideoJobStatus('krea', 600_000 + 60_000)).toBeUndefined();
  });
});
