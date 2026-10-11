import { getFieldSpec, valueStatus } from '../schemas/providerSchema';

type Body = Record<string, any>;
export type CivitaiPublicGet = (url: string) => Promise<Response>;
const provided = (value: unknown) => value !== undefined && value !== null && value !== '';

export class CivitaiContractError extends Error {
  readonly status = 400;
}
export class CivitaiAmbiguousError extends CivitaiContractError {
  constructor(message: string, public candidates: Array<Record<string, unknown>>) { super(message); }
}
const fail = (message: string): never => { throw new CivitaiContractError(message); };
const airParts = (air: string) => air.replace(/^(?:urn:)?air:/, '').split(':');
const canonicalAir = (input: string) => /^(?:urn:)?air:/.test(input) ? (input.startsWith('urn:') ? input : `urn:${input}`) : undefined;
const baseEcosystems: Record<string, string> = {
  'sd 1.5': 'sd15', 'sd 1.4': 'sd15', 'sdxl 1.0': 'sdxl', 'flux.1 d': 'flux1', 'flux.1 s': 'flux1', 'flux.1 dev': 'flux1', 'flux.1 schnell': 'flux1',
  'zimageturbo': 'zimageturbo', 'zimagebase': 'zimagebase', 'krea 2': 'krea2',
};
function versionAir(data: Body, parent?: Body): string {
  if (typeof data.air === 'string' && data.air) return data.air;
  const rawType = data.model?.type ?? parent?.type;
  if (!rawType) return fail('Civitai API 未返回 air 或资源 type；不能按调用位置猜测 Checkpoint/LoRA');
  const types: Record<string, string> = { Checkpoint: 'checkpoint', LORA: 'lora', LoCon: 'lycoris', DoRA: 'dora', TextualInversion: 'embedding', VAE: 'vae', Controlnet: 'controlnet', Upscaler: 'upscaler' };
  const primary = data.files?.find((file: Body) => file.primary);
  const type = primary?.type === 'Diffusion Model' ? 'diffusionmodel' : primary?.type === 'UNet' ? 'unet' : types[rawType] ?? String(rawType).toLowerCase();
  const base = String(data.baseModel ?? '').toLowerCase();
  const ecosystem = baseEcosystems[base];
  if (!ecosystem || !data.id || !(data.modelId ?? parent?.id)) return fail('Civitai API 未返回完整 AIR，资源生态/ID 未能核实；请提供完整 AIR');
  return `urn:air:${ecosystem}:${type}:civitai:${data.modelId ?? parent?.id}@${data.id}`;
}
async function readApi(get: CivitaiPublicGet, url: string): Promise<Body | undefined> {
  const response = await get(url);
  if (response.status === 404) return undefined;
  if (!response.ok) {
    const rawResponse = await response.text();
    throw Object.assign(new Error(`Civitai API HTTP ${response.status}: ${rawResponse}`), { status: response.status, rawResponse, errorSource: 'upstream' });
  }
  return response.json();
}
export async function resolveCivitaiResource(rawInput: string, get: CivitaiPublicGet): Promise<string> {
  const input = rawInput.trim();
  const air = canonicalAir(input);
  if (air) return air;
  const pair = /^(\d+)@(\d+)$/.exec(input);
  if (pair) {
    const version = await readApi(get, `https://civitai.com/api/v1/model-versions/${pair[2]}`);
    if (!version) return fail(`找不到 Civitai versionId=${pair[2]}`);
    if (String(version.modelId) !== pair[1]) return fail(`modelId=${pair[1]} 与 API versionId=${pair[2]} 的 modelId=${version.modelId} 不匹配`);
    return versionAir(version);
  }
  if (/^\d+$/.test(input)) {
    const [version, model] = await Promise.all([
      readApi(get, `https://civitai.com/api/v1/model-versions/${input}`),
      readApi(get, `https://civitai.com/api/v1/models/${input}`),
    ]);
    const candidates = model?.modelVersions?.map((v: Body) => ({ modelId: model.id, versionId: v.id, name: v.name, air: v.air ?? `${model.id}@${v.id}` })) ?? [];
    if (model) throw new CivitaiAmbiguousError(`数字 ${input} 是模型 ID${version ? '，也命中版本 ID' : ''}；请指定 modelId@versionId 或完整 AIR`, [...(version ? [{ modelId: version.modelId, versionId: version.id, air: version.air ?? `${version.modelId}@${version.id}` }] : []), ...candidates]);
    if (version) return versionAir(version);
    return fail(`找不到 Civitai modelId/versionId=${input}`);
  }
  const search = await readApi(get, `https://civitai.com/api/v1/models?query=${encodeURIComponent(input.replace(/\.safetensors$/i, '').replace(/_/g, ' '))}&limit=3`);
  const models = search?.items ?? [];
  const candidates = models.flatMap((model: Body) => (model.modelVersions ?? []).map((v: Body) => ({ modelId: model.id, versionId: v.id, name: `${model.name} / ${v.name}`, air: v.air ?? `${model.id}@${v.id}` })));
  if (models.length !== 1 || models[0].modelVersions?.length !== 1) throw new CivitaiAmbiguousError(`搜索 "${input}" 未确定唯一模型版本；请提供完整 AIR`, candidates);
  return versionAir(models[0].modelVersions[0], models[0]);
}

