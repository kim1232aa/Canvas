import { describe, expect, it } from 'vitest';
import {
  extractCompatImageUrl,
  normalizeGrokCompatBaseUrl,
  normalizeOpenAICompatBaseUrl,
  resolveAgainstBaseOrigin,
} from './compatRelay';

describe('compatRelay helpers', () => {
  it('openai_compat base URL 只去尾斜杠，不硬编码域名、不擅自补 /v1', () => {
    expect(normalizeOpenAICompatBaseUrl('https://example.relay/v1/')).toBe('https://example.relay/v1');
    expect(normalizeOpenAICompatBaseUrl('https://example.relay/v1')).toBe('https://example.relay/v1');
    expect(normalizeOpenAICompatBaseUrl('')).toBe('');
  });

  it('grok_compat base URL 缺 /v1 时补上，已有则不去重写 host', () => {
    expect(normalizeGrokCompatBaseUrl('https://relay.example.com')).toBe('https://relay.example.com/v1');
    expect(normalizeGrokCompatBaseUrl('https://relay.example.com/')).toBe('https://relay.example.com/v1');
    expect(normalizeGrokCompatBaseUrl('https://relay.example.com/v1')).toBe('https://relay.example.com/v1');
    expect(normalizeGrokCompatBaseUrl('https://relay.example.com/v1/')).toBe('https://relay.example.com/v1');
  });

  it('提取图像：b64_json 补 data URL 前缀；已有 data: 或 url 原样', () => {
    expect(extractCompatImageUrl({ b64_json: 'abc123' })).toBe('data:image/png;base64,abc123');
    expect(extractCompatImageUrl({ b64_json: 'data:image/png;base64,xyz' })).toBe('data:image/png;base64,xyz');
    expect(extractCompatImageUrl({ url: 'https://cdn.example/a.png' })).toBe('https://cdn.example/a.png');
    expect(extractCompatImageUrl({})).toBeNull();
  });

  it('相对视频 URL 相对 base origin 解析，不拼到 /v1 路径下', () => {
    expect(resolveAgainstBaseOrigin('/v1/videos/abc/content', 'https://relay.example.com/v1')).toBe(
      'https://relay.example.com/v1/videos/abc/content',
    );
    expect(resolveAgainstBaseOrigin('https://cdn.example/v.mp4', 'https://relay.example.com/v1')).toBe(
      'https://cdn.example/v.mp4',
    );
  });
});
