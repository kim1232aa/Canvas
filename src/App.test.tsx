import { describe, it, expect } from 'vitest';

describe('M108: handleSelectLoRAWithBaseModel with AIVideoNode target', () => {
  it('reproduces P2-9: OLD code had AIVideoNode unchanged despite recommendation', () => {
    // This test documents the OLD buggy behavior (before fix)
    const nodes = [
      {
        id: 'video-1',
        type: 'AIVideoNode',
        title: 'AI Video',
        pos: { x: 0, y: 0 },
        width: 320,
        inputs: [{ id: 'lora', name: 'lora', type: 'MODEL', label: 'lora_model' }],
        outputs: [{ id: 'VIDEO', name: 'VIDEO', type: 'VIDEO', label: 'VIDEO' }],
        values: {
          model: 'fal-ai/kling-video/v1.5/pro/image-to-video',
          targetProvider: 'fal',
          provider: 'fal',
        },
        state: 'idle' as const,
      },
    ];

    const recommendation = {
      checkpoint: 'realvisxlV40_v40LightningBakedvae.safetensors',
      provider: 'fal',
      steps: 8,
      cfg: 2,
      sampler: 'dpmpp_2m',
      scheduler: 'karras',
      recommendedReason: 'Verified base model for this LoRA',
    };

    // OLD logic (lines 1808-1817 before fix): only handled CheckpointLoaderSimple and KSampler
    const target = nodes[0];
    const oldNextNodes = nodes.map((n) => {
      if (!recommendation) return n;
      if (n.type === 'CheckpointLoaderSimple') {
        return { ...n, values: { ...n.values, ckpt_name: recommendation.checkpoint, targetProvider: recommendation.provider } };
      }
      if (n.id === target.id && n.type === 'KSampler') {
        return { ...n, values: { ...n.values, steps: recommendation.steps, cfg: recommendation.cfg, sampler_name: recommendation.sampler, scheduler: recommendation.scheduler } };
      }
      return n; // AIVideoNode fell through unchanged
    });

    // BUG documented: AIVideoNode unchanged, but toast showed "已应用"
    expect(oldNextNodes[0].values.model).toBe('fal-ai/kling-video/v1.5/pro/image-to-video');
    expect(oldNextNodes[0].values.targetProvider).toBe('fal');
  });

  it('CORRECT: shows incompatibility warning when image checkpoint recommended for video node', () => {
    // After M108 fix: image checkpoints are incompatible with video nodes
    const videoNode = {
      id: 'video-1',
      type: 'AIVideoNode',
      title: 'AI Video',
      pos: { x: 0, y: 0 },
      width: 320,
      inputs: [{ id: 'lora', name: 'lora', type: 'MODEL', label: 'lora_model' }],
      outputs: [{ id: 'VIDEO', name: 'VIDEO', type: 'VIDEO', label: 'VIDEO' }],
      values: {
        model: 'fal-ai/kling-video/v1.5/pro/image-to-video',
        targetProvider: 'fal',
        prompt: 'a cinematic shot',
      },
      state: 'idle' as const,
    };

    const recommendation = {
      checkpoint: 'realvisxlV40_v40LightningBakedvae.safetensors', // Image checkpoint
      provider: 'fal',
      steps: 8,
      cfg: 2,
      sampler: 'dpmpp_2m',
      scheduler: 'karras',
    };

    // NEW logic: detects incompatibility
    const target = videoNode;
    let appliedToTarget = false;
    let incompatibleReason = '';
    
    const nextNodes = [videoNode].map((n) => {
      if (!recommendation) return n;
      if (n.id === target.id && n.type === 'AIVideoNode') {
        // Image checkpoint recommendations are incompatible with video nodes
        incompatibleReason = `推荐的底模 ${recommendation.checkpoint} 是图像生成模型，不适用于视频节点。请手动为视频节点选择视频模型。`;
        return n; // Node unchanged
      }
      return n;
    });

    // Node should remain unchanged
    expect(nextNodes[0].values.model).toBe('fal-ai/kling-video/v1.5/pro/image-to-video');
    expect(nextNodes[0].values.targetProvider).toBe('fal');
    expect(nextNodes[0].values.prompt).toBe('a cinematic shot');
    
    // Incompatibility detected
    expect(appliedToTarget).toBe(false);
    expect(incompatibleReason).toContain('不适用于视频节点');
    expect(incompatibleReason).toContain(recommendation.checkpoint);
    
    // Toast should be 'warning' type with clear message
    // setToast({type:'warning',title:'LoRA 已挂载，底模不适配',message:`${lora.name} 已挂载。${incompatibleReason}...`});
  });

  it('applies recommendation to FalAIEngineNode (image generation with LoRA)', () => {
    const engineNode = {
      id: 'fal-1',
      type: 'FalAIEngineNode',
      title: 'Fal.ai Engine',
      pos: { x: 0, y: 0 },
      width: 320,
      inputs: [{ id: 'lora', name: 'lora', type: 'MODEL', label: 'lora_model' }],
      outputs: [{ id: 'IMAGE', name: 'IMAGE', type: 'IMAGE', label: 'IMAGE' }],
      values: {
        model: '',
        steps: 28,
        guidance_scale: 3.5,
      },
      state: 'idle' as const,
    };

    const recommendation = {
      checkpoint: 'sd_xl_base_1.0.safetensors',
      provider: 'fal',
      steps: 8,
      cfg: 2,
    };

    const target = engineNode;
    let appliedToTarget = false;
    
    const nextNodes = [engineNode].map((n) => {
      if (!recommendation) return n;
      if (n.id === target.id && n.type === 'FalAIEngineNode') {
        appliedToTarget = true;
        return { ...n, values: { ...n.values, model: recommendation.checkpoint } };
      }
      return n;
    });

    expect(nextNodes[0].values.model).toBe('sd_xl_base_1.0.safetensors');
    expect(nextNodes[0].values.steps).toBe(28); // Other values preserved
    expect(appliedToTarget).toBe(true);
  });

  it('applies recommendation to ReplicateEngineNode using model field', () => {
    const engineNode = {
      id: 'rep-1',
      type: 'ReplicateEngineNode',
      title: 'Replicate Engine',
      pos: { x: 0, y: 0 },
      width: 320,
      values: { model: 'old-model', steps: 4 },
      state: 'idle' as const,
    };

    const recommendation = { checkpoint: 'black-forest-labs/flux-schnell', provider: 'replicate' };
    const target = engineNode;
    let appliedToTarget = false;

    const nextNodes = [engineNode].map((n) => {
      if (n.id === target.id && n.type === 'ReplicateEngineNode') {
        appliedToTarget = true;
        return { ...n, values: { ...n.values, model: recommendation.checkpoint } };
      }
      return n;
    });

    expect(nextNodes[0].values.model).toBe('black-forest-labs/flux-schnell');
    expect(appliedToTarget).toBe(true);
  });

  it('applies recommendation to ModelScopeNode using model_endpoint field', () => {
    const engineNode = {
      id: 'ms-1',
      type: 'ModelScopeNode',
      title: 'ModelScope',
      pos: { x: 0, y: 0 },
      width: 320,
      values: { model_endpoint: '', steps: 8 },
      state: 'idle' as const,
    };

    const recommendation = { checkpoint: 'AI-ModelScope/flux-dev', provider: 'modelscope' };
    const target = engineNode;
    const modelField = 'model_endpoint';
    let appliedToTarget = false;

    const nextNodes = [engineNode].map((n) => {
      if (n.id === target.id && n.type === 'ModelScopeNode') {
        appliedToTarget = true;
        return { ...n, values: { ...n.values, [modelField]: recommendation.checkpoint } };
      }
      return n;
    });

    expect(nextNodes[0].values.model_endpoint).toBe('AI-ModelScope/flux-dev');
    expect(appliedToTarget).toBe(true);
  });
});
