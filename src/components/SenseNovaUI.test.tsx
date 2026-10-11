import React from 'react';
import {afterEach, expect, it, vi} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {NodeItem} from './NodeItem';
import {ParameterInspector} from './ParameterInspector';
import {NODE_DEFINITIONS} from '../constants/nodes';
import {patchInspectorBranchNode, readInspectorParameters} from '../utils/inspectorParameters';
import type {ComfyParameters, Connection, NodeInstance} from '../types/graph';

const noop = () => {};
const nodeProps = (values: Record<string, unknown>) => ({
  node: {id: 'sense', type: 'CheckpointLoaderSimple', title: 'Checkpoint', pos: {x: 0, y: 0}, inputs: NODE_DEFINITIONS.CheckpointLoaderSimple.inputs, outputs: NODE_DEFINITIONS.CheckpointLoaderSimple.outputs, values},
  isSelected: false, zoom: 1, onSelect: noop, onStartDrag: noop, onUpdateValue: noop,
  onDeleteNode: noop, onToggleCollapse: noop, onToggleBypass: noop, onStartConnecting: noop, onEndConnecting: noop,
});
const parameters = (partial: Partial<ComfyParameters> = {}): ComfyParameters => ({
  checkpoint: 'custom-image-model', targetProvider: 'sensenova', seedControl: 'fixed', denoise: 1,
  width: 0, height: 0, batchSize: 1, loras: [], ...partial,
});
const elements = (tree: any): any[] => !tree ? [] : Array.isArray(tree) ? tree.flatMap(elements) : typeof tree === 'object' && tree.props ? [tree, ...elements(tree.props.children)] : [];
const nativeControl = (tree: any, label: string) => {
  const control = elements(tree).find(el => ['input', 'select'].includes(el.type) && el.props['aria-label'] === label);
  expect(control, `native control ${label}`).toBeDefined();
  return control;
};
const mockHooks = () => {
  vi.spyOn(React, 'useRef').mockReturnValue({current: null});
  vi.spyOn(React, 'useState').mockImplementation(((value: unknown) => [value, noop]) as any);
};
afterEach(() => vi.restoreAllMocks());

it('shows the raw inherited SenseNova size with an editable label and the documented upstream disagreement', () => {
  const props = nodeProps({targetProvider: 'sensenova', ckpt_name: 'custom-image-model', size: '2K'});
  const html = renderToStaticMarkup(<NodeItem {...props}/>);
  expect(html).toMatch(/<label[^>]*>[\s\S]*?<input[^>]*aria-label="SenseNova size"[^>]*value="2K"/);
  expect(html).toContain('auto / 2048x2048');
  expect(html).toContain('2K/4K');
  expect(html).toContain('invalid size, should be auto or WIDTHxHEIGHT');
  expect(props.node.values.size).toBe('2K');
});

it.each(['auto', '2048x2048', ''] as const)('updates only the node size for %j without a forced default', value => {
  mockHooks();
  const onUpdateValue = vi.fn();
  const props = {...nodeProps({targetProvider: 'sensenova', ckpt_name: 'custom-image-model', size: '2K'}), onUpdateValue};
  const input = nativeControl(NodeItem(props), 'SenseNova size');
  expect(input.type).toBe('input');
  expect(input.props.type).toBe('text');
  expect(input.props.value).toBe('2K');
  expect(input.props.required).toBeUndefined();
  expect(input.props.disabled).toBeUndefined();
  input.props.onChange({target: {value}});
  expect(onUpdateValue.mock.calls).toEqual([['sense', 'size', value || undefined]]);
  expect(props.node.values.size).toBe('2K');
});

it('leaves unset size empty and does not expose SenseNova fields for another provider or an LLM node', () => {
  const unset = renderToStaticMarkup(<NodeItem {...nodeProps({targetProvider: 'sensenova', ckpt_name: 'custom-image-model'})}/>);
  expect(unset).toMatch(/<input[^>]*aria-label="SenseNova size"[^>]*value=""/);
  for (const provider of ['agnes', 'gemini', 'fal']) {
    const node = renderToStaticMarkup(<NodeItem {...nodeProps({targetProvider: provider, ckpt_name: 'custom-image-model', size: '2K'})}/>);
    const inspector = renderToStaticMarkup(<ParameterInspector params={parameters({targetProvider: provider as ComfyParameters['targetProvider'], size: '2K'})} onChange={noop} onOpenCivitai={noop}/>);
    expect(node).not.toContain('aria-label="SenseNova');
    expect(inspector).not.toContain('aria-label="SenseNova');
  }
  const llmProps = {...nodeProps({targetProvider: 'sensenova', provider: 'sensenova', model: 'custom-chat-model'}), node: {...nodeProps({provider: 'sensenova', model: 'custom-chat-model'}).node, type: 'LLMReasoningNode', inputs: [], outputs: []}};
  expect(renderToStaticMarkup(<NodeItem {...llmProps}/>)).not.toContain('aria-label="SenseNova size"');
});

