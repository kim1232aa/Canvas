import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowPresetsModal } from './WorkflowPresetsModal';

describe('preset modal blocked archives', () => {
  it('renders unselected models without fabricated families and disables blocked run actions', () => {
    const html = renderToStaticMarkup(<WorkflowPresetsModal isOpen onClose={vi.fn()} onLoadPreset={vi.fn()} onLoadAndRunPreset={vi.fn()} currentNodes={[]} currentConnections={[]} currentSpatialFrames={[]} onImportWorkflowData={vi.fn()} onClearCanvas={vi.fn()} />);
    expect(html).not.toContain('FLUX / SDXL');
    // Every standard card now carries a proven catalog model → no empty-model shell, no 待配置 for a missing model.
    expect(html).not.toContain('模型未选择/待重选');
    expect(html).not.toContain('请先载入并选择模型');
    // SenseNova/Sogni stay on roster with official default models (ids only appear in DOM when blocked).
    expect(html).toContain('SenseNova · 标准文生图');
    expect(html).toContain('Sogni · 标准文生图');
    expect(html).toContain('sensenova-u1.5-lite');
    expect(html).toContain('krea-2-turbo');
    expect(html).not.toContain('preset-blocked-std-sensenova-t2i');
    expect(html).not.toContain('preset-blocked-std-sogni-t2i');
    // MuAPI flux-1-dev-style-lora-inference: lora_url is REQUIRED by the official table and no recipe has a real one → 待配方, run disabled.
    expect(html).toContain('preset-blocked-std-muapi-t2i');
    expect(html).toContain('待配方：lora_url 为必填');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*[\s\S]*?待配方，不能立即运行/);
    expect(html).not.toContain('待配置：');
    expect(html).toContain('仅载入');
    expect(html).toContain('追加合并到当前画布，不覆盖已有内容');
  });
});
