import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {NodeItem} from './NodeItem';
import {ParameterInspector} from './ParameterInspector';
import {NODE_DEFINITIONS} from '../constants/nodes';
import { historyFacingErrorMessage } from '../utils/apiFailure';
import { upstreamFailedLine } from '../utils/schemaFailure';
const noop=()=>{};
const props=(type:string,values:any={})=>({node:{id:'n',type,title:type,pos:{x:0,y:0},inputs:NODE_DEFINITIONS[type].inputs,outputs:NODE_DEFINITIONS[type].outputs,values},isSelected:false,zoom:1,onSelect:noop,onStartDrag:noop,onUpdateValue:noop,onDeleteNode:noop,onToggleCollapse:noop,onToggleBypass:noop,onStartConnecting:noop,onEndConnecting:noop});
const elements=(tree:any):any[]=>!tree?[]:Array.isArray(tree)?tree.flatMap(elements):typeof tree==='object'&&tree.props?[tree,...elements(tree.props.children)]:[];
afterEach(()=>vi.restoreAllMocks());
it('renders a native keyboard-activatable upload button and its click callback opens the file input',()=>{
 const p=props('LoadImage');const html=renderToStaticMarkup(<NodeItem {...p}/>);
 expect(html).toMatch(/<button[^>]*type="button"[^>]*>[\s\S]*?上传本地图片/);
 const click=vi.fn();vi.spyOn(React,'useRef').mockReturnValue({current:{click}} as any);vi.spyOn(React,'useState').mockImplementation(((value:any)=>[value,noop]) as any);
 const tree=NodeItem(p);const button=elements(tree).find(el=>el.type==='button'&&elements(el).some(child=>child.props.children==='上传本地图片'));
 expect(button).toBeDefined();button.props.onClick({stopPropagation:noop});expect(click).toHaveBeenCalledOnce();
});
it('unknown compatibility renders neutral pending labels in both node and inspector',()=>{
 // modelscope + unknown LoRA base → unverified (civitai/custom may hit endpointUnsupported instead)
 const html=renderToStaticMarkup(<NodeItem {...props('LoRALoader',{lora_name:'suayptalha/Z-Image-Turbo-Realism-LoRA'})} currentProvider="modelscope" currentCheckpoint="Tongyi-MAI/Z-Image-Turbo"/>);
 expect(html).not.toContain('还不确定这个 LoRA');expect(html).not.toContain('底模兼容');expect(html).not.toContain('兼容性待验证');
 const params:any={checkpoint:'Tongyi-MAI/Z-Image-Turbo',targetProvider:'modelscope',loras:[{name:'suayptalha/Z-Image-Turbo-Realism-LoRA',modelStrength:1,clipStrength:1}],width:1,height:1,batchSize:1};
 const inspector=renderToStaticMarkup(<ParameterInspector params={params} onChange={noop} onOpenCivitai={noop}/>);
 expect(inspector).not.toContain('待验证');expect(inspector).not.toContain('还不确定');expect(inspector).not.toContain('bg-emerald-950/60');
 expect(inspector).not.toContain('不匹配'); // unverified must not show contradiction chip
});

it('Chinese field labels for LoRA / KSampler / SaveImage widgets (no raw EN keys)',()=>{
  const lora=renderToStaticMarkup(<NodeItem {...props('LoRALoader',{lora_name:'79tzf61yz',strength_model:0.8})} currentProvider="krea"/>);
  expect(lora).toContain('触发词');
  expect(lora).not.toContain('Civitai 编号');
  const loraCivitai=renderToStaticMarkup(<NodeItem {...props('LoRALoader',{lora_name:'79tzf61yz',strength_model:0.8})} currentProvider="civitai"/>);
  expect(loraCivitai).toContain('Civitai 编号');
  const loraAiml=renderToStaticMarkup(<NodeItem {...props('LoRALoader',{lora_name:'ostris/z_image_turbo_childrens_drawings',strength_model:0.85})} currentProvider="aimlapi"/>);
  expect(loraAiml).not.toContain('Civitai 编号');
  expect(lora).toContain('LoRA 名称');
  expect(lora).toContain('LoRA 强度');
  expect(lora).not.toMatch(/>trigger_words</);
  expect(lora).not.toMatch(/>civitai_id</);
  expect(lora).not.toMatch(/>lora_name</);
  expect(lora).not.toMatch(/>strength_model</);
  const ks=renderToStaticMarkup(<NodeItem {...props('KSampler',{seed:1,steps:20,cfg:4.5,sampler_name:'euler',scheduler:'normal',denoise:1})} currentProvider="krea"/>);
  expect(ks).toContain('步数');
  expect(ks).toContain('采样器');
  expect(ks).toContain('调度器');
  expect(ks).toContain('去噪强度');
  expect(ks).not.toMatch(/>steps</);
  expect(ks).not.toMatch(/>sampler_name</);
  const save=renderToStaticMarkup(<NodeItem {...props('SaveImage',{filename_prefix:'ComfyCanvas'})}/>);
  expect(save).toContain('文件名前缀');
  expect(save).not.toMatch(/>filename_prefix</);
});





