import { describe, it, expect } from 'vitest';
import fs, { readFileSync, mkdtempSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { transformSync } from 'esbuild';

// Extract and test WaveSpeed balance response parser
function parseWavespeedBalanceResponse(body: any): { balance?: number; error?: string } {
  if (body.code === 200 && body.data?.balance !== undefined) {
    return { balance: body.data.balance };
  }
  return { error: `WaveSpeed 响应格式异常: ${JSON.stringify(body).slice(0, 150)}` };
}

// Extract and test AIMLAPI balance response parser
function parseAimlapiBalanceResponse(body: any): { balance?: number; error?: string } {
  if (body.current_balance !== undefined) {
    return { balance: body.current_balance };
  }
  return { error: `AIMLAPI 响应格式异常: ${JSON.stringify(body).slice(0, 150)}` };
}

// Extract and test cloud settings payload builder for Base URL fields
function buildCloudSettingsPayload(keys: Record<string, any>, allowedFields: Set<string>): Record<string, string> {
  const payload: Record<string, string> = {};
  for (const field of allowedFields) {
    const value = keys[field];
    if (typeof value === 'string' && value.trim() && !value.includes('...') && !value.includes('***')) {
      payload[field] = value.trim();
    }
  }
  return payload;
}

describe('WaveSpeed balance response parser', () => {
  it('parses successful response with balance field', () => {
    const mockResponse = {
      code: 200,
      message: 'success',
      data: { balance: 50.25 }
    };
    const result = parseWavespeedBalanceResponse(mockResponse);
    expect(result.balance).toBe(50.25);
    expect(result.error).toBeUndefined();
  });

  it('returns error for missing balance field', () => {
    const mockResponse = {
      code: 200,
      message: 'success',
      data: {}
    };
    const result = parseWavespeedBalanceResponse(mockResponse);
    expect(result.balance).toBeUndefined();
    expect(result.error).toContain('WaveSpeed 响应格式异常');
  });

  it('returns error for missing data object', () => {
    const mockResponse = {
      code: 200,
      message: 'success'
    };
    const result = parseWavespeedBalanceResponse(mockResponse);
    expect(result.balance).toBeUndefined();
    expect(result.error).toContain('WaveSpeed 响应格式异常');
  });

  it('returns error for non-200 code', () => {
    const mockResponse = {
      code: 400,
      message: 'error',
      data: { balance: 50.25 }
    };
    const result = parseWavespeedBalanceResponse(mockResponse);
    expect(result.balance).toBeUndefined();
    expect(result.error).toContain('WaveSpeed 响应格式异常');
  });
});

describe('AIMLAPI balance response parser', () => {
  it('parses successful response with current_balance field', () => {
    const mockResponse = {
      user_id: 111,
      email: 'user@example.com',
      current_balance: 100.5,
      currency: 'USD',
      autotopup_settings: {
        is_enabled: true,
        threshold: 50,
        amount: 100,
        currency: 'USD'
      }
    };
    const result = parseAimlapiBalanceResponse(mockResponse);
    expect(result.balance).toBe(100.5);
    expect(result.error).toBeUndefined();
  });

  it('returns error for missing current_balance field', () => {
    const mockResponse = {
      user_id: 111,
      email: 'user@example.com',
      currency: 'USD'
    };
    const result = parseAimlapiBalanceResponse(mockResponse);
    expect(result.balance).toBeUndefined();
    expect(result.error).toContain('AIMLAPI 响应格式异常');
  });

  it('accepts zero balance', () => {
    const mockResponse = {
      current_balance: 0,
      currency: 'USD'
    };
    const result = parseAimlapiBalanceResponse(mockResponse);
    expect(result.balance).toBe(0);
    expect(result.error).toBeUndefined();
  });
});

describe('Cloud settings payload builder for Base URLs', () => {
  const ALLOWED_CLOUD_SETTINGS_FIELDS = new Set([
    'falKey',
    'agnesBaseUrl',
    'sensenovaBaseUrl',
    'openaiCompatBaseUrl',
    'grokCompatBaseUrl',
    'runwareBaseUrl',
    'modelslabBaseUrl',
    'replicateKey',
    'replicateBaseUrl',
    'nanogptBaseUrl',
    'mageBaseUrl',
  ]);

  it('includes replicateBaseUrl in payload when provided', () => {
    const keys = {
      replicateKey: 'r8_test',
      replicateBaseUrl: 'https://api.replicate.com/v1',
      nanogptKey: 'sk-nano-test'
    };
    const payload = buildCloudSettingsPayload(keys, ALLOWED_CLOUD_SETTINGS_FIELDS);
    expect(payload.replicateBaseUrl).toBe('https://api.replicate.com/v1');
  });

  it('includes nanogptBaseUrl in payload when provided', () => {
    const keys = {
      nanogptKey: 'sk-nano-test',
      nanogptBaseUrl: 'https://api.nano-gpt.com/api/v1',
      replicateKey: 'r8_test'
    };
    const payload = buildCloudSettingsPayload(keys, ALLOWED_CLOUD_SETTINGS_FIELDS);
    expect(payload.nanogptBaseUrl).toBe('https://api.nano-gpt.com/api/v1');
  });

  it('includes both Base URLs in payload when both provided', () => {
    const keys = {
      replicateKey: 'r8_test',
      replicateBaseUrl: 'https://api.replicate.com/v1',
      nanogptKey: 'sk-nano-test',
      nanogptBaseUrl: 'https://api.nano-gpt.com/api/v1'
    };
    const payload = buildCloudSettingsPayload(keys, ALLOWED_CLOUD_SETTINGS_FIELDS);
    expect(payload.replicateBaseUrl).toBe('https://api.replicate.com/v1');
    expect(payload.nanogptBaseUrl).toBe('https://api.nano-gpt.com/api/v1');
    expect(Object.keys(payload)).toContain('replicateBaseUrl');
    expect(Object.keys(payload)).toContain('nanogptBaseUrl');
  });

  it('excludes masked values (containing ...)', () => {
    const keys = {
      replicateKey: 'r8_1234...5678',
      replicateBaseUrl: 'https://api.replicate.com/v1'
    };
    const payload = buildCloudSettingsPayload(keys, ALLOWED_CLOUD_SETTINGS_FIELDS);
    expect(payload.replicateKey).toBeUndefined();
    expect(payload.replicateBaseUrl).toBe('https://api.replicate.com/v1');
  });

  it('excludes fields not in allowed set', () => {
    const keys = {
      replicateBaseUrl: 'https://api.replicate.com/v1',
      someOtherField: 'should-be-excluded'
    };
    const payload = buildCloudSettingsPayload(keys, ALLOWED_CLOUD_SETTINGS_FIELDS);
    expect(payload.replicateBaseUrl).toBe('https://api.replicate.com/v1');
    expect(payload.someOtherField).toBeUndefined();
  });

  it('trims whitespace from Base URL values', () => {
    const keys = {
      replicateBaseUrl: '  https://api.replicate.com/v1  ',
      nanogptBaseUrl: '\thttps://api.nano-gpt.com/api/v1\n'
    };
    const payload = buildCloudSettingsPayload(keys, ALLOWED_CLOUD_SETTINGS_FIELDS);
    expect(payload.replicateBaseUrl).toBe('https://api.replicate.com/v1');
    expect(payload.nanogptBaseUrl).toBe('https://api.nano-gpt.com/api/v1');
  });
});

// ---------------------------------------------------------------------------
// server.ts whitelist / storage / balance helpers executed from source.
// ---------------------------------------------------------------------------

const serverSource = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');

function sliceBetween(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  const end = start < 0 ? -1 : source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end <= start) throw new Error(`slice not found: ${startMarker}`);
  return source.slice(start, end);
}

