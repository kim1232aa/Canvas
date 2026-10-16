import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const read = (rel: string) => readFileSync(join(__dirname, rel), 'utf8');

describe('fix4.1 toast clears bottom tool dock', () => {
  it('toast-container uses bottom-24 (above ModernToolDock bottom-6)', () => {
    const app = read('../App.tsx');
    const dock = read('../components/ModernToolDock.tsx');
    expect(app).toMatch(/data-testid="toast-container"[^>]*bottom-24/);
    expect(dock).toMatch(/data-canvas-chrome="bottom"[^>]*bottom-6/);
    expect(app).not.toMatch(/data-testid="toast-container"[^>]*\bbottom-6\b/);
  });
});

describe('fix4.1 segment status badge wraps on narrow cards', () => {
  it('history-upstream-seg-status allows wrap (no whitespace-nowrap)', () => {
    const src = read('../components/HistoryModal.tsx');
    const idx = src.indexOf('data-testid="history-upstream-seg-status"');
    expect(idx).toBeGreaterThan(0);
    const span = src.slice(Math.max(0, idx - 220), idx + 80);
    expect(span).toMatch(/whitespace-normal|break-words|overflow-wrap:anywhere/);
    expect(span).not.toMatch(/className=\{\`whitespace-nowrap/);
  });
});
