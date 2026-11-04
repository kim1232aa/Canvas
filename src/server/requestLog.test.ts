import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { maskSecrets, requestLogLines, tokyoDate, writeRequestLog } from './requestLog';

describe('request log', () => {
  it('masks secrets to last 4 chars', () => {
    expect(maskSecrets({ Authorization: 'Bearer abcdefgh12345678', nested: { api_key: 'sk-aaaaaaaaWXYZ' }, prompt: 'use hf_abcdefghijk9876 here' }))
      .toEqual({ Authorization: '****5678', nested: { api_key: '****WXYZ' }, prompt: 'use ****9876 here' });
  });
  it('one line per upstream trace with history id; local stop when nothing went out', () => {
    const lines = requestLogLines('/api/x', [{ provider: 'p', method: 'POST', endpoint: 'https://u', requestBody: { a: 1 }, status: 403, responseBody: '<html>', durationMs: 5, keyUsage: { index: 0 } }, { stage: 'parameter-mapping' }], { historyItem: { id: 'hist_1' } }, 403);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ kind: 'upstream', status: 403, responseBody: '<html>', historyId: 'hist_1', lookup: false });
    expect(requestLogLines('/api/x', [], { error: 'bad JSON', errorSource: 'local' }, 400)[0]).toMatchObject({ kind: 'local-stop', error: 'bad JSON' });
  });
  it('writes JSONL under temp/logs with the Tokyo date', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'rl-'));
    const now = new Date('2026-11-04T15:30:00Z'); // 00:30 JST 11/05
    writeRequestLog(dir, [{ kind: 'upstream', route: '/r', status: 200 }], now);
    const f = path.join(dir, 'temp', 'logs', `requests-${tokyoDate(now)}.jsonl`);
    expect(tokyoDate(now)).toBe('2026-11-05');
    expect(JSON.parse(readFileSync(f, 'utf8').trim()).time).toBe('2026-11-05T00:30:00+09:00');
  });
});
