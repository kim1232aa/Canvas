import { describe, expect, it } from 'vitest';
import { schemaSendStatus, isSchemaUnprobed } from './schemaSendStatus';
describe('unprobed official Schema → 「会发送」 once declared+filled (no 发送情况未知)', () => {
  it('declared + filled + schemaUnprobed → will_send', () => {
    const cp = JSON.stringify({ _canvas: { schemaProperties: ['steps', 'seed'], schemaUnprobed: true } });
    expect(isSchemaUnprobed(cp)).toBe(true);
    expect(schemaSendStatus('venice', 'steps', 8, cp)).toBe('will_send');
    expect(schemaSendStatus('together', 'steps', 8, null, ['steps'], cp)).toBe('will_send');
  });
  it('no schema loaded yet → pending (= Schema 未读取)', () => {
    expect(schemaSendStatus('venice', 'steps', 8, JSON.stringify({ _canvas: {} }))).toBe('pending');
  });
});
