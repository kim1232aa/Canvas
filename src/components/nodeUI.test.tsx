import React from 'react';
import {it,expect,vi,afterEach} from 'vitest';
import {renderToStaticMarkup} from 'react-dom/server';
import {NodeItem} from './NodeItem';
import {ParameterInspector} from './ParameterInspector';
import {NODE_DEFINITIONS} from '../constants/nodes';
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
 const html=renderToStaticMarkup(<NodeItem {...props('LoRALoader',{lora_name:'custom'})} currentProvider="civitai" currentCheckpoint="custom"/>);
 expect(html).toContain('兼容性待验证');expect(html).not.toContain('底模兼容');
 const params:any={checkpoint:'custom',targetProvider:'civitai',loras:[{name:'custom',modelStrength:0,clipStrength:0}],width:1,height:1,batchSize:1};
 const inspector=renderToStaticMarkup(<ParameterInspector params={params} onChange={noop} onOpenCivitai={noop}/>);
 expect(inspector).toContain('待验证');expect(inspector).not.toContain('bg-emerald-950/60');
});
