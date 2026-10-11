import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {executeWorkflow,extractWorkflowParameters} from './graphEngine';
import {buildAgnesVideoRequest} from '../server/agnesVideoRequest';
import type {NodeInstance} from '../types/graph';
import * as api from '../services/api';

const originalFetch=globalThis.fetch;
const videoNode=(values:Record<string,unknown>={}):NodeInstance=>({
  id:'video',type:'AIVideoNode',title:'Agnes video',pos:{x:0,y:0},inputs:[],outputs:[],
  values:{model:'agnes-video-2.5',targetProvider:'agnes',prompt:'robot',...values},
});

beforeEach(()=>{
  vi.spyOn(api,'getStoredApiKeys').mockReturnValue({} as ReturnType<typeof api.getStoredApiKeys>);
});
afterEach(()=>{
  globalThis.fetch=originalFetch;
  vi.restoreAllMocks();
});

it.each([
  [{seed:13,control_after_generate:'fixed'},13],
  [{seed:0,seedControl:'fixed'},0],
  [{seed:13,control_after_generate:'increment'},13],
  [{seed:0,seedControl:'decrement'},0],
])('Agnes AIVideoNode extracts explicit size and seed without pre-generation increment/decrement: %j',(values,expected)=>{
  const extracted=extractWorkflowParameters([videoNode({size:'1080P',resolution:'720P',...values})],[],'video');
  expect(extracted).toMatchObject({size:'1080P',resolution:'720P',seed:expected,videoProvider:'agnes'});
});

it.each([
  {control_after_generate:'randomize'},
  {seedControl:'randomize'},
])('Agnes AIVideoNode randomizes seed only when explicitly selected: %j',control=>{
  vi.spyOn(Math,'random').mockReturnValue(0.25);
  expect(extractWorkflowParameters([videoNode({seed:13,...control})],[],'video').seed).toBe(250000000);
});

it('Agnes AIVideoNode prioritizes the graph control and does not invent an unset seed',()=>{
  const random=vi.spyOn(Math,'random');
  expect(extractWorkflowParameters([videoNode({seed:0,control_after_generate:'fixed',seedControl:'randomize'})],[],'video').seed).toBe(0);
  expect(extractWorkflowParameters([videoNode()],[],'video').seed).toBeUndefined();
  expect(random).not.toHaveBeenCalled();
});

it.each([13,0])('executeWorkflow uses the real Agnes driver and final builder for node size and seed %s',async seed=>{
  let body:Record<string,any> | undefined;
  let built:ReturnType<typeof buildAgnesVideoRequest> | undefined;
  globalThis.fetch=vi.fn(async (url,init)=>{
    expect(url).toBe('/api/video/generate');
    body=JSON.parse(String(init?.body));built=buildAgnesVideoRequest(body!.model,body!);
    return new Response(JSON.stringify({videoUrl:'https://example.test/out.mp4',actualRequest:built.payload,historyItem:{seed:built.payload.seed}}));
  });
  const result=await executeWorkflow([videoNode({size:'1080P',seed,control_after_generate:'fixed',duration:8})],[],()=>{},undefined,'video');
  expect(body).toMatchObject({provider:'agnes',model:'agnes-video-2.5',size:'1080P',seed,extraParams:{size:'1080P'}});
  expect(built!.payload).toMatchObject({size:'1080P',seconds:'8',seed});
  expect(built!.payload).not.toHaveProperty('extraParams');
  expect(result).toMatchObject({imageUrl:'https://example.test/out.mp4',seed,isVideo:true});
});

it('executeWorkflow transparently rejects conflicting node size 1080P and resolution 720P before network',async()=>{
  const request=vi.fn().mockResolvedValue(new Response(JSON.stringify({videoUrl:'https://example.test/out.mp4'})));globalThis.fetch=request;
  await expect(executeWorkflow([videoNode({size:'1080P',resolution:'720P',seed:13})],[],()=>{},undefined,'video')).rejects.toThrow(/resolution="720P".*size="1080P"/);
  expect(request).not.toHaveBeenCalled();
});

it('executeWorkflow retains node resolution source and JSON overrides with zero/false through the real driver and builder',async()=>{
  let built:ReturnType<typeof buildAgnesVideoRequest> | undefined;
  globalThis.fetch=vi.fn(async (url,init)=>{
    expect(url).toBe('/api/video/generate');
    const body=JSON.parse(String(init?.body));built=buildAgnesVideoRequest(body.model,body);
    return new Response(JSON.stringify({videoUrl:'https://example.test/out.mp4',actualRequest:built.payload,historyItem:{seed:built.payload.seed}}));
  });
  const result=await executeWorkflow([videoNode({resolution:'1080P',seed:7,control_after_generate:'fixed',duration:8,custom_parameters:'{"size":"720P","seed":0,"unknown_flag":false}'})],[],()=>{},undefined,'video');
  expect(built!.requestedParameters.extraParams).toEqual({resolution:'1080P'});
  expect(built!.beforeCustom).toMatchObject({size:'1080P',seed:7});
  expect(built!.overrides).toMatchObject({size:{before:'1080P',after:'720P'},seed:{before:7,after:0}});
  expect(built!.payload).toMatchObject({size:'720P',seed:0,unknown_flag:false});
  expect(built!.payload).not.toHaveProperty('extraParams');
  expect(built!.payload).not.toHaveProperty('resolution');
  expect(result.seed).toBe(0);
});

it('executeWorkflow does not infer provider from a custom model and keeps unknown duration unverified',async()=>{
  let built:ReturnType<typeof buildAgnesVideoRequest> | undefined;
  globalThis.fetch=vi.fn(async (url,init)=>{
    expect(url).toBe('/api/video/generate');
    const body=JSON.parse(String(init?.body));built=buildAgnesVideoRequest(body.model,body);
    return new Response(JSON.stringify({videoUrl:'https://example.test/out.mp4',actualRequest:built.payload}));
  });
  const result=await executeWorkflow([videoNode({model:'custom-model',duration:2,seed:0})],[],()=>{},undefined,'video');
  expect(built!.payload).toMatchObject({model:'custom-model',seconds:2,seed:0});
  expect(built!.fieldStatus.seconds).toBe('unverified');
  expect(result).toMatchObject({model:'custom-model',isVideo:true,seed:0});
});
