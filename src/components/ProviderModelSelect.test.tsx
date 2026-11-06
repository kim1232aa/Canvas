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

  it('renders generic guidance and clickable driver suggestions for Mage with an empty catalog', async () => {
    const onChangeMock = vi.fn();
    let currentVal = '';
    const mageResponse = new Response(JSON.stringify({
      mage: [],
      results: { mage: [] },
      _pagination: {
        mage: {
          page: 1,
          limit: 50,
          total: 0,
          hasMore: false,
          sourceUrl: 'https://docs.mage.space/api/models/mango',
          sourceNotice: 'lookup-only (no public remote catalog; model_id enum on Mango docs)',
          catalogAvailable: false,
          noPublicRemoteCatalog: true,
        },
      },
      catalogNotices: {
        mage: 'Mage 无公开远端模型检索目录；请按官方 model_id 选用（mango / mango-v2 / mango-v3s / mango-v3 / mango-v3-turbo）。空列表是 lookup-only。',
      },
    }), { status: 200 });

    vi.stubGlobal('fetch', vi.fn(async () => mageResponse));

    provider = 'mage';
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<ProviderModelSelect provider={provider} value={currentVal} onChange={onChangeMock} />);
    });
    await startLookup();

    // Guidance container is rendered
    const guidance = host.querySelector('[data-testid="no-catalog-guidance"]');
    expect(guidance).not.toBeNull();
    expect(guidance?.textContent).toContain('该服务商官方无公开模型检索目录 API');
    expect(guidance?.textContent).toContain('官方未提供远端公开模型检索目录；您可在下方「自定义模型 (model)」中直接输入任意官方模型 ID。');
    expect(guidance?.textContent).toContain('推荐候选（驱动按官方文档声明、非实时拉取）：');

    // Official doc URL is rendered
    const docUrl = host.querySelector('[data-testid="no-catalog-doc-url"] a');
    expect(docUrl?.getAttribute('href')).toBe('https://docs.mage.space/api/models/mango');

    // Official catalog notice is rendered
    const notice = host.querySelector('[data-testid="no-catalog-notice"]');
    expect(notice?.textContent).toContain('Mage 无公开远端模型检索目录');

    // Driver suggestions exist and contain mango models
    const suggestions = host.querySelectorAll('[data-testid^="provider-model-suggestion-"]');
    expect(suggestions.length).toBeGreaterThan(0);
    const mangoV3Btn = host.querySelector('[data-testid="provider-model-suggestion-mango-v3"]') as HTMLButtonElement;
    expect(mangoV3Btn).not.toBeNull();

    // No silent fallback: onChange not called yet, value is empty
    expect(onChangeMock).not.toHaveBeenCalled();

    // Click suggestion writes exact id
    await act(async () => {
      mangoV3Btn.click();
    });
    expect(onChangeMock).toHaveBeenCalledWith('mango-v3');
  });

  it('renders generic guidance and clickable driver suggestions for another provider (Agnes) with lookup-only catalog', async () => {
    const onChangeMock = vi.fn();
    const agnesResponse = new Response(JSON.stringify({
      agnes: [],
      results: { agnes: [] },
      _pagination: {
        agnes: {
          page: 1,
          limit: 50,
          total: 0,
          hasMore: false,
          sourceUrl: 'https://agnes.ai',
          sourceNotice: 'lookup-only (specialized image/video service; no public remote catalog)',
          catalogAvailable: false,
          noPublicRemoteCatalog: true,
        },
      },
      catalogNotices: {
        agnes: 'Agnes 无公开远端模型检索目录；请在上方输入框按官方模型 ID 选用（如 agnes-image-2.5-flash）。空列表不是“没有能力”，而是 lookup-only。',
      },
    }), { status: 200 });

    vi.stubGlobal('fetch', vi.fn(async () => agnesResponse));

    provider = 'agnes';
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<ProviderModelSelect provider={provider} value="" onChange={onChangeMock} />);
    });
    await startLookup();

    const guidance = host.querySelector('[data-testid="no-catalog-guidance"]');
    expect(guidance).not.toBeNull();
    expect(guidance?.textContent).toContain('推荐候选（驱动按官方文档声明、非实时拉取）：');

    const agnesBtn = host.querySelector('[data-testid="provider-model-suggestion-agnes-image-2.5-flash"]') as HTMLButtonElement;
    expect(agnesBtn).not.toBeNull();

    await act(async () => {
      agnesBtn.click();
    });
    expect(onChangeMock).toHaveBeenCalledWith('agnes-image-2.5-flash');
  });

  it('never displays no-catalog-guidance card when Runware has no API key and displays server notice verbatim', async () => {
    const rwNoKeyResponse = new Response(JSON.stringify({
      runware: [],
      results: { runware: [] },
      _pagination: {
        runware: {
          page: 1,
          limit: 50,
          total: 0,
          hasMore: false,
          sourceUrl: 'https://docs.runware.ai',
          sourceNotice: 'lookup-only (no api key configured)',
          catalogAvailable: true,
          requiresApiKey: true,
        },
      },
      catalogNotices: {
        runware: 'Runware 实时模型搜索需要配置 API Key (RUNWARE_API_KEY)；支持直接在上方输入框中输入 AIR 标识符 (如 civitai:xxxx@yyyy 或 runware:xx@y) 按 ID 选用。',
      },
    }), { status: 200 });

    vi.stubGlobal('fetch', vi.fn(async () => rwNoKeyResponse));

    provider = 'runware';
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<ProviderModelSelect provider={provider} value="" onChange={vi.fn()} />);
    });
    await startLookup();

    // MUST NOT display purple no-catalog-guidance card!
    expect(host.querySelector('[data-testid="no-catalog-guidance"]')).toBeNull();
    // MUST display server notice verbatim in status
    const statusText = host.querySelector('[data-testid="provider-model-catalog-status"]')?.textContent || '';
    expect(statusText).toContain('Runware 实时模型搜索需要配置 API Key');
  });

  it('never displays no-catalog-guidance card when Runware has no search query and displays server notice verbatim', async () => {
    const rwNoSearchResponse = new Response(JSON.stringify({
      runware: [],
      results: { runware: [] },
      _pagination: {
        runware: {
          page: 1,
          limit: 50,
          total: 0,
          hasMore: false,
          sourceUrl: 'https://docs.runware.ai',
          sourceNotice: 'lookup-only (search query required for live catalog)',
          catalogAvailable: true,
          requiresSearchQuery: true,
        },
      },
      catalogNotices: {
        runware: 'Runware 实时模型目录需要搜索关键词；请输入关键词后查询真实上游目录。',
      },
    }), { status: 200 });

    vi.stubGlobal('fetch', vi.fn(async () => rwNoSearchResponse));

    provider = 'runware';
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<ProviderModelSelect provider={provider} value="" onChange={vi.fn()} />);
    });
    await startLookup();
    await refresh();

    expect(host.querySelector('[data-testid="no-catalog-guidance"]')).toBeNull();
    const statusText = host.querySelector('[data-testid="provider-model-catalog-status"]')?.textContent || '';
    expect(statusText).toContain('Runware 实时模型目录需要搜索关键词');
  });

  it('never displays no-catalog-guidance card when ModelsLab has no API key and displays server notice verbatim', async () => {
    const mlNoKeyResponse = new Response(JSON.stringify({
      modelslab: [],
      results: { modelslab: [] },
      _pagination: {
        modelslab: {
          page: 1,
          limit: 50,
          total: 0,
          hasMore: false,
          sourceUrl: 'https://modelslab.com/api/v4/dreambooth/model_list',
          sourceNotice: 'lookup-only (no api key configured)',
          catalogAvailable: true,
          requiresApiKey: true,
        },
      },
      catalogNotices: {
        modelslab: 'ModelsLab 官方模型列表需要 API Key (MODELSLAB_API_KEY)；支持直接在上方输入框中输入模型 ID / lora_model ID。',
      },
    }), { status: 200 });

    vi.stubGlobal('fetch', vi.fn(async () => mlNoKeyResponse));

    provider = 'modelslab';
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<ProviderModelSelect provider={provider} value="" onChange={vi.fn()} />);
    });
    await startLookup();

    expect(host.querySelector('[data-testid="no-catalog-guidance"]')).toBeNull();
    const statusText = host.querySelector('[data-testid="provider-model-catalog-status"]')?.textContent || '';
    expect(statusText).toContain('ModelsLab 官方模型列表需要 API Key');
  });

  it('never displays no-catalog-guidance card for openai_compat custom endpoint and displays server notice verbatim', async () => {
    const openaiResponse = new Response(JSON.stringify({
      openai_compat: [],
      results: { openai_compat: [] },
      _pagination: {
        openai_compat: {
          page: 1,
          limit: 50,
          total: 0,
          hasMore: false,
          sourceUrl: '',
          sourceNotice: 'lookup-only (custom endpoint)',
          isCustomEndpoint: true,
        },
      },
      catalogNotices: {
        openai_compat: 'OpenAI 兼容接口使用您配置的 Base URL 与模型名称，暂无全网统一目录；支持在上方输入框中直接输入模型 ID (如 dall-e-3) 按 ID 选用。',
      },
    }), { status: 200 });

    vi.stubGlobal('fetch', vi.fn(async () => openaiResponse));

    provider = 'openai_compat';
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<ProviderModelSelect provider={provider} value="" onChange={vi.fn()} />);
    });
    await startLookup();

    expect(host.querySelector('[data-testid="no-catalog-guidance"]')).toBeNull();
    const statusText = host.querySelector('[data-testid="provider-model-catalog-status"]')?.textContent || '';
    expect(statusText).toContain('OpenAI 兼容接口使用您配置的 Base URL 与模型名称');
  });

  it('never displays no-catalog-guidance card for openai_compat custom endpoint even if catalogAvailable is false', async () => {
    const openaiResponse = new Response(JSON.stringify({
      openai_compat: [],
      results: { openai_compat: [] },
      _pagination: {
        openai_compat: {
          page: 1,
          limit: 50,
          total: 0,
          hasMore: false,
          sourceUrl: '',
          sourceNotice: 'lookup-only (custom endpoint)',
          isCustomEndpoint: true,
          catalogAvailable: false,
        },
      },
      catalogNotices: {
        openai_compat: 'OpenAI 兼容接口使用您配置的 Base URL 与模型名称，暂无全网统一目录；支持在上方输入框中直接输入模型 ID (如 dall-e-3) 按 ID 选用。',
      },
    }), { status: 200 });

    vi.stubGlobal('fetch', vi.fn(async () => openaiResponse));

    provider = 'openai_compat';
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    await act(async () => {
      root.render(<ProviderModelSelect provider={provider} value="" onChange={vi.fn()} />);
    });
    await startLookup();
    await refresh();

    expect(host.querySelector('[data-testid="no-catalog-guidance"]')).toBeNull();
    const statusText = host.querySelector('[data-testid="provider-model-catalog-status"]')?.textContent || '';
    expect(statusText).toContain('OpenAI 兼容接口使用您配置的 Base URL 与模型名称');
  });
});
