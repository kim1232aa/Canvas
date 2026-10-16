import { applyCustomParameters } from '../server/customParameters';

export const NANO_IMAGE_DOC='https://docs.nano-gpt.com/api-reference/image-generation';
// Normalized /api/v1/images contract. Capability metadata is per-model:
// supported_parameters declares what is officially documented (Researchy 2026-10-15).
// Undeclared seed/steps/cfg/negative_prompt/… are NOT sent (UI: 「不会发送」); only declared fields go upstream.
export function buildNanoImagePayload(body:Record<string,any>,endpoint:Record<string,any>):{payload:Record<string,any>;capabilityNotes:Record<string,any>[]} {
  if (!body.model) throw new Error('模型为必填项');
  const supported=endpoint.supported_parameters || {};
  const passthrough:string[]=Array.isArray(endpoint.allowed_passthrough_parameters)?endpoint.allowed_passthrough_parameters:[];
  const payload:Record<string,any>={model:body.model,prompt:body.prompt};
  const capabilityNotes:Record<string,any>[]=[];
  const supplied=(v:any)=>v!==undefined && v!==null && v!=='' && (!Array.isArray(v)||v.length>0);

  // Documented enum/range parameters: validate against live metadata.
  const resolutions=supported.resolutions || supported.resolution?.values || [];
  let resolution=body.resolution;
  if (supplied(body.width)||supplied(body.height)) {
    if (!Number.isInteger(body.width)||!Number.isInteger(body.height)) throw new Error('width / height 必须同时为整数');
    const dimensions=`${body.width}x${body.height}`;
    if (resolution && resolution!==dimensions) throw new Error('resolution 与 width / height 冲突，请明确一种尺寸');
    resolution=dimensions;
  }
  if (supplied(resolution)) {
    if (resolutions.length && !resolutions.includes(resolution)) throw new Error(`该模型不支持 resolution=${resolution}；官方支持值：${resolutions.join(', ')}`);
    payload.resolution=resolution;
  }
  for (const key of ['aspect_ratio','seed','quality','output_format']) {
    if (!supplied(body[key])) continue;
    const spec=supported[key];
    if (!spec) {
      // Undeclared → 不会发送 (Researchy 2026-10-15: only nano-banana-2.1 declares seed among 243 models).
      capabilityNotes.push({field:key,value:body[key],capability:'not_sent',note:'该模型 supported_parameters 未声明此参数；不会发送。'});
      continue;
    }
    const values=Array.isArray(spec)?spec:spec.values;
    if (values && !values.includes(body[key])) throw new Error(`该模型不支持 ${key}=${body[key]}；官方支持值：${values.join(', ')}`);
    if (spec.min!==undefined && body[key]<spec.min || spec.max!==undefined && body[key]>spec.max) throw new Error(`${key} 超出模型支持范围`);
    payload[key]=body[key];
  }
  // steps/cfg/negative_prompt/…: send only when supported_parameters declares them.
  for (const key of ['negative_prompt','steps','cfg','guidance_scale','denoise','sampler_name','scheduler','size']) {
    if (!supplied(body[key])) continue;
    if (supported[key]) { payload[key]=body[key]; continue; }
    capabilityNotes.push({field:key,value:body[key],capability:'not_sent',note:'该模型 supported_parameters 未声明此参数；不会发送。'});
  }
  // LoRA: only models whose metadata declares supported_parameters.loras accept them
  // (2026-10-05: minimax-h3/* 等声明 {max_items:3, item:{path,scale}})。
  if (supplied(body.loras)) {
    const spec=supported.loras;
    if (!spec) {
      // Researchy audit 2026-10-15: NanoGPT Image/Video docs have no generic LoRA.
      // Only send when live supported_parameters.loras declares the field — never invent path+scale.
      throw new Error('该 NanoGPT 模型 supported_parameters 未声明 loras；官方 Image API 无通用 LoRA 字段。未发送请求。请移除 LoRA 节点，或换 metadata 声明了 loras 的模型。');
    } else {
      const items=body.loras.map((l:any)=>{
        const path=l.path || l.url || l.name;
        if (!path || !/^https:\/\//.test(String(path))) throw new Error('该模型 LoRA 需要 HTTPS 权重 URL（supported_parameters.loras.item.path）');
        return {path:String(path),scale:l.strength ?? l.modelStrength};
      });
      if (spec.max_items!==undefined && items.length>spec.max_items) throw new Error(`该模型最多支持 ${spec.max_items} 个 LoRA（本次 ${items.length} 个）`);
      payload.loras=items;
      capabilityNotes.push({field:'loras',value:items,capability:'supported',note:`按 supported_parameters.loras 提交 {path, scale}，max_items=${spec.max_items}。`});
    }
  }
  if (supplied(body.n)) {
    const max=supported.max_output_images ?? supported.max_images ?? supported.n?.max;
    if (!Number.isInteger(body.n)||body.n<1) throw new Error('n 必须为 ≥1 的整数');
    if (max!==undefined && body.n>max) throw new Error(`n 超出模型支持范围（1–${max}）`);
    payload.n=body.n;
  }
  if (body.image_url) {
    const max=endpoint.input_reference_constraints?.max_items ?? supported.input_references?.max ?? supported.max_input_images;
    if (endpoint.capabilities?.image_to_image===false && !(max>=1)) throw new Error('该模型 capabilities.image_to_image=false，官方元数据不支持图生图');
    payload.input_references=[{type:'image_url',image_url:{url:body.image_url}}];
  }
  const custom = applyCustomParameters(payload, body.custom_parameters);
  capabilityNotes.push(...custom.overrides.map(override => ({ ...override, capability: 'override', note: '手写 JSON 覆盖画布值。' })));
  return {payload: custom.payload,capabilityNotes};
}
