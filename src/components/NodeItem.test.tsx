import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { NodeItem } from './NodeItem';
import { NodeInstance } from '../types/graph';
import { NODE_DEFINITIONS } from '../constants/nodes';

function makeVideoNode(
  title: string,
  targetProvider = 'fal',
  titleSource?: 'template' | 'user'
): NodeInstance {
  const def = NODE_DEFINITIONS.AIVideoNode;
  return {
    id: 'test-vid-node',
    type: 'AIVideoNode',
    title,
    titleSource,
    pos: { x: 0, y: 0 },
    width: 320,
    inputs: def.inputs,
    outputs: def.outputs,
    values: {
      targetProvider,
      model: 'test-model',
    },
    state: 'idle',
  };
}

function makeCheckpointNode(
  title: string,
  targetProvider = 'huggingface',
  ckpt_name = '',
  titleSource?: 'template' | 'user'
): NodeInstance {
  const def = NODE_DEFINITIONS.CheckpointLoaderSimple;
  return {
    id: 'test-ckpt-node',
    type: 'CheckpointLoaderSimple',
    title,
    titleSource,
    pos: { x: 0, y: 0 },
    width: 300,
    inputs: def.inputs,
    outputs: def.outputs,
    values: {
      targetProvider,
      ckpt_name,
    },
    state: 'idle',
  };
}

function renderNode(node: NodeInstance) {
  return renderToStaticMarkup(
    <NodeItem
      node={node}
      isSelected={false}
      zoom={1}
      onSelect={vi.fn()}
      onStartDrag={vi.fn()}
      onUpdateValue={vi.fn()}
      onDeleteNode={vi.fn()}
      onToggleCollapse={vi.fn()}
      onToggleBypass={vi.fn()}
      onStartConnecting={vi.fn()}
      onEndConnecting={vi.fn()}
    />
  );
}

