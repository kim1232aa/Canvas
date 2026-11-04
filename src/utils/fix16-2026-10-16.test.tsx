import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { seedStatement, historySeedRowText, historySeedUpstreamMissingNote, historySeedStatement } from './historyParameters';

describe('fix16 history card polish', () => {
  const histSrc = readFileSync(join(__dirname, '../components/HistoryModal.tsx'), 'utf8');
  const appSrc = readFileSync(join(__dirname, '../App.tsx'), 'utf8');



  it('#4 未发送 fold rows do not repeat fold-title suffix', () => {
    const unrecStart = histSrc.indexOf('function UnrecordedFold');
    const unrecEnd = histSrc.indexOf('export type UnsupportedRow');
    const unrecFn = histSrc.slice(unrecStart, unrecEnd);
    expect(unrecFn).toContain("return '—'");
    expect(unrecFn).not.toContain('historyParameterSourceLabel(size.source)');
    expect(unrecFn).not.toContain('formatResolvedHistoryParameter(resolved[k])');
    const unsupStart = histSrc.indexOf('const UnsupportedFold');
    const unsupEnd = histSrc.indexOf('interface HistoryModalProps');
    const unsup = histSrc.slice(unsupStart, unsupEnd);
    expect(unsup).not.toContain('HISTORY_UNSUPPORTED_LABEL');
  });

  it('#5 HistoryModal open suppresses duplicate error toast', () => {
    expect(appSrc).toContain("!(isHistoryOpen && toast.type === 'error')");
    expect(appSrc).toContain('fix16 #5');
  });
});
