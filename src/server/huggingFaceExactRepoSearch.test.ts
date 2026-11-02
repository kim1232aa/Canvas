import { describe, expect, it, vi } from 'vitest';
import { lookupExactHuggingFaceRepo } from './huggingFaceExactRepoSearch';

describe('HF exact repository supplement search', () => {
  it('adds an exact result and skips the request when broad results already contain it', async () => {
    const fetchExact = vi.fn(async () => new Response(JSON.stringify({ id: 'alice/model' }), { status: 200 }));
    const found = await lookupExactHuggingFaceRepo('alice/model', [], fetchExact);
    expect(found.model).toEqual({ id: 'alice/model' });
    expect(fetchExact).toHaveBeenCalledOnce();

    const alreadyFound = await lookupExactHuggingFaceRepo('alice/model', [{ id: 'ALICE/MODEL' }], fetchExact);
    expect(alreadyFound).toEqual({});
    expect(fetchExact).toHaveBeenCalledOnce();
  });

  it('keeps a non-2xx status/body and endpoint as a partial-search error', async () => {
    const result = await lookupExactHuggingFaceRepo('alice/model', [{ id: 'alice/other' }], async () => new Response('token required', { status: 401 }));
    expect(result).toMatchObject({ error: { errorSource: 'upstream', status: 401, details: 'token required', endpoint: expect.stringContaining('/api/models/alice/model?') } });
  });

  it('marks fetch failures as no-HTTP errors and response parsing failures with their HTTP status', async () => {
    const network = await lookupExactHuggingFaceRepo('alice/model', [], async () => { throw new Error('socket reset'); });
    expect(network.error).toMatchObject({ errorSource: 'network', status: null });
    expect(network.error?.error).toContain('socket reset');

    const invalidJson = await lookupExactHuggingFaceRepo('alice/model', [], async () => new Response('not json', { status: 200 }));
    expect(invalidJson.error).toMatchObject({ errorSource: 'local', status: 200, details: 'not json' });
    expect(invalidJson.error?.error).toContain('JSON');
  });
});
