// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { ParameterInspector } from './ParameterInspector';
import { NODE_DEFINITIONS } from '../constants/nodes';
import type { ComfyParameters } from '../types/graph';
import { patchInspectorNode, readInspectorParameters, resolveNodeVideoSelectors, type CivitaiVideoInspectorParams } from '../utils/inspectorParameters';
import type { NodeInstance } from '../types/graph';
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

  // Fixture mirrors the verified live VideoGenInput tree: engine -> (wan) version -> provider -> operation, (ltx2.3) operation.
  const nestedVideoOpenApi = {
    components: {
      schemas: {
        VideoGenInput: { discriminator: { propertyName: 'engine', mapping: { wan: '#/components/schemas/WanVideoGenInput', 'ltx2.3': '#/components/schemas/ComfyLtx23VideoGenInput' } } },
        WanVideoGenInput: { allOf: [{ $ref: '#/components/schemas/VideoGenInput' }, { discriminator: { propertyName: 'version', mapping: { 'v2.2': '#/components/schemas/Wan22VideoGenInput' } } }] },
        Wan22VideoGenInput: { allOf: [{ $ref: '#/components/schemas/WanVideoGenInput' }, { discriminator: { propertyName: 'provider', mapping: { fal: '#/components/schemas/Wan22FalVideoGenInput' } } }] },
        Wan22FalVideoGenInput: { allOf: [{ $ref: '#/components/schemas/Wan22VideoGenInput' }, { discriminator: { propertyName: 'operation', mapping: { 'text-to-video': '#/components/schemas/Wan22FalTextToVideoInput' } } }] },
        Wan22FalTextToVideoInput: { allOf: [{ $ref: '#/components/schemas/Wan22FalVideoGenInput' }] },
        ComfyLtx23VideoGenInput: { allOf: [{ $ref: '#/components/schemas/VideoGenInput' }, { discriminator: { propertyName: 'operation', mapping: { createVideo: '#/components/schemas/ComfyLtx23CreateVideoInput' } } }] },
        ComfyLtx23CreateVideoInput: { allOf: [{ $ref: '#/components/schemas/ComfyLtx23VideoGenInput' }] },
      },
    },
  };
  const OLD_MODEL = 'wan:v2.2:fal:text-to-video';
  const entries: Array<[string, () => NodeInstance]> = [
    ['AIVideoNode targetProvider=civitai', () => ({ id: 'n', type: 'AIVideoNode', title: 'v', pos: { x: 0, y: 0 }, inputs: [], outputs: [], values: { model: OLD_MODEL, targetProvider: 'civitai' } })],
    ['CheckpointLoaderSimple targetProvider=video/video_provider=civitai', () => ({ id: 'n', type: 'CheckpointLoaderSimple', title: 'c', pos: { x: 0, y: 0 }, inputs: [], outputs: [], values: { ckpt_name: OLD_MODEL, targetProvider: 'video', video_provider: 'civitai' } })],
  ];

  it.each(entries)('real read -> panel click -> patch -> resolve chain keeps cleared selectors cleared (%s)', async (_name, make) => {
    clearSharedGet();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(nestedVideoOpenApi), { status: 200, headers: { 'content-type': 'application/json' } })));
    let latest!: NodeInstance;
    const Harness = ({ initial }: { initial: NodeInstance }) => {
      const [node, setNode] = React.useState(initial);
      latest = node;
      const current = readInspectorParameters([node], [], node.id);
      return <ParameterInspector params={current} onChange={(next) => setNode((n) => patchInspectorNode(n, current, next))} onOpenCivitai={noop} />;
    };
    const mount = async (initial: NodeInstance) => {
      await act(async () => root.render(<Harness initial={initial} />));
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    };
    const select = (label: string) => host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
    const choose = async (label: string, value: string) => {
      const el = select(label);
      expect(el, label).not.toBeNull();
      await act(async () => { el!.value = value; el!.dispatchEvent(new Event('change', { bubbles: true })); });
    };

    await mount(make());
    // Panel shows the live-schema selectors for the real node, seeded from the user's original model ID.
    expect(select('Civitai engine')?.value).toBe('wan');
    expect(select('Civitai version')?.value).toBe('v2.2');
    expect(select('Civitai schema provider')?.value).toBe('fal');
    expect(select('Civitai operation')?.value).toBe('text-to-video');
    expect(resolveNodeVideoSelectors(latest.values)).toEqual({ engine: 'wan', version: 'v2.2', provider: 'fal', operation: 'text-to-video' });

    // Change the parent: children are dropped and not re-filled from the old model ID.
    await choose('Civitai engine', 'ltx2.3');
    expect(latest.values.video_selectors).toEqual({ engine: 'ltx2.3' });
    expect(resolveNodeVideoSelectors(latest.values)).toEqual({ engine: 'ltx2.3' });
    expect(select('Civitai engine')?.value).toBe('ltx2.3');
    expect(select('Civitai version')).toBeNull();
    expect(select('Civitai operation')?.value).toBe('');
    expect(latest.values.model ?? latest.values.ckpt_name).toBe(OLD_MODEL);

    // Save and reopen: the explicit choice survives, the old model ID does not refill it.
    await act(async () => root.unmount());
    root = createRoot(host);
    await mount(JSON.parse(JSON.stringify(latest)) as NodeInstance);
    expect(select('Civitai engine')?.value).toBe('ltx2.3');
    expect(select('Civitai operation')?.value).toBe('');
    expect(resolveNodeVideoSelectors(latest.values)).toEqual({ engine: 'ltx2.3' });

    // Clear everything: {} is the choice; nothing comes back after reopen either.
    await choose('Civitai engine', '');
    expect(latest.values.video_selectors).toEqual({});
    expect(resolveNodeVideoSelectors(latest.values)).toEqual({});
    await act(async () => root.unmount());
    root = createRoot(host);
    await mount(JSON.parse(JSON.stringify(latest)) as NodeInstance);
    expect(select('Civitai engine')?.value).toBe('');
    expect(Array.from(host.querySelectorAll('[data-testid="civitai-video-live-selectors"] select')).map((e) => (e as HTMLSelectElement).getAttribute('aria-label'))).toEqual(['Civitai engine']);
    expect(resolveNodeVideoSelectors(latest.values)).toEqual({});
  });

  it('shows the live Civitai selectors for a real AIVideoNode with targetProvider=civitai but not for other providers', async () => {
    await act(async () => {
      root.render(<ParameterInspector params={params({ targetProvider: 'civitai', videoProvider: 'civitai', checkpoint: OLD_MODEL })} onChange={noop} onOpenCivitai={noop} />);
    });
    expect(host.querySelector('[data-testid="civitai-video-live-selectors"]')).not.toBeNull();
    await act(async () => {
      root.render(<ParameterInspector params={params({ targetProvider: 'civitai', checkpoint: 'urn:air:sdxl:checkpoint:civitai:1@2' })} onChange={noop} onOpenCivitai={noop} />);
    });
    expect(host.querySelector('[data-testid="civitai-video-live-selectors"]')).toBeNull();
    await act(async () => {
      root.render(<ParameterInspector params={params({ targetProvider: 'fal', videoProvider: 'fal' })} onChange={noop} onOpenCivitai={noop} />);
    });
    expect(host.querySelector('[data-testid="civitai-video-live-selectors"]')).toBeNull();
  });
});

