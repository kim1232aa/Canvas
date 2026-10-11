import {it,expect,vi,afterEach} from 'vitest';
import {AgnesDriver} from './AgnesDriver';
import {buildAgnesVideoRequest} from '../../server/agnesVideoRequest';
import {spatialRequestParameters} from '../../utils/frontendParameters';
import type {SpatialFrame} from '../../types/graph';
const original=globalThis.fetch;
afterEach(()=>globalThis.fetch=original);
it('Agnes video submits duration 3 for final server builder validation',async()=>{
  const request=vi.fn(async (_url,init)=>{
    const body=JSON.parse(String(init?.body));
    try { buildAgnesVideoRequest(body.model,body); }
    catch(error) { return new Response(JSON.stringify({error:(error as Error).message,errorSource:'local'}),{status:400}); }
    throw new Error('Expected final builder rejection');
  });globalThis.fetch=request;
  await expect(new AgnesDriver().generate({model:'agnes-video-2.5',prompt:'robot',videoDuration:3,aspectRatio:'16:9',extraParams:{size:'1080P'}},{})).rejects.toThrow(/4–12|4-12/);
  expect(request).toHaveBeenCalledTimes(1);
  expect(request.mock.calls[0][0]).toBe('/api/video/generate');
  expect(JSON.parse(request.mock.calls[0][1].body).duration).toBe(3);
});

it('Agnes video goes to the video route with duration / resolution; never images/generations',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'unauthorized'}), { status: 401 }));globalThis.fetch=request;
  await expect(new AgnesDriver().generate({model:'agnes-video-2.5',prompt:'robot',videoDuration:8,aspectRatio:'16:9',extraParams:{size:'1080P'}},{})).rejects.toThrow('unauthorized');
  expect(request.mock.calls[0][0]).toBe('/api/video/generate');
  expect(JSON.parse(request.mock.calls[0][1].body)).toMatchObject({provider:'agnes',model:'agnes-video-2.5',duration:8,size:'1080P',aspect_ratio:'16:9'});
});

it('Agnes image sends only verified image fields and records stale canvas omissions',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'missing key'}), { status: 400 }));globalThis.fetch=request;
  await expect(new AgnesDriver().generate({
    model:'agnes-image-2.1-flash',prompt:'terrarium library',negative_prompt:'blurry',width:1024,height:1024,seed:314159,steps:24,cfg:3.2,sampler_name:'euler',scheduler:'karras',denoise:1,loras:[],extraParams:{resolution:'1k'}
  },{})).rejects.toThrow('missing key');
  expect(request.mock.calls[0][0]).toBe('/api/engine/agnes/generate');
  const body=JSON.parse(request.mock.calls[0][1].body);
  expect(body).toMatchObject({model:'agnes-image-2.1-flash',prompt:'terrarium library'});
  for(const field of ['width','height','negative_prompt','seed','steps','cfg','sampler_name','scheduler','denoise']) expect(body).not.toHaveProperty(field);
  expect(body.parameterOmissions.map((x:any)=>x.field)).toEqual(expect.arrayContaining(['width','height','negative_prompt','seed','steps','cfg','sampler_name','scheduler','denoise','resolution']));
});
it('Agnes video does not send an empty loras array (upstream rejects the field), but keeps real LoRAs for the server to refuse',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'stop'}),{status:400}));globalThis.fetch=request;
  await expect(new AgnesDriver().generate({model:'agnes-video-2.5-flash',prompt:'cat',videoDuration:5,aspectRatio:'16:9',loras:[],extraParams:{resolution:'720P'}},{})).rejects.toThrow('stop');
  expect(JSON.parse(request.mock.calls[0][1].body)).not.toHaveProperty('loras');
  request.mockClear();
  await expect(new AgnesDriver().generate({model:'agnes-video-2.5-flash',prompt:'cat',videoDuration:5,aspectRatio:'16:9',loras:[{name:'a',path:'a',strength:1}],extraParams:{resolution:'720P'}},{})).rejects.toThrow('stop');
  expect(JSON.parse(request.mock.calls[0][1].body).loras).toHaveLength(1);
});

it('Agnes video maps the node resolution tier to the official size field and never sends resolution',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'stop'}),{status:400}));globalThis.fetch=request;
  await expect(new AgnesDriver().generate({model:'agnes-video-2.5-flash',prompt:'cat',videoDuration:5,aspectRatio:'16:9',extraParams:{resolution:'720P'}},{})).rejects.toThrow('stop');
  const body=JSON.parse(request.mock.calls[0][1].body);
  expect(body.size).toBe('720P');
  expect(body).not.toHaveProperty('resolution');
});

