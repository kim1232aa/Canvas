import React from 'react';
import {it, expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {TopBar} from './TopBar';
import {NodeItem} from './NodeItem';
import {NODE_DEFINITIONS} from '../constants/nodes';
import {nextSeedAfterGeneration} from '../utils/seedControl';
it('shows essential studio actions and explains a disabled run', () => {
  const noop = () => {};
  const html = renderToStaticMarkup(<TopBar nodeCount={4} connectionCount={3} canvasMode="graph" onChangeCanvasMode={noop} onOpenSettings={noop} onOpenCivitai={noop} onQueuePrompt={noop} onSaveProject={noop} onOpenCloudProjects={noop} runDisabledReason="请选择模型" />);
  for (const label of ['API 设置', '保存到云端', '云端项目', '运行工作流', '请选择模型', '历史 API 调用样本']) expect(html).toContain(label);
  expect(html).toContain('在新标签页查看历史 API 调用样本');
  expect(html).toMatch(/disabled=""[^>]*aria-describedby="studio-run-status"/);
});
it('shows supported HF Space controls with the correct provider and no width control', () => {
  const def = NODE_DEFINITIONS.CheckpointLoaderSimple;
  const node = {id:'hf', type:'CheckpointLoaderSimple', title:'HF', pos:{x:0,y:0}, inputs:def.inputs, outputs:def.outputs, values:{targetProvider:'huggingface', ckpt_name:'Tongyi-MAI/Z-Image-Turbo', resolution:'1024x1024 ( 1:1 )', shift:3, random_seed:false, gallery_images:[]}};
  const noop = () => {};
  const html = renderToStaticMarkup(<NodeItem node={node} isSelected={false} zoom={1} onSelect={noop} onStartDrag={noop} onUpdateValue={noop} onDeleteNode={noop} onToggleCollapse={noop} onToggleBypass={noop} onStartConnecting={noop} onEndConnecting={noop} currentProvider="huggingface" currentCheckpoint="Tongyi-MAI/Z-Image-Turbo" />);
  expect(html).toContain('Hugging Face');
  expect(html).toContain('shift');
  expect(html).toContain('使用 KSampler 种子');
  expect(html).toContain('新建本次结果集');
  expect(html).not.toContain('aria-label="width"');
});
it('advances only an actual seed and respects integer boundaries', () => {
  expect(nextSeedAfterGeneration(null, 'increment')).toBeUndefined();
  expect(nextSeedAfterGeneration(42, 'increment')).toBe(43);
  expect(nextSeedAfterGeneration(0, 'decrement')).toBe(0);
  expect(nextSeedAfterGeneration(42, 'fixed')).toBe(42);
});
it('Tensor checkpoint dropdown preserves a custom numeric ID without embedding static model shortcuts',()=>{
  const def=NODE_DEFINITIONS.CheckpointLoaderSimple;const noop=()=>{};
  const node={id:'ta',type:'CheckpointLoaderSimple',title:'Tensor',pos:{x:0,y:0},inputs:def.inputs,outputs:def.outputs,values:{targetProvider:'tensorart',ckpt_name:'936101665537308499'}};
  const html=renderToStaticMarkup(<NodeItem node={node} isSelected={false} zoom={1} onSelect={noop} onStartDrag={noop} onUpdateValue={noop} onDeleteNode={noop} onToggleCollapse={noop} onToggleBypass={noop} onStartConnecting={noop} onEndConnecting={noop} currentProvider="tensorart" currentCheckpoint="936101665537308499"/>);
  expect(html).toContain('936101665537308499');expect(html).not.toContain('990778216270553015');expect(html).not.toContain('strong_text2image');expect(html).not.toContain('photoreal_studio');
});
