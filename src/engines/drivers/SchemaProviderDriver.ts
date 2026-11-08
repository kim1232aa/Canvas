import { tracedFetch as fetch, isApiTraceError } from '../../services/executionTrace';
import { sharedGetJson, peekSharedGetMeta } from '../../services/sharedGet';
import { recordLocalEvent } from '../../services/executionTrace';
import { BaseEngineDriver } from '../BaseEngineDriver';
import { ModelSpec, NormalizedGenerateParams, NormalizedGenerateResult } from '../types';

const PROVIDERS = {
  muapi: { name: 'MuAPI', color: '#8b5cf6', key: 'muapiKey', header: 'x-muapi-key' },
  wavespeed: { name: 'WaveSpeed', color: '#06b6d4', key: 'wavespeedKey', header: 'x-wavespeed-key' },
  sogni: { name: 'Sogni', color: '#f97316', key: 'sogniKey', header: 'x-sogni-key' },
  krea: { name: 'Krea', color: '#e11d48', key: 'kreaKey', header: 'x-krea-key' },
  together: { name: 'Together', color: '#0ea5e9', key: 'togetherKey', header: 'x-together-key' },
  aimlapi: { name: 'AIMLAPI', color: '#7c3aed', key: 'aimlapiKey', header: 'x-aimlapi-key' },
  novita: { name: 'Novita', color: '#16a34a', key: 'novitaKey', header: 'x-novita-key' },
  venice: { name: 'Venice', color: '#a855f7', key: 'veniceKey', header: 'x-venice-key' },
  deepinfra: { name: 'DeepInfra', color: '#0f766e', key: 'deepinfraKey', header: 'x-deepinfra-key' },
  // OpenWorks shares the Tensor.Art key slot (ak_tensor_… Access Key); server rejects TAMS Bearer keys locally.
  openworks: { name: 'Tensor.Art OpenWorks', color: '#8b5cf6', key: 'tensorartKey', header: 'x-tensorart-key' },
} as const;

type SchemaProviderId = keyof typeof PROVIDERS;
type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
}

/** Official batch-count wire names seen in provider contracts (Together/OpenAI `n`, WaveSpeed `num_images`, Novita `image_num`, Runware `numberResults`, Civitai `quantity`). Only a name the model Schema declares is sent. */
const BATCH_COUNT_WIRE_NAMES = ['n', 'num_images', 'image_num', 'numberResults', 'quantity'] as const;

/** Wire name for params.batchSize, read from the model's own input Schema; undefined when the Schema declares none. */
export function schemaBatchWireName(schemaBody: unknown): string | undefined {
  const props = asRecord(asRecord(asRecord(schemaBody).inputSchema).properties);
  return BATCH_COUNT_WIRE_NAMES.find((name) => Object.hasOwn(props, name));
}

function looksLikeVideoUrl(url: string | undefined): boolean {
  if (!url) return false;
  if (/^data:video\//i.test(url)) return true;
  try {
    const path = new URL(url).pathname.toLowerCase();
    return /\.(mp4|webm|mov|m4v)(?:$|\?)/.test(path) || path.includes('/video');
  } catch {
    return /\.(mp4|webm|mov|m4v)(?:$|\?)/i.test(url);
  }
}

/** Accept only provider outputs with an explicit URL; never stringify unknown objects into fake media locators. */
export function schemaProviderOutputUrl(result: unknown): string | undefined {
  const record = asRecord(result);
  if (typeof record.imageUrl === 'string' && record.imageUrl.trim()) return record.imageUrl.trim();
  const outputs = Array.isArray(record.outputs) ? record.outputs : [];
  for (const output of outputs) {
    if (typeof output === 'string' && output.trim()) return output.trim();
    const url = asRecord(output).url;
    if (typeof url === 'string' && url.trim()) return url.trim();
  }
  return undefined;
}

/** WaveSpeed's opt-in base64 mode returns naked base64, so MIME must come from the bytes. */
export function waveSpeedBase64ImageDataUrl(value: string): string | undefined {
  if (!value || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value) || value.length % 4 === 1) return undefined;
  let binary: string;
  try { binary = globalThis.atob(value); } catch { return undefined; }
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  let mime: string | undefined;
  if (bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) mime = 'image/png';
  else if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mime = 'image/jpeg';
  else if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') mime = 'image/webp';
  if (!mime) return undefined;
  return `data:${mime};base64,${value}`;
}

