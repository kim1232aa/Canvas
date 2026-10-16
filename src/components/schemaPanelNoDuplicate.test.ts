// Guard: providers with their own aspect_ratio/resolution widgets (huggingface / grok_compat / nanogpt) must not
// also get those fields from the generic Schema panel (one control per field; value+badge from one source).
import { describe, expect, it } from 'vitest';
import { PROVIDER_SCHEMA } from '../schemas/providerSchema';
import { schemaChoiceFields } from './SchemaChoiceControls';

describe('Schema panel does not duplicate own-widget aspect_ratio/resolution', () => {
  for (const m of PROVIDER_SCHEMA.filter((x) => ['huggingface', 'grok_compat', 'nanogpt'].includes(x.provider))) {
    it(`${m.provider}/${m.id}`, () => {
      const keys = schemaChoiceFields({ type: 'object', properties: m.fields }).map((f) => f.key);
      expect(keys).not.toContain('aspect_ratio');
      expect(keys).not.toContain('resolution');
    });
  }
});
