import { describe, expect, it } from 'vitest';
import { WORKFLOW_PRESETS } from './presets';
import { extractWorkflowParameters } from '../utils/graphEngine';
import { correctPresetLayout } from './presetResources';
import { spatialRequestParameters } from '../utils/frontendParameters';

const preset = (id: string) => WORKFLOW_PRESETS.find(p => p.id === id)!;
const loader = (id: string) => preset(id).nodes.find(n => n.type === 'CheckpointLoaderSimple')!;
const lora = (id: string) => preset(id).nodes.find(n => n.type === 'LoRALoader')!;

describe('public preset resource contracts', () => {
  it.each([
    ['civitai-hinablue-armor', 'urn:air:sdxl:lycoris:civitai:536954@2446979'],
    ['civitai-hinablue-9527', 'urn:air:sdxl:lora:civitai:234556@285546'],
    ['sdxl-photorealism-tweaker', 'urn:air:sdxl:lora:civitai:122359@135867'],
    ['civitai-hinablue-136947637', 'urn:air:krea2:lora:civitai:2746042@3130750'],
    ['civitai-aiimagestudio-134923610', 'urn:air:krea2:lora:civitai:2323765@3071582'],
    ['civitai-129705858-zimage-asianmix', 'urn:air:zimageturbo:lycoris:civitai:2328130@2920318'],
  ])('%s uses the complete AIR returned by its public version API', (id, air) => {
    expect(lora(id).values.civitai_id).toBe(air);
    const frame = preset(id).spatialFrames?.[0];
    if (frame) expect(frame.params.loras[0].civitaiId).toBe(air);
  });

  it('does not attach the 2758 checkpoint as a LoRA or guess its version', () => {
    const p = preset('civitai-hinablue-2758-street');
    expect(p.nodes.some(n => n.type === 'LoRALoader')).toBe(false);
    expect(p.spatialFrames![0].params.loras).toEqual([]);
    expect(loader(p.id).values.import_unresolved_resource).toBe(true);
    expect(loader(p.id).values.ckpt_name).toBe('');
    expect(loader(p.id).values.source_model_id).toBe('705606');
    expect(p.description).toContain('待重选');
  });

  it.each(['flux-civitai-lora', 'sdxl-anime-dual-lora', 'sdxl-shinkai-skies', 'flux-retro-pixel', 'flux-analog-film', 'sdxl-chibi-3d', 'civitai-hinablue-pony-realism'])('%s keeps unknown intentions explicitly unresolved', id => {
    const p = preset(id);
    expect(p.name).toContain('未核实');
    expect(lora(id).values.import_unresolved_resource).toBe(true);
    expect(p.spatialFrames![0].params.loras[0]).toHaveProperty('unresolvedResource', true);
  });

  it('requires an explicit current Gemini model and credentials', () => {
    const p = preset('gemini-imagen-zero-config');
    expect(p.nodes.find(n => n.type === 'GoogleImagenNode')!.values.model).toBe('');
    expect(p.spatialFrames![0].params.checkpoint).toBe('');
    expect(p.name + p.description + p.tags?.join()).not.toMatch(/无需.*Key|开箱即用|免配置|免配取景/);
  });

  it('keeps the Civitai MiniMax historical LoRA template pending on its source provider', () => {
    const p = preset('civitai-arpalest-143279135');
    expect(p.nodes[0].values.targetProvider).toBe('civitai');
    expect(p.nodes[0].values.import_unresolved_resource).toBe(true);
    expect(p.spatialFrames![0].mediaType).toBe('video');
    expect(p.spatialFrames![0].params).toHaveProperty('videoProvider', 'civitai');
    expect(p.name).toContain('待配置');
    const frame = p.spatialFrames![0];
    expect(p.nodes[0].values.seed).toBe(frame.params.seed);
    expect(p.nodes[0].values.steps).toBe(frame.params.steps);
    expect(p.nodes[0].values.source_lora_air).toBe(frame.params.loras[0].civitaiId);
    expect(frame.params.seedControl).toBe('fixed');
  });

  it('preserves supported Agnes graphs and aligns the explicit 2K size', () => {
    expect(preset('agnes-flash-25-t2i').nodes).toHaveLength(3);
    expect(preset('agnes-flash-img2img').nodes).toHaveLength(4);
    for (const p of WORKFLOW_PRESETS.filter(p => p.id.startsWith('agnes-'))) {
      expect(p.spatialFrames![0].params.width).toBe(2048);
      expect(p.spatialFrames![0].params.height).toBe(2048);
    }
  });

  it('uses explicit matching Civitai engines, provider, resources and fixed historical seeds in both modes', () => {
    for (const p of WORKFLOW_PRESETS.filter(p => p.nodes.some(n => n.type === 'CheckpointLoaderSimple' && n.values.targetProvider === 'civitai'))) {
      const ckpt = loader(p.id);
      expect(ckpt.values.civitai_engine, p.id).toBeTruthy();
      for (const f of p.spatialFrames ?? []) {
        expect(f.params.checkpoint, p.id).toBe(ckpt.values.ckpt_name);
        expect(f.params.targetProvider, p.id).toBe('civitai');
        expect(f.params).toHaveProperty('civitaiEngine', ckpt.values.civitai_engine);
        expect(f.params).toHaveProperty('civitaiEcosystem', ckpt.values.civitai_ecosystem);
        const sampler = p.nodes.find(n => n.type === 'KSampler');
        if (sampler) {
          expect(f.params.seedControl).toBe('fixed');
          expect(sampler.values.control_after_generate).toBe('fixed');
          expect(f.params.steps).toBe(sampler.values.steps);
          expect(f.params.cfg).toBe(sampler.values.cfg);
          expect(f.params.sampler).toBe(sampler.values.sampler_name);
          expect(f.params.scheduler).toBe(sampler.values.scheduler);
        }
      }
    }
  });

  it.each(['civitai-hinablue-136947637', 'civitai-aiimagestudio-134923610'])('%s selects native Comfy Krea2 turbo without a filename diffusion model', id => {
    expect(loader(id).values).toMatchObject({ ckpt_name: 'turbo', targetProvider: 'civitai', civitai_engine: 'comfy', civitai_ecosystem: 'krea2', civitai_model: 'turbo' });
  });

  it('selects sdcpp ZImage turbo and preserves its API AIR namespace', () => {
    expect(loader('civitai-129705858-zimage-asianmix').values).toMatchObject({ ckpt_name: 'turbo', civitai_engine: 'sdcpp', civitai_ecosystem: 'zImage', civitai_model: 'turbo' });
  });

  it('requires a real user reference for Agnes editing instead of the preset thumbnail', () => {
    const p = preset('agnes-flash-img2img');
    expect(p.nodes.find(n => n.type === 'LoadImage')!.values.image_url).toBe('');
    expect(p.description).toContain('选择参考图');
  });

  it('exposes real Krea2 metadata instead of stale SDXL VAE claims', () => {
    for (const id of ['civitai-hinablue-136947637', 'civitai-aiimagestudio-134923610']) {
      expect(preset(id).nodes.find(n => n.type === 'VAEDecode')!.title).not.toContain('SDXL');
      expect(preset(id).otherMetadata!.vae).toBeUndefined();
      expect(preset(id).tags).not.toContain('SDXL 1.0 底模');
    }
  });

  it.each(['civitai-hinablue-9527', 'sdxl-photorealism-tweaker', 'civitai-hinablue-136947637', 'civitai-aiimagestudio-134923610'])('%s extracts the actual graph contract matching the spatial frame', id => {
    const p = preset(id);
    const extracted = extractWorkflowParameters(p.nodes, p.connections, p.nodes.find(n => n.type === 'SaveImage')!.id);
    const frame = p.spatialFrames![0];
    expect(extracted.checkpointModel).toBe(frame.params.checkpoint);
    expect(extracted.targetProvider).toBe(frame.params.targetProvider);
    expect(extracted.civitaiEngine).toBe(loader(id).values.civitai_engine);
    expect(extracted.civitaiEcosystem).toBe(loader(id).values.civitai_ecosystem);
    expect(extracted.loras[0].civitaiId).toBe(frame.params.loras[0].civitaiId);
    expect(extracted.seed).toBe(frame.params.seed);
    expect(extracted.steps).toBe(frame.params.steps);
  });

  it('leaves conservative row gaps above Chrome154 measured prompt and negative heights in every shared column', () => {
    for (const p of WORKFLOW_PRESETS) {
      const positive = p.nodes.find(n => n.type === 'CLIPTextEncode');
      const negative = p.nodes.find(n => n.type === 'CLIPTextEncodeNegative');
      const latent = p.nodes.find(n => n.type === 'EmptyLatentImage');
      if (positive && negative && positive.pos.x === negative.pos.x) {
        expect(negative.pos.y - positive.pos.y, p.id).toBeGreaterThanOrEqual(540);
        expect(negative.pos.y - positive.pos.y, p.id).toBeGreaterThan(395 + 100);
      }
      if (negative && latent && negative.pos.x === latent.pos.x) {
        expect(latent.pos.y - negative.pos.y, p.id).toBeGreaterThanOrEqual(380);
        expect(latent.pos.y - negative.pos.y, p.id).toBeGreaterThan(229 + 100);
      }
      if (positive && latent && positive.pos.x === latent.pos.x) {
        expect(latent.pos.y - positive.pos.y, p.id).toBeGreaterThanOrEqual(920);
      }
    }
  });

  it('separates Agnes LoadImage and its same-column checkpoint with a conservative reference-image gap', () => {
    const p = preset('agnes-flash-img2img');
    const image = p.nodes.find(n => n.type === 'LoadImage')!;
    expect(loader(p.id).pos.y - image.pos.y).toBeGreaterThanOrEqual(1000);
  });

  it('labels claimed source metadata and original-prompt titles as unverified history', () => {
    for (const id of ['civitai-hinablue-136947637', 'civitai-aiimagestudio-134923610', 'civitai-arpalest-143279135']) {
      const p = preset(id);
      expect(p.otherMetadata).toHaveProperty('sourceMetadataStatus', 'unverified_history');
      expect(p.nodes.map(n => n.title).join(' ')).not.toMatch(/原作|原版提示词/);
    }
  });

  it('changes only vertical node positions and never mutates the input or alters topology and parameters', () => {
    for (const p of WORKFLOW_PRESETS) {
      const input = { ...p, nodes: p.nodes.map(n => ({ ...n, pos: { ...n.pos, y: n.type === 'CLIPTextEncodeNegative' ? 280 : n.type === 'EmptyLatentImage' ? 500 : n.pos.y } })) };
      const before = JSON.stringify(input);
      const result = correctPresetLayout(input);
      expect(JSON.stringify(input)).toBe(before);
      expect(result.connections).toBe(input.connections);
      expect(result.spatialFrames).toBe(input.spatialFrames);
      expect(result.nodes.map(n => ({ ...n, pos: { x: n.pos.x } }))).toEqual(input.nodes.map(n => ({ ...n, pos: { x: n.pos.x } })));
    }
  });

  it.each(['sdxl-anime-dual-lora', 'sdxl-shinkai-skies', 'civitai-hinablue-pony-realism'])('%s cannot execute the wrong checkpoint even after removing its LoRA', id => {
    const p = preset(id);
    const nodes = p.nodes.filter(n => n.type !== 'LoRALoader');
    const adapter = lora(id);
    const connections = p.connections.filter(c => c.toNodeId !== adapter.id).map(c => c.fromNodeId === adapter.id ? { ...c, fromNodeId: loader(id).id } : c);
    expect(loader(id).values.ckpt_name).toBe('');
    expect(p.spatialFrames![0].params).toHaveProperty('unresolvedModel', true);
    expect(() => extractWorkflowParameters(nodes, connections, nodes.find(n => n.type === 'KSampler')!.id)).toThrow(/模型|底模|重选/);
  });

  it('does not downgrade an Agnes edit to text generation without a reference', () => {
    const p = preset('agnes-flash-img2img');
    expect(loader(p.id).values.require_reference_image).toBe(true);
    expect(p.spatialFrames![0].params).toHaveProperty('requireReferenceImage', true);
    expect(() => extractWorkflowParameters(p.nodes, p.connections, p.nodes.find(n => n.type === 'SaveImage')!.id)).toThrow(/参考图/);
  });

  it.each(['civitai-arpalest-143279135', 'wan21-img2video-cinematic'])('%s retains a blocking execution reason after only replacing its model', id => {
    const p = preset(id);
    const nodes = p.nodes.map(n => n.type === 'AIVideoNode' ? { ...n, values: { ...n.values, model: 'explicit-new-model', targetProvider: 'fal', import_unresolved_resource: false } } : n);
    expect(p.spatialFrames![0].params).toHaveProperty('executionBlockedReason');
    expect(() => extractWorkflowParameters(nodes, p.connections, nodes.find(n => n.type === 'AIVideoNode')!.id)).toThrow(/来源执行链|num_frames/);
  });

  it('keeps Gemini spatial seed unset and never requests randomization', () => {
    const p = preset('gemini-imagen-zero-config').spatialFrames![0].params;
    expect(p.seedControl).toBe('fixed');
    expect(p.seed).toBeUndefined();
  });

  it('keeps Wan duration intent in history instead of active duration or thumbnail input', () => {
    const p = preset('wan21-img2video-cinematic');
    const video = p.nodes.find(n => n.type === 'AIVideoNode')!;
    expect(video.values.duration).toBeUndefined();
    expect(p.spatialFrames![0].params.videoDuration).toBeUndefined();
    expect(p.nodes.find(n => n.type === 'LoadImage')!.values.image_url).toBe('');
    expect(p.spatialFrames![0].params.videoFps).toBe(video.values.fps);
    expect(p.spatialFrames![0].params.aspectRatio).toBe(video.values.aspect_ratio);
    expect(p.description).not.toMatch(/生成 5 秒 1080P/);
  });

  it.each(['sdxl-anime-dual-lora', 'sdxl-shinkai-skies', 'civitai-hinablue-pony-realism'])('%s blocks spatial generation even with LoRAs removed', id => {
    const frame = preset(id).spatialFrames![0];
    expect(() => spatialRequestParameters({ ...frame, params: { ...frame.params, loras: [] } })).toThrow(/底模.*重新选择/);
  });

  it('requires Agnes reference in the real spatial request builder', () => {
    expect(() => spatialRequestParameters(preset('agnes-flash-img2img').spatialFrames![0])).toThrow(/参考图/);
  });

  it.each(['civitai-arpalest-143279135', 'wan21-img2video-cinematic'])('%s blocks spatial requests after a model-only change', id => {
    const frame = preset(id).spatialFrames![0];
    expect(() => spatialRequestParameters({ ...frame, params: { ...frame.params, checkpoint: 'explicit-new-model', videoProvider: 'fal', loras: [] } })).toThrow(/来源执行链|num_frames/);
  });

  it('omits Gemini display dimensions and never manufactures seed after selecting a model', () => {
    const frame = preset('gemini-imagen-zero-config').spatialFrames![0];
    const result = spatialRequestParameters({ ...frame, params: { ...frame.params, checkpoint: 'explicit-image-model' } });
    expect(result.width).toBeUndefined();
    expect(result.height).toBeUndefined();
    expect(result.seed).toBeUndefined();
    expect(result.denoise).toBeUndefined();
    expect(result.extraParams?.omissions).toEqual(expect.arrayContaining([expect.objectContaining({field:'width',value:1024}),expect.objectContaining({field:'height',value:1024})]));
  });
});
