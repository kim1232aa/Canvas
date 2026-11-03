import { FalSchemaMissingError, type FalSchemaFetchFailure } from './falImageContract';

const provided = (value: unknown) => value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0);

export class FalVideoContractError extends Error {
  readonly status = 400;
}

const CONTROLS = /^(?:model|provider|endpoint|inference_provider|custom_parameters|workflowSnapshot|isVideo|targetProvider|inputSchemaProperties)$|api.?key|authorization|credential|password|secret|token/i;

/** Canvas field → candidate upstream wires (first match in live props wins). */
const CANVAS_WIRES: Array<[string, string[]]> = [
  ['prompt', ['prompt']],
  ['duration', ['duration']],
  ['fps', ['frames_per_second', 'fps']],
  ['frames_per_second', ['frames_per_second', 'fps']],
  ['num_frames', ['num_frames']],
  ['negative_prompt', ['negative_prompt']],
  ['steps', ['num_inference_steps', 'steps']],
  ['num_inference_steps', ['num_inference_steps', 'steps']],
  ['cfg', ['guidance_scale', 'guide_scale', 'cfg_scale', 'cfg']],
  ['guidance_scale', ['guidance_scale', 'guide_scale', 'cfg_scale', 'cfg']],
  ['seed', ['seed']],
  ['loras', ['loras']],
  ['aspect_ratio', ['aspect_ratio']],
  ['resolution', ['resolution']],
  ['sampler_name', ['sampler_name']],
  ['scheduler', ['scheduler']],
  ['denoise', ['denoise', 'strength']],
  ['generate_audio', ['generate_audio']],
  ['end_image_url', ['end_image_url']],
  ['multi_prompt', ['multi_prompt']],
  ['video_url', ['video_url']],
];

/**
 * Build Fal video outbound body from live OpenAPI Input properties.
 * Static FAL_MODELS is UI clue only — never alone authorizes outbound.
 */
