// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { NodeItem } from './NodeItem';
import type { NodeInstance } from '../types/board';
import { NODE_DEFINITIONS } from '../constants/nodes';

describe('NodeItem dynamic title & custom title preservation', () => {
  const makeNode = (type: string, title: string | undefined, values: Record<string, any>): NodeInstance => ({
    id: `test-${type}`,
    type,
    title: title || NODE_DEFINITIONS[type]?.title || type,
    pos: { x: 0, y: 0 },
    width: 300,
    inputs: NODE_DEFINITIONS[type]?.inputs || [],
    outputs: NODE_DEFINITIONS[type]?.outputs || [],
    values: { ...NODE_DEFINITIONS[type]?.defaultValues, ...values },
    state: 'idle',
  });

  const render = (node: NodeInstance) => renderToStaticMarkup(
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

  it('renders default title when no custom title is set', () => {
    const node = makeNode('CLIPTextEncode', undefined, { text: 'a cat' });
    const html = render(node);
    expect(html).toContain('CLIP 文本编码（正向提示词）');
  });

  it('renders custom title when explicitly set', () => {
    const node = makeNode('CLIPTextEncode', '我的正向提示词', { text: 'a cat' });
    const html = render(node);
    expect(html).toContain('我的正向提示词');
    expect(html).not.toContain('CLIP 文本编码（正向提示词）');
  });

  it('CheckpointLoader dynamic title shows chosen checkpoint', () => {
    const node = makeNode('CheckpointLoaderSimple', undefined, { ckpt_name: 'dreamshaper.safetensors', targetProvider: 'civitai' });
    const html = render(node);
    expect(html).toContain('dreamshaper.safetensors');
  });

  it('CheckpointLoader custom title overrides dynamic title', () => {
    const node = makeNode('CheckpointLoaderSimple', '我的底模加载器', { ckpt_name: 'dreamshaper.safetensors', targetProvider: 'civitai' });
    const html = render(node);
    expect(html).toContain('我的底模加载器');
    expect(html).not.toContain('dreamshaper.safetensors');
  });

  it('LoRALoader dynamic title shows lora name', () => {
    const node = makeNode('LoRALoader', undefined, { lora_name: 'detail-tweaker', strength_model: 0.8 });
    const html = render(node);
    expect(html).toContain('detail-tweaker');
  });

  it('LoRALoader custom title overrides dynamic title', () => {
    const node = makeNode('LoRALoader', '我的 LoRA', { lora_name: 'detail-tweaker', strength_model: 0.8 });
    const html = render(node);
    expect(html).toContain('我的 LoRA');
    expect(html).not.toContain('detail-tweaker');
  });

  it('VAELoader dynamic title shows vae name', () => {
    const node = makeNode('VAELoader', undefined, { vae_name: 'vae-ft-mse-840000-ema-pruned.ckpt' });
    const html = render(node);
    expect(html).toContain('vae-ft-mse-840000-ema-pruned.ckpt');
  });

  it('VAELoader custom title overrides dynamic title', () => {
    const node = makeNode('VAELoader', '我的 VAE', { vae_name: 'vae-ft-mse-840000-ema-pruned.ckpt' });
    const html = render(node);
    expect(html).toContain('我的 VAE');
    expect(html).not.toContain('vae-ft-mse-840000-ema-pruned.ckpt');
  });

  it('CheckpointLoader without provider shows filename only', () => {
    const node = makeNode('CheckpointLoaderSimple', undefined, { ckpt_name: 'epic-realism.safetensors' });
    const html = render(node);
    expect(html).toContain('epic-realism.safetensors');
    expect(html).not.toContain('加载底模 (Sogni)');
  });

  it('CheckpointLoader with Sogni provider shows provider suffix', () => {
    const node = makeNode('CheckpointLoaderSimple', undefined, { ckpt_name: 'epic-realism.safetensors', targetProvider: 'sogni' });
    const html = render(node);
    expect(html).toContain('epic-realism.safetensors');
    expect(html).toContain('(Sogni)');
  });

  it('CheckpointLoader with Sogni provider and custom title overrides provider display', () => {
    const node = makeNode('CheckpointLoaderSimple', '主力模型', { ckpt_name: 'epic-realism.safetensors', targetProvider: 'sogni' });
    const html = render(node);
    expect(html).toContain('主力模型');
    expect(html).not.toContain('加载底模 (Sogni)');
  });

  it('verified stored metadata renders the pair button and the click passes the exact checkpoint id', () => {
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
    const onAutoFixCheckpoint = vi.fn();
    const element = (
      <NodeItem
        node={node}
        isSelected={false}
        zoom={1}
        currentCheckpoint="other-checkpoint"
        currentProvider="huggingface"
        onAutoFixCheckpoint={onAutoFixCheckpoint}
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
    const html = renderToStaticMarkup(element);
    expect(html).toContain('data-testid="verified-base-model-pair"');
    expect(html).toContain('urn:air:sdxl:checkpoint:civitai:101055@128078');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    act(() => { root.render(element); });
    const button = host.querySelector('[data-testid="verified-base-model-pair"]') as HTMLButtonElement | null;
    expect(button, host.textContent || '').not.toBeNull();
    act(() => { button!.click(); });
    expect(onAutoFixCheckpoint).toHaveBeenCalledWith('urn:air:sdxl:checkpoint:civitai:101055@128078');
    act(() => root.unmount());
    host.remove();
  });

  it('no verified metadata renders no pair button', () => {
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

  it('Presets without a provider suffix remain unchanged', () => {
    const saveNode: NodeInstance = {
      id: 'test-save',
      type: 'SaveImage',
      title: 'SaveImage',
      pos: { x: 0, y: 0 },
      width: 300,
      inputs: NODE_DEFINITIONS.SaveImage?.inputs || [],
      outputs: NODE_DEFINITIONS.SaveImage?.outputs || [],
      values: { filename_prefix: 'ComfyUI' },
      state: 'idle',
    };
    const html = render(saveNode);
    expect(html).toContain('保存图像');
  });
});
