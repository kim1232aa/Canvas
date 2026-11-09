import { describe, expect, it } from 'vitest';
import { schemaSendStatus } from './schemaSendStatus';
import { isDeclaredSchemaFieldOmitted } from './schemaSendHint';

const withSchema = (props: string[]) => JSON.stringify({ _canvas: { schemaProperties: props } });
const closedCtx = (props: string[]) => ({
  schemaEntry: {
    status: 'ready' as const,
    propertiesObj: Object.fromEntries(props.map((k) => [k, {}])),
    inputSchema: { type: 'object', properties: Object.fromEntries(props.map((k) => [k, {}])), additionalProperties: false },
  },
});

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
  it('explicit model context resolves fal and static providers without changing legacy badges', () => {
    expect(schemaSendStatus('fal', 'steps', 28, withSchema(['steps']), undefined, undefined, { model: 'fal-ai/flux-lora' })).toBe('will_send');
    expect(schemaSendStatus('nanogpt', 'seed', 0, '{}', undefined, undefined, { model: 'flux-schnell' })).toBe('not_sent');
    expect(schemaSendStatus('nanogpt', 'seed', 0, '{}', undefined, undefined, { model: 'flux-dev' })).toBeNull(); // unverified -> unknown -> null
    expect(schemaSendStatus('runware', 'cfg', 3, '{}', undefined, undefined, { model: 'alibaba:qwen-image@3.0' })).toBe('will_send');
    expect(schemaSendStatus('nanogpt', 'seed', 0, '{"seed":0}', undefined, undefined, { model: 'flux-schnell' })).toBeNull();
    expect(schemaSendStatus('fal', 'steps', 28, '{}', undefined, undefined, { model: 'unknown' })).toBeNull();
  });
  it('existing schema-provider badge results stay unchanged for undeclared and OpenWorks extras', () => {
    expect(schemaSendStatus('krea', 'sampler', 'euler', withSchema(['prompt']))).toBeNull();
    expect(schemaSendStatus('openworks', 'steps', 28, withSchema(['prompt']))).toBe('will_send');
  });
  it('schema loading and failure beat stale declarations, including explicit static models', () => {
    for (const [flag, expected] of [['schemaLoading', 'loading'], ['schemaUnavailable', 'schema_unavailable']] as const) {
      const cp = JSON.stringify({ _canvas: { [flag]: true, schemaProperties: ['seed'] } });
      expect(schemaSendStatus('krea', 'seed', 0, cp)).toBe(expected);
      expect(schemaSendStatus('nanogpt', 'seed', 0, cp, undefined, undefined, { model: 'flux-schnell' })).toBe(expected);
    }
  });
  it('Krea: filled loras with styles in Schema → will_send (LoRA 走 styles)', () => {
    const cp = withSchema(['prompt', 'steps', 'guidance_scale', 'seed', 'styles']);
    expect(schemaSendStatus('krea', 'loras', [{ id: '79tzf61yz', strength: 0.8 }], cp)).toBe('will_send');
    expect(schemaSendStatus('krea', 'styles', [{ id: '79tzf61yz', strength: 0.8 }], cp)).toBe('will_send');
  });
});