async function buildCivitaiBaseInput(body: Body, get: CivitaiPublicGet): Promise<Body> {
  const builtin = (body.ecosystem === 'zImage' || body.ecosystem === 'krea2') && provided(body.comfyModel);
  const selectorOnly = builtin && (!provided(body.model) || body.model === body.comfyModel);
  const source = selectorOnly ? undefined : await resolveCivitaiResource(String(body.model ?? ''), get);
  const actualEcosystem = source ? airParts(source)[0] : undefined;
  const sourceType = source ? airParts(source)[1]?.toLowerCase() : undefined;
  if (sourceType && ['lora', 'locon', 'lycoris', 'embedding', 'vae', 'controlnet', 'upscaler'].includes(sourceType)) fail(`传统底模资源类型 ${sourceType} 不可用作 checkpoint/diffusion model`);
  // AIR guide uses sd15; imageGen OpenAPI uses sd1 as the request discriminator.
  const requestEcosystem = actualEcosystem === 'sd15' ? 'sd1' : actualEcosystem === 'zimageturbo' && body.comfyModel === 'turbo' || actualEcosystem === 'zimagebase' && body.comfyModel === 'base' ? 'zImage' : actualEcosystem;
  if (provided(body.ecosystem) && requestEcosystem && body.ecosystem !== requestEcosystem) fail(`显式生态 ${body.ecosystem} 与实际资源生态 ${actualEcosystem} 冲突`);
  const ecosystem = body.ecosystem ?? requestEcosystem;
  if (!ecosystem) fail('Civitai ecosystem 为必填项，或提供带生态的完整 AIR');
  const engine = body.engine ?? (['sd1', 'sd15', 'sdxl', 'flux1', 'flux2Dev', 'flux2Klein', 'qwen', 'zImage', 'anima'].includes(ecosystem) ? 'sdcpp' : 'comfy');
  if (!['comfy', 'sdcpp'].includes(engine)) fail('Civitai engine 只接受显式 comfy 或 sdcpp');
  const operation = body.operation ?? (provided(body.image_url) ? 'createVariant' : 'createImage');
  if (ecosystem === 'zImage' && (operation !== 'createImage' || provided(body.image_url))) fail('ZImage 仅支持 operation=createImage');
  if (ecosystem === 'krea2' && builtin && (engine !== 'comfy' || body.comfyModel !== 'turbo' || operation !== 'createImage')) fail('Krea Comfy turbo 需要 engine=comfy、model=turbo、operation=createImage');
  if (ecosystem === 'zImage' && !['turbo', 'base'].includes(body.comfyModel)) fail('ZImage comfyModel 必须为 turbo 或 base');
  const input: Body = { engine, ecosystem, operation };
  if (builtin) {
    input.model = body.comfyModel;
    if (source && engine === 'comfy') input[ecosystem === 'zImage' ? 'diffuserModel' : 'diffusionModel'] = source;
    else if (source) fail('ZImage 内建 selector 不接受 source checkpoint；请明确选择 turbo/base');
  } else if (ecosystem === 'anima' || engine === 'sdcpp' && ecosystem === 'flux1') input.diffuserModel = source;
  else input.model = source;
  const schemaId = `${engine}:${ecosystem}`;
  for (const [field, key, wire] of [
    ['prompt', undefined, 'prompt'], ['negative_prompt', 'negative_prompt', 'negativePrompt'], ['width', 'width', 'width'], ['height', 'height', 'height'],
    ['steps', 'steps', 'steps'], ['cfg', 'cfg', 'cfgScale'], ['seed', 'seed', 'seed'], ['quantity', 'num_images', 'quantity'],
    ['sampler_name', 'sampler', engine === 'comfy' ? 'sampler' : 'sampleMethod'], ['scheduler', 'scheduler', engine === 'comfy' ? 'scheduler' : 'schedule'],
  ] as const) {
    if (!provided(body[field])) continue;
    if (key && getFieldSpec('civitai', schemaId, key)?.status === 'unsupported') fail(`Civitai ${schemaId} 不支持 ${field}`);
    if (key && valueStatus('civitai', schemaId, key, body[field]) === 'unsupported') fail(`${wire}=${body[field]} 不符合 Civitai ${schemaId} 官方范围/枚举`);
    input[wire] = ['width', 'height', 'steps', 'cfg', 'seed', 'quantity'].includes(field) ? Number(body[field]) : body[field];
  }
  if (provided(body.image_url)) {
    input.image = body.image_url;
    if (provided(body.denoise)) input[engine === 'comfy' && ['sd1', 'sdxl', 'flux1'].includes(ecosystem) ? 'denoiseStrength' : 'strength'] = Number(body.denoise);
  } else if (provided(body.denoise)) fail('denoise 需要同时提供 image_url');
  if (body.loras !== undefined && !Array.isArray(body.loras)) fail('loras 必须为数组');
  const loras: Body = {};
  for (const lora of body.loras ?? []) {
    const raw = lora.civitaiId ?? lora.versionId ?? lora.id ?? lora.name;
    if (!provided(raw)) fail('LoRA 资源 AIR/ID 为必填项');
    const resource = await resolveCivitaiResource(String(raw), get);
    const [resourceEcosystem, type] = airParts(resource);
    if (!['lora', 'locon', 'lycoris'].includes(type.toLowerCase())) fail(`资源 ${resource} 的类型 ${type} 不是 LoRA/LoCon/LyCORIS`);
    const sd1Resource = resourceEcosystem === 'sd15' && ecosystem === 'sd1';
    // Civitai's app-panorama-360 documents zimageturbo as the worker's canonical Turbo AIR namespace.
    const zImageTurboResource = resourceEcosystem === 'zimageturbo' && ecosystem === 'zImage' && input.model === 'turbo';
    const zImageBaseResource = resourceEcosystem === 'zimagebase' && ecosystem === 'zImage' && input.model === 'base';
    if (resourceEcosystem !== ecosystem && !sd1Resource && !zImageTurboResource && !zImageBaseResource) fail(`LoRA 实际生态 ${resourceEcosystem} 与所选生态 ${ecosystem} 冲突`);
    const strength = lora.strength ?? lora.modelStrength;
    if (!provided(strength) || !Number.isFinite(Number(strength))) fail(`LoRA strength 为必填数值: ${raw}`);
    loras[resource] = Number(strength);
  }
  if (Object.keys(loras).length) input.loras = loras;
  return input;
}

