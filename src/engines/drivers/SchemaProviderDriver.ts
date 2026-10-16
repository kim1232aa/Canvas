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
  // OpenWorks shares the Tensor.Art key slot (ak_tensor_… Access Key); server rejects TAMS Bearer keys locally.
  openworks: { name: 'Tensor.Art OpenWorks', color: '#8b5cf6', key: 'tensorartKey', header: 'x-tensorart-key' },
} as const;

type SchemaProviderId = keyof typeof PROVIDERS;
type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {};
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

async function prefetchFailure(getUrl: string, status: number, body: string, params: NormalizedGenerateParams, provider: string): Promise<Error> {
  let historyNote = '';
  try {
    const r = await globalThis.fetch('/api/history/prefetch-failure', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-canvas-origin': 'browser-ui' }, body: JSON.stringify({ getUrl, status, body, provider, model: params.model, prompt: params.prompt, loras: params.loras }) });
    if (!r.ok) historyNote = `\n失败记录写入历史失败：HTTP ${r.status} ${await r.text()}`;
  } catch (e) { historyNote = `\n失败记录写入历史失败：${e instanceof Error ? e.message : String(e)}`; }
  const error = new Error(`GET ${getUrl} → HTTP ${status} · 生成 POST 未发送\n${body}${historyNote}`);
  error.name = 'SchemaPrefetchError';
  (error as any).data = schemaPrefetchFailureData(status, body);
  return error;
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
  readonly capabilities = ['text2img', 'img2img'] as const;
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
    const schemaUrl = `/api/model-schema?provider=${encodeURIComponent(this.id)}&model=${encodeURIComponent(params.model)}`;
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
    try {
      const shared = await sharedGetJson(schemaUrl, keyHeaders);
      schemaResponse = { ok: shared.ok, status: shared.status };
      schemaBody = shared.data ?? '';
    } catch (cause) {
      if (!isApiTraceError(cause)) throw cause;
      throw await prefetchFailure(schemaUrl, cause.appStatus, cause.rawBody, params, this.id);
    }
    if (!schemaResponse.ok) throw await prefetchFailure(schemaUrl, schemaResponse.status, typeof schemaBody === 'string' ? schemaBody : JSON.stringify(schemaBody), params, this.id);
    const credentialRef = String(asRecord(schemaBody).credentialRef || '').trim();
    if (credentialRef) headers['x-canvas-credential-ref'] = credentialRef;
    const workflowSnapshot = params.workflowSnapshot;
    const extra = asRecord(params.extraParams);
    const custom = asRecord(extra.custom_parameters);
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
      loras: params.loras,
      custom_parameters: custom,
      workflowSnapshot,
    };

    const submitResponse = await request(`/api/schema-provider/${this.id}/submit`, {
      method: 'POST', headers, body: JSON.stringify(body),
    }, `${this.name} task submission`);
    const submitBody = await readBody(submitResponse);
    if (!submitResponse.ok) throw failure(`${this.name} submit failed`, submitResponse, submitBody);
    const submitted = asRecord(submitBody);
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
        const firstOutput = asRecord(outputs[0]);
        const mediaUrl = String(result.imageUrl || firstOutput.url || outputs[0] || '').trim();
        if (!mediaUrl) throw new Error(`${this.name} task ${taskId} reported ${status} without a media URL; response body: ${JSON.stringify(pollBody)}`);
        const actualRequest:any=submitted.actualRequest;
        const sent:any=this.id==='sogni'?actualRequest?.parameters?.input?.steps?.[0]?.arguments:this.id==='novita'?actualRequest?.parameters?.request:actualRequest?.parameters;
        const sentLoras=this.id==='sogni'?(sent?.loras || []).map((name:string,index:number)=>({name,strength:sent?.loraStrengths?.[index]})):(sent?.styles || sent?.loras || sent?.lora_list || sent?.model_id || (sent?.lora_url?[{path:sent.lora_url,scale:sent.lora_weight}]:[])).map((l:any)=>typeof l==='string'?{name:l}:{...l,name:l.path || l.model || l.model_name || l.id,strength:l.scale ?? l.weight ?? l.strength});
        const metadata={model:params.model,actualModel:params.model,prompt:sent?.prompt,negativePrompt:sent?.negative_prompt ?? sent?.negativePrompt,seed:typeof sent?.seed==='number' && sent.seed>=0?sent.seed:null,steps:sent?.num_inference_steps ?? sent?.steps ?? null,cfg:sent?.guidance_scale ?? sent?.guidance ?? sent?.cfg_scale ?? sent?.cfg ?? null,loras:sentLoras,workflowSnapshot,requestMetadata:{actualRequest,submit:submitBody,poll:pollBody}};
        let saved:any;let historyWarning:string|undefined;
        try {
          const saveResponse=await request(`/api/schema-provider/${this.id}/save-result`,{method:'POST',headers,body:JSON.stringify({taskId,outputs,metadata,workflowSnapshot})},`${this.name} output persistence`);
          saved=await readBody(saveResponse);historyWarning=saved?.historyWarning;
        } catch(error:any) {historyWarning=`上游已生成，保存失败：${error.message}`;saved={error:error.message,stack:error.stack,cause:error.cause};}
        return {
          mediaUrl:saved?.historyItems?.[0]?.url || mediaUrl,
          mediaType: result.mediaType === 'video' ? 'video' : 'image',
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
        const err = new Error(`${this.name} task ${taskId} is waiting_for_user; upstream pause reason: ${typeof reason === 'string' ? reason : JSON.stringify(reason ?? '(not provided)')}; full response body: ${JSON.stringify(pollBody)}`);
        // fix3 G: structured data so toast/title carry HTTP + task status + body (not 「响应体为空」).
        (err as any).data = {
          ...asRecord(pollBody),
          upstreamStatus: typeof result.upstreamStatus === 'number' ? result.upstreamStatus : 200,
          upstreamStatusText: `status: ${status}${typeof reason === 'string' && reason ? ` · ${reason}` : ''}`,
          upstreamResponseBody: typeof pollBody === 'string' ? pollBody : JSON.stringify(pollBody),
          rawResponse: pollBody,
          executionTrace: result.executionTrace ?? result.taskExecutionTrace,
          historyItem: result.historyItem,
        };
        throw err;
      }
      if (['failed', 'sandbox_mock', 'partial_failure', 'cancelled', 'canceled', 'timeout', 'timed_out', 'deleted', 'error'].includes(status)) {
        const err = new Error(`${this.name} task ${taskId} ended with status=${status}; response body: ${JSON.stringify(pollBody)}`);
        (err as any).data = {
          ...asRecord(pollBody),
          upstreamStatus: typeof result.upstreamStatus === 'number' ? result.upstreamStatus : 200,
          upstreamStatusText: `status: ${status}`,
          upstreamResponseBody: typeof pollBody === 'string' ? pollBody : JSON.stringify(pollBody),
          rawResponse: pollBody,
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