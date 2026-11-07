import { describe, it, expect } from 'vitest';
import {
  mapSampler,
  mapScheduler,
  resolveImportedNegativePrompt,
  resolveImportedCheckpointRef,
  resolveRawImportNegativeSamplerScheduler,
  adaptCivitaiRecipeToProvider,
  civitaiSamplerSource,
  resolveImportedCheckpoint,
  withImportedLoraLoaders,
  mountableImportedLoras,
} from './civitaiImportMap';

describe('civitai import mappers (hard gates)', () => {
  it('empty negative stays empty — never fills blurry template', () => {
    const template = 'blurry, bad anatomy, deformed fingers, low resolution, poorly drawn face, plastic skin, oversaturated, text, watermark';
    expect(resolveImportedNegativePrompt(undefined, template)).toBe('');
    expect(resolveImportedNegativePrompt(null, template)).toBe('');
    expect(resolveImportedNegativePrompt('', template)).toBe('');
    expect(resolveImportedNegativePrompt('soft focus', template)).toBe('soft focus');
  });

  it('Undefined sampler does not map to euler', () => {
    expect(mapSampler('Undefined')).toBe('');
    expect(mapSampler('undefined')).toBe('');
    expect(mapSampler('')).toBe('');
    expect(mapSampler('none')).toBe('');
    expect(mapSampler('totally_unknown_xyz')).toBe('');
    expect(mapSampler('euler')).toBe('euler');
    expect(mapSampler('Euler a')).toBe('euler_a');
    expect(mapSampler('Euler a', 'comfy')).toBe('euler_ancestral');
    expect(mapSampler('Euler a', 'sdcpp')).toBe('euler_a');
    expect(mapSampler('DPM++ 2M')).toBe('dpm++2m');
    expect(mapSampler('DPM++ 2M', 'comfy')).toBe('dpmpp_2m');
    expect(mapSampler('DPM++ 2M', 'sdcpp')).toBe('dpm++2m');
    expect(mapSampler('DPM++ 2M V2', 'sdcpp')).toBe('dpm++2mv2');
    expect(mapSampler('DPM++ 2S a', 'sdcpp')).toBe('dpm++2s_a');
    expect(mapSampler('DPM2', 'sdcpp')).toBe('dpm2');
    expect(mapSampler('LCM', 'sdcpp')).toBe('lcm');
    expect(mapSampler('TCD', 'sdcpp')).toBe('tcd');
    expect(mapSampler('Heun', 'sdcpp')).toBe('heun');
    expect(mapSampler('totally_unknown_custom', 'sdcpp')).toBe('');
  });

  it('missing/unknown scheduler does not forge sgm_uniform or normal', () => {
    expect(mapScheduler('')).toBe('');
    expect(mapScheduler('Undefined')).toBe('');
    expect(mapScheduler('none')).toBe('');
    expect(mapScheduler('weird_sched')).toBe('');
    expect(mapScheduler('karras')).toBe('karras');
    expect(mapScheduler('sgm_uniform')).toBe('sgm_uniform');
    expect(mapScheduler('simple')).toBe('simple');
  });

  it('empty string survives ?? but not || — documents App.tsx fix', () => {
    // This is the exact pattern in App.tsx activeParams:
    //   sampler: ksamplerNode?.values?.sampler_name ?? activeFrame?.params?.sampler ?? 'euler'
    const importedSampler = '';  // mapSampler('Undefined') → ''
    const importedScheduler = ''; // no scheduler field → ''
    // With ?? (correct): '' ?? 'euler' === ''
    expect(importedSampler ?? 'euler').toBe('');
    expect(importedScheduler ?? 'normal').toBe('');
    // With || (old bug): '' || 'euler' === 'euler'
    expect(importedSampler || 'euler').toBe('euler');
  });
});

