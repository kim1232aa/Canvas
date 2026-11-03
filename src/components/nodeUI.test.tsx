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

it('SaveImage shows failed state (not 等待生成图像) after upstream failure',()=>{
  const html=renderToStaticMarkup(<NodeItem {...props('SaveImage',{})} node={{...(props('SaveImage',{}) as any).node,upstreamFailed:true,state:'idle'}} />);
  expect(html).toContain('没出图');
  expect(html).not.toContain('等待生成图像');
});

it('SaveImage shows upstream error text verbatim when provided',()=>{
  const msg='Please bind your Alibaba Cloud account before use.';
  const html=renderToStaticMarkup(<NodeItem {...props('SaveImage',{})} node={{...(props('SaveImage',{}) as any).node,upstreamFailed:true,upstreamFailedTitle:'采样器',upstreamFailedMessage:msg,state:'idle'}} />);
  expect(html).toContain(msg);
  expect(html).not.toContain('原因见采样器');
  expect(html).not.toContain('等待生成图像');
});

it('SaveImage failure display uses historyFacingErrorMessage (Magento bind / JSON body)',()=>{
  const histError='魔搭国际站 (modelscope.ai) API 提交失败 [401]: {"errors":{"message":"Please bind your Alibaba Cloud account before use. You can bind it at: https://modelscope.ai/my/settings/account"},"request_id":"abc"}';
  const err={data:{error:histError,historyItem:{error:histError},upstreamStatus:401,upstreamResponseBody:'{"errors":{"message":"Please bind your Alibaba Cloud account before use."}}'}};
  const msg=historyFacingErrorMessage(err)!;
  expect(msg).toContain('bind your Alibaba Cloud account');
  expect(msg).toContain('"errors"');
  expect(upstreamFailedLine('采样器', msg)).toBe(msg);
  const html=renderToStaticMarkup(<NodeItem {...props('SaveImage',{})} node={{...(props('SaveImage',{}) as any).node,upstreamFailed:true,upstreamFailedTitle:'采样器',upstreamFailedMessage:msg,state:'idle'}} />);
  expect(html).toContain('bind your Alibaba Cloud account');
  expect(html).toContain('魔搭国际站');
  expect(html).not.toContain('原因见采样器');
  expect(html).not.toMatch(/>HTTP 401 Unauthorized</);
});

it('SaveImage upstream-fail preview is scrollable (not aspect-video clip box)',()=>{
  const msg='魔搭国际站 (modelscope.ai) API 提交失败 [401]: {"errors":{"message":"Please bind your Alibaba Cloud account before use. You can bind it at: https://modelscope.ai/my/settings/account"},"request_id":"abc"}';
  const html=renderToStaticMarkup(<NodeItem {...props('SaveImage',{})} node={{...(props('SaveImage',{}) as any).node,upstreamFailed:true,upstreamFailedTitle:'采样器',upstreamFailedMessage:msg,state:'idle'}} />);
  expect(html).toContain('data-testid="upstream-fail-preview"');
  expect(html).toContain('overflow-y-auto');
  expect(html).toContain('min-h-[9rem]');
  expect(html).toContain('max-h-80');
  expect(html).toContain('items-start');
  expect(html).toContain('justify-start');
  expect(html).toContain('text-left');
  // failure box must not force aspect-video / overflow-hidden clip
  const failChunk=html.split('data-testid="upstream-fail-preview"')[1].split('role="status"')[0];
  expect(failChunk).not.toContain('aspect-video');
  expect(failChunk).not.toContain('overflow-hidden');
  expect(html).toContain('bind your Alibaba Cloud account');
  expect(html).toContain('魔搭国际站');
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
