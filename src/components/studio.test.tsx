import React from 'react';
import {it, expect} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {TopBar} from './TopBar';
import {NodeItem} from './NodeItem';
import {NODE_DEFINITIONS} from '../constants/nodes';
import {nextSeedAfterGeneration} from '../utils/seedControl';
import {ParameterInspector} from './ParameterInspector';
it('new generation nodes do not preselect a model or Civitai engine',()=>{
  for(const type of ['CheckpointLoaderSimple','FalAIEngineNode','ModelScopeNode','ModelScopeAiNode','NanoGPTNode','AIVideoNode']) {
    const def=NODE_DEFINITIONS[type];
    expect(def.defaultValues.ckpt_name || def.defaultValues.model || def.defaultValues.model_endpoint || '').toBe('');
  }
});
it('inspector retains custom ecosystem and explicit video provider controls',()=>{
  const noop=()=>{};
  const params={checkpoint:'custom-video',targetProvider:'video' as const,videoProvider:'fal',denoise:0,width:1024,height:1024,batchSize:1,seedControl:'fixed' as const,loras:[]};
  const html=renderToStaticMarkup(<ParameterInspector params={params} onChange={noop} onOpenCivitai={noop} />);
  expect(html).toContain('实际视频服务商');expect(html).toContain('视频 resolution');expect(html).toContain('视频自定义参数 JSON');
  const civ=renderToStaticMarkup(<ParameterInspector params={{...params,targetProvider:'civitai',civitaiEngine:'comfy',civitaiEcosystem:'custom-ecosystem',civitaiModel:'custom-model'}} onChange={noop} onOpenCivitai={noop} />);
  expect(civ).toContain('custom-ecosystem');expect(civ).toContain('custom-model');expect(civ).toContain('Civitai engine');
  expect(civ).toContain('aria-label="自定义 API 参数 JSON"');
  expect(civ).not.toContain('读取所选模型的官方 Schema');
});
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
it('shows a stale resolution explicitly when switching a checkpoint to the Grok relay', () => {
  const def = NODE_DEFINITIONS.CheckpointLoaderSimple;
  const staleResolution = '1024x1024 ( 1:1 )';
  const noop = () => {};
  const node = {id:'grok',type:'CheckpointLoaderSimple',title:'Grok relay',pos:{x:0,y:0},inputs:def.inputs,outputs:def.outputs,values:{targetProvider:'grok_compat',ckpt_name:'grok-imagine-image',resolution:staleResolution}};
  const html = renderToStaticMarkup(<NodeItem node={node} isSelected={false} zoom={1} onSelect={noop} onStartDrag={noop} onUpdateValue={noop} onDeleteNode={noop} onToggleCollapse={noop} onToggleBypass={noop} onStartConnecting={noop} onEndConnecting={noop} currentProvider="grok_compat" currentCheckpoint="grok-imagine-image" />);
  expect(html).toContain(staleResolution);
  expect(html).toContain('旧值与当前模型不兼容');
  expect(html).toContain('value="1k"');
});
it('uses model-specific duration bounds and keeps custom Civitai recipe selectors visible', () => {
  const noop = () => {};
  const render = (type: string, values: Record<string, unknown>) => {
    const def=NODE_DEFINITIONS[type];
    return renderToStaticMarkup(<NodeItem node={{id:'n',type,title:type,pos:{x:0,y:0},inputs:def.inputs,outputs:def.outputs,values}} isSelected={false} zoom={1} onSelect={noop} onStartDrag={noop} onUpdateValue={noop} onDeleteNode={noop} onToggleCollapse={noop} onToggleBypass={noop} onStartConnecting={noop} onEndConnecting={noop} currentProvider={String(values.targetProvider)} currentCheckpoint={String(values.model || values.ckpt_name)} />);
  };
  const video=render('AIVideoNode',{targetProvider:'fal',model:'fal-ai/kling-video/v3/standard/image-to-video',duration:12});
  expect(video).toMatch(/type="number" min="3" max="15"/);
  const unknown=render('AIVideoNode',{targetProvider:'fal',model:'custom-video',duration:20,fps:30});
  expect(unknown).not.toMatch(/type="number" min="5" max="24"/);
  const civitai=render('CheckpointLoaderSimple',{targetProvider:'civitai',ckpt_name:'custom',civitai_ecosystem:'custom-ecosystem'});
  expect(civitai).toContain('Civitai engine');
  expect(civitai).toContain('Civitai ecosystem');
  expect(civitai).toContain('Civitai model');
  expect(civitai).toContain('custom-ecosystem');
  expect(civitai).toContain('aria-label="自定义 API 参数 JSON"');
  expect(civitai).not.toContain('读取所选模型的官方 Schema');
  expect(render('CheckpointLoaderSimple',{targetProvider:'fal',ckpt_name:'custom'})).not.toContain('Civitai engine');
  const blocked=render('AIVideoNode',{targetProvider:'civitai',model:'',execution_blocked_reason:'来源执行链尚未接入',require_reference_image:true});
  expect(blocked).toContain('来源执行链尚未接入');expect(blocked).toContain('仅载入，不能立即运行');expect(blocked).toContain('编辑输入需要明确参考图');
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
