import { describe, expect, it } from 'vitest';
import { schemaConstraintViolation } from './schemaProviders';
describe('generic OpenAPI deprecated flag', () => {
  it('deprecated:true → local refusal quoting official description verbatim', () => {
    const r = schemaConstraintViolation('inpaint', { x: 1 }, { deprecated: true, description: 'This feature is deprecated and was disabled on May 19th, 2025.' });
    expect(r).toContain('deprecated'); expect(r).toContain('This feature is deprecated and was disabled on May 19th, 2025.');
  });
  it('free-text "is ignored" in a description is NOT treated as a signal (no keyword matching)', () => {
    expect(schemaConstraintViolation('steps', 8, { type: 'integer', maximum: 30, description: 'This model does not support steps - this field is ignored.' })).toBeNull();
  });
});
