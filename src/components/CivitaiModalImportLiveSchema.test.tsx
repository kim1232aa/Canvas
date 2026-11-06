// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CivitaiModal } from './CivitaiModal';
import { CivitaiModalImportPreview } from './CivitaiModalImportPreview';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const flush = async (ms = 30) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

describe('CivitaiModal & CivitaiModalImportPreview Reactive Live Schema Tests (P1-1)', () => {
  let host: HTMLDivElement;
  let root: Root;

  const samplePreset = {
    id: 'test-preset-flux',
    prompt: 'cinematic photo of a neon city',
    negativePrompt: 'blurry, distorted',
    nodes: [
      {
        id: 'ckpt-node',
        type: 'CheckpointLoaderSimple',
        values: { ckpt_name: 'urn:air:flux1:checkpoint:civitai:618692@691639' },
      },
    ],
    otherMetadata: {
      baseModel: 'Flux.1 D',
      steps: 28,
      cfgScale: 3.5,
      sampler: 'euler',
      scheduler: 'simple',
      seed: 987654321,
      width: 1024,
      height: 768,
      resources: [
        {
          name: 'Cinematic 1940s',
          displayName: 'Cinematic 1940s',
          civitaiId: '1527024',
          modelId: '1351798',
          versionId: '1527024',
          air: 'urn:air:flux1:lora:civitai:1351798@1527024',
          strength: 0.3,
          baseModel: 'Flux.1 D',
          downloadUrl: 'https://civitai.com/api/download/models/1527024',
          requireAuth: false,
        },
      ],
    },
  };

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root.unmount();
      });
    }
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('parent CivitaiModal async chain: parse -> select model -> loading (unverified) -> ready (compatible)', async () => {
    let schemaResolve: ((value: any) => void) | undefined;
    const schemaPromise = new Promise((resolve) => {
      schemaResolve = resolve;
    });

    const mockFetch = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/api/civitai/extract-workflow')) {
        return new Response(JSON.stringify({ ok: true, success: true, preset: samplePreset }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (u.includes('/api/model-schema')) {
        const body = await schemaPromise;
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (u.includes('/api/models') || u.includes('/fal')) {
        return new Response(JSON.stringify({ data: [{ id: 'fal-ai/flux-lora', name: 'FLUX.1 [dev] LoRA' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    vi.stubGlobal('fetch', mockFetch);

    // 1. Mount CivitaiModal
    await act(async () => {
      root.render(
        <CivitaiModal
          isOpen={true}
          initialMode="import"
          onClose={vi.fn()}
          onSelectLoRA={vi.fn()}
          onAddLoRANodeToCanvas={vi.fn()}
        />
      );
    });
    await flush();

    // 2. Click quick-fill button to trigger workflow extraction
    const quickBtn = host.querySelector('[data-testid="civitai-quick-fill-sd15"]') as HTMLButtonElement;
    expect(quickBtn).toBeTruthy();
    await act(async () => {
      quickBtn.click();
    });
    await flush(50);

    // 3. Extracted preview should now be rendered by CivitaiModal
    const previewEl = host.querySelector('[data-testid="civitai-import-preview"]');
    expect(previewEl).toBeTruthy();

    // Switch provider to fal
    const falBtn = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Fal.ai'));
    if (falBtn) {
      await act(async () => {
        falBtn.click();
      });
      await flush(50);
    }

    // Initial state: no model chosen -> status is 未核实 with missing model guidance
    const statusBadge0 = host.querySelector('[data-testid="import-lora-status-0"]');
    const reasonText0 = host.querySelector('[data-testid="import-lora-reason-0"]');
    expect(statusBadge0?.textContent).toBe('未核实');
    expect(reasonText0?.textContent).toContain('未选择目标模型');

    // 4. Select target model: fal-ai/flux-lora
    const modelSelect = host.querySelector('select[aria-label="当前供应商底模"]') as HTMLSelectElement;
    expect(modelSelect).toBeTruthy();

    if (![...modelSelect.options].some((o) => o.value === 'fal-ai/flux-lora')) {
      const opt = document.createElement('option');
      opt.value = 'fal-ai/flux-lora';
      opt.textContent = 'fal-ai/flux-lora';
      modelSelect.appendChild(opt);
    }

    await act(async () => {
      modelSelect.value = 'fal-ai/flux-lora';
      modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();

    // 5. While schema fetch is pending: schemaEntry is loading
    const loadingNote = host.querySelector('[data-testid="schema-loading-note"]');
    expect(loadingNote?.textContent).toContain('正在读取目标模型官方 Schema');

    const statusBadgeLoading = host.querySelector('[data-testid="import-lora-status-0"]');
    const reasonTextLoading = host.querySelector('[data-testid="import-lora-reason-0"]');
    expect(statusBadgeLoading?.textContent).toBe('未核实');
    expect(reasonTextLoading?.textContent).toContain('正在读取目标模型官方 Schema');

    // 6. Now resolve the schema fetch with real loras {path, scale} schema
    await act(async () => {
      schemaResolve!({
        ok: true,
        inputSchema: {
          properties: {
            loras: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  scale: { type: 'number' },
                },
              },
            },
          },
        },
      });
    });
    await flush(50);

    // 7. Verification: parent re-rendered reactively via subscribeModelSchema!
    const readyNote = host.querySelector('[data-testid="schema-ready-note"]');
    expect(readyNote?.textContent).toContain('实时 Schema 已就绪');

    const statusBadgeReady = host.querySelector('[data-testid="import-lora-status-0"]');
    const reasonTextReady = host.querySelector('[data-testid="import-lora-reason-0"]');
    expect(statusBadgeReady?.textContent).toBe('可直接发送');
    expect(reasonTextReady?.textContent).toContain('path');
    expect(host.innerHTML).toContain('https://civitai.com/api/download/models/1527024');
  });

  it('parent CivitaiModal async chain: schema error -> card reflects verbatim upstream HTTP error', async () => {
    let schemaResolve: ((value: any) => void) | undefined;
    const schemaPromise = new Promise((resolve) => {
      schemaResolve = resolve;
    });

    const mockFetch = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/api/civitai/extract-workflow')) {
        return new Response(JSON.stringify({ ok: true, success: true, preset: samplePreset }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (u.includes('/api/model-schema')) {
        await schemaPromise;
        return new Response(JSON.stringify({ error: 'Gateway Timeout from target provider' }), {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    vi.stubGlobal('fetch', mockFetch);

    await act(async () => {
      root.render(
        <CivitaiModal
          isOpen={true}
          initialMode="import"
          onClose={vi.fn()}
          onSelectLoRA={vi.fn()}
          onAddLoRANodeToCanvas={vi.fn()}
        />
      );
    });
    await flush();

    const quickBtn = host.querySelector('[data-testid="civitai-quick-fill-sd15"]') as HTMLButtonElement;
    await act(async () => {
      quickBtn.click();
    });
    await flush(50);

    // Switch provider to fal
    const falBtn = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Fal.ai'));
    if (falBtn) {
      await act(async () => {
        falBtn.click();
      });
      await flush(50);
    }

    const modelSelect = host.querySelector('select[aria-label="当前供应商底模"]') as HTMLSelectElement;
    expect(modelSelect).toBeTruthy();

    if (![...modelSelect.options].some((o) => o.value === 'fal-ai/failing-endpoint')) {
      const opt = document.createElement('option');
      opt.value = 'fal-ai/failing-endpoint';
      opt.textContent = 'fal-ai/failing-endpoint';
      modelSelect.appendChild(opt);
    }

    await act(async () => {
      modelSelect.value = 'fal-ai/failing-endpoint';
      modelSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();

    // Resolve with 502
    await act(async () => {
      schemaResolve!(null);
    });
    await flush(50);

    const errorNote = host.querySelector('[data-testid="schema-error-note"]');
    expect(errorNote?.textContent).toContain('HTTP 502');

    const statusBadge = host.querySelector('[data-testid="import-lora-status-0"]');
    const reasonText = host.querySelector('[data-testid="import-lora-reason-0"]');
    expect(statusBadge?.textContent).toBe('未核实');
    expect(reasonText?.textContent).toContain('HTTP 502');
  });

  it('standalone CivitaiModalImportPreview with preset updates dynamically when model is chosen and schema resolves', async () => {
    let schemaResolve: ((value: any) => void) | undefined;
    const schemaPromise = new Promise((resolve) => {
      schemaResolve = resolve;
    });

    const mockFetch = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/api/model-schema')) {
        const body = await schemaPromise;
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });
    vi.stubGlobal('fetch', mockFetch);

    let currentModel = '';
    const handleSelectModel = vi.fn((m: string) => {
      currentModel = m;
    });

    const renderPreview = () =>
      root.render(
        <CivitaiModalImportPreview
          preset={samplePreset}
          adaptation={{
            provider: 'fal',
            displayName: 'Fal.ai',
            isCompatible: false,
            baseModelArchitecture: 'Flux.1 D',
            baseModelStatus: 'requires_selection',
            baseModelMessage: '测试',
            fields: {},
            unsupportedFields: [],
            loras: [
              {
                name: 'Cinematic 1940s',
                status: 'unverified',
                reason: '初始未核实',
              },
            ],
            warnings: [],
          }}
          selectedProvider="fal"
          onSelectProvider={vi.fn()}
          targetModel={currentModel}
          onSelectTargetModel={handleSelectModel}
          tokenConsent={false}
          onToggleTokenConsent={vi.fn()}
        />
      );

    await act(async () => {
      renderPreview();
    });
    await flush();

    // Select model
    const selectEl = host.querySelector('select[aria-label="当前供应商底模"]') as HTMLSelectElement;
    if (![...selectEl.options].some((o) => o.value === 'fal-ai/dynamic-target')) {
      const opt = document.createElement('option');
      opt.value = 'fal-ai/dynamic-target';
      opt.textContent = 'fal-ai/dynamic-target';
      selectEl.appendChild(opt);
    }

    await act(async () => {
      selectEl.value = 'fal-ai/dynamic-target';
      selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    });
    // Re-render with new targetModel
    await act(async () => {
      renderPreview();
    });
    await flush();

    const loadingNote = host.querySelector('[data-testid="schema-loading-note"]');
    expect(loadingNote?.textContent).toContain('正在读取目标模型官方 Schema');

    // Resolve schema
    await act(async () => {
      schemaResolve!({
        inputSchema: {
          properties: {
            loras: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  path: { type: 'string' },
                  scale: { type: 'number' },
                },
              },
            },
          },
        },
      });
    });
    await flush(50);

    const readyNote = host.querySelector('[data-testid="schema-ready-note"]');
    expect(readyNote?.textContent).toContain('实时 Schema 已就绪');

    const statusBadge = host.querySelector('[data-testid="import-lora-status-0"]');
    expect(statusBadge?.textContent).toBe('可直接发送');
  });
});
