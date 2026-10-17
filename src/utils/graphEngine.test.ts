import { isCanvasFieldUnsupported } from './resolveCheckpoint';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractWorkflowParameters, executeWorkflow, resolveTargetNode, sanitizeExecutionSnapshotNodes, shouldClearExecutionOutput, clearNodeExecutionErrors } from './graphEngine';
import { Connection, NodeInstance } from '../types/graph';
import { EngineRegistry } from '../engines/EngineRegistry';
import { NormalizedGenerateResult } from '../engines/types';
import * as api from '../services/api';

describe('graphEngine - B2 & L2a & L2b 拓扑反向追踪与参数抽取隔离测试', () => {
  it('takes recipe and guards from the model-chain checkpoint rather than CLIP-source checkpoint',()=>{
    const a=createNode('a','CheckpointLoaderSimple',{ckpt_name:'A',targetProvider:'civitai',civitai_engine:'sdcpp',import_unresolved_resource:true});
    const b=createNode('b','CheckpointLoaderSimple',{ckpt_name:'B',targetProvider:'civitai',civitai_engine:'comfy'});
    const p=createNode('p','CLIPTextEncode',{text:'test'}),k=createNode('k','KSampler',{});
    const edges:Connection[]=[{id:'ap',fromNodeId:'a',fromSocketId:'CLIP',toNodeId:'p',toSocketId:'clip',type:'CLIP'},{id:'pk',fromNodeId:'p',fromSocketId:'CONDITIONING',toNodeId:'k',toSocketId:'positive',type:'CONDITIONING'},{id:'bk',fromNodeId:'b',fromSocketId:'MODEL',toNodeId:'k',toSocketId:'model',type:'MODEL'}];
    expect(extractWorkflowParameters([a,b,p,k],edges,'a')).toMatchObject({checkpointModel:'B',civitaiEngine:'comfy'});
  });
  it('never clears or overwrites a SaveImage used as upstream video input',async()=>{
    const input={...createNode('input','SaveImage',{}),outputData:'https://example.test/input.png'};
    const video=createNode('v','AIVideoNode',{model:'fal-ai/wan/v2.7/image-to-video',targetProvider:'fal',prompt:'test'});
    const edges:Connection[]=[{id:'i',fromNodeId:'input',fromSocketId:'images',toNodeId:'v',toSocketId:'init_image',type:'IMAGE'}];
    vi.spyOn(EngineRegistry,'generate').mockResolvedValue({mediaUrl:'https://example.test/out.mp4',mediaType:'video',provider:'fal',providerId:'video',model:video.values.model,seed:null});
    const touched:string[]=[];await executeWorkflow([input,video],edges,id=>touched.push(id),undefined,'v');
    expect(touched).not.toContain('input');
  });
  it('guards unresolved models and pending video source chains independently of connected LoRAs',()=>{
    expect(()=>extractWorkflowParameters([createNode('c','CheckpointLoaderSimple',{ckpt_name:'original',targetProvider:'civitai',prompt:'test',import_unresolved_resource:true})],[])).toThrow(/底模.*重新选择/);
    expect(()=>extractWorkflowParameters([createNode('v','AIVideoNode',{model:'fal-ai/minimax/video-01',targetProvider:'fal',prompt:'test',source_lora_air:'original-source',execution_blocked_reason:'来源执行链尚未接入'})],[])).toThrow(/来源执行链尚未接入/);
    expect(()=>extractWorkflowParameters([createNode('v','AIVideoNode',{model:'fal-ai/minimax/video-01',targetProvider:'fal',prompt:'test',source_lora_air:'original-source'})],[])).toThrow(/来源.*执行链/);
  });
  it('pendingRecipe execution_blocked_reason locks extract until a real LoRA is hung', () => {
    const ckpt = createNode('c', 'CheckpointLoaderSimple', {
      ckpt_name: 'flux-1-dev-style-lora-inference',
      targetProvider: 'muapi',
      execution_blocked_reason: '官方要真 LoRA 地址（训练任务返回的那种），配方里还没有；载入后挂上再运行。',
    });
    const pos = createNode('p', 'CLIPTextEncode', { text: '填入配方/用户指定' });
    const samp = createNode('k', 'KSampler', {});
    const save = createNode('s', 'SaveImage', { filename_prefix: 'std_muapi' });
    const edgesNoLora: Connection[] = [
      { id: 'cm', fromNodeId: 'c', fromSocketId: 'MODEL', toNodeId: 'k', toSocketId: 'model', type: 'MODEL' },
      { id: 'cp', fromNodeId: 'c', fromSocketId: 'CLIP', toNodeId: 'p', toSocketId: 'clip', type: 'CLIP' },
      { id: 'pk', fromNodeId: 'p', fromSocketId: 'CONDITIONING', toNodeId: 'k', toSocketId: 'positive', type: 'CONDITIONING' },
      { id: 'ks', fromNodeId: 'k', fromSocketId: 'LATENT', toNodeId: 's', toSocketId: 'images', type: 'LATENT' },
    ];
    expect(() => extractWorkflowParameters([ckpt, pos, samp, save], edgesNoLora, 's')).toThrow(/官方要真 LoRA 地址/);
    // Empty prompt + pendingRecipe: LoRA reason must win over 请填写提示词 (was masked before).
    const emptyPos = createNode('p', 'CLIPTextEncode', { text: '' });
    expect(() => extractWorkflowParameters([ckpt, emptyPos, samp, save], edgesNoLora, 's')).toThrow(/真 LoRA 地址.*载入后挂上/);
    expect(() => extractWorkflowParameters([ckpt, emptyPos, samp, save], edgesNoLora, 'k')).toThrow(/真 LoRA 地址/);
    const lora = createNode('l', 'LoRALoader', {
      lora_name: 'https://example.test/real-lora.safetensors',
      strength_model: 1,
      strength_clip: 1,
    });
    const edgesWithLora: Connection[] = [
      { id: 'cl', fromNodeId: 'c', fromSocketId: 'MODEL', toNodeId: 'l', toSocketId: 'model', type: 'MODEL' },
      { id: 'clc', fromNodeId: 'c', fromSocketId: 'CLIP', toNodeId: 'l', toSocketId: 'clip', type: 'CLIP' },
      { id: 'lk', fromNodeId: 'l', fromSocketId: 'MODEL', toNodeId: 'k', toSocketId: 'model', type: 'MODEL' },
      { id: 'lp', fromNodeId: 'l', fromSocketId: 'CLIP', toNodeId: 'p', toSocketId: 'clip', type: 'CLIP' },
      { id: 'pk', fromNodeId: 'p', fromSocketId: 'CONDITIONING', toNodeId: 'k', toSocketId: 'positive', type: 'CONDITIONING' },
      { id: 'ks', fromNodeId: 'k', fromSocketId: 'LATENT', toNodeId: 's', toSocketId: 'images', type: 'LATENT' },
    ];
    expect(extractWorkflowParameters([ckpt, lora, pos, samp, save], edgesWithLora, 's')).toMatchObject({
      checkpointModel: 'flux-1-dev-style-lora-inference',
      targetProvider: 'muapi',
    });
  });
  it('requires explicit reference input for editing checkpoints even when a thumbnail exists',()=>{
    const c=createNode('c','CheckpointLoaderSimple',{ckpt_name:'agnes-image-2.5',targetProvider:'agnes',prompt:'test',require_reference_image:true});
    expect(()=>extractWorkflowParameters([c],[])).toThrow(/编辑输入.*参考图/);
    const k=createNode('k','KSampler',{prompt:'test'}),image=createNode('i','LoadImage',{image_url:'reference.png'});
    const edges:Connection[]=[{id:'m',fromNodeId:'c',fromSocketId:'MODEL',toNodeId:'k',toSocketId:'model',type:'MODEL'},{id:'i',fromNodeId:'i',fromSocketId:'IMAGE',toNodeId:'k',toSocketId:'latent_image',type:'LATENT'}];
    expect(extractWorkflowParameters([c,k,image],edges,'k')).toMatchObject({requireReferenceImage:true,initImageUrl:'reference.png'});
  });
  it('carries explicit Civitai recipe values from checkpoint to the driver contract', async () => {
    const node=createNode('c','CheckpointLoaderSimple',{ckpt_name:'urn:air:sdxl:checkpoint:civitai:123@456',targetProvider:'civitai',prompt:'test',civitai_engine:'comfy',civitai_ecosystem:'sdxl',civitai_model:'sdxl',batch_size:0});
    const spy=vi.spyOn(EngineRegistry,'generate').mockResolvedValue({mediaUrl:'https://example.test/out.png',mediaType:'image',provider:'civitai',providerId:'civitai',model:node.values.ckpt_name,seed:null});
    await executeWorkflow([node],[],()=>{},undefined,'c');
    expect(spy.mock.calls[0][1].extraParams).toMatchObject({engine:'comfy',ecosystem:'sdxl',comfyModel:'sdxl',quantity:0});
  });
  it('submits Civitai advanced objects through graph extraction and the real driver without pre-merging model', async()=>{
    const {CivitaiDriver}=await import('../engines/drivers/CivitaiDriver');
    const originalFetch=globalThis.fetch;
    const bodies:any[]=[];
    globalThis.fetch=vi.fn(async (_url,init)=>{bodies.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({imageUrl:'https://example.test/out.png'}));});
    vi.spyOn(EngineRegistry,'generate').mockImplementation((_provider,params,keys)=>new CivitaiDriver().generate(params,keys || {}));
    const custom={unknown_flag:true,safety:false,cfgScale:0,model:'advanced-model',loras:{'urn:air:sdxl:lora:civitai:789@123':0}};
    const node=createNode('c','CheckpointLoaderSimple',{ckpt_name:'urn:air:sdxl:checkpoint:civitai:123@456',targetProvider:'civitai',prompt:'test',civitai_engine:'comfy',custom_parameters:JSON.stringify(custom)});
    try {
      await executeWorkflow([node],[],()=>{},undefined,'c');
      expect(bodies[0].custom_parameters).toEqual(custom);
      expect(bodies[0].model).toBe(node.values.ckpt_name);
    } finally {globalThis.fetch=originalFetch;}
  });
  it('extracts video advanced parameters and resolution independently of provider', async () => {
    const node=createNode('v','AIVideoNode',{model:'fal-ai/wan/v2.7/image-to-video',targetProvider:'fal',prompt:'test',resolution:'720p',custom_parameters:'{"enable_prompt_expansion":false,"seed":0}'});
    const spy=vi.spyOn(EngineRegistry,'generate').mockResolvedValue({mediaUrl:'https://example.test/out.mp4',mediaType:'video',provider:'fal',providerId:'video',model:node.values.model,seed:null});
    await executeWorkflow([node],[],()=>{},undefined,'v');
    expect(spy.mock.calls[0][1].extraParams).toMatchObject({resolution:'720p',custom_parameters:{enable_prompt_expansion:false,seed:0}});
  });
  it('lists unresolved graph resources and never submits a fabricated path', async () => {
    const nodes=[createNode('c','CheckpointLoaderSimple',{ckpt_name:'model',targetProvider:'civitai'}),createNode('l','LoRALoader',{lora_name:'original',civitai_id:'123',import_unresolved_resource:true}),createNode('k','KSampler',{prompt:'test'})];
    const edges:Connection[]=[{id:'a',fromNodeId:'c',fromSocketId:'MODEL',toNodeId:'l',toSocketId:'model',type:'MODEL'},{id:'b',fromNodeId:'l',fromSocketId:'MODEL',toNodeId:'k',toSocketId:'model',type:'MODEL'}];
    const spy=vi.spyOn(EngineRegistry,'generate');
    await expect(executeWorkflow(nodes,edges,()=>{},undefined,'k')).rejects.toThrow(/123.*重新选择/);
    expect(spy).not.toHaveBeenCalled();
  });
  it('clears stale media outputs when a generation branch starts or fails, but not on non-media nodes', () => {
    expect(shouldClearExecutionOutput('KSampler', 'running', undefined)).toBe(true);
    expect(shouldClearExecutionOutput('SaveImage', 'idle', undefined, '')).toBe(true);
    expect(shouldClearExecutionOutput('KSampler', 'error', undefined, 'request failed')).toBe(true);
    expect(shouldClearExecutionOutput('KSampler', 'success', 'data:image/png;base64,abc')).toBe(false);
    expect(shouldClearExecutionOutput('CLIPTextEncode', 'running', undefined)).toBe(false);
  });

  it('removes previous output/error state from the workflow snapshot sent with a new request', () => {
    const stale = createNode('sampler', 'KSampler', { seed: 7 });
    stale.state = 'error';
    stale.executionProgress = 100;
    stale.errorMessage = 'previous request failed';
    stale.outputData = 'data:image/jpeg;base64,old-result';
    const [clean] = sanitizeExecutionSnapshotNodes([stale]);
    expect(clean.state).toBe('idle');
    expect(clean.executionProgress).toBe(0);
    expect(clean).not.toHaveProperty('outputData');
    expect(clean).not.toHaveProperty('errorMessage');
    expect(clean.values).toEqual({ seed: 7 });
  });

  it('rewrites CheckpointLoader title in snapshot to match current targetProvider (not WaveSpeed leftover)', () => {
    const ckpt = createNode('c', 'CheckpointLoaderSimple', { targetProvider: 'modelscope', ckpt_name: 'Tongyi-MAI/Z-Image-Turbo' });
    ckpt.title = '加载基础模型 (WaveSpeed)';
    const [clean] = sanitizeExecutionSnapshotNodes([ckpt]);
    expect(clean.title).toBe('加载底模 (魔搭 CN)');
    expect(clean.title).not.toMatch(/WaveSpeed/);
    expect(clean.values.targetProvider).toBe('modelscope');
  });

  it('clearNodeExecutionErrors also drops leftover media on errored media nodes', () => {
    const a = createNode('a', 'KSampler', { seed: 1 });
    a.state = 'error';
    a.errorMessage = 'HTTP 402 leftover';
    a.outputData = 'data:image/jpeg;base64,old-cat';
    const cleared = clearNodeExecutionErrors([a]);
    expect(cleared[0].state).toBe('idle');
    expect(cleared[0].errorMessage).toBeUndefined();
    expect(cleared[0].outputData).toBeUndefined();
  });

  it('resolveTargetNode miss never embeds raw node- id in the Error message', () => {
    expect(() => resolveTargetNode([], [], 'node-1791998332520')).toThrow(/未找到指定的执行节点/);
    try {
      resolveTargetNode([], [], 'node-1791998332520');
    } catch (e: any) {
      expect(String(e.message)).not.toMatch(/node-1791998332520/);
      expect(String(e.message)).not.toMatch(/node-/);
    }
  });

  it('clearNodeExecutionErrors drops stale red-box state on provider change / re-run', () => {
    const a = createNode('a', 'KSampler', { seed: 1 });
    a.state = 'error';
    a.errorMessage = 'Civitai leftover';
    const b = createNode('b', 'CheckpointLoaderSimple', { targetProvider: 'modelscope' });
    b.state = 'success';
    const cleared = clearNodeExecutionErrors([a, b]);
    expect(cleared[0].state).toBe('idle');
    expect(cleared[0].errorMessage).toBeUndefined();
    expect(cleared[1].state).toBe('success');
    expect(cleared[1].errorMessage).toBeUndefined();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getStoredApiKeys').mockReturnValue({} as any);
  });

  const createNode = (id: string, type: string, values: Record<string, any>): NodeInstance => ({
    id,
    type,
    title: type,
    pos: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    values,
  });

  it.each([false,true,undefined])('submits SenseNova graph booleans %j through executeWorkflow, the real registry and driver for checkpoint, sampler and CLIP-sink branches',async value=>{
    const originalFetch=globalThis.fetch;
    const submitted:Array<{url:string;body:Record<string,unknown>}>=[];
    globalThis.fetch=vi.fn(async(url,init)=>{
      submitted.push({url:String(url),body:JSON.parse(String(init?.body))});
      return new Response(JSON.stringify({imageUrl:'https://example.test/result.png'}));
    });
    const registry=vi.spyOn(EngineRegistry,'generate');
    try {
      for(const branch of ['checkpoint','sampler','clip'] as const){
        const checkpoint=createNode('c','CheckpointLoaderSimple',{targetProvider:'sensenova',ckpt_name:'custom-image-model',prompt:'keep prompt',size:'auto',watermark:value,prompt_extend:value});
        const sampler=createNode('k','KSampler',{prompt:'keep prompt'});
        const clip=createNode('p','CLIPTextEncode',{text:'keep prompt'});
        const sink=createNode('s','SaveImage',{});
        const nodes=branch==='checkpoint'?[checkpoint]:branch==='sampler'?[checkpoint,sampler]:[checkpoint,clip,sink];
        const connections:Connection[]=branch==='sampler'?[{id:'m',fromNodeId:'c',fromSocketId:'MODEL',toNodeId:'k',toSocketId:'model',type:'MODEL'}]:branch==='clip'?[{id:'cp',fromNodeId:'c',fromSocketId:'CLIP',toNodeId:'p',toSocketId:'clip',type:'CLIP'},{id:'ps',fromNodeId:'p',fromSocketId:'CONDITIONING',toNodeId:'s',toSocketId:'images',type:'IMAGE'}]:[];
        const target=branch==='checkpoint'?'c':branch==='sampler'?'k':'s';
        const extracted=extractWorkflowParameters(nodes,connections,target);
        expect(extracted).toMatchObject({watermark:value,promptExtend:value,targetProvider:'sensenova',checkpointModel:'custom-image-model'});
        await executeWorkflow(nodes,connections,()=>{},undefined,target);
        const sent=submitted.at(-1)!;
        expect(sent.url).toBe('/api/engine/sensenova/generate');
        expect(sent.body).toMatchObject({model:'custom-image-model',prompt:'keep prompt',size:'auto'});
        const extra=registry.mock.calls.at(-1)![1].extraParams;
        for(const field of ['watermark','prompt_extend']){
          if(value===undefined){expect(sent.body).not.toHaveProperty(field);expect(extra).not.toHaveProperty(field);}
          else {expect(sent.body[field]).toBe(value);expect(extra?.[field]).toBe(value);}
        }
        expect(checkpoint.values).toMatchObject({watermark:value,prompt_extend:value,size:'auto'});
      }
      expect(submitted).toHaveLength(3);
    } finally {globalThis.fetch=originalFetch;}
  });

  it('submits SenseNova spatial booleans through the real registry and driver without manufacturing unset fields',async()=>{
    const {spatialRequestParameters}=await import('./frontendParameters');
    const originalFetch=globalThis.fetch;
    const submitted:Record<string,unknown>[]=[];
    globalThis.fetch=vi.fn(async(_url,init)=>{submitted.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({imageUrl:'https://example.test/result.png'}));});
    try {
      for(const value of [false,true,undefined]){
        const frame:any={id:'f',prompt:'keep prompt',negativePrompt:'',params:{targetProvider:'sensenova',checkpoint:'custom-image-model',size:'auto',loras:[],seedControl:'fixed',watermark:value,promptExtend:value}};
        const request=spatialRequestParameters(frame);
        await EngineRegistry.generate('sensenova',request,{});
        const sent=submitted.at(-1)!;
        expect(sent).toMatchObject({model:'custom-image-model',prompt:'keep prompt',size:'auto'});
        for(const field of ['watermark','prompt_extend']){
          if(value===undefined)expect(sent).not.toHaveProperty(field);else expect(sent[field]).toBe(value);
        }
      }
      expect(submitted).toHaveLength(3);
    } finally {globalThis.fetch=originalFetch;}
  });

  it('keeps each SenseNova boolean independent and never coerces string values into booleans at submission',async()=>{
    const originalFetch=globalThis.fetch;
    const submitted:Record<string,unknown>[]=[];
    globalThis.fetch=vi.fn(async(_url,init)=>{submitted.push(JSON.parse(String(init?.body)));return new Response(JSON.stringify({imageUrl:'https://example.test/result.png'}));});
    try {
      for(const [watermark,prompt_extend] of [[false,true],[true,false],['false','true']]){
        const checkpoint=createNode('c','CheckpointLoaderSimple',{targetProvider:'sensenova',ckpt_name:'custom-image-model',prompt:'keep prompt',watermark,prompt_extend});
        await executeWorkflow([checkpoint],[],()=>{},undefined,'c');
        const sent=submitted.at(-1)!;
        if(typeof watermark==='boolean'){
          expect(sent.watermark).toBe(watermark);
          expect(sent.prompt_extend).toBe(prompt_extend);
        } else {
          expect(sent).not.toHaveProperty('watermark');
          expect(sent).not.toHaveProperty('prompt_extend');
        }
        expect(checkpoint.values).toMatchObject({watermark,prompt_extend});
      }
    } finally {globalThis.fetch=originalFetch;}
  });

  it.each(['agnes','fal','gemini'])('never adds retained SenseNova booleans to %s graph extra fields',async targetProvider=>{
    const checkpoint=createNode('c','CheckpointLoaderSimple',{targetProvider,ckpt_name:'custom-image-model',prompt:'keep prompt',watermark:false,prompt_extend:true});
    const registry=vi.spyOn(EngineRegistry,'generate').mockResolvedValue({mediaUrl:'https://example.test/result.png',mediaType:'image',provider:targetProvider,providerId:targetProvider as any,model:'custom-image-model',seed:null});
    await executeWorkflow([checkpoint],[],()=>{},undefined,'c');
    expect(registry.mock.calls[0][1].extraParams).not.toHaveProperty('watermark');
    expect(registry.mock.calls[0][1].extraParams).not.toHaveProperty('prompt_extend');
    expect(checkpoint.values).toMatchObject({watermark:false,prompt_extend:true});
  });

  it('marks only the failed execution target and leaves its input subgraph and other branches untouched',async()=>{
    const nodes=[createNode('fal','FalAIEngineNode',{model:'fal-ai/flux-lora',prompt:'actual prompt'}),createNode('adapter','LoRALoader',{lora_name:'https://example.test/adapter.safetensors',strength_model:0.5}),createNode('other','FalAIEngineNode',{model:'fal-ai/flux/dev',prompt:'unrelated'})];
    const connections:Connection[]=[{id:'mounted',fromNodeId:'adapter',fromSocketId:'MODEL',toNodeId:'fal',toSocketId:'lora',type:'MODEL'}];
    vi.spyOn(EngineRegistry,'generate').mockRejectedValue(new Error('Fal HTTP 403 TOP_UP'));
    const states=new Map<string,string>();
    await expect(executeWorkflow(nodes,connections,(id,state)=>{if(state)states.set(id,state);},undefined,'fal')).rejects.toThrow(/403/);
    expect(states.get('fal')).toBe('error');expect(states.get('adapter')).toBe('idle');expect(states.has('other')).toBe(false);
  });

  it('keeps HF Z-Image resolution and shift from the upstream checkpoint', () => {
    const nodes = [
      createNode('checkpoint', 'CheckpointLoaderSimple', {targetProvider: 'huggingface', ckpt_name: 'Tongyi-MAI/Z-Image-Turbo', hf_provider: 'z-image-space', resolution: '1152x896 ( 9:7 )', shift: 3.2}),
      createNode('sampler', 'KSampler', {seed: 42, control_after_generate: 'fixed', steps: 8}),
      createNode('prompt', 'CLIPTextEncode', {text: 'test prompt'}),
    ];
    const connections: Connection[] = [{id: 'model', fromNodeId: 'checkpoint', fromSocketId: 'MODEL', toNodeId: 'sampler', toSocketId: 'model', type: 'MODEL'}];
    connections.push({id: 'prompt', fromNodeId: 'prompt', fromSocketId: 'CONDITIONING', toNodeId: 'sampler', toSocketId: 'positive', type: 'CONDITIONING'});
    const extracted = extractWorkflowParameters(nodes, connections, 'sampler');
    expect(extracted).toMatchObject({targetProvider: 'huggingface', checkpointModel: 'Tongyi-MAI/Z-Image-Turbo', hfProvider: 'z-image-space', resolution: '1152x896 ( 9:7 )', shift: 3.2, seed: 42, steps: 8});
  });

  it('does not send Z-Image-only fields when HF explicitly routes through fal-ai', async () => {
    const nodes = [
      createNode('checkpoint', 'CheckpointLoaderSimple', {targetProvider: 'huggingface', ckpt_name: 'black-forest-labs/FLUX.1-dev', hf_provider: 'fal-ai', resolution: '1k', shift: 3, random_seed: false, gallery_images: []}),
      createNode('sampler', 'KSampler', {seed: 314159, control_after_generate: 'fixed', steps: 24, cfg: 3.2}),
      createNode('prompt', 'CLIPTextEncode', {text: 'alpine observatory'}),
    ];
    const connections: Connection[] = [
      {id: 'model', fromNodeId: 'checkpoint', fromSocketId: 'MODEL', toNodeId: 'sampler', toSocketId: 'model', type: 'MODEL'},
      {id: 'prompt', fromNodeId: 'prompt', fromSocketId: 'CONDITIONING', toNodeId: 'sampler', toSocketId: 'positive', type: 'CONDITIONING'},
    ];
    const generateSpy = vi.spyOn(EngineRegistry, 'generate').mockResolvedValue({mediaUrl:'data:image/png;base64,abc',mediaType:'image',provider:'Hugging Face',providerId:'huggingface',model:'black-forest-labs/FLUX.1-dev',seed:314159});
    await executeWorkflow(nodes, connections, () => {}, undefined, 'sampler');
    const sent = generateSpy.mock.calls[0][1];
    expect(sent.extraParams).toMatchObject({
      hf_provider:'fal-ai',
      omissions:[
        {field:'resolution',value:'1k',reason:'Hugging Face 该路由（hfProvider=fal-ai）未采用像素分辨率字段；保留原值不作为请求参数'},
        {field:'shift',value:3,reason:'非 z-image-space 的 HF 路由不支持 shift 字段；保留原值不作为请求参数'},
        {field:'random_seed',value:false,reason:'非 z-image-space 的 HF 路由不支持 random_seed 字段；保留原值不作为请求参数'},
        {field:'gallery_images',value:[],reason:'非 z-image-space 的 HF 路由不支持 gallery_images 字段；保留原值不作为请求参数'},
      ],
    });
    expect(sent.extraParams).not.toHaveProperty('resolution');
    expect(sent.extraParams).not.toHaveProperty('shift');
    expect(sent.extraParams).not.toHaveProperty('random_seed');
    expect(sent.extraParams).not.toHaveProperty('gallery_images');
  });
  it('records grok videoFps omission without sending the unsupported field', async () => {
    const node = createNode('video', 'AIVideoNode', {model:'grok-video-model', targetProvider:'grok_compat', prompt:'a moving scene', fps:24});
    const spy = vi.spyOn(EngineRegistry, 'generate').mockResolvedValue({mediaUrl:'https://example.test/out.mp4',mediaType:'video',provider:'grok_compat',providerId:'grok_compat',model:'grok-video-model',seed:null});
    await executeWorkflow([node], [], () => {}, undefined, 'video');
    expect(spy.mock.calls[0][1].videoFps).toBeUndefined();
    expect(spy.mock.calls[0][1].extraParams).toMatchObject({omissions:[{field:'videoFps',value:24,reason:'Grok 兼容中转的视频契约没有 videoFps 字段；保留原值不作为请求参数'}]});
  });

  it('records the local LoRA trigger prompt transformation in the workflow metadata', async () => {
    const checkpoint = createNode('checkpoint', 'CheckpointLoaderSimple', {ckpt_name:'model', targetProvider:'fal', prompt:'a portrait'});
    const lora = createNode('lora', 'LoRALoader', {lora_name:'style.safetensors', trigger_words:'style-token', strength_model:0.8});
    const sampler = createNode('sampler', 'KSampler', {});
    const prompt = createNode('prompt', 'CLIPTextEncode', {text:'a portrait'});
    const spy = vi.spyOn(EngineRegistry, 'generate').mockResolvedValue({mediaUrl:'https://example.test/out.png',mediaType:'image',provider:'fal',providerId:'fal',model:'model',seed:null});
    await executeWorkflow([checkpoint, lora, sampler, prompt], [{id:'mount',fromNodeId:'checkpoint',fromSocketId:'MODEL',toNodeId:'lora',toSocketId:'model',type:'MODEL'},{id:'sample',fromNodeId:'lora',fromSocketId:'MODEL',toNodeId:'sampler',toSocketId:'model',type:'MODEL'},{id:'positive',fromNodeId:'prompt',fromSocketId:'CONDITIONING',toNodeId:'sampler',toSocketId:'positive',type:'CONDITIONING'}], () => {}, undefined, 'sampler');
    expect(spy.mock.calls[0][1]).toMatchObject({prompt:'style-token, a portrait', workflowSnapshot:{requestMetadata:{promptTransform:{prependedTriggerWords:'style-token',originalPrompt:'a portrait',finalPrompt:'style-token, a portrait'}}}});
    expect((spy.mock.calls[0][1] as any).workflowSnapshot.requestMetadata.promptTransform.llmPrompt).toBeUndefined();
  });

  it('preserves LoRA trigger words and records metadata when LLMReasoningNode rewrites prompt', async () => {
    const checkpoint = createNode('checkpoint', 'CheckpointLoaderSimple', {ckpt_name:'model', targetProvider:'fal'});
    const lora = createNode('lora', 'LoRALoader', {lora_name:'style.safetensors', trigger_words:'cat-style', strength_model:0.8});
    const sampler = createNode('sampler', 'KSampler', {});
    const llm = createNode('llm', 'LLMReasoningNode', {provider:'openai_compat', model:'gpt-4o', prompt:'a cute cat'});
    const chatSpy = vi.spyOn(EngineRegistry, 'chat').mockResolvedValue({
      content: 'A high detailed cinematic photography of a cute cat with dramatic lighting',
      reasoningContent: 'thinking about photoreal cat',
      provider: 'openai_compat',
      providerId: 'openai_compat',
      model: 'gpt-4o',
    });
    const generateSpy = vi.spyOn(EngineRegistry, 'generate').mockResolvedValue({mediaUrl:'https://example.test/out.png',mediaType:'image',provider:'fal',providerId:'fal',model:'model',seed:null});

    await executeWorkflow(
      [checkpoint, lora, sampler, llm],
      [
        {id:'mount',fromNodeId:'checkpoint',fromSocketId:'MODEL',toNodeId:'lora',toSocketId:'model',type:'MODEL'},
        {id:'sample',fromNodeId:'lora',fromSocketId:'MODEL',toNodeId:'sampler',toSocketId:'model',type:'MODEL'},
        {id:'positive',fromNodeId:'llm',fromSocketId:'CONDITIONING',toNodeId:'sampler',toSocketId:'positive',type:'CONDITIONING'},
      ],
      () => {},
      undefined,
      'sampler'
    );

    expect(chatSpy).toHaveBeenCalled();
    const sent: any = generateSpy.mock.calls[0][1];
    expect(sent.prompt).toBe('cat-style, A high detailed cinematic photography of a cute cat with dramatic lighting');
    expect(sent.workflowSnapshot.requestMetadata.promptTransform).toEqual({
      prependedTriggerWords: 'cat-style',
      originalPrompt: 'a cute cat',
      llmPrompt: 'A high detailed cinematic photography of a cute cat with dramatic lighting',
      finalPrompt: 'cat-style, A high detailed cinematic photography of a cute cat with dramatic lighting',
    });
  });

  it('does not duplicate trigger words if LLM prompt already contains them', async () => {
    const checkpoint = createNode('checkpoint', 'CheckpointLoaderSimple', {ckpt_name:'model', targetProvider:'fal'});
    const lora = createNode('lora', 'LoRALoader', {lora_name:'style.safetensors', trigger_words:'cat-style', strength_model:0.8});
    const sampler = createNode('sampler', 'KSampler', {});
    const llm = createNode('llm', 'LLMReasoningNode', {provider:'openai_compat', model:'gpt-4o', prompt:'a cute cat'});
    vi.spyOn(EngineRegistry, 'chat').mockResolvedValue({
      content: 'cat-style, masterpiece photograph of a cat',
      provider: 'openai_compat',
      providerId: 'openai_compat',
      model: 'gpt-4o',
    });
    const generateSpy = vi.spyOn(EngineRegistry, 'generate').mockResolvedValue({mediaUrl:'https://example.test/out.png',mediaType:'image',provider:'fal',providerId:'fal',model:'model',seed:null});

    await executeWorkflow(
      [checkpoint, lora, sampler, llm],
      [
        {id:'mount',fromNodeId:'checkpoint',fromSocketId:'MODEL',toNodeId:'lora',toSocketId:'model',type:'MODEL'},
        {id:'sample',fromNodeId:'lora',fromSocketId:'MODEL',toNodeId:'sampler',toSocketId:'model',type:'MODEL'},
        {id:'positive',fromNodeId:'llm',fromSocketId:'CONDITIONING',toNodeId:'sampler',toSocketId:'positive',type:'CONDITIONING'},
      ],
      () => {},
      undefined,
      'sampler'
    );

    const sent: any = generateSpy.mock.calls[0][1];
    expect(sent.prompt).toBe('cat-style, masterpiece photograph of a cat');
    expect(sent.workflowSnapshot.requestMetadata.promptTransform).toEqual({
      prependedTriggerWords: 'cat-style',
      originalPrompt: 'a cute cat',
      llmPrompt: 'cat-style, masterpiece photograph of a cat',
      finalPrompt: 'cat-style, masterpiece photograph of a cat',
    });
  });

  it('requires an explicit provider even when the model name contains fal-ai', () => {
    const nodes = [createNode('ckpt', 'CheckpointLoaderSimple', {ckpt_name:'fal-ai/flux/dev'}), createNode('sampler', 'KSampler', {}), createNode('prompt', 'CLIPTextEncode', {text:'a tree'})];
    const edges: Connection[] = [{id:'m',fromNodeId:'ckpt',fromSocketId:'MODEL',toNodeId:'sampler',toSocketId:'model',type:'MODEL'}, {id:'p',fromNodeId:'prompt',fromSocketId:'CONDITIONING',toNodeId:'sampler',toSocketId:'positive',type:'CONDITIONING'}];
    expect(() => extractWorkflowParameters(nodes, edges, 'sampler')).toThrow(/不会从模型名称猜测/);
  });

  it('一个画布上两个 AIVideoNode + 两个图片节点，各自带自己的 model 且不会拿到另一节点的参考图', async () => {
    // 构造单张画布：包含 2 个视频节点 + 2 个图片节点，各自带有各自的 LoadImage 参考图
    const nodes: NodeInstance[] = [
      // 视频节点 1 及专属参考图
      createNode('video-node-1', 'AIVideoNode', {
        model: 'fal-ai/wan-t2v',
        targetProvider: 'fal',
        prompt: 'flying golden dragon above misty mountains',
        duration: 5,
        fps: 16,
      }),
      createNode('load-img-v1', 'LoadImage', {
        image_url: 'https://example.com/assets/dragon-ref.png',
      }),

      // 视频节点 2 及专属参考图
      createNode('video-node-2', 'AIVideoNode', {
        model: 'fal-ai/ltx-video',
        targetProvider: 'fal',
        prompt: 'cyberpunk sports car drifting in neon rain',
        duration: 4,
        fps: 24,
      }),
      createNode('load-img-v2', 'LoadImage', {
        image_url: 'https://example.com/assets/car-ref.png',
      }),

      // 图片节点 1 (FalAIEngineNode) 及专属参考图
      createNode('image-node-1', 'FalAIEngineNode', {
        model: 'fal-ai/flux/schnell',
        prompt: 'macro close-up portrait of an orange cat',
      }),
      createNode('load-img-i1', 'LoadImage', {
        image_url: 'https://example.com/assets/cat-ref.png',
      }),

      // 图片节点 2 (FalAIEngineNode) 及专属参考图
      createNode('image-node-2', 'FalAIEngineNode', {
        model: 'fal-ai/flux/dev',
        prompt: 'serene oil painting of autumn forest lake',
      }),
      createNode('load-img-i2', 'LoadImage', {
        image_url: 'https://example.com/assets/lake-ref.png',
      }),
    ];

    // 连接线：每个 LoadImage 只接入各自对应的节点
    const connections: Connection[] = [
      {
        id: 'conn-v1',
        fromNodeId: 'load-img-v1',
        fromSocketId: 'IMAGE',
        toNodeId: 'video-node-1',
        toSocketId: 'init_image',
        type: 'IMAGE',
      },
      {
        id: 'conn-v2',
        fromNodeId: 'load-img-v2',
        fromSocketId: 'IMAGE',
        toNodeId: 'video-node-2',
        toSocketId: 'init_image',
        type: 'IMAGE',
      },
      {
        id: 'conn-i1',
        fromNodeId: 'load-img-i1',
        fromSocketId: 'IMAGE',
        toNodeId: 'image-node-1',
        toSocketId: 'image',
        type: 'IMAGE',
      },
      {
        id: 'conn-i2',
        fromNodeId: 'load-img-i2',
        fromSocketId: 'IMAGE',
        toNodeId: 'image-node-2',
        toSocketId: 'image',
        type: 'IMAGE',
      },
    ];

    // 1. 抽取视频节点 1 参数
    const paramsV1 = extractWorkflowParameters(nodes, connections, 'video-node-1');
    expect(paramsV1.checkpointModel).toBe('fal-ai/wan-t2v');
    expect(paramsV1.initImageUrl).toBe('https://example.com/assets/dragon-ref.png');
    expect(paramsV1.positivePrompt).toBe('flying golden dragon above misty mountains');
    expect(paramsV1.isVideo).toBe(true);
    expect(paramsV1.checkpointModel).not.toBe('fal-ai/flux/schnell');
    expect(paramsV1.checkpointModel).not.toBe('fal-ai/flux/dev');
    expect(paramsV1.checkpointModel).not.toBe('fal-ai/ltx-video');
    expect(paramsV1.initImageUrl).not.toBe('https://example.com/assets/car-ref.png');
    expect(paramsV1.initImageUrl).not.toBe('https://example.com/assets/cat-ref.png');
    expect(paramsV1.initImageUrl).not.toBe('https://example.com/assets/lake-ref.png');

    // 2. 抽取视频节点 2 参数
    const paramsV2 = extractWorkflowParameters(nodes, connections, 'video-node-2');
    expect(paramsV2.checkpointModel).toBe('fal-ai/ltx-video');
    expect(paramsV2.initImageUrl).toBe('https://example.com/assets/car-ref.png');
    expect(paramsV2.positivePrompt).toBe('cyberpunk sports car drifting in neon rain');
    expect(paramsV2.isVideo).toBe(true);
    expect(paramsV2.checkpointModel).not.toBe('fal-ai/wan-t2v');
    expect(paramsV2.checkpointModel).not.toBe('fal-ai/flux/schnell');
    expect(paramsV2.checkpointModel).not.toBe('fal-ai/flux/dev');
    expect(paramsV2.initImageUrl).not.toBe('https://example.com/assets/dragon-ref.png');
    expect(paramsV2.initImageUrl).not.toBe('https://example.com/assets/cat-ref.png');
    expect(paramsV2.initImageUrl).not.toBe('https://example.com/assets/lake-ref.png');

    // 3. 抽取图片节点 1 参数
    const paramsI1 = extractWorkflowParameters(nodes, connections, 'image-node-1');
    expect(paramsI1.checkpointModel).toBe('fal-ai/flux/schnell');
    expect(paramsI1.initImageUrl).toBe('https://example.com/assets/cat-ref.png');
    expect(paramsI1.positivePrompt).toBe('macro close-up portrait of an orange cat');
    expect(paramsI1.isVideo).toBe(false);
    expect(paramsI1.checkpointModel).not.toBe('fal-ai/wan-t2v');
    expect(paramsI1.checkpointModel).not.toBe('fal-ai/ltx-video');
    expect(paramsI1.checkpointModel).not.toBe('fal-ai/flux/dev');
    expect(paramsI1.initImageUrl).not.toBe('https://example.com/assets/dragon-ref.png');
    expect(paramsI1.initImageUrl).not.toBe('https://example.com/assets/car-ref.png');
    expect(paramsI1.initImageUrl).not.toBe('https://example.com/assets/lake-ref.png');

    // 4. 抽取图片节点 2 参数
    const paramsI2 = extractWorkflowParameters(nodes, connections, 'image-node-2');
    expect(paramsI2.checkpointModel).toBe('fal-ai/flux/dev');
    expect(paramsI2.initImageUrl).toBe('https://example.com/assets/lake-ref.png');
    expect(paramsI2.positivePrompt).toBe('serene oil painting of autumn forest lake');
    expect(paramsI2.isVideo).toBe(false);
    expect(paramsI2.checkpointModel).not.toBe('fal-ai/wan-t2v');
    expect(paramsI2.checkpointModel).not.toBe('fal-ai/ltx-video');
    expect(paramsI2.checkpointModel).not.toBe('fal-ai/flux/schnell');
    expect(paramsI2.initImageUrl).not.toBe('https://example.com/assets/dragon-ref.png');
    expect(paramsI2.initImageUrl).not.toBe('https://example.com/assets/car-ref.png');
    expect(paramsI2.initImageUrl).not.toBe('https://example.com/assets/cat-ref.png');

    // 5. 分别对每个节点执行 executeWorkflow，断言各自只提交自己的 model 与参数
    const generateSpy = vi.spyOn(EngineRegistry, 'generate').mockImplementation(async (provider, params): Promise<NormalizedGenerateResult> => ({
      mediaUrl: 'https://example.com/result.png',
      provider,
      providerId: provider as any,
      model: params.model,
      seed: 42,
      mediaType: params.isVideo ? 'video' : 'image',
    }));

    const states: Record<string, NodeInstance['state']> = {};
    const onNodeStateChange = (nodeId: string, state: NodeInstance['state']) => {
      states[nodeId] = state;
    };

    // 执行 video-node-1
    const resV1 = await executeWorkflow(nodes, connections, onNodeStateChange, undefined, 'video-node-1');
    expect(resV1.model).toBe('fal-ai/wan-t2v');
    expect(generateSpy).toHaveBeenLastCalledWith(
      'video',
      expect.objectContaining({
        model: 'fal-ai/wan-t2v',
        image_url: 'https://example.com/assets/dragon-ref.png',
        prompt: 'flying golden dragon above misty mountains',
        isVideo: true,
      }),
      expect.anything()
    );

    // 执行 image-node-1
    const resI1 = await executeWorkflow(nodes, connections, onNodeStateChange, undefined, 'image-node-1');
    expect(resI1.model).toBe('fal-ai/flux/schnell');
    expect(generateSpy).toHaveBeenLastCalledWith(
      'fal',
      expect.objectContaining({
        model: 'fal-ai/flux/schnell',
        image_url: 'https://example.com/assets/cat-ref.png',
        prompt: 'macro close-up portrait of an orange cat',
        isVideo: false,
      }),
      expect.anything()
    );
  });

  it('CheckpointLoaderSimple 与 KSampler 图片流与 AIVideoNode 并在同一画布时严格隔离', () => {
    const nodes: NodeInstance[] = [
      // 视频节点
      createNode('video-1', 'AIVideoNode', {
        model: 'fal-ai/wan-t2v',
        targetProvider: 'fal',
        prompt: 'ocean tide at sunset',
      }),
      // Comfy 经典流
      createNode('ckpt-1', 'CheckpointLoaderSimple', {
        ckpt_name: 'fal-ai/flux/dev',
        targetProvider: 'fal',
      }),
      createNode('clip-1', 'CLIPTextEncode', {
        text: 'photorealistic mountain peaks',
      }),
      createNode('ksampler-1', 'KSampler', {
        steps: 30,
        cfg: 7.0,
      }),
      createNode('load-img-comfy', 'LoadImage', {
        image_url: 'https://example.com/comfy-init.png',
      }),
    ];

    const connections: Connection[] = [
      {
        id: 'c1',
        fromNodeId: 'ckpt-1',
        fromSocketId: 'MODEL',
        toNodeId: 'ksampler-1',
        toSocketId: 'model',
        type: 'MODEL',
      },
      {
        id: 'c2',
        fromNodeId: 'clip-1',
        fromSocketId: 'CONDITIONING',
        toNodeId: 'ksampler-1',
        toSocketId: 'positive',
        type: 'CONDITIONING',
      },
      {
        id: 'c3',
        fromNodeId: 'load-img-comfy',
        fromSocketId: 'IMAGE',
        toNodeId: 'ksampler-1',
        toSocketId: 'latent_image',
        type: 'IMAGE',
      },
    ];

    // 执行 video-1：绝不能拿到 ckpt-1 的 fal-ai/flux/dev，也不能拿到 load-img-comfy 的参考图
    const videoParams = extractWorkflowParameters(nodes, connections, 'video-1');
    expect(videoParams.checkpointModel).toBe('fal-ai/wan-t2v');
    expect(videoParams.initImageUrl).toBeUndefined();
    expect(videoParams.positivePrompt).toBe('ocean tide at sunset');

    // 执行 ksampler-1：拿到 ckpt-1 的模型和 load-img-comfy 的参考图
    const ksamplerParams = extractWorkflowParameters(nodes, connections, 'ksampler-1');
    expect(ksamplerParams.checkpointModel).toBe('fal-ai/flux/dev');
    expect(ksamplerParams.initImageUrl).toBe('https://example.com/comfy-init.png');
    expect(ksamplerParams.positivePrompt).toBe('photorealistic mountain peaks');
  });

  it('L2a: 节点未连接参考图时，画布上即使有别的 LoadImage 节点，initImageUrl 也必须为 undefined', () => {
    const nodes: NodeInstance[] = [
      createNode('video-node', 'AIVideoNode', {
        model: 'fal-ai/wan-t2v',
        targetProvider: 'fal',
        prompt: 'a running horse in desert',
      }),
      createNode('orphan-load-image', 'LoadImage', {
        image_url: 'https://example.com/orphan.png',
      }),
    ];

    // 无任何连线
    const connections: Connection[] = [];

    const params = extractWorkflowParameters(nodes, connections, 'video-node');
    expect(params.initImageUrl).toBeUndefined();
  });

  it('L2b: 提示词为空时不再使用硬编码兜底文案，而是抛出「请填写提示词」错误', () => {
    const nodes: NodeInstance[] = [
      createNode('video-node', 'AIVideoNode', {
        model: 'fal-ai/wan-t2v',
        targetProvider: 'fal',
        prompt: '', // 空提示词
      }),
    ];

    expect(() => {
      extractWorkflowParameters(nodes, [], 'video-node');
    }).toThrow('请填写提示词');
  });

  it('B2: 节点未选模型时抛出「请先选择模型」错误，绝不借用画布上其它节点的模型', () => {
    const nodes: NodeInstance[] = [
      createNode('video-node', 'AIVideoNode', {
        model: '', // 未选择模型
        prompt: 'cool animation',
      }),
      createNode('other-image-node', 'FalAIEngineNode', {
        model: 'fal-ai/flux/schnell',
        prompt: 'other image prompt',
      }),
    ];

    expect(() => {
      extractWorkflowParameters(nodes, [], 'video-node');
    }).toThrow('请先选择模型');
  });

  it('执行失败时只将错误状态标记到当前执行的节点，避免在不相关的节点上重复报两次错误', async () => {
    const nodes: NodeInstance[] = [
      createNode('video-node-1', 'AIVideoNode', {
        model: '', // 触发错误
        prompt: 'test prompt',
      }),
      createNode('video-node-2', 'AIVideoNode', {
        model: 'fal-ai/ltx-video',
        prompt: 'test prompt 2',
      }),
    ];

    const errorRecordedNodes: string[] = [];
    const onNodeStateChange = (nodeId: string, state: NodeInstance['state'], _p?: number, _out?: any, errorMsg?: string) => {
      if (state === 'error') {
        errorRecordedNodes.push(nodeId);
      }
    };

    await expect(
      executeWorkflow(nodes, [], onNodeStateChange, undefined, 'video-node-1')
    ).rejects.toThrow('请先选择模型');

    // 只有 video-node-1 被标记了错误，video-node-2 不受任何影响
    expect(errorRecordedNodes).toEqual(['video-node-1']);
  });

  it('B1: Fal schnell + connected LoRA extracts Fal params (no client pre-send throw) so executeWorkflow can POST /api/fal/generate', () => {
    const nodes: NodeInstance[] = [
      createNode('fal-1', 'FalAIEngineNode', {
        model: 'fal-ai/flux/schnell',
        prompt: 'a test astronaut',
      }),
      createNode('lora-1', 'LoRALoader', {
        lora_name: 'koda',
        strength_model: 1.0,
        strength_clip: 1.0,
      }),
    ];
    const connections: Connection[] = [
      {
        id: 'c-lora',
        fromNodeId: 'lora-1',
        fromSocketId: 'MODEL',
        toNodeId: 'fal-1',
        toSocketId: 'lora',
        type: 'MODEL',
      },
    ];
    const params = extractWorkflowParameters(nodes, connections, 'fal-1');
    expect(params.targetProvider).toBe('fal');
    expect(params.checkpointModel).toBe('fal-ai/flux/schnell');
    expect(params.loras.map((l) => l.name)).toContain('koda');
  });

  it('B1-r2b: Fal + connected LoRA + zombie Checkpoint/KSampler auto-detects Fal, never HuggingFace', async () => {
    const nodes: NodeInstance[] = [
      createNode('fal-1', 'FalAIEngineNode', {
        model: 'fal-ai/flux/schnell',
        prompt: 'a futuristic astronaut',
      }),
      createNode('lora-1', 'LoRALoader', {
        lora_name: 'koda',
        strength_model: 1.0,
        strength_clip: 1.0,
        base_model: 'Flux.1 D',
      }),
      createNode('ckpt-zombie', 'CheckpointLoaderSimple', {
        ckpt_name: 'Tongyi-MAI/Z-Image-Turbo',
      }),
      createNode('ksampler-1', 'KSampler', { steps: 20, cfg: 7 }),
      createNode('clip-1', 'CLIPTextEncode', { text: 'zombie prompt' }),
      createNode('latent-1', 'EmptyLatentImage', { width: 1024, height: 1024 }),
    ];
    const connections: Connection[] = [
      {
        id: 'c-ckpt',
        fromNodeId: 'ckpt-zombie',
        fromSocketId: 'MODEL',
        toNodeId: 'ksampler-1',
        toSocketId: 'model',
        type: 'MODEL',
      },
      {
        id: 'c-clip',
        fromNodeId: 'clip-1',
        fromSocketId: 'CONDITIONING',
        toNodeId: 'ksampler-1',
        toSocketId: 'positive',
        type: 'CONDITIONING',
      },
      {
        id: 'c-latent',
        fromNodeId: 'latent-1',
        fromSocketId: 'LATENT',
        toNodeId: 'ksampler-1',
        toSocketId: 'latent_image',
        type: 'LATENT',
      },
    ];

    expect(resolveTargetNode(nodes, connections).type).toBe('FalAIEngineNode');

    // An independent LoRA is not applied by a guessed sole-engine association.
    expect(extractWorkflowParameters(nodes, connections).loras).toEqual([]);
    connections.push({id:'mounted-lora',fromNodeId:'lora-1',fromSocketId:'MODEL',toNodeId:'fal-1',toSocketId:'lora',type:'MODEL'});

    const params = extractWorkflowParameters(nodes, connections);
    expect(params.targetProvider).toBe('fal');
    expect(params.checkpointModel).toBe('fal-ai/flux/schnell');
    expect(params.checkpointModel).not.toContain('Z-Image');
    expect(params.loras.map((l) => l.name)).toContain('koda');

    const generateSpy = vi.spyOn(EngineRegistry, 'generate').mockImplementation(async (provider, p): Promise<NormalizedGenerateResult> => ({
      mediaUrl: 'https://example.com/result.png',
      provider,
      providerId: provider as any,
      model: p.model,
      seed: 1,
      mediaType: 'image',
    }));

    const result = await executeWorkflow(nodes, connections, () => {}, undefined);
    expect(result.provider).toBe('fal');
    expect(generateSpy).toHaveBeenCalledTimes(1);
    expect(generateSpy.mock.calls[0][1].loras).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'koda', path: undefined, strength: 1 }),
    ]));

  });

  it('B1-r2b: CLIP connected to Fal prefers Fal over zombie KSampler when CLIP is selected', () => {
    const nodes: NodeInstance[] = [
      createNode('fal-1', 'FalAIEngineNode', {
        model: 'fal-ai/flux/schnell',
        prompt: '',
      }),
      createNode('clip-fal', 'CLIPTextEncode', { text: 'fal prompt' }),
      createNode('ckpt-zombie', 'CheckpointLoaderSimple', {
        ckpt_name: 'Tongyi-MAI/Z-Image-Turbo',
      }),
      createNode('ksampler-1', 'KSampler', { steps: 20 }),
      createNode('lora-1', 'LoRALoader', { lora_name: 'koda', strength_model: 1 }),
    ];
    const connections: Connection[] = [
      {
        id: 'c-clip-fal',
        fromNodeId: 'clip-fal',
        fromSocketId: 'CONDITIONING',
        toNodeId: 'fal-1',
        toSocketId: 'prompt',
        type: 'CONDITIONING',
      },
      {
        id: 'c-ckpt',
        fromNodeId: 'ckpt-zombie',
        fromSocketId: 'MODEL',
        toNodeId: 'ksampler-1',
        toSocketId: 'model',
        type: 'MODEL',
      },
    ];
    const params = extractWorkflowParameters(nodes, connections, 'clip-fal');
    expect(params.targetProvider).toBe('fal');
    expect(params.checkpointModel).toBe('fal-ai/flux/schnell');
    expect(params.positivePrompt).toBe('fal prompt');
  });

  it.each([
    [undefined, []],
    ['', []],
    ['   ', []],
    ['LoRA', ['LoRA']],
  ])('LoRA name %j: never forge "LoRA", keep a real one (Fal lora socket)', (loraName, expected) => {
    const nodes: NodeInstance[] = [
      createNode('fal-1', 'FalAIEngineNode', { model: 'fal-ai/flux/schnell', prompt: 'p' }),
      createNode('lora-1', 'LoRALoader', { lora_name: loraName, strength_model: 1 }),
    ];
    const connections: Connection[] = [
      { id: 'c', fromNodeId: 'lora-1', fromSocketId: 'MODEL', toNodeId: 'fal-1', toSocketId: 'lora', type: 'MODEL' },
    ];
    const params = extractWorkflowParameters(nodes, connections, 'fal-1');
    expect(params.loras.map((l) => l.name)).toEqual(expected);
  });

  it.each([
    ['', []],
    ['LoRA', ['LoRA']],
  ])('LoRA name %j on KSampler model chain: still reach checkpoint, no forged name', (loraName, expected) => {
    const nodes: NodeInstance[] = [
      createNode('ckpt', 'CheckpointLoaderSimple', { ckpt_name: 'fal-ai/flux/dev', targetProvider: 'fal' }),
      createNode('lora-1', 'LoRALoader', { lora_name: loraName }),
      createNode('clip', 'CLIPTextEncode', { text: 'a cat' }),
      createNode('ks', 'KSampler', {}),
    ];
    const connections: Connection[] = [
      { id: 'c1', fromNodeId: 'ckpt', fromSocketId: 'MODEL', toNodeId: 'lora-1', toSocketId: 'model', type: 'MODEL' },
      { id: 'c2', fromNodeId: 'lora-1', fromSocketId: 'MODEL', toNodeId: 'ks', toSocketId: 'model', type: 'MODEL' },
      { id: 'c3', fromNodeId: 'clip', fromSocketId: 'CONDITIONING', toNodeId: 'ks', toSocketId: 'positive', type: 'CONDITIONING' },
    ];
    const params = extractWorkflowParameters(nodes, connections, 'ks');
    expect(params.checkpointModel).toBe('fal-ai/flux/dev');
    expect(params.loras.map((l) => l.name)).toEqual(expected);
  });

});

