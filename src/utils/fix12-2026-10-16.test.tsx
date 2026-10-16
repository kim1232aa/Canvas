import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  schemaUnrecordedKeys,
  unrecordedFoldRows,
  unrecordedFoldSummary,
} from '../components/HistoryModal';
import { dockAvoidingStyle, EXEC_TOP_PARK_GAP, isExecTopParked } from '../components/ExecutionLog';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('fix12', () => {
  it('#1 unrecorded fold count equals listed label length (q1cbe-shaped: 6 keys)', () => {
    const resolved: any = {
      steps: { source: 'schema-unrecorded' },
      cfg: { source: 'schema-unrecorded' },
      sampler: { source: 'schema-unrecorded' },
      scheduler: { source: 'schema-unrecorded' },
      size: { source: 'schema-unrecorded' },
      width: { source: 'schema-unrecorded' },
      height: { source: 'schema-unrecorded' },
      negativePrompt: { source: 'schema-unrecorded' },
    };
    const keys = schemaUnrecordedKeys(resolved, new Set());
    const rows = unrecordedFoldRows(keys);
    expect(rows.length).toBe(6);
    expect(rows.map(([, l]) => l)).toEqual(['步数', 'CFG', '采样器', '调度器', '尺寸', '负向']);
    expect(unrecordedFoldSummary(rows.length)).toBe('未发送（Schema 未记录）· 共 6 项');
    // Collapsed summary must NOT jam the name list (that made 「6」 look like 「0」)
    const modal = read('../components/HistoryModal.tsx');
    expect(modal).toContain('history-unrecorded-count');
    expect(modal).toContain('共 {rows.length} 项');
    expect(modal).not.toMatch(/未发送（Schema 未记录）\{rows\.length\} 项：\{rows\.map/);
  });

  it('#2 narrow (~900) parks under top with extra drop + under-top park marker', () => {
    const vp = { width: 900, height: 1000 };
    const s = dockAvoidingStyle({ left: 200, top: 920, bottom: 960 }, vp, 164) as any;
    expect(EXEC_TOP_PARK_GAP).toBe(28);
    expect(s.top).toBe(164 + EXEC_TOP_PARK_GAP);
    expect(s.left).toBe(12);
    expect(s.bottom).toBeUndefined();
    expect(isExecTopParked(s)).toBe(true);
    // Still must not park above dock
    expect(s.bottom).toBeUndefined();
    const wide = dockAvoidingStyle({ left: 500, top: 920, bottom: 960 }, vp, 164) as any;
    expect(isExecTopParked(wide)).toBe(false);
    expect(wide.bottom).toBeDefined();
    const src = read('../components/ExecutionLog.tsx');
    expect(src).toContain("data-park={topParked ? 'under-top'");
    expect(src).toContain('border-dashed');
    expect(src).toContain('EXEC_TOP_PARK_GAP');
  });

  it('#2 keeps full summary label requirement (生成 N · 目录/Schema M room)', () => {
    const src = read('../components/ExecutionLog.tsx');
    expect(src).toMatch(/EXEC_BTN_MIN\s*=\s*320/);
  });
});
