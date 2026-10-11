import {beforeEach, describe, expect, it, vi} from 'vitest';
import {CanvasStore} from '../../hosting/store';
import {requestContext} from '../../hosting/context';

const sdk = vi.hoisted(() => ({generate:vi.fn(),options:[] as any[]}));
vi.mock('@google/genai', () => ({GoogleGenAI:class {models={generateContent:sdk.generate};constructor(options:any){sdk.options.push(options);}}}));
const bodyBytes=Buffer.alloc(400*1024,3), image=`data:image/png;base64,${bodyBytes.toString('base64')}`;
function fixture() {
 const objects=new Map<string,Buffer>(); const items=new Map<string,any>();
 const bucket:any={put:async(key:string,value:any)=>{objects.set(key,Buffer.from(value));},get:async(key:string)=>{const bytes=objects.get(key);return bytes?{json:async()=>JSON.parse(bytes.toString()),arrayBuffer:async()=>bytes}:null;},delete:async()=>{}};
 const db:any={prepare:(sql:string)=>({bind:(...args:any[])=>({first:async()=>null,all:async()=>({results:[]}),run:async()=>{if(sql.startsWith('INSERT INTO canvas_entries')) items.set(args[1],JSON.parse(objects.get(args[2])!.toString()));}})})};
 return {store:new CanvasStore(db,bucket,''),items,objects};
}
async function generatedApp() {const file='../../hosting/server.generated.ts';return (await import(file)).app;}
async function dispatch(app:any,pathname:string,body:any,store:CanvasStore) {
 const req:any={method:'POST',path:pathname,originalUrl:pathname,body,headers:{},params:{},query:{}};
 let payload:any, status=200;
 const response=new Promise<any>((resolve,reject)=>{
  const res:any={statusCode:200,status(code:number){status=code;this.statusCode=code;return this;},json(value:any){payload=value;resolve({status,payload});return this;},setHeader:()=>{},getHeader:()=>{},headersSent:false};
  const next=(error?:any)=>{if(error)reject(error);};
  requestContext.run({origin:'https://fixture.test',authenticatedUserId:'fixture-owner',ownerUserId:'fixture-owner',settings:{geminiKey:'fixture-credential'},store,pending:[]},async()=>{
   try {
    const {refreshHostedKeyPool}=await import('../../hosting/server.generated'); refreshHostedKeyPool();
    const tracing=app._router.stack.find((layer:any)=>!layer.route && String(layer.handle).includes('generationContext.run'));
    const route=app._router.stack.find((layer:any)=>layer.route && (Array.isArray(layer.route.path)?layer.route.path.includes(pathname):layer.route.path===pathname));
    if(tracing) tracing.handle(req,res,()=>{Promise.resolve(route.route.stack[0].handle(req,res,next)).catch(reject);});
    else await route.route.stack[0].handle(req,res,next);
   } catch(error){reject(error);}
  });
 });
 return response;
}
beforeEach(()=>{sdk.generate.mockReset();sdk.options.splice(0);});
describe('actual hosting adapter generation contract (network fixture, not real generation)',()=>{
 it('returns R2-backed Gemini image/history and externalized reference provenance',async()=>{
  sdk.generate.mockResolvedValue({candidates:[{content:{parts:[{inlineData:{mimeType:'image/png',data:bodyBytes.toString('base64')}}]}}]});
  const {store,items}=fixture();
  const {status,payload}=await dispatch(await generatedApp(),'/api/gemini/generate',{model:'fixture-image-model',prompt:'fixture prompt',image_url:image},store);
  expect(status).toBe(200);
  expect(payload.imageUrl).toMatch(/^\/api\/media\//);
  expect(payload.historyItem.url).toBe(payload.imageUrl);
  expect(items.get(payload.historyItem.id)).toEqual(payload.historyItem);
  expect(JSON.stringify(payload).length).toBeLessThan(8000);
  expect(sdk.options[0].apiKey).toBe('fixture-credential');
  expect(sdk.generate.mock.calls[0][0].contents.parts[0].inlineData.data).toBe(bodyBytes.toString('base64'));
 });
 it('applies the 500KB history record limit after externalizing 400KiB video bytes',async()=>{
  const {store,items}=fixture();
  const {status,payload}=await dispatch(await generatedApp(),'/api/history',{videoUrl:image.replace('image/png','video/mp4'),prompt:'fixture video'},store);
  expect(status).toBe(200);expect(payload.url).toMatch(/^\/api\/media\//);expect(payload.videoUrl).toBe(payload.url);
  expect(items.get(payload.id)?.url).toBe(payload.url);
 });
});