describe('F5 omit unset seed/sampler defaults', () => {
  const node = (id: string, type: string, values: Record<string, any>): NodeInstance => ({
    id, type, title: type, pos: { x: 0, y: 0 }, inputs: [], outputs: [], values,
  });
  const mockGenerate = (seed: number | null) =>
    vi.spyOn(EngineRegistry, 'generate').mockImplementation(async (provider, p): Promise<NormalizedGenerateResult> => ({
      mediaUrl: 'https://example.com/r.png', provider, providerId: provider as any, model: p.model, seed, mediaType: 'image',
    }));
  const ksGraph = (ksVals: Record<string, any>) => ({
    nodes: [
      node('ckpt', 'CheckpointLoaderSimple', { ckpt_name: 'fal-ai/flux/dev', targetProvider: 'fal' }),
      node('clip', 'CLIPTextEncode', { text: 'a cat' }),
      node('ks', 'KSampler', ksVals),
    ],
    conns: [
      { id: 'c1', fromNodeId: 'ckpt', fromSocketId: 'MODEL', toNodeId: 'ks', toSocketId: 'model', type: 'MODEL' },
      { id: 'c2', fromNodeId: 'clip', fromSocketId: 'CONDITIONING', toNodeId: 'ks', toSocketId: 'positive', type: 'CONDITIONING' },
    ] as Connection[],
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getStoredApiKeys').mockReturnValue({} as any);
  });

  it('GoogleImagenNode: no seed/steps/cfg/sampler/scheduler invented, generate gets no seed, history seed null', async () => {
    const rand = vi.spyOn(Math, 'random');
    const nodes = [node('g', 'GoogleImagenNode', { model: 'gemini-3.1-flash-image', prompt: 'a fox' })];
    const p = extractWorkflowParameters(nodes, [], 'g');
    for (const k of ['seed', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'width', 'height'] as const) {
      expect(p[k]).toBeUndefined();
    }
    const spy = mockGenerate(null);
    const res = await executeWorkflow(nodes, [], () => {}, undefined, 'g');
    const sent = spy.mock.calls[0][1];
    expect(sent.seed).toBeUndefined();
    expect(sent.extraParams).not.toHaveProperty('sampler_name');
    expect(sent.extraParams).not.toHaveProperty('scheduler');
    expect(res.seed).toBeNull();
    expect(rand).not.toHaveBeenCalled();
  });

  it('KSampler + CheckpointLoader gemini: imported long seed is forwarded; returned history seed stays null', async () => {
    const nodes = [
      node('ckpt', 'CheckpointLoaderSimple', { ckpt_name: 'gemini-3.1-flash-image', targetProvider: 'gemini' }),
      node('clip', 'CLIPTextEncode', { text: 'a fox' }),
      node('ks', 'KSampler', { control_after_generate: 'fixed', seed: 1847392847561, steps: 20, cfg: 7 }),
    ];
    const conns = [
      { id: 'c1', fromNodeId: 'ckpt', fromSocketId: 'MODEL', toNodeId: 'ks', toSocketId: 'model', type: 'MODEL' },
      { id: 'c2', fromNodeId: 'clip', fromSocketId: 'CONDITIONING', toNodeId: 'ks', toSocketId: 'positive', type: 'CONDITIONING' },
    ] as Connection[];
    const p = extractWorkflowParameters(nodes, conns, 'ks');
    expect(p.targetProvider).toBe('gemini');
    expect(p.seed).toBe(1847392847561); // widget 仍可残留导入值
    expect(isCanvasFieldUnsupported('gemini', 'gemini-3.1-flash-image', 'seed')).toBe(true);
    const spy = mockGenerate(null);
    const res = await executeWorkflow(nodes, conns, () => {}, undefined, 'ks');
    const sent = spy.mock.calls[0][1];
    expect(sent.seed).toBe(1847392847561);
    expect(res.seed).toBeNull();
  });

  it('FalAIEngineNode with only model+prompt: no forged 28/3.5/1024/seed', async () => {
    const nodes = [node('f', 'FalAIEngineNode', { model: 'fal-ai/flux/dev', prompt: 'a fox' })];
    const p = extractWorkflowParameters(nodes, [], 'f');
    expect([p.steps, p.cfg, p.width, p.height, p.seed, p.sampler, p.scheduler]).toEqual(Array(7).fill(undefined));
    const spy = mockGenerate(null);
    await executeWorkflow(nodes, [], () => {}, undefined, 'f');
    const sent = spy.mock.calls[0][1];
    expect([sent.steps, sent.cfg, sent.width, sent.height, sent.seed, sent.denoise]).toEqual(Array(6).fill(undefined));
  });

  it('FalAIEngineNode with explicit steps/guidance/resolution passes them through', () => {
    const nodes = [node('f', 'FalAIEngineNode', {
      model: 'fal-ai/flux/dev', prompt: 'a fox', steps: 28, guidance_scale: 3.5, resolution: '1024x1024',
    })];
    const p = extractWorkflowParameters(nodes, [], 'f');
    expect([p.steps, p.cfg, p.width, p.height]).toEqual([28, 3.5, 1024, 1024]);
  });

  it('KSampler fixed seed 12345 kept; seed 0 kept; unset seed stays undefined', () => {
    let g = ksGraph({ control_after_generate: 'fixed', seed: 12345 });
    expect(extractWorkflowParameters(g.nodes, g.conns, 'ks').seed).toBe(12345);
    g = ksGraph({ control_after_generate: 'fixed', seed: 0 });
    expect(extractWorkflowParameters(g.nodes, g.conns, 'ks').seed).toBe(0);
    g = ksGraph({ steps: 20 });
    const p = extractWorkflowParameters(g.nodes, g.conns, 'ks');
    expect(p.seed).toBeUndefined();
    expect(p.steps).toBe(20);
    expect([p.cfg, p.sampler, p.scheduler, p.denoise, p.width, p.height]).toEqual(Array(6).fill(undefined));
  });

  it('KSampler + init image: denoise is not forged to 0.65', () => {
    const g = ksGraph({ steps: 20 });
    g.nodes.push(node('img', 'LoadImage', { image_url: 'https://example.com/i.png' }));
    g.conns.push({ id: 'c3', fromNodeId: 'img', fromSocketId: 'IMAGE', toNodeId: 'ks', toSocketId: 'latent_image', type: 'IMAGE' });
    const p = extractWorkflowParameters(g.nodes, g.conns, 'ks');
    expect(p.initImageUrl).toBe('https://example.com/i.png');
    expect(p.denoise).toBeUndefined();
  });

  it('KSampler randomize → finite seed (user opted in)', () => {
    const g = ksGraph({ control_after_generate: 'randomize', seed: 1 });
    expect(Number.isFinite(extractWorkflowParameters(g.nodes, g.conns, 'ks').seed)).toBe(true);
  });
});


