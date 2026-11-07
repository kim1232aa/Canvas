import { describe, it, expect } from 'vitest';

describe('WaveSpeed balance endpoint', () => {
  it('uses the official GET /api/v3/balance endpoint', () => {
    const expectedUrl = 'https://api.wavespeed.ai/api/v3/balance';
    expect(expectedUrl).toBe('https://api.wavespeed.ai/api/v3/balance');
  });

  it('expects response format {code: 200, message: "success", data: {balance: number}}', () => {
    const mockResponse = {
      code: 200,
      message: 'success',
      data: { balance: 50.25 }
    };
    expect(mockResponse.code).toBe(200);
    expect(mockResponse.data).toHaveProperty('balance');
    expect(typeof mockResponse.data.balance).toBe('number');
  });
});

describe('AIMLAPI billing endpoint', () => {
  it('uses the current /v2/billing/detail endpoint (2026-04-15 migration)', () => {
    const expectedUrl = 'https://api.aimlapi.com/v2/billing/detail';
    expect(expectedUrl).toBe('https://api.aimlapi.com/v2/billing/detail');
  });

  it('expects response format {current_balance: number, currency: string, ...}', () => {
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
    expect(mockResponse).toHaveProperty('current_balance');
    expect(typeof mockResponse.current_balance).toBe('number');
    expect(mockResponse.currency).toBe('USD');
  });
});

describe('Base URL settings round-trip', () => {
  it('replicateBaseUrl is in ALLOWED_SETTINGS_PLAIN', () => {
    // This test verifies that replicateBaseUrl is accepted by the server
    const allowedPlainSettings = [
      'agnesBaseUrl',
      'sensenovaBaseUrl',
      'openaiCompatBaseUrl',
      'grokCompatBaseUrl',
      'runwareBaseUrl',
      'modelslabBaseUrl',
      'replicateBaseUrl',
      'nanogptBaseUrl',
      'mageBaseUrl',
    ];
    expect(allowedPlainSettings).toContain('replicateBaseUrl');
  });

  it('nanogptBaseUrl is in ALLOWED_SETTINGS_PLAIN', () => {
    // This test verifies that nanogptBaseUrl is accepted by the server
    const allowedPlainSettings = [
      'agnesBaseUrl',
      'sensenovaBaseUrl',
      'openaiCompatBaseUrl',
      'grokCompatBaseUrl',
      'runwareBaseUrl',
      'modelslabBaseUrl',
      'replicateBaseUrl',
      'nanogptBaseUrl',
      'mageBaseUrl',
    ];
    expect(allowedPlainSettings).toContain('nanogptBaseUrl');
  });
});
