export const NANO_IMAGE_DOC='https://docs.nano-gpt.com/api-reference/image-generation';
// Normalized /api/v1/images contract. Capability metadata is model-specific.
export function buildNanoImagePayload(body:Record<string,any>,endpoint:Record<string,any>) {
  if (!body.model) throw new Error('模型为必填项');
  const supported=endpoint.supported_parameters || {};
  const payload:Record<string,any>={model:body.model,prompt:body.prompt};
  const supplied=(v:any)=>v!==undefined && v!==null && v!=='' && (!Array.isArray(v)||v.length>0);
  for (const key of ['negative_prompt','steps','cfg','guidance_scale','denoise','sampler_name','scheduler','loras','size']) {
    if (supplied(body[key])) throw new Error(`NanoGPT 归一化接口未核实 ${key}，该端点不支持此参数`);
  }
  const resolutions=supported.resolutions || supported.resolution?.values || [];
  let resolution=body.resolution;
  if (supplied(body.width)||supplied(body.height)) {
    if (!Number.isInteger(body.width)||!Number.isInteger(body.height)) throw new Error('width / height 必须同时为整数');
    const dimensions=`${body.width}x${body.height}`;
    if (resolution && resolution!==dimensions) throw new Error('resolution 与 width / height 冲突，请明确一种尺寸');
    resolution=dimensions;
  }
  if (supplied(resolution)) {
    if (!resolutions.includes(resolution)) throw new Error(`该模型不支持 resolution=${resolution}；官方支持值：${resolutions.join(', ') || '未能核实'}`);
    payload.resolution=resolution;
  }
  for (const key of ['aspect_ratio','seed','quality','output_format']) {
    if (!supplied(body[key])) continue;
    const spec=supported[key];
    if (!spec) throw new Error(`该模型未提供 ${key} 能力元数据，无法核实；不会传入猜测的参数`);
    const values=Array.isArray(spec)?spec:spec.values;
    if (values && !values.includes(body[key])) throw new Error(`该模型不支持 ${key}=${body[key]}`);
    if (spec.min!==undefined && body[key]<spec.min || spec.max!==undefined && body[key]>spec.max) throw new Error(`${key} 超出模型支持范围`);
    payload[key]=body[key];
  }
  if (supplied(body.n)) {
    const max=supported.max_output_images ?? supported.max_images ?? supported.n?.max;
    if (!Number.isInteger(body.n)||body.n<1 || max===undefined || body.n>max) throw new Error(`n 超出模型支持范围（1–${max ?? '未能核实'}）`);
    payload.n=body.n;
  }
  if (body.image_url) {
    const max=endpoint.input_reference_constraints?.max_items ?? supported.input_references?.max ?? supported.max_input_images;
    if (!endpoint.capabilities?.image_to_image && !(max>=1)) throw new Error('该模型没有已核实的图生图能力');
    payload.input_references=[{type:'image_url',image_url:{url:body.image_url}}];
  }
  return payload;
}
