import { applyCustomParameters } from '../server/customParameters';

// https://orchestration.civitai.com/openapi/v2-consumers.json
// Supports Wan21CivitaiVideoGenInput and official Civitai Orchestration videoGen engines + custom_parameters.
const OFFICIAL_CIVITAI_VIDEO_ENGINES = new Set(['wan', 'ltx2', 'kling', 'vidu', 'veo3', 'minimax', 'seedance', 'hunyuan', 'grok', 'flux3']);

export function buildCivitaiVideoInput(body: Record<string, any>) {
  const engine = String(body.engine || '').trim();
  if (!engine || !OFFICIAL_CIVITAI_VIDEO_ENGINES.has(engine)) {
    throw new Error(`请选择已核实的视频 recipe：engine=wan、version=v2.1、provider=civitai（或官方支持引擎: ${[...OFFICIAL_CIVITAI_VIDEO_ENGINES].join(', ')}）；其他 recipe 尚未核实`);
  }
  if (engine === 'wan' && (body.version !== 'v2.1' || body.provider !== 'civitai')) {
    throw new Error('请选择已核实的视频 recipe：engine=wan、version=v2.1、provider=civitai；其他 recipe 尚未核实');
  }
  if (engine === 'wan') {
    for (const key of ['negative_prompt','sampler_name','scheduler','denoise','aspectRatio','operation']) {
      if (body[key] !== undefined && body[key] !== null && body[key] !== '') throw new Error(`Wan 2.1 Civitai recipe 未声明 ${key}`);
    }
    if (!/^urn:air:[^:]+:checkpoint:civitai:/.test(body.model || '')) throw new Error('视频模型须显式提供 checkpoint AIR');
    if (!Number.isFinite(body.cfg) || body.cfg < 0 || body.cfg > 100) throw new Error('该 recipe 要求 cfgScale（cfg）为 0–100');
  }

  const input: Record<string, any> = {
    engine,
    ...(body.version ? { version: body.version } : {}),
    ...(body.provider ? { provider: body.provider } : {}),
    ...(body.model ? { model: body.model } : {}),
    prompt: body.prompt,
    ...(Number.isFinite(body.cfg) ? { cfgScale: body.cfg } : {}),
  };
  for (const [from,to,min,max] of [['steps','steps',10,50],['seed','seed',-2147483648,2147483647],['videoDuration','duration',1,30],['fps','frameRate',1,2147483647],['width','width',1,2147483647],['height','height',1,2147483647]] as const) {
    if (body[from] === undefined) continue;
    if (!Number.isInteger(body[from]) || body[from] < min || body[from] > max) throw new Error(`${from} 必须为 ${min}–${max} 的整数`);
    input[to]=body[from];
  }
  if (body.image_url) input.sourceImage=body.image_url;
  if (body.loras?.length) input.loras=body.loras.map((l:any)=>{
    const air=l.air || l.name;
    const strength=l.strength ?? l.modelStrength;
    if (!/^urn:air:[^:]+:lora:civitai:/.test(air || '') || !Number.isFinite(strength)) throw new Error('视频 LoRA 需要完整 AIR 与明确数值强度');
    return {air,strength};
  });
  return applyCustomParameters(input, body.custom_parameters).payload;
}