it('SaveImage success/waiting preview keeps aspect-video overflow-hidden',()=>{
  const waiting=renderToStaticMarkup(<NodeItem {...props('SaveImage',{})} />);
  expect(waiting).toContain('data-testid="media-preview"');
  expect(waiting).toContain('aspect-video');
  expect(waiting).toContain('overflow-hidden');
  const success=renderToStaticMarkup(<NodeItem {...props('SaveImage',{})} node={{...(props('SaveImage',{}) as any).node,outputData:'https://example.com/out.png',state:'success'}} />);
  expect(success).toContain('data-testid="media-preview"');
  expect(success).toContain('aspect-video');
  expect(success).toContain('overflow-hidden');
});

it('Mage checkpoint surfaces aspect_ratio/resolution from preset; EmptyLatent hides blank WH shells', () => {
  const cp = JSON.stringify({
    _canvas: {
      scope: { provider: 'mage', model: 'mango-v3' },
      schemaProperties: ['prompt', 'seed', 'aspect_ratio', 'resolution'],
    },
  });
  const ckpt = renderToStaticMarkup(
    <NodeItem
      {...props('CheckpointLoaderSimple', {
        ckpt_name: 'mango-v3',
        targetProvider: 'mage',
        aspect_ratio: '4:5',
        resolution: '2K',
        custom_parameters: cp,
      })}
      currentProvider="mage"
      currentCheckpoint="mango-v3"
      schemaCustomParameters={cp}
    />,
  );
  expect(ckpt).toContain('data-testid="ckpt-aspect_ratio"');
  expect(ckpt).toContain('4:5');
  expect(ckpt).toContain('data-testid="ckpt-resolution"');
  expect(ckpt).toContain('2K');

  const lat = renderToStaticMarkup(
    <NodeItem
      {...props('EmptyLatentImage', { batch_size: 1 })}
      currentProvider="mage"
      currentCheckpoint="mango-v3"
      schemaCustomParameters={cp}
    />,
  );
  // omit width/height + empty → no blank shells; batch_size stays
  expect(lat).not.toContain('data-testid="widget-label-width"');
  expect(lat).not.toContain('data-testid="widget-label-height"');
  expect(lat).toContain('data-testid="widget-label-batch_size"');
});

it('DeepInfra omit seed hides empty seed/seed_mode shells; Mage filled seed 42 stays', () => {
  const diCp = JSON.stringify({
    _canvas: {
      scope: { provider: 'deepinfra', model: 'black-forest-labs/FLUX-1-schnell' },
      schemaProperties: ['prompt', 'width', 'height', 'size', 'image_size'],
    },
  });
  const di = renderToStaticMarkup(
    <NodeItem
      {...props('KSampler', {})}
      currentProvider="deepinfra"
      currentCheckpoint="black-forest-labs/FLUX-1-schnell"
      schemaCustomParameters={diCp}
    />,
  );
  expect(di).not.toContain('data-testid="widget-label-seed"');
  expect(di).not.toContain('未设置');
  expect(di).not.toContain('data-testid="widget-label-control_after_generate"');

  const mageCp = JSON.stringify({
    _canvas: {
      scope: { provider: 'mage', model: 'mango-v3' },
      schemaProperties: ['prompt', 'seed', 'aspect_ratio', 'resolution'],
    },
  });
  const mage = renderToStaticMarkup(
    <NodeItem
      {...props('KSampler', { seed: 42, control_after_generate: 'fixed' })}
      currentProvider="mage"
      currentCheckpoint="mango-v3"
      schemaCustomParameters={mageCp}
    />,
  );
  expect(mage).toContain('data-testid="widget-label-seed"');
  expect(mage).toMatch(/value="42"|42/);
  expect(mage).not.toContain('node-filled-not-sent-seed');
});

it('Agnes checkpoint surfaces size + aspect_ratio from preset (no invented options)', () => {
  const ckpt = renderToStaticMarkup(
    <NodeItem
      {...props('CheckpointLoaderSimple', {
        ckpt_name: 'agnes-image-2.5-flash',
        targetProvider: 'agnes',
        aspect_ratio: '1:1',
        size: '2K',
      })}
      currentProvider="agnes"
      currentCheckpoint="agnes-image-2.5-flash"
    />,
  );
  expect(ckpt).toContain('data-testid="ckpt-aspect_ratio"');
  expect(ckpt).toContain('1:1');
  expect(ckpt).toContain('data-testid="ckpt-size"');
  expect(ckpt).toContain('2K');
});

it('HF fal-ai route hides empty Z-Image Space-only controls (no blank shells / false 必填); Space route still shows them', () => {
  const v = { ckpt_name: 'Tongyi-MAI/Z-Image-Turbo', targetProvider: 'huggingface' };
  const fal = renderToStaticMarkup(<NodeItem {...props('CheckpointLoaderSimple', { ...v, hf_provider: 'fal-ai' })} currentProvider="huggingface" currentCheckpoint="Tongyi-MAI/Z-Image-Turbo"/>);
  expect(fal).not.toContain('未选择（不传）');
  expect(fal).not.toContain('必填；官方默认 3.0');
  expect(fal).not.toContain('使用 KSampler 种子');
  expect(fal).not.toContain('新建本次结果集');
  const space = renderToStaticMarkup(<NodeItem {...props('CheckpointLoaderSimple', { ...v, hf_provider: 'z-image-space' })} currentProvider="huggingface" currentCheckpoint="Tongyi-MAI/Z-Image-Turbo"/>);
  expect(space).toContain('使用 KSampler 种子');
});

