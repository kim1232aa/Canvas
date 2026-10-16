// 2026-10-15 画布 FE round clean-0903 (/workspace/canvas-e2e-clean-0903): items 1, 2, 4, 5.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sharedGetJson, clearSharedGet, beginSharedGetAction, peekSharedGet } from '../services/sharedGet';
import { ensureModelSchema, getModelSchemaEntry } from '../services/modelSchemaCache';
import { SchemaProviderDriver } from '../engines/drivers/SchemaProviderDriver';
import { ApiTraceError } from '../services/executionTrace';
import { isLocalBlockError } from './apiFailure';

let MODEL = '';
let URL_ = '';
const useModel = (m: string) => { MODEL = m; URL_ = `/api/model-schema?provider=wavespeed&model=${encodeURIComponent(m)}`; };
const schemaGets = (f: any) => f.mock.calls.filter((c: any[]) => String(c[0]) === URL_).length;
const stub = (schemaStatus = 200) => {
  const f = vi.fn(async (url: any, init?: any) => {
    if (String(url) === URL_) return new Response(schemaStatus === 200 ? '{"inputSchema":{"properties":{"prompt":{},"seed":{}}}}' : '{"error":"boom"}', { status: schemaStatus });
    if (init?.method === 'POST') return new Response('{"error":"stop here"}', { status: 400 });
    return new Response('{}', { status: 200 });
  });
  vi.stubGlobal('fetch', f);
  return f;
};

describe('1+2 action-scoped Schema GET: mount/hydrate 0, selection 1, run 1', () => {
  afterEach(() => { vi.unstubAllGlobals(); clearSharedGet(); });
  for (const status of [200, 500]) it(`loader mount + selection + run path (Schema ${status})`, async () => {
    useModel(`wavespeed-ai/test-${status}`);
    const f = stub(status);
    // Mount / hydrate: badges (ensureModelSchema without fetchImpl) and editors (peek) never fetch.
    ensureModelSchema('wavespeed', MODEL);
    expect(peekSharedGet(URL_, {})).toBeUndefined();
    expect(f).toHaveBeenCalledTimes(0);
    expect(getModelSchemaEntry('wavespeed', MODEL)).toBeUndefined();
    // User selects the model: node editor + inspector editor + badge cache → ONE GET (failure included).
    beginSharedGetAction();
    await Promise.allSettled([sharedGetJson(URL_, {}), sharedGetJson(URL_, {})]);
    ensureModelSchema('wavespeed', MODEL);
    await Promise.allSettled([sharedGetJson(URL_, {})]);
    expect(schemaGets(f)).toBe(1);
    // Run: new action → exactly one more GET even though editor + driver both need it.
    beginSharedGetAction();
    await Promise.allSettled([sharedGetJson(URL_, {})]);
    await new SchemaProviderDriver('wavespeed').generate({ model: MODEL, prompt: 'p' } as any, {}).catch(() => {});
    expect(schemaGets(f)).toBe(2);
  });
});

describe('4 local-block classification survives a historyItem in the body', () => {
  it('status:"local_blocked" inside historyItem does not hide the local block', () => {
    const body = { error: 'Venice 需要模型', errorSource: 'local', localNotOutbound: true, historyItem: { status: 'local_blocked', error: 'x' } };
    const e = new ApiTraceError(400, body, '/api/schema-provider/venice/submit', JSON.stringify(body));
    expect(e.upstreamStatus).toBeNull();
    expect(isLocalBlockError(e)).toBe(true);
    const up = new ApiTraceError(502, { errorSource: 'upstream', upstreamStatus: 500 }, '/x', '{}');
    expect(isLocalBlockError(up)).toBe(false);
  });
});

import { groupPollingRuns, pollGroupLine } from '../components/ExecutionLog';
describe('6e polling GETs collapse into one group row', () => {
  it('consecutive successful task GETs of one route → one group; submit stays its own row', () => {
    const t = (id: number, route: string, method = 'GET', state = 'complete') => ({ id, method, route, state, status: 200 }) as any;
    const g = groupPollingRuns([t(1, '/api/schema-provider/wavespeed/tasks/a'), t(2, '/api/schema-provider/wavespeed/tasks/a'), t(3, '/api/schema-provider/wavespeed/tasks/a'), t(4, '/api/schema-provider/wavespeed/submit', 'POST')]);
    expect(g.length).toBe(2);
    expect(Array.isArray(g[0]) && g[0].length).toBe(3);
    expect(pollGroupLine(g[0] as any)).toBe('GET /api/schema-provider/wavespeed/tasks/a · 轮询 3 次 · HTTP 200（点开查看每次）');
  });
});

import { schemaSendStatus } from './schemaSendStatus';
describe('6d Schema unavailable wording', () => {
  it('failed Schema → 「Schema 不可用，字段不会发送」 status, not 待确认', () => {
    expect(schemaSendStatus('together', 'steps', 20, JSON.stringify({ _canvas: { schemaUnavailable: true } }))).toBe('schema_unavailable');
  });
});
