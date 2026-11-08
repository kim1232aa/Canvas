// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeItem } from '../components/NodeItem';
import { NODE_DEFINITIONS } from '../constants/nodes';
import { WORKFLOW_PRESETS } from '../constants/presets';
import { ensureModelSchema, getModelSchemaEntry } from '../services/modelSchemaCache';
import { extractWorkflowParameters } from './graphEngine';
import type { NodeInstance } from '../types/graph';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const vidOf = (id: string) => {
  const preset = WORKFLOW_PRESETS.find((p) => p.id === id);
  expect(preset, `current preset ${id}`).toBeDefined();
  const video = preset!.nodes.find((n) => n.type === 'AIVideoNode');
  expect(video, `${id} video node`).toBeDefined();
  return video!;
};
const videoNode = (values: Record<string, any>): NodeInstance => {
  const def = NODE_DEFINITIONS.AIVideoNode;
  return { id: 'v1', type: def.type, title: def.title, pos: { x: 0, y: 0 }, width: 320, inputs: def.inputs, outputs: def.outputs, values, state: 'idle' };
};
const component = (node: NodeInstance, update: (id: string, key: string, value: any) => void = noop) => <NodeItem node={node} isSelected={false} zoom={1} onSelect={noop} onStartDrag={noop} onUpdateValue={update} onDeleteNode={noop} onToggleCollapse={noop} onToggleBypass={noop} onStartConnecting={noop} onEndConnecting={noop} />;
const render = (values: Record<string, any>) => renderToStaticMarkup(component(videoNode(values)));
const loadSchema = async (provider: string, model: string, properties: Record<string, unknown>) => {
  ensureModelSchema(provider, model, (async () => new Response(JSON.stringify({ inputSchema: { properties } }), { status: 200 })) as typeof fetch);
  await vi.waitFor(() => expect(getModelSchemaEntry(provider, model)?.status).toBe('ready'));
};

