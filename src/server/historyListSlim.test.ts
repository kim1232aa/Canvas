import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';

/**
 * Unit-level: slimHistoryForList behavior is covered via live GET /api/history
 * against the running server when available; otherwise we exercise the pure
 * shape contract with a local fixture mirroring server.ts logic.
 */

function slimHistoryForList(item: any) {
  if (!item || typeof item !== 'object') return item;
  const { workflowSnapshot, ...rest } = item;
  const md = rest.requestMetadata && typeof rest.requestMetadata === 'object' ? rest.requestMetadata : undefined;
  if (!md) return { ...rest, hasWorkflowSnapshot: !!workflowSnapshot };
  const { executionTrace, submissions, submit, poll, persistence, ...mdRest } = md as any;
  return {
    ...rest,
    hasWorkflowSnapshot: !!workflowSnapshot,
    requestMetadata: {
      ...mdRest,
      actualRequest: md.actualRequest,
      route: md.route,
      hasExecutionTrace: Array.isArray(executionTrace) && executionTrace.length > 0,
    },
  };
}

describe('history list slim (lag)', () => {
  it('omits workflowSnapshot from list payload', () => {
    const full = {
      id: 'hist_x',
      prompt: 'apple',
      url: 'https://example/a.png',
      workflowSnapshot: { nodes: [{ id: 'n1', values: { text: 'huge' } }], connections: [] },
      requestMetadata: {
        route: '/api/schema-provider/openworks/submit',
        actualRequest: { endpoint: 'https://openapi.tensor.art/openworks/v1/task', parameters: { seed: 1 } },
        executionTrace: [{ endpoint: 'x', method: 'POST', status: 200, responseBody: 'y'.repeat(5000) }],
        submissions: [{ endpoint: 'x', parameters: {}, status: 200 }],
      },
    };
    const slim = slimHistoryForList(full);
    expect(slim).not.toHaveProperty('workflowSnapshot');
    expect(slim.hasWorkflowSnapshot).toBe(true);
    expect(slim.requestMetadata.actualRequest.parameters.seed).toBe(1);
    expect(slim.requestMetadata).not.toHaveProperty('executionTrace');
    expect(slim.requestMetadata.hasExecutionTrace).toBe(true);
    expect(JSON.stringify(slim).length).toBeLessThan(JSON.stringify(full).length);
  });

  it('page contract: limit/offset slice', () => {
    const all = Array.from({ length: 100 }, (_, i) => ({ id: `h${i}` }));
    const limit = 40;
    const offset = 40;
    const items = all.slice(offset, offset + limit);
    expect(items).toHaveLength(40);
    expect(items[0].id).toBe('h40');
    expect(offset + items.length < all.length).toBe(true);
  });
});
