import { describe, it, expect } from 'vitest';

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