it('Agnes video keeps an explicit size over the node resolution and rejects a conflicting pair locally',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'stop'}),{status:400}));globalThis.fetch=request;
  await expect(new AgnesDriver().generate({model:'agnes-video-2.5',prompt:'cat',videoDuration:5,aspectRatio:'16:9',extraParams:{size:'1080P',resolution:'1080P'}},{})).rejects.toThrow('stop');
  expect(JSON.parse(request.mock.calls[0][1].body).size).toBe('1080P');
  request.mockClear();
  await expect(new AgnesDriver().generate({model:'agnes-video-2.5',prompt:'cat',videoDuration:5,aspectRatio:'16:9',extraParams:{size:'720P',resolution:'2K'}},{})).rejects.toThrow(/size.*resolution|resolution.*size/);
  expect(request).not.toHaveBeenCalled();
});

it('Agnes Image 2.5 sends current size/ratio fields and records stale canvas omissions',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'missing key'}), { status: 400 }));globalThis.fetch=request;
  await expect(new AgnesDriver().generate({
    model:'agnes-image-2.5-flash',prompt:'terrarium library',negative_prompt:'blurry',width:1024,height:1024,seed:314159,steps:24,cfg:3.2,sampler_name:'euler',scheduler:'karras',denoise:1,loras:[],aspectRatio:'4:3',imageSize:'2K',extraParams:{resolution:'1k'}
  },{})).rejects.toThrow('missing key');
  expect(request.mock.calls[0][0]).toBe('/api/engine/agnes/generate');
  const body=JSON.parse(request.mock.calls[0][1].body);
  expect(body).toMatchObject({model:'agnes-image-2.5-flash',prompt:'terrarium library',aspect_ratio:'4:3',size:'2K'});
  for(const field of ['width','height','negative_prompt','seed','steps','cfg','sampler_name','scheduler','denoise']) expect(body).not.toHaveProperty(field);
  expect(body.parameterOmissions.map((x:any)=>x.field)).toEqual(expect.arrayContaining(['width','height','negative_prompt','seed','steps','cfg','sampler_name','scheduler','denoise','resolution']));
});

it('preserves frontend dimension omissions in the local execution request without resubmitting dimensions',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'missing key'}), {status:400}));globalThis.fetch=request;
  const frame:SpatialFrame={id:'frame',title:'Image',pos:{x:0,y:0},width:360,height:360,prompt:'library',negativePrompt:'',status:'idle',createdAt:0,
    params:{targetProvider:'agnes',checkpoint:'agnes-image-2.5-flash',size:'2K',aspectRatio:'4:3',width:0,height:768,denoise:1,batchSize:1,seedControl:'fixed',seed:0,loras:[]}};
  const params=spatialRequestParameters(frame);
  const omissions=params.extraParams!.omissions;
  expect(params.width).toBeUndefined();expect(params.height).toBeUndefined();
  await expect(new AgnesDriver().generate(params,{})).rejects.toThrow('missing key');
  const body=JSON.parse(request.mock.calls[0][1].body);
  expect(body.parameterOmissions).toEqual(expect.arrayContaining(omissions));
  expect(body.parameterOmissions).toContainEqual({field:'seed',value:0,reason:'Agnes image endpoint schema does not accept this canvas field'});
  expect(body).not.toHaveProperty('width');expect(body).not.toHaveProperty('height');
  expect(params.extraParams!.omissions).toEqual(omissions);
});

it('deduplicates overlapping omissions by field and preserves the original omission detail',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'missing key'}), {status:400}));globalThis.fetch=request;
  const omission={field:'width',value:0,reason:'Original canvas width was omitted locally'};
  await expect(new AgnesDriver().generate({model:'agnes-image-2.5-flash',prompt:'library',width:0,height:768,extraParams:{omissions:[omission,omission]}},{})).rejects.toThrow('missing key');
  const body=JSON.parse(request.mock.calls[0][1].body);
  expect(body.parameterOmissions.filter((entry:{field:string})=>entry.field==='width')).toEqual([omission]);
  expect(body.parameterOmissions.filter((entry:{field:string})=>entry.field==='height')).toHaveLength(1);
});

it.each([
  [{actualRequest:{seed:0},historyItem:{seed:9}},0],
  [{actualRequest:{seed:13}},13],
  [{actualRequest:{seed:'7'},historyItem:{seed:0}},0],
  [{historyItem:{seed:13}},13],
  [{seed:0},0],
  [{actualRequest:{seed:false},historyItem:{seed:'13'}},null],
  [{},null],
])('Agnes video returns only a numeric server response seed: %j',async(metadata,expected)=>{
  globalThis.fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({videoUrl:'https://example.test/out.mp4',...metadata})));
  const result=await new AgnesDriver().generate({model:'agnes-video-2.5',prompt:'robot',seed:7,extraParams:{custom_parameters:{seed:0}}},{});
  expect(result.seed).toBe(expected);
});

