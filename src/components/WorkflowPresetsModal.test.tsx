import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorkflowPresetsModal } from './WorkflowPresetsModal';

describe('preset modal blocked archives', () => {
  it('renders unselected models without fabricated families and disables blocked run actions', () => {
    const html = renderToStaticMarkup(<WorkflowPresetsModal isOpen onClose={vi.fn()} onLoadPreset={vi.fn()} onLoadAndRunPreset={vi.fn()} currentNodes={[]} currentConnections={[]} currentSpatialFrames={[]} onImportWorkflowData={vi.fn()} onClearCanvas={vi.fn()} />);
    expect(html).not.toContain('FLUX / SDXL');
    expect(html).toContain('模型未选择/待重选');
    expect(html).toContain('来源执行链尚未接入本站');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*[\s\S]*?待配置/);
    expect(html).toContain('仅载入');
    expect(html).toContain('追加合并到当前画布，不覆盖已有内容');
  });
});
