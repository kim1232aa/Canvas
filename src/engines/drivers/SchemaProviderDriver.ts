import { tracedFetch as fetch } from '../../services/executionTrace';
import { BaseEngineDriver } from '../BaseEngineDriver';
import { ModelSpec, NormalizedGenerateParams, NormalizedGenerateResult } from '../types';

const PROVIDERS = {
  muapi: { name: 'MuAPI', color: '#8b5cf6', key: 'muapiKey', header: 'x-muapi-key' },
  wavespeed: { name: 'WaveSpeed', color: '#06b6d4', key: 'wavespeedKey', header: 'x-wavespeed-key' },
  sogni: { name: 'Sogni', color: '#f97316', key: 'sogniKey', header: 'x-sogni-key' },
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

async function request(url: string, init: RequestInit, context: string): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (cause) {
    // tracedFetch reports HTTP failures as thrown errors containing the real status/body.
    if (cause instanceof Error && /^HTTP\s+\d+\s+·/.test(cause.message)) throw cause;
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
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey) headers[config.header] = apiKey;
    const schemaUrl = `/api/model-schema?provider=${encodeURIComponent(this.id)}&model=${encodeURIComponent(params.model)}`;
    const schemaResponse = await request(schemaUrl, { method: 'GET', headers }, `${this.name} schema lookup`);
    const schemaBody = await readBody(schemaResponse);
    if (!schemaResponse.ok) throw failure(`${this.name} model schema lookup failed`, schemaResponse, schemaBody);
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
        if (!mediaUrl) throw new Error(`${this.name} task ${taskId} reported ${status} without an image URL; response body: ${JSON.stringify(pollBody)}`);
        const actualRequest:any=submitted.actualRequest;
        const sent:any=this.id==='sogni'?actualRequest?.parameters?.input?.steps?.[0]?.arguments:actualRequest?.parameters;
        const sentLoras=this.id==='sogni'?(sent?.loras || []).map((name:string,index:number)=>({name,strength:sent?.loraStrengths?.[index]})):(sent?.loras || sent?.lora_list || sent?.model_id || (sent?.lora_url?[{path:sent.lora_url,scale:sent.lora_weight}]:[])).map((l:any)=>typeof l==='string'?{name:l}:{...l,name:l.path || l.model,strength:l.scale ?? l.weight});
        const metadata={model:params.model,actualModel:params.model,prompt:sent?.prompt,negativePrompt:sent?.negative_prompt ?? sent?.negativePrompt,seed:typeof sent?.seed==='number' && sent.seed>=0?sent.seed:null,steps:sent?.num_inference_steps ?? sent?.steps ?? null,cfg:sent?.guidance_scale ?? sent?.guidance ?? sent?.cfg ?? null,loras:sentLoras,workflowSnapshot,requestMetadata:{actualRequest,submit:submitBody,poll:pollBody}};
        let saved:any;let historyWarning:string|undefined;
        try {
          const saveResponse=await request(`/api/schema-provider/${this.id}/save-result`,{method:'POST',headers,body:JSON.stringify({outputs,metadata,workflowSnapshot})},`${this.name} output persistence`);
          saved=await readBody(saveResponse);historyWarning=saved?.historyWarning;
        } catch(error:any) {historyWarning=`上游已生成，保存失败：${error.message}`;saved={error:error.message,stack:error.stack,cause:error.cause};}
        return {
          mediaUrl:saved?.historyItems?.[0]?.url || mediaUrl,
          mediaType: 'image',
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
        throw new Error(`${this.name} task ${taskId} is waiting_for_user; upstream pause reason: ${typeof reason === 'string' ? reason : JSON.stringify(reason ?? '(not provided)')}; full response body: ${JSON.stringify(pollBody)}`);
      }
      if (['failed', 'partial_failure', 'cancelled', 'canceled', 'timeout', 'timed_out', 'deleted', 'error'].includes(status)) {
        throw new Error(`${this.name} task ${taskId} ended with status=${status}; response body: ${JSON.stringify(pollBody)}`);
      }
      // Unknown/nonterminal statuses remain visible in the eventual timeout error; never report false success.
    }
    throw new Error(`${this.name} task ${taskId} timed out after 10 minutes; last status=${lastStatus}; last response body: ${JSON.stringify(lastResponse)}`);
  }
}