describe('resolveImportedCheckpointRef', () => {
  it('image 36481678: unique versionId from resources, not "Flux.1 D"', () => {
    // Real resources shape: modelType:"Checkpoint", modelId:618692, versionId:691639
    const resources = [
      { modelType: 'Checkpoint', modelName: 'FLUX', modelId: 618692, versionId: 691639, baseModel: 'Flux.1 D' },
    ];
    const meta = {
      Model: 'FLUX',
      civitaiResources: [{ type: 'checkpoint', modelVersionId: 691639 }],
    };
    const result = resolveImportedCheckpointRef(resources, meta, 'FLUX', 'Flux.1 D');
    expect(result).toBe('618692@691639');
    expect(result).not.toBe('Flux.1 D');
    expect(result).not.toBe('FLUX');
  });

  it('CHECKPOINT (uppercase) also matched', () => {
    const resources = [{ modelType: 'CHECKPOINT', modelId: 100, versionId: 200 }];
    expect(resolveImportedCheckpointRef(resources, {}, '', '')).toBe('100@200');
  });

  it('prefers air when present', () => {
    const resources = [{ modelType: 'Checkpoint', air: 'urn:air:flux1:checkpoint:civitai:618692@691639', modelId: 618692, versionId: 691639 }];
    expect(resolveImportedCheckpointRef(resources, {}, '', '')).toBe('urn:air:flux1:checkpoint:civitai:618692@691639');
  });

  it('falls back to meta.civitaiResources modelVersionId when no resources array', () => {
    const meta = { civitaiResources: [{ type: 'Checkpoint', modelVersionId: 691639 }] };
    expect(resolveImportedCheckpointRef(null, meta, 'FLUX', 'Flux.1 D')).toBe('691639');
  });

  it('ambiguous name preserved when no ids available', () => {
    const resources = [{ modelType: 'Checkpoint', modelName: 'FLUX' }];
    const meta = { Model: 'FLUX' };
    // No modelId, no versionId, no air, no civitaiResources
    const result = resolveImportedCheckpointRef(resources, meta, 'FLUX', 'Flux.1 D');
    // Falls through to meta.Model
    expect(result).toBe('FLUX');
  });

  it('no resources at all → fallbackName or baseModel', () => {
    expect(resolveImportedCheckpointRef(null, {}, '', 'Flux.1 D')).toBe('Flux.1 D');
    expect(resolveImportedCheckpointRef([], {}, 'MyModel', '')).toBe('MyModel');
    expect(resolveImportedCheckpointRef([], {}, '', '')).toBe('');
  });
});