describe('graphEngine - F4 AIVideoNode provider sync / reject empty & mismatch', () => {
  const createNode = (id: string, type: string, values: Record<string, any>): NodeInstance => ({
    id,
    type,
    title: type,
    pos: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    values,
  });

  it('F4: empty targetProvider/provider is rejected (never Fal fallback)', () => {
    const nodes: NodeInstance[] = [
      createNode('video-node', 'AIVideoNode', {
        model: 'fal-ai/wan-t2v',
        prompt: 'cinematic orbit',
        // no targetProvider / provider
      }),
    ];
    expect(() => extractWorkflowParameters(nodes, [], 'video-node')).toThrow(/视频服务商|不会回退到 Fal/);
  });

  it('F4: schema model provider mismatch with targetProvider is rejected', () => {
    const nodes: NodeInstance[] = [
      createNode('video-node', 'AIVideoNode', {
        model: 'agnes-video-2.5-flash', // explicit Agnes endpoint
        targetProvider: 'fal',
        prompt: 'cinematic orbit',
      }),
    ];
    expect(() => extractWorkflowParameters(nodes, [], 'video-node')).toThrow(/服务商不一致|不会回退到 Fal/);
  });

  it('F4: explicit Fal provider with matching Fal model still works', () => {
    const nodes: NodeInstance[] = [
      createNode('video-node', 'AIVideoNode', {
        model: 'fal-ai/wan-t2v',
        targetProvider: 'fal',
        prompt: 'cinematic orbit',
        duration: 5,
      }),
    ];
    const params = extractWorkflowParameters(nodes, [], 'video-node');
    expect(params.isVideo).toBe(true);
    expect(params.videoProvider).toBe('fal');
    expect(params.checkpointModel).toBe('fal-ai/wan-t2v');
    expect(params.targetProvider).toBe('video');
  });

  it('F4: mirrored provider field alone is accepted when targetProvider empty', () => {
    const nodes: NodeInstance[] = [
      createNode('video-node', 'AIVideoNode', {
        model: 'agnes-video-2.5-flash',
        provider: 'agnes',
        prompt: 'cinematic orbit',
      }),
    ];
    const params = extractWorkflowParameters(nodes, [], 'video-node');
    expect(params.videoProvider).toBe('agnes');
  });

  it('supports 3-node direct cloud generation (CheckpointLoaderSimple -> CLIPTextEncode -> SaveImage)', () => {
    const nodes: NodeInstance[] = [
      createNode('ckpt-1', 'CheckpointLoaderSimple', {
        ckpt_name: 'agnes-image-2.5-flash',
        targetProvider: 'agnes',
        size: '2K',
        aspect_ratio: '1:1',
      }),
      createNode('prompt-1', 'CLIPTextEncode', {
        text: 'a majestic ethereal snow leopard',
      }),
      createNode('save-1', 'SaveImage', {
        filename_prefix: 'Agnes_Image_25_Flash',
      }),
    ];
    const connections: Connection[] = [
      { id: 'c1', fromNodeId: 'ckpt-1', fromSocketId: 'CLIP', toNodeId: 'prompt-1', toSocketId: 'clip', type: 'CLIP' },
      { id: 'c2', fromNodeId: 'prompt-1', fromSocketId: 'CONDITIONING', toNodeId: 'save-1', toSocketId: 'images', type: 'CONDITIONING' },
    ];

    const target = resolveTargetNode(nodes, connections);
    expect(target.id).toBe('save-1');

    const params = extractWorkflowParameters(nodes, connections, target);
    expect(params.checkpointModel).toBe('agnes-image-2.5-flash');
    expect(params.targetProvider).toBe('agnes');
    expect(params.positivePrompt).toBe('a majestic ethereal snow leopard');
    expect(params.size).toBe('2K');
    expect(params.aspectRatio).toBe('1:1');
    expect(params.saveImageNodeId).toBe('save-1');
    expect(params.steps).toBeUndefined();
    expect(params.seed).toBeUndefined();
    expect(params.cfg).toBeUndefined();
    expect(params.sampler).toBeUndefined();
    expect(params.scheduler).toBeUndefined();
    expect(params.width).toBeUndefined();
    expect(params.height).toBeUndefined();

    // Also verify triggering directly from ckpt-1 or prompt-1 resolves to the same execution
    const paramsFromCkpt = extractWorkflowParameters(nodes, connections, 'ckpt-1');
    expect(paramsFromCkpt.checkpointModel).toBe('agnes-image-2.5-flash');
    expect(paramsFromCkpt.positivePrompt).toBe('a majestic ethereal snow leopard');
    expect(paramsFromCkpt.saveImageNodeId).toBe('save-1');

    const paramsFromPrompt = extractWorkflowParameters(nodes, connections, 'prompt-1');
    expect(paramsFromPrompt.checkpointModel).toBe('agnes-image-2.5-flash');
    expect(paramsFromPrompt.positivePrompt).toBe('a majestic ethereal snow leopard');
    expect(paramsFromPrompt.saveImageNodeId).toBe('save-1');
  });

  it('extracts parameters for ReplicateEngineNode and executes through Replicate provider cleanly', async () => {
    const nodes = [
      createNode('rep-1', 'ReplicateEngineNode', {
        model: 'black-forest-labs/flux-schnell',
        prompt: 'a futuristic cyberpunk cityscape',
        steps: 4,
        guidance_scale: 3.5,
        resolution: '1024x1024',
      }),
    ];
    const params = extractWorkflowParameters(nodes, [], 'rep-1');
    expect(params.targetProvider).toBe('replicate');
    expect(params.checkpointModel).toBe('black-forest-labs/flux-schnell');
    expect(params.steps).toBe(4);
    expect(params.cfg).toBe(3.5);
    expect(params.width).toBe(1024);
    expect(params.height).toBe(1024);

    const spy = vi.spyOn(EngineRegistry, 'generate').mockResolvedValueOnce({
      mediaUrl: 'https://replicate.delivery/pbxt/cyberpunk.png',
      mediaType: 'image',
      provider: 'Replicate',
      providerId: 'replicate',
      model: 'black-forest-labs/flux-schnell',
      seed: 1234,
    });

    const res = await executeWorkflow(nodes, [], () => {}, undefined, 'rep-1');
    expect(res.imageUrl).toBe('https://replicate.delivery/pbxt/cyberpunk.png');
    expect(res.provider).toBe('Replicate');
    expect(res.model).toBe('black-forest-labs/flux-schnell');
    expect(res.seed).toBe(1234);
    expect(spy).toHaveBeenCalledWith('replicate', expect.objectContaining({
      model: 'black-forest-labs/flux-schnell',
      prompt: 'a futuristic cyberpunk cityscape',
    }), expect.anything());
  });

  it('executes CheckpointLoaderSimple when targetProvider is replicate without unresolved dead-end', async () => {
    const nodes = [
      createNode('ckpt-rep', 'CheckpointLoaderSimple', {
        ckpt_name: 'black-forest-labs/flux-dev',
        targetProvider: 'replicate',
        resourceVerified: true,
      }),
      createNode('prompt-rep', 'CLIPTextEncode', {
        text: 'photorealistic neon portrait',
      }),
      createNode('save-rep', 'SaveImage', {}),
    ];
    const conns: Connection[] = [
      { id: 'c1', fromNodeId: 'ckpt-rep', fromSocketId: 'CLIP', toNodeId: 'prompt-rep', toSocketId: 'clip', type: 'CLIP' },
      { id: 'c2', fromNodeId: 'prompt-rep', fromSocketId: 'CONDITIONING', toNodeId: 'save-rep', toSocketId: 'images', type: 'CONDITIONING' },
    ];

    const spy = vi.spyOn(EngineRegistry, 'generate').mockResolvedValueOnce({
      mediaUrl: 'https://replicate.delivery/pbxt/portrait.png',
      mediaType: 'image',
      provider: 'Replicate',
      providerId: 'replicate',
      model: 'black-forest-labs/flux-dev',
      seed: 999,
    });

    const res = await executeWorkflow(nodes, conns, () => {}, undefined, 'save-rep');
    expect(res.imageUrl).toBe('https://replicate.delivery/pbxt/portrait.png');
    expect(res.provider).toBe('Replicate');
    expect(spy).toHaveBeenCalledWith('replicate', expect.anything(), expect.anything());
  });

  it('rejects execution and marks LoRA node with error on FLUX + Krea2 Turbo mismatch', async () => {
    const nodes = [
      createNode('lora-1', 'LoRALoader', {
        lora_name: '[Krea2 Turbo] AsianMix Lora',
        base_model: 'Krea2 Turbo',
        strength_model: 0.8,
      }),
      createNode('rep-1', 'ReplicateEngineNode', {
        model: 'black-forest-labs/flux-dev',
        prompt: 'a stylish portrait',
      }),
    ];
    const connections: Connection[] = [
      {
        id: 'c1',
        fromNodeId: 'lora-1',
        fromSocketId: 'MODEL',
        toNodeId: 'rep-1',
        toSocketId: 'lora',
        type: 'MODEL',
      },
    ];

    const nodeStates: Array<{ nodeId: string; state: any; error?: string }> = [];
    const spy = vi.spyOn(EngineRegistry, 'generate').mockResolvedValueOnce({
      mediaUrl: 'https://replicate.delivery/pbxt/out.png',
      mediaType: 'image',
      provider: 'Replicate',
      providerId: 'replicate',
      model: 'black-forest-labs/flux-dev',
      seed: 123,
    });

    await expect(
      executeWorkflow(
        nodes,
        connections,
        (nodeId, state, _progress, _data, error) => {
          nodeStates.push({ nodeId, state, error });
        },
        undefined,
        'rep-1'
      )
    ).rejects.toThrow(/LoRA .* 与底模 .* 架构不兼容，拒绝静默丢弃执行/);

    // Generation must NOT be triggered upstream when LoRA is incompatible
    expect(spy).not.toHaveBeenCalled();

    // LoRA node must receive error state with the exact reason
    const loraError = nodeStates.find((s) => s.nodeId === 'lora-1' && s.state === 'error');
    expect(loraError).toBeDefined();
    expect(loraError?.error).toContain('架构不兼容，拒绝静默丢弃执行');
  });

  it('retains LoRA trigger words when LLMReasoningNode rewrites prompt without them', async () => {
    const nodes = [
      createNode('ckpt-1', 'CheckpointLoaderSimple', {
        ckpt_name: 'black-forest-labs/flux-dev',
        targetProvider: 'fal',
      }),
      createNode('lora-1', 'LoRALoader', {
        lora_name: 'flux-asian-beauty',
        base_model: 'Flux.1 D',
        trigger_words: 'asian girl, cinematic lighting',
        strength_model: 1.0,
      }),
      createNode('llm-1', 'LLMReasoningNode', {
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        prompt: 'a portrait on the street',
        task_type: 'cinematic_photoreal',
      }),
      createNode('k-1', 'KSampler', {}),
      createNode('save-1', 'SaveImage', {}),
    ];
    const connections: Connection[] = [
      { id: 'c1', fromNodeId: 'ckpt-1', fromSocketId: 'MODEL', toNodeId: 'lora-1', toSocketId: 'model', type: 'MODEL' },
      { id: 'c2', fromNodeId: 'lora-1', fromSocketId: 'MODEL', toNodeId: 'k-1', toSocketId: 'model', type: 'MODEL' },
      { id: 'c3', fromNodeId: 'llm-1', fromSocketId: 'TEXT', toNodeId: 'k-1', toSocketId: 'positive', type: 'CONDITIONING' },
      { id: 'c4', fromNodeId: 'k-1', fromSocketId: 'LATENT', toNodeId: 'save-1', toSocketId: 'images', type: 'IMAGE' },
    ];

    vi.spyOn(EngineRegistry, 'chat').mockResolvedValueOnce({
      content: 'A high-definition street portrait with shallow depth of field, 8k resolution',
    } as any);

    const genSpy = vi.spyOn(EngineRegistry, 'generate').mockResolvedValueOnce({
      mediaUrl: 'https://example.test/out.png',
      mediaType: 'image',
      provider: 'fal',
      providerId: 'fal',
      model: 'black-forest-labs/flux-dev',
      seed: 42,
    });

    await executeWorkflow(nodes, connections, () => {}, undefined, 'save-1');

    expect(genSpy).toHaveBeenCalled();
    const calledPrompt = genSpy.mock.calls[0][1].prompt;
    expect(calledPrompt).toContain('asian girl');
    expect(calledPrompt).toContain('cinematic lighting');
    expect(calledPrompt).toContain('A high-definition street portrait');
    const snapshot = genSpy.mock.calls[0][1].workflowSnapshot as any;
    expect(snapshot?.requestMetadata?.promptTransform).toBeDefined();
    expect(snapshot?.requestMetadata?.promptTransform?.prependedTriggerWords).toContain('asian girl');
  });

  it('records parameter omissions for shift, random_seed, gallery_images, and resolution on HF non-z-image route', async () => {
    const nodes = [
      createNode('hf-ckpt', 'CheckpointLoaderSimple', {
        ckpt_name: 'stabilityai/stable-diffusion-xl-base-1.0',
        targetProvider: 'huggingface',
        hf_provider: 'hf-inference',
        prompt: 'a mountain landscape',
        shift: 3.0,
        random_seed: true,
        gallery_images: ['https://example.test/img1.png'],
        resolution: '1024x1024',
      }),
      createNode('save-1', 'SaveImage', {}),
    ];
    const connections: Connection[] = [
      { id: 'c1', fromNodeId: 'hf-ckpt', fromSocketId: 'MODEL', toNodeId: 'save-1', toSocketId: 'images', type: 'IMAGE' },
    ];

    const genSpy = vi.spyOn(EngineRegistry, 'generate').mockResolvedValueOnce({
      mediaUrl: 'https://example.test/out.png',
      mediaType: 'image',
      provider: 'Hugging Face',
      providerId: 'huggingface',
      model: 'stabilityai/stable-diffusion-xl-base-1.0',
      seed: 123,
    });

    await executeWorkflow(nodes, connections, () => {}, undefined, 'hf-ckpt');

    expect(genSpy).toHaveBeenCalled();
    const extra = genSpy.mock.calls[0][1].extraParams;
    const omissions = extra?.parameterOmissions || extra?.omissions;
    expect(omissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'resolution', value: '1024x1024' }),
        expect.objectContaining({ field: 'shift', value: 3.0 }),
        expect.objectContaining({ field: 'random_seed', value: true }),
        expect.objectContaining({ field: 'gallery_images', value: ['https://example.test/img1.png'] }),
      ])
    );
  });
});

