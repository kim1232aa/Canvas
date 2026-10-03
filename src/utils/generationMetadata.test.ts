import {describe, it, expect} from 'vitest';
import {sanitizeGenerationMetadata} from './generationMetadata';
describe('generation provenance', () => {
  it('retains exact supported parameters and LoRA weights while removing nested secrets', () => {
    const input = {seed: 0, cfg: 0, loras: [{path: 'https://host.test/lora?token=private&version=2', scale: 0.75}], nodes: [{values: {hfToken: 'private', apiKey: 'private', model: 'chosen/model'}}]};
    expect(sanitizeGenerationMetadata(input)).toEqual({seed: 0, cfg: 0, loras: [{path: 'https://host.test/lora?version=2', scale: 0.75}], nodes: [{values: {model: 'chosen/model'}}]});
    expect(input.nodes[0].values.hfToken).toBe('private');
  });
});
