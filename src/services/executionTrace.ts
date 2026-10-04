import {describeApiFailure} from '../utils/apiFailure';
import {sanitizeGenerationMetadata} from '../utils/generationMetadata';
export interface ExecutionRecord { id:number; time:string; route:string; method:string; request:unknown; status:number|null; response:unknown; state:'pending'|'complete'|'error'; stack?:string }
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
      const error=new Error(`${describeApiFailure(response.status,data,route)}\n${raw}`);
      record.stack=error.stack;
      throw error;
    }
    return response;
  } catch(error:any){record.state='error';record.stack=error.stack;records=[...records];emit();throw error;}
}