function sogniRangeValidationNotice(submitBody:unknown):string|undefined {
  const actualRequest=asRecord(asRecord(submitBody).actualRequest);
  const mapping=Array.isArray(actualRequest.mapping)?actualRequest.mapping:[];
  const check=mapping.find((entry:any)=>entry?.from==='Sogni LoRA strength range check');
  if(!check)return undefined;
  const unknown=Array.isArray(check.unknown)?check.unknown:[];
  const failure=asRecord(check.lookupFailure);
  if(check.status!=='unknown' && !unknown.length)return undefined;
  const details=failure.error
    ? `目录查询失败${failure.upstreamStatus ? ` HTTP ${failure.upstreamStatus}` : ''} (${failure.endpoint || check.sourceUrl || '公开目录'})：${failure.upstreamResponseBody || failure.error}`
    : unknown.map((item:any)=>`${item.id || 'LoRA'}：${item.reason || '范围未知'}`).join('；');
  return `Sogni LoRA 强度范围未能完整核实，已按原值提交，未修改参数；上游可能按其规则处理。${details}`;
}

export function unmappedLorasNotice(submitBody:unknown):string|undefined {
  const actualRequest=asRecord(asRecord(submitBody).actualRequest);
  const mapping=Array.isArray(actualRequest.mapping)?actualRequest.mapping:[];
  const loraMap=mapping.find((entry:any)=>entry?.from==='loras');
  const unmapped=Array.isArray(loraMap?.unmappedLoras)?loraMap.unmappedLoras:[];
  if(!unmapped.length)return undefined;
  const details=unmapped.map((entry:any)=>{
    const item=entry?.item;
    if(typeof item==='string')return `${item}（${entry?.reason || '未映射'}）`;
    const r=asRecord(item);
    const label=String(r.name || r.lora_name || r.model_name || r.sd_name_in_api || r.styleId || r.catalogId || r.loraId || r.slug || r.id || r.path || r.downloadUrl || r.air || r.civitaiId || 'LoRA').trim();
    const src=String(r.downloadUrl || r.url || r.path || r.air || r.civitaiId || '').trim();
    const display=src && src!==label ? `${label} [${src}]` : label;
    return `${display}：${entry?.reason || '未映射'}`;
  }).join('；');
  return `部分或全部 LoRA 因标识命名空间或格式不匹配未发送（未挂载）：${details}`;
}

async function readBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return '';
  try { return JSON.parse(text); } catch { return text; }
}

function failure(label: string, response: Response, body: unknown): Error {
  const error = new Error(`${label}: HTTP ${response.status}; response body: ${typeof body === 'string' ? body : JSON.stringify(body)}`);
  error.name = 'SchemaProviderHttpError';
  return error;
}

/**
 * clean-1149 #1: structured failure for the Schema GET — same shape upstreamFailureToast reads for a generation POST,
 * so the toast is 「HTTP <code>」 + the UPSTREAM body verbatim. If the route relayed the upstream status/body
 * (upstreamStatus / upstreamResponseBody), those are used; otherwise the GET's own status and raw body.
 */
