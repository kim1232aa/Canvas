/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { readFileSync } from 'node:fs';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeItem } from './NodeItem';
import { NodeInstance } from '../types/graph';
import { NODE_DEFINITIONS } from '../constants/nodes';
import { setFieldCapabilitySchemaLookup } from '../utils/fieldCapability';
import { getModelSchemaEntry } from '../services/modelSchemaCache';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

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

describe('M115: AIVideoNode model select scope filtering', () => {
  it('nanogpt provider with no static models shows only custom input, not other providers', () => {
    const def = NODE_DEFINITIONS.AIVideoNode;
    const node: NodeInstance = {
      id: 'video-nanogpt',
      type: 'AIVideoNode',
      title: 'AI 视频',
      pos: { x: 0, y: 0 },
      width: 320,
      inputs: def.inputs,
      outputs: def.outputs,
      state: 'idle',
      values: { targetProvider: 'nanogpt', model: '' },
    };
    const html = renderNode(node);
    expect(html).toContain('data-testid="node-video-model-select"');
    expect(html).toContain('未选择 (请先选择模型)');
    // Check the select itself has no other provider optgroups or options
    expect(html).not.toContain('🎬 FAL');
    expect(html).not.toContain('🎬 AGNES');
    expect(html).not.toContain('其它视频服务商端点');
    expect(html).not.toContain('KLING');
    expect(html).not.toContain('minimax');
    expect(html).not.toContain('[FAL]');
    expect(html).not.toContain('[AGNES]');
  });

  it('tensorart provider with no static models shows only custom input, not fallback to all', () => {
    const def = NODE_DEFINITIONS.AIVideoNode;
    const node: NodeInstance = {
      id: 'video-tensorart',
      type: 'AIVideoNode',
      title: 'AI 视频',
      pos: { x: 0, y: 0 },
      width: 320,
      inputs: def.inputs,
      outputs: def.outputs,
      state: 'idle',
      values: { targetProvider: 'tensorart', model: '' },
    };
    const html = renderNode(node);
    expect(html).toContain('data-testid="node-video-model-select"');
    // Check the select has no other provider optgroups
    expect(html).not.toContain('🎬 FAL');
    expect(html).not.toContain('🎬 AGNES');
    expect(html).not.toContain('其它视频服务商端点');
    expect(html).not.toContain('[FAL]');
    expect(html).not.toContain('KLING');
  });

  it('custom model value is preserved when provider has no static options', () => {
    const def = NODE_DEFINITIONS.AIVideoNode;
    const customModel = 'custom-provider/my-video-model';
    const node: NodeInstance = {
      id: 'video-custom',
      type: 'AIVideoNode',
      title: 'AI 视频',
      pos: { x: 0, y: 0 },
      width: 320,
      inputs: def.inputs,
      outputs: def.outputs,
      state: 'idle',
      values: { targetProvider: 'nanogpt', model: customModel },
    };
    const html = renderNode(node);
    expect(html).toContain('★ [自定义视频端点]');
    expect(html).toContain(customModel);
  });

  it('unknown provider shows custom input only, no cross-provider fallback', () => {
    const def = NODE_DEFINITIONS.AIVideoNode;
    const node: NodeInstance = {
      id: 'video-unknown',
      type: 'AIVideoNode',
      title: 'AI 视频',
      pos: { x: 0, y: 0 },
      width: 320,
      inputs: def.inputs,
      outputs: def.outputs,
      state: 'idle',
      values: { targetProvider: 'unknown-provider', model: '' },
    };
    const html = renderNode(node);
    expect(html).toContain('data-testid="node-video-model-select"');
    expect(html).not.toContain('KLING');
    expect(html).not.toContain('其它视频服务商端点');
  });

  it('fal provider with static models shows fal optgroup only', () => {
    const def = NODE_DEFINITIONS.AIVideoNode;
    const node: NodeInstance = {
      id: 'video-fal',
      type: 'AIVideoNode',
      title: 'AI 视频',
      pos: { x: 0, y: 0 },
      width: 320,
      inputs: def.inputs,
      outputs: def.outputs,
      state: 'idle',
      values: { targetProvider: 'fal', model: '' },
    };
    const html = renderNode(node);
    expect(html).toContain('🎬 FAL 官方推荐视频大模型');
    expect(html).not.toContain('其它视频服务商端点');
  });

  it('empty provider shows custom input with warning, no provider-specific options', () => {
    const def = NODE_DEFINITIONS.AIVideoNode;
    const node: NodeInstance = {
      id: 'video-empty',
      type: 'AIVideoNode',
      title: 'AI 视频',
      pos: { x: 0, y: 0 },
      width: 320,
      inputs: def.inputs,
      outputs: def.outputs,
      state: 'idle',
      values: { targetProvider: '', model: '' },
    };
    const html = renderNode(node);
    expect(html).toContain('data-testid="node-video-model-select"');
    expect(html).toContain('请先选择模型');
  });
});

