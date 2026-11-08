import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowPresetsModal } from './WorkflowPresetsModal';
import { WORKFLOW_PRESETS } from '../constants/presets';

const renderIncompleteVideo = (overrides: Record<string, unknown>) => {
  const base = WORKFLOW_PRESETS.find((p) => p.id === 'std-fal-t2v');
  expect(base, 'current T2V fixture').toBeDefined();
  const fixture = structuredClone(base!);
  fixture.id = 'user-incomplete-video';
  fixture.spatialFrames = [];
  const video = fixture.nodes.find((n) => n.type === 'AIVideoNode');
  expect(video, 'T2V video fixture').toBeDefined();
  video!.values = { ...video!.values, ...overrides };
  const count = WORKFLOW_PRESETS.length;
  WORKFLOW_PRESETS.push(fixture);
  try {
    return renderToStaticMarkup(<WorkflowPresetsModal isOpen onClose={vi.fn()} onLoadPreset={vi.fn()} onLoadAndRunPreset={vi.fn()} currentNodes={[]} currentConnections={[]} currentSpatialFrames={[]} onImportWorkflowData={vi.fn()} onClearCanvas={vi.fn()} />);
  } finally {
    WORKFLOW_PRESETS.splice(count);
  }
};

describe('preset modal blocked archives', () => {
  it('renders named model recipes without fabricated families and disables pending-recipe run actions', () => {
    const html = renderToStaticMarkup(<WorkflowPresetsModal isOpen onClose={vi.fn()} onLoadPreset={vi.fn()} onLoadAndRunPreset={vi.fn()} currentNodes={[]} currentConnections={[]} currentSpatialFrames={[]} onImportWorkflowData={vi.fn()} onClearCanvas={vi.fn()} />);
    expect(html).not.toContain('FLUX / SDXL');
    expect(html).toContain('SenseNova · 冰箱便签静物');
    expect(html).toContain('Sogni · 鱼眼赛博漫画');
    expect(html).toContain('sensenova-u1.5-lite');
    expect(html).toContain('krea-2-turbo');
    for (const provider of ['sensenova', 'sogni', 'muapi', 'krea']) {
      expect(html).not.toContain(`preset-blocked-std-${provider}-t2i`);
    }
    for (const id of ['std-modelslab-t2i', 'std-modelscope-ai-t2i']) {
      expect(html).toContain(`id="preset-blocked-${id}"`);
      expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*aria-describedby="preset-blocked-${id}"[^>]*>[\\s\\S]*?待配方，不能立即运行[\\s\\S]*?</button>`));
    }
    expect(html).toContain('待配方：');
    expect(html).toContain('仅载入');
    expect(html).toContain('仅追加载入待配置模板，不覆盖已有画布');
    expect(html).toContain('追加合并到当前画布，不覆盖已有内容');
  });

  it('I2V 仅载入 uses replace title when only blocked by require_reference_image', () => {
    const html = renderToStaticMarkup(<WorkflowPresetsModal isOpen onClose={vi.fn()} onLoadPreset={vi.fn()} onLoadAndRunPreset={vi.fn()} currentNodes={[]} currentConnections={[]} currentSpatialFrames={[]} onImportWorkflowData={vi.fn()} onClearCanvas={vi.fn()} />);
    // Run stays blocked; 仅载入 must replace (not append) so video presets do not stack on the default board.
    expect(html).toContain('preset-blocked-std-fal-i2v');
    expect(html).toContain('请先载入并选择参考图');
    expect(html).toMatch(/preset-blocked-std-fal-i2v[\s\S]{0,1200}title="清空当前画布并载入此工作流"/);
    expect(html).not.toMatch(/preset-blocked-std-fal-i2v[\s\S]{0,1200}title="仅追加载入待配置模板，不覆盖已有画布"/);
  });

  it('renders task type filters, provider filters, and upfront requirements (reference image / text input)', () => {
    const html = renderToStaticMarkup(<WorkflowPresetsModal isOpen onClose={vi.fn()} onLoadPreset={vi.fn()} onLoadAndRunPreset={vi.fn()} currentNodes={[]} currentConnections={[]} currentSpatialFrames={[]} onImportWorkflowData={vi.fn()} onClearCanvas={vi.fn()} />);
    // Task filters
    expect(html).toContain('文生图 (T2I)');
    expect(html).toContain('文生视频 (T2V)');
    expect(html).toContain('图生视频 (I2V)');
    expect(html).toContain('供应商:');
    // Upfront requirement badges
    expect(html).toContain('📷 需参考图');
    expect(html).toContain('✍️ 纯文本输入');
    expect(html).toContain('✍️ 需填写提示词');
    expect(html).toContain('该预设未预填提示词，载入画布后需填写提示词方可运行');
    for (const provider of ['Fal.ai', 'WaveSpeed', 'Civitai']) {
      expect(html).toContain(`${provider} · 电影镜头文生视频`);
      expect(html).toContain(`${provider} · 图生视频运镜`);
    }
    for (const id of ['std-replicate-t2v', 'std-muapi-t2v', 'std-novita-i2v', 'std-replicate-i2v', 'std-muapi-i2v']) {
      expect(html).not.toContain(`preset-blocked-${id}`);
    }
    // T2V is not blocked by reference image
    expect(html).not.toContain('preset-blocked-std-fal-t2v');
    expect(html).not.toContain('preset-blocked-std-wavespeed-t2v');
  });

  it('disables only the empty-prompt run button without relying on another blocked card', () => {
    const html = renderIncompleteVideo({ prompt: '' });
    const button = (html.match(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g) ?? []).find((b) => b.includes('<span>需填写提示词</span>'));
    expect(button, 'empty prompt run button').toBeDefined();
    expect(button).toContain('disabled=""');
    expect(button).toContain('title="请先载入画布并填写提示词"');
    expect(button).not.toContain('aria-describedby');
  });

  it('renders an unselected custom fixture as 待选 and disables its own run action', () => {
    const html = renderIncompleteVideo({ model: '' });
    expect(html).toContain('title="待选"');
    expect(html).toContain('id="preset-blocked-user-incomplete-video"');
    const button = (html.match(/<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<\/button>/g) ?? []).find((b) => b.includes('aria-describedby="preset-blocked-user-incomplete-video"'));
    expect(button, 'unselected-model run button').toBeDefined();
    expect(button).toContain('disabled=""');
    expect(button).toContain('待配置，不能立即运行');
    expect(button).toContain('请先载入并选择模型');
  });

  it('P1-1: strictly excludes legacy models (Wan 2.1, SVD-XT, SDXL 1.0) from modern recommended presets', () => {
    const html = renderToStaticMarkup(<WorkflowPresetsModal isOpen onClose={vi.fn()} onLoadPreset={vi.fn()} onLoadAndRunPreset={vi.fn()} currentNodes={[]} currentConnections={[]} currentSpatialFrames={[]} onImportWorkflowData={vi.fn()} onClearCanvas={vi.fn()} />);
    expect(html).not.toContain('fal-ai/wan-t2v-lora');
    expect(html).not.toContain('fal-ai/wan-i2v-lora');
    expect(html).not.toContain('wavespeed-ai/wan-2.1');
    expect(html).not.toContain('SVD-XT');
    expect(html).not.toContain('tamarin-xl-v1');
    expect(html).not.toContain('wan2.1-lora');
    expect(html).not.toContain('wan-video/wan2.1-with-lora');
    // Confirms modern Wan 2.2 recommendations are present
    expect(html).toContain('fal-ai/wan/v2.2-a14b/text-to-video/lora');
    expect(html).toContain('fal-ai/wan/v2.2-a14b/image-to-video/lora');
    expect(html).toContain('wavespeed-ai/wan-2.2/t2v-480p-lora');
    expect(html).toContain('wavespeed-ai/wan-2.2/i2v-480p-lora');
  });

  it('renders Tensor.Art and NanoGPT target engines and the Wan 2.2 video quick-fill pill on the extract tab', () => {
    const html = renderToStaticMarkup(<WorkflowPresetsModal isOpen initialTab="civitai-extract" onClose={vi.fn()} onLoadPreset={vi.fn()} currentNodes={[]} currentConnections={[]} currentSpatialFrames={[]} onImportWorkflowData={vi.fn()} onClearCanvas={vi.fn()} />);
    expect(html).toContain('Tensor.Art');
    expect(html).toContain('需重选 TAMS 数字 ID');
    expect(html).toContain('NanoGPT');
    expect(html).toContain('Wan 2.2 I2V 视频 (#111400580 · 目标引擎 AI Video)');
    expect(html).not.toContain('自动匹配');
  });
});
