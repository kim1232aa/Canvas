// @vitest-environment jsdom
import React, { act } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SpatialFrameItem } from './SpatialFrameItem';
import type { ComfyParameters, SpatialFrame } from '../types/graph';
import { setFieldCapabilitySchemaLookup } from '../utils/fieldCapability';
import { getModelSchemaEntry } from '../services/modelSchemaCache';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const prompt = 'a lighthouse above the foggy coast at dawn';
const params: ComfyParameters = {
  checkpoint: 'image-model',
  targetProvider: 'gemini',
  loras: [],
};
const makeFrame = (partial: Partial<SpatialFrame> = {}): SpatialFrame => ({
  id: 'frame-1',
  title: 'Frame 1',
  pos: { x: 0, y: 0 },
  width: 480,
  height: 480,
  prompt,
  negativePrompt: '',
  params,
  status: 'idle',
  createdAt: 1,
  ...partial,
});
const noop = () => {};

describe('SpatialFrameItem prompt refine controls', () => {
  let host: HTMLDivElement;
  let root: Root;
  let onUpdateFrame: ReturnType<typeof vi.fn<(frameId: string, partial: Partial<SpatialFrame>) => void>>;
  const mount = async (frame = makeFrame()) => {
    await act(async () => {
      root.render(<SpatialFrameItem
        frame={frame}
        isSelected={false}
        zoom={1}
        onSelect={noop}
        onStartDrag={noop}
        onUpdateFrame={onUpdateFrame}
        onDeleteFrame={noop}
        onQueueFrame={noop}
        onOpenInspector={noop}
        onPreviewImage={noop}
        onBranchVariation={noop}
      />);
    });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
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
    onUpdateFrame = vi.fn();
    vi.stubGlobal('alert', vi.fn());
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/refine-prompt/capabilities')) {
        return new Response(JSON.stringify({ providers: [{ provider: 'gemini', label: 'Google Gemini', catalog: 'live' }] }), { status: 200 });
      }
      if (String(url).includes('/api/models?')) {
        return new Response(JSON.stringify({ results: { gemini: [{ id: 'runtime-refine-model', name: 'Runtime Refine Model', category: 'reasoning' }] } }), { status: 200 });
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
    document.body.innerHTML = '';
  });

  it('offers a clickable provider/model picker when nothing is selected', async () => {
    await mount();
    const refine = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('AI 优化'));
    expect(refine).toBeDefined();
    await act(async () => { refine!.click(); });

    expect(host.querySelector('[data-testid="refine-model-picker"]')).not.toBeNull();
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('选择润色服务商与模型');
    expect(host.querySelector('select[aria-label="润色服务商"]')).not.toBeNull();
    expect(window.alert).not.toHaveBeenCalled();
  });

  it('sends the frame prompt and selected live provider/model, updates the prompt, and retains selection after remount', async () => {
    const frame = makeFrame();
    await mount(frame);
    await select('润色服务商', 'gemini');
    await select('润色模型', 'runtime-refine-model');
    const refine = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('AI 优化'));
    await act(async () => { refine!.click(); });

    expect(onUpdateFrame).toHaveBeenCalledWith('frame-1', { prompt: 'A lighthouse rises above a misty coast at sunrise.' });
    const post = (fetch as any).mock.calls.find(([url]: [string]) => String(url).includes('/api/gemini/refine-prompt'));
    expect(JSON.parse(post[1].body)).toMatchObject({ prompt, provider: 'gemini', model: 'runtime-refine-model' });

    await act(async () => root.unmount());
    root = createRoot(host);
    await mount(frame);
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="润色服务商"]')?.value).toBe('gemini');
    expect(host.querySelector<HTMLSelectElement>('select[aria-label="润色模型"]')?.value).toBe('runtime-refine-model');
  });

  it('shows the upstream status and raw response body inline after a refine failure', async () => {
    await mount();
    await select('润色服务商', 'gemini');
    await select('润色模型', 'runtime-refine-model');
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/refine-prompt/capabilities')) {
        return new Response(JSON.stringify({ providers: [{ provider: 'gemini', label: 'Google Gemini', catalog: 'live' }] }), { status: 200 });
      }
      if (String(url).includes('/api/models?')) {
        return new Response(JSON.stringify({ results: { gemini: [{ id: 'runtime-refine-model', name: 'Runtime Refine Model', category: 'reasoning' }] } }), { status: 200 });
      }
      return new Response('<html>upstream unavailable</html>', { status: 503, statusText: 'Service Unavailable' });
    }));
    const refine = Array.from(host.querySelectorAll('button')).find((button) => button.textContent?.includes('AI 优化'));
    await act(async () => { refine!.click(); });

    expect(host.querySelector('[data-testid="spatial-refine-error"]')?.textContent).toContain('HTTP 503');
    expect(host.querySelector('[data-testid="spatial-refine-error"]')?.textContent).toContain('<html>upstream unavailable</html>');
  });
});

