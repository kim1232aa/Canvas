import { describe, expect, it } from 'vitest';
import { WORKFLOW_PRESETS, STD_PROMPT_PLACEHOLDER, presetSummary } from './presets';
import { correctPresetLayout } from './presetResources';

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
  'sogni',
  'replicate',
  'runware',
  'modelslab',
  'gemini',
  'agnes',
  'sensenova',
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
]);

/** Real LoRAs from accepted runs (evidence: hist ids in presets.ts). */
const PREFILLED_LORA: Record<string, Array<[string, number]>> = {
  wavespeed: [['https://huggingface.co/comfyanonymous/flux_RealismLora_converted_comfyui/resolve/main/flux_realism_lora.safetensors', 1.1]],
  tensorart: [['1015214543296590260', 1], ['1029661490430387503', 1], ['1015863436619315552', 1]],
};

const ALLOWED_PROMPT = new Set(['', STD_PROMPT_PLACEHOLDER]);

const preset = (id: string) => WORKFLOW_PRESETS.find(p => p.id === id)!;
const loader = (id: string) => preset(id).nodes.find(n => n.type === 'CheckpointLoaderSimple');
const lora = (id: string) => preset(id).nodes.find(n => n.type === 'LoRALoader');
const t2i = () => WORKFLOW_PRESETS.filter(p => p.category === '标准文生图');
const i2v = () => WORKFLOW_PRESETS.filter(p => p.category === '标准图生视频');

function expectedT2iId(provider: string): string {
  return provider === 'modelscope_ai' ? 'std-modelscope-ai-t2i' : `std-${provider}-t2i`;
}

describe('standard workflow presets (21 T2I + 6 I2V)', () => {
  it('exports exactly 27 presets (21 T2I + 6 I2V)', () => {
    expect(WORKFLOW_PRESETS).toHaveLength(27);
    expect(t2i()).toHaveLength(21);
    expect(i2v()).toHaveLength(6);
  });

  it('indexes huggingface T2I first for App default canvas', () => {
    expect(WORKFLOW_PRESETS[0].id).toBe('std-huggingface-t2i');
  });

  it('covers each T2I provider id exactly once', () => {
    const providers = t2i().map(p => p.provider).sort();
    expect(providers).toEqual([...EXPECTED_T2I_PROVIDERS].sort());
    expect(new Set(providers).size).toBe(21);
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
      expect(vid.values.prompt ?? '').toBe('');
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
  });

  it('T2I uses std-*-t2i ids and category', () => {
    for (const p of t2i()) {
      expect(p.id).toBe(expectedT2iId(p.provider));
      expect(p.category).toBe('标准文生图');
      expect(p.tags).toEqual(expect.arrayContaining([p.provider, '标准', '文生图']));
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

  it('never ships an empty LoRALoader; only WaveSpeed + OpenWorks keep filled LoRAs', () => {
    for (const p of WORKFLOW_PRESETS) {
      const loras = p.nodes.filter(n => n.type === 'LoRALoader');
      for (const n of loras) {
        expect(String(n.values.lora_name ?? '').length, `${p.id} empty LoRA shell`).toBeGreaterThan(0);
      }
      if (!HAS_LORA.has(p.provider)) {
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
    expect(frame.prompt).toBe(STD_PROMPT_PLACEHOLDER);
    expect(frame.params.customParameters).toBe(JSON.stringify({ 'result image count': 1 }));
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
    // No accepted-run LoRA → no LoRALoader node (empty shell forbidden)
    expect(lora('std-sogni-t2i')).toBeUndefined();
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

  it('agnes stays compact Checkpoint→CLIP→Save with placeholder prompt', () => {
    const p = preset('std-agnes-t2i');
    expect(p.nodes.map(n => n.type)).toEqual(['CheckpointLoaderSimple', 'CLIPTextEncode', 'SaveImage']);
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
      const p = preset(`std-${prov}-t2i`);
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
    expect(ks('std-huggingface-t2i').steps).toBe(8);
    expect(ks('std-huggingface-t2i').cfg).toBeUndefined();
    expect(ks('std-krea-t2i').steps).toBeUndefined();
    expect(ks('std-krea-t2i').cfg).toBeUndefined();
    expect(ks('std-sogni-t2i').steps).toBeUndefined();
    expect(ks('std-sogni-t2i').cfg).toBe(1);
    expect(presetSummary(preset('std-sogni-t2i'))).toMatchObject({ cfg: 1, steps: undefined });
  });

  it('AIMLAPI shows steps only (official schema has no guidance_scale/cfg)', () => {
    const ks = preset('std-aimlapi-t2i').nodes.find(n => n.type === 'KSampler')!;
    expect(ks.values.steps).toBe(8);
    expect(ks.values.cfg).toBeUndefined();
    expect(presetSummary(preset('std-aimlapi-t2i')).cfg).toBeUndefined();
  });

  it('MuAPI pendingRecipe gates TopBar via execution_blocked_reason (plain copy, no API field names)', () => {
    const p = preset('std-muapi-t2i');
    expect(p.pendingRecipe).toContain('官方要真 LoRA 地址');
    expect(p.pendingRecipe).not.toMatch(/lora_url/i);
    const ckpt = p.nodes.find(n => n.type === 'CheckpointLoaderSimple')!;
    expect(ckpt.values.execution_blocked_reason).toBe(p.pendingRecipe);
    expect(p.spatialFrames?.[0]?.params.executionBlockedReason).toBe(p.pendingRecipe);
    expect(p.nodes.some(n => n.type === 'LoRALoader')).toBe(false);
  });

  it('former empty-model T2I cards now carry a proven catalog model (no 待配置)', () => {
    const filled: Record<string, string> = {
      muapi: 'flux-1-dev-style-lora-inference',
      aimlapi: 'alibaba/z-image-turbo-lora',
      novita: 'dreamshaper_8_93211.safetensors',
      venice: 'venice-sd35',
      modelslab: 'flux',
      gemini: 'gemini-3.1-flash-image',
    };
    for (const [prov, model] of Object.entries(filled)) {
      const p = preset(prov === 'gemini' ? 'std-gemini-t2i' : `std-${prov}-t2i`);
      expect(presetSummary(p).model, prov).toBe(model);
    }
  });
});
