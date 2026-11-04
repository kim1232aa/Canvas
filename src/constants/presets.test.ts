import { PRESET_RECIPE_PROMPTS } from './presetRecipePrompts';
import { describe, expect, it } from 'vitest';
import { WORKFLOW_PRESETS, STD_PROMPT_PLACEHOLDER, presetSummary } from './presets';
import { correctPresetLayout } from './presetResources';
import { generationReadiness } from '../utils/generationReadiness';

const EXPECTED_T2I_PROVIDERS = [
  'huggingface',
  'modelscope',
  'modelscope_ai',
  'nanogpt',
  'tensorart',
  'fal',
  'muapi',
  'wavespeed',
  'krea',
  'together',
  'aimlapi',
  'novita',
  'venice',
  'deepinfra',
  'sogni',
  'replicate',
  'runware',
  'modelslab',
  'gemini',
  'agnes',
  'sensenova',
  'mage',
  'civitai',
] as const;

const EXPECTED_I2V_PROVIDERS = [
  'fal',
  'wavespeed',
  'civitai',
  'novita',
  'muapi',
  'replicate',
] as const;

/** Only providers with real accepted-run LoRA ids keep LoRALoader nodes. Empty shell forbidden. */
const HAS_LORA = new Set([
  'tensorart',
  'wavespeed',
  'modelslab',
  'replicate',
  'modelscope',
  'modelscope_ai',
  'huggingface',
  'aimlapi',
  'muapi',
  'novita',
  'sogni',
  'fal',
]);

/** Real LoRAs from accepted runs or official docs recipe IDs (evidence in presets.ts). */
const PREFILLED_LORA: Record<string, Array<[string, number]>> = {
  wavespeed: [['https://huggingface.co/comfyanonymous/flux_RealismLora_converted_comfyui/resolve/main/flux_realism_lora.safetensors', 1.1]],
  tensorart: [['1015214543296590260', 1], ['1029661490430387503', 1], ['1015863436619315552', 1]],
  modelslab: [['xl-realistic-cake-art-sty', 0.45]],
  replicate: [['renderartist/coloringbookflux', 1]],
  modelscope: [['hf/renderartist-Technically-Color-Z-Image-Turbo', 0.9]],
  huggingface: [['renderartist/Technically-Color-Z-Image-Turbo', 0.9]],
  aimlapi: [['https://huggingface.co/renderartist/Technically-Color-Z-Image-Turbo/resolve/main/Technically_Color_Z_Image_Turbo_v1_renderartist_2000.safetensors', 0.9]],
  muapi: [['https://huggingface.co/renderartist/coloringbookflux/resolve/main/c0l0ringb00k_Flux_v1_renderartist.safetensors', 1]],
  fal: [['https://huggingface.co/renderartist/coloringbookflux/resolve/main/c0l0ringb00k_Flux_v1_renderartist.safetensors', 1]],
  novita: [['epi_noiseoffset2_14333', 0.65], ['more_details_59655', 0.4]],
  sogni: [['krea2-kodachrome-photo', 0.8]],
  modelscope_ai: [['LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1', 1]],
};

// Only documented recipe prompts (presetRecipePrompts.ts, each with a source) or empty.
const ALLOWED_PROMPT = new Set(['', STD_PROMPT_PLACEHOLDER, ...Object.values(PRESET_RECIPE_PROMPTS).flatMap(r => [r.prompt, r.negative ?? ''])]);

const preset = (id: string) => WORKFLOW_PRESETS.find(p => p.id === id)!;
const loader = (id: string) => preset(id).nodes.find(n => n.type === 'CheckpointLoaderSimple');
const lora = (id: string) => preset(id).nodes.find(n => n.type === 'LoRALoader');
const t2i = () => WORKFLOW_PRESETS.filter(p => p.category === '标准文生图');
const i2v = () => WORKFLOW_PRESETS.filter(p => p.category === '标准图生视频');

function expectedT2iId(provider: string): string {
  return provider === 'modelscope_ai' ? 'std-modelscope-ai-t2i' : `std-${provider}-t2i`;
}