describe('isDeclaredSchemaFieldOmitted (open array vs closed schema / static spec)', () => {
  it('array-only schemaProperties without closure proof stays unknown (false); closed schema or static spec omits', () => {
    const props = ['prompt', 'seed', 'steps', 'guidance', 'loras'];
    const cp = withSchema(props);
    expect(isDeclaredSchemaFieldOmitted('sampler_name', cp)).toBe(false);
    expect(isDeclaredSchemaFieldOmitted('scheduler', cp)).toBe(false);
    expect(isDeclaredSchemaFieldOmitted('denoise', cp)).toBe(false);
    expect(isDeclaredSchemaFieldOmitted('sampler_name', cp, undefined, closedCtx(props))).toBe(true);
    expect(isDeclaredSchemaFieldOmitted('scheduler', cp, undefined, closedCtx(props))).toBe(true);
    expect(isDeclaredSchemaFieldOmitted('denoise', cp, undefined, closedCtx(props))).toBe(true);
    expect(isDeclaredSchemaFieldOmitted('steps', cp, undefined, closedCtx(props))).toBe(false);
    expect(isDeclaredSchemaFieldOmitted('seed', cp, undefined, closedCtx(props))).toBe(false);
    // Static-spec ModelScope row explicitly marks sampler/scheduler/denoise unsupported
    expect(isDeclaredSchemaFieldOmitted('sampler_name', cp, undefined, { provider: 'modelscope', model: 'modelscope-hosted-image' })).toBe(true);
  });
  it('no declared props → false (never fake omit)', () => {
    expect(isDeclaredSchemaFieldOmitted('sampler_name', '{}')).toBe(false);
    expect(isDeclaredSchemaFieldOmitted('sampler_name', undefined)).toBe(false);
  });
  it('DeepInfra-like omit seed + Mage-like omit width require closed schema or static spec', () => {
    const diProps = ['prompt', 'width', 'height', 'size', 'image_size'];
    const di = withSchema(diProps);
    expect(isDeclaredSchemaFieldOmitted('seed', di)).toBe(false);
    expect(isDeclaredSchemaFieldOmitted('seed', di, undefined, closedCtx(diProps))).toBe(true);
    expect(isDeclaredSchemaFieldOmitted('steps', di, undefined, closedCtx(diProps))).toBe(true);
    expect(isDeclaredSchemaFieldOmitted('width', di, undefined, closedCtx(diProps))).toBe(false);
    const mageProps = ['prompt', 'seed', 'aspect_ratio', 'resolution'];
    const mage = withSchema(mageProps);
    expect(isDeclaredSchemaFieldOmitted('width', mage)).toBe(false);
    expect(isDeclaredSchemaFieldOmitted('width', mage, undefined, { provider: 'mage', model: 'mango-v3' })).toBe(true);
    expect(isDeclaredSchemaFieldOmitted('height', mage, undefined, { provider: 'mage', model: 'mango-v3' })).toBe(true);
    expect(isDeclaredSchemaFieldOmitted('seed', mage, undefined, { provider: 'mage', model: 'mango-v3' })).toBe(false);
  });
  it('ModelsLab/Civitai/Novita-like seeds: supported sampler fields are NOT omitted under closed schema', () => {
    const mlProps = ['prompt', 'seed', 'steps', 'guidance', 'scheduler', 'loras'];
    const ml = withSchema(mlProps);
    expect(isDeclaredSchemaFieldOmitted('scheduler', ml, undefined, closedCtx(mlProps))).toBe(false);
    expect(isDeclaredSchemaFieldOmitted('sampler_name', ml, undefined, closedCtx(mlProps))).toBe(true);
    const cvProps = ['prompt', 'seed', 'steps', 'sampler', 'sampler_name', 'scheduler'];
    const cv = withSchema(cvProps);
    expect(isDeclaredSchemaFieldOmitted('sampler_name', cv, undefined, closedCtx(cvProps))).toBe(false);
    expect(isDeclaredSchemaFieldOmitted('scheduler', cv, undefined, closedCtx(cvProps))).toBe(false);
    expect(isDeclaredSchemaFieldOmitted('denoise', cv, undefined, closedCtx(cvProps))).toBe(true);
    const nvProps = ['prompt', 'seed', 'steps', 'guidance', 'sampler', 'sampler_name'];
    const nv = withSchema(nvProps);
    expect(isDeclaredSchemaFieldOmitted('sampler_name', nv, undefined, closedCtx(nvProps))).toBe(false);
    expect(isDeclaredSchemaFieldOmitted('scheduler', nv, undefined, closedCtx(nvProps))).toBe(true);
  });
});
