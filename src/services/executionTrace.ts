import {describeApiFailure, userFacingApiFailure} from '../utils/apiFailure';
import {sanitizeGenerationMetadata} from '../utils/generationMetadata';
/** fix10: request category, set by the caller of tracedFetch (entry point), never by provider. local = LOCAL event rows (no request). */
export type ExecutionCategory = 'generation'|'catalog'|'schema'|'local';
export interface ExecutionRecord { /** fix10: see ExecutionCategory; absent only on rows restored from older sessions. */ category?:ExecutionCategory; /** Hidden from the bottom-bar alert only (provider switch / new run); the row itself stays — log is append-only per session. */ acknowledged?:boolean; id:number; time:string; route:string; method:string; request:unknown; status:number|null; response:unknown; state:'pending'|'complete'|'error'; stack?:string; runTarget?:string; runSeq?:number; runLabel?:string; /** clean-1029: user operation that issued this GET (catalog / Schema grouping). */ opSeq?:number; opLabel?:string; /** Loaded from sessionStorage after a reload: belongs to the page before the refresh, never to this session's state. */ previousPage?:boolean }

/** Structured API failure: classification lives in fields, not in message text.
 *  Callers must branch on these fields, never on message wording. */
export class ApiTraceError extends Error {
  readonly appStatus:number;
  readonly upstreamStatus:number|null;
  readonly errorSource:string;
  readonly endpoint:string|undefined;
  readonly rawBody:string;
  /** Parsed response body (verbatim) — lets callers classify via structured fields (e.g. isLocalNotOutbound). */
  readonly data:unknown;
  constructor(appStatus:number,data:any,route:string,raw:string) {
    // First line = plain user conclusion (toast / node banner); tech stays in rawBody + exec log details.
    super(`${userFacingApiFailure(appStatus,data,route)}\n${describeApiFailure(appStatus,data,route)}\n${raw}`);
    this.name='ApiTraceError';
    this.appStatus=appStatus;
    this.rawBody=raw;
    this.data=data;
    const nested=data && typeof data==='object' ? Object.entries(data).find(([k,v]:any)=>k!=='historyItem' && v && typeof v==='object' && v.error)?.[1] as any : undefined;
    const traces=Array.isArray(data?.executionTrace) ? data.executionTrace : [];
    const failed=traces.findLast((t:any)=>t.status>=400 || t.status===null);
    // Numeric HTTP statuses only: a nested object such as the recorded historyItem carries status:'local_blocked' (not an HTTP code).
    const num=(v:unknown)=>typeof v==='number'?v:undefined;
    this.upstreamStatus=num(data?.upstreamStatus) ?? num(failed?.status) ?? num(nested?.status) ?? null;
    this.endpoint=data?.endpoint || data?.exactEndpointCalled || failed?.endpoint || nested?.exactEndpointCalled;
    this.errorSource=data?.errorSource || (failed ? (failed.status===null ? 'network' : 'upstream') : 'API');
  }
}
/** Duck-typed guard so classification survives module duplication; never parse message text. */
export function isApiTraceError(value:unknown):value is ApiTraceError {
  return value instanceof ApiTraceError || (value instanceof Error && value.name==='ApiTraceError' && typeof (value as any).appStatus==='number');
}
// Persist across page reload (session only) so a hard refresh after a failed run does not erase the generation POST.
const STORAGE_KEY='canvas.executionRecords.v1';
const MAX_STORED_CHARS=20000;
/** sessionStorage only (reload survival); the in-memory session log is never trimmed. */
const MAX_STORED_RECORDS=300;
const clipString=(v:string):string=>v.length>MAX_STORED_CHARS?v.slice(0,MAX_STORED_CHARS)+`…[会话存储截断，原长 ${v.length}]`:v;
/** Keys that must survive sessionStorage clip so a reload still shows what was sent (loras / endpoint) and why it failed. */
const CLIP_KEEP_RESPONSE_KEYS=['ok','error','errorSource','endpoint','actualRequest','blockedField','proposedRequest','rawResponse','upstreamStatus','upstreamResponseBody','schemaRead'] as const;
const clip=(v:unknown):unknown=>{
  if(typeof v==='string')return clipString(v);
  if(v==null || typeof v!=='object')return v;
  try{
    const t=JSON.stringify(v);
    if(!t || t.length<=MAX_STORED_CHARS)return v;
    // Prefer keeping generation evidence over a blind head slice (reverify: truncated response lost actualRequest.loras).
    if(!Array.isArray(v)){
      const src=v as Record<string,unknown>;
      const kept:Record<string,unknown>={storedTruncated:true,originalLength:t.length};
      for(const k of CLIP_KEEP_RESPONSE_KEYS){if(Object.hasOwn(src,k))kept[k]=src[k];}
      // historyItem can be huge; keep only fields the exec-log / history card need for LoRA + status.
      if(isRecordLite(src.historyItem)){
        const h=src.historyItem as Record<string,unknown>;
        kept.historyItem={id:h.id,status:h.status,loras:h.loras,upstreamStatus:h.upstreamStatus,upstreamEndpoint:h.upstreamEndpoint,
          requestMetadata:isRecordLite(h.requestMetadata)?{actualRequest:(h.requestMetadata as any).actualRequest}:undefined};
      }
      const keptText=JSON.stringify(kept);
      if(keptText.length<=MAX_STORED_CHARS*2)return kept; // allow modest overshoot for evidence; better than losing loras
      // Last resort: drop rawResponse/stack-sized fields, keep actualRequest.
      delete kept.rawResponse;
      if(typeof kept.error==='string')kept.error=clipString(kept.error);
      return kept;
    }
    return {storedTruncated:true,originalLength:t.length,head:t.slice(0,MAX_STORED_CHARS)};
  }catch{return String(v);}
};
const isRecordLite=(x:unknown):x is Record<string,unknown>=>!!x && typeof x==='object' && !Array.isArray(x);
/** Exported for unit tests — same clip used when persisting to sessionStorage. */
export const clipForSessionStorage=clip;
/** Reload survival: earlier rows stay readable but are marked previousPage+acknowledged so they never drive this session's red/pending state. */
export const loadStored=():ExecutionRecord[]=>{try{const raw=globalThis.sessionStorage?.getItem(STORAGE_KEY);const list=raw?JSON.parse(raw):[];return Array.isArray(list)?list.map((r:any)=>({...(r.state==='pending'?{...r,state:'error',response:r.response ?? {error:'页面刷新时请求仍在进行，结果未知'}}:r),previousPage:true,acknowledged:true})):[];}catch{return [];}};
const store=()=>{try{globalThis.sessionStorage?.setItem(STORAGE_KEY,JSON.stringify(records.slice(0,MAX_STORED_RECORDS).map(r=>({...r,request:clip(r.request),response:clip(r.response)}))));}catch{/* quota: keep in memory only */}};
let records:ExecutionRecord[]=loadStored();
const listeners=new Set<()=>void>();
let currentRunTarget:string|null=null;
/** Node the current graph run executes; stamped on its non-GET requests so the log's first line names it. */
export function setCurrentRunTarget(label:string|null){currentRunTarget=label;}
let runSeq=records.reduce((m,r)=>Math.max(m,r.runSeq||0),0);let currentRunLabel:string|null=null;
/** Drop error entries so a prior 402 never sticks on the bottom-left bar after provider switch. */
export function clearExecutionErrors():void{
  records=records.map(r=>r.state==='error' && !r.acknowledged?{...r,acknowledged:true}:r);emit();
}
/** Start a new run: drop previous error + stuck pending entries so prior upstream text never binds to this run. */
export function beginRun(now:Date=new Date()):number{
  runSeq+=1;currentRunLabel=`第 ${runSeq} 次运行 · ${formatRecordTime(now.toISOString())}`;
  beginTraceOperation(`第 ${runSeq} 次运行`,now);
  // Append-only: earlier rows stay in the log; they only stop driving the bottom-bar alert.
  records=records.map(r=>(r.state==='error'||r.state==='pending') && !r.acknowledged?{...r,acknowledged:true}:r);emit();return runSeq;
}
export const currentRunSeq=()=>runSeq;
/** clean-1351 #6: the run is over — later requests (LoRA Hub, catalog, Schema) must never carry 「第 N 次运行」. */
export function endRun():void{currentRunLabel=null;if(currentOpLabel && /次运行/.test(currentOpLabel))currentOpLabel=null;}
/** clean-1029: user-operation context for catalog / Schema GETs (exec log groups them per operation with request counts). */
let opSeq=records.reduce((m,r)=>Math.max(m,r.opSeq||0),0);let currentOpLabel:string|null=null;
export function beginTraceOperation(label:string,now:Date=new Date()):number{
  opSeq+=1;currentOpLabel=`操作 ${opSeq} · ${label} · ${formatRecordTime(now.toISOString())}`;return opSeq;
}
export const currentTraceOperation=()=>currentOpLabel?{opSeq,opLabel:currentOpLabel}:null;
export const subscribeExecution=(fn:()=>void)=>{listeners.add(fn);return ()=>{listeners.delete(fn);};};
export const getExecutions=()=>records;
const emit=()=>{store();listeners.forEach(fn=>fn());};
/**
 * GET in-flight dedupe: identical GETs (same URL + headers) issued while one is pending — e.g. React StrictMode
 * double effects — share ONE network request and ONE exec-log record; each caller gets its own clone of the Response.
 * Removed on settle (no result caching). Non-GET requests are never deduped.
 */