describe('NodeItem dynamic title & custom title preservation', () => {
  it('template AIVideoNode header displays Sogni when targetProvider is sogni (titleSource: "template")', () => {
    const node = makeVideoNode('AI 视频 (Fal.ai)', 'sogni', 'template');
    const html = renderNode(node);
    expect(html).toContain('AI 视频 (Sogni)');
    expect(html).not.toContain('AI 视频 (Fal.ai)');
  });

  it('template AIVideoNode header displays WaveSpeed when targetProvider is wavespeed', () => {
    const node = makeVideoNode('AI 视频 (Fal.ai)', 'wavespeed', 'template');
    const html = renderNode(node);
    expect(html).toContain('AI 视频 (WaveSpeed)');
    expect(html).not.toContain('AI 视频 (Fal.ai)');
  });

  it('P1-2: AIVideoNode preserves reviewer lookalike "AI 视频 (Fal)" when titleSource is not template', () => {
    const node = makeVideoNode('AI 视频 (Fal)', 'sogni', undefined);
    const html = renderNode(node);
    expect(html).toContain('AI 视频 (Fal)');
    expect(html).not.toContain('AI 视频 (Sogni)');
  });

  it('P1-2: AIVideoNode preserves reviewer base title "AI 视频" when titleSource is not template', () => {
    const node = makeVideoNode('AI 视频', 'krea', undefined);
    const html = renderNode(node);
    expect(html).toContain('AI 视频');
    expect(html).not.toContain('AI 视频 (Krea)');
  });

  it('AIVideoNode preserves user-customized title upon provider switch', () => {
    const node = makeVideoNode('我的专属视频生成器', 'sogni', undefined);
    const html = renderNode(node);
    expect(html).toContain('我的专属视频生成器');
    expect(html).not.toContain('AI 视频 (Sogni)');
  });

  it('template CheckpointLoaderSimple displays Sogni when targetProvider is sogni', () => {
    const node = makeCheckpointNode('加载底模 (Hugging Face)', 'sogni', '', 'template');
    const html = renderNode(node);
    expect(html).toContain('加载底模 (Sogni)');
    expect(html).not.toContain('加载底模 (Hugging Face)');
  });

  it('P1-1: CheckpointLoaderSimple preserves reviewer lookalike "加载底模 (v2)" when titleSource is not template', () => {
    const node = makeCheckpointNode('加载底模 (v2)', 'sogni', '', undefined);
    const html = renderNode(node);
    expect(html).toContain('加载底模 (v2)');
    expect(html).not.toContain('加载底模 (Sogni)');
  });

  it('P1-1: CheckpointLoaderSimple preserves reviewer lookalike "加载底模 (my-model)" when titleSource is not template', () => {
    const node = makeCheckpointNode('加载底模 (my-model)', 'sogni', '', undefined);
    const html = renderNode(node);
    expect(html).toContain('加载底模 (my-model)');
    expect(html).not.toContain('加载底模 (Sogni)');
  });

  it('P1-1: CheckpointLoaderSimple preserves reviewer lookalike "Load Checkpoint (v2)" when titleSource is not template', () => {
    const node = makeCheckpointNode('Load Checkpoint (v2)', 'sogni', '', undefined);
    const html = renderNode(node);
    expect(html).toContain('Load Checkpoint (v2)');
    expect(html).not.toContain('加载底模 (Sogni)');
  });

  it('CheckpointLoaderSimple preserves user-customized title', () => {
    const node = makeCheckpointNode('二次元大模型 SDXL', 'sogni', '', undefined);
    const html = renderNode(node);
    expect(html).toContain('二次元大模型 SDXL');
    expect(html).not.toContain('加载底模 (Sogni)');
  });

  it('Presets without a provider suffix remain unchanged', () => {
    const saveNode: NodeInstance = {
      id: 'test-save',
      type: 'SaveImage',
      title: '保存图像',
      titleSource: 'template',
      pos: { x: 0, y: 0 },
      width: 300,
      inputs: NODE_DEFINITIONS.SaveImage.inputs,
      outputs: NODE_DEFINITIONS.SaveImage.outputs,
      values: { filename_prefix: 'test' },
      state: 'idle',
    };
    const html = renderNode(saveNode);
    expect(html).toContain('保存与预览图像 (Save Image)');
  });

  it('M65: verified stored metadata renders the pair button and click passes exact checkpoint id', () => {
    const def = NODE_DEFINITIONS.LoRALoader;
    const node: NodeInstance = {
      id: 'lora-verified',
      type: 'LoRALoader',
      title: 'LoRA',
      pos: { x: 0, y: 0 },
      width: 320,
      inputs: def.inputs,
      outputs: def.outputs,
      state: 'idle',
      values: {
        lora_name: 'portrait-xl',
        base_model: 'SDXL 1.0',
        base_model_source: 'civitai:baseModel',
        recommended_checkpoint: 'urn:air:sdxl:checkpoint:civitai:101055@128078',
        checkpoint_candidates: [{ checkpoint: 'urn:air:sdxl:checkpoint:civitai:101055@128078', provider: 'civitai', baseModelMetadata: 'SDXL 1.0', baseModelSource: 'civitai:baseModel' }],
      },
    };
    const html = renderToStaticMarkup(
      <NodeItem
        node={node}
        isSelected={false}
        zoom={1}
        currentCheckpoint="other-checkpoint"
        currentProvider="huggingface"
        onAutoFixCheckpoint={vi.fn()}
        onSelect={vi.fn()}
        onStartDrag={vi.fn()}
        onUpdateValue={vi.fn()}
        onDeleteNode={vi.fn()}
        onToggleCollapse={vi.fn()}
        onToggleBypass={vi.fn()}
        onStartConnecting={vi.fn()}
        onEndConnecting={vi.fn()}
      />
    );
    expect(html).toContain('data-testid="verified-base-model-pair"');
    expect(html).toContain('urn:air:sdxl:checkpoint:civitai:101055@128078');
  });

  it('M65: no verified metadata renders no pair button', () => {
    const def = NODE_DEFINITIONS.LoRALoader;
    const node: NodeInstance = {
      id: 'lora-unverified',
      type: 'LoRALoader',
      title: 'LoRA',
      pos: { x: 0, y: 0 },
      width: 320,
      inputs: def.inputs,
      outputs: def.outputs,
      state: 'idle',
      values: { lora_name: 'portrait-xl', base_model: 'SDXL 1.0' },
    };
    const html = renderToStaticMarkup(
      <NodeItem
        node={node}
        isSelected={false}
        zoom={1}
        currentCheckpoint="some-checkpoint"
        currentProvider="civitai"
        onAutoFixCheckpoint={vi.fn()}
        onSelect={vi.fn()}
        onStartDrag={vi.fn()}
        onUpdateValue={vi.fn()}
        onDeleteNode={vi.fn()}
        onToggleCollapse={vi.fn()}
        onToggleBypass={vi.fn()}
        onStartConnecting={vi.fn()}
        onEndConnecting={vi.fn()}
      />
    );
    expect(html).not.toContain('verified-base-model-pair');
    expect(html).not.toContain('应用已验证底模');
  });
});
