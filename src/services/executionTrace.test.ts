import {it,expect,vi,afterEach} from 'vitest';
import {ApiTraceError,isApiTraceError} from './executionTrace';

// Regression for work-order A01: HTTP failures must stay structured so callers
// never reclassify a real upstream rejection as a network error by message text.
it('ApiTraceError carries structured status/source/endpoint fields',()=>{
  const data={errorSource:'upstream',upstreamStatus:402,endpoint:'https://api.example.com/pay',error:'Insufficient balance'};
  const err=new ApiTraceError(402,data,'/api/schema-provider/muapi/submit','{"error":"Insufficient balance"}');
  expect(err.appStatus).toBe(402);
  expect(err.upstreamStatus).toBe(402);
  expect(err.errorSource).toBe('upstream');
  expect(err.endpoint).toBe('https://api.example.com/pay');
  expect(err.rawBody).toContain('Insufficient balance');
  expect(isApiTraceError(err)).toBe(true);
});

it('tracedFetch throws ApiTraceError, not a plain reason-first Error',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({ok:false,errorSource:'upstream',upstreamStatus:403,error:'Forbidden'}),{status:403})));
  const {tracedFetch}=await import('./executionTrace');
  const caught=await tracedFetch('/api/test').then(()=>null,(e:unknown)=>e);
  expect(isApiTraceError(caught)).toBe(true);
  expect((caught as ApiTraceError).appStatus).toBe(403);
  expect((caught as ApiTraceError).errorSource).toBe('upstream');
  vi.unstubAllGlobals();
});

it('isApiTraceError rejects plain errors so only real connection failures are labeled network',()=>{
  expect(isApiTraceError(new Error('connect ECONNREFUSED'))).toBe(false);
  expect(isApiTraceError(new TypeError('fetch failed'))).toBe(false);
  // Duck-typed twin (module duplication) still counts; message lookalikes do not.
  const twin=Object.assign(new Error('x'),{name:'ApiTraceError',appStatus:500});
  expect(isApiTraceError(twin)).toBe(true);
  expect(isApiTraceError(Object.assign(new Error('HTTP 500 · upstream'),{name:'Error'}))).toBe(false);
});

afterEach(()=>vi.unstubAllGlobals());
