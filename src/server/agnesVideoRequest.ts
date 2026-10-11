import { agnesVideoSize } from './agnesVideoContract';
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
    for (const key of ['size', 'mode', 'aspect_ratio']) {
      if (payload[key] !== undefined && payload[key] !== null && payload[key] !== '' && typeof payload[key] !== 'string') fail(`${key} 必须为字符串`);
    }
    if (payload.seconds !== undefined && payload.seconds !== null && payload.seconds !== '' && !(typeof payload.seconds === 'number' || typeof payload.seconds === 'string' && /^\d+$/.test(payload.seconds))) fail('seconds / duration 必须为数字或整数秒字符串');
    if (payload.seed !== undefined && payload.seed !== null && payload.seed !== '' && typeof payload.seed !== 'number') fail('seed 必须为整数数字');
    if (payload.n !== undefined && payload.n !== null && payload.n !== '' && typeof payload.n !== 'number') fail('n 必须为整数数字 1');
    if (provided(payload.size)) payload.size = agnesVideoSize(payload.size, model);
    if (provided(payload.seconds)) {
      const seconds = Number(payload.seconds);
      if (!Number.isInteger(seconds) || seconds < 4 || seconds > 12) fail('Agnes Video seconds 只接受 4–12 的整数秒');
      payload.seconds = String(seconds);
    }
    if (provided(payload.seed)) {
      if (!Number.isInteger(Number(payload.seed))) fail('seed 必须为整数');
      payload.seed = Number(payload.seed);
    }
    if (provided(payload.n) && payload.n !== 1) fail('Agnes Video n 仅支持整数 1');
    if (!['text', 'keyframe', 'reference'].includes(String(payload.mode))) fail('mode 仅支持 text / keyframe / reference');
    for (const key of frameFields) if (provided(payload[key]) && typeof payload[key] !== 'string') fail(`${key} 必须为 URL 字符串`);
    for (const key of refFields) if (provided(payload[key]) && !Array.isArray(payload[key])) fail(`${key} 必须为数组`);
    for (const key of ['images', 'audios']) if (Array.isArray(payload[key]) && (payload[key] as unknown[]).some(value => typeof value !== 'string' || !value.trim())) fail(`${key} 必须为非空 URL 字符串数组`);
    if (Array.isArray(payload.videos) && payload.videos.some(video => !video || typeof video !== 'object' || typeof video.url !== 'string' || !video.url.trim() || (video.start_seconds !== undefined && (typeof video.start_seconds !== 'number' || video.start_seconds < 0)) || (video.require_audio !== undefined && typeof video.require_audio !== 'boolean'))) fail('videos 必须包含 url、合法 start_seconds / require_audio');
    const hasFrame = frameFields.some(key => provided(payload[key]));
    const hasRef = refFields.some(key => provided(payload[key]));
    if (payload.mode === 'text' && (hasFrame || hasRef) || payload.mode === 'keyframe' && (!hasFrame || hasRef) || payload.mode === 'reference' && (!hasRef || hasFrame)) fail('mode 与媒体输入矛盾或缺少明确媒体输入');
    if (Array.isArray(payload.images) && payload.images.length > (model.endsWith('-flash') ? 5 : 8)) fail('images 数量超过官方限制');
    if (Array.isArray(payload.audios) && payload.audios.length > 3) fail('audios 数量超过官方限制');
    if (Array.isArray(payload.videos) && payload.videos.length > (model.endsWith('-flash') ? 0 : 1)) fail('videos 数量超过所选模型官方限制');
    for (const key of ['video_url', 'video_path', 'video_reference', 'input_reference', 'reference_url', 'width', 'height', 'fps', 'num_frames', 'quality', 'num_inference_steps']) if (provided(payload[key])) fail(`该服务商不支持: ${key}（Agnes Video 2.5）`);
    if (provided(payload.aspect_ratio) && !['21:9', '16:9', '4:3', '1:1', '3:4', '9:16'].includes(String(payload.aspect_ratio))) fail('aspect_ratio 不在官方支持列表');
  }
  const overrides = Object.fromEntries(Object.entries(mappedCustom).filter(([key, value]) => Object.hasOwn(beforeCustom, key) && JSON.stringify(beforeCustom[key]) !== JSON.stringify(value)).map(([key, value]) => [key, { before: beforeCustom[key], after: value }]));
  const fieldStatus = Object.fromEntries(Object.keys(payload).map(key => [key, knownModel && officialFields.has(key) ? 'supported' : 'unverified']));
  return { payload, beforeCustom, customParameters: { ...custom }, overrides, fieldStatus, requestedParameters: sanitizeGenerationMetadata(body) };
}

export function agnesVideoId(data: Record<string, unknown>): string {
  if (typeof data.video_id !== 'string' || !data.video_id.trim()) throw new Error('Agnes AI 视频协议错误：响应缺少 video_id（id/task_id 不能用于轮询）');
  return data.video_id;
}
