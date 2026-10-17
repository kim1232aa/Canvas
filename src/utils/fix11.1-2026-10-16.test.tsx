import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dockAvoidingStyle } from '../components/ExecutionLog';
import { formatHistorySize, historyParameterSourceLabel } from './historyParameters';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('fix11.1', () => {
  it('#2 narrow viewport parks exec-log under top chrome, never above dock', () => {
    const vp = { width: 900, height: 1000 };
    const s = dockAvoidingStyle({ left: 200, top: 920, bottom: 960 }, vp, 110) as any;
    expect(s.top).toBe(138); // 110 + EXEC_TOP_PARK_GAP 28
    expect(s.left).toBe(12);
    expect(s.bottom).toBeUndefined();
    expect(s.right).toBeUndefined();
  });

  it('#3 unrecorded size with no canvas value still has a non-blank cell (fix16: em dash, fold title carries 未发送)', () => {
    const size = formatHistorySize({
      width: { key: 'width', value: undefined, source: 'schema-unrecorded' },
      height: { key: 'height', value: undefined, source: 'schema-unrecorded' },
      size: { key: 'size', value: undefined, source: 'schema-unrecorded' },
    } as any);
    expect(size.text).toBe('');
    expect(historyParameterSourceLabel(size.source)).toBe('未发送（Schema 未记录）');
    const modal = read('../components/HistoryModal.tsx');
    // fix16 #4: UnrecordedFold shows 「—」 instead of repeating the fold title as the cell.
    expect(modal).toContain("return '—'");
    expect(modal).toContain('history-unrecorded-group');
  });

  it('#1 preview placeholder portals above bottom chrome when occluded', () => {
    const src = read('../components/PreviewPlaceholder.tsx');
    expect(src).toContain('node-preview-placeholder-float');
    expect(src).toContain('createPortal');
    expect(src).toContain('data-canvas-chrome="bottom"');
    expect(read('../components/NodeItem.tsx')).toContain('PreviewPlaceholder');
  });
});