describe('ParameterInspector unset values stay unset (mounted controlled component)', () => {
  let host: HTMLDivElement;
  let root: Root;

  const Harness = ({ initial, spy }: { initial: ComfyParameters; spy: (next: ComfyParameters) => void }) => {
    const [current, setCurrent] = React.useState(initial);
    return <ParameterInspector params={current} onChange={(next) => { spy(next); setCurrent(next); }} onOpenCivitai={noop} />;
  };
  const nano = (partial: Partial<ComfyParameters> = {}) =>
    params({ targetProvider: 'nanogpt', checkpoint: 'fixture-model', resolution: '1024x1024', loras: [], ...partial });
  const mount = async (initial: ComfyParameters, spy: (next: ComfyParameters) => void = vi.fn()) => {
    await act(async () => { root.render(<Harness initial={initial} spy={spy} />); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    return spy;
  };
  const type = async (el: HTMLInputElement, value: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };
  const input = (label: string) => host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
  const sizeAlert = () => host.querySelector('[role="alert"]');
  const sizeStatus = () => host.querySelector('[data-testid="nanogpt-size-incomplete"]');

  beforeEach(() => {
    clearSharedGet();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    clearSharedGet();
    vi.unstubAllGlobals();
  });

  it('NanoGPT resolution without width/height: no conflict, no undefinedxundefined, no hidden size write', async () => {
    const spy = await mount(nano({ width: undefined, height: undefined }));
    expect(sizeAlert()).toBeNull();
    expect(sizeStatus()).toBeNull();
    expect(host.textContent).not.toContain('undefined');
    expect(host.textContent).toContain('width=未填写');
    expect(host.textContent).toContain('height=未填写');
    expect(input('NanoGPT resolution').value).toBe('1024x1024');
    expect(spy).not.toHaveBeenCalled();
  });

  it('NanoGPT resolution with only one of width/height shows the specific missing field, not a conflict', async () => {
    await mount(nano({ width: 1024, height: undefined }));
    expect(sizeAlert()).toBeNull();
    expect(sizeStatus()?.textContent).toContain('已填 width=1024');
    expect(sizeStatus()?.textContent).toContain('缺少 height');
    await act(async () => root.render(<Harness initial={nano({ width: undefined, height: 768 })} spy={vi.fn()} />));
    expect(sizeAlert()).toBeNull();
  });

  it('NanoGPT resolution mismatching both filled pixel sizes shows the concrete conflict', async () => {
    await mount(nano({ resolution: '512x512', width: 1024, height: 768 }));
    expect(sizeAlert()?.textContent).toContain('尺寸冲突');
    expect(sizeAlert()?.textContent).toContain('512x512');
    expect(sizeAlert()?.textContent).toContain('1024x768');
    expect(sizeStatus()).toBeNull();
  });

  it('NanoGPT resolution equal to both filled pixel sizes shows neither conflict nor incomplete notice', async () => {
    await mount(nano({ resolution: '1024x1024', width: 1024, height: 1024 }));
    expect(sizeAlert()).toBeNull();
    expect(sizeStatus()).toBeNull();
  });

  it('NanoGPT treats an explicit width 0 as filled (conflict), not as missing', async () => {
    await mount(nano({ resolution: '1024x1024', width: 0, height: 1024 }));
    expect(sizeAlert()?.textContent).toContain('0x1024');
    expect(sizeStatus()).toBeNull();
  });

  it('NanoGPT conflict follows live edits: clearing a size field switches from conflict to incomplete, never auto-fills', async () => {
    const spy = await mount(nano({ resolution: '512x512', width: 1024, height: 1024 }));
    expect(sizeAlert()).not.toBeNull();
    await type(host.querySelector<HTMLInputElement>('input[type="number"][step="64"]')!, '');
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ width: undefined, height: 1024, resolution: '512x512' }));
    expect(sizeAlert()).toBeNull();
    expect(sizeStatus()?.textContent).toContain('缺少 width');
  });

  it('unset steps/cfg sliders render as unset, commit nothing on mount, and commit only after the user acts', async () => {
    const spy = await mount(nano({ steps: undefined, cfg: undefined }));
    const stepsRange = input('steps 滑块');
    const cfgRange = input('cfg 滑块');
    expect(spy).not.toHaveBeenCalled();
    // MDN: a range input is never empty; the unset thumb sits at min, never the midpoint 40.5 / 10.5 posing as a selection.
    expect(stepsRange.value).toBe('1');
    expect(cfgRange.value).toBe('1');
    for (const range of [stepsRange, cfgRange]) {
      expect(range.getAttribute('data-unset')).toBe('true');
      expect(range.getAttribute('aria-valuetext')).toBe('未设置');
    }
    expect(input('steps').value).toBe('');
    expect(input('cfg').value).toBe('');
    expect(host.textContent).toContain('未设置');

    await type(stepsRange, '40');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ steps: 40, cfg: undefined }));
    expect(input('steps 滑块').getAttribute('data-unset')).toBeNull();
    expect(input('steps 滑块').value).toBe('40');
    expect(input('steps').value).toBe('40');
    expect(input('cfg 滑块').getAttribute('data-unset')).toBe('true');

    await type(input('cfg 滑块'), '7.5');
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ steps: 40, cfg: 7.5 }));
    expect(input('cfg').value).toBe('7.5');
  });

  it('steps/cfg number inputs: explicit 0 is committed, empty returns to unset', async () => {
    const spy = await mount(nano({ steps: 20, cfg: 7 }));
    expect(input('steps 滑块').getAttribute('data-unset')).toBeNull();

    await type(input('steps'), '0');
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ steps: 0 }));
    expect(input('steps').value).toBe('0');
    expect(input('steps 滑块').getAttribute('data-unset')).toBeNull();
    expect(host.textContent).toContain('0 步');

    await type(input('cfg'), '0');
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ steps: 0, cfg: 0 }));
    expect(host.textContent).toContain('0.0');

    await type(input('steps'), '');
    expect(spy).toHaveBeenLastCalledWith(expect.objectContaining({ steps: undefined, cfg: 0 }));
    expect(input('steps 滑块').getAttribute('data-unset')).toBe('true');
    expect(input('steps').value).toBe('');
  });

  it('filled steps/cfg keep the slider thumb on the filled value', async () => {
    await mount(nano({ steps: 33, cfg: 4.5 }));
    expect(input('steps 滑块').value).toBe('33');
    expect(input('cfg 滑块').value).toBe('4.5');
    expect(input('steps 滑块').getAttribute('aria-valuetext')).toBeNull();
  });
});