it.each(['auto', ''] as const)('patches inspector size %j through the selected checkpoint without touching prompt, provider, model or other branches', value => {
  mockHooks();
  const checkpoint: NodeInstance = nodeProps({targetProvider: 'sensenova', ckpt_name: 'custom-image-model', size: '2K', prompt: 'keep prompt', output_format: 'webp'}).node;
  const sampler: NodeInstance = {...checkpoint, id: 'sampler', type: 'KSampler', values: {seed: 0, steps: 20}};
  const other: NodeInstance = {...checkpoint, id: 'other', values: {...checkpoint.values, size: '4K'}};
  const nodes = [checkpoint, sampler, other];
  const connections: Connection[] = [{id: 'model', fromNodeId: 'sense', fromSocketId: 'MODEL', toNodeId: 'sampler', toSocketId: 'model', type: 'MODEL'}];
  const params = readInspectorParameters(nodes, connections, 'sampler');
  const onChange = vi.fn();
  const input = nativeControl(ParameterInspector({params, onChange, onOpenCivitai: noop}), 'SenseNova size');
  expect(input.props.value).toBe('2K');
  expect(input.props.required).toBeUndefined();
  input.props.onChange({target: {value}});
  expect(onChange).toHaveBeenCalledOnce();
  const after = onChange.mock.calls[0][0];
  expect(after).toEqual({...params, size: value || undefined});
  expect(patchInspectorBranchNode(checkpoint, nodes, connections, 'sampler', params, after).values).toEqual({...checkpoint.values, size: value || undefined});
  expect(patchInspectorBranchNode(sampler, nodes, connections, 'sampler', params, after).values).toEqual(sampler.values);
  expect(patchInspectorBranchNode(other, nodes, connections, 'sampler', params, after)).toBe(other);
  expect(checkpoint.values.size).toBe('2K');
});

it('shows the current optional output format and saves or clears it in both editors without changing other fields', () => {
  mockHooks();
  const props = nodeProps({targetProvider: 'sensenova', ckpt_name: 'custom-image-model', output_format: 'jpg'});
  const onUpdateValue = vi.fn();
  const nodeFormat = nativeControl(NodeItem({...props, onUpdateValue}), 'SenseNova output_format');
  expect(nodeFormat.props.value).toBe('jpg');
  nodeFormat.props.onChange({target: {value: 'webp'}});
  nodeFormat.props.onChange({target: {value: ''}});
  expect(onUpdateValue.mock.calls).toEqual([['sense', 'output_format', 'webp'], ['sense', 'output_format', undefined]]);
  const params = parameters({outputFormat: 'jpg'});
  const onChange = vi.fn();
  const inspectorFormat = nativeControl(ParameterInspector({params, onChange, onOpenCivitai: noop}), 'SenseNova output_format');
  expect(inspectorFormat.props.value).toBe('jpg');
  inspectorFormat.props.onChange({target: {value: 'jpeg'}});
  inspectorFormat.props.onChange({target: {value: ''}});
  expect(onChange.mock.calls).toEqual([[{...params, outputFormat: 'jpeg'}], [{...params, outputFormat: undefined}]]);
  expect(renderToStaticMarkup(<NodeItem {...props}/>)).toContain('本站支持 png/jpeg/webp');
});

it('describes SenseNova U image generation and editing separately from LLM prompt refinement', () => {
  const html = renderToStaticMarkup(<ParameterInspector params={parameters({size: '2K'})} onChange={noop} onOpenCivitai={noop}/>);
  expect(html).toContain('aria-label="SenseNova size"');
  expect(html).toContain('value="2K"');
  expect(html).toContain('图像生成与编辑');
  expect(html).toContain('U 系列');
  expect(html).toContain('LLM');
  expect(html).not.toContain('商汤思考(LLM)');
  expect(html).not.toContain('连线至 FLUX.1 或 SDXL');
});

it.each([false, true, undefined])('renders and updates the two native SenseNova boolean tri-states from %j', value => {
  mockHooks();
  const values = {targetProvider: 'sensenova', ckpt_name: 'custom-image-model', watermark: value, prompt_extend: value};
  const onUpdateValue = vi.fn();
  const nodeTree = NodeItem({...nodeProps(values), onUpdateValue});
  const params = parameters({watermark: value, promptExtend: value});
  const onChange = vi.fn();
  const inspectorTree = ParameterInspector({params, onChange, onOpenCivitai: noop});
  for (const [field, param] of [['watermark', 'watermark'], ['prompt_extend', 'promptExtend']] as const) {
    const label = `SenseNova ${field}`;
    const nodeSelect = nativeControl(nodeTree, label);
    const inspectorSelect = nativeControl(inspectorTree, label);
    for (const select of [nodeSelect, inspectorSelect]) {
      expect(select.type).toBe('select');
      expect(select.props.value).toBe(value === undefined ? '' : String(value));
      expect(elements(select).filter(el => el.type === 'option').map(el => el.props.value)).toEqual(['', 'false', 'true']);
    }
    for (const selected of ['false', 'true', '']) {
      nodeSelect.props.onChange({target: {value: selected}});
      inspectorSelect.props.onChange({target: {value: selected}});
    }
    expect(onUpdateValue.mock.calls.slice(-3)).toEqual([['sense', field, false], ['sense', field, true], ['sense', field, undefined]]);
    expect(onChange.mock.calls.slice(-3)).toEqual([[{...params, [param]: false}], [{...params, [param]: true}], [{...params, [param]: undefined}]]);
  }
  expect(values.watermark).toBe(value);
  expect(values.prompt_extend).toBe(value);
});

it('SSR renders native labels for unset booleans instead of manufacturing false defaults', () => {
  const nodeHtml = renderToStaticMarkup(<NodeItem {...nodeProps({targetProvider: 'sensenova', ckpt_name: 'custom-image-model'})}/>);
  const inspectorHtml = renderToStaticMarkup(<ParameterInspector params={parameters()} onChange={noop} onOpenCivitai={noop}/>);
  for (const html of [nodeHtml, inspectorHtml]) {
    for (const field of ['watermark', 'prompt_extend']) {
      expect(html).toMatch(new RegExp(`<label[^>]*>[\\s\\S]*?<select[^>]*aria-label="SenseNova ${field}"[^>]*><option value="" selected="">`));
    }
    expect(html).toContain('未设置（不显式传）');
  }
});