export async function buildCivitaiImageRequest(body: Body, get: CivitaiPublicGet) {
  const custom = body.custom_parameters ?? {};
  if ('custom_parameters' in body && (!body.custom_parameters || typeof custom !== 'object' || Array.isArray(custom))) fail('custom_parameters 必须为 JSON 对象');
  const boundary = /^(?:model|comfyModel|engine|ecosystem|provider|endpoint|base_?url|url|inference_provider|diffuserModel|diffusionModel|workflowSnapshot|operation)$|api.?key|authorization|credential|password|secret|token/i;
  for (const key of Object.keys(custom)) if (boundary.test(key)) fail(`custom_parameters 不可修改路由/模型/凭据边界: ${key}`);
  const aliases: Record<string, string> = { cfgScale: 'cfg', negativePrompt: 'negative_prompt', sampler: 'sampler_name', sampleMethod: 'sampler_name', schedule: 'scheduler', image: 'image_url', strength: 'denoise', denoiseStrength: 'denoise' };
  const normalize = (source: Body) => {
    const normalized: Body = {};
    for (const [key, value] of Object.entries(source)) {
      const field = aliases[key] ?? key;
      if (Object.hasOwn(normalized, field) && JSON.stringify(normalized[field]) !== JSON.stringify(value)) fail(`${field} 与 ${key} 不一致`);
      normalized[field] = value;
    }
    if (Object.hasOwn(normalized, 'loras') && !Array.isArray(normalized.loras)) {
      if (!normalized.loras || typeof normalized.loras !== 'object') fail('loras 必须为 AIR 权重对象或数组');
      normalized.loras = Object.entries(normalized.loras).map(([civitaiId, strength]) => ({ civitaiId, strength }));
    }
    return normalized;
  };
  const topLevel = normalize(body);
  const normalizedCustom = normalize(custom);
  const effective: Body = { ...topLevel, ...normalizedCustom };
  const translated = new Set([...Object.values(aliases), 'loras', 'prompt', 'width', 'height', 'steps', 'seed', 'quantity']);
  const controls = /^(?:custom_parameters|isVideo|targetProvider|videoDuration|duration|fps)$|api.?key|authorization|credential|password|secret|token/i;
  const advanced = (source: Body) => Object.fromEntries(Object.entries(source).filter(([key]) => !translated.has(key) && !boundary.test(key) && !controls.test(key)));
  const beforeCustom = { ...await buildCivitaiBaseInput(topLevel, get), ...advanced(topLevel) };
  const mapped = await buildCivitaiBaseInput(effective, get);
  if (Object.hasOwn(normalizedCustom, 'loras')) mapped.loras = mapped.loras ?? {};
  const payload = { ...mapped, ...advanced(effective) };
  const overrides = Object.fromEntries(Object.entries(payload).filter(([key, value]) => Object.hasOwn(beforeCustom, key) && JSON.stringify(beforeCustom[key]) !== JSON.stringify(value)).map(([key, value]) => [key, { before: beforeCustom[key], after: value }]));
  return { payload, beforeCustom, customParameters: { ...custom }, overrides };
}

export async function buildCivitaiImageInput(body: Body, get: CivitaiPublicGet): Promise<Body> {
  return (await buildCivitaiImageRequest(body, get)).payload;
}
