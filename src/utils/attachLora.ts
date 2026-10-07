import type {Connection,NodeInstance} from '../types/graph';

// Attach to one execution branch. An independent palette node remains independent.
export function findLoraTarget(nodes:NodeInstance[],connections:Connection[],selectedId?:string|null) {
  const active=nodes.filter(node=>!node.bypassed);
  const engines=active.filter(node=>node.type==='KSampler' || node.type==='FalAIEngineNode');
  const selected=active.find(node=>node.id===selectedId);
  if(selected && engines.some(node=>node.id===selected.id))return selected;
  if(selected){
    const seen=new Set<string>();const todo=[selected.id];const found=new Set<string>();
    while(todo.length){const id=todo.shift()!;if(seen.has(id))continue;seen.add(id);for(const edge of connections.filter(edge=>edge.fromNodeId===id)){
      if(engines.some(node=>node.id===edge.toNodeId))found.add(edge.toNodeId);else todo.push(edge.toNodeId);
    }}
    if(found.size===1)return engines.find(node=>node.id===[...found][0])!;
  }
  if(engines.length===1)return engines[0];
  throw new Error(engines.length ? '有多个生成分支，请先选择要挂载 LoRA 的采样器或底模' : '请先连接底模与 KSampler，再挂载 LoRA');
}
export function removeLoraFromBranch(nodes:NodeInstance[],connections:Connection[],nodeId:string) {
  const target=nodes.find(node=>node.id===nodeId);
  if(target?.type!=='LoRALoader')return {nodes:nodes.filter(node=>node.id!==nodeId),connections:connections.filter(edge=>edge.fromNodeId!==nodeId&&edge.toNodeId!==nodeId)};
  const modelIn=connections.find(edge=>edge.toNodeId===nodeId&&edge.toSocketId==='model');
  const clipIn=connections.find(edge=>edge.toNodeId===nodeId&&edge.toSocketId==='clip');
  const modelOut=connections.filter(edge=>edge.fromNodeId===nodeId&&edge.fromSocketId==='MODEL');
  const clipOut=connections.filter(edge=>edge.fromNodeId===nodeId&&edge.fromSocketId==='CLIP');
  const next=connections.filter(edge=>edge.fromNodeId!==nodeId&&edge.toNodeId!==nodeId);
  if(modelIn)for(const edge of modelOut)next.push({...edge,id:`${modelIn.fromNodeId}-${edge.toNodeId}-${edge.toSocketId}`,fromNodeId:modelIn.fromNodeId,fromSocketId:modelIn.fromSocketId});
  if(clipIn)for(const edge of clipOut)next.push({...edge,id:`${clipIn.fromNodeId}-${edge.toNodeId}-${edge.toSocketId}`,fromNodeId:clipIn.fromNodeId,fromSocketId:clipIn.fromSocketId});
  return {nodes:nodes.filter(node=>node.id!==nodeId),connections:next};
}

export function attachLoraToBranch(nodes:NodeInstance[],connections:Connection[],lora:NodeInstance,selectedId?:string|null) {
  const target=findLoraTarget(nodes,connections,selectedId);
  const input=target.type==='FalAIEngineNode'?'lora':'model';
  const existing=connections.find(edge=>edge.toNodeId===target.id && edge.toSocketId===input);
  if(!existing && target.type==='KSampler')throw new Error('所选采样器没有底模连线，请先连接真实底模');
  const edges=connections.filter(edge=>edge.id!==existing?.id);
  if(existing){
    edges.push({...existing,id:`${lora.id}-model-in`,toNodeId:lora.id,toSocketId:'model'});
    const source=nodes.find(node=>node.id===existing.fromNodeId);
    if(source?.outputs.some(port=>port.id==='CLIP')){
      edges.push({id:`${lora.id}-clip-in`,fromNodeId:source.id,fromSocketId:'CLIP',toNodeId:lora.id,toSocketId:'clip',type:'CLIP'});
      const promptIds=connections.filter(edge=>edge.toNodeId===target.id && ['positive','negative'].includes(edge.toSocketId)).map(edge=>edge.fromNodeId);
      if(promptIds.some(id=>connections.some(edge=>edge.fromNodeId===id && edge.toNodeId!==target.id)))throw new Error('当前提示词节点被其他分支共用，请为此分支复制独立提示词节点后挂载 LoRA');
      for(let i=0;i<edges.length;i++)if(edges[i].fromNodeId===source.id && edges[i].fromSocketId==='CLIP' && promptIds.includes(edges[i].toNodeId))edges[i]={...edges[i],fromNodeId:lora.id};
    }
  }
  edges.push({id:`${lora.id}-model-out`,fromNodeId:lora.id,fromSocketId:'MODEL',toNodeId:target.id,toSocketId:input,type:'MODEL'});
  return {nodes:[...nodes,lora],connections:edges,targetId:target.id};
}