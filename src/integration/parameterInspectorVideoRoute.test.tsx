// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParameterInspector } from '../components/ParameterInspector';
import { patchInspectorNode, readInspectorParameters } from '../utils/inspectorParameters';
import type { ComfyParameters, NodeInstance } from '../types/graph';
import { CIVITAI_VIDEO_OPENAPI_URL } from '../schemas/civitaiVideo';
import { clearSharedGet } from '../services/sharedGet';
import { executeWorkflow } from '../utils/graphEngine';
import { CivitaiDriver } from '../engines/drivers/CivitaiDriver';
import { EngineRegistry } from '../engines/EngineRegistry';
import * as api from '../services/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};

describe('parameterInspectorVideoRoute integration: video provider selection, close/reopen readback and Civitai fields', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    clearSharedGet();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url) === CIVITAI_VIDEO_OPENAPI_URL) {
        return new Response(JSON.stringify({
          components: {
            schemas: {
              VideoGenInput: { discriminator: { propertyName: 'engine', mapping: { wan: '#/components/schemas/WanVideoGenInput', ltx2: '#/components/schemas/ComfyLtx2VideoGenInput' } } },
              WanVideoGenInput: { allOf: [{ $ref: '#/components/schemas/VideoGenInput' }, { discriminator: { propertyName: 'version', mapping: { 'v2.1': '#/components/schemas/Wan21VideoGenInput' } } }] },
              Wan21VideoGenInput: { allOf: [{ $ref: '#/components/schemas/WanVideoGenInput' }, { discriminator: { propertyName: 'provider', mapping: { civitai: '#/components/schemas/Wan21CivitaiVideoGenInput' } } }] },
              Wan21CivitaiVideoGenInput: { allOf: [{ $ref: '#/components/schemas/Wan21VideoGenInput' }] },
              ComfyLtx2VideoGenInput: { allOf: [{ $ref: '#/components/schemas/VideoGenInput' }, { discriminator: { propertyName: 'operation', mapping: { createVideo: '#/components/schemas/ComfyLtx2CreateVideoInput' } } }] },
              ComfyLtx2CreateVideoInput: { allOf: [{ $ref: '#/components/schemas/ComfyLtx2VideoGenInput' }] },
            },
          },
        }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }));
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    document.body.innerHTML = '';
    clearSharedGet();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('selects Civitai from video provider dropdown, persists to node values, reads back on close/reopen, and renders Civitai fields', async () => {
    let currentParams: ComfyParameters = {
      checkpoint: 'fal-ai/wan-t2v',
      targetProvider: 'video',
      videoProvider: 'fal',
      width: 1024,
      height: 1024,
      batchSize: 1,
      seed: 1,
      steps: 20,
      cfg: 7,
      sampler: '',
      scheduler: '',
      denoise: 1,
      loras: [],
    };

    let node: NodeInstance = {
      id: 'ckpt-loader-1',
      type: 'CheckpointLoaderSimple',
      title: 'Checkpoint',
      pos: { x: 0, y: 0 },
      inputs: [],
      outputs: [],
      values: {
        ckpt_name: 'fal-ai/wan-t2v',
        targetProvider: 'video',
        video_provider: 'fal',
      },
    };

    const handleChange = vi.fn((newParams: ComfyParameters) => {
      node = patchInspectorNode(node, currentParams, newParams);
      currentParams = newParams;
    });

    // 1. Initial mount of ParameterInspector
    await act(async () => {
      root.render(<ParameterInspector params={currentParams} onChange={handleChange} onOpenCivitai={noop} />);
    });

    // Verify actual-video-provider select exists and currently selects 'fal'
    const select = host.querySelector<HTMLSelectElement>('select[aria-label="实际视频服务商"]');
    expect(select).not.toBeNull();
    expect(select?.value).toBe('fal');

    // Civitai fields should not be visible yet
    expect(host.querySelector('select[aria-label="Civitai engine"]')).toBeNull();

    // 2. User selects 'civitai' in actual-video-provider dropdown
    await act(async () => {
      select!.value = 'civitai';
      select!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(handleChange).toHaveBeenCalledWith(expect.objectContaining({
      videoProvider: 'civitai',
    }));

    // Verify node values now hold video_provider = 'civitai'
    expect(node.values.video_provider).toBe('civitai');

    // 3. Simulate close drawer (unmount)
    await act(async () => {
      root.unmount();
    });
    document.body.innerHTML = '';
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);

    // 4. Simulate reopen drawer: read parameters back from the node via readInspectorParameters
    const reopenedParams = readInspectorParameters([node], [], 'ckpt-loader-1');
    expect(reopenedParams.targetProvider).toBe('video');
    expect(reopenedParams.videoProvider).toBe('civitai');

    // Mount inspector again with reopenedParams
    await act(async () => {
      root.render(<ParameterInspector params={reopenedParams} onChange={handleChange} onOpenCivitai={noop} />);
    });

    // 5. Verify select value is read back as 'civitai' and Civitai fields are now accessible
    const reopenedSelect = host.querySelector<HTMLSelectElement>('select[aria-label="实际视频服务商"]');
    expect(reopenedSelect?.value).toBe('civitai');

    expect(host.querySelector('[data-testid="civitai-video-live-selectors"]')).not.toBeNull();
    expect(host.querySelector('input[aria-label="Civitai ecosystem"]')).not.toBeNull();
    expect(host.querySelector('input[aria-label="Civitai model"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="civitai-allow-mature-control"]')).not.toBeNull();

    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    const engine = host.querySelector<HTMLSelectElement>('select[aria-label="Civitai engine"]');
    expect(engine).not.toBeNull();
    expect(Array.from(engine!.options).map((o) => o.value)).toEqual(['', 'wan', 'ltx2']);
  });

  it('executeWorkflow from a CheckpointLoaderSimple Civitai video canvas posts engine/version/operation to /api/engine/civitai/generate', async () => {
    vi.spyOn(api, 'getStoredApiKeys').mockReturnValue({} as any);
    vi.spyOn(EngineRegistry, 'generate').mockImplementation((_provider, params, keys) => new CivitaiDriver().generate(params, keys || {}));
    const requests: Array<{ url: string; body: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ videoUrl: 'https://example.test/out.mp4' }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));

    const ckpt: NodeInstance = {
      id: 'ckpt-1',
      type: 'CheckpointLoaderSimple',
      title: 'Checkpoint',
      pos: { x: 0, y: 0 },
      inputs: [],
      outputs: [],
      values: {
        ckpt_name: 'urn:air:wan:checkpoint:civitai:1@2',
        targetProvider: 'video',
        video_provider: 'civitai',
        prompt: 'waves crashing',
        civitai_engine: 'wan',
        civitai_version: 'v2.1',
        civitai_backend: 'civitai',
        civitai_operation: 'createVideo',
        video_selectors: { engine: 'wan', version: 'v2.1', provider: 'civitai', operation: 'createVideo' },
      },
    };

    await executeWorkflow([ckpt], [], () => {}, undefined, 'ckpt-1');

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('/api/engine/civitai/generate');
    expect(requests[0].body).toMatchObject({
      isVideo: true,
      model: 'urn:air:wan:checkpoint:civitai:1@2',
      prompt: 'waves crashing',
      engine: 'wan',
      version: 'v2.1',
      provider: 'civitai',
      operation: 'createVideo',
    });
  });
});
