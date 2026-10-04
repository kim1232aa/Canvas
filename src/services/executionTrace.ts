import {describeApiFailure} from '../utils/apiFailure';
import {sanitizeGenerationMetadata} from '../utils/generationMetadata';
export interface ExecutionRecord { id:number; time:string; route:string; method:string; request:unknown; status:number|null; response:unknown; state:'pending'|'complete'|'error'; stack?:string }

/** Structured API failure: classification lives in fields, not in message text.
 *  Callers must branch on these fields, never on message wording. */
export class ApiTraceError extends Error {
  readonly appStatus:number;
  readonly upstreamStatus:number|null;
  readonly errorSource:string;
  readonly endpoint:string|undefined;
  readonly rawBody:string;
  constructor(appStatus:number,data:any,route:string,raw:string) {
    super(`${describeApiFailure(appStatus,data,route)}\n${raw}`);
    this.name='ApiTraceError';
    this.appStatus=appStatus;
    this.rawBody=raw;
    const nested=data && typeof data==='object' ? Object.values(data).find((v:any)=>v && typeof v==='object' && v.error) as any : undefined;
    const traces=Array.isArray(data?.executionTrace) ? data.executionTrace : [];
    const failed=traces.findLast((t:any)=>t.status>=400 || t.status===null);
    this.upstreamStatus=data?.upstreamStatus ?? failed?.status ?? nested?.status ?? null;
    this.endpoint=data?.endpoint || data?.exactEndpointCalled || failed?.endpoint || nested?.exactEndpointCalled;
    this.errorSource=data?.errorSource || (failed ? (failed.status===null ? 'network' : 'upstream') : 'API');
  }
}
/** Duck-typed guard so classification survives module duplication; never parse message text. */
export function isApiTraceError(value:unknown):value is ApiTraceError {
  return value instanceof ApiTraceError || (value instanceof Error && value.name==='ApiTraceError' && typeof (value as any).appStatus==='number');
}
let records:ExecutionRecord[]=[];
const listeners=new Set<()=>void>();
export const subscribeExecution=(fn:()=>void)=>{listeners.add(fn);return ()=>{listeners.delete(fn);};};
export const getExecutions=()=>records;
const emit=()=>listeners.forEach(fn=>fn());
export async function tracedFetch(input:RequestInfo|URL,init?:RequestInit):Promise<Response> {
  const route=String(input);
  let request:unknown=init?.body;
  if(typeof request==='string'){try{request=JSON.parse(request);}catch{}}
  const record:ExecutionRecord={id:Date.now()+Math.random(),time:new Date().toISOString(),route,method:init?.method || 'GET',request:sanitizeGenerationMetadata(request),status:null,response:null,state:'pending'};
  records=[record,...records].slice(0,50);emit();
  try {
    const response=await fetch(input,init);
    const raw=await response.clone().text();
    let data:any=raw;try{data=JSON.parse(raw);}catch{}
    record.status=response.status;record.response=data;record.state=response.ok && data?.ok!==false?'complete':'error';
    records=[...records];emit();
    if(!response.ok || data?.ok===false){
      const error=new ApiTraceError(response.status,data,route,raw);
      record.stack=error.stack;
      throw error;
    }
    return response;
  } catch(error:any){record.state='error';record.stack=error.stack;records=[...records];emit();throw error;}
}
