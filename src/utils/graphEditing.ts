import type {Connection,NodeInstance} from '../types/graph';
import {isCloudEngineNode} from './resolveCheckpoint';

// Provider provenance comes from the catalog/history, never from a model name.
export function explicitProvider(value?:string) {
 const raw=String(value || '').trim().toLowerCase();
 const aliases:Record<string,string>={'hugging face':'huggingface','hugging face → fal-ai':'huggingface','tensor.art':'tensorart','tensor':'tensorart','tensor.art (模型 api)':'tensorart','tensor.art (openworks)':'tensorart','tensor.art (openworks video)':'tensorart','google gemini':'gemini','google gemini (官方直连)':'gemini','fal.ai':'fal','fal.ai (gpu 云端加速)':'fal','modelscope cn':'modelscope','modelscope_cn':'modelscope','modelscope cn (魔搭社区)':'modelscope','modelscope ai':'modelscope_ai','modelscope ai (魔搭国际站)':'modelscope_ai','agnes ai (apihub)':'agnes','agnes ai video (apihub)':'agnes','nanogpt video':'nanogpt','openai 兼容中转':'openai_compat','grok 兼容中转':'grok_compat'};
 const provider=aliases[raw] || raw;
 return ['civitai','fal','agnes','sensenova','huggingface','modelscope','modelscope_ai','nanogpt','gemini','tensorart','openai_compat','grok_compat'].includes(provider) ? provider : '';
}

export function graphBranch(nodes:NodeInstance[],connections:Connection[],selectedId?:string|null) {
 const active=nodes.filter(node=>!node.bypassed);
 const engines=active.filter(node=>node.type==='KSampler'||isCloudEngineNode(node));
 const selected=active.find(node=>node.id===selectedId);
 let target=selected && engines.find(node=>node.id===selected.id);
 if(!target && selected){
  const visited=new Set<string>();const queue=[selected.id];const found=new Set<string>();
  while(queue.length){const id=queue.shift()!;if(visited.has(id))continue;visited.add(id);
   for(const edge of connections.filter(edge=>edge.fromNodeId===id)){
    if(!active.some(node=>node.id===edge.toNodeId))continue;
    if(engines.some(node=>node.id===edge.toNodeId))found.add(edge.toNodeId);else queue.push(edge.toNodeId);
   }
  }
  if(found.size>1)return {ids:new Set<string>(),error:'此节点连接多个生成分支，请先选择目标采样器或引擎'};
  if(found.size===1)target=engines.find(node=>found.has(node.id));
  else if(selected.type==='CheckpointLoaderSimple')target=selected;
 }
 if(!target && engines.length===1)target=engines[0];
 if(!target && engines.length>1)return {ids:new Set<string>(),error:'请先选择要编辑的生成分支'};
 if(!target)target=selected || (active.filter(node=>node.type==='CheckpointLoaderSimple').length===1 ? active.find(node=>node.type==='CheckpointLoaderSimple') : undefined);
 const ids=new Set<string>();const queue=target ? [target.id] : [];
 while(queue.length){const id=queue.shift()!;if(ids.has(id))continue;ids.add(id);for(const edge of connections.filter(edge=>edge.toNodeId===id))if(active.some(node=>node.id===edge.fromNodeId))queue.push(edge.fromNodeId);}
 return {target,ids,error:''};
}

export function catalogModelTarget(nodes:NodeInstance[],connections:Connection[],selectedId:string|null,video:boolean) {
 const branch=graphBranch(nodes,connections,selectedId);
 if(branch.error)throw new Error(branch.error);
 const relevant=nodes.filter(node=>!node.bypassed && (video ? node.type==='AIVideoNode' : node.type==='CheckpointLoaderSimple'||(isCloudEngineNode(node)&&node.type!=='AIVideoNode')));
 const chosen=relevant.filter(node=>branch.ids.has(node.id));
 if(chosen.length===1)return chosen[0];
 if(chosen.length>1)throw new Error('所选分支存在多个模型节点，请直接选择目标底模节点');
 if(branch.target)return undefined;
 if(relevant.length===1)return relevant[0];
 if(relevant.length>1)throw new Error('存在多个模型节点，请先选择目标生成分支');
 return undefined;
}
