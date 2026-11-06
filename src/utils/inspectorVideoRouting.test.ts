import { describe, it, expect } from 'vitest';
import { readInspectorParameters, patchInspectorNode } from './inspectorParameters';
import { extractWorkflowParameters } from './graphEngine';
import type { NodeInstance, Connection, ComfyParameters } from '../types/graph';

describe('inspectorVideoRouting: CheckpointLoaderSimple videoProvider persistence and workflow extraction', () => {
  const ckptNode: NodeInstance = {
    id: 'ckpt-1',
    type: 'CheckpointLoaderSimple',
    title: 'Checkpoint',
    pos: { x: 0, y: 0 },
    inputs: [],
    outputs: [
      { id: 'MODEL', name: 'MODEL', type: 'MODEL', label: 'MODEL' },
      { id: 'CLIP', name: 'CLIP', type: 'CLIP', label: 'CLIP' },
    ],
    values: {
      ckpt_name: 'fal-ai/wan-t2v',
      targetProvider: 'video',
      video_provider: 'civitai',
      duration: 5,
    },
  };

  const clipNode: NodeInstance = {
    id: 'clip-1',
    type: 'CLIPTextEncode',
    title: 'CLIP Text',
    pos: { x: 100, y: 0 },
    inputs: [{ id: 'clip', name: 'clip', type: 'CLIP', label: 'CLIP' }],
    outputs: [{ id: 'CONDITIONING', name: 'CONDITIONING', type: 'CONDITIONING', label: 'CONDITIONING' }],
    values: { text: 'a cinematic video of waves crashing' },
  };

  const ksamplerNode: NodeInstance = {
    id: 'ks-1',
    type: 'KSampler',
    title: 'KSampler',
    pos: { x: 200, y: 0 },
    inputs: [
      { id: 'model', name: 'model', type: 'MODEL', label: 'model' },
      { id: 'positive', name: 'positive', type: 'CONDITIONING', label: 'positive' },
      { id: 'negative', name: 'negative', type: 'CONDITIONING', label: 'negative' },
      { id: 'latent_image', name: 'latent_image', type: 'LATENT', label: 'latent_image' },
    ],
    outputs: [{ id: 'LATENT', name: 'LATENT', type: 'LATENT', label: 'LATENT' }],
    values: { seed: 42, steps: 20, cfg: 7 },
  };

  const saveVideoNode: NodeInstance = {
    id: 'save-video-1',
    type: 'SaveVideo',
    title: 'Save Video',
    pos: { x: 400, y: 0 },
    inputs: [{ id: 'video', name: 'video', type: 'VIDEO', label: 'video' }],
    outputs: [],
    values: {},
  };

  const saveImageNode: NodeInstance = {
    id: 'save-img-1',
    type: 'SaveImage',
    title: 'Save Image',
    pos: { x: 400, y: 0 },
    inputs: [{ id: 'images', name: 'images', type: 'IMAGE', label: 'images' }],
    outputs: [],
    values: {},
  };

  const connections: Connection[] = [
    { id: 'c1', fromNodeId: 'ckpt-1', fromSocketId: 'MODEL', toNodeId: 'ks-1', toSocketId: 'model', type: 'MODEL' },
    { id: 'c2', fromNodeId: 'ckpt-1', fromSocketId: 'CLIP', toNodeId: 'clip-1', toSocketId: 'clip', type: 'CLIP' },
    { id: 'c3', fromNodeId: 'clip-1', fromSocketId: 'CONDITIONING', toNodeId: 'ks-1', toSocketId: 'positive', type: 'CONDITIONING' },
  ];

  it('readInspectorParameters reads videoProvider and duration from CheckpointLoaderSimple when targetProvider is video', () => {
    const params = readInspectorParameters([ckptNode, ksamplerNode], connections, 'ks-1');
    expect(params.targetProvider).toBe('video');
    expect(params.videoProvider).toBe('civitai');
    expect(params.videoDuration).toBe(5);
  });

  it('patchInspectorNode persists videoProvider and duration onto CheckpointLoaderSimple', () => {
    const before: ComfyParameters = {
      checkpoint: 'fal-ai/wan-t2v',
      targetProvider: 'video',
      videoProvider: 'fal',
      videoDuration: 5,
    } as any;
    const after: ComfyParameters = {
      ...before,
      videoProvider: 'civitai',
      videoDuration: 10,
    };

    const patched = patchInspectorNode(ckptNode, before, after);
    expect(patched.values.video_provider).toBe('civitai');
    expect(patched.values.duration).toBe(10);
  });

  it('preserves existing AIVideoNode videoProvider reading without regression', () => {
    const aiVideoNode: NodeInstance = {
      id: 'video-node-1',
      type: 'AIVideoNode',
      title: 'AI Video',
      pos: { x: 0, y: 0 },
      inputs: [],
      outputs: [{ id: 'VIDEO', name: 'VIDEO', type: 'VIDEO', label: 'VIDEO' }],
      values: {
        model: 'fal-ai/wan-t2v',
        targetProvider: 'fal',
        duration: 8,
      },
    };
    const params = readInspectorParameters([aiVideoNode], [], 'video-node-1');
    expect(params.videoProvider).toBe('fal');
    expect(params.videoDuration).toBe(8);
  });

  it('extractWorkflowParameters extracts isVideo: true and videoProvider from CheckpointLoaderSimple when targetProvider is video and SaveVideo is connected', () => {
    const videoConns: Connection[] = [
      ...connections,
      { id: 'c4', fromNodeId: 'ks-1', fromSocketId: 'LATENT', toNodeId: 'save-video-1', toSocketId: 'video', type: 'LATENT' },
    ];
    const nodes = [ckptNode, clipNode, ksamplerNode, saveVideoNode];

    const extracted = extractWorkflowParameters(nodes, videoConns, 'save-video-1');
    expect(extracted.isVideo).toBe(true);
    expect(extracted.targetProvider).toBe('video');
    expect(extracted.videoProvider).toBe('civitai');
    expect(extracted.videoDuration).toBe(5);
  });

  it('extractWorkflowParameters extracts isVideo: true and videoProvider on standard SaveImage branch without artificial gate', () => {
    const imgConns: Connection[] = [
      ...connections,
      { id: 'c4', fromNodeId: 'ks-1', fromSocketId: 'LATENT', toNodeId: 'save-img-1', toSocketId: 'images', type: 'LATENT' },
    ];
    const nodes = [ckptNode, clipNode, ksamplerNode, saveImageNode];

    const extracted = extractWorkflowParameters(nodes, imgConns, 'save-img-1');
    expect(extracted.isVideo).toBe(true);
    expect(extracted.targetProvider).toBe('video');
    expect(extracted.videoProvider).toBe('civitai');
    expect(extracted.videoDuration).toBe(5);
  });

  it('extracts Civitai video engine/version/operation from CheckpointLoaderSimple into videoSelectors', () => {
    const civitaiCkpt: NodeInstance = {
      ...ckptNode,
      values: {
        ...ckptNode.values,
        prompt: 'waves',
        civitai_engine: 'wan',
        civitai_version: 'v2.1',
        civitai_backend: 'civitai',
        civitai_operation: 'createVideo',
        video_selectors: { engine: 'wan', version: 'v2.1', provider: 'civitai', operation: 'createVideo' },
      },
    };
    const extracted = extractWorkflowParameters(
      [civitaiCkpt, clipNode, ksamplerNode, saveImageNode],
      [...connections, { id: 'c4', fromNodeId: 'ks-1', fromSocketId: 'LATENT', toNodeId: 'save-img-1', toSocketId: 'images', type: 'LATENT' }],
      'save-img-1',
    );
    expect(extracted.isVideo).toBe(true);
    expect(extracted.videoProvider).toBe('civitai');
    expect(extracted.videoSelectors).toEqual({ engine: 'wan', version: 'v2.1', provider: 'civitai', operation: 'createVideo' });
    expect(extracted.civitaiEngine).toBe('wan');
  });

  it('throws when targetProvider is video but videoProvider is unset', () => {
    const unselectedCkpt: NodeInstance = {
      ...ckptNode,
      values: {
        ...ckptNode.values,
        video_provider: undefined,
        videoProvider: undefined,
      },
    };
    const nodes = [unselectedCkpt, clipNode, ksamplerNode, saveImageNode];
    const imgConns: Connection[] = [
      ...connections,
      { id: 'c4', fromNodeId: 'ks-1', fromSocketId: 'LATENT', toNodeId: 'save-img-1', toSocketId: 'images', type: 'LATENT' },
    ];

    expect(() => extractWorkflowParameters(nodes, imgConns, 'save-img-1')).toThrowError(
      '视频服务商 (Provider) 未设置：请先选择实际视频服务商。不会回退到 Fal。'
    );
  });
});
