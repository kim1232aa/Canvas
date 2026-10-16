import { describe, it, expect } from 'vitest';
import { hasOutputMedia } from './historyParameters';
describe('failed records are never media', () => {
  it('failed 403 with any url/placeholder is not output media', () => {
    expect(hasOutputMedia({ id: 'a', status: 'failed', url: '/api/media/x', upstreamStatus: 403 } as any)).toBe(false);
    expect(hasOutputMedia({ id: 'b', status: 'local_blocked', url: 'data:image/png;base64,AA' } as any)).toBe(false);
    expect(hasOutputMedia({ id: 'c', status: 'failed', url: '' } as any)).toBe(false);
    expect(hasOutputMedia({ id: 'd', url: '/api/media/ok' } as any)).toBe(true);
  });
});