describe('ParameterInspector prompt refine controls', () => {
  let host: HTMLDivElement;
  let root: Root;
  const prompt = 'a lighthouse above the foggy coast at dawn';
  const mount = async (onChangePrompt = vi.fn()) => {
    await act(async () => {
      root.render(
        <ParameterInspector
          params={params()}
          onChange={noop}
          positivePrompt={prompt}
          onChangePositivePrompt={onChangePrompt}
          onOpenCivitai={noop}
        />
      );
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    return onChangePrompt;
  };
  const select = async (label: string, value: string) => {
    const element = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
    expect(element, label).not.toBeNull();
    await act(async () => {
      element!.value = value;
      element!.dispatchEvent(new Event('change', { bubbles: true }));
    });
  };

  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('/api/refine-prompt/capabilities')) {
        return new Response(JSON.stringify({ providers: [{ provider: 'gemini', label: 'Google Gemini', catalog: 'live' }] }), { status: 200 });
      }
      if (String(url).includes('/api/models?')) {
        return new Response(JSON.stringify({ results: { gemini: [{ id: 'runtime-refine-model', name: 'Runtime Refine Model', category: 'reasoning', type: 'Reasoning' }] } }), { status: 200 });
      }
      if (String(url).includes('/api/gemini/refine-prompt')) {
        return new Response(JSON.stringify({ refinedPrompt: 'A lighthouse rises above a misty coast at sunrise.' }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });

  it('offers a clickable provider/model picker instead of a dead-end when nothing is selected', async () => {
    await mount();
    const refine = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('AI 润色'));
    expect(refine).toBeDefined();
    await act(async () => { refine!.click(); });

    expect(host.querySelector('[data-testid="refine-model-picker"]')).not.toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('选择润色服务商与模型');
    expect(host.querySelector('select[aria-label="润色服务商"]')).not.toBeNull();
  });

  it('selects a live model, refines the current prompt with that exact choice, and survives a remount', async () => {
    let onChangePrompt = await mount();
    await select('润色服务商', 'gemini');
    await select('润色模型', 'runtime-refine-model');
    const refine = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('AI 润色'));
    await act(async () => { refine!.click(); });

    expect(onChangePrompt).toHaveBeenCalledWith('A lighthouse rises above a misty coast at sunrise.');
    const post = (fetch as any).mock.calls.find(([url]: [string]) => String(url).includes('/api/gemini/refine-prompt'));
    expect(JSON.parse(post[1].body)).toMatchObject({
      prompt,
      provider: 'gemini',
      model: 'runtime-refine-model',
    });

    await act(async () => root.unmount());
    root = createRoot(host);
    onChangePrompt = await mount();
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="润色服务商"]')?.value).toBe('gemini');
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="润色模型"]')?.value).toBe('runtime-refine-model');
  });

  it('does not offer a persisted provider after its configured key disappears', async () => {
    localStorage.setItem('comfycanvas_refine_provider', 'gemini');
    localStorage.setItem('comfycanvas_refine_model', 'runtime-refine-model');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/refine-prompt/capabilities')) {
        return new Response(JSON.stringify({ providers: [] }), { status: 200 });
      }
      return new Response(JSON.stringify({ results: {} }), { status: 200 });
    }));
    await mount();

    expect(Array.from(host.querySelectorAll('select[aria-label="润色服务商"] option')).map((option) => option.value)).toEqual(['']);
    expect(host.textContent).toContain('没有可用的润色服务商');
  });

  it('shows the exact upstream HTTP status and response text inline on failure', async () => {
    await mount();
    await select('润色服务商', 'gemini');
    await select('润色模型', 'runtime-refine-model');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/models?')) {
        return new Response(JSON.stringify({ results: { gemini: [{ id: 'runtime-refine-model', name: 'Runtime Refine Model', category: 'reasoning', type: 'Reasoning' }] } }), { status: 200 });
      }
      return new Response('{"error":"upstream quota exhausted"}', { status: 503, statusText: 'Service Unavailable' });
    }));
    const refine = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('AI 润色'));
    await act(async () => { refine!.click(); });

    expect(host.querySelector('[data-testid="refine-error"]')?.textContent).toContain('HTTP 503');
    expect(host.querySelector('[data-testid="refine-error"]')?.textContent).toContain('{"error":"upstream quota exhausted"}');
  });
});