describe('M130: NodeItem refine prompt inline error handling', () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;
  let alertMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    localStorage.clear();
    alertMock = vi.fn();
    vi.stubGlobal('alert', alertMock);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) await act(async () => { root?.unmount(); });
    root = null;
    host?.remove();
    host = null;
    vi.unstubAllGlobals();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  function makePositiveCLIPNode(text = 'a cute cat in the garden'): NodeInstance {
    const def = NODE_DEFINITIONS.CLIPTextEncode;
    return {
      id: 'clip-pos-1',
      type: 'CLIPTextEncode',
      title: 'CLIP 文本编码器',
      pos: { x: 0, y: 0 },
      width: 320,
      inputs: def.inputs,
      outputs: def.outputs,
      state: 'idle',
      values: {
        text,
      },
    };
  }

  function mountNode(node: NodeInstance, onUpdateValue = vi.fn()) {
    return act(async () => {
      root!.render(
        <NodeItem
          node={node}
          isSelected={false}
          zoom={1}
          onSelect={vi.fn()}
          onStartDrag={vi.fn()}
          onUpdateValue={onUpdateValue}
          onDeleteNode={vi.fn()}
          onToggleCollapse={vi.fn()}
          onToggleBypass={vi.fn()}
          onStartConnecting={vi.fn()}
          onEndConnecting={vi.fn()}
        />
      );
    });
  }

  it('clicking AI 润色 without a selected model displays inline hint and does NOT call window.alert', async () => {
    const node = makePositiveCLIPNode('prompt to refine');
    await mountNode(node);

    const button = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent?.includes('AI 润色优化'));
    expect(button).toBeDefined();
    await act(async () => { button!.click(); });

    expect(alertMock).not.toHaveBeenCalled();
    const errorEl = host!.querySelector('[role="alert"], [data-testid="node-refine-error"]');
    expect(errorEl?.textContent).toContain('选择润色服务商与模型');
  });

  it('upstream HTTP error displays status and response body inline and does NOT call window.alert', async () => {
    const node = makePositiveCLIPNode('prompt to refine');
    node.values.refineProvider = 'gemini';
    node.values.refineModel = 'runtime-refine-model';
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>upstream unavailable</html>', { status: 503, statusText: 'Service Unavailable' })));

    await mountNode(node);
    const button = Array.from(host!.querySelectorAll('button')).find((b) => b.textContent?.includes('AI 润色优化'));
    expect(button).toBeDefined();
    await act(async () => { button!.click(); });

    expect(alertMock).not.toHaveBeenCalled();
    const errorEl = host!.querySelector('[role="alert"], [data-testid="node-refine-error"]');
    expect(errorEl?.textContent).toContain('HTTP 503');
    expect(errorEl?.textContent).toContain('<html>upstream unavailable</html>');
  });
});