describe('standard workflow presets (23 T2I + 6 I2V)', () => {
  it('exports exactly 29 presets (23 T2I + 6 I2V)', () => {
    expect(WORKFLOW_PRESETS).toHaveLength(29);
    expect(t2i()).toHaveLength(23);
    expect(i2v()).toHaveLength(6);
  });

  it('indexes huggingface T2I first for App default canvas', () => {
    expect(WORKFLOW_PRESETS[0].id).toBe('std-huggingface-t2i');
  });

  it('covers each T2I provider id exactly once', () => {
    const providers = t2i().map(p => p.provider).sort();
    expect(providers).toEqual([...EXPECTED_T2I_PROVIDERS].sort());
    expect(new Set(providers).size).toBe(23);
  });

  it('I2V providers are exactly the locked set (no modelscope/together/krea/aimlapi)', () => {
    const providers = i2v().map(p => p.provider).sort();
    expect(providers).toEqual([...EXPECTED_I2V_PROVIDERS].sort());
    for (const forbidden of ['modelscope', 'modelscope_ai', 'together', 'krea', 'aimlapi', 'tensorart']) {
      expect(i2v().some(p => p.provider === forbidden), forbidden).toBe(false);
    }
    for (const p of i2v()) {
      expect(p.id).toBe(`std-${p.provider}-i2v`);
      expect(p.category).toBe('标准图生视频');
      expect(p.tags).toEqual(expect.arrayContaining([p.provider, '标准', '图生视频']));
      expect(p.nodes.map(n => n.type)).toEqual(['LoadImage', 'AIVideoNode', 'SaveVideo']);
      expect(p.nodes.some(n => n.type === 'CLIPTextEncode')).toBe(false);
      expect(p.connections.some(c => c.toSocketId === 'positive')).toBe(false);
      const vid = p.nodes.find(n => n.type === 'AIVideoNode')!;
      expect(vid.values.targetProvider).toBe(p.provider);
      expect(typeof vid.values.model).toBe('string');
      // Canonical prompt: AIVideoNode.values.prompt only (no twin CLIP box)
      expect(vid.values.prompt).toBe(PRESET_RECIPE_PROMPTS[p.id]?.prompt ?? '');
    }
    expect(preset('std-fal-i2v').nodes.find(n => n.type === 'AIVideoNode')!.values.model).toBe(
      'fal-ai/wan/v2.7/image-to-video',
    );
    const i2vModels: Record<string, string> = {
      fal: 'fal-ai/wan/v2.7/image-to-video',
      wavespeed: 'wavespeed-ai/wan-2.2/image-to-video',
      civitai: 'wan',
      novita: 'SVD-XT',
      muapi: 'wan2.7-image-to-video',
      replicate: 'minimax/video-01',
    };
    for (const [prov, model] of Object.entries(i2vModels)) {
      const vid = preset(`std-${prov}-i2v`).nodes.find(n => n.type === 'AIVideoNode')!;
      expect(String(vid.values.model), prov).toBe(model);
      expect(String(vid.values.model).length, `${prov} non-empty`).toBeGreaterThan(0);
    }
    // Replicate minimax/video-01 Schema has no negative_prompt — do not seed empty shell.
    const rep = preset('std-replicate-i2v').nodes.find(n => n.type === 'AIVideoNode')!;
    expect(Object.prototype.hasOwnProperty.call(rep.values, 'negative_prompt')).toBe(false);
    const nov = preset('std-novita-i2v').nodes.find(n => n.type === 'AIVideoNode')!;
    expect(nov.values.num_frames).toBe(25);
    expect(nov.values.fps).toBe(6);
  });

  it('I2V seeds official duration/resolution/frames only — no empty shells, no fake 1024 WH, require_reference_image', () => {
    const expectByProv: Record<string, { duration?: number; resolution?: string; num_frames?: number; fps?: number; hide: string[] }> = {
      fal: { duration: 5, resolution: '1080p', hide: ['aspect_ratio', 'fps', 'num_frames'] },
      wavespeed: { duration: 5, resolution: '480p', hide: ['aspect_ratio', 'fps', 'num_frames'] },
      civitai: { duration: 5, resolution: '1080p', hide: ['aspect_ratio', 'fps', 'num_frames'] },
      novita: { num_frames: 25, fps: 6, hide: ['duration', 'aspect_ratio', 'resolution'] },
      muapi: { duration: 5, resolution: '720p', hide: ['aspect_ratio', 'fps', 'num_frames'] },
      replicate: { hide: ['duration', 'aspect_ratio', 'fps', 'num_frames', 'resolution'] },
    };
    for (const p of i2v()) {
      const vid = p.nodes.find(n => n.type === 'AIVideoNode')!;
      const load = p.nodes.find(n => n.type === 'LoadImage')!;
      expect(load.values.image_url ?? '', p.id).toBe('');
      expect(vid.values.require_reference_image, p.id).toBe(true);
      expect(Object.prototype.hasOwnProperty.call(vid.values, 'duration') && vid.values.duration === '', `${p.id} empty duration shell`).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(vid.values, 'fps') && vid.values.fps === '', `${p.id} empty fps shell`).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(vid.values, 'aspect_ratio') && vid.values.aspect_ratio === '', `${p.id} empty aspect shell`).toBe(false);
      const frame = p.spatialFrames![0];
      expect(frame.params.width, `${p.id} fake WH`).toBeUndefined();
      expect(frame.params.height, `${p.id} fake WH`).toBeUndefined();
      expect(frame.params.requireReferenceImage, p.id).toBe(true);
      const exp = expectByProv[p.provider];
      expect(exp, p.provider).toBeDefined();
      if (exp.duration !== undefined) expect(vid.values.duration, p.id).toBe(exp.duration);
      else expect(vid.values.duration, p.id).toBeUndefined();
      if (exp.resolution !== undefined) expect(vid.values.resolution, p.id).toBe(exp.resolution);
      else expect(vid.values.resolution, p.id).toBeUndefined();
      if (exp.num_frames !== undefined) expect(vid.values.num_frames, p.id).toBe(exp.num_frames);
      else expect(vid.values.num_frames, p.id).toBeUndefined();
      if (exp.fps !== undefined) expect(vid.values.fps, p.id).toBe(exp.fps);
      else expect(vid.values.fps, p.id).toBeUndefined();
      for (const key of exp.hide) {
        expect(vid.values[key], `${p.id} should omit ${key}`).toBeUndefined();
      }
      const custom = JSON.parse(String(vid.values.custom_parameters));
      expect(Array.isArray(custom._canvas.schemaProperties), p.id).toBe(true);
      expect(custom._canvas.schemaProperties.length, p.id).toBeGreaterThan(0);
    }
  });

  it('T2I uses std-*-t2i ids and category', () => {
    for (const p of t2i()) {
      expect(p.id).toBe(expectedT2iId(p.provider));
      expect(p.category).toBe('标准文生图');
      expect(p.tags).toEqual(expect.arrayContaining([p.provider, '标准', '文生图']));
    }
  });

  it('every preset recipe prompt cites a real recipe page URL (no hist_/doc/official-example/family sources)', () => {
    const RECIPE_PAGE = /^https:\/\/(civitai\.(com|red)\/images\/\d+|tensor\.art\/images\/\d+)$/;
    for (const [id, r] of Object.entries(PRESET_RECIPE_PROMPTS)) {
      expect(r.source, id).toMatch(RECIPE_PAGE);
      expect(r.source, id).not.toMatch(/hist_|docs\/|family|example/i);
      expect(r.prompt, id).toBeTruthy();
    }
  });

  it('presets without a recipe load with an empty prompt (never filled in)', () => {
    for (const p of WORKFLOW_PRESETS.filter(x => x.id.startsWith('std-') && !PRESET_RECIPE_PROMPTS[x.id])) {
      for (const n of p.nodes) {
        if (n.type === 'CLIPTextEncode') expect(String(n.values.text ?? ''), p.id).toBe('');
        if (n.type === 'AIVideoNode') expect(String(n.values.prompt ?? ''), p.id).toBe('');
      }
    }
  });

  it('never invents creative prompts in CLIP or spatial frames', () => {
    for (const p of WORKFLOW_PRESETS) {
      for (const n of p.nodes) {
        if (n.type === 'CLIPTextEncode' || n.type === 'CLIPTextEncodeNegative') {
          expect(ALLOWED_PROMPT.has(String(n.values.text ?? '')), `${p.id} ${n.type}`).toBe(true);
        }
        if (n.type === 'AIVideoNode') {
          expect(ALLOWED_PROMPT.has(String(n.values.prompt ?? '')), `${p.id} AIVideoNode.prompt`).toBe(true);
          expect(ALLOWED_PROMPT.has(String(n.values.negative_prompt ?? '')), `${p.id} AIVideoNode.neg`).toBe(true);
        }
      }
      for (const f of p.spatialFrames ?? []) {
        expect(ALLOWED_PROMPT.has(String(f.prompt ?? '')), `${p.id} frame.prompt`).toBe(true);
        expect(ALLOWED_PROMPT.has(String(f.negativePrompt ?? '')), `${p.id} frame.neg`).toBe(true);
      }
    }
  });

  it('presets carry real recipe LoRAs; no empty LoRA mount point', () => {
    for (const p of WORKFLOW_PRESETS) {
      const loras = p.nodes.filter(n => n.type === 'LoRALoader');
      for (const n of loras) {
        if (p.id === 'std-muapi-t2i') continue;
        expect(String(n.values.lora_name ?? '').length, `${p.id} empty LoRA shell`).toBeGreaterThan(0);
      }
      if (!HAS_LORA.has(p.provider) && p.id !== 'std-muapi-t2i') {
        expect(loras, p.id).toHaveLength(0);
      }
    }
    expect(lora('std-tensorart-t2i')).toBeDefined();
    expect(lora('std-wavespeed-t2i')).toBeDefined();
    for (const p of i2v()) {
      expect(lora(p.id)).toBeUndefined();
    }
  });

  it('OpenWorks T2I is full IMAGE chain via buildStandardT2i: with LoRA, VAEDecode IMAGE→SaveImage', () => {
    const p = preset('std-tensorart-t2i');
    expect(p.nodes.map(n => n.type)).toEqual([
      'CheckpointLoaderSimple',
      'LoRALoader',
      'LoRALoader',
      'LoRALoader',
      'CLIPTextEncode',
      'CLIPTextEncodeNegative',
      'EmptyLatentImage',
      'KSampler',
      'VAEDecode',
      'SaveImage',
    ]);
    const ckpt = loader(p.id)!;
    expect(ckpt.values.targetProvider).toBe('openworks');
    expect(ckpt.values.ckpt_name).toBe('photoreal_studio_z_image');
    // ws-sizenode: size only on the Empty Latent node; loader carries no hidden width/height.
    expect(ckpt.values.width).toBeUndefined();
    expect(ckpt.values.height).toBeUndefined();
    expect(ckpt.values.batch_size).toBe(1);
    expect(p.nodes.find(n => n.type === 'SaveImage')!.values.filename_prefix).toBe('std_openworks');
    const ks = p.nodes.find(n => n.type === 'KSampler')!;
    expect(ks.values).toMatchObject({ steps: 10, cfg: 1, seed: 42 });
    expect(ks.values.sampler_name).toBeUndefined();
    const custom = JSON.parse(String(ckpt.values.custom_parameters));
    expect(custom['result image count']).toBe(1);
    const lat = p.nodes.find(n => n.type === 'EmptyLatentImage')!;
    expect(lat.values.width).toBe(1024);
    expect(lat.values.height).toBe(1024);
    expect(lat.values.batch_size).toBe(1);
    const saveWire = p.connections.find(c => c.id === 'std-tensorart-t2i-c-vae-save');
    expect(saveWire).toMatchObject({
      fromNodeId: 'std-tensorart-t2i-vae',
      fromSocketId: 'IMAGE',
      toNodeId: 'std-tensorart-t2i-save',
      toSocketId: 'images',
      type: 'IMAGE',
    });
    expect(p.connections.some(c => c.toSocketId === 'images' && c.type === 'CONDITIONING')).toBe(false);
    const frame = p.spatialFrames![0];
    expect(frame.params.width).toBe(1024);
    expect(frame.params.height).toBe(1024);
    expect(frame.params.batchSize).toBe(1);
    expect(frame.params.loras).toHaveLength(3);
    expect(frame.prompt).toBe(PRESET_RECIPE_PROMPTS['std-tensorart-t2i'].prompt);
    const frameCp = JSON.parse(String(frame.params.customParameters));
    expect(frameCp['result image count']).toBe(1);
    // omit sampler/scheduler/denoise → shared schemaProperties seed (no empty shells); keep OpenWorks extras.
    expect(frameCp._canvas?.schemaProperties).toEqual(expect.arrayContaining(['prompt', 'seed', 'steps', 'loras']));
    expect(frameCp._canvas?.schemaProperties).not.toEqual(expect.arrayContaining(['sampler', 'scheduler', 'denoise']));
  });

  it('keeps a single Checkpoint targetProvider (tensorart → openworks)', () => {
    for (const p of t2i()) {
      if (p.provider === 'gemini') {
        expect(loader(p.id)).toBeUndefined();
        const g = p.nodes.find(n => n.type === 'GoogleImagenNode')!;
        expect(g.values.model).toBe('gemini-3.1-flash-image');
        expect(g.values.targetProvider).toBe('gemini');
        continue;
      }
      const ckpt = loader(p.id)!;
      if (p.provider === 'tensorart') {
        expect(ckpt.values.targetProvider).toBe('openworks');
        expect(ckpt.values.ckpt_name).toBe('photoreal_studio_z_image');
      } else {
        expect(ckpt.values.targetProvider).toBe(p.provider);
      }
    }
  });

  it('wires wavespeed to the accepted flux-dev-lora model (36 steps / CFG 3.5 from hist_1792224305224_meynb) and no negative', () => {
    const p = preset('std-wavespeed-t2i');
    expect(loader(p.id)!.values.ckpt_name).toBe('wavespeed-ai/flux-dev-lora');
    expect(p.nodes.map(n => n.type)).toEqual([
      'CheckpointLoaderSimple', 'LoRALoader', 'CLIPTextEncode', 'EmptyLatentImage', 'KSampler', 'VAEDecode', 'SaveImage',
    ]);
    expect(p.connections.some(c => c.toSocketId === 'negative')).toBe(false);
    const ks = p.nodes.find(n => n.type === 'KSampler')!;
    expect(ks.values).toMatchObject({ steps: 36, cfg: 3.5, seed: 42 });
    expect(ks.values.sampler_name).toBeUndefined();
    expect(ks.values.scheduler).toBeUndefined();
  });

  it('full-chain T2I: visible Chinese size node in loader column, wired to latent_image, loader holds no size', () => {
    for (const p of t2i()) {
      const lat = p.nodes.find(n => n.type === 'EmptyLatentImage');
      if (!lat) continue;
      const ckpt = loader(p.id)!;
      expect(lat.title, p.id).toBe('尺寸（空潜空间）');
      expect(ckpt.values.width, p.id).toBeUndefined();
      expect(ckpt.values.height, p.id).toBeUndefined();
      expect(lat.pos.y - ckpt.pos.y, `${p.id} gap below loader`).toBeGreaterThanOrEqual(400);
      expect(p.connections.some(c => c.fromNodeId === lat.id && c.toSocketId === 'latent_image'), p.id).toBe(true);
      expect(p.nodes.find(n => n.type === 'KSampler')!.title).toBe('采样器');
      expect(p.nodes.find(n => n.type === 'VAEDecode')!.title).toBe('VAE 解码');
      const l = lora(p.id);
      if (l) expect(l.title).toBe('加载 LoRA');
    }
  });

  it('SenseNova/Sogni stay on roster with official default models (non-empty ckpt, no empty LoRA)', () => {
    expect(WORKFLOW_PRESETS.some(p => p.id === 'std-sensenova-t2i')).toBe(true);
    expect(WORKFLOW_PRESETS.some(p => p.id === 'std-sogni-t2i')).toBe(true);
    expect(loader('std-sensenova-t2i')!.values.ckpt_name).toBe('sensenova-u1.5-lite');
    expect(loader('std-sensenova-t2i')!.values.targetProvider).toBe('sensenova');
    expect(lora('std-sensenova-t2i')).toBeUndefined();
    expect(loader('std-sogni-t2i')!.values.ckpt_name).toBe('krea-2-turbo');
    expect(loader('std-sogni-t2i')!.values.targetProvider).toBe('sogni');
    // Recipe civitai.red/images/146243000 LoRA
    expect(lora('std-sogni-t2i')!.values.lora_name).toBe('krea2-kodachrome-photo');
  });

  it('Krea standard preset ships a live official endpoint with its required aspect_ratio + resolution', () => {
    const p=preset('std-krea-t2i');
    const ckpt=loader(p.id)!;
    expect(ckpt.values).toMatchObject({ ckpt_name: 'image/krea/krea-2/medium-turbo', aspect_ratio: '1:1', resolution: '1K' });
    expect(ckpt.values.execution_blocked_reason).toBeUndefined();
    expect(p.spatialFrames![0].params.checkpoint).toBe('image/krea/krea-2/medium-turbo');
    expect(p.nodes.some(n => n.type === 'CLIPTextEncodeNegative')).toBe(false);
  });

  it('does not put foreign provider ids into T2I nodes (except tensorart→openworks)', () => {
    const foreign = EXPECTED_T2I_PROVIDERS.filter(x => x !== ('openworks' as any));
    for (const p of t2i()) {
      const allowed = new Set(
        p.provider === 'tensorart' ? ['tensorart', 'openworks'] : [p.provider],
      );
      const json = JSON.stringify(p.nodes);
      for (const other of foreign) {
        if (allowed.has(other)) continue;
        const re = new RegExp(`"${other}"`);
        expect(json.match(re) || [], `${p.id} must not contain "${other}"`).toEqual([]);
      }
    }
  });

  it('civitai uses turbo + comfy/krea2 with no LoRA node (krea2 Schema: loras unsupported)', () => {
    expect(loader('std-civitai-t2i')!.values).toMatchObject({
      ckpt_name: 'turbo',
      targetProvider: 'civitai',
      civitai_engine: 'comfy',
      civitai_ecosystem: 'krea2',
      civitai_model: 'turbo',
    });
    expect(lora('std-civitai-t2i')).toBeUndefined();
  });

  it('Civitai krea2 omits EmptyLatent pixels (Schema width/height unsupported)', () => {
    const p = preset('std-civitai-t2i');
    const lat = p.nodes.find(n => n.type === 'EmptyLatentImage')!;
    expect(lat.values.width).toBeUndefined();
    expect(lat.values.height).toBeUndefined();
    expect(p.spatialFrames?.[0]?.params?.width).toBeUndefined();
    expect(p.spatialFrames?.[0]?.params?.height).toBeUndefined();
  });

  it('ModelsLab/Civitai/Novita seed Schema-supported sampler fields into schemaProperties (no false amber omit)', () => {
    // ModelsLab: official scheduler (UniPC…); sampler unsupported → omit keeps it off the list.
    {
      const p = preset('std-modelslab-t2i');
      const ks = p.nodes.find(n => n.type === 'KSampler')!;
      expect(ks.values.scheduler).toBe('UniPCMultistepScheduler');
      expect(ks.values.sampler_name).toBeUndefined();
      const props = JSON.parse(String(loader(p.id)!.values.custom_parameters || '{}'))?._canvas?.schemaProperties as string[];
      expect(props).toEqual(expect.arrayContaining(['scheduler', 'steps', 'guidance', 'seed', 'loras']));
      expect(props).not.toEqual(expect.arrayContaining(['sampler', 'sampler_name', 'denoise']));
    }
    // Civitai krea2: providerSchema marks sampler+scheduler supported; width/height omitted.
    {
      const p = preset('std-civitai-t2i');
      const ks = p.nodes.find(n => n.type === 'KSampler')!;
      expect(ks.values.sampler_name).toBe('euler');
      expect(ks.values.scheduler).toBe('simple');
      const props = JSON.parse(String(loader(p.id)!.values.custom_parameters || '{}'))?._canvas?.schemaProperties as string[];
      expect(props).toEqual(expect.arrayContaining(['sampler', 'sampler_name', 'scheduler', 'seed', 'steps']));
      expect(props).not.toEqual(expect.arrayContaining(['denoise', 'width', 'height']));
    }
    // Novita: SdImageRequest has sampler_name; no scheduler → omit scheduler/denoise only.
    {
      const p = preset('std-novita-t2i');
      const ks = p.nodes.find(n => n.type === 'KSampler')!;
      expect(ks.values.sampler_name).toBe('Euler a'); // recipe civitai.red/images/28785255
      expect(ks.values.scheduler).toBeUndefined();
      const props = JSON.parse(String(loader(p.id)!.values.custom_parameters || '{}'))?._canvas?.schemaProperties as string[];
      expect(props).toEqual(expect.arrayContaining(['sampler', 'sampler_name', 'steps', 'guidance', 'seed']));
      expect(props).not.toEqual(expect.arrayContaining(['scheduler', 'denoise']));
    }
  });

  it('agnes image output (VAEDecode IMAGE) feeds SaveImage; no CONDITIONING→SaveImage edge', () => {
    const p = preset('std-agnes-t2i');
    const save = p.nodes.find(n => n.type === 'SaveImage')!;
    const into = p.connections.filter(c => c.toNodeId === save.id);
    expect(into).toHaveLength(1);
    expect(into[0].type).toBe('IMAGE');
    expect(p.nodes.find(n => n.id === into[0].fromNodeId)!.type).toBe('VAEDecode');
    expect(loader(p.id)!.values.ckpt_name).toBe('agnes-image-2.5-flash');
  });

  it('correctPresetLayout only adjusts vertical positions', () => {
    for (const p of WORKFLOW_PRESETS) {
      const input = {
        ...p,
        nodes: p.nodes.map(n => ({
          ...n,
          pos: { ...n.pos, y: n.type === 'CLIPTextEncodeNegative' ? 280 : n.type === 'EmptyLatentImage' ? 500 : n.pos.y },
        })),
      };
      const before = JSON.stringify(input);
      const result = correctPresetLayout(input);
      expect(JSON.stringify(input)).toBe(before);
      expect(result.connections).toBe(input.connections);
      expect(result.spatialFrames).toBe(input.spatialFrames);
      expect(result.nodes.map(n => ({ ...n, pos: { x: n.pos.x } }))).toEqual(
        input.nodes.map(n => ({ ...n, pos: { x: n.pos.x } })),
      );
    }
  });

  it('prefills only LoRAs proven in accepted runs, chained ckpt → lora1 → … → prompts/sampler', () => {
    for (const [prov, expected] of Object.entries(PREFILLED_LORA)) {
      const p = preset(expectedT2iId(prov));
      const loras = p.nodes.filter(n => n.type === 'LoRALoader');
      expect(loras.map(n => [n.values.lora_name, n.values.strength_model]), prov).toEqual(expected);
      expect(p.spatialFrames![0].params.loras.map(l => [l.name, l.modelStrength])).toEqual(expected);
      expect(p.loraNames).toEqual(expected.map(e => e[0]));
      const last = loras[loras.length - 1].id;
      expect(p.connections.some(c => c.fromNodeId === last && c.toSocketId === 'model' && c.toNodeId.endsWith('-samp'))).toBe(true);
      for (let i = 1; i < loras.length; i++) {
        expect(p.connections.some(c => c.fromNodeId === loras[i - 1].id && c.toNodeId === loras[i].id && c.type === 'MODEL')).toBe(true);
      }
    }
  });

  it('card summary matches nodes (presetSummary is the only card source)', () => {
    for (const p of WORKFLOW_PRESETS) {
      const s = presetSummary(p);
      const ckpt = p.nodes.find(n => n.type === 'CheckpointLoaderSimple');
      const gem = p.nodes.find(n => n.type === 'GoogleImagenNode');
      const vid = p.nodes.find(n => n.type === 'AIVideoNode');
      const expectedModel = String(ckpt?.values.ckpt_name ?? gem?.values.model ?? vid?.values.model ?? '');
      expect(s.model, p.id).toBe(expectedModel);
      const ks = p.nodes.find(n => n.type === 'KSampler');
      expect(s.steps, p.id).toBe(typeof ks?.values.steps === 'number' ? ks.values.steps : undefined);
      expect(s.cfg, p.id).toBe(typeof ks?.values.cfg === 'number' ? ks.values.cfg : undefined);
      expect(s.sampler, p.id).toBe(typeof ks?.values.sampler_name === 'string' ? ks.values.sampler_name : undefined);
      const lat = p.nodes.find(n => n.type === 'EmptyLatentImage');
      expect(s.width, p.id).toBe(typeof lat?.values.width === 'number' ? lat.values.width : undefined);
      expect(s.height, p.id).toBe(typeof lat?.values.height === 'number' ? lat.values.height : undefined);
      const loras = p.nodes.filter(n => n.type === 'LoRALoader');
      expect(s.loras.map(l => [l.name, l.strength]), p.id).toEqual(
        loras.map(n => [String(n.values.lora_name ?? ''), Number(n.values.strength_model)]),
      );
      // spatialFrames.params must agree with nodes when present (no parallel fork)
      const f = p.spatialFrames?.[0];
      if (f && ks) {
        if (typeof ks.values.steps === 'number') expect(f.params.steps, p.id).toBe(ks.values.steps);
        else expect(f.params.steps, p.id).toBeUndefined();
        if (typeof ks.values.cfg === 'number') expect(f.params.cfg, p.id).toBe(ks.values.cfg);
        else expect(f.params.cfg, p.id).toBeUndefined();
      }
    }
  });

  it('SaveImage filename_prefix follows targetProvider (OpenWorks → std_openworks)', () => {
    expect(preset('std-tensorart-t2i').nodes.find(n => n.type === 'SaveImage')!.values.filename_prefix).toBe('std_openworks');
    expect(preset('std-wavespeed-t2i').nodes.find(n => n.type === 'SaveImage')!.values.filename_prefix).toBe('std_wavespeed');
    expect(preset('std-gemini-t2i').nodes.find(n => n.type === 'SaveImage')!.values.filename_prefix).toBe('std_gemini');
  });


  it('OpenWorks card name matches save prefix std_openworks (not Tensor.Art / std_tensorart)', () => {
    const p = preset('std-tensorart-t2i');
    expect(p.name).toBe('OpenWorks · 标准文生图');
    expect(p.spatialFrames![0].title).toBe('OpenWorks · 标准文生图');
    expect(p.nodes.find(n => n.type === 'SaveImage')!.values.filename_prefix).toBe('std_openworks');
    expect(loader(p.id)!.values.targetProvider).toBe('openworks');
  });

  it('steps/CFG follow the preset model Schema (no shells): HF Z-Image steps only, Krea 2 none, Sogni guidance only', () => {
    const ks = (id: string) => preset(id).nodes.find(n => n.type === 'KSampler')!.values;
    expect(ks('std-huggingface-t2i').steps).toBe(12);
    expect(ks('std-huggingface-t2i').cfg).toBe(1);
    expect(ks('std-krea-t2i').steps).toBeUndefined();
    expect(ks('std-krea-t2i').cfg).toBeUndefined();
    // Sogni recipe civitai.red/images/146243000: steps 7 / cfg 1.3 copied verbatim and sent as-is.
    expect(ks('std-sogni-t2i').steps).toBe(7);
    expect(ks('std-sogni-t2i').cfg).toBe(1.3);
    expect(ks('std-sogni-t2i').seed).toBe(934059315);
  });

  it('AIMLAPI shows steps only (official schema has no guidance_scale/cfg)', () => {
    const ks = preset('std-aimlapi-t2i').nodes.find(n => n.type === 'KSampler')!;
    // Recipe civitai.red/images/113739497 values copied verbatim (cfg 1 sent as-is).
    expect(ks.values).toMatchObject({ steps: 12, cfg: 1, seed: 1840591390 });
  });

  it('MuAPI ships a visible LoRA mount point (official lora_weight default 1) and no local run lock', () => {
    const p = preset('std-muapi-t2i');
    const ckpt = p.nodes.find(n => n.type === 'CheckpointLoaderSimple')!;
    expect(ckpt.values.execution_blocked_reason).toBeUndefined();
    expect(p.pendingRecipe).toBeUndefined();
    const l = p.nodes.find(n => n.type === 'LoRALoader')!;
    expect(l.values).toMatchObject({ lora_name: 'https://huggingface.co/renderartist/coloringbookflux/resolve/main/c0l0ringb00k_Flux_v1_renderartist.safetensors', strength_model: 1 });
    expect(p.nodes.find(n => n.type === 'KSampler')!.values.seed).toBe(2100162238);
    const props = JSON.parse(String(ckpt.values.custom_parameters || '{}'))?._canvas?.schemaProperties;
    expect(props).toEqual(expect.arrayContaining(['prompt', 'lora_url', 'lora_weight', 'aspect_ratio']));
    const ks = p.nodes.find(n => n.type === 'KSampler')!;
    expect(ks.values.steps).toBeUndefined();
    expect(ks.values.cfg).toBeUndefined();
  });

  it('former empty-model T2I cards now carry a proven catalog model (no 待配置)', () => {
    const filled: Record<string, string> = {
      muapi: 'flux-1-dev-style-lora-inference',
      aimlapi: 'alibaba/z-image-turbo-lora',
      novita: 'dreamshaper_8_93211.safetensors',
      venice: 'venice-sd35',
      modelslab: 'tamarin-xl-v1',
      gemini: 'gemini-3.1-flash-image',
    };
    for (const [prov, model] of Object.entries(filled)) {
      const p = preset(prov === 'gemini' ? 'std-gemini-t2i' : `std-${prov}-t2i`);
      expect(presetSummary(p).model, prov).toBe(model);
    }
  });

  it('ModelScope CN/intl presets mount accepted LoRAs and omit sampler/scheduler shells', () => {
    for (const id of ['std-modelscope-t2i', 'std-modelscope-ai-t2i'] as const) {
      const p = preset(id);
      const ks = p.nodes.find(n => n.type === 'KSampler')!;
      const cn = id === 'std-modelscope-t2i'; // CN = recipe civitai.red/images/113739497
      expect(ks.values.steps).toBe(cn ? 12 : 8);
      expect(ks.values.cfg).toBe(1);
      expect(ks.values.seed).toBe(cn ? 1840591390 : 42);
      expect(ks.values.sampler_name).toBeUndefined();
      expect(ks.values.scheduler).toBeUndefined();
      expect(ks.values.denoise).toBeUndefined();
      const lat = p.nodes.find(n => n.type === 'EmptyLatentImage')!;
      expect([lat.values.width, lat.values.height]).toEqual(cn ? [1216, 832] : [832, 1216]);
      expect(p.nodes.some(n => n.type === 'LoRALoader')).toBe(true);
      // Shared omit → schemaProperties seed (MuAPI path): sampler aliases absent so NodeItem can hide empty shells.
      const ckpt = p.nodes.find(n => n.type === 'CheckpointLoaderSimple')!;
      const props = JSON.parse(String(ckpt.values.custom_parameters || '{}'))?._canvas?.schemaProperties as string[] | undefined;
      expect(props && props.length > 0, id).toBe(true);
      expect(props).toEqual(expect.arrayContaining(['prompt', 'seed', 'steps', 'guidance', 'loras']));
      expect(props).not.toEqual(expect.arrayContaining(['sampler', 'sampler_name', 'scheduler', 'denoise']));
    }
    expect(lora('std-modelscope-t2i')!.values.lora_name).toBe('hf/renderartist-Technically-Color-Z-Image-Turbo');
    expect(lora('std-modelscope-ai-t2i')!.values.lora_name).toBe('LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1');
  });

  it('Mage omits EmptyLatent pixel size; aspect_ratio/resolution live on checkpoint (no compact)', () => {
    const p = preset('std-mage-t2i');
    expect(p.nodes.map(n => n.type)).toEqual([
      'CheckpointLoaderSimple', 'CLIPTextEncode', 'EmptyLatentImage', 'KSampler', 'VAEDecode', 'SaveImage',
    ]);
    const ckpt = loader(p.id)!;
    expect(ckpt.values).toMatchObject({ ckpt_name: 'mango-v3', aspect_ratio: '4:5', resolution: '2K' });
    const lat = p.nodes.find(n => n.type === 'EmptyLatentImage')!;
    expect(lat.values.width).toBeUndefined();
    expect(lat.values.height).toBeUndefined();
    expect(lat.values.batch_size).toBeUndefined(); // not in Mage Schema, never sent → no shell
    const ks = p.nodes.find(n => n.type === 'KSampler')!;
    expect(ks.values.seed).toBe(42);
    expect(ks.values.steps).toBeUndefined();
    expect(ks.values.cfg).toBeUndefined();
    expect(ks.values.sampler_name).toBeUndefined();
    const frame = p.spatialFrames![0];
    expect(frame.params.width).toBeUndefined();
    expect(frame.params.height).toBeUndefined();
    expect(frame.params.aspectRatio).toBe('4:5');
    expect(frame.params.resolution).toBe('2K');
  });

  it('DeepInfra public FLUX omits seed/steps/cfg shells (official size/n path only)', () => {
    const ks = preset('std-deepinfra-t2i').nodes.find(n => n.type === 'KSampler')!;
    expect(ks.values.seed).toBeUndefined();
    expect(ks.values.steps).toBeUndefined();
    expect(ks.values.cfg).toBeUndefined();
    expect(ks.values.sampler_name).toBeUndefined();
    expect(preset('std-deepinfra-t2i').nodes.find(n => n.type === 'EmptyLatentImage')!.values.width).toBe(1024);
  });

  it('Replicate flux-dev-lora omits EmptyLatent pixels; aspect_ratio 1:1 on checkpoint', () => {
    const p = preset('std-replicate-t2i');
    const ckpt = loader(p.id)!;
    expect(ckpt.values.aspect_ratio).toBe('1:1');
    const lat = p.nodes.find(n => n.type === 'EmptyLatentImage')!;
    expect(lat.values.width).toBeUndefined();
    expect(lat.values.height).toBeUndefined();
    expect(p.spatialFrames![0].params.aspectRatio).toBe('1:1');
    expect(p.spatialFrames![0].params.width).toBeUndefined();
    expect(lora(p.id)!.values.lora_name).toBe('renderartist/coloringbookflux');
  });

  it('NanoGPT flux-schnell omits pixels; resolution 1024x1024 on checkpoint', () => {
    const p = preset('std-nanogpt-t2i');
    expect(loader(p.id)!.values.resolution).toBe('1024x1024');
    const lat = p.nodes.find(n => n.type === 'EmptyLatentImage')!;
    expect(lat.values.width).toBeUndefined();
    expect(lat.values.height).toBeUndefined();
    const ks = p.nodes.find(n => n.type === 'KSampler')!;
    expect(ks.values.seed).toBeUndefined();
    expect(ks.values.steps).toBeUndefined();
  });

  it('MuAPI omits EmptyLatent pixels; aspect_ratio 1:1 (OpenAPI default) on checkpoint', () => {
    const p = preset('std-muapi-t2i');
    expect(loader(p.id)!.values.aspect_ratio).toBe('1:1');
    const lat = p.nodes.find(n => n.type === 'EmptyLatentImage')!;
    expect(lat.values.width).toBeUndefined();
    expect(lat.values.height).toBeUndefined();
    expect(p.spatialFrames![0].params.aspectRatio).toBe('1:1');
  });

  it('Hugging Face Z-Image ships the live fal-ai route and 1024x1024 pixels', () => {
    const p = preset('std-huggingface-t2i');
    expect(loader(p.id)!.values.hf_provider).toBe('fal-ai');
    const lat = p.nodes.find(n => n.type === 'EmptyLatentImage')!;
    expect(lat.values.width).toBe(1216);
    expect(lat.values.height).toBe(832);
    expect(p.nodes.find(n => n.type === 'KSampler')!.values.steps).toBe(12);
    expect(loader(p.id)!.values.ckpt_name).toBe('renderartist/Technically-Color-Z-Image-Turbo');
  });

  it('Agnes keeps official size 2K + aspect_ratio 1:1 on checkpoint; no pixel width/height', () => {
    const ckpt = loader('std-agnes-t2i')!;
    expect(ckpt.values).toMatchObject({ size: '2K', aspect_ratio: '1:1', ckpt_name: 'agnes-image-2.5-flash' });
    const lat = preset('std-agnes-t2i').nodes.find(n => n.type === 'EmptyLatentImage')!;
    expect(lat.values.width).toBeUndefined();
    expect(lat.values.height).toBeUndefined();
    expect(lat.values.batch_size).toBeUndefined(); // Agnes sizes via size+ratio (wiki.agnes-ai.com/en/docs/agnes-image-25-flash); no shell
  });
});
