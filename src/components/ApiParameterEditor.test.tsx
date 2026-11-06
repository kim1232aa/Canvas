// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiParameterEditor } from './ApiParameterEditor';
import { clearSharedGet, sharedGetJson, peekSharedGet } from '../services/sharedGet';
import { schemaRequestFor } from '../services/userModelSelection';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const flush = async () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 15)); });

describe('ApiParameterEditor schema error display & state regression tests', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    clearSharedGet();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    clearSharedGet();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('renders non-2xx JSON response error verbatim with endpoint, status, and raw body in scrollable monospace alert', async () => {
    const provider = 'fal';
    const model = 'broken-json-model';
    const { url, headers } = schemaRequestFor(provider, model);
    const errorJson = {
      error: 'HTTP 400',
      details: 'validation_error: invalid model parameters',
      endpoint: 'https://api.fal.ai/v1/models/broken-json-model',
    };
    const rawBody = JSON.stringify(errorJson, null, 2);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(rawBody, {
      status: 400,
      headers: { 'content-type': 'application/json' },
    })));

    // Trigger the shared GET for this model selection (memoises failure)
    await sharedGetJson(url, headers).catch(() => {});

    const onChange = vi.fn();
    await act(async () => {
      root.render(<ApiParameterEditor provider={provider} model={model} onChange={onChange} />);
    });
    await flush();

    const alert = host.querySelector('[role="alert"][aria-label="Schema 请求失败"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('Schema 获取失败');
    expect(alert?.textContent).toContain(url);
    expect(alert?.textContent).toContain('https://api.fal.ai/v1/models/broken-json-model');
    expect(alert?.textContent).toContain('400');
    expect(alert?.querySelector('pre')?.textContent).toContain(rawBody);
    expect(alert?.querySelector('pre')?.className).toContain('overflow-auto');
    expect(alert?.querySelector('pre')?.className).toContain('break-all');
    expect(alert?.className).toContain('font-mono');
  });

  it('renders resolved non-2xx response via sharedGetJson fetchImpl explicitly without relying on thrown ApiTraceError', async () => {
    const provider = 'fal';
    const model = 'resolved-non-2xx-model';
    const { url, headers } = schemaRequestFor(provider, model);
    const rawResponse = '{"error":"Not Found","endpoint":"https://api.fal.ai/models/not-found"}';

    // fetchImpl bypasses tracedFetch and returns a non-throwing Response
    const fetchImpl = vi.fn().mockResolvedValue(new Response(rawResponse, {
      status: 404,
      headers: { 'content-type': 'application/json' },
    }));

    const result = await sharedGetJson(url, headers, { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(404);
    expect(result.raw).toBe(rawResponse);

    await act(async () => {
      root.render(<ApiParameterEditor provider={provider} model={model} onChange={vi.fn()} />);
    });
    await flush();

    const alert = host.querySelector('[role="alert"][aria-label="Schema 请求失败"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('404');
    expect(alert?.textContent).toContain(url);
    expect(alert?.textContent).toContain('https://api.fal.ai/models/not-found');
    expect(alert?.querySelector('pre')?.textContent).toBe(rawResponse);
  });

  it('preserves empty raw body verbatim without synthesizing replacement diagnosis text', async () => {
    const provider = 'fal';
    const model = 'empty-body-404-model';
    const { url, headers } = schemaRequestFor(provider, model);

    const fetchImpl = vi.fn().mockResolvedValue(new Response('', {
      status: 404,
    }));

    const result = await sharedGetJson(url, headers, { fetchImpl });
    expect(result.ok).toBe(false);
    expect(result.raw).toBe('');

    await act(async () => {
      root.render(<ApiParameterEditor provider={provider} model={model} onChange={vi.fn()} />);
    });
    await flush();

    const alert = host.querySelector('[role="alert"][aria-label="Schema 请求失败"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain('404');
    expect(alert?.querySelector('pre')?.textContent).toBe('');
    expect(alert?.textContent).not.toContain('HTTP 404'); // no fake synthesis in pre
  });

  it('renders non-2xx non-JSON response (e.g. 502 HTML) verbatim without truncation or fallback diagnosis', async () => {
    const provider = 'wavespeed';
    const model = 'gateway-fail-model';
    const { url, headers } = schemaRequestFor(provider, model);
    const rawHtml = '<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center><hr><center>nginx/1.24.0</center></body></html>';

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(rawHtml, {
      status: 502,
      headers: { 'content-type': 'text/html' },
    })));

    await sharedGetJson(url, headers).catch(() => {});

    const onChange = vi.fn();
    await act(async () => {
      root.render(<ApiParameterEditor provider={provider} model={model} onChange={onChange} />);
    });
    await flush();

    const alert = host.querySelector('[role="alert"][aria-label="Schema 请求失败"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain(url);
    expect(alert?.textContent).toContain('502');
    expect(alert?.querySelector('pre')?.textContent).toBe(rawHtml);
  });

  it('renders rejected network errors (e.g. TypeError: Failed to fetch) verbatim', async () => {
    const provider = 'together';
    const model = 'network-offline-model';
    const { url, headers } = schemaRequestFor(provider, model);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch: connection refused')));

    await sharedGetJson(url, headers).catch(() => {});

    const onChange = vi.fn();
    await act(async () => {
      root.render(<ApiParameterEditor provider={provider} model={model} onChange={onChange} />);
    });
    await flush();

    const alert = host.querySelector('[role="alert"][aria-label="Schema 请求失败"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain(url);
    expect(alert?.textContent).toContain('Failed to fetch: connection refused');
  });

  it('preserves multiline bodies untruncated', async () => {
    const provider = 'novita';
    const model = 'multiline-error-model';
    const { url, headers } = schemaRequestFor(provider, model);

    const lines = Array.from({ length: 60 }, (_, i) => `stack_trace_line_${i}: at com.provider.handler.execute(Handler.ts:${i + 10})`);
    const longRawBody = lines.join('\n');

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(longRawBody, { status: 500 })));
    await sharedGetJson(url, headers).catch(() => {});

    await act(async () => {
      root.render(<ApiParameterEditor provider={provider} model={model} onChange={vi.fn()} />);
    });
    await flush();

    const pre = host.querySelector('[role="alert"] pre');
    expect(pre).not.toBeNull();
    expect(pre?.textContent).toContain('stack_trace_line_0');
    expect(pre?.textContent).toContain('stack_trace_line_59');
    expect(pre?.textContent?.split('\n').length).toBe(60);
  });

  it('stale errors clear on scope change without issuing extra GETs', async () => {
    const provider = 'fal';
    const model1 = 'model-first';
    const model2 = 'model-second';
    const req1 = schemaRequestFor(provider, model1);

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'failed 404' }), { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);

    await sharedGetJson(req1.url, req1.headers).catch(() => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      root.render(<ApiParameterEditor provider={provider} model={model1} onChange={vi.fn()} />);
    });
    await flush();

    expect(host.querySelector('[role="alert"]')).not.toBeNull();

    // Switch to model2 where no GET was issued yet
    await act(async () => {
      root.render(<ApiParameterEditor provider={provider} model={model2} onChange={vi.fn()} />);
    });
    await flush();

    // Stale error must be cleared immediately
    expect(host.querySelector('[role="alert"]')).toBeNull();
    // Zero extra GETs issued on mount/prop-change
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not allow pending in-flight response from a stale scope to leak into a new selection', async () => {
    const provider = 'fal';
    const slowModel = 'slow-model';
    const fastModel = 'fast-model';
    const slowReq = schemaRequestFor(provider, slowModel);

    let resolveSlowFetch: (r: Response) => void;
    const slowPromise = new Promise<Response>((res) => { resolveSlowFetch = res; });
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      return url.includes(slowModel) ? slowPromise : Promise.resolve(new Response(JSON.stringify({ inputSchema: { properties: {} } }), { status: 200 }));
    });
    vi.stubGlobal('fetch', fetchMock);

    // Start slow request
    const slowShared = sharedGetJson(slowReq.url, slowReq.headers);

    // Mount editor with slow model while it is still in flight
    await act(async () => {
      root.render(<ApiParameterEditor provider={provider} model={slowModel} onChange={vi.fn()} />);
    });
    expect(host.querySelector('[role="alert"]')).toBeNull();

    // User switches to fast model before slow settles
    await act(async () => {
      root.render(<ApiParameterEditor provider={provider} model={fastModel} onChange={vi.fn()} />);
    });

    // Now slow response settles with error
    resolveSlowFetch!(new Response('{"error":"Slow failure"}', { status: 500 }));
    await slowShared.catch(() => {});
    await flush();

    // Alert for slowModel must NOT be rendered because current scope is fastModel
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it('preserves same-action sibling and remount deduplication (0 extra GETs)', async () => {
    const provider = 'fal';
    const model = 'dedupe-model';
    const req = schemaRequestFor(provider, model);

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ inputSchema: { properties: { prompt: { type: 'string' } } } }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await sharedGetJson(req.url, req.headers);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Mount first instance
    await act(async () => {
      root.render(<ApiParameterEditor provider={provider} model={model} onChange={vi.fn()} />);
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Remount / second instance
    await act(async () => {
      root.unmount();
      root = createRoot(host);
      root.render(<ApiParameterEditor provider={provider} model={model} onChange={vi.fn()} />);
    });
    await flush();
    expect(fetchMock).toHaveBeenCalledTimes(1); // Still exactly 1 GET
  });

  it('does not erase user-entered custom parameters when Schema lookup fails', async () => {
    const provider = 'sogni';
    const model = 'failing-schema-model';
    const { url, headers } = schemaRequestFor(provider, model);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Server Error', { status: 500 })));
    await sharedGetJson(url, headers).catch(() => {});

    const customValue = JSON.stringify({ my_param: 'persisted_value', steps: 30 }, null, 2);
    const onChange = vi.fn();

    await act(async () => {
      root.render(<ApiParameterEditor provider={provider} model={model} value={customValue} onChange={onChange} />);
    });
    await flush();

    // onChange must NOT have been called with erased / empty parameters
    expect(onChange).not.toHaveBeenCalled();
    expect(host.querySelector('[role="alert"]')).not.toBeNull();
  });
});