function compile(vars: Record<string, unknown>, code: string, returnExpression: string) {
  const js = transformSync(code, { loader: 'ts' }).code;
  return new Function(...Object.keys(vars), `${js}\nreturn ${returnExpression};`)(...Object.values(vars));
}

function allowedSettingsSets() {
  const code = sliceBetween(serverSource, 'const ALLOWED_SETTINGS_SECRET = new Set([', 'const isSecretKeyField =');
  return compile({}, code, '{ALLOWED_SETTINGS_SECRET, ALLOWED_SETTINGS_PLAIN, ALLOWED_SETTINGS}');
}

function buildSettingsHandler() {
  const code = sliceBetween(
    serverSource,
    "app.post('/api/cloud/settings', requireAdminAuth, (req, res) => {",
    "app.get('/api/cloud/health'",
  );
  const sets = allowedSettingsSets();
  const box: { handler: ((req: any, res: any) => any) | null } = { handler: null };
  const getSettings = compile(
    {
      app: { post: (_path: string, _auth: any, handler: (req: any, res: any) => any) => { box.handler = handler; } },
      requireAdminAuth: (_req: any, _res: any, next: any) => next(),
      ALLOWED_SETTINGS_SECRET: sets.ALLOWED_SETTINGS_SECRET,
      ALLOWED_SETTINGS_PLAIN: sets.ALLOWED_SETTINGS_PLAIN,
      ALLOWED_SETTINGS: sets.ALLOWED_SETTINGS,
      getSanitizedCloudSettings: (settings: Record<string, any>) => ({ ...settings }),
      writeJsonFile: () => {},
      SETTINGS_FILE: 'settings.json',
      keyPoolManager: { maskKey: (key: string) => key, refreshFromSettings: () => {} },
    },
    `let cloudSettings: Record<string, any> = {};\n${code}`,
    '() => cloudSettings',
  );
  return { handler: box.handler!, getSettings };
}

function makeRes() {
  const res: any = {
    code: 200,
    body: null,
    status(code: number) { this.code = code; return this; },
    json(body: any) { this.body = body; return this; },
  };
  return res;
}