describe('resolveRawImportNegativeSamplerScheduler (plain-text import)', () => {
  const template = 'blurry, bad anatomy, deformed fingers, low resolution, poorly drawn face, plastic skin, oversaturated, text, watermark';

  it('blank / missing negative stays empty — never the blurry template', () => {
    const noNeg = 'masterpiece, 1girl\nSteps: 20, CFG scale: 7, Seed: 1, Size: 512x512';
    expect(resolveRawImportNegativeSamplerScheduler(noNeg).negativePrompt).toBe('');
    expect(resolveRawImportNegativeSamplerScheduler(noNeg).negativePrompt).not.toContain('blurry');

    const blankNeg = 'masterpiece, 1girl\nNegative prompt:\nSteps: 20, Sampler: Euler, CFG scale: 7';
    expect(resolveRawImportNegativeSamplerScheduler(blankNeg).negativePrompt).toBe('');
    expect(resolveRawImportNegativeSamplerScheduler(blankNeg).negativePrompt).not.toBe(template);
  });

  it('real non-empty source negative is kept as written', () => {
    const text = 'a cat\nNegative prompt: soft focus, low contrast\nSteps: 20, Sampler: Euler';
    expect(resolveRawImportNegativeSamplerScheduler(text).negativePrompt).toBe('soft focus, low contrast');
  });

  it('missing sampler stays empty — no er_sde_simple / euler / sgm_uniform forge', () => {
    const text = 'a dog\nNegative prompt:\nSteps: 28, CFG scale: 5, Seed: 42, Size: 1024x1024';
    const r = resolveRawImportNegativeSamplerScheduler(text);
    expect(r.sampler).toBe('');
    expect(r.scheduler).toBe('');
    expect(r.sampler).not.toBe('er_sde_simple');
    expect(r.sampler).not.toBe('euler');
    expect(r.scheduler).not.toBe('sgm_uniform');
    expect(r.scheduler).not.toBe('karras');
  });

  it('explicit Euler stays Euler; does not invent scheduler from sampler name', () => {
    const text = 'portrait\nNegative prompt: bad hands\nSteps: 20, Sampler: Euler, CFG scale: 7';
    const r = resolveRawImportNegativeSamplerScheduler(text);
    expect(r.sampler).toBe('euler');
    expect(r.scheduler).toBe(''); // no explicit Schedule/Scheduler field
    expect(r.negativePrompt).toBe('bad hands');
  });

  it('explicit Schedule type is mapped; Unknown/Undefined stay empty', () => {
    const withKarras = 'x\nSteps: 20, Sampler: DPM++ 2M, Schedule type: Karras, CFG scale: 7';
    expect(resolveRawImportNegativeSamplerScheduler(withKarras).sampler).toBe('dpm++2m');
    expect(resolveRawImportNegativeSamplerScheduler(withKarras).scheduler).toBe('karras');

    const undefinedSched = 'x\nSteps: 20, Sampler: Undefined, Schedule type: Undefined';
    const u = resolveRawImportNegativeSamplerScheduler(undefinedSched);
    expect(u.sampler).toBe('');
    expect(u.scheduler).toBe('');

    // Karras embedded in sampler name must NOT become scheduler
    const embedded = 'x\nSteps: 20, Sampler: DPM++ 2M Karras, CFG scale: 7';
    const e = resolveRawImportNegativeSamplerScheduler(embedded);
    expect(e.sampler).toBe('dpm++2m');
    expect(e.scheduler).toBe('');
  });

  it('image-import empty negative still empty (resolveImportedNegativePrompt unchanged)', () => {
    const template = 'blurry, bad quality';
    expect(resolveImportedNegativePrompt(undefined, template)).toBe('');
    expect(resolveImportedNegativePrompt('', template)).toBe('');
    expect(resolveImportedNegativePrompt(null, template)).toBe('');
  });

  describe('P1-2: LoRA adaptation truthfulness and downloadUrl resolution', () => {
    it('marks LoRA with unresolvedReason as unsupported and carries verbatim error', () => {
      const result = adaptCivitaiRecipeToProvider(
        {
          baseModel: 'Flux.1 D',
          loras: [
            {
              name: 'FailedLoRA',
              versionId: 404040,
              strength: 0.8,
              unresolvedReason: '版本 #404040 上游解析失败: [404] Civitai model-version 上游响应 HTTP 404 - {"error":"Model version 404040 not found"}',
            },
          ],
        },
        'civitai'
      );

      const lora = result.loras[0];
      expect(lora.status).toBe('unsupported');
      expect(lora.canGenerate).toBeUndefined();
      expect(lora.unresolvedReason).toContain('Model version 404040 not found');
      expect(lora.reason).toContain('Model version 404040 not found');
      expect(lora.reason).not.toContain('Civitai 官方未启用在线生成');
      expect(lora.sendableUrlOrId).toBeUndefined();
    });

    it('for fal provider, does NOT invent https://civitai.com/api/download/models/${versionId} when downloadUrl is missing', () => {
      const result = adaptCivitaiRecipeToProvider(
        {
          baseModel: 'Flux.1 D',
          loras: [
            {
              name: 'MissingUrlLoRA',
              versionId: 404040,
              strength: 0.8,
              // downloadUrl is omitted/missing!
            },
          ],
        },
        'fal',
        {
          targetSchema: {
            loras: {
              items: {
                properties: { path: { type: 'string' }, scale: { type: 'number' } },
              },
            },
          },
        }
      );

      const lora = result.loras[0];
      expect(lora.status).toBe('requires_reselection');
      expect(lora.sendableUrlOrId).toBeUndefined();
      expect(lora.reason).toContain('缺少官方真实下载链接');
      expect(lora.reason).not.toContain('https://civitai.com/api/download/models/404040');
    });
  });

  describe('Civitai sampler source follows the recipe ecosystem', () => {
    it('cites the SDXL recipe only for SD1.5 and SDXL', () => {
      expect(civitaiSamplerSource('sdxl')).toBe('https://developer.civitai.com/orchestration/recipes/sdxl.md');
      expect(civitaiSamplerSource('sd15')).toBe('https://developer.civitai.com/orchestration/recipes/sdxl.md');
      expect(civitaiSamplerSource('flux1')).toBe('https://developer.civitai.com/orchestration/schemas/imageGen.yaml');
    });

    it('does not attach the SDXL recipe URL to a Flux adaptation', () => {
      const flux = adaptCivitaiRecipeToProvider({ baseModel: 'Flux.1 D', sampler: 'Euler', scheduler: 'simple' }, 'civitai');
      expect(flux.fields.sampler.source).toBe('https://developer.civitai.com/orchestration/schemas/imageGen.yaml');
      expect(flux.fields.scheduler.source).toBe('https://developer.civitai.com/orchestration/schemas/imageGen.yaml');
      const sdxl = adaptCivitaiRecipeToProvider({ baseModel: 'SDXL 1.0', sampler: 'Euler' }, 'civitai');
      expect(sdxl.fields.sampler.source).toBe('https://developer.civitai.com/orchestration/recipes/sdxl.md');
      expect(sdxl.fields.scheduler.source).toBe('https://developer.civitai.com/orchestration/recipes/sdxl.md');
    });
  });
});

