import { describe, it, expect, vi, afterEach } from 'vitest';
import { NODE_DEFINITIONS } from './nodes';
import { AI_VIDEO_ASPECT_RATIOS, AI_VIDEO_MODEL_REGISTRY } from './videoModels';
import { EngineRegistry } from '../engines/EngineRegistry';
import { applyAIVideoModelSelection, assertAIVideoProviderReady } from '../utils/videoProvider';

function videoProviderOptionValues(): string[] {
  const widget = NODE_DEFINITIONS.AIVideoNode.widgets.find((w) => w.name === 'targetProvider');
  expect(widget, 'AIVideoNode provider widget').toBeDefined();
  return (widget!.options ?? []).map((o) => String(o.value ?? '').trim()).filter(Boolean);
}

afterEach(() => vi.unstubAllGlobals());

describe('AIVideoNode 服务商下拉与 EngineRegistry 视频驱动对齐', () => {
  it('保留已接入的视频服务商，包括动态模型目录的 novita / nanogpt / tensorart', () => {
    const values = videoProviderOptionValues();
    for (const p of ['wavespeed', 'muapi', 'replicate', 'civitai', 'together', 'aimlapi', 'venice', 'krea', 'sogni', 'novita', 'nanogpt', 'tensorart']) {
      expect(values).toContain(p);
    }
    expect(new Set(values).size).toBe(values.length);
  });

  it('保留既有 fal / agnes / grok_compat 选项', () => {
    for (const p of ['fal', 'agnes', 'grok_compat']) expect(videoProviderOptionValues()).toContain(p);
  });

  it('每个可选服务商都有真实视频能力，不把内部 video 调度器或纯图像驱动当作供应商', () => {
    const values = videoProviderOptionValues();
    expect(values).not.toContain('video');
    for (const value of values) {
      const driver = EngineRegistry.getDriver(value);
      expect(driver, `服务商 ${value} 未注册驱动`).toBeDefined();
      expect(driver!.capabilities.some((cap) => cap === 'text2video' || cap === 'img2video'), value).toBe(true);
    }
    for (const driver of EngineRegistry.getAllDrivers()) {
      if (!driver.capabilities.some((cap) => cap === 'text2video' || cap === 'img2video')) {
        expect(values, driver.id).not.toContain(driver.id);
      }
    }
  });

  it('静态推荐模型精确对应带来源的 registry，动态供应商不必伪造静态模型', () => {
    const widgets = NODE_DEFINITIONS.AIVideoNode.widgets;
    const model = widgets.find((w) => w.name === 'model');
    const aspect = widgets.find((w) => w.name === 'aspect_ratio');
    expect(model).toBeDefined();
    expect(aspect).toBeDefined();
    expect(model!.default).toBe('');
    expect(NODE_DEFINITIONS.AIVideoNode.defaultValues).toMatchObject({ targetProvider: '', model: '' });
    const options = model!.options ?? [];
    expect(options.filter((o) => o.value === '')).toHaveLength(1);
    const real = options.filter((o) => String(o.value ?? '').trim());
    expect(real.length).toBeGreaterThan(0);
    expect(real.map((o) => ({ id: o.value, provider: o.provider, source: o.description }))).toEqual(
      AI_VIDEO_MODEL_REGISTRY.map((entry) => ({ id: entry.id, provider: entry.provider, source: entry.sourceUrl })),
    );
    for (const option of real) {
      expect(videoProviderOptionValues()).toContain(option.provider);
      expect(option.value).toBe(String(option.value).trim());
      expect(option.description).toMatch(/^https:\/\//);
    }
    expect(JSON.stringify(widgets)).not.toMatch(/wan-?2\.1|Wan 2\.1|v2\.1/i);
    expect((aspect!.options ?? []).map((o) => o.value).filter(Boolean)).toEqual([...AI_VIDEO_ASPECT_RATIOS]);
  });

  it('自定义模型与未知供应商原值保留，未注册供应商明确报错且不发送替代请求', async () => {
    const values = { targetProvider: 'user-video-provider', provider: 'user-video-provider', model: '' };
    const selected = applyAIVideoModelSelection(values, 'user-owner/custom-motion-model');
    expect(selected).toEqual({ ...values, model: 'user-owner/custom-motion-model' });
    expect(assertAIVideoProviderReady(selected.model, selected.targetProvider)).toBe('user-video-provider');
    const request = vi.fn();
    vi.stubGlobal('fetch', request);
    await expect(EngineRegistry.generate('video', { targetProvider: selected.targetProvider, model: selected.model, prompt: 'A lighthouse at dusk, cinematic wide shot, slow dolly in', isVideo: true } as any)).rejects.toThrow('[user-video-provider]');
    expect(request).not.toHaveBeenCalled();
    expect(applyAIVideoModelSelection(selected, '')).toEqual({ ...values, targetProvider: '', provider: '', model: '' });
  });
});
