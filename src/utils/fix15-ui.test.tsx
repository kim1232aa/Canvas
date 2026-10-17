import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('fix15 UI: Tensor.Art 打开模型中心按钮不中段截断', () => {
  it('BackendSettingsModal hub button wraps instead of ellipsis mid-label', () => {
    const src = readFileSync(resolve(__dirname, '../components/BackendSettingsModal.tsx'), 'utf8');
    const i = src.indexOf('打开模型中心 · {currentProvider.name}');
    expect(i).toBeGreaterThan(0);
    const chunk = src.slice(Math.max(0, i - 500), i + 80);
    expect(chunk).toMatch(/whitespace-normal/);
    expect(chunk).toMatch(/overflow-wrap:anywhere|break-words/);
    expect(chunk).not.toMatch(/text-ellipsis|\btruncate\b/);
  });
});