export function schemaPrefetchFailureData(status: number, body: string): Record<string, unknown> {
  let parsed: any = null;
  try { parsed = JSON.parse(body); } catch { /* raw text body */ }
  if (parsed && typeof parsed === 'object' && typeof parsed.upstreamStatus === 'number' && typeof parsed.upstreamResponseBody === 'string') {
    return { upstreamStatus: parsed.upstreamStatus, upstreamResponseBody: parsed.upstreamResponseBody, localWrapper: body, ...(typeof parsed.upstreamStatusText === 'string' ? { upstreamStatusText: parsed.upstreamStatusText } : {}) };
  }
  // clean-1351 #1: route `fail()` wrapper {ok:false,error,rawResponse,stack}: the upstream body is rawResponse verbatim
  // (JSON.parse of the wrapper already removed the outer \" escaping; the upstream characters are untouched).
  if (parsed && typeof parsed === 'object' && parsed.rawResponse != null) {
    const raw = typeof parsed.rawResponse === 'string' ? parsed.rawResponse : JSON.stringify(parsed.rawResponse);
    return { upstreamStatus: status, upstreamResponseBody: raw, localWrapper: body };
  }
  return { upstreamStatus: status, upstreamResponseBody: body };
}

async function request(url: string, init: RequestInit, context: string, options?: { trace?: boolean }): Promise<Response> {
  // Schema/catalog plumbing may set trace:false so ExecutionLog is not flooded with
  // GET /api/model-schema labeled as fake 「出图完成」; submit/poll/save stay traced.
  const doFetch = options?.trace === false ? globalThis.fetch.bind(globalThis) : fetch;
  try {
    return await doFetch(url, init);
  } catch (cause) {
    // tracedFetch reports HTTP failures as structured ApiTraceError; rethrow with the
    // real status/body intact. Only genuine connection failures become network errors.
    if (isApiTraceError(cause)) throw cause;
    const detail = cause instanceof Error ? `${cause.name}: ${cause.message}\n${cause.stack || ''}` : String(cause);
    const error = new Error(`Network error during ${context}; no HTTP response was received. Original exception: ${detail}`);
    error.name = 'SchemaProviderNetworkError';
    throw error;
  }
}

/** Generic asynchronous driver; provider-specific request mapping and validation stay server/schema owned. */
export class SchemaProviderDriver extends BaseEngineDriver {
  readonly id: SchemaProviderId;
  readonly name: string;
  readonly label: string;
  readonly badgeColor: string;
  readonly description: string;
  // Video goes through the same Schema-driven submit/poll route as images: the selected model's live Schema
  // (WaveSpeed catalog model_run / MuAPI openapi.json) decides the wire names; nothing here is model-specific.
  readonly capabilities = ['text2img', 'img2img', 'text2video', 'img2video'] as const;
  readonly supportedModels: ModelSpec[] = [];

  constructor(provider: SchemaProviderId) {
    super();
    this.id = provider;
    this.name = PROVIDERS[provider].name;
    this.label = `${this.name} schema-driven API`;
    this.badgeColor = PROVIDERS[provider].color;
    this.description = 'Uses the selected model input schema and provider task API without a client-side model allowlist.';
  }

