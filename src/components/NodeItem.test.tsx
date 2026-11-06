import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { NodeItem } from './NodeItem';
import { NodeInstance } from '../types/graph';
import { NODE_DEFINITIONS } from '../constants/nodes';

function makeVideoNode(title: string, targetProvider = 'fal'): NodeInstance {
  const def = NODE_DEFINITIONS.AIVideoNode;
  return {
    id: 'test-vid-node',
    type: 'AIVideoNode',
    title,
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

function makeCheckpointNode(title: string, targetProvider = 'huggingface', ckpt_name = ''): NodeInstance {
  const def = NODE_DEFINITIONS.CheckpointLoaderSimple;
  return {
    id: 'test-ckpt-node',
    type: 'CheckpointLoaderSimple',
    title,
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
  it('AIVideoNode header displays Sogni when targetProvider is sogni (from Fal.ai preset title)', () => {
    const node = makeVideoNode('AI 视频 (Fal.ai)', 'sogni');
    const html = renderNode(node);
    expect(html).toContain('AI 视频 (Sogni)');
    expect(html).not.toContain('AI 视频 (Fal.ai)');
  });

  it('AIVideoNode header displays WaveSpeed when targetProvider is wavespeed', () => {
    const node = makeVideoNode('AI 视频 (Fal.ai)', 'wavespeed');
    const html = renderNode(node);
    expect(html).toContain('AI 视频 (WaveSpeed)');
    expect(html).not.toContain('AI 视频 (Fal.ai)');
  });

  it('AIVideoNode preserves user-customized title upon provider switch', () => {
    const node = makeVideoNode('我的专属视频生成器', 'sogni');
    const html = renderNode(node);
    expect(html).toContain('我的专属视频生成器');
    expect(html).not.toContain('AI 视频 (Sogni)');
  });

  it('AIVideoNode preserves English custom title upon provider switch', () => {
    const node = makeVideoNode('Custom Action Cam Generator', 'wavespeed');
    const html = renderNode(node);
    expect(html).toContain('Custom Action Cam Generator');
    expect(html).not.toContain('AI 视频 (WaveSpeed)');
  });

  it('CheckpointLoaderSimple displays Sogni when targetProvider is sogni', () => {
    const node = makeCheckpointNode('加载底模 (Hugging Face)', 'sogni');
    const html = renderNode(node);
    expect(html).toContain('加载底模 (Sogni)');
    expect(html).not.toContain('加载底模 (Hugging Face)');
  });

  it('CheckpointLoaderSimple preserves user-customized title', () => {
    const node = makeCheckpointNode('二次元大模型 SDXL', 'sogni');
    const html = renderNode(node);
    expect(html).toContain('二次元大模型 SDXL');
    expect(html).not.toContain('加载底模 (Sogni)');
  });

  it('Presets without a provider suffix remain unchanged', () => {
    const saveNode: NodeInstance = {
      id: 'test-save',
      type: 'SaveImage',
      title: '保存图像',
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
});
