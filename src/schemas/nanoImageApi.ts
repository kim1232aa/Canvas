export const NANO_IMAGE_DOC='https://docs.nano-gpt.com/api-reference/image-generation';
// Normalized /api/v1/images contract. Capability metadata is per-model:
// supported_parameters declares what is officially documented. A missing key
// means "unknown" — never reported as "unsupported" and never silently dropped:
// user-supplied values pass through with an explicit unknown-capability note,
// so the upstream response is the source of truth (2026-10-05 live metadata audit).
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
      // Undeclared = unknown capability. Pass through and annotate; do not block.
      payload[key]=body[key];
      capabilityNotes.push({field:key,value:body[key],capability:'unknown',note:'该模型 supported_parameters 未声明此参数；按用户显式值提交，上游响应为准。'});
      continue;
    }
    const values=Array.isArray(spec)?spec:spec.values;
    if (values && !values.includes(body[key])) throw new Error(`该模型不支持 ${key}=${body[key]}；官方支持值：${values.join(', ')}`);
    if (spec.min!==undefined && body[key]<spec.min || spec.max!==undefined && body[key]>spec.max) throw new Error(`${key} 超出模型支持范围`);
    payload[key]=body[key];
  }
  // Never documented on any image model as of 2026-10-05 live audit: negative_prompt,
  // steps, cfg/guidance_scale, denoise, sampler_name, scheduler, size. Unknown ≠
  // unsupported — pass user values through with an explicit note instead of a local gate.
  for (const key of ['negative_prompt','steps','cfg','guidance_scale','denoise','sampler_name','scheduler','size']) {
    if (!supplied(body[key])) continue;
    if (supported[key]) { payload[key]=body[key]; continue; }
    payload[key]=body[key];
    capabilityNotes.push({field:key,value:body[key],capability:'unknown',note:'supported_parameters 未声明此参数；按用户显式值提交，不本地拦截，上游响应为准。'});
  }
  // LoRA: only models whose metadata declares supported_parameters.loras accept them
  // (2026-10-05: minimax-h3/* 等声明 {max_items:3, item:{path,scale}})。
  if (supplied(body.loras)) {
    const spec=supported.loras;
    if (!spec) {
      capabilityNotes.push({field:'loras',value:body.loras,capability:'unknown',note:'该模型 supported_parameters 未声明 loras；按用户显式值提交，上游响应为准。'});
      payload.loras=body.loras.map((l:any)=>({path:l.path || l.url || l.name,scale:l.strength ?? l.modelStrength}));
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
  return {payload,capabilityNotes};
}
