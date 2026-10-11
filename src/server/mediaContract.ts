export const MEDIA_SANDBOX_CSP = "sandbox; default-src 'none'; script-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
export const MEDIA_INPUT_ROUTES = /^\/api\/(?:(?:engine\/)?(?:[^/]+\/)?(?:generate|chat|refine-prompt|upload|submit)|schema-provider\/[^/]+\/submit)$/;
export const MEDIA_REF = /^\/api\/media\/([a-f0-9]{64})$/;
export const MEDIA_DATA = /^data:((?:image|video|audio)\/[\w.+-]+);base64,/;
const MEDIA_FIELDS = new Set(['image_url','imageUrl','referenceImageUrl','reference_image','reference_image_url','init_image','input_image','start_image_url','end_image_url','first_frame_url','last_frame_url','video_url','videoUrl','audio_url','audioUrl','image','images','image_urls','input_images','reference_images','media_references','mask','mask_url']);
const CONTAINERS = new Set(['custom_parameters','parameters','input','inputs','contents','parts','messages']);
const PROTECTED = new Set(['__proto__','prototype','constructor']);
export const safeEntries = (value: object) => Object.entries(value).filter(([key]) => !PROTECTED.has(key));
export const mediaField = (key: string) => MEDIA_FIELDS.has(key);
export const mediaContainer = (key: string) => CONTAINERS.has(key);
export function mediaInputError(message: string) {return Object.assign(new Error(message),{errorSource:'local',status:400});}
export function storageError(error: unknown): Error & {errorSource: string} {
  const cause = error instanceof Error ? error : new Error(String(error));
  return Object.assign(new Error(`媒体/索引存储失败: ${cause.message}`,{cause}),{errorSource:'storage',...((cause as any).code ? {code:(cause as any).code} : {})});
}
export function rawReference(sha256: string, size: number, text: string) {
  return {kind:'raw-response',url:`/api/media/raw/${sha256}`,sha256,size,encoding:'utf-8',fidelity:/"b64_json"\s*:\s*"\/api\/media\//.test(text) ? 'legacy-converted' : 'original'};
}
export function decodeMediaData(value: string) {
  const match = MEDIA_DATA.exec(value);
  if (!match) throw mediaInputError('只能保存 image / video / audio 的 base64 data URL');
  const encoded = value.slice(match[0].length);
  if (!encoded) throw mediaInputError('媒体内容为空 (empty)，拒绝保存');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 === 1) throw mediaInputError('媒体 base64 格式无效');
  const bytes = Buffer.from(encoded,'base64');
  if (!bytes.length) throw mediaInputError('媒体内容为空 (empty)，拒绝保存');
  return {bytes,contentType:match[1]};
}
