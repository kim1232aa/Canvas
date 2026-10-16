import { buildModelScopeLoras } from '../schemas/modelScopeLoras';

/** Official ModelScope API-Inference /v1/images/generations request params (verified 2026-10-15):
 * https://www.modelscope.cn/docs/model-service/API-Inference/intro
 * model, prompt, negative_prompt, size, seed, steps, guidance, image_url, loras. No sampler / scheduler / denoise. */
export const MODELSCOPE_IMAGE_DOC = 'https://www.modelscope.cn/docs/model-service/API-Inference/intro';
export const MODELSCOPE_IMAGE_SCHEMA_FIELDS = ['model', 'prompt', 'negative_prompt', 'size', 'seed', 'steps', 'guidance', 'image_url', 'loras'] as const;

const isProvided = (v: unknown) => v !== undefined && v !== null && !(typeof v === 'string' && v.trim() === '');

export interface ModelScopeImagePayload {
  payload: Record<string, unknown>;
  parameterMappings: Array<{ from: string; to: string; value: unknown }>;
  omitted: Array<{ from: string; to: null; value: unknown; sent: false; reason: string }>;
  schemaFields: string[];
}

/** Schema-driven: only declared fields are sent; anything else filled is recorded as 「该端点不支持」. Throws on invalid LoRA. */
export function buildModelScopeImagePayload(body: Record<string, any>): ModelScopeImagePayload {
  const declared = new Set<string>(MODELSCOPE_IMAGE_SCHEMA_FIELDS);
  const payload: Record<string, unknown> = { model: body.model, prompt: body.prompt || '' };
  const parameterMappings: ModelScopeImagePayload['parameterMappings'] = [];
  const omitted: ModelScopeImagePayload['omitted'] = [];
  const omit = (from: string, value: unknown) =>
    omitted.push({ from, to: null, value, sent: false, reason: `该端点不支持：魔搭 API-Inference 官方参数表无 ${from}；未发送（${MODELSCOPE_IMAGE_DOC}）` });

  const { width, height } = body;
  if (isProvided(width) && isProvided(height)) {
    payload.size = `${Math.round(Number(width))}x${Math.round(Number(height))}`;
    parameterMappings.push({ from: 'width+height', to: 'size', value: payload.size });
  } else if (isProvided(body.size)) {
    payload.size = body.size;
  } else {
    if (isProvided(width)) omit('width', width);
    if (isProvided(height)) omit('height', height);
  }
  for (const field of ['negative_prompt', 'steps', 'guidance', 'seed', 'image_url']) if (isProvided(body[field])) payload[field] = body[field];
  if (!isProvided(body.guidance) && isProvided(body.cfg)) {
    payload.guidance = Number(body.cfg);
    parameterMappings.push({ from: 'cfg', to: 'guidance', value: payload.guidance });
  }
  for (const field of ['sampler_name', 'sampler', 'scheduler', 'denoise']) {
    if (!declared.has(field) && isProvided(body[field])) omit(field, body[field]);
  }
  const mappedLoras = buildModelScopeLoras(body.loras);
  if (mappedLoras !== undefined) payload.loras = mappedLoras;
  return { payload, parameterMappings, omitted, schemaFields: [...MODELSCOPE_IMAGE_SCHEMA_FIELDS] };
}
