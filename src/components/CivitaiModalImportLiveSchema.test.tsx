// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CivitaiModalImportPreview } from './CivitaiModalImportPreview';
import { adaptCivitaiRecipeToProvider, type CivitaiRecipeInput } from '../utils/civitaiImportMap';
import { ensureModelSchema, getModelSchemaEntry } from '../services/modelSchemaCache';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const flush = async () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

describe('CivitaiModalImportPreview Live Schema Mounted UI Tests (P1-1)', () => {
  let host: HTMLDivElement;
  let root: Root;

  const sampleRecipe: CivitaiRecipeInput = {
    checkpoint: 'urn:air:flux1:checkpoint:civitai:618692@691639',
    baseModel: 'Flux.1 D',
    prompt: 'cinematic photo of a neon city',
    negativePrompt: 'blurry, distorted',
    steps: 28,
    cfg: 3.5,
    sampler: 'euler',
    scheduler: 'simple',
    seed: 987654321,
    width: 1024,
    height: 768,
    loras: [
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
  });

  it('(a) no model selected -> every LoRA card is unverified with missing-model guidance', async () => {
    const adaptation = adaptCivitaiRecipeToProvider(sampleRecipe, 'fal', {
      targetModel: '',
    });

    await act(async () => {
      root.render(
        <CivitaiModalImportPreview
          adaptation={adaptation}
          selectedProvider="fal"
          onSelectProvider={vi.fn()}
          targetModel=""
          onSelectTargetModel={vi.fn()}
          tokenConsent={false}
          onToggleTokenConsent={vi.fn()}
        />
      );
    });
    await flush();

    const statusBadge = host.querySelector('[data-testid="import-lora-status-0"]');
    const reasonText = host.querySelector('[data-testid="import-lora-reason-0"]');

    expect(statusBadge?.textContent).toBe('未核实');
    expect(reasonText?.textContent).toContain('未选择目标模型');
  });

  it('(b) model selected, schema loading -> card reports unverified with loading reason', async () => {
    // Stub fetchImpl to return a pending promise
    const pendingPromise = new Promise(() => {});
    const customFetch = vi.fn().mockReturnValue(pendingPromise);

    // Call ensureModelSchema with pending fetch to put cache in 'loading' state
    ensureModelSchema('fal', 'loading-model-endpoint', customFetch as any);
    const entry = getModelSchemaEntry('fal', 'loading-model-endpoint');
    expect(entry?.status).toBe('loading');

    const adaptation = adaptCivitaiRecipeToProvider(sampleRecipe, 'fal', {
      targetModel: 'loading-model-endpoint',
      targetSchema: undefined,
    });

    await act(async () => {
      root.render(
        <CivitaiModalImportPreview
          adaptation={adaptation}
          selectedProvider="fal"
          onSelectProvider={vi.fn()}
          targetModel="loading-model-endpoint"
          onSelectTargetModel={vi.fn()}
          tokenConsent={false}
          onToggleTokenConsent={vi.fn()}
        />
      );
    });
    await flush();

    const loadingNote = host.querySelector('[data-testid="schema-loading-note"]');
    expect(loadingNote?.textContent).toContain('正在读取目标模型官方 Schema');

    const statusBadge = host.querySelector('[data-testid="import-lora-status-0"]');
    expect(statusBadge?.textContent).toBe('未核实');
  });

  it('(c1) schema ready with loras items {path, scale} -> card shows path target and download URL (compatible)', async () => {
    const readySchema = {
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
    };

    const adaptation = adaptCivitaiRecipeToProvider(sampleRecipe, 'fal', {
      targetModel: 'fal-ai/flux-lora',
      targetSchema: readySchema,
    });

    await act(async () => {
      root.render(
        <CivitaiModalImportPreview
          adaptation={adaptation}
          selectedProvider="fal"
          onSelectProvider={vi.fn()}
          targetModel="fal-ai/flux-lora"
          onSelectTargetModel={vi.fn()}
          tokenConsent={false}
          onToggleTokenConsent={vi.fn()}
        />
      );
    });
    await flush();

    const statusBadge = host.querySelector('[data-testid="import-lora-status-0"]');
    const reasonText = host.querySelector('[data-testid="import-lora-reason-0"]');

    expect(statusBadge?.textContent).toBe('可直接发送');
    expect(reasonText?.textContent).toContain('path');
    expect(host.innerHTML).toContain('https://civitai.com/api/download/models/1527024');
  });

  it('(c2) schema ready with loras items {air, strength} -> card shows AIR target', async () => {
    const airSchema = {
      loras: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            air: { type: 'string' },
            strength: { type: 'number' },
          },
        },
      },
    };

    const adaptation = adaptCivitaiRecipeToProvider(sampleRecipe, 'fal', {
      targetModel: 'custom-air-endpoint',
      targetSchema: airSchema,
    });

    await act(async () => {
      root.render(
        <CivitaiModalImportPreview
          adaptation={adaptation}
          selectedProvider="fal"
          onSelectProvider={vi.fn()}
          targetModel="custom-air-endpoint"
          onSelectTargetModel={vi.fn()}
          tokenConsent={false}
          onToggleTokenConsent={vi.fn()}
        />
      );
    });
    await flush();

    const statusBadge = host.querySelector('[data-testid="import-lora-status-0"]');
    expect(statusBadge?.textContent).toBe('可直接发送');
    expect(host.innerHTML).toContain('urn:air:flux1:lora:civitai:1351798@1527024');
  });

  it('(c3) schema ready with loras items {id, strength} -> card shows requires native catalog id', async () => {
    const idSchema = {
      loras: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            strength: { type: 'number' },
          },
        },
      },
    };

    const adaptation = adaptCivitaiRecipeToProvider(sampleRecipe, 'fal', {
      targetModel: 'custom-catalog-id-endpoint',
      targetSchema: idSchema,
    });

    await act(async () => {
      root.render(
        <CivitaiModalImportPreview
          adaptation={adaptation}
          selectedProvider="fal"
          onSelectProvider={vi.fn()}
          targetModel="custom-catalog-id-endpoint"
          onSelectTargetModel={vi.fn()}
          tokenConsent={false}
          onToggleTokenConsent={vi.fn()}
        />
      );
    });
    await flush();

    const statusBadge = host.querySelector('[data-testid="import-lora-status-0"]');
    expect(statusBadge?.textContent).toBe('需在目标库选用');
  });

  it('(d) schema error -> card is unverified with verbatim HTTP error', async () => {
    const errorFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => ({ error: 'Bad Gateway from upstream schema host' }),
    });

    ensureModelSchema('fal', 'error-endpoint-test', errorFetch as any);
    await flush();

    const entry = getModelSchemaEntry('fal', 'error-endpoint-test');
    expect(entry?.status).toBe('error');
    expect(entry?.error).toContain('HTTP 502');

    const adaptation = adaptCivitaiRecipeToProvider(sampleRecipe, 'fal', {
      targetModel: 'error-endpoint-test',
      targetSchema: undefined,
    });

    await act(async () => {
      root.render(
        <CivitaiModalImportPreview
          adaptation={adaptation}
          selectedProvider="fal"
          onSelectProvider={vi.fn()}
          targetModel="error-endpoint-test"
          onSelectTargetModel={vi.fn()}
          tokenConsent={false}
          onToggleTokenConsent={vi.fn()}
        />
      );
    });
    await flush();

    const errorNote = host.querySelector('[data-testid="schema-error-note"]');
    expect(errorNote?.textContent).toContain('HTTP 502');

    const statusBadge = host.querySelector('[data-testid="import-lora-status-0"]');
    expect(statusBadge?.textContent).toBe('未核实');
  });
});