describe('M148: SpatialFrameItem fieldCapability integration & transparency', () => {
  const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
  const falFixture = json('../server/fixtures/fal-openapi-fal-ai__flux-lora.json');
  const falSchema = falFixture.components.schemas.FluxLoraInput;
  const falProps = falSchema.properties;

  afterEach(() => {
    setFieldCapabilitySchemaLookup((p, m) => getModelSchemaEntry(p, m));
  });

  const renderFrameStatic = (frame: SpatialFrame) => {
    const noop = () => {};
    return renderToStaticMarkup(
      <SpatialFrameItem
        frame={frame}
        isSelected={false}
        zoom={1}
        onSelect={noop}
        onStartDrag={noop}
        onUpdateFrame={noop}
        onDeleteFrame={noop}
        onQueueFrame={noop}
        onOpenInspector={noop}
        onPreviewImage={noop}
        onBranchVariation={noop}
      />
    );
  };

  it('1. 静态 unsupported: 未填值不渲染 chip，有已有值时显示可见提示且值不被清空', () => {
    // sampler on fal fal-ai/flux-lora is static unsupported
    // Case A: empty sampler -> chip not rendered
    const emptyFrame = makeFrame({
      params: {
        checkpoint: 'fal-ai/flux-lora',
        targetProvider: 'fal',
        loras: [],
        sampler: '',
        scheduler: '',
        steps: 20,
        cfg: 7,
      },
    });
    const htmlEmpty = renderFrameStatic(emptyFrame);
    expect(htmlEmpty).not.toContain('spatial-chip-sampler');

    // Case B: filled sampler ('euler') -> notice visible with field name, value, 本次不发送, static-spec
    const filledFrame = makeFrame({
      params: {
        checkpoint: 'fal-ai/flux-lora',
        targetProvider: 'fal',
        loras: [],
        sampler: 'euler',
        scheduler: 'normal',
        steps: 20,
        cfg: 7,
      },
    });
    const htmlFilled = renderFrameStatic(filledFrame);
    expect(htmlFilled).toContain('spatial-unsupported-notice-sampler');
    expect(htmlFilled).toContain('sampler');
    expect(htmlFilled).toContain('euler');
    expect(htmlFilled).toContain('本次不发送');
    expect(htmlFilled).toContain('static-spec');
    expect(filledFrame.params.sampler).toBe('euler');
  });

  it('2. fal open schema: 缺字段为 unknown，渲染但带「未确认」标识', () => {
    setFieldCapabilitySchemaLookup((p, m) => {
      if (p === 'fal' && m === 'fal-ai/flux-lora') {
        return {
          status: 'ready',
          properties: Object.keys(falProps),
          propertiesObj: falProps,
          inputSchema: falSchema,
        };
      }
      return undefined;
    });

    // In fal open schema without additionalProperties:false, denoise is absent in schema and has no static spec -> unknown
    const frame = makeFrame({
      params: {
        checkpoint: 'fal-ai/flux-lora',
        targetProvider: 'fal',
        loras: [],
        denoise: 0.8,
        steps: 28,
        cfg: 3.5,
      },
    });
    const html = renderFrameStatic(frame);
    expect(html).toContain('未确认');
    expect(html).toContain('spatial-chip-denoise');
  });

  it('3. targetProvider==="video" 时解析真实 videoProvider，不能传 "video" 占位当 provider id', () => {
    let capturedProvider: string | null | undefined = null;
    setFieldCapabilitySchemaLookup((p, m) => {
      capturedProvider = p;
      return undefined;
    });

    const frame = makeFrame({
      params: {
        checkpoint: 'fal-ai/kling-video/v3/standard/image-to-video',
        targetProvider: 'video',
        videoProvider: 'fal',
        loras: [],
      },
    });
    renderFrameStatic(frame);
    expect(capturedProvider).not.toBe('video');
    expect(capturedProvider).toBe('fal');
  });
});
