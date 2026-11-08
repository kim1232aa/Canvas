// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NodeItem } from '../components/NodeItem';
import { WORKFLOW_PRESETS } from '../constants/presets';
import { NODE_DEFINITIONS } from '../constants/nodes';
import { extractWorkflowParameters } from './graphEngine';
import type { NodeInstance } from '../types/graph';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const noop = () => {};
const presetVideo = (id: string) => {
  const preset = WORKFLOW_PRESETS.find((p) => p.id === id);
  expect(preset, `current preset ${id}`).toBeDefined();
  const video = preset!.nodes.find((n) => n.type === 'AIVideoNode');
  expect(video, `${id} video node`).toBeDefined();
  return structuredClone(video!);
};
const customVideo = (provider: string, schemaProperties: string[]): NodeInstance => {
  const def = NODE_DEFINITIONS.AIVideoNode;
  const model = `user-owner/${provider}-seed-fixture`;
  return { id: `user-${provider}`, type: def.type, title: def.title, pos: { x: 0, y: 0 }, inputs: def.inputs, outputs: def.outputs, values: { ...def.defaultValues, targetProvider: provider, model, custom_parameters: JSON.stringify({ _canvas: { scope: { provider, model }, schemaProperties } }) } };
};

describe('AI 视频 seed widget follows declared Schema and preserves user values', () => {
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
  const mount = async (initial: NodeInstance) => {
    let node = initial;
    const update = vi.fn((_id: string, key: string, value: unknown) => { node = { ...node, values: { ...node.values, [key]: value } }; draw(); });
    const draw = () => root.render(<NodeItem node={node} isSelected={false} zoom={1} onSelect={noop} onStartDrag={noop} onUpdateValue={update} onDeleteNode={noop} onToggleCollapse={noop} onToggleBypass={noop} onStartConnecting={noop} onEndConnecting={noop} />);
    await act(async () => { draw(); });
    return { node: () => node, update };
  };
  const seedInput = () => {
    const input = container.querySelector<HTMLInputElement>('input[aria-label="种子 (seed)"]');
    expect(input, 'editable seed input').not.toBeNull();
    expect(input!.disabled).toBe(false);
    return input!;
  };
  const changeSeed = async (value: string) => {
    await act(async () => {
      const input = seedInput();
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  it.each(['std-fal-i2v', 'std-wavespeed-i2v', 'std-civitai-i2v'])('%s shows its declared recipe seed on first paint', async (id) => {
    const video = presetVideo(id);
    expect(JSON.parse(video.values.custom_parameters)._canvas.schemaProperties).toContain('seed');
    await mount(video);
    expect(seedInput().value).toBe(String(video.values.seed));
  });

  it.each(['novita', 'replicate'])('a user-created %s node starts empty, accepts seed 0, and clears it without inventing a seed', async (provider) => {
    const state = await mount(customVideo(provider, ['prompt', 'seed']));
    expect(seedInput().value).toBe('');
    await changeSeed('0');
    expect(state.update).toHaveBeenLastCalledWith(state.node().id, 'seed', 0);
    expect(seedInput().value).toBe('0');
    expect(extractWorkflowParameters([state.node()], [], state.node().id).seed).toBe(0);
    await changeSeed('');
    expect(state.update).toHaveBeenLastCalledWith(state.node().id, 'seed', undefined);
    expect(seedInput().value).toBe('');
    expect(extractWorkflowParameters([state.node()], [], state.node().id).seed).toBeUndefined();
  });

  it('recipe seed is editable and the edited value reaches graph extraction', async () => {
    const state = await mount(presetVideo('std-fal-i2v'));
    expect(seedInput().value).toBe('24231881');
    await changeSeed('73');
    expect(seedInput().value).toBe('73');
    expect(state.update).toHaveBeenCalledExactlyOnceWith(state.node().id, 'seed', 73);
    const image = { id: 'reference', type: 'LoadImage', title: 'Reference', pos: { x: 0, y: 0 }, inputs: [], outputs: NODE_DEFINITIONS.LoadImage.outputs, values: { image_url: 'https://example.com/ref.png' } };
    const connection = { id: 'reference-video', fromNodeId: image.id, fromSocketId: 'IMAGE', toNodeId: state.node().id, toSocketId: 'init_image', type: 'IMAGE' as const };
    expect(extractWorkflowParameters([image, state.node()], [connection], state.node().id).seed).toBe(73);
  });

  it('a declared Schema without seed hides an empty control but keeps filled zero visible and editable', async () => {
    const video = customVideo('replicate', ['prompt']);
    await mount(video);
    expect(container.querySelector('input[aria-label="种子 (seed)"]')).toBeNull();
    const state = await mount({ ...video, values: { ...video.values, seed: 0 } });
    expect(seedInput().value).toBe('0');
    await changeSeed('99');
    expect(seedInput().value).toBe('99');
    expect(extractWorkflowParameters([state.node()], [], state.node().id).seed).toBe(99);
  });
});
