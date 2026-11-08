import { describe, expect, it } from 'vitest';
import { schemaSendStatus } from './schemaSendStatus';
import { isDeclaredSchemaFieldOmitted } from './schemaSendHint';

const withSchema = (props: string[]) => JSON.stringify({ _canvas: { schemaProperties: props } });

describe('schemaSendStatus (symmetric 会发送 / 不会发送 / 待确认)', () => {
  it('declared + filled → will_send (incl. alias cfg→guidance_scale, steps→num_inference_steps)', () => {
    const cp = withSchema(['prompt', 'guidance_scale', 'num_inference_steps', 'seed', 'image_size']);
    expect(schemaSendStatus('krea', 'cfg', 3.5, cp)).toBe('will_send');
    expect(schemaSendStatus('krea', 'steps', 28, cp)).toBe('will_send');
    expect(schemaSendStatus('aimlapi', 'width', 1024, cp)).toBe('will_send');
    expect(schemaSendStatus('krea', 'seed', 0, cp)).toBe('will_send');
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
  it('Novita img2video: num_frames/fps declared as frames_num/frames_per_second → will_send; undeclared → null', () => {
    const cp = withSchema(['model_name', 'image_file', 'frames_num', 'frames_per_second', 'seed', 'steps']);
    expect(schemaSendStatus('novita', 'num_frames', 25, cp)).toBe('will_send');
    expect(schemaSendStatus('novita', 'fps', 6, cp)).toBe('will_send');
    expect(schemaSendStatus('novita', 'num_frames', 25, withSchema(['prompt', 'seed']))).toBeNull();
  });
  it('Krea: filled loras with styles in Schema → will_send (LoRA 走 styles)', () => {
    const cp = withSchema(['prompt', 'steps', 'guidance_scale', 'seed', 'styles']);
    expect(schemaSendStatus('krea', 'loras', [{ id: '79tzf61yz', strength: 0.8 }], cp)).toBe('will_send');
    expect(schemaSendStatus('krea', 'styles', [{ id: '79tzf61yz', strength: 0.8 }], cp)).toBe('will_send');
  });
});

describe('isDeclaredSchemaFieldOmitted (preset/Schema seed, no badge gate)', () => {
  it('declared props without sampler → omitted true (ModelScope / non-SCHEMA_SCOPED seed path)', () => {
    const cp = withSchema(['prompt', 'seed', 'steps', 'guidance', 'loras']);
    expect(isDeclaredSchemaFieldOmitted('sampler_name', cp)).toBe(true);
    expect(isDeclaredSchemaFieldOmitted('scheduler', cp)).toBe(true);
    expect(isDeclaredSchemaFieldOmitted('denoise', cp)).toBe(true);
    expect(isDeclaredSchemaFieldOmitted('steps', cp)).toBe(false);
    expect(isDeclaredSchemaFieldOmitted('seed', cp)).toBe(false);
  });
  it('no declared props → false (never fake omit)', () => {
    expect(isDeclaredSchemaFieldOmitted('sampler_name', '{}')).toBe(false);
    expect(isDeclaredSchemaFieldOmitted('sampler_name', undefined)).toBe(false);
  });
  it('DeepInfra-like omit seed + Mage-like omit width (non-SCHEMA_SCOPED)', () => {
    const di = withSchema(['prompt', 'width', 'height', 'size', 'image_size']);
    expect(isDeclaredSchemaFieldOmitted('seed', di)).toBe(true);
    expect(isDeclaredSchemaFieldOmitted('steps', di)).toBe(true);
    expect(isDeclaredSchemaFieldOmitted('width', di)).toBe(false);
    const mage = withSchema(['prompt', 'seed', 'aspect_ratio', 'resolution']);
    expect(isDeclaredSchemaFieldOmitted('width', mage)).toBe(true);
    expect(isDeclaredSchemaFieldOmitted('height', mage)).toBe(true);
    expect(isDeclaredSchemaFieldOmitted('seed', mage)).toBe(false);
  });
  it('ModelsLab/Civitai/Novita-like seeds: supported sampler fields are NOT omitted', () => {
    // ModelsLab: scheduler declared, sampler not → only sampler omitted.
    const ml = withSchema(['prompt', 'seed', 'steps', 'guidance', 'scheduler', 'loras']);
    expect(isDeclaredSchemaFieldOmitted('scheduler', ml)).toBe(false);
    expect(isDeclaredSchemaFieldOmitted('sampler_name', ml)).toBe(true);
    // Civitai krea2: both sampler + scheduler declared.
    const cv = withSchema(['prompt', 'seed', 'steps', 'sampler', 'sampler_name', 'scheduler']);
    expect(isDeclaredSchemaFieldOmitted('sampler_name', cv)).toBe(false);
    expect(isDeclaredSchemaFieldOmitted('scheduler', cv)).toBe(false);
    expect(isDeclaredSchemaFieldOmitted('denoise', cv)).toBe(true);
    // Novita: sampler_name declared; scheduler absent → omit.
    const nv = withSchema(['prompt', 'seed', 'steps', 'guidance', 'sampler', 'sampler_name']);
    expect(isDeclaredSchemaFieldOmitted('sampler_name', nv)).toBe(false);
    expect(isDeclaredSchemaFieldOmitted('scheduler', nv)).toBe(true);
  });
});