it('Agnes image keeps seed null even when the response contains numeric seed metadata',async()=>{
  globalThis.fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({imageUrl:'https://example.test/out.png',seed:13,actualRequest:{seed:0},historyItem:{seed:7}})));
  expect((await new AgnesDriver().generate({model:'agnes-image-2.5-flash',prompt:'robot',seed:7},{})).seed).toBeNull();
});

it.each([
  [{resolution:'1080P'},undefined,{resolution:'1080P'}],
  [{size:'1080P'},undefined,{size:'1080P'}],
  [{},'1080P',{imageSize:'1080P'}],
  [{resolution:'1080P',size:'1080P'},'1080P',{resolution:'1080P',size:'1080P',imageSize:'1080P'}],
])('Agnes video retains size sources locally and keeps custom size overrides out of the routing boundary: %j',async(sources,imageSize,expected)=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:'stop'}),{status:400}));globalThis.fetch=request;
  await expect(new AgnesDriver().generate({model:'agnes-video-2.5',prompt:'robot',imageSize,extraParams:{...sources,custom_parameters:{size:'720P',seed:0,unknown_flag:false}}},{})).rejects.toThrow('stop');
  const body=JSON.parse(request.mock.calls[0][1].body);
  const built=buildAgnesVideoRequest(body.model,body);
  expect(built.requestedParameters.extraParams).toEqual(expected);
  expect(built.beforeCustom.size).toBe('1080P');
  expect(built.overrides.size).toEqual({before:'1080P',after:'720P'});
  expect(built.payload).toMatchObject({model:'agnes-video-2.5',size:'720P',seed:0,unknown_flag:false});
  for(const field of ['extraParams','resolution','imageSize','custom_parameters','provider']) expect(built.payload).not.toHaveProperty(field);
});

it('Agnes known video duration is validated after custom seconds override, retaining final seconds 8 and seed 0',async()=>{
  let built:ReturnType<typeof buildAgnesVideoRequest> | undefined;
  globalThis.fetch=vi.fn(async (_url,init)=>{
    const body=JSON.parse(String(init?.body));built=buildAgnesVideoRequest(body.model,body);
    return new Response(JSON.stringify({videoUrl:'https://example.test/out.mp4',actualRequest:built.payload,historyItem:{seed:built.payload.seed}}));
  });
  const result=await new AgnesDriver().generate({model:'agnes-video-2.5',prompt:'robot',videoDuration:3,seed:7,extraParams:{custom_parameters:{seconds:8,seed:0}}},{});
  expect(built!.beforeCustom).toMatchObject({seconds:3,seed:7});
  expect(built!.overrides).toMatchObject({seconds:{before:3,after:8},seed:{before:7,after:0}});
  expect(built!.payload).toMatchObject({seconds:'8',seed:0});
  expect(result.seed).toBe(0);
});

it('Agnes explicit unknown video model keeps duration 2 unverified and returns video media type',async()=>{
  let built:ReturnType<typeof buildAgnesVideoRequest> | undefined;
  const request=vi.fn(async (_url,init)=>{
    const body=JSON.parse(String(init?.body));built=buildAgnesVideoRequest(body.model,body);
    return new Response(JSON.stringify({videoUrl:'https://example.test/out.mp4',actualRequest:built.payload}));
  });globalThis.fetch=request;
  const result=await new AgnesDriver().generate({model:'custom-model',isVideo:true,prompt:'robot',videoDuration:2},{});
  expect(request.mock.calls[0][0]).toBe('/api/video/generate');
  expect(built!.payload).toMatchObject({model:'custom-model',seconds:2});
  expect(built!.fieldStatus.seconds).toBe('unverified');
  expect(result).toMatchObject({mediaUrl:'https://example.test/out.mp4',mediaType:'video',model:'custom-model',seed:null});
});

it('Agnes explicit unknown video success without duration is not classified as an image',async()=>{
  globalThis.fetch=vi.fn().mockResolvedValue(new Response(JSON.stringify({videoUrl:'https://example.test/out.mp4'})));
  expect((await new AgnesDriver().generate({model:'custom-model',isVideo:true,prompt:'robot'},{})).mediaType).toBe('video');
});

it.each(['provider','model','extraParams'])('Agnes custom JSON cannot overwrite the %s boundary',async(field)=>{
  globalThis.fetch=vi.fn(async (_url,init)=>{
    const body=JSON.parse(String(init?.body));
    try { buildAgnesVideoRequest(body.model,body); }
    catch(error) { return new Response(JSON.stringify({error:(error as Error).message,errorSource:'local'}),{status:400}); }
    throw new Error('Expected boundary rejection');
  });
  await expect(new AgnesDriver().generate({model:'agnes-video-2.5',prompt:'robot',extraParams:{custom_parameters:{[field]:'replacement'}}},{})).rejects.toThrow(/模型\/路由\/凭据边界/);
});
