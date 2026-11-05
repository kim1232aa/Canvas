import { describe, it, expect } from 'vitest';
import { NODE_DEFINITIONS } from './nodes';
import { EngineRegistry } from '../engines/EngineRegistry';

// AIVideoNode 服务商下拉必须与 EngineRegistry 里具备视频能力的活驱动对齐：
// 已接通的 wavespeed / muapi / novita / replicate / civitai 应可手动选择。
// NanoGPT 图像驱动没有视频能力，不得出现；视频路由在 /api/video/generate，等驱动接入后再加入。
function videoProviderOptionValues(): string[] {
  const def = NODE_DEFINITIONS['AIVideoNode'];
  const widget = def.widgets?.find((w) => w.name === 'targetProvider');
  return (widget?.options ?? [])
    .map((o) => String(o.value ?? '').trim())
    .filter(Boolean);
}

describe('AIVideoNode 服务商下拉与 EngineRegistry 视频驱动对齐', () => {
  it('已接通视频驱动的 wavespeed / muapi / novita / replicate / civitai 可手动选择', () => {
    const values = videoProviderOptionValues();
    for (const p of ['wavespeed', 'muapi', 'novita', 'replicate', 'civitai', 'together', 'aimlapi', 'venice', 'krea', 'sogni']) {
      expect(values).toContain(p);
    }
  });

  it('保留既有 fal / agnes / grok_compat 选项', () => {
    const values = videoProviderOptionValues();
    for (const p of ['fal', 'agnes', 'grok_compat']) {
      expect(values).toContain(p);
    }
  });

  it('每个可选服务商都注册了具备视频能力的驱动（NanoGPT 图像驱动不在其中）', () => {
    expect(videoProviderOptionValues()).not.toContain('nanogpt');
    for (const value of videoProviderOptionValues()) {
      const driver = EngineRegistry.getDriver(value);
      expect(driver, `服务商 ${value} 未注册驱动`).toBeDefined();
      const caps = driver!.capabilities as readonly string[];
      expect(
        caps.includes('text2video') || caps.includes('img2video'),
        `服务商 ${value} 的驱动不具备视频能力，不应出现在视频节点下拉中`
      ).toBe(true);
    }
  });
});