/**
 * Image 148140013, read live from GET https://civitai.com/api/v1/images?imageId=148140013&withMeta=true
 * on 2026-11-07. meta.meta lists 832x1248, 8 steps, cfgScale 1, sampler euler, seed 689794262 and five
 * civitaiResources. Each model-versions/{id} response supplied the AIR below; strengths are the recipe
 * weights, not defaults. ComfyKrea2TurboImageGenInput (imageGen OpenAPI) defaults scheduler to `simple`.
 */
const IMAGE_148140013 = {
  air: 'urn:air:krea2:diffusionmodel:civitai:2732656@3072332',
  prompt: 'masterpiece, best quality, very aesthetic, ektachrome fade film, nature',
  negative: '(2d ,Illustration, drawing, cartoon, animation, anima, painting:1.4)',
  loras: [
    { name: 'Mrpopo Anime/Art', air: 'urn:air:krea2:lora:civitai:2744585@3168308', strength: 1, baseModel: 'Krea 2 Turbo' },
    { name: 'Masterpiece', air: 'urn:air:krea2:lora:civitai:929497@3077110', strength: 0.85, baseModel: 'Krea 2' },
  ],
};

describe('image 148140013 import graph', () => {
  const recipePreset = () => ({
    name: 'Civitai 作品 #148140013：Hairpin 原作逆向工作流',
    prompt: IMAGE_148140013.prompt,
    negativePrompt: IMAGE_148140013.negative,
    nodes: [
      { id: 'node-imp-1', type: 'CheckpointLoaderSimple', pos: { x: 60, y: 120 }, values: { ckpt_name: IMAGE_148140013.air, targetProvider: 'civitai', base_model: 'Krea 2 Turbo', civitai_engine: 'comfy', civitai_ecosystem: 'krea2', civitai_model: 'turbo', import_source_model: IMAGE_148140013.air } },
      { id: 'node-imp-3', type: 'CLIPTextEncode', values: { text: IMAGE_148140013.prompt } },
      { id: 'node-imp-4', type: 'CLIPTextEncodeNegative', values: { text: IMAGE_148140013.negative } },
      { id: 'node-imp-5', type: 'EmptyLatentImage', values: { width: 832, height: 1248, batch_size: 1 } },
      { id: 'node-imp-6', type: 'KSampler', values: { seed: 689794262, steps: 8, cfg: 1, sampler_name: 'euler', scheduler: 'simple', control_after_generate: 'fixed' } },
    ],
    connections: [
      { id: 'clip-pos', fromNodeId: 'node-imp-1', fromSocketId: 'CLIP', toNodeId: 'node-imp-3', toSocketId: 'clip', type: 'CLIP' },
      { id: 'clip-neg', fromNodeId: 'node-imp-1', fromSocketId: 'CLIP', toNodeId: 'node-imp-4', toSocketId: 'clip', type: 'CLIP' },
      { id: 'model-ks', fromNodeId: 'node-imp-1', fromSocketId: 'MODEL', toNodeId: 'node-imp-6', toSocketId: 'model', type: 'MODEL' },
    ],
    otherMetadata: { resources: IMAGE_148140013.loras, width: 832, height: 1248, steps: 8, cfgScale: 1, sampler: 'euler', scheduler: 'simple', seed: 689794262 },
  });

  it('yields the checkpoint AIR, two LoRA nodes with real strengths, and 832x1248 / 8 / cfg 1 / euler / simple', () => {
    const graph = withImportedLoraLoaders(recipePreset());
    const ckpt = graph.nodes.find((n) => n.type === 'CheckpointLoaderSimple');
    expect(ckpt.values.ckpt_name).toBe(IMAGE_148140013.air);
    expect(ckpt.values.ckpt_name).not.toBe('turbo');
    expect(ckpt.values.import_unresolved_checkpoint).toBe(false);

    const loraNodes = graph.nodes.filter((n) => n.type === 'LoRALoader');
    expect(loraNodes).toHaveLength(2);
    expect(loraNodes.map((n) => n.values.lora_name)).toEqual(IMAGE_148140013.loras.map((l) => l.air));
    expect(loraNodes.map((n) => n.values.strength_model)).toEqual([1, 0.85]);
    expect(loraNodes.every((n) => n.values.strength_model !== 0 && n.values.strength_clip !== 0)).toBe(true);
    expect(loraNodes.every((n) => String(n.values.lora_name).trim() !== '')).toBe(true);

    // Checkpoint MODEL/CLIP feed the first LoRA; the last LoRA feeds the sampler and both prompts.
    expect(graph.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromNodeId: 'node-imp-1', fromSocketId: 'MODEL', toNodeId: 'node-imp-lora-1', toSocketId: 'model', type: 'MODEL' }),
      expect.objectContaining({ fromNodeId: 'node-imp-1', fromSocketId: 'CLIP', toNodeId: 'node-imp-lora-1', toSocketId: 'clip', type: 'CLIP' }),
      expect.objectContaining({ fromNodeId: 'node-imp-lora-1', fromSocketId: 'MODEL', toNodeId: 'node-imp-lora-2', toSocketId: 'model' }),
      expect.objectContaining({ fromNodeId: 'node-imp-lora-2', fromSocketId: 'MODEL', toNodeId: 'node-imp-6', toSocketId: 'model', type: 'MODEL' }),
      expect.objectContaining({ fromNodeId: 'node-imp-lora-2', fromSocketId: 'CLIP', toNodeId: 'node-imp-3', toSocketId: 'clip', type: 'CLIP' }),
      expect.objectContaining({ fromNodeId: 'node-imp-lora-2', fromSocketId: 'CLIP', toNodeId: 'node-imp-4', toSocketId: 'clip', type: 'CLIP' }),
    ]));
    expect(graph.connections.some((c) => c.fromNodeId === 'node-imp-1' && c.toNodeId === 'node-imp-6')).toBe(false);

    const sampler = graph.nodes.find((n) => n.type === 'KSampler').values;
    const latent = graph.nodes.find((n) => n.type === 'EmptyLatentImage').values;
    expect(latent).toMatchObject({ width: 832, height: 1248 });
    expect(sampler).toMatchObject({ steps: 8, cfg: 1, sampler_name: 'euler', scheduler: 'simple', seed: 689794262 });
    const serialized = JSON.stringify(graph);
    expect(serialized).not.toMatch(/""\s*:/);
    for (const node of graph.nodes) {
      for (const value of Object.values(node.values)) expect(value).not.toBe('');
    }
  });

  it('does not create a LoRA node for a missing or zero strength', () => {
    expect(mountableImportedLoras([
      { name: 'no-weight', air: 'urn:air:krea2:lora:civitai:1@2', strength: null },
      { name: 'zero', air: 'urn:air:krea2:lora:civitai:3@4', strength: 0 },
      { name: '', strength: 0.5 },
    ])).toEqual([]);
  });
});

