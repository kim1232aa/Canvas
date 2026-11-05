/** @vitest-environment jsdom */
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { VideoJobStatus } from './VideoJobStatus';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('VideoJobStatus error lines', () => {
  let root: Root | undefined;
  let host: HTMLDivElement | undefined;

  afterEach(() => {
    if (root && host) {
      act(() => { root!.unmount(); });
      host.remove();
    }
    root = undefined;
    host = undefined;
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  function mount(onUpdate: (key: string, value: string) => void = () => {}) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(<VideoJobStatus provider="krea" nodeId="node-a" onUpdate={onUpdate} />);
    });
  }

  it('writes a network failure onto the status line with the endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('Failed to fetch'); }));
    const updates: string[] = [];
    await act(async () => { mount((_k, v) => { updates.push(v); }); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const text = host!.querySelector('[data-testid="video-job-status-line"]')?.textContent || '';
    expect(text).toContain('状态读取失败：Failed to fetch');
    expect(text).toContain('/api/video/status');
    expect(updates.some((u) => u.includes('Failed to fetch'))).toBe(true);
  });

  it('shows HTTP status and the start of a non-JSON body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>bad gateway</html>', { status: 502 })));
    await act(async () => { mount(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const text = host!.querySelector('[data-testid="video-job-status-line"]')?.textContent || '';
    expect(text).toContain('HTTP 502');
    expect(text).toContain('<html>bad gateway</html>');
    expect(text).toContain('/api/video/status');
  });

  it('writes a cancel network error onto the line instead of leaving the last status', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/video/status')) {
        return new Response(JSON.stringify({ jobId: 'j1', text: '生成中。上游状态 processing。本地已等待 125 秒 / 600 秒。' }), { status: 200 });
      }
      throw new Error('cancel socket hang up');
    }));
    const updates: string[] = [];
    await act(async () => { mount((_k, v) => { updates.push(v); }); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const button = host!.querySelector('button') as HTMLButtonElement;
    await act(async () => { button.click(); });
    const text = host!.querySelector('[data-testid="video-job-status-line"]')?.textContent || '';
    expect(text).toContain('取消失败：cancel socket hang up');
    expect(text).toContain('/api/video/cancel');
    expect(updates.some((u) => u.includes('cancel socket hang up'))).toBe(true);
  });

  it('shows the upstream cancel status and body, not the local 200', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo) => {
      const url = String(input);
      if (url.includes('/api/video/status')) {
        return new Response(JSON.stringify({ jobId: 'j1', text: '生成中。上游状态 IN_PROGRESS。本地已等待 12 秒 / 900 秒。' }), { status: 200 });
      }
      return new Response(JSON.stringify({
        cancelled: true,
        upstreamStatus: 202,
        rawResponse: '{"status":"CANCELLATION_REQUESTED"}',
        provider: 'fal',
      }), { status: 200 });
    }));
    await act(async () => { mount(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    const button = host!.querySelector('button') as HTMLButtonElement;
    await act(async () => { button.click(); });
    const text = host!.querySelector('[data-testid="video-job-status-line"]')?.textContent || '';
    expect(text).toContain('上游 202');
    expect(text).toContain('CANCELLATION_REQUESTED');
    expect(text).not.toMatch(/上游 200/);
  });
});