describe('LoRA strength — no silent 0.8 (iron rule)', () => {
  const createNode = (id: string, type: string, values: Record<string, any>): NodeInstance => ({
    id,
    type,
    title: type,
    pos: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    values,
  });

  it('extractWorkflowParameters does not invent 0.8 when strength_model is omitted', () => {
    const nodes = [
      createNode('ckpt', 'CheckpointLoaderSimple', { ckpt_name: 'fal-ai/flux-lora', targetProvider: 'fal' }),
      createNode('lora', 'LoRALoader', { lora_name: 'https://example.test/a.safetensors' }),
      createNode('pos', 'CLIPTextEncode', { text: 'a cat' }),
      createNode('neg', 'CLIPTextEncodeNegative', { text: '' }),
      createNode('latent', 'EmptyLatentImage', { width: 512, height: 512 }),
      createNode('ksampler', 'KSampler', { seed: 1, steps: 4, cfg: 1, sampler_name: 'euler', scheduler: 'simple', denoise: 1 }),
      createNode('vae', 'VAEDecode', {}),
      createNode('save', 'SaveImage', {}),
    ];
    const connections = [
      { id: '1', fromNodeId: 'ckpt', fromSocketId: 'MODEL', toNodeId: 'lora', toSocketId: 'model', type: 'MODEL' as const },
      { id: '2', fromNodeId: 'lora', fromSocketId: 'MODEL', toNodeId: 'ksampler', toSocketId: 'model', type: 'MODEL' as const },
      { id: '3', fromNodeId: 'pos', fromSocketId: 'CONDITIONING', toNodeId: 'ksampler', toSocketId: 'positive', type: 'CONDITIONING' as const },
      { id: '4', fromNodeId: 'neg', fromSocketId: 'CONDITIONING', toNodeId: 'ksampler', toSocketId: 'negative', type: 'CONDITIONING' as const },
      { id: '5', fromNodeId: 'latent', fromSocketId: 'LATENT', toNodeId: 'ksampler', toSocketId: 'latent_image', type: 'LATENT' as const },
      { id: '6', fromNodeId: 'ksampler', fromSocketId: 'LATENT', toNodeId: 'vae', toSocketId: 'samples', type: 'LATENT' as const },
      { id: '7', fromNodeId: 'vae', fromSocketId: 'IMAGE', toNodeId: 'save', toSocketId: 'images', type: 'IMAGE' as const },
    ];
    const params = extractWorkflowParameters(nodes, connections, 'ksampler');
    expect(params.loras).toHaveLength(1);
    expect(params.loras[0].name).toContain('a.safetensors');
    expect(params.loras[0].modelStrength).toBeUndefined();
    expect(params.loras[0].clipStrength).toBeUndefined();
    expect(params.loras[0].modelStrength).not.toBe(0.8);
  });

  it('executeWorkflow rejects LoRA missing explicit strength instead of inventing 0.8', async () => {
    const nodes = [
      createNode('fal', 'FalAIEngineNode', { model: 'fal-ai/flux-lora', prompt: 'a cat' }),
      createNode('lora', 'LoRALoader', { lora_name: 'https://example.test/a.safetensors' }),
    ];
    const connections = [
      { id: 'c', fromNodeId: 'lora', fromSocketId: 'MODEL', toNodeId: 'fal', toSocketId: 'lora', type: 'MODEL' as const },
    ];
    await expect(executeWorkflow(nodes, connections, () => {}, undefined)).rejects.toThrow(/缺少显式 LoRA 强度/);
  });

  it('executeWorkflow accepts LoRA with explicit strength 0', async () => {
    const generateSpy = vi.spyOn(EngineRegistry, 'generate').mockImplementation(async (provider, p): Promise<NormalizedGenerateResult> => ({
      mediaUrl: 'https://example.com/result.png',
      provider,
      providerId: provider as any,
      model: p.model,
      seed: 1,
      mediaType: 'image',
    }));
    const nodes = [
      createNode('fal', 'FalAIEngineNode', { model: 'fal-ai/flux-lora', prompt: 'a cat' }),
      createNode('lora', 'LoRALoader', { lora_name: 'https://example.test/a.safetensors', strength_model: 0, strength_clip: 0 }),
    ];
    const connections = [
      { id: 'c', fromNodeId: 'lora', fromSocketId: 'MODEL', toNodeId: 'fal', toSocketId: 'lora', type: 'MODEL' as const },
    ];
    await executeWorkflow(nodes, connections, () => {}, undefined);
    expect(generateSpy).toHaveBeenCalled();
    expect(generateSpy.mock.calls[0][1].loras?.[0]?.strength).toBe(0);
    generateSpy.mockRestore();
  });
});
