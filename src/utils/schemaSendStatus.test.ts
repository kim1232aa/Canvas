import { describe, expect, it } from 'vitest';
import { schemaSendStatus } from './schemaSendStatus';

const withSchema = (props: string[]) => JSON.stringify({ _canvas: { schemaProperties: props } });

describe('schemaSendStatus (symmetric 会发送 / 不会发送 / 待确认)', () => {
  it('declared + filled → will_send (incl. alias cfg→guidance_scale, steps→num_inference_steps)', () => {
    const cp = withSchema(['prompt', 'guidance_scale', 'num_inference_steps', 'seed', 'image_size']);
    expect(schemaSendStatus('krea', 'cfg', 3.5, cp)).toBe('will_send');
    expect(schemaSendStatus('krea', 'steps', 28, cp)).toBe('will_send');
    expect(schemaSendStatus('aimlapi', 'width', 1024, cp)).toBe('will_send');
    expect(schemaSendStatus('krea', 'seed', 0, cp)).toBe('will_send');
  });
  it('not declared → not_sent (same as isSchemaOmitCandidate)', () => {
    const cp = withSchema(['prompt', 'seed']);
    expect(schemaSendStatus('aimlapi', 'sampler', 'euler', cp)).toBe('not_sent');
    expect(schemaSendStatus('aimlapi', 'scheduler', 'karras', cp)).toBe('not_sent');
  });
  it('schema not loaded → pending when filled, never will_send', () => {
    expect(schemaSendStatus('krea', 'steps', 28, '{}')).toBe('pending');
    expect(schemaSendStatus('krea', 'steps', '', '{}')).toBeNull();
  });
  it('declared but empty → no badge', () => {
    expect(schemaSendStatus('krea', 'seed', '', withSchema(['seed']))).toBeNull();
  });
  it('schema props from Checkpoint node (4th arg) override KSampler own custom_parameters', () => {
    expect(schemaSendStatus('aimlapi', 'sampler', 'euler', '{}', new Set(['sampler']))).toBe('will_send');
  });
  it('non schema-driven provider → null; schemaFieldsOnly=false → null', () => {
    expect(schemaSendStatus('fal', 'steps', 28, withSchema(['steps']))).toBeNull();
    expect(schemaSendStatus('krea', 'steps', 28, JSON.stringify({ _canvas: { schemaFieldsOnly: false, schemaProperties: ['steps'] } }))).toBeNull();
  });
  it('Krea: filled loras with styles in Schema → will_send (LoRA 走 styles)', () => {
    const cp = withSchema(['prompt', 'steps', 'guidance_scale', 'seed', 'styles']);
    expect(schemaSendStatus('krea', 'loras', [{ id: '79tzf61yz', strength: 0.8 }], cp)).toBe('will_send');
    expect(schemaSendStatus('krea', 'styles', [{ id: '79tzf61yz', strength: 0.8 }], cp)).toBe('will_send');
  });
});

describe('seed / negative_prompt badges', () => {
  it('same rules', () => {
    expect(schemaSendStatus('krea', 'negative_prompt', 'blurry', JSON.stringify({ _canvas: { schemaProperties: ['negative_prompt'] } }))).toBe('will_send');
    expect(schemaSendStatus('krea', 'negative_prompt', 'blurry', JSON.stringify({ _canvas: { schemaProperties: ['prompt'] } }))).toBe('not_sent');
    expect(schemaSendStatus('krea', 'negative_prompt', 'blurry', '{}')).toBe('pending');
    expect(schemaSendStatus('krea', 'seed', 42, JSON.stringify({ _canvas: { schemaProperties: ['prompt'] } }))).toBe('not_sent');
    expect(schemaSendStatus('krea', 'seed', 42, '{}')).toBe('pending');
  });
});
