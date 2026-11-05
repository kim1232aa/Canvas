import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowPresetsModal } from './WorkflowPresetsModal';

describe('preset modal blocked archives', () => {
  it('renders unselected models without fabricated families and disables blocked run actions', () => {
    const html = renderToStaticMarkup(<WorkflowPresetsModal isOpen onClose={vi.fn()} onLoadPreset={vi.fn()} onLoadAndRunPreset={vi.fn()} currentNodes={[]} currentConnections={[]} currentSpatialFrames={[]} onImportWorkflowData={vi.fn()} onClearCanvas={vi.fn()} />);
    expect(html).not.toContain('FLUX / SDXL');
    // SenseNova/Sogni stay on roster with official default models (ids only appear in DOM when blocked).
    expect(html).toContain('SenseNova · 标准文生图');
    expect(html).toContain('Sogni · 标准文生图');
    expect(html).toContain('sensenova-u1.5-lite');
    expect(html).toContain('krea-2-turbo');
    expect(html).not.toContain('preset-blocked-std-sensenova-t2i');
    expect(html).not.toContain('preset-blocked-std-sogni-t2i');
    // Default presets are runnable as loaded (no 待配方 lock on Krea/MuAPI).
    expect(html).not.toContain('preset-blocked-std-muapi-t2i');
    expect(html).not.toContain('preset-blocked-std-krea-t2i');
    expect(html).toMatch(/bg-slate-700\/80[^"]*"[^>]*disabled=""|disabled=""[^>]*bg-slate-700\/80/);
    expect(html).toContain('待配置：');
    expect(html).toContain('仅载入');
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
    // New standard T2V presets rendered
    expect(html).toContain('Fal.ai · 标准文生视频');
    expect(html).toContain('WaveSpeed · 标准文生视频');
    expect(html).toContain('Replicate · 标准文生视频');
    expect(html).toContain('MuAPI · 标准文生视频');
    expect(html).toContain('Civitai · 标准文生视频');
    // T2V is not blocked by reference image
    expect(html).not.toContain('preset-blocked-std-fal-t2v');
    expect(html).not.toContain('preset-blocked-std-wavespeed-t2v');
  });

  it('disables 载入并立即运行 when preset has empty prompt (needsPrompt)', () => {
    const html = renderToStaticMarkup(<WorkflowPresetsModal isOpen onClose={vi.fn()} onLoadPreset={vi.fn()} onLoadAndRunPreset={vi.fn()} currentNodes={[]} currentConnections={[]} currentSpatialFrames={[]} onImportWorkflowData={vi.fn()} onClearCanvas={vi.fn()} />);
    // Presets with empty prompts show "需填写提示词" and their run button is disabled
    expect(html).toContain('需填写提示词');
    // Button must be disabled and display "需填写提示词"
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[\s\S]*?需填写提示词[\s\S]*?<\/button>/);
  });
});
