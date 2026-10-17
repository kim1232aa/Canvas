import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

describe('fix15.1 history card: 实际发送 extras never sit under 未发送 folds', () => {
  const src = readFileSync(join(__dirname, '../components/HistoryModal.tsx'), 'utf8');
  it('history-other-sent renders before UnrecordedFold / UnsupportedFold', () => {
    const other = src.indexOf('data-testid="history-other-sent"');
    const unrec = src.indexOf('<UnrecordedFold keys={unrecorded}');
    const unsup = src.indexOf('<UnsupportedFold rows={unsupportedRows}');
    expect(other).toBeGreaterThan(0);
    expect(other).toBeLessThan(unrec);
    expect(other).toBeLessThan(unsup);
  });
});
