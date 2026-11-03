import { sanitizeGenerationMetadata } from '../utils/generationMetadata';

const provided = (value: unknown) => value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0);
const boundary = /^(?:model|provider|targetProvider|endpoint|route|url|base_?url|headers|__proto__|prototype|constructor|inference_provider|custom_parameters|workflowSnapshot|parameterOmissions|extraParams|isVideo)$|api.?key|authorization|credential|password|secret|token/i;
const aliases: Record<string, string> = { duration: 'seconds', image_url: 'first_frame' };
const officialFields = new Set(['model', 'prompt', 'mode', 'seconds', 'size', 'aspect_ratio', 'seed', 'n', 'first_frame', 'last_frame', 'images', 'audios', 'videos']);

export class AgnesVideoRequestError extends Error { readonly status = 400; }

export function buildAgnesVideoRequest(model: string, body: Record<string, unknown>) {
  const fail = (message: string): never => { throw new AgnesVideoRequestError(message); };
  if (Object.hasOwn(body, 'custom_parameters') && (!body.custom_parameters || typeof body.custom_parameters !== 'object' || Array.isArray(body.custom_parameters))) fail('custom_parameters 必须为 JSON 对象');
  const custom = (body.custom_parameters ?? {}) as Record<string, unknown>;
  for (const key of Object.keys(custom)) if (boundary.test(key)) fail(`custom_parameters 不可覆盖模型/路由/凭据边界: ${key}`);
  const map = (source: Record<string, unknown>) => {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (boundary.test(key)) continue;
      const wire = aliases[key] ?? key;
      if (Object.hasOwn(result, wire) && JSON.stringify(result[wire]) !== JSON.stringify(value)) fail(`${key} 与 ${wire} 不一致`);
      result[wire] = value;
    }
    return result;
  };
  const mapped = map(body);
  const extra = body.extraParams;
  if (!Object.hasOwn(mapped, 'size') && extra && typeof extra === 'object' && !Array.isArray(extra) && Object.hasOwn(extra, 'size')) mapped.size = (extra as Record<string, unknown>).size;
  const beforeCustom: Record<string, unknown> = { model, ...mapped };
  const mappedCustom = map(custom);
  const payload: Record<string, unknown> = { ...beforeCustom, ...mappedCustom };
  const knownModel = model === 'agnes-video-2.5' || model === 'agnes-video-2.5-flash';
  const frameFields = ['first_frame', 'last_frame'];
  const refFields = ['images', 'audios', 'videos'];
  if (payload.mode === undefined || payload.mode === null || payload.mode === '') payload.mode = frameFields.some(key => provided(payload[key])) ? 'keyframe' : 'text';
  if (knownModel) {
    // 2026-11-04 (雁): no local type/enum/count/mode checks — the payload goes out as filled; upstream decides.
    void frameFields; void refFields;
    // Wire-type formatting only (documented: seconds is a string, seed an integer); never refuses.
    if (provided(payload.seconds) && Number.isInteger(Number(payload.seconds))) payload.seconds = String(Number(payload.seconds));
    if (typeof payload.seed === 'string' && /^-?\d+$/.test(payload.seed)) payload.seed = Number(payload.seed);
    // 2026-11-02: no local aspect_ratio enum refuse. Official six (21:9/16:9/4:3/1:1/3:4/9:16) verified on
    // https://wiki.agnes-ai.com/en/docs/agnes-video-25 but Agnes has no machine-readable /api/model-schema yet —
    // pass through; upstream 400 if outside list. UI must not invent options without Schema.
  }
  const overrides = Object.fromEntries(Object.entries(mappedCustom).filter(([key, value]) => Object.hasOwn(beforeCustom, key) && JSON.stringify(beforeCustom[key]) !== JSON.stringify(value)).map(([key, value]) => [key, { before: beforeCustom[key], after: value }]));
  const fieldStatus = Object.fromEntries(Object.keys(payload).map(key => [key, knownModel && officialFields.has(key) ? 'supported' : 'unverified']));
  return { payload, beforeCustom, customParameters: { ...custom }, overrides, fieldStatus, requestedParameters: sanitizeGenerationMetadata(body) };
}

export function agnesVideoId(data: Record<string, unknown>): string {
  if (typeof data.video_id !== 'string' || !data.video_id.trim()) throw new Error('Agnes AI 视频协议错误：响应缺少 video_id（id/task_id 不能用于轮询）');
  return data.video_id;
}
