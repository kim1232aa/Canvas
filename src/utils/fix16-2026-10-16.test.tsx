import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { seedStatement, historySeedRowText, historySeedUpstreamMissingNote, historySeedStatement } from './historyParameters';

describe('fix16 history card polish', () => {
  const histSrc = readFileSync(join(__dirname, '../components/HistoryModal.tsx'), 'utf8');
  const appSrc = readFileSync(join(__dirname, '../App.tsx'), 'utf8');

  it('#1 history-other-sent has own title and sits before 未发送 folds with spacing', () => {
    const title = histSrc.indexOf('data-testid="history-other-sent-title"');
    const other = histSrc.indexOf('data-testid="history-other-sent"');
    const unrec = histSrc.indexOf('<UnrecordedFold keys={unrecorded}');
    const unsup = histSrc.indexOf('<UnsupportedFold rows={unsupportedRows}');
    expect(title).toBeGreaterThan(0);
    expect(other).toBeGreaterThan(0);
    expect(other).toBeLessThan(unrec);
    expect(other).toBeLessThan(unsup);
    // className carries mb-2 before the testid attribute
    expect(histSrc).toMatch(/mb-2[^>]*data-testid="history-other-sent"/);
    expect(histSrc).toMatch(/data-testid="history-other-sent-title"[^>]*>实际发送</);
  });

  it('#2 seed: 「实际发送」 and 「上游未返回种子」 are two places, not one vague paren', () => {
    expect(seedStatement(42, undefined)).toBe('种子 42（实际发送）。上游未返回种子');
    expect(seedStatement(42, null)).toBe('种子 42（实际发送）。上游未返回种子');
    const item = {
      status: 'failed',
      requestMetadata: {
        actualRequest: { endpoint: 'https://e.example/v1', parameters: { seed: 42, prompt: 'p' } },
      },
    } as any;
    expect(historySeedStatement(item)).toBe('种子 42（实际发送）。上游未返回种子');
    expect(historySeedRowText(item)).toBe('种子 42');
    expect(historySeedUpstreamMissingNote(item)).toBe(true);
    expect(histSrc).toContain('data-testid="history-seed-upstream-note"');
    expect(histSrc).toContain('上游未返回种子');
    expect(seedStatement(7, undefined)).not.toContain('实际发送；上游未返回');
  });

  it('#3 prompt and LoRA name: no truncate/ellipsis; wrap allowed', () => {
    const idx = histSrc.indexOf('data-testid="history-card-title"');
    expect(idx).toBeGreaterThan(0);
    const titleBlock = histSrc.slice(Math.max(0, idx - 220), idx + 40);
    expect(titleBlock).not.toMatch(/\btruncate\b/);
    expect(titleBlock).toMatch(/overflow-wrap:anywhere/);
    expect(histSrc).toContain('data-testid="history-sent-lora-name"');
    expect(histSrc).toMatch(/history-sent-lora-name[\s\S]{0,120}\{l\.name\}/);
    expect(histSrc).not.toContain('loraDisplayName(');
  });

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
