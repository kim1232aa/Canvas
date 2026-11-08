import { FalSchemaMissingError, type FalSchemaFetchFailure } from './falImageContract';

const provided = (value: unknown) => value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0);

export class FalVideoContractError extends Error {
  readonly status = 400;
}

const CONTROLS = /^(?:_canvas|model|provider|endpoint|inference_provider|custom_parameters|workflowSnapshot|isVideo|targetProvider|inputSchemaProperties)$|api.?key|authorization|credential|password|secret|token/i;

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
 * Check if a property specification accepts null (via anyOf with type: 'null').
 */
export const isNullableProp = (spec: unknown): boolean => {
  if (!spec || typeof spec !== 'object' || Array.isArray(spec)) return false;
  const anyOf = (spec as Record<string, unknown>).anyOf;
  return Array.isArray(anyOf) && anyOf.some((branch) => Boolean(branch && typeof branch === 'object' && (branch as Record<string, unknown>).type === 'null'));
};

/**
 * Build Fal video outbound body from live OpenAPI Input properties.
 * Static FAL_MODELS is UI clue only — never alone authorizes outbound.
 */
export function buildFalVideoRequest(
  endpoint: string,
  body: Record<string, unknown>,
  liveInputProperties?: Record<string, unknown>,
  schemaFetchFailure?: FalSchemaFetchFailure,
  liveRequired?: readonly string[],
) {
  if (!liveInputProperties || typeof liveInputProperties !== 'object' || Array.isArray(liveInputProperties)) {
    throw new FalSchemaMissingError(endpoint, schemaFetchFailure);
  }
  const rawSchema = liveInputProperties;
  const hasNestedProps =
    rawSchema.properties !== null &&
    typeof rawSchema.properties === 'object' &&
    !Array.isArray(rawSchema.properties) &&
    (rawSchema.type === 'object' || Array.isArray(rawSchema.required) || Array.isArray(rawSchema.anyOf));
  const rawProps = hasNestedProps ? (rawSchema.properties as Record<string, unknown>) : rawSchema;
  const schemaRequired = Array.isArray(liveRequired)
    ? liveRequired
    : Array.isArray(rawSchema.required)
      ? (rawSchema.required as unknown[]).filter((k): k is string => typeof k === 'string')
      : [];
  const schemaAnyOf = Array.isArray(rawSchema.anyOf)
    ? (rawSchema.anyOf as unknown[]).filter((b): b is Record<string, unknown> => Boolean(b && typeof b === 'object' && !Array.isArray(b)))
    : [];
  const props: Record<string, unknown> = Object.fromEntries(
    Object.entries(rawProps).filter(([k, v]) => !((k === 'required' || k === 'anyOf') && Array.isArray(v))),
  );
  const fail = (message: string): never => { throw new FalVideoContractError(message); };
  if ('custom_parameters' in body && (!body.custom_parameters || typeof body.custom_parameters !== 'object' || Array.isArray(body.custom_parameters))) {
    fail('custom_parameters 必须为有效 JSON 对象 (object)');
  }
  if (provided(body.cfg) && provided(body.guidance_scale) && Number(body.cfg) !== Number(body.guidance_scale)) {
    fail('cfg 与 guidance_scale 不一致；请只提供一个来源或相同值');
  }

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

  // LoRA item shape comes only from the live OpenAPI item properties (e.g. LoraWeight {path, scale}):
  // each item carries exactly the declared keys; canvas-internal keys (modelStrength/clipStrength/civitaiId/name/triggers…) are not sent.
  const loraItemProps = (props.loras as any)?.items?.properties;
  const mapLoraItems = (list: unknown): unknown => {
    if (!Array.isArray(list) || !list.length || !loraItemProps || typeof loraItemProps !== 'object') return list;
    const pathKey = ['path', 'url', 'model_name', 'name', 'id'].find((k) => Object.hasOwn(loraItemProps, k));
    const strengthKey = ['scale', 'weight', 'strength'].find((k) => Object.hasOwn(loraItemProps, k));
    if (!pathKey) return list;
    return list.map((l: any) => {
      if (typeof l === 'string') return { [pathKey]: l };
      const item: Record<string, unknown> = { [pathKey]: l?.[pathKey] || l?.path || l?.url || l?.downloadUrl || l?.civitaiId || l?.name };
      const sv = l?.[strengthKey ?? ''] ?? l?.strength ?? l?.modelStrength ?? l?.scale;
      if (strengthKey && sv !== undefined && sv !== null && sv !== '') item[strengthKey] = Number(sv);
      for (const k of Object.keys(loraItemProps)) if (k !== pathKey && k !== strengthKey && provided(l?.[k])) item[k] = l[k];
      return item;
    });
  };
  if (Array.isArray(body.loras)) body = { ...body, loras: mapLoraItems(body.loras) };
  // Canvas-internal metadata (`_canvas`) never goes upstream; every user-filled key still does.
  if (body.custom_parameters && typeof body.custom_parameters === 'object' && !Array.isArray(body.custom_parameters)) {
    const { _canvas: _meta, ...rest } = body.custom_parameters as Record<string, unknown>;
    void _meta;
    if (Array.isArray(rest.loras)) rest.loras = mapLoraItems(rest.loras);
    body = { ...body, custom_parameters: rest };
  }
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
  if (provided(reference) && imageWire) {
    delete actual.image_url;
    delete actual.start_image_url;
    actual[imageWire] = reference;
  }

  // Schema-driven required validation: driven strictly by live OpenAPI required / anyOf.
  // Never hardcode endpoint names or block locally when the live schema declares no required fields.
  const propLevelRequired = Object.entries(props)
    .filter(([_, spec]) => spec && typeof spec === 'object' && (spec as any).required === true)
    .map(([k]) => k);
  const allRequired = Array.from(new Set([...schemaRequired, ...propLevelRequired]));
  for (const reqField of allRequired) {
    if (!provided(actual[reqField])) {
      fail(`${reqField} 为必填项`);
    }
  }

  if (schemaAnyOf.length > 0) {
    const branchesWithRequired = schemaAnyOf.filter((b) => Array.isArray(b.required) && b.required.length > 0);
    if (branchesWithRequired.length > 0) {
      const satisfied = branchesWithRequired.some((branch) =>
        (branch.required as string[]).every((field) => provided(actual[field])),
      );
      if (!satisfied) {
        fail(`未满足必填组合要求 (${branchesWithRequired.map((b) => (b.required as string[]).join(' + ')).join(' 或 ')})`);
      }
    }
  }

  const durationSpec = props.duration as Record<string, unknown> | undefined;
  const durationType = durationSpec && typeof durationSpec === 'object' ? durationSpec.type : undefined;
  if (provided(actual.duration) && durationType === 'string') {
    actual.duration = String(actual.duration);
  }

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
  if (value === '' || value === null || value === undefined) return '';
  return String(value);
}
