import { describe, expect, it } from 'vitest';
import { historyHeaderCounts, historyFilterCounts, filterHistory, SCHEMA_FETCH_FILTER } from './HistoryModal';
import { isSchemaFetchFailure } from '../utils/historyParameters';

// Shapes copied from data/history.json 2026-10-17 (OpenWorks, Tensor CDN timeout).
const schemaFail = (id: string): any => ({
  id, status: 'failed', url: '', provider: 'openworks', upstreamStatus: 500,
  upstreamEndpoint: 'GET /api/model-schema?provider=openworks&model=photoreal_studio_z_image',
  errorSource: 'prefetch',
  requestMetadata: { route: '/api/history/prefetch-failure', prefetch: { method: 'GET', url: '/api/model-schema?provider=openworks&model=photoreal_studio_z_image', status: 500 }, postSent: false },
});
const genFail: any = { id: 'g', status: 'failed', url: '', upstreamStatus: 500, errorSource: 'upstream', upstreamEndpoint: 'https://openapi.tensor.art/openworks/v1/task', requestMetadata: { route: '/api/schema-provider/openworks/submit' } };
const ok = (id: string): any => ({ id, url: '/media/x.png', requestMetadata: { route: '/api/schema-provider/openworks/save-result' } });
const blocked: any = { id: 'b', status: 'local_blocked', url: '', requestMetadata: { postSent: false } };

describe('hist-count: parameter-table GET failures are not 出图失败', () => {
  const hist = [ok('o1'), ok('o2'), genFail, ok('o3'), schemaFail('s1'), schemaFail('s2'), ok('o4')];

  it('isSchemaFetchFailure uses structural fields only', () => {
    expect(isSchemaFetchFailure(schemaFail('s'))).toBe(true);
    expect(isSchemaFetchFailure({ ...schemaFail('s'), errorSource: null } as any)).toBe(true); // requestMetadata.prefetch alone
    expect(isSchemaFetchFailure({ ...schemaFail('s'), requestMetadata: {} } as any)).toBe(true); // errorSource alone
    expect(isSchemaFetchFailure(genFail)).toBe(false);
    expect(isSchemaFetchFailure(blocked)).toBe(false); // local block of a generation is still a generation attempt
    expect(isSchemaFetchFailure(ok('o'))).toBe(false);
    // URL text alone does not make it a schema failure (no URL matching)
    expect(isSchemaFetchFailure({ ...genFail, upstreamEndpoint: 'GET /api/model-schema?x' })).toBe(false);
  });

  it('header: today\'s history reads 上游失败 1, 查参数表失败 2 (was 上游失败 3)', () => {
    expect(historyHeaderCounts(hist)).toEqual({ output: 4, failed: 1, localBlocked: 0, schemaFetch: 2, nonOutput: 1 });
    expect(historyHeaderCounts([...hist, blocked])).toEqual({ output: 4, failed: 1, localBlocked: 1, schemaFetch: 2, nonOutput: 2 });
  });

  it('filters: 失败 only holds generation records; schema cards stay in 全部 and in their own chip', () => {
    const c = historyFilterCounts(hist);
    expect(c).toEqual({ all: 7, output: 4, failed: 1, schema: 2 });
    expect(c.all).toBe(c.output + c.failed + c.schema);
    expect(filterHistory(hist, 'failed').map((i) => i.id)).toEqual(['g']);
    expect(filterHistory(hist, 'schema').map((i) => i.id)).toEqual(['s1', 's2']);
    expect(filterHistory(hist, 'all').map((i) => i.id)).toContain('s1');
    expect(SCHEMA_FETCH_FILTER).toEqual(['schema', '查参数表失败']);
  });
});
