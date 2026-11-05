import { describe, expect, it } from 'vitest';
import {
  canvasNodeId,
  clearVideoJobStatus,
  latestVideoJobStatus,
  readVideoJobByNode,
  readVideoJobCredential,
  readVideoJobStatus,
  resetVideoJobStatusForTests,
  updateVideoJobStatus,
} from './videoJobStatus';

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

  it('keeps two jobs on the same provider on separate lines and looks them up by jobId or nodeId', () => {
    resetVideoJobStatusForTests();
    updateVideoJobStatus({ jobId: 'a', provider: 'krea', phase: 'running', upstreamStatus: 'one', budgetMs: 600_000, nodeId: 'node-a' });
    updateVideoJobStatus({ jobId: 'b', provider: 'krea', phase: 'running', upstreamStatus: 'two', budgetMs: 600_000, nodeId: 'node-b' });
    expect(readVideoJobStatus('a')?.text).toContain('one');
    expect(readVideoJobStatus('b')?.text).toContain('two');
    expect(readVideoJobByNode('node-a')?.jobId).toBe('a');
    expect(readVideoJobByNode('node-b')?.jobId).toBe('b');
    expect(latestVideoJobStatus('krea')?.jobId).toBe('b');
  });

  it('stores the submit key for cancel and never puts it on the public snapshot', () => {
    resetVideoJobStatusForTests();
    const publicView = updateVideoJobStatus({
      jobId: 'k1', provider: 'civitai', phase: 'running', budgetMs: 600_000, credential: 'secret-key',
    });
    expect(publicView).not.toHaveProperty('credential');
    expect(readVideoJobStatus('k1')).not.toHaveProperty('credential');
    expect(readVideoJobCredential('k1')).toBe('secret-key');
  });

  it('reads the canvas executing node id from the workflow snapshot', () => {
    expect(canvasNodeId({ workflowSnapshot: { executingNodeId: 'n1' } })).toBe('n1');
    expect(canvasNodeId({ workflowSnapshot: { executingNodeId: '  ' } })).toBeUndefined();
    expect(canvasNodeId({})).toBeUndefined();
  });
});