const getInFlight=new Map<string,Promise<Response>>();
export const tracedGetInFlightSize=()=>getInFlight.size;
/** fix10: category is passed by the call site. Default 'generation' = engine drivers (they import tracedFetch as fetch); catalog/schema entry points pass theirs explicitly. */
export function tracedFetch(input:RequestInfo|URL,init?:RequestInit,category:ExecutionCategory='generation'):Promise<Response> {
  if((init?.method || 'GET').toUpperCase()!=='GET' || typeof input!=='string')return tracedFetchOnce(input,init,category);
  const h=init?.headers;const headerList=h instanceof Headers?[...h.entries()]:Array.isArray(h)?h:Object.entries(h||{});
  const key=JSON.stringify([input,headerList.map(([k,v])=>[String(k).toLowerCase(),String(v)]).sort()]);
  let p=getInFlight.get(key);
  if(!p){
    const created=tracedFetchOnce(input,init,category);
    p=created;getInFlight.set(key,created);
    created.then(()=>{},()=>{}).finally(()=>{if(getInFlight.get(key)===created)getInFlight.delete(key);});
  }
  return p.then(r=>r.clone());
}
async function tracedFetchOnce(input:RequestInfo|URL,init?:RequestInit,category:ExecutionCategory='generation'):Promise<Response> {
  const route=String(input);
  let request:unknown=init?.body;
  if(typeof request==='string'){try{request=JSON.parse(request);}catch{}}
  const record:ExecutionRecord={id:Date.now()+Math.random(),time:new Date().toISOString(),route,method:init?.method || 'GET',category,request:sanitizeGenerationMetadata(request),status:null,response:null,state:'pending',...(currentRunTarget && (init?.method || 'GET').toUpperCase()!=='GET'?{runTarget:currentRunTarget}:{}),...(currentRunLabel?{runSeq,runLabel:currentRunLabel}:{}),...(currentOpLabel && (init?.method || 'GET').toUpperCase()==='GET'?{opSeq,opLabel:currentOpLabel}:{})};
  records=[record,...records];emit();
  try {
    const response=await fetch(input,withCanvasOrigin(route,init));
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

/** Catalog / Schema lookups are not generation requests; UI groups them separately and never labels them 完成. */
export function isNonGenerationRecord(r:Pick<ExecutionRecord,'method'|'route'> & {category?:ExecutionCategory}):boolean {
  if(r.category)return r.category==='catalog'||r.category==='schema'; // fix10: explicit category wins; heuristic below only for rows restored from pre-fix10 sessions
  if(String(r.method).toUpperCase()==='LOCAL')return String(r.route||'').startsWith('Schema 复用'); // clean-1333: reuse rows sit with the Schema rows
  return String(r.method||'GET').toUpperCase()==='GET' && /\/api\/(models|model-schema|loras?|catalog)\b/.test(String(r.route||''));
}
/** clean-1149 #6: whole app uses Asia/Shanghai explicitly (box clock may be Tokyo); label always 「北京时间」. */
export const CANVAS_TIME_ZONE = 'Asia/Shanghai';
export const CANVAS_TIME_ZONE_LABEL = '北京时间';
/** Record time for exec log + history cards (one formatter). ISO stays on the record. */
export function formatRecordTime(iso:string,timeZone:string=CANVAS_TIME_ZONE):string {
  const d=new Date(iso);if(Number.isNaN(d.getTime()))return iso;
  const tz=timeZone || CANVAS_TIME_ZONE;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}（${timeZoneLabel(tz,d)}）`;
}
/** clean-1651: clock-only 「HH:MM:SS」 in Asia/Shanghai for prior-run node badges. */
export function formatBeijingHms(iso:string,timeZone:string=CANVAS_TIME_ZONE):string {
  const d=new Date(iso);if(Number.isNaN(d.getTime()))return '';
  const tz=timeZone || CANVAS_TIME_ZONE;
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:tz,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(d).map(p=>[p.type,p.value]));
  return `${parts.hour}:${parts.minute}:${parts.second}`;
}
/** Always 「北京时间」 when zone is Asia/Shanghai (default); never surface 「日本标准时间」 from the box locale. */
export function timeZoneLabel(tz:string,_at:Date=new Date()):string {
  if(!tz || tz===CANVAS_TIME_ZONE || /^Asia\/(Shanghai|Chongqing|Harbin|Urumqi|Chungking)$|^PRC$/.test(tz))return CANVAS_TIME_ZONE_LABEL;
  return CANVAS_TIME_ZONE_LABEL; // clean-1149: site-wide single zone
}

/** Tag Canvas-UI requests to our own /api so the server can label direct (curl/script) calls 「本机直调」 in history. */
export function withCanvasOrigin(route:string,init?:RequestInit):RequestInit|undefined {
  if(!/^\/api\//.test(route))return init;
  const h=init?.headers;
  if(typeof Headers!=='undefined' && h instanceof Headers){const next=new Headers(h);next.set('x-canvas-origin','browser-ui');return {...init,headers:next};}
  if(Array.isArray(h))return {...init,headers:[...h,['x-canvas-origin','browser-ui']]};
  return {...init,headers:{...(h as Record<string,string>|undefined),'x-canvas-origin':'browser-ui'}};
}

/**
 * clean-1333: a log row for something that happened WITHOUT a network request (canvas-side local block, or reuse of an
 * earlier Schema result). method 'LOCAL', status null, `localOnly:true`, `requestCount:0` — so the log shows the event
 * and never implies a request was sent.
 * clean-1613 #2: optional `attach` binds the row to a run even after endRun() cleared currentRunLabel (viewport pan
 * is scheduled after finally). Viewport pan must use state 'complete' — it is not a request failure.
 */
export type LocalEventAttach = { runSeq?: number; runLabel?: string | null; runTarget?: string | null; opSeq?: number; opLabel?: string | null };
export function currentRunAttach(): LocalEventAttach {
  return {
    runSeq: currentRunLabel ? runSeq : undefined,
    runLabel: currentRunLabel,
    runTarget: currentRunTarget,
    opSeq: currentOpLabel ? opSeq : undefined,
    opLabel: currentOpLabel,
  };
}
export function recordLocalEvent(route:string,response:Record<string,unknown>,state:'complete'|'error'='error',now:Date=new Date(),attach?:LocalEventAttach):ExecutionRecord{
  const a = attach || {};
  const runLabel = a.runLabel !== undefined ? a.runLabel : currentRunLabel;
  const runSeqN = a.runSeq !== undefined ? a.runSeq : (runLabel ? runSeq : undefined);
  const runTarget = a.runTarget !== undefined ? a.runTarget : currentRunTarget;
  const opLabel = a.opLabel !== undefined ? a.opLabel : currentOpLabel;
  const opSeqN = a.opSeq !== undefined ? a.opSeq : (opLabel ? opSeq : undefined);
  const record:ExecutionRecord={id:now.getTime()+Math.random(),time:now.toISOString(),route,method:'LOCAL',category:String(route||'').startsWith('Schema 复用')?'schema':'local',request:null,status:null,response:{...response,localOnly:true,requestCount:0},state,
    ...(runTarget?{runTarget}:{}),...(runLabel?{runSeq:runSeqN,runLabel}:{}),...(opLabel?{opSeq:opSeqN,opLabel}:{})};
  records=[record,...records];emit();
  return record;
}

/** fix10: category of a row; pre-fix10 restored rows (no category) are reported as 'legacy'. */
export function recordCategory(r:Pick<ExecutionRecord,'category'>):ExecutionCategory|'legacy'{return r.category ?? 'legacy';}
export const CATEGORY_LABEL:Record<ExecutionCategory|'legacy',string>={generation:'生成',catalog:'目录',schema:'Schema',local:'本地',legacy:'旧记录'};
/** fix10: bottom-bar counts. 生成 = category generation; 目录/Schema = catalog + schema; 本地 (LOCAL events, no request) counted separately. */
export function categoryCounts(rs:Pick<ExecutionRecord,'category'>[]):{generation:number;aux:number;local:number}{
  let generation=0,aux=0,local=0;for(const r of rs){const c=r.category;if(c==='generation')generation++;else if(c==='catalog'||c==='schema')aux++;else if(c==='local')local++;}
  return {generation,aux,local};
}
export const countsLabel=(rs:Pick<ExecutionRecord,'category'>[])=>{const c=categoryCounts(rs);return `生成 ${c.generation} · 目录/Schema ${c.aux}${c.local?` · 本地 ${c.local}`:''}`;};