  protected async executeGenerate(params: NormalizedGenerateParams, keys: Record<string, string>): Promise<NormalizedGenerateResult> {
    if (!params.model?.trim()) throw new Error('模型为必填项（model is required）');
    const config = PROVIDERS[this.id];
    const apiKey = params.apiKey || keys[config.key] || '';
    // Credential headers only. The Schema GET uses exactly these, so its in-flight dedupe key matches the node/badge
    // Schema GET (sharedGetJson sends the same key header) → one GET row, not a pair. Content-Type is added only to POSTs.
    const keyHeaders: Record<string, string> = {};
    if (apiKey) keyHeaders[config.header] = apiKey;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...keyHeaders };
    const schemaUrl = `/api/model-schema?provider=${encodeURIComponent(this.id)}&model=${encodeURIComponent(params.model)}${params.isVideo === true ? '&isVideo=true' : ''}${params.isVideo === true && params.image_url ? '&hasReference=true' : ''}`;
    // Schema GET is traced (exec log row: GET + URL + status). On failure the generation POST is
    // never sent: the user sees the GET URL, upstream status and body verbatim, and a failed history card is written.
    // Same action-scoped shared GET as the node editor / badges: one GET per URL per run (the run began a new action).
    let schemaResponse: { ok: boolean; status: number };
    let schemaBody: unknown;
    // clean-1333 #4/#7: when the run reuses the Schema the model selection already read (same action), log it as a
    // no-request row 「复用，未重新请求」 — the run never looks like it fetched, and never fetches silently.
    const prior = peekSharedGetMeta(schemaUrl, keyHeaders);
    if (prior?.currentAction && prior.settledAt) {
      recordLocalEvent(`Schema 复用 · ${this.id} · ${params.model}`, { ok: true, note: '复用，未重新请求', reusedAt: prior.settledAt, reusedOk: !!prior.ok, reusedStatus: prior.status ?? null }, 'complete');
    }
    // 雁 rule: a failed Schema GET never stops the generation POST. The failure (status + first 2000 chars of body)
    // is recorded in the exec log and in the request trace; the POST goes out as built and its result is shown verbatim.
    let schemaPrefetchFailure: Record<string, unknown> | undefined;
    try {
      const shared = await sharedGetJson(schemaUrl, keyHeaders);
      schemaResponse = { ok: shared.ok, status: shared.status };
      schemaBody = shared.data ?? shared.raw ?? '';
    } catch (cause) {
      if (!isApiTraceError(cause)) throw cause;
      schemaResponse = { ok: false, status: cause.appStatus };
      schemaBody = cause.rawBody;
    }
    if (!schemaResponse.ok) {
      const raw = typeof schemaBody === 'string' ? schemaBody : JSON.stringify(schemaBody);
      schemaPrefetchFailure = { getUrl: schemaUrl, status: schemaResponse.status, ...schemaPrefetchFailureData(schemaResponse.status, raw), note: '查参数表失败；生成 POST 仍按所填参数发送' };
      recordLocalEvent(`Schema GET 失败 · ${this.id} · ${params.model}`, { ok: false, ...schemaPrefetchFailure }, 'error');
      schemaBody = {};
    }
    const credentialRef = String(asRecord(schemaBody).credentialRef || '').trim();
    if (credentialRef) headers['x-canvas-credential-ref'] = credentialRef;
    const workflowSnapshot = params.workflowSnapshot;
    const extra = asRecord(params.extraParams);
    const customSrc = asRecord(extra.custom_parameters);
    const custom = { ...customSrc };
    // OpenWorks checkpoint/clip_skip are live named extras (body.checkpoint), not catalog Schema keys.
    // Leaving them inside custom_parameters makes buildOpenWorksRequest local-400 「不在该模型 Schema」.
    if (this.id === 'openworks') {
      for (const k of ['checkpoint', 'sdModel', 'sd_model', 'clip_skip', 'clipSkip']) delete custom[k];
    }
    if (params.batchSize != null && params.batchSize > 0) {
      const batchWire = schemaBatchWireName(schemaBody);
      if (!batchWire) {
        recordLocalEvent(`批量张数未发送 · ${this.id} · ${params.model}`, { ok: false, batchSize: params.batchSize, note: '该模型 Schema 未声明批量张数字段（n / num_images / image_num / numberResults / quantity）；batchSize 未写入请求体' }, 'error');
      } else if (!Object.hasOwn(custom, batchWire)) {
        custom[batchWire] = params.batchSize;
      }
    }
    const body = {
      model: params.model,
      prompt: params.prompt,
      negative_prompt: params.negative_prompt,
      width: params.width,
      height: params.height,
      steps: params.steps,
      cfg: params.cfg,
      seed: params.seed,
      image_url: params.image_url,
      denoise: params.denoise,
      sampler_name: params.sampler_name,
      scheduler: params.scheduler,
      // Generic: forwarded only; server sends them iff the model Schema declares the field (else mapping sent:false).
      aspect_ratio: params.aspectRatio,
      size: extra.size,
      resolution: extra.resolution,
      output_format: extra.output_format,
      // Video fields: sent as filled; the server maps them by the model Schema (e.g. duration 5|10).
      duration: params.videoDuration,
      // Tells the server this is the video node. Used only when a catalog lookup fails and
      // would otherwise guess the image endpoint (Together 401 → /images/generations).
      isVideo: params.isVideo === true ? true : undefined,
      fps: params.videoFps,
      num_frames: params.videoFrames,
      loras: params.loras,
      checkpoint: extra.checkpoint ?? extra.sdModel ?? customSrc.checkpoint ?? customSrc.sdModel,
      clip_skip: extra.clip_skip ?? extra.clipSkip ?? customSrc.clip_skip,
      custom_parameters: custom,
      workflowSnapshot,
      ...(schemaPrefetchFailure ? { schemaPrefetchFailure } : {}),
    };

