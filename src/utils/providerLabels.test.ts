import { describe, expect, it } from 'vitest';
import { checkpointNodeTitle, PROVIDER_TITLE_LABEL } from './providerLabels';

describe('checkpointNodeTitle', () => {
  it('uses friendly labels — never raw GROK_COMPAT / OPENAI_COMPAT', () => {
    expect(checkpointNodeTitle('grok_compat')).toBe(`加载底模 (${PROVIDER_TITLE_LABEL.grok_compat})`);
    expect(checkpointNodeTitle('openai_compat')).toBe(`加载底模 (${PROVIDER_TITLE_LABEL.openai_compat})`);
    expect(checkpointNodeTitle('gemini')).toBe(`加载底模 (${PROVIDER_TITLE_LABEL.gemini})`);
    expect(checkpointNodeTitle('grok_compat')).not.toMatch(/GROK_COMPAT/);
    expect(checkpointNodeTitle('openai_compat')).not.toMatch(/OPENAI_COMPAT/);
  });

  it('tracks provider switch away from grok', () => {
    const stuck = checkpointNodeTitle('grok_compat');
    const after = checkpointNodeTitle('openai_compat');
    expect(stuck).toContain('Grok');
    expect(after).toContain('OpenAI');
    expect(after).not.toContain('Grok');
  });

  it('falls back to checkpoint short name when provider empty', () => {
    expect(checkpointNodeTitle('', 'foo/bar/baz')).toBe('加载底模 (baz)');
    expect(checkpointNodeTitle(undefined, undefined)).toBe('加载底模');
  });
});