describe('ALLOWED_SETTINGS covers every server-read Tensor.Art field', () => {
  it('includes tensorartTamsToken as a secret and tensorartBaseUrl as a plain field', () => {
    const sets = allowedSettingsSets();
    expect(sets.ALLOWED_SETTINGS_SECRET.has('tensorartTamsToken')).toBe(true);
    expect(sets.ALLOWED_SETTINGS_PLAIN.has('tensorartBaseUrl')).toBe(true);
    expect(sets.ALLOWED_SETTINGS.has('tensorartTamsToken')).toBe(true);
    expect(sets.ALLOWED_SETTINGS.has('tensorartBaseUrl')).toBe(true);
    // Every field server.ts reads from cloudSettings must be saveable.
    for (const field of ['tensorartTamsToken', 'tensorartKey', 'mageKey', 'runwareKey', 'modelslabKey', 'replicateKey', 'novitaKey', 'deepinfraKey']) {
      expect(sets.ALLOWED_SETTINGS.has(field)).toBe(true);
    }
  });

  it('POST /api/cloud/settings no longer answers 400 for the TAMS token and base URL', async () => {
    const { handler } = buildSettingsHandler();
    const res = makeRes();
    await handler({ body: { tensorartTamsToken: 'tams-live-token-123456', tensorartBaseUrl: 'https://custom-tams.example/v1' } }, res);
    expect(res.code).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('still rejects fields the server does not read', async () => {
    const { handler } = buildSettingsHandler();
    const res = makeRes();
    await handler({ body: { totallyUnknownField: 'x' } }, res);
    expect(res.code).toBe(400);
    expect(res.body.error).toContain('不支持的设置字段');
  });
});

describe('readJsonFile keeps a corrupt file instead of overwriting it with empty data', () => {
  function readJsonFileFromSource() {
    const code = sliceBetween(serverSource, 'const corruptJsonFiles = new Set<string>();', 'const writeJsonFile =');
    return compile({ fs, storageError: (error: any) => new Error(String(error?.message || error)) }, code, '({ readJsonFile, corruptJsonFiles })');
  }

  it('backs up a corrupt file, returns the fallback, and leaves the original bytes untouched', () => {
    const { readJsonFile, corruptJsonFiles } = readJsonFileFromSource();
    const dir = mkdtempSync(path.join(tmpdir(), 'm87-corrupt-'));
    const file = path.join(dir, 'history.json');
    writeFileSync(file, '{not valid json');
    const result = readJsonFile(file, []);
    expect(result).toEqual([]);
    expect(corruptJsonFiles.has(file)).toBe(true);
    expect(readdirSync(dir).filter((name) => name.startsWith('history.json.corrupt-'))).toHaveLength(1);
    expect(readFileSync(file, 'utf8')).toBe('{not valid json');
  });

  it('parses valid JSON and treats a missing file as a normal empty start', () => {
    const { readJsonFile, corruptJsonFiles } = readJsonFileFromSource();
    const dir = mkdtempSync(path.join(tmpdir(), 'm87-json-'));
    const file = path.join(dir, 'settings.json');
    writeFileSync(file, '{"novitaKey":"k"}');
    expect(readJsonFile(file, {})).toEqual({ novitaKey: 'k' });
    expect(readJsonFile(path.join(dir, 'missing.json'), {})).toEqual({});
    expect(corruptJsonFiles.has(file)).toBe(false);
    expect(readdirSync(dir)).toEqual(['settings.json']);
  });
});

describe('Novita / Mage balance parsing helpers', () => {
  function balanceHelpers() {
    const code = sliceBetween(serverSource, 'function novitaBalanceUsd(', '// Update Key Pool Strategy');
    return compile({}, code, '{novitaBalanceUsd, mageGemsBalance}');
  }

  it('converts Novita availableBalance from 1/10000 USD to USD', () => {
    const { novitaBalanceUsd } = balanceHelpers();
    expect(novitaBalanceUsd({ availableBalance: '123456' }).usd).toBeCloseTo(12.3456, 6);
    expect(novitaBalanceUsd({}).error).toContain('Novita 响应格式异常');
    expect(novitaBalanceUsd({ availableBalance: 'n/a' }).error).toContain('非数字');
  });

  it('reads Mage balance.gems and rejects unrelated payloads', () => {
    const { mageGemsBalance } = balanceHelpers();
    expect(mageGemsBalance({ balance: { gems: 2500 } }).gems).toBe(2500);
    expect(mageGemsBalance({ balance: { gems: '1500' } }).gems).toBe(1500);
    expect(mageGemsBalance({}).error).toContain('Mage 响应格式异常');
  });

  it('balances route queries the official Novita balance endpoint', () => {
    expect(serverSource).toContain('https://api.novita.ai/openapi/v1/billing/balance/detail');
    expect(serverSource).toContain("balances.novita = parsed.usd !== undefined");
  });
});