    const submitResponse = await request(`/api/schema-provider/${this.id}/submit`, {
      method: 'POST', headers, body: JSON.stringify(body),
    }, `${this.name} task submission`);
    const submitBody = await readBody(submitResponse);
    if (!submitResponse.ok) {
      const err=failure(`${this.name} submit failed`,submitResponse,submitBody);
      if(schemaPrefetchFailure){err.message+=`\n（此前 GET ${schemaUrl} → HTTP ${schemaPrefetchFailure.status}）`;(err as any).data={...(err as any).data,schemaPrefetchFailure};}
      const rangeWarning=this.id==='sogni'?sogniRangeValidationNotice(submitBody):undefined;
      const unmappedWarning=unmappedLorasNotice(submitBody);
      const combinedLoraWarning=[rangeWarning,unmappedWarning].filter(Boolean).join('；') || undefined;
      if(combinedLoraWarning){err.message+=`; ${combinedLoraWarning}`;(err as any).data={...(err as any).data,loraRangeWarning:combinedLoraWarning,submitResponse:submitBody};}
      throw err;
    }
    const submitted = asRecord(submitBody);
    const rangeWarning=this.id==='sogni'?sogniRangeValidationNotice(submitBody):undefined;
    const unmappedWarning=unmappedLorasNotice(submitBody);
    const combinedLoraWarning=[rangeWarning,unmappedWarning].filter(Boolean).join('；') || undefined;
    const taskId = String(submitted.taskId || '').trim();
    const pollUrl = String(submitted.pollUrl || '').trim();
    if (!taskId || !pollUrl) {
      throw new Error(`${this.name} protocol error: submit response must contain taskId and pollUrl; response body: ${JSON.stringify(submitBody)}`);
    }

