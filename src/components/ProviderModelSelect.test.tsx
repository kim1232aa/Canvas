// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProviderModelSelect } from './ProviderModelSelect';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const flush = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
const responseFor = (provider: string, rows: any[]) => new Response(JSON.stringify({ [provider]: rows, results: { [provider]: rows } }), { status: 200 });

describe('ProviderModelSelect live catalog state', () => {
  let host: HTMLDivElement;
  let root: Root;
  let provider = '';
  const value = 'selected/custom-model';
  const render = () => root.render(<ProviderModelSelect provider={provider} value={value} onChange={vi.fn()} />);

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  const mount = async (nextProvider: string) => {
    provider = nextProvider;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => render());
  };

  const select = () => host.querySelector('select[aria-label="当前供应商底模"]') as HTMLSelectElement;
  const status = () => host.querySelector('[data-testid="provider-model-catalog-status"]')?.textContent || '';
  const startLookup = async () => {
    await act(async () => select().focus());
    await flush();
  };
  const refresh = async () => {
    const button = [...host.querySelectorAll('button')].find((item) => item.textContent?.trim() === '刷新目录')!;
    await act(async () => button.click());
    await flush();
  };

  it('successful empty refresh clears the old list/count but keeps the selected model identity', async () => {
    const testProvider = 'catalog-empty-refresh-test';
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      call++;
      return call === 1
        ? responseFor(testProvider, [{ id: value, name: 'Old cached label', type: 'Checkpoint' }])
        : responseFor(testProvider, []);
    }));
    await mount(testProvider);
    await startLookup();
    expect(select().querySelectorAll('optgroup option')).toHaveLength(1);
    expect(status()).toContain('目录已返回 1 个模型');

    await refresh();

    expect(select().querySelectorAll('optgroup option')).toHaveLength(0);
    expect(select().querySelector(`option[value="${value}"]`)?.textContent).toBe(`[当前] ${value}`);
    expect(select().value).toBe(value);
    expect(status()).toBe('已选底模');
    expect(status()).not.toContain('1 个模型');
  });

  it('failed refresh does not restore the prior catalog or its count', async () => {
    const testProvider = 'catalog-failed-refresh-test';
    let call = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      call++;
      return call === 1
        ? responseFor(testProvider, [{ id: value, name: 'Old cached label', type: 'Checkpoint' }])
        : new Response(JSON.stringify({ error: 'directory unavailable' }), { status: 503 });
    }));
    await mount(testProvider);
    await startLookup();
    await refresh();

    expect(select().querySelectorAll('optgroup option')).toHaveLength(0);
    expect(select().querySelector(`option[value="${value}"]`)?.textContent).toBe(`[当前] ${value}`);
    expect(select().value).toBe(value);
    expect(status()).toBe('查询失败');
    expect(status()).not.toContain('1 个模型');
  });

  it('late results from a previous provider cannot repopulate the newly selected provider', async () => {
    const providerA = 'catalog-race-provider-a';
    const providerB = 'catalog-race-provider-b';
    const pending = new Map<string, (response: Response) => void>();
    vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => new Promise<Response>((resolve) => {
      const requested = new URL(String(input), 'http://localhost').searchParams.get('provider') || '';
      pending.set(requested, resolve);
    })));
    await mount(providerA);
    await startLookup();
    expect(pending.has(providerA)).toBe(true);

    provider = providerB;
    await act(async () => render());
    await flush();
    expect(pending.has(providerB)).toBe(true);

    await act(async () => pending.get(providerA)!(responseFor(providerA, [{ id: 'old-provider-model', name: 'Old provider', type: 'Checkpoint' }])));
    await flush();
    expect(select().querySelector('option[value="old-provider-model"]')).toBeNull();

    await act(async () => pending.get(providerB)!(responseFor(providerB, [{ id: 'new-provider-model', name: 'New provider', type: 'Checkpoint' }])));
    await flush();
    expect(select().querySelector('option[value="new-provider-model"]')?.textContent).toContain('New provider');
    expect(select().querySelector('option[value="old-provider-model"]')).toBeNull();
  });
});
