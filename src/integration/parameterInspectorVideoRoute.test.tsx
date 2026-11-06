// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParameterInspector } from '../components/ParameterInspector';
import { patchInspectorNode, readInspectorParameters } from '../utils/inspectorParameters';
import type { ComfyParameters, NodeInstance } from '../types/graph';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};

describe('parameterInspectorVideoRoute integration: video provider selection, close/reopen readback and Civitai fields', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) await act(async () => root.unmount());
    document.body.innerHTML = '';
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

    expect(host.querySelector('select[aria-label="Civitai engine"]')).not.toBeNull();
    expect(host.querySelector('input[aria-label="Civitai ecosystem"]')).not.toBeNull();
    expect(host.querySelector('input[aria-label="Civitai model"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="civitai-allow-mature-control"]')).not.toBeNull();
  });
});