    const deadline = Date.now() + 10 * 60 * 1000;
    let lastStatus = 'not polled';
    let lastResponse: unknown;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2_000));
      const pollResponse = await request(pollUrl, { method: 'GET', headers }, `${this.name} task poll`);
      const pollBody = await readBody(pollResponse);
      if (!pollResponse.ok) throw failure(`${this.name} task poll failed`, pollResponse, pollBody);
      const result = asRecord(pollBody);
      const status = String(result.status || '').toLowerCase();
      lastStatus = status || '(missing status)';
      lastResponse = pollBody;
      if (status === 'completed' || status === 'succeeded' || status === 'success') {
        const outputs = Array.isArray(result.outputs) ? result.outputs : [];
        const actualRequest:any=submitted.actualRequest;
        const sentParameters=asRecord(asRecord(actualRequest).parameters);
        const waveSpeedBase64Enabled=this.id==='wavespeed' && sentParameters.enable_base64_output===true;
        let unsupportedBase64Output=false;
        const normalizedOutputs=waveSpeedBase64Enabled?outputs.map((output:any)=>{
          if(typeof output!=='string')return output;
          const candidate=output.trim();
          if(/^(?:https?:\/\/|data:)/i.test(candidate))return output;
          const dataUrl=waveSpeedBase64ImageDataUrl(candidate);
          if(!dataUrl)unsupportedBase64Output=true;
          return dataUrl || output;
        }):outputs;
        const normalizedResult={...result,outputs:normalizedOutputs};
        const mediaUrl=unsupportedBase64Output?undefined:schemaProviderOutputUrl(normalizedResult);
        if (!mediaUrl) {
          const responseBody = typeof pollBody === 'string' ? pollBody : JSON.stringify(pollBody);
          const endpoint = typeof result.endpoint === 'string' ? result.endpoint : pollUrl;
          const reason=unsupportedBase64Output
            ? 'enable_base64_output=true produced content that is not a supported PNG, JPEG, or WebP image signature'
            : 'without a supported media URL';
          const protocolError = new Error(`${this.name} upstream protocol error: task ${taskId} reported ${status} ${reason}; endpoint: ${endpoint}; response body: ${responseBody}`);
          protocolError.name = 'SchemaProviderProtocolError';
          (protocolError as any).data = {
            errorSource: 'upstream-protocol',
            endpoint,
            upstreamStatus: typeof result.upstreamStatus === 'number' ? result.upstreamStatus : pollResponse.status,
            upstreamStatusText: `status: ${status}`,
            upstreamResponseBody: responseBody,
            rawResponse: pollBody,
            actualRequest,
          };
          throw protocolError;
        }
        const sent:any=this.id==='sogni'?actualRequest?.parameters?.input?.steps?.[0]?.arguments:this.id==='novita'?actualRequest?.parameters?.request:actualRequest?.parameters;
        const sentLoras=this.id==='sogni'?(sent?.loras || []).map((name:string,index:number)=>({name,strength:sent?.loraStrengths?.[index]})):(sent?.styles || sent?.loras || sent?.lora_list || sent?.model_id || (sent?.lora_url?[{path:sent.lora_url,scale:sent.lora_weight}]:[])).map((l:any)=>typeof l==='string'?{name:l}:{...l,name:l.name || l.path || l.model || l.model_name || l.id,strength:l.scale ?? l.weight ?? l.strength});
        const owPrompt=(()=>{if(typeof sent?.prompt==='string'&&sent.prompt.trim())return sent.prompt;const map=Array.isArray(actualRequest?.mapping)?actualRequest.mapping:[];const mp=map.find((m:any)=>m?.from==='prompt'&&m?.sent&&typeof m.value==='string');if(mp)return mp.value;const inputs=Array.isArray(sent?.inputs)?sent.inputs:[];const first=inputs.find((x:any)=>x&&(x.type==='STRING'||typeof x.value==='string')&&(x.name==null||x.name==='prompt'));return typeof first?.value==='string'?first.value:undefined;})();
        const owWidth=typeof sent?.width==='number'?sent.width:(Array.isArray(sent?.inputs)?Number(sent.inputs.filter((x:any)=>x&&!x.name&&(x.type==='INTEGER'||typeof x.value==='number'))[0]?.value):undefined);
        const owHeight=typeof sent?.height==='number'?sent.height:(Array.isArray(sent?.inputs)?Number(sent.inputs.filter((x:any)=>x&&!x.name&&(x.type==='INTEGER'||typeof x.value==='number'))[1]?.value):undefined);
        const metadata={model:params.model,actualModel:params.model,prompt:owPrompt,negativePrompt:sent?.negative_prompt ?? sent?.negativePrompt,seed:typeof sent?.seed==='number' && sent.seed>=0?sent.seed:null,steps:sent?.num_inference_steps ?? sent?.steps ?? null,cfg:sent?.guidance_scale ?? sent?.guidance ?? sent?.cfg_scale ?? sent?.cfg ?? null,width:Number.isFinite(owWidth)?owWidth:null,height:Number.isFinite(owHeight)?owHeight:null,loras:sentLoras,workflowSnapshot,requestMetadata:{actualRequest,submit:submitBody,poll:pollBody,...(schemaPrefetchFailure?{schemaPrefetchFailure}:{})}};
        let saved:any;let historyWarning:string|undefined;
        try {
          const saveResponse=await request(`/api/schema-provider/${this.id}/save-result`,{method:'POST',headers,body:JSON.stringify({taskId,outputs:normalizedOutputs,metadata,workflowSnapshot})},`${this.name} output persistence`);
          saved=await readBody(saveResponse);historyWarning=[saved?.historyWarning,combinedLoraWarning].filter(Boolean).join('；') || undefined;
        } catch(error:any) {historyWarning=[combinedLoraWarning,`上游已生成，保存失败：${error.message}`].filter(Boolean).join('；');saved={error:error.message,stack:error.stack,cause:error.cause};}
        return {
          mediaUrl:saved?.historyItems?.[0]?.url || mediaUrl,
          mediaType: result.mediaType === 'video' || looksLikeVideoUrl(mediaUrl) ? 'video' : 'image',
          provider: this.name,
          providerId: this.id,
          model: params.model,
          requestedModel: params.model,
          seed: typeof result.seed === 'number' ? result.seed : null,
          historyWarning,
          rawResponse: { submit: submitBody, poll: pollBody, persistence:saved },
          actualRequest: result.actualRequest ?? submitted.actualRequest,
          inputSchema: submitted.inputSchema ?? asRecord(schemaBody).inputSchema ?? schemaBody,
          executionTrace: result.executionTrace ?? submitted.executionTrace,
        };
      }
      if (status === 'waiting_for_user') {
        const reason = result.waitingReason ?? result.pauseReason ?? result.pausedReason ?? result.error ?? result.message;
        const err = new Error(`${this.name} task ${taskId} is waiting_for_user; upstream pause reason: ${typeof reason === 'string' ? reason : JSON.stringify(reason ?? '(not provided)')}; full response body: ${JSON.stringify(pollBody)}${combinedLoraWarning?`; ${combinedLoraWarning}`:''}`);
        // fix3 G: structured data so toast/title carry HTTP + task status + body (not 「响应体为空」).
        (err as any).data = {
          ...asRecord(pollBody),
          upstreamStatus: typeof result.upstreamStatus === 'number' ? result.upstreamStatus : 200,
          upstreamStatusText: `status: ${status}${typeof reason === 'string' && reason ? ` · ${reason}` : ''}`,
          upstreamResponseBody: typeof pollBody === 'string' ? pollBody : JSON.stringify(pollBody),
          rawResponse: pollBody,
          ...(combinedLoraWarning?{loraRangeWarning:combinedLoraWarning}:{}),
          executionTrace: result.executionTrace ?? result.taskExecutionTrace,
          historyItem: result.historyItem,
        };
        throw err;
      }
      if (['failed', 'sandbox_mock', 'partial_failure', 'cancelled', 'canceled', 'timeout', 'timed_out', 'deleted', 'error'].includes(status)) {
        const err = new Error(`${this.name} task ${taskId} ended with status=${status}; response body: ${JSON.stringify(pollBody)}${combinedLoraWarning?`; ${combinedLoraWarning}`:''}`);
        (err as any).data = {
          ...asRecord(pollBody),
          upstreamStatus: typeof result.upstreamStatus === 'number' ? result.upstreamStatus : 200,
          upstreamStatusText: `status: ${status}`,
          upstreamResponseBody: typeof pollBody === 'string' ? pollBody : JSON.stringify(pollBody),
          rawResponse: pollBody,
          ...(combinedLoraWarning?{loraRangeWarning:combinedLoraWarning}:{}),
          executionTrace: result.executionTrace ?? result.taskExecutionTrace,
          historyItem: result.historyItem,
        };
        throw err;
      }
      // Unknown/nonterminal statuses remain visible in the eventual timeout error; never report false success.
    }
    throw new Error(`${this.name} task ${taskId} timed out after 10 minutes; last status=${lastStatus}; last response body: ${JSON.stringify(lastResponse)}`);
  }
}