describe('AI video node preset values and user-declared Schema inputs', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(async () => {
    await act(async () => { root.unmount(); });
    container.remove();
  });

  it('current I2V presets keep their declared parameters and omit unsupported empty fields', () => {
    const fal = vidOf('std-fal-i2v').values, ws = vidOf('std-wavespeed-i2v').values, civitai = vidOf('std-civitai-i2v').values;
    expect(fal).toMatchObject({ num_frames: 81, resolution: '480p', aspect_ratio: '16:9', fps: 16, cfg: 3.5, seed: 24231881 });
    expect(JSON.parse(fal.custom_parameters)).toMatchObject({ guidance_scale_2: 4 });
    for (const k of ['duration', 'size']) expect(fal).not.toHaveProperty(k);
    for (const k of ['fps', 'size', 'cfg', 'resolution', 'aspect_ratio']) expect(ws).not.toHaveProperty(k);
    expect(ws).toMatchObject({ duration: 5, seed: 42 });
    for (const k of ['duration', 'num_frames', 'resolution', 'aspect_ratio', 'size']) expect(civitai).not.toHaveProperty(k);
    expect(civitai).toMatchObject({ fps: 24, cfg: 3, seed: 1715864103 });
    expect(JSON.parse(civitai.custom_parameters)).toMatchObject({ width: 480, height: 832, shift: 7 });
    const current = WORKFLOW_PRESETS.filter((p) => p.tags?.includes('图生视频'));
    expect(current.map((p) => p.id).sort()).toEqual(['std-civitai-i2v', 'std-fal-i2v', 'std-wavespeed-i2v']);
    for (const preset of current) {
      const values = vidOf(preset.id).values;
      const custom = JSON.parse(values.custom_parameters);
      expect(custom._canvas.scope).toEqual({ provider: values.targetProvider, model: values.model });
      expect(values.require_reference_image).toBe(true);
      for (const key of ['seed', 'fps', 'num_frames', 'duration', 'aspect_ratio', 'resolution']) {
        const aliases: Record<string, string[]> = { fps: ['fps', 'frames_per_second'], num_frames: ['num_frames', 'frames'] };
        if (values[key] !== undefined) expect(custom._canvas.schemaProperties.some((p: string) => (aliases[key] ?? [key]).includes(p)), `${preset.id}.${key}`).toBe(true);
      }
    }
  });

  it('catalog model is selected without a duplicate custom value; filled cfg stays editable', () => {
    const h = render({ targetProvider: 'fal', model: 'fal-ai/wan/v2.2-a14b/text-to-video/lora', cfg: 4 });
    expect(h).toMatch(/<option value="fal-ai\/wan\/v2\.2-a14b\/text-to-video\/lora" selected=""/);
    expect(h).not.toContain('自定义视频端点');
    expect(h).toMatch(/data-testid="video-extra-cfg"[\s\S]*?aria-label="cfg"[^>]*value="4"/);
  });

  it('injected Schema properties render numeric, boolean and enum inputs without duplicating prompt', async () => {
    await loadSchema('fal', 'user-owner/property-schema-fixture', { prompt: {}, shift: { type: 'number' }, turbo_mode: { type: 'boolean' }, quality: { enum: ['medium', 'high'] }, guide_scale: { type: 'number' } });
    const h = render({ targetProvider: 'fal', model: 'user-owner/property-schema-fixture' });
    expect(h).toMatch(/data-testid="video-schema-prop-shift"[\s\S]*?<input aria-label="shift" type="number"/);
    expect(h).toMatch(/data-testid="video-schema-prop-quality"[\s\S]*?<select aria-label="quality"/);
    expect(h).toMatch(/data-testid="video-schema-prop-turbo_mode"[\s\S]*?<select aria-label="turbo_mode"/);
    expect(h).toContain('video-schema-prop-guide_scale');
    expect(h).not.toContain('video-schema-prop-prompt');
  });

  it('user-selected Replicate model uses allOf enums and edits upstream model independently from the route model', async () => {
    const model = 'user-owner/allof-schema-fixture';
    const en = (values: unknown[]) => ({ allOf: [{ enum: values, type: typeof values[0] === 'number' ? 'integer' : 'string' }] });
    await loadSchema('replicate', model, { prompt: {}, aspect_ratio: en(['16:9', '9:16', '1:1']), resolution: en(['480p', '720p']), model: en(['1.3b', '14b']), frames: en([17, 33, 49, 65, 81]), fast_mode: en(['Off', 'Balanced', 'Fast']) });
    let node = videoNode({ ...NODE_DEFINITIONS.AIVideoNode.defaultValues, targetProvider: 'replicate', model, aspect_ratio: '16:9', resolution: '480p', num_frames: 81, custom_parameters: JSON.stringify({ model: '14b' }) });
    const update = vi.fn((_id: string, key: string, value: unknown) => { node = { ...node, values: { ...node.values, [key]: value } }; root.render(component(node, update)); });
    await act(async () => { root.render(component(node, update)); });
    const select = (label: string) => {
      const found = container.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
      expect(found, `Schema select ${label}`).not.toBeNull();
      return found!;
    };
    expect(select('画面比例 (Aspect Ratio)').value).toBe('16:9');
    expect(select('视频分辨率 (resolution)').value).toBe('480p');
    expect(select('model').value).toBe('14b');
    expect(select('帧数 (num_frames)').value).toBe('81');
    expect(select('fast_mode').value).toBe('');
    expect(JSON.parse(node.values.custom_parameters)).not.toHaveProperty('fast_mode');
    for (const [label, value] of [['model', '1.3b'], ['fast_mode', 'Balanced'], ['帧数 (num_frames)', '49'], ['画面比例 (Aspect Ratio)', '9:16'], ['视频分辨率 (resolution)', '720p']]) {
      await act(async () => { const control = select(label); control.value = value; control.dispatchEvent(new Event('change', { bubbles: true })); });
      expect(select(label).value).toBe(value);
    }
    expect(node.values.model).toBe(model);
    expect(JSON.parse(node.values.custom_parameters)).toEqual({ model: '1.3b', fast_mode: 'Balanced' });
    expect(extractWorkflowParameters([node], [], node.id)).toMatchObject({ checkpointModel: model, videoProvider: 'replicate', videoFrames: 49, videoAspectRatio: '9:16', resolution: '720p' });
    expect(update).toHaveBeenCalledTimes(5);
  });

  it('every filled current preset value stays editable before Schema load, including false safety switches', () => {
    const h = render(vidOf('std-civitai-i2v').values);
    expect(h).toMatch(/data-testid="video-schema-prop-shift"[\s\S]*?<input aria-label="shift"[^>]*value="7"/);
    expect(h).toMatch(/aria-label="width"[^>]*value="480"/);
    expect(h).toMatch(/aria-label="height"[^>]*value="832"/);
    expect(h).toMatch(/aria-label="cfg"[^>]*value="3"/);
    expect(h).not.toContain('aria-label="_canvas"');
    for (const id of ['std-fal-i2v', 'std-wavespeed-i2v', 'std-civitai-i2v']) {
      const values = vidOf(id).values, html = render(values), custom = JSON.parse(values.custom_parameters);
      for (const [key, value] of Object.entries(custom)) {
        if (key !== '_canvas') expect(html, `${id}.${key}`).toMatch(new RegExp(`aria-label="${key}"(?:[^>]*value="${String(value)}"|[^>]*>[\\s\\S]*?<option value="${String(value)}" selected="")`));
      }
    }
  });
});
