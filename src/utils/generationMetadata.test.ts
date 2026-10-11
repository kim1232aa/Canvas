import {describe, it, expect} from 'vitest';
import {sanitizeGenerationMetadata} from './generationMetadata';
describe('generation provenance', () => {
  it('preserves URL-like free text and invalid URL strings without changing wire inputs', () => {
    const input = {prompt: 'https:// is the literal caption on a sign', text: 'https://example.com', custom_parameters: {prompt: 'https://EXAMPLE.com/caption'}, image_url: 'https://host.test/image?token=private&version=2', caption: 'https:// is text'};
    expect(sanitizeGenerationMetadata(input)).toEqual({...input, image_url: 'https://host.test/image?version=2'});
    expect(input.image_url).toContain('token=private');
    expect(sanitizeGenerationMetadata({headers: {Authorization: 'private', 'x-secret': 'private'}, url: 'https://host.test/?key=private&auth=private&version=2'})).toEqual({headers: {}, url: 'https://host.test/?version=2'});
  });
  it('retains exact supported parameters and LoRA weights while removing nested secrets', () => {
    const input = {seed: 0, cfg: 0, loras: [{path: 'https://host.test/lora?token=private&version=2', scale: 0.75}], nodes: [{values: {hfToken: 'private', apiKey: 'private', model: 'chosen/model'}}]};
    expect(sanitizeGenerationMetadata(input)).toEqual({seed: 0, cfg: 0, loras: [{path: 'https://host.test/lora?version=2', scale: 0.75}], nodes: [{values: {model: 'chosen/model'}}]});
    expect(input.nodes[0].values.hfToken).toBe('private');
  });
});
