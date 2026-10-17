import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { schemaUnrecordedKeys } from '../components/HistoryModal';
import { dockAvoidingStyle } from '../components/ExecutionLog';
const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
describe('fix11', () => {
  it('#7 groups only schema-unrecorded keys; unsupported keys excluded', () => {
    const r: any = { steps: { source: 'schema-unrecorded' }, cfg: { source: 'sent', value: 7 }, sampler: { source: 'schema-unrecorded' }, scheduler: { source: 'unsupported' }, negativePrompt: { source: 'sent' }, width: { source: 'sent', value: 1024 }, height: { source: 'sent', value: 1024 } };
    const k = schemaUnrecordedKeys(r, new Set(['scheduler']));
    expect(k.has('steps')).toBe(true); expect(k.has('sampler')).toBe(true); expect(k.has('cfg')).toBe(false); expect(k.has('scheduler')).toBe(false);
  });
  it('#2 exec-log needs ≥320px left of dock, else parks under top chrome (not above dock)', () => {
    const vp = { width: 900, height: 800 };
    const narrow = dockAvoidingStyle({ left: 250, top: 740, bottom: 776 }, vp, 96) as any;
    expect(narrow.right).toBeUndefined();
    expect(narrow.bottom).toBeUndefined();
    expect(narrow.top).toBe(124); // 96 + EXEC_TOP_PARK_GAP 28
    expect(narrow.left).toBe(12);
    expect((dockAvoidingStyle({ left: 500, top: 740, bottom: 776 }, vp) as any).maxWidth).toBe(380);
  });
  it('#1/#4/#5 source shape', () => {
    expect(read('../components/TopBar.tsx')).toContain('flex-nowrap');
    expect(read('../index.css')).toMatch(/max-width: 1180px[^}]*data-compact/);
    expect(read('../constants/nodes.ts')).toContain("'时间偏移 (shift)'");
    expect(read('../constants/nodes.ts')).not.toContain("label: 'resolution'");
    expect(read('../components/ParameterInspector.tsx')).toContain('视频时长（秒）');
  });
});