describe('unresolved checkpoint metadata', () => {
  it('keeps the original name and never writes turbo into ckpt_name', () => {
    const resolved = resolveImportedCheckpoint({ checkpoint: 'turbo', sourceModel: 'turbo', baseModel: 'Krea 2 Turbo', targetProvider: 'civitai' });
    expect(resolved.unresolved).toBe(true);
    expect(resolved.ckptName).toBe('');
    expect(resolved.originalName).toBe('turbo');
    expect(resolved.reason).toContain('turbo');

    const graph = withImportedLoraLoaders({
      nodes: [{ id: 'ck', type: 'CheckpointLoaderSimple', pos: { x: 0, y: 0 }, values: { ckpt_name: 'turbo', import_source_model: 'turbo', targetProvider: 'civitai', base_model: 'Krea 2 Turbo' } }],
      connections: [],
      otherMetadata: { resources: IMAGE_148140013.loras },
    });
    const ckpt = graph.nodes.find((n) => n.type === 'CheckpointLoaderSimple');
    expect(ckpt.values.ckpt_name).toBe('');
    expect(ckpt.values.ckpt_name).not.toBe('turbo');
    expect(ckpt.values.import_unresolved_checkpoint).toBe(true);
    expect(ckpt.values.import_source_model).toBe('turbo');
    expect(ckpt.values.import_unresolved_reason).toContain('turbo');
    expect(graph.nodes.some((n) => n.type === 'LoRALoader')).toBe(false);
  });

  it('keeps a provider model id the caller already chose, and does not guess one when none was chosen', () => {
    const chosen = resolveImportedCheckpoint({
      checkpoint: 'fal-ai/flux-lora',
      sourceModel: IMAGE_148140013.air,
      targetProvider: 'fal',
    });
    expect(chosen).toMatchObject({ ckptName: 'fal-ai/flux-lora', unresolved: false });

    const missing = resolveImportedCheckpoint({
      checkpoint: '',
      sourceModel: IMAGE_148140013.air,
      targetProvider: 'fal',
    });
    expect(missing.unresolved).toBe(true);
    expect(missing.ckptName).toBe('');
    expect(missing.originalName).toBe(IMAGE_148140013.air);
  });
});
