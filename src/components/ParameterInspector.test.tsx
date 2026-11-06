// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ParameterInspector } from './ParameterInspector';
import { NODE_DEFINITIONS } from '../constants/nodes';
import type { ComfyParameters } from '../types/graph';
import type { CivitaiVideoInspectorParams } from '../utils/inspectorParameters';
import { CIVITAI_VIDEO_OPENAPI_URL } from '../schemas/civitaiVideo';
import { clearSharedGet } from '../services/sharedGet';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};
const params = (partial: Partial<ComfyParameters> = {}): ComfyParameters => ({
  checkpoint: 'model.safetensors',
  targetProvider: 'civitai',
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
  ...partial,
});

const elements = (tree: any): any[] =>
  !tree ? [] : Array.isArray(tree) ? tree.flatMap(elements) : typeof tree === 'object' && tree.props ? [tree, ...elements(tree.props.children)] : [];

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('ParameterInspector ComfyUI API JSON export', () => {
  it('does not copy JSON when sampler or scheduler is unset and explains why', async () => {
    vi.spyOn(React, 'useState').mockImplementation(((value: unknown) => [value, vi.fn()]) as any);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const alert = vi.fn();
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { clipboard: { writeText } } });
    Object.defineProperty(globalThis, 'alert', { configurable: true, value: alert });
    const tree = ParameterInspector({ params: params(), onChange: noop, onOpenCivitai: noop });
    const button = elements(tree).find((element) => element.type === 'button' && element.props.title === '复制标准 ComfyUI JSON 工作流片段');

    expect(button).toBeDefined();
    await button.props.onClick();

    expect(writeText).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledWith('请先选择采样器与调度器，否则复制的 JSON 会包含你未选择的参数');
  });
});

describe('ParameterInspector Sogni LoRA strength control', () => {
  it('uses the exact catalog range when present and leaves the numeric control unbounded when unknown', () => {
    const known=renderToStaticMarkup(<ParameterInspector params={params({targetProvider:'sogni',loras:[{name:'known',modelStrength:3,baseModel:'',strengthRange:{min:-2,max:5,step:0.1}}] as any})} onChange={noop} onOpenCivitai={noop}/>);
    expect(known).toContain('官方目录范围 [-2, 5]');
    expect(known).toContain('type="range" min="-2" max="5" step="0.1"');
    const unknown=renderToStaticMarkup(<ParameterInspector params={params({targetProvider:'sogni',loras:[{name:'custom',modelStrength:12,baseModel:''}] as any})} onChange={noop} onOpenCivitai={noop}/>);
    expect(unknown).toContain('官方目录范围未知，运行时核验');
    expect(unknown).toContain('type="number" step="any"');
    expect(unknown).not.toContain('min="-1.5"');
    expect(unknown).not.toContain('max="2"');
  });
});

