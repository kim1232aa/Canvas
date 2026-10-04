import type {NodeInstance, SpatialFrame} from '../types/graph';
// Retire only known old tool selectors on load, never replace them with another model.
export function isLegacyTensorTool(value: unknown) {
  return typeof value === 'string' && /^(strong_text2image_|photoreal_studio_|anime_lab_|oc_character_illustration$|text2video_|image2video_|live_wallpaper$)/.test(value);
}
export function migrateTensorWorkflow<T extends {nodes:NodeInstance[];spatialFrames?:SpatialFrame[]}>(workflow:T):T {
  return {...workflow,
    nodes:workflow.nodes.map(node=>{
      const values=node.values;
      if(!values || !['tensorart','tensor'].includes(values.targetProvider || values.provider))return node;
      const retired=Object.fromEntries(['ckpt_name','model','toolName'].filter(key=>isLegacyTensorTool(values[key])).map(key=>[key,values[key]]));
      if(!Object.keys(retired).length)return node;
      return {...node,title:'Tensor.Art · 请选择模型',state:'idle' as const,errorMessage:undefined,values:{...values,...Object.fromEntries(Object.keys(retired).map(key=>[key,''])),retiredToolSelection:retired}};
    }),
    ...(workflow.spatialFrames ? {spatialFrames:workflow.spatialFrames.map(frame=>{
      if(!['tensorart','tensor'].includes(frame.params?.targetProvider) || !isLegacyTensorTool(frame.params.checkpoint))return frame;
      return {...frame,title:'Tensor.Art · 请选择模型',status:'idle' as const,params:{...frame.params,checkpoint:'',retiredToolSelection:{checkpoint:frame.params.checkpoint}}};
    })} : {}),
  };
}