describe('M148: NodeItem fieldCapability widget visibility & transparency', () => {
  const json = (path: string) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
  const falFixture = json('../server/fixtures/fal-openapi-fal-ai__flux-lora.json');
  const falSchema = falFixture.components.schemas.FluxLoraInput;
  const falProps = falSchema.properties;

  afterEach(() => {
    setFieldCapabilitySchemaLookup((p, m) => getModelSchemaEntry(p, m));
  });

  function makeKSamplerNode(values: Record<string, any> = {}): NodeInstance {
    const def = NODE_DEFINITIONS.KSampler;
    return {
      id: 'test-ksampler-node',
      type: 'KSampler',
      title: 'KSampler',
      pos: { x: 0, y: 0 },
      width: 320,
      inputs: def.inputs,
      outputs: def.outputs,
      values: {
        seed: '',
        steps: 20,
        cfg: 8,
        sampler_name: '',
        scheduler: 'normal',
        denoise: 1,
        ...values,
      },
      state: 'idle',
    };
  }

  function renderWithContext(node: NodeInstance, provider = 'fal', checkpoint = 'fal-ai/flux-lora') {
    return renderToStaticMarkup(
      <NodeItem
        node={node}
        isSelected={false}
        zoom={1}
        currentProvider={provider}
        currentCheckpoint={checkpoint}
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

  it('1. 静态 unsupported (取 providerSchema.ts 真实行 fal-ai/flux-lora sampler) ⇒ widget 不存在且运行不禁用', () => {
    // sampler on fal fal-ai/flux-lora is statically unsupported; when empty, sampler widget must not exist
    const node = makeKSamplerNode({ sampler_name: '' });
    const html = renderWithContext(node, 'fal', 'fal-ai/flux-lora');
    expect(html).not.toContain('widget-label-sampler_name');
    expect(html).not.toContain('aria-label="sampler_name"');
  });

  it('2. fal 开放 schema 缺字段 (仓库内 fal-openapi fixture) ⇒ widget 存在且有未确认标识', () => {
    setFieldCapabilitySchemaLookup((p, m) => {
      if (p === 'fal' && m === 'fal-ai/flux-lora') {
        return {
          status: 'ready',
          properties: Object.keys(falProps),
          propertiesObj: falProps,
          inputSchema: falSchema,
        };
      }
      return undefined;
    });

    // denoise is not in fal FluxLoraInput properties; since FluxLoraInput has no additionalProperties:false, it is unknown
    const node = makeKSamplerNode({ denoise: 1 });
    const html = renderWithContext(node, 'fal', 'fal-ai/flux-lora');
    expect(html).toContain('widget-label-denoise');
    expect(html).toContain('field-unconfirmed-denoise');
    expect(html).toContain('未确认');
  });

  it('3. 别名命中 (steps -> num_inference_steps) ⇒ supported 正常渲染无未确认标识', () => {
    setFieldCapabilitySchemaLookup((p, m) => {
      if (p === 'fal' && m === 'fal-ai/flux-lora') {
        return {
          status: 'ready',
          properties: Object.keys(falProps),
          propertiesObj: falProps,
          inputSchema: falSchema,
        };
      }
      return undefined;
    });

    // steps aliases to num_inference_steps in falProps, so it is supported
    const node = makeKSamplerNode({ steps: 25 });
    const html = renderWithContext(node, 'fal', 'fal-ai/flux-lora');
    expect(html).toContain('widget-label-steps');
    expect(html).not.toContain('field-unconfirmed-steps');
  });

  it('4. schema loading/error ⇒ 显示且标未确认', () => {
    setFieldCapabilitySchemaLookup((p, m) => {
      if (p === 'fal' && m === 'fal-ai/flux-lora') {
        return { status: 'loading' };
      }
      return undefined;
    });

    const node = makeKSamplerNode({ steps: 20 });
    const html = renderWithContext(node, 'fal', 'fal-ai/flux-lora');
    expect(html).toContain('widget-label-steps');
    expect(html).toContain('field-unconfirmed-steps');
    expect(html).toContain('未确认');
  });

  it('5. unsupported 但已有值 ⇒ 提示可见且值未被清空', () => {
    const node = makeKSamplerNode({ sampler_name: 'euler' });
    const html = renderWithContext(node, 'fal', 'fal-ai/flux-lora');
    // Notice must be visible containing: field name + current value + 本次不发送 + static-spec
    expect(html).toContain('unsupported-notice-sampler_name');
    expect(html).toContain('sampler_name');
    expect(html).toContain('euler');
    expect(html).toContain('本次不发送');
    expect(html).toContain('static-spec');
    // Value on node must not be cleared
    expect(node.values.sampler_name).toBe('euler');
  });
});