describe('ParameterInspector provider registry derivation and selection (mounted component)', () => {
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
    clearSharedGet();
    vi.unstubAllGlobals();
  });

  it('derives image provider buttons from CheckpointLoaderSimple node registry, including formerly missing options', async () => {
    const registryOptions = NODE_DEFINITIONS.CheckpointLoaderSimple.widgets?.find((w) => w.name === 'targetProvider')?.options || [];
    expect(registryOptions.length).toBeGreaterThanOrEqual(26);

    const onChange = vi.fn();
    await act(async () => {
      root.render(<ParameterInspector params={params({ targetProvider: 'fal' })} onChange={onChange} onOpenCivitai={noop} />);
    });

    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.grid button'));

    // Every registry option must have a matching button in the inspector
    for (const opt of registryOptions) {
      const button = buttons.find((b) => b.title === opt.label || b.textContent?.trim() === opt.label);
      expect(button, `Button for provider ${opt.value} (${opt.label})`).toBeDefined();
    }

    // Explicitly test clicking each formerly missing option
    for (const missingId of ['runware', 'modelslab', 'video', 'replicate', 'mage']) {
      const opt = registryOptions.find((o) => o.value === missingId);
      expect(opt).toBeDefined();
      const button = buttons.find((b) => b.title === opt!.label || b.textContent?.trim() === opt!.label);
      expect(button).toBeDefined();

      await act(async () => {
        button!.click();
      });

      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
        targetProvider: missingId,
        checkpoint: '',
      }));
    }

    // Explicitly test clicking the empty provider option
    const emptyButton = buttons.find((b) => b.title === '未选择 (清空服务商)' || b.textContent?.trim() === '未选择 (清空服务商)');
    expect(emptyButton, 'Explicit empty provider button').toBeDefined();
    await act(async () => {
      emptyButton!.click();
    });
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
      targetProvider: '',
      checkpoint: '',
    }));
  });

  it('keeps unknown / imported targetProvider visible and highlighted in mounted component', async () => {
    const customProvider = 'custom_foreign_provider' as any;
    await act(async () => {
      root.render(<ParameterInspector params={params({ targetProvider: customProvider })} onChange={noop} onOpenCivitai={noop} />);
    });

    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('.grid button'));
    const customButton = buttons.find((b) => b.title === customProvider || b.textContent?.trim() === customProvider);

    expect(customButton).toBeDefined();
    expect(customButton?.className).toContain('text-cyan-300 font-bold');
  });

  it('derives actual video provider dropdown options from AIVideoNode registry and keeps empty / unknown visible', async () => {
    const videoOptions = NODE_DEFINITIONS.AIVideoNode.widgets?.find((w) => w.name === 'targetProvider')?.options || [];
    expect(videoOptions.length).toBeGreaterThanOrEqual(14); // 1 empty + 13 registered

    const onChange = vi.fn();
    await act(async () => {
      root.render(
        <ParameterInspector
          params={params({ targetProvider: 'video', videoProvider: 'custom_video_engine' })}
          onChange={onChange}
          onOpenCivitai={noop}
        />
      );
    });

    const select = host.querySelector<HTMLSelectElement>('select[aria-label="实际视频服务商"]');
    expect(select).not.toBeNull();

    const options = Array.from(select!.options);

    // Verify all registry options are present
    for (const opt of videoOptions) {
      const optEl = options.find((o) => o.value === opt.value);
      expect(optEl, `Option for video provider ${opt.value}`).toBeDefined();
    }

    // Verify explicit empty selection is preserved
    const emptyOption = options.find((o) => o.value === '');
    expect(emptyOption).toBeDefined();

    // Verify unknown imported videoProvider is preserved
    const unknownOption = options.find((o) => o.value === 'custom_video_engine');
    expect(unknownOption).toBeDefined();

    // Selecting formerly missing video provider (e.g. civitai) updates videoProvider via change event
    await act(async () => {
      select!.value = 'civitai';
      select!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      videoProvider: 'civitai',
    }));
  });

  it('makes Civitai-specific fields accessible when selecting Civitai as actual video provider', async () => {
    await act(async () => {
      root.render(
        <ParameterInspector
          params={params({
            targetProvider: 'video',
            videoProvider: 'civitai',
            civitaiEngine: 'comfy',
            civitaiEcosystem: 'flux',
            civitaiModel: 'civitai:12345',
          })}
          onChange={noop}
          onOpenCivitai={noop}
        />
      );
    });

    expect(host.querySelector('[data-testid="civitai-video-live-selectors"]')).not.toBeNull();
    expect(host.querySelector('input[aria-label="Civitai ecosystem"]')).not.toBeNull();
    expect(host.querySelector('input[aria-label="Civitai model"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="civitai-allow-mature-control"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="视频时长（秒）"]')).not.toBeNull();
    expect(host.querySelector('input[aria-label="视频 resolution"]')).not.toBeNull();
  });

  const liveVideoOpenApi = {
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
  };

  it('derives Civitai video engine/version/operation options from the live OpenAPI and updates params on select', async () => {
    clearSharedGet();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(String(url)).toBe(CIVITAI_VIDEO_OPENAPI_URL);
      return new Response(JSON.stringify(liveVideoOpenApi), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const onChange = vi.fn();
    let current: CivitaiVideoInspectorParams = params({ targetProvider: 'video', videoProvider: 'civitai' });
    const rerender = async (next: CivitaiVideoInspectorParams) => {
      current = next;
      await act(async () => {
        root.render(<ParameterInspector params={current} onChange={onChange} onOpenCivitai={noop} />);
      });
    };
    await rerender(current);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });

    const engine = host.querySelector<HTMLSelectElement>('select[aria-label="Civitai engine"]');
    expect(engine).not.toBeNull();
    expect(Array.from(engine!.options).map((o) => o.value)).toEqual(['', 'wan', 'ltx2']);
    await act(async () => {
      engine!.value = 'wan';
      engine!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      civitaiEngine: 'wan',
      civitaiVersion: undefined,
      civitaiBackend: undefined,
      civitaiOperation: undefined,
    }));
    await rerender({ ...current, civitaiEngine: 'wan' });
    const version = host.querySelector<HTMLSelectElement>('select[aria-label="Civitai version"]');
    expect(Array.from(version!.options).map((o) => o.value)).toEqual(['', 'v2.1']);
    await act(async () => {
      version!.value = 'v2.1';
      version!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ civitaiVersion: 'v2.1' }));
    await rerender({ ...current, civitaiVersion: 'v2.1' });
    expect(Array.from(host.querySelector<HTMLSelectElement>('select[aria-label="Civitai schema provider"]')!.options).map((o) => o.value)).toEqual(['', 'civitai']);

    await rerender({ ...params({ targetProvider: 'video', videoProvider: 'civitai', civitaiEngine: 'ltx2' }) });
    const operation = host.querySelector<HTMLSelectElement>('select[aria-label="Civitai operation"]');
    expect(Array.from(operation!.options).map((o) => o.value)).toEqual(['', 'createVideo']);
    await act(async () => {
      operation!.value = 'createVideo';
      operation!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ civitaiOperation: 'createVideo' }));
  });

  it('shows the live Civitai video OpenAPI fetch failure verbatim without swapping provider or model', async () => {
    clearSharedGet();
    const raw = '<html>upstream 502</html>';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(raw, { status: 502, headers: { 'content-type': 'text/html' } })));
    await act(async () => {
      root.render(
        <ParameterInspector
          params={params({ targetProvider: 'video', videoProvider: 'civitai', checkpoint: 'keep-this-model' })}
          onChange={noop}
          onOpenCivitai={noop}
        />
      );
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    const alert = host.querySelector('[role="alert"][aria-label="Civitai 视频 Schema 请求失败"]');
    expect(alert).not.toBeNull();
    expect(alert?.textContent).toContain(CIVITAI_VIDEO_OPENAPI_URL);
    expect(alert?.textContent).toContain('502');
    expect(alert?.querySelector('pre')?.textContent).toBe(raw);
    expect(host.textContent).toContain('keep-this-model');
  });
});
