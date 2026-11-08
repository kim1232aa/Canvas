// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiParameterEditor } from './ApiParameterEditor';
import { Canvas } from './Canvas';
import { TopBar } from './TopBar';
import { HistoryModal, applyDisabledReason } from './HistoryModal';
import { AssetManagerModal } from './AssetManagerModal';
import { BackendSettingsModal } from './BackendSettingsModal';
import { NodeItem } from './NodeItem';
import { NODE_DEFINITIONS } from '../constants/nodes';
import { clearSharedGet, sharedGetJson } from '../services/sharedGet';
import { schemaRequestFor } from '../services/userModelSelection';
import type { GenerationHistoryItem } from '../types/providers';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const noop = () => {};
const asyncOk = async () => ({ ok: true as const });

describe('restored UI controls', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    clearSharedGet();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })));
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    clearSharedGet();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('edits free JSON, reloads the official schema, and inserts a schema field', async () => {
    const provider = 'fal';
    const model = 'schema-model';
    const { url, headers } = schemaRequestFor(provider, model);
    const body = JSON.stringify({ inputSchema: { properties: { image_size: { type: 'string', default: 'square_hd', description: '画幅' }, num_inference_steps: { type: 'integer', default: 8 }, model: { type: 'string' } } } });
    await sharedGetJson(url, headers, { fetchImpl: vi.fn().mockResolvedValue(new Response(body, { status: 200, headers: { 'content-type': 'application/json' } })) }).catch(() => {});
    const onChange = vi.fn();
    await act(async () => { root.render(<ApiParameterEditor provider={provider} model={model} value={'{"image_size":"square_hd","num_inference_steps":8}'} onChange={onChange} />); });
    const area = host.querySelector('textarea[aria-label="自定义 API 参数 JSON"]') as HTMLTextAreaElement;
    expect(area.value).toBe('{"image_size":"square_hd","num_inference_steps":8}');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')!.set!;
    await act(async () => { setter.call(area, '{"image_size":"square_hd","num_inference_steps":8,"seed":1}'); area.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith('{"image_size":"square_hd","num_inference_steps":8,"seed":1}');

    const refresh = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('读取所选模型的官方 Schema'));
    expect(refresh).toBeTruthy();
    const steps = [...host.querySelectorAll('button')].find((b) => b.textContent === 'num_inference_steps');
    expect(steps).toBeTruthy();
    await act(async () => { root.render(<ApiParameterEditor provider={provider} model={model} value={'{"image_size":"square_hd"}'} onChange={onChange} />); });
    const stepsBtn = [...host.querySelectorAll('button')].find((b) => b.textContent === 'num_inference_steps');
    await act(async () => { stepsBtn!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith(JSON.stringify({ image_size: 'square_hd', num_inference_steps: 8 }, null, 2));
    expect([...host.querySelectorAll('button')].some((b) => b.textContent === 'model')).toBe(false);
  });

  it('lists the AI video node in the canvas add menu and adds it', async () => {
    const onAddNode = vi.fn();
    await act(async () => {
      root.render(<Canvas canvasMode="graph" nodes={[]} connections={[]} spatialFrames={[]} transform={{ x: 0, y: 0, scale: 1 }} selectedNodeId={null} selectedFrameId={null} onSelectNode={noop} onSelectFrame={noop} onUpdateTransform={noop} onUpdateNodePos={noop} onUpdateNodeValue={noop} onDeleteNode={noop} onToggleCollapse={noop} onToggleBypass={noop} onAddConnection={noop} onDeleteConnection={noop} onAddNode={onAddNode} onUpdateFramePos={noop} onUpdateFrame={noop} onDeleteFrame={noop} onQueueFrame={noop} onOpenFrameInspector={noop} onBranchVariation={noop} onOpenCivitaiPicker={noop} onPreviewImage={noop} />);
    });
    const surface = host.querySelector('[class*="cursor-default"]') as HTMLElement;
    surface.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
    await act(async () => {});
    const video = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes(NODE_DEFINITIONS.AIVideoNode.title));
    expect(video).toBeTruthy();
    await act(async () => { video!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onAddNode).toHaveBeenCalledWith('AIVideoNode', expect.any(Object));
  });

  it('does not render the base-model pairing button when the matcher has no recommendation', () => {
    const node = { id: 'l', type: 'LoRALoader', title: 'LoRA', pos: { x: 0, y: 0 }, inputs: NODE_DEFINITIONS.LoRALoader.inputs, outputs: NODE_DEFINITIONS.LoRALoader.outputs, values: { lora_name: 'some-lora', base_model: 'SDXL 1.0' } };
    const html = host.ownerDocument.createElement('div');
    // renderToStaticMarkup path via the mounted root
    return act(async () => { root.render(<NodeItem node={node as any} isSelected={false} zoom={1} onSelect={noop} onStartDrag={noop} onUpdateValue={noop} onDeleteNode={noop} onToggleCollapse={noop} onToggleBypass={noop} onStartConnecting={noop} onEndConnecting={noop} currentCheckpoint="black-forest-labs/FLUX.1-dev" currentProvider="fal" onAutoFixCheckpoint={vi.fn()} />); }).then(() => {
      expect(host.textContent).not.toContain('一键自动配对前置底模');
      void html;
    });
  });

  it('opens the provider matrix, the shortcut guide, and confirms clearing everything', async () => {
    const onOpenProviderMatrix = vi.fn();
    const onClearCanvas = vi.fn();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await act(async () => {
      root.render(<TopBar nodeCount={1} connectionCount={0} canvasMode="graph" onChangeCanvasMode={noop} onOpenSettings={noop} onOpenCivitai={noop} onOpenProviderMatrix={onOpenProviderMatrix} onClearCanvas={onClearCanvas} />);
    });
    const matrix = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('供应商矩阵'));
    await act(async () => { matrix!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onOpenProviderMatrix).toHaveBeenCalledOnce();
    const more = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('更多'));
    await act(async () => { more!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const help = [...host.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === '快捷键与画布操作指南');
    await act(async () => { help!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(host.textContent).toContain('画布快捷键与操作');
    expect(host.textContent).toContain('Ctrl / Cmd + Enter');
    const clearAll = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('一键清空全部'));
    await act(async () => { clearAll!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onClearCanvas).toHaveBeenCalledWith('all');
  });

  it('keeps 照这组参数再来一张 enabled when the preview is broken but a media url exists', async () => {
    const item = { id: 'h1', url: 'https://example.test/out.png', prompt: 'a cat', seed: 1, steps: 20, cfg: 4, timestamp: 1 } as GenerationHistoryItem;
    expect(applyDisabledReason(item, true)).toBe('');
    expect(applyDisabledReason({ ...item, url: '' }, false)).not.toBe('');
    const onApply = vi.fn();
    await act(async () => {
      root.render(<HistoryModal isOpen onClose={noop} history={[item]} onApplyPrompt={noop} onApplyToCanvas={onApply} onDeleteItem={noop} onClearAll={noop} />);
    });
    const again = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('照这组参数再来一张')) as HTMLButtonElement;
    expect(again.disabled).toBe(false);
    await act(async () => { again.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onApply).toHaveBeenCalledOnce();
  });

  it('keeps 送入画板 enabled for an asset whose preview failed to load', async () => {
    const item = { id: 'a1', url: 'https://example.test/missing.png', prompt: 'a dog', seed: 2, steps: 10, cfg: 3, provider: 'fal', model: 'm', timestamp: 2 } as GenerationHistoryItem;
    const onAdd = vi.fn();
    await act(async () => {
      root.render(<AssetManagerModal isOpen onClose={noop} history={[item]} onAddToCanvasAsFrame={onAdd} onUseAsReference={noop} onPreviewImage={noop} onDeleteAsset={asyncOk} />);
    });
    const send = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('送入画板')) as HTMLButtonElement;
    expect(send).toBeTruthy();
    expect(send.disabled).toBe(false);
  });

  it('fills only empty key fields with a local placeholder', async () => {
    const onSave = vi.fn();
    await act(async () => {
      root.render(<BackendSettingsModal isOpen onClose={noop} apiKeys={{ falKey: 'already-set', civitaiKey: '', hfToken: '', modelscopeToken: '', nanogptKey: '', geminiKey: '' }} onSaveKeys={onSave} />);
    });
    const fill = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('一键填入测试 Key')) as HTMLButtonElement;
    expect(fill.title).toContain('本地测试');
    await act(async () => { fill.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    // Keys render masked (first/last chars), never as a raw input value.
    expect(host.textContent).toContain('alre...-set');
    const civitai = [...host.querySelectorAll('button')].find((b) => b.textContent?.includes('Civitai'));
    await act(async () => { civitai!.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(host.textContent).toContain('本地***');
  });
});