export function buildFalVideoRequest(
  endpoint: string,
  body: Record<string, unknown>,
  liveInputProperties?: Record<string, unknown>,
  schemaFetchFailure?: FalSchemaFetchFailure,
) {
  if (!liveInputProperties || typeof liveInputProperties !== 'object' || Array.isArray(liveInputProperties)) {
    throw new FalSchemaMissingError(endpoint, schemaFetchFailure);
  }
  const props = liveInputProperties;
  const fail = (message: string): never => { throw new FalVideoContractError(message); };
  if ('custom_parameters' in body && (!body.custom_parameters || typeof body.custom_parameters !== 'object' || Array.isArray(body.custom_parameters))) {
    fail('custom_parameters 必须为有效 JSON 对象 (object)');
  }
  if (provided(body.cfg) && provided(body.guidance_scale) && Number(body.cfg) !== Number(body.guidance_scale)) {
    fail('cfg 与 guidance_scale 不一致；请只提供一个来源或相同值');
  }

  const hasDuration = 'duration' in props;
  const hasNumFrames = 'num_frames' in props;

  const cfgWire = (['guidance_scale', 'guide_scale', 'cfg_scale', 'cfg'] as const).find((w) => w in props) ?? 'guidance_scale';
  const imageWire = falVideoImageFieldFromLive(props);

  const place = (mapped: Record<string, unknown>, field: string, value: unknown) => {
    if (CONTROLS.test(field) || field === 'image_url' || field === 'start_image_url') return;
    const pair = CANVAS_WIRES.find(([canvas]) => canvas === field);
    if (pair) {
      const wire = pair[1].find((w) => w in props);
      if (!wire) {
        // Not declared in the live OpenAPI: sent unchanged under the canvas name; upstream decides.
        if (provided(value)) mapped[field] = value;
        return;
      }
      if (Object.hasOwn(mapped, wire) && JSON.stringify(mapped[wire]) !== JSON.stringify(value)) fail(`${field} 与 ${wire} 不一致`);
      mapped[wire] = field === 'seed' && provided(value) ? Number(value) : value;
      return;
    }
    // Exact upstream key: only when live declares it.
    if (field in props) {
      if (Object.hasOwn(mapped, field) && JSON.stringify(mapped[field]) !== JSON.stringify(value)) fail(`${field} 不一致`);
      mapped[field] = field === 'seed' && provided(value) ? Number(value) : value;
      return;
    }
    if (provided(value)) mapped[field] = value; // undeclared: sent unchanged
  };

  const mapInputs = (source: Record<string, unknown>) => {
    const mapped: Record<string, unknown> = {};
    if (provided(source.cfg) && provided(source.guidance_scale) && Number(source.cfg) !== Number(source.guidance_scale)) {
      fail('cfg 与 guidance_scale 不一致');
    }
    for (const [field, value] of Object.entries(source)) place(mapped, field, value);
    return mapped;
  };

  const payload: Record<string, unknown> = mapInputs(body);
  const fieldStatus: Record<string, string> = {};
  for (const [field] of CANVAS_WIRES) {
    if (provided(body[field]) || provided((body.custom_parameters as any)?.[field])) {
      fieldStatus[field] = field in props || CANVAS_WIRES.find(([c]) => c === field)?.[1].some((w) => w in props) ? 'supported' : 'unsupported';
    }
  }

  if (provided(body.resolution) && 'resolution' in props) {
    const resSchema = props.resolution as { enum?: unknown[] } | undefined;
    void resSchema;
  }
  if (provided(body.image_url) && provided(body.start_image_url) && body.image_url !== body.start_image_url) fail('image_url 与 start_image_url 不一致');
  const siteReference = provided(body.start_image_url) ? body.start_image_url : body.image_url;
  if (provided(siteReference)) {
    payload[imageWire ?? 'image_url'] = siteReference;
  }

  const beforeCustom = { ...payload };
  const custom = (body.custom_parameters ?? {}) as Record<string, unknown>;
  if (['model', 'provider', 'endpoint', 'inference_provider'].some((key) => Object.hasOwn(custom, key))) fail('custom_parameters 不可覆盖模型或路由');
  if (provided(custom.image_url) && provided(custom.start_image_url) && custom.image_url !== custom.start_image_url) fail('image_url 与 start_image_url 不一致');
  for (const key of Object.keys(custom)) if (CONTROLS.test(key)) fail(`custom_parameters 不可覆盖模型/路由/凭据: ${key}`);

  const mappedCustom = mapInputs(custom);
  const hasCustomReference = Object.hasOwn(custom, 'start_image_url') || Object.hasOwn(custom, 'image_url');
  const customReference = Object.hasOwn(custom, 'start_image_url') ? custom.start_image_url : custom.image_url;
  if (hasCustomReference) {
    delete mappedCustom.image_url;
    delete mappedCustom.start_image_url;
    mappedCustom[imageWire ?? 'image_url'] = customReference;
  }

  const effectiveCfg = Object.hasOwn(custom, 'cfg') ? custom.cfg : body.cfg;
  const effectiveGuidance = Object.hasOwn(custom, 'guidance_scale') ? custom.guidance_scale : body.guidance_scale;
  if (provided(effectiveCfg) && provided(effectiveGuidance) && Number(effectiveCfg) !== Number(effectiveGuidance)) {
    fail('cfg 与 guidance_scale 不一致；请只提供一个来源或相同值');
  }
  if (Object.hasOwn(custom, 'cfg') || Object.hasOwn(custom, 'guidance_scale')) {
    delete mappedCustom.cfg;
    delete mappedCustom.guidance_scale;
    mappedCustom[cfgWire] = Object.hasOwn(custom, 'cfg') ? custom.cfg : custom.guidance_scale;
  }

  const overrides = Object.fromEntries(
    Object.entries(mappedCustom)
      .filter(([key, value]) => key in payload && payload[key] !== value)
      .map(([key, value]) => [key, { before: payload[key], after: value }]),
  );
  const actual = { ...payload, ...mappedCustom };

  const reference = imageWire ? actual[imageWire] : undefined;
  if (endpoint === 'fal-ai/wan/v2.7/image-to-video') {
    if (!provided(reference) && !provided(actual.video_url)) fail('image_url 或 video_url 为必填项');
  } else if (imageWire && (endpoint.endsWith('/image-to-video') || endpoint === 'fal-ai/wan-i2v') && !provided(reference)) {
    fail(`${imageWire}（或 image_url）为必填项`);
  }
  if (provided(reference) && imageWire) {
    delete actual.image_url;
    delete actual.start_image_url;
    actual[imageWire] = reference;
  }
  if (provided(actual.duration) && isKlingV3(endpoint)) actual.duration = klingV3Duration(actual.duration);
  return { payload: actual, beforeCustom, customParameters: { ...custom }, overrides, fieldStatus, schemaFields: Object.keys(props) };
}

export const isKlingV3 = (endpoint: string): boolean => /^fal-ai\/kling-video\/v3\//.test(endpoint);

export function falVideoImageFieldFromLive(props: Record<string, unknown>): 'start_image_url' | 'image_url' | null {
  if ('start_image_url' in props) return 'start_image_url';
  if ('image_url' in props) return 'image_url';
  return null;
}

/** Endpoint-name fallback only for legacy callers; prefer falVideoImageFieldFromLive. */
export const falVideoImageField = (endpoint: string): 'start_image_url' | 'image_url' =>
  isKlingV3(endpoint) && endpoint.endsWith('/image-to-video') ? 'start_image_url' : 'image_url';

export function klingV3Duration(value: unknown): string {
  const seconds = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isInteger(seconds)) {
    throw new Error('Kling V3 duration 须为整数秒');
  }
  return String(seconds);
}
