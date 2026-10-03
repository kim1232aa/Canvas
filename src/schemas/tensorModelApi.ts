// Verified this run against Tensor-Art/tams-sdk.js and the official TAMS job/model schemas.
export const TENSOR_MODEL_API = 'https://tams-api.tensor.art';
export const TENSOR_JOB_DOC = 'https://tams-docs.tensor.art/zh/docs/api/apis/tams-api-v-1-service-create-job/';
export function tensorModelId(value: unknown): string {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^https:\/\/(?:www\.)?(?:tensor\.art|tusiart\.com)\/models\/(\d{10,20})(?:[/?#].*)?$/);
  const id=match?.[1] ?? raw;
  if (/^\d{10,20}$/.test(id) && BigInt(id)<=18446744073709551615n) return id;
  throw new Error('Tensor.Art 模型为必填项：请输入真实模型 ID 或 tensor.art/models/… 链接；OpenWorks 工具名不是模型 ID');
}
export function validateTensorModelDimensions(body:Record<string,any>,baseModel:string) {
  const base=String(baseModel || '').toLowerCase().replace(/[ _-]/g,'');
  const area=body.width*body.height;
  if (['sd1.5','1.5','sd1','sdv1'].includes(base)) {
    if (body.width>1024 || body.height>1024 || area<262144 || area>1048576) throw new Error('SD1.5 / 512 engine 尺寸须满足边长≤1024、像素面积262144–1048576');
  } else if (base==='sdxl' || base==='sdxl1.0') {
    if(area<262144 || area>2073600) throw new Error('SDXL 像素面积须为262144–2073600');
  } else throw new Error(`所选架构 ${baseModel || '未知'} 的经典 DIFFUSION Job 契约未能核实；不能把其他架构参数套用到该模型`);
}
export function buildTensorModelJob(body: Record<string, any>, requestId: string) {
  const model = tensorModelId(body.model);
  for (const field of ['width', 'height']) {
    if (!Number.isInteger(body[field]) || body[field] < 512 || body[field] > 1536 || body[field] % 64 !== 0) throw new Error(`${field} 必填，须为 512–1536 之间的 64 倍数`);
  }
  if (!String(body.prompt ?? '').trim()) throw new Error('prompt 为必填项');
  const inputInitialize: Record<string, any> = {};
  if (body.seed !== undefined) {
    if (!Number.isInteger(body.seed) || body.seed < -1 || body.seed > 4294967295) throw new Error('seed 须为 -1–4294967295 的整数');
    inputInitialize.seed = String(body.seed);
  }
  if (body.count !== undefined) {
    if (!Number.isInteger(body.count) || body.count < 1 || body.count > 4) throw new Error('count 须为 1–4 的整数');
    inputInitialize.count = body.count;
  }
  const diffusion: Record<string, any> = {sdModel: model, width: body.width, height: body.height, prompts: [{text: body.prompt}], negativePrompts: body.negative_prompt !== undefined ? [{text: body.negative_prompt}] : []};
  if (body.steps !== undefined) {
    if (!Number.isInteger(body.steps) || body.steps < 1 || body.steps > 60) throw new Error('steps 须为 1–60 的整数');
    diffusion.steps = body.steps;
  }
  if (body.cfg !== undefined) {
    if (!Number.isFinite(body.cfg) || body.cfg < 0 || body.cfg > 30) throw new Error('cfg 须为 0–30');
    diffusion.cfgScale = body.cfg;
  }
  if (body.sampler_name) diffusion.sampler = body.sampler_name;
  if (body.scheduler) diffusion.scheduleName = body.scheduler;
  if (body.loras !== undefined) {
    if (!Array.isArray(body.loras)) throw new Error('loras 必须为数组');
    diffusion.lora = {items: body.loras.map((entry: any) => {
      const id = tensorModelId(entry.tensorartId ?? entry.name);
      const weight = entry.strength ?? entry.modelStrength;
      if (!Number.isFinite(weight)) throw new Error(`LoRA ${id} 的 weight 必填，须为有限数值`);
      return {loraModel: id, weight};
    })};
  }
  return {requestId, stages: [{type:'INPUT_INITIALIZE', inputInitialize}, {type:'DIFFUSION', diffusion}]};
}
