import { applyCustomParameters } from '../server/customParameters';

export const NANO_IMAGE_DOC='https://docs.nano-gpt.com/api-reference/image-generation';
// Normalized /api/v1/images contract. Capability metadata is per-model:
// supported_parameters declares what is officially documented (Researchy 2026-10-15).
// Every filled field is sent as filled; undeclared ones are noted (capability 'undeclared_sent').
export function buildNanoImagePayload(body:Record<string,any>,endpoint:Record<string,any>):{payload:Record<string,any>;capabilityNotes:Record<string,any>[]} {
  if (!body.model) throw new Error('模型为必填项');
  // 雁 rule: every filled value is sent as filled; supported_parameters is recorded as a note only (no local refusal).
  const supported=endpoint.supported_parameters || {};
  const payload:Record<string,any>={model:body.model,prompt:body.prompt};
  const capabilityNotes:Record<string,any>[]=[];
  const supplied=(v:any)=>v!==undefined && v!==null && v!=='' && (!Array.isArray(v)||v.length>0);
  // Pixel size → documented resolution "WxH" when no explicit resolution; both filled → both sent as filled.
  if (supplied(body.resolution)) payload.resolution=body.resolution;
  else if (supplied(body.width) && supplied(body.height)) payload.resolution=`${body.width}x${body.height}`;
  if (supplied(body.resolution) && (supplied(body.width) || supplied(body.height))) {
    if (supplied(body.width)) payload.width=body.width;
    if (supplied(body.height)) payload.height=body.height;
  }
  for (const key of ['aspect_ratio','seed','quality','output_format','negative_prompt','steps','cfg','guidance_scale','denoise','sampler_name','scheduler','size','n']) {
    if (!supplied(body[key])) continue;
    payload[key]=body[key];
    if (!supported[key] && key!=='n') capabilityNotes.push({field:key,value:body[key],capability:'undeclared_sent',note:'supported_parameters 未声明；按所填原样发送，上游决定。'});
  }
  if (supplied(body.loras)) {
    payload.loras=body.loras.map((l:any)=>({path:String(l.path || l.url || l.name || ''),scale:l.strength ?? l.modelStrength}));
    capabilityNotes.push({field:'loras',value:payload.loras,capability:supported.loras?'supported':'undeclared_sent',note:supported.loras?`按 supported_parameters.loras 提交 {path, scale}，max_items=${supported.loras.max_items}。`:'supported_parameters 未声明 loras；按所填原样发送 {path, scale}，上游决定。'});
  }
  if (body.image_url) payload.input_references=[{type:'image_url',image_url:{url:body.image_url}}];
  const custom = applyCustomParameters(payload, body.custom_parameters);
  capabilityNotes.push(...custom.overrides.map(override => ({ ...override, capability: 'override', note: '手写 JSON 覆盖画布值。' })));
  return {payload: custom.payload,capabilityNotes};
}
