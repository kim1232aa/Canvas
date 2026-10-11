import { getFieldSpec, getModelSpec, valueStatus, type FieldKey } from '../schemas/providerSchema';

const provided = (value: unknown) => value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0);

export class FalVideoContractError extends Error {
  readonly status = 400;
}

export function buildFalVideoRequest(endpoint: string, body: Record<string, unknown>) {
  const fail = (message: string): never => { throw new FalVideoContractError(message); };
  if ('custom_parameters' in body && (!body.custom_parameters || typeof body.custom_parameters !== 'object' || Array.isArray(body.custom_parameters))) fail('custom_parameters 必须为有效 JSON 对象 (object)');
  if (provided(body.cfg) && provided(body.guidance_scale) && Number(body.cfg) !== Number(body.guidance_scale)) fail('cfg 与 guidance_scale 不一致；请只提供一个来源或相同值');
  const wan21 = ['fal-ai/wan-t2v', 'fal-ai/wan-i2v'].includes(endpoint);
  if (wan21 && provided(body.duration)) fail('Wan 2.1 不支持 duration；请提供 num_frames');
  if (wan21) for (const [field, min, max] of [['fps', 5, 24], ['num_frames', 81, 100]] as const) {
    if (provided(body[field]) && (!Number.isInteger(Number(body[field])) || Number(body[field]) < min || Number(body[field]) > max)) fail(`${field} 须为 ${min}–${max} 的整数`);
  }
  const payload: Record<string, unknown> = {};
  const fieldStatus: Record<string, string> = {};
  const fields: Array<[string, FieldKey | undefined, string]> = [
    ['prompt', undefined, 'prompt'], ['duration', undefined, 'duration'], ['fps', undefined, wan21 ? 'frames_per_second' : 'fps'], ['num_frames', undefined, 'num_frames'],
    ['negative_prompt', 'negative_prompt', 'negative_prompt'], ['steps', 'steps', 'num_inference_steps'], ['cfg', 'cfg', 'guidance_scale'], ['guidance_scale', 'cfg', 'guidance_scale'],
    ['seed', 'seed', 'seed'], ['loras', 'loras', 'loras'], ['aspect_ratio', 'aspect_ratio', 'aspect_ratio'], ['resolution', 'resolution', 'resolution'],
    ['sampler_name', 'sampler', 'sampler_name'], ['scheduler', 'scheduler', 'scheduler'], ['denoise', 'denoise', 'denoise'],
  ];
  const controls = /^(?:model|provider|endpoint|inference_provider|custom_parameters|workflowSnapshot|isVideo|targetProvider)$|api.?key|authorization|credential|password|secret|token/i;
  const aliases = new Map(fields.map(([field, key, wire]) => [field, (key && getFieldSpec('fal', endpoint, key)?.wire) || wire]));
  const mapInputs = (source: Record<string, unknown>) => {
    const mapped: Record<string, unknown> = {};
    if (provided(source.cfg) && provided(source.guidance_scale) && Number(source.cfg) !== Number(source.guidance_scale)) fail('cfg 与 guidance_scale 不一致');
    for (const [field, value] of Object.entries(source)) {
      if (controls.test(field)) continue;
      const wire = aliases.get(field) ?? field;
      if (Object.hasOwn(mapped, wire) && JSON.stringify(mapped[wire]) !== JSON.stringify(value)) fail(`${field} 与 ${wire} 不一致`);
      mapped[wire] = field === 'seed' && provided(value) ? Number(value) : value;
    }
    for (const [key, spec] of Object.entries(getModelSpec('fal', endpoint)?.fields ?? {})) {
      const names = [key, spec.wire ?? key, ...fields.filter(([, schemaKey]) => schemaKey === key).map(([field]) => field)];
      if (names.some(name => provided(source[name]))) fieldStatus[key] = spec.status;
      if (spec.status === 'unsupported' && names.some(name => provided(source[name]))) fail(`该服务商不支持: ${key}（Fal.ai Video ${endpoint}）`);
    }
    return mapped;
  };
  Object.assign(payload, mapInputs(body));
  if (provided(body.resolution) && valueStatus('fal', endpoint, 'resolution', String(body.resolution)) === 'unsupported') fail(`${endpoint} resolution 取值不支持`);
  if (provided(body.image_url) && provided(body.start_image_url) && body.image_url !== body.start_image_url) fail('image_url 与 start_image_url 不一致');
  const siteReference = provided(body.start_image_url) ? body.start_image_url : body.image_url;
  if (provided(siteReference)) payload[falVideoImageField(endpoint)] = siteReference;
  const beforeCustom = { ...payload };
  const custom = (body.custom_parameters ?? {}) as Record<string, unknown>;
  if (['model', 'provider', 'endpoint', 'inference_provider'].some(key => Object.hasOwn(custom, key))) fail('custom_parameters 不可覆盖模型或路由');
  if (provided(custom.image_url) && provided(custom.start_image_url) && custom.image_url !== custom.start_image_url) fail('image_url 与 start_image_url 不一致');
  for (const key of Object.keys(custom)) if (controls.test(key)) fail(`custom_parameters 不可覆盖模型/路由/凭据: ${key}`);
  const mappedCustom = mapInputs(custom);
  const hasCustomReference = Object.hasOwn(custom, 'start_image_url') || Object.hasOwn(custom, 'image_url');
  const customReference = Object.hasOwn(custom, 'start_image_url') ? custom.start_image_url : custom.image_url;
  if (hasCustomReference) {
    delete mappedCustom.image_url;
    delete mappedCustom.start_image_url;
    mappedCustom[falVideoImageField(endpoint)] = customReference;
  }
  for (const [field, key, wire] of fields) {
    const spec = key ? getFieldSpec('fal', endpoint, key) : undefined;
    if (spec?.status === 'unsupported' && [field, spec.wire ?? wire].some(name => provided(mappedCustom[name]))) fail(`该服务商不支持: ${field}（Fal.ai Video ${endpoint}）`);
  }
  const effectiveCfg = Object.hasOwn(custom, 'cfg') ? custom.cfg : body.cfg;
  const effectiveGuidance = Object.hasOwn(custom, 'guidance_scale') ? custom.guidance_scale : body.guidance_scale;
  if (provided(effectiveCfg) && provided(effectiveGuidance) && Number(effectiveCfg) !== Number(effectiveGuidance)) fail('cfg 与 guidance_scale 不一致；请只提供一个来源或相同值');
  if (Object.hasOwn(custom, 'cfg') || Object.hasOwn(custom, 'guidance_scale')) {
    const wire = getFieldSpec('fal', endpoint, 'cfg')?.wire ?? 'guidance_scale';
    delete mappedCustom.cfg;
    delete mappedCustom.guidance_scale;
    mappedCustom[wire] = Object.hasOwn(custom, 'cfg') ? custom.cfg : custom.guidance_scale;
  }
  const overrides = Object.fromEntries(Object.entries(mappedCustom).filter(([key, value]) => key in payload && payload[key] !== value).map(([key, value]) => [key, { before: payload[key], after: value }]));
  const actual = { ...payload, ...mappedCustom };
  if (wan21 && provided(actual.duration)) fail('Wan 2.1 不支持 duration；请提供 num_frames');
  if (wan21 && provided(mappedCustom.fps)) { actual.frames_per_second = mappedCustom.fps; delete actual.fps; }
  if (wan21) for (const [field, min, max] of [['frames_per_second', 5, 24], ['num_frames', 81, 100]] as const) {
    if (provided(actual[field]) && (!Number.isInteger(Number(actual[field])) || Number(actual[field]) < min || Number(actual[field]) > max)) fail(`${field} 须为 ${min}–${max} 的整数`);
  }
  const reference = actual[falVideoImageField(endpoint)];
  if ((endpoint.includes('text-to-video') || endpoint === 'fal-ai/wan-t2v') && (provided(siteReference) || provided(customReference) || provided(actual.end_image_url))) fail('这个端点不支持参考图');
  if ((isKlingV3(endpoint) && endpoint.endsWith('/image-to-video') || endpoint === 'fal-ai/wan-i2v') && !provided(reference)) fail(`${falVideoImageField(endpoint)}（或 image_url）为必填项`);
  if (endpoint === 'fal-ai/wan/v2.7/image-to-video' && !provided(reference) && !provided(actual.video_url)) fail('image_url 或 video_url 为必填项');
  if (provided(reference)) {
    delete actual.image_url;
    delete actual.start_image_url;
    actual[falVideoImageField(endpoint)] = reference;
  }
  if (isKlingV3(endpoint) && provided(actual.duration)) actual.duration = klingV3Duration(actual.duration);
  return { payload: actual, beforeCustom, customParameters: { ...custom }, overrides, fieldStatus };
}

export const isKlingV3 = (endpoint: string): boolean => /^fal-ai\/kling-video\/v3\//.test(endpoint);

export const falVideoImageField = (endpoint: string): 'start_image_url' | 'image_url' =>
  isKlingV3(endpoint) && endpoint.endsWith('/image-to-video') ? 'start_image_url' : 'image_url';

export function klingV3Duration(value: unknown): string {
  const seconds = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isInteger(seconds) || seconds < 3 || seconds > 15) {
    throw new Error('Kling V3 duration 只接受 3–15 的整数秒');
  }
  return String(seconds);
}
