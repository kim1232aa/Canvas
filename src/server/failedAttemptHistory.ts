import { schemaFieldWires } from '../schemas/providerSchema';
import { keyUsagesFromTrace } from './keyUsage';
// Failed generation attempts are history too (owner rule: 发了什么就显示什么, 所有供应商统一).
// Built from the request-scoped trace that upstreamFetch already records — no rewriting of the upstream body.

export interface FailedAttemptContext {
  route: string;
  traces: any[];
  submissions: Array<{ endpoint: string; parameters: unknown; status: number }>;
  /** Schema field wires the route declared for this request (declareSchemaFields) — present even when the error body omits them. */
  schemaFields?: string[];
}

const isRecord = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);


/** LoRAs actually posted upstream (path/name + scale/strength) — used to fill history.loras on failed attempts. */
export function lorasFromActualRequest(actualRequest: unknown): Array<{ name: string; strength: unknown }> {
  if (!isRecord(actualRequest)) return [];
  const envelope = isRecord(actualRequest.parameters) ? actualRequest.parameters : actualRequest;
  const params = isRecord(envelope.request) ? envelope.request : envelope;
  const list = [params.loras, params.styles, params.lora_list, params.image_loras].find(Array.isArray) as unknown[] | undefined;
  if (!list?.length) return [];
  const listKey = Object.keys(params).find((k) => params[k] === list) ?? '';
  const parallel = parallelLoraStrengths(params, listKey, list.length);
  return list.map((l: any, i: number) => typeof l === 'string'
    ? { name: l, strength: parallel ? parallel[i] : undefined }
    : { name: String(l?.path ?? l?.name ?? l?.model_name ?? l?.model ?? l?.id ?? ''), strength: l?.scale ?? l?.strength ?? l?.weight });
}

/**
 * trace-fix2 P2 (generic): LoRA names and strengths sent as two parallel arrays (e.g. `loras` + `loraStrengths`).
 * A sibling array whose key names a LoRA strength/weight/scale and whose length equals the name array is the strengths.
 */
export function parallelLoraStrengths(params: Record<string, any>, listKey: string, length: number): unknown[] | undefined {
  const hit = Object.entries(params).find(([k, v]) => k !== listKey && /lora/i.test(k) && /(strength|weight|scale)/i.test(k)
    && Array.isArray(v) && v.length === length && v.every((x) => typeof x === 'number'));
  return hit ? hit[1] as unknown[] : undefined;
}

/** Returns a history item for a failed response, or null when nothing was sent upstream (pure local validation errors). */
export function buildFailedAttemptHistoryItem(
  context: FailedAttemptContext,
  requestBody: unknown,
  httpStatus: number,
  responseBody: Record<string, any>,
): Record<string, any> | null {
  const traces = Array.isArray(context.traces) ? context.traces : [];
  const submissions = Array.isArray(context.submissions) ? context.submissions : [];
  const sentTraces = traces.filter((t) => isRecord(t) && t.endpoint && t.method && t.method !== 'GET');
  if (!submissions.length && !sentTraces.length) return null;

  const failing = [...traces].reverse().find((t) => isRecord(t) && (typeof t.status === 'number' ? t.status >= 400 : t.status === null && t.endpoint))
    ?? [...sentTraces].reverse()[0];
  const lastSubmission = submissions[submissions.length - 1];
  // Prefer the route's own actualRequest (full mapping + parameters.loras) when fail() attached it; else rebuild from the outbound submission.
  const fromRoute = isRecord(responseBody.actualRequest) ? responseBody.actualRequest : null;
  const actualRequest: Record<string, any> | null = fromRoute
    ? { ...fromRoute }
    : lastSubmission
      ? { endpoint: lastSubmission.endpoint, parameters: lastSubmission.parameters }
      : failing && failing.requestBody !== undefined ? { endpoint: failing.endpoint, parameters: failing.requestBody } : null;
  // Endpoint's declared Schema fields (route's own actualRequest.schemaFields) — lets history tell 该端点不支持 from 未发送.
  // Routes attach schemaFields either inside actualRequest or beside it (top-level) — both are the route's own record.
  const schemaFields = fromRoute && Array.isArray(fromRoute.schemaFields) ? fromRoute.schemaFields.map(String)
    : Array.isArray(responseBody.schemaFields) ? responseBody.schemaFields.map(String)
    : Array.isArray(context.schemaFields) ? context.schemaFields.map(String) : null;
  // actualRequest = what went upstream. Only an {endpoint, parameters} envelope may carry diagnostics beside the body;
  // a bare body (e.g. {input:{…}}) is never augmented — schemaFields lives in requestMetadata.schemaFields (本地记录).
  const isEnvelope = !!actualRequest && isRecord(actualRequest.parameters);
  if (actualRequest && schemaFields && isEnvelope && !Array.isArray(actualRequest.schemaFields)) actualRequest.schemaFields = schemaFields;

  const body = isRecord(requestBody) ? requestBody : {};
  const provider = str(failing?.provider) ?? str(body.provider);
  const model = str(failing?.model) ?? str(body.model);
  // Top-level loras from what was actually sent (not the empty canvas default) so history cards show LoRA without digging into JSON.
  const loras = lorasFromActualRequest(actualRequest);
  return {
    status: 'failed',
    url: '',
    prompt: str(body.prompt),
    negativePrompt: str(body.negative_prompt) ?? str(body.negativePrompt),
    provider,
    actualProvider: provider,
    model,
    actualModel: model,
    loras,
    upstreamStatus: typeof failing?.status === 'number' ? failing.status : null,
    upstreamStatusText: str(failing?.statusText),
    upstreamEndpoint: failing?.endpoint ?? actualRequest?.endpoint ?? null,
    // verbatim — string exactly as the provider returned it
    upstreamResponseBody: typeof failing?.responseBody === 'string' ? failing.responseBody : null,
    networkError: failing && failing.status === null ? { message: failing.error ?? null, cause: failing.cause ?? null } : null,
    httpStatus,
    error: typeof responseBody.error === 'string' ? responseBody.error : null,
    errorSource: responseBody.errorSource ?? null,
    stack: typeof responseBody.stack === 'string' ? responseBody.stack : null,
    // trace-fix2 P1: the upstream segments of this request (e.g. the submit POST that came back 402) are the card's
    // 上游交互 — recorded verbatim, same objects upstreamFetch wrote.
    requestMetadata: { route: context.route, ...(actualRequest ? { actualRequest } : {}), ...(schemaFields ? { schemaFields } : {}), keyUsages: keyUsagesFromTrace(traces), executionTrace: traces.filter((t) => isRecord(t) && t.endpoint && t.method) },
  };
}

export const LOCAL_BLOCKED_LABEL = '未出站，本地拦截';
/** Generation entry points (all providers): local rejections here are history. */
export const isGenerationRoute = (path: string) => /\/(generate|submit)$/.test(path);

/** Local rejection that never reached any provider: no upstream fields, intended request snapshot only. */
export function buildLocalRejectionHistoryItem(
  route: string,
  intendedRequest: unknown,
  httpStatus: number,
  responseBody: Record<string, any>,
  /** errorSource / upstreamStatus the route itself put in its error body (not middleware defaults). */
  routeProvenance?: { errorSource?: string; upstreamStatus?: number },
): Record<string, any> {
  const body = isRecord(intendedRequest) ? intendedRequest : {};
  const { workflowSnapshot: _w, ...snapshot } = body;
  const provider = str(body.provider) ?? str(body.targetProvider) ?? (route.match(/\/api\/(?:engine\/|schema-provider\/)?([^/]+)\//)?.[1] ?? null);
  const model = str(body.model) ?? str(body.checkpoint) ?? str(body.modelId);
  // Declared Schema field wires (from route or civitai model spec) → history 该端点不支持 vs 未发送.
  const fromBody = Array.isArray(responseBody.schemaFields)
    ? responseBody.schemaFields.map(String)
    : (isRecord(responseBody.actualRequest) && Array.isArray(responseBody.actualRequest.schemaFields)
      ? responseBody.actualRequest.schemaFields.map(String)
      : null);
  const engine = str(body.engine) ?? str((body as any).extraParams?.engine);
  const ecosystem = str(body.ecosystem) ?? str((body as any).extraParams?.ecosystem) ?? str(body.civitaiEcosystem);
  const civitaiModelId =
    provider === 'civitai'
      ? (engine && ecosystem ? `${engine}:${ecosystem}` : str(body.model))
      : null;
  const derived = civitaiModelId ? schemaFieldWires('civitai', civitaiModelId) : undefined;
  const schemaFields = fromBody ?? (derived ? derived : null);
  // Route-built 「拟发送」 (Schema-scoped, same mapping as a real submit) wins over the raw canvas body: the card must show
  // only fields the current model's Schema declares, never leftovers from another provider or canvas-internal LoRA fields.
  const proposed = isRecord(responseBody.proposedRequest) ? responseBody.proposedRequest : null;
  const intendedWithSchema = proposed
    ? { ...proposed, ...(schemaFields && !Array.isArray(proposed.schemaFields) ? { schemaFields } : {}) }
    : snapshot; // raw canvas snapshot is not augmented; schemaFields is kept in requestMetadata.schemaFields
  const requestedLoras = proposed && Array.isArray(proposed.requestedLoras) ? proposed.requestedLoras : undefined;
  return {
    status: 'local_blocked',
    statusLabel: LOCAL_BLOCKED_LABEL,
    url: '',
    prompt: str(body.prompt),
    negativePrompt: str(body.negative_prompt) ?? str(body.negativePrompt),
    provider,
    actualProvider: provider,
    model,
    actualModel: model,
    loras: [],
    httpStatus,
    // verbatim local reason
    error: typeof responseBody.error === 'string' ? responseBody.error : null,
    errorSource: routeProvenance?.errorSource ?? 'local',
    ...(typeof routeProvenance?.upstreamStatus === 'number' ? { upstreamStatus: routeProvenance.upstreamStatus } : {}),
    stack: typeof responseBody.stack === 'string' ? responseBody.stack : null,
    requestMetadata: {
      route,
      intendedRequest: intendedWithSchema,
      ...(schemaFields ? { schemaFields } : {}),
      ...(isRecord(responseBody.blockedField) ? { blockedField: responseBody.blockedField } : {}),
      ...(requestedLoras ? { requestedLoras } : {}),
      postSent: false,
    },
  };
}

export const PREFETCH_POST_NOT_SENT = '生成 POST 未发送';
/**
 * Catalog / Schema GET that failed before the generation POST: the POST never left.
 * Recorded verbatim (GET URL + status + body), no upstream generation fields invented.
 */
export function buildPrefetchFailureHistoryItem(input: unknown): Record<string, any> {
  const b = isRecord(input) ? input : {};
  const getUrl = str(b.getUrl);
  if (!getUrl) throw new Error('getUrl 必填');
  const status = typeof b.status === 'number' ? b.status : null;
  const body = typeof b.body === 'string' ? b.body : b.body === undefined ? null : JSON.stringify(b.body);
  const requestedLoras = Array.isArray(b.loras)
    ? b.loras.map((l: any) => ({ name: String(l?.path ?? l?.url ?? l?.civitaiId ?? l?.name ?? ''), strength: l?.strength ?? l?.modelStrength ?? null })).filter((l: any) => l.name)
    : [];
  return {
    status: 'failed',
    url: '',
    prompt: str(b.prompt),
    provider: str(b.provider),
    actualProvider: str(b.provider),
    model: str(b.model),
    actualModel: str(b.model),
    loras: [],
    upstreamStatus: status,
    upstreamEndpoint: `GET ${getUrl}`,
    upstreamResponseBody: body,
    httpStatus: status,
    error: `GET ${getUrl} → ${status === null ? '无 HTTP 响应' : `HTTP ${status}`}\n${PREFETCH_POST_NOT_SENT}`,
    errorSource: 'prefetch',
    requestMetadata: {
      route: 'prefetch-get', prefetch: { method: 'GET', url: getUrl, status }, postSent: false,
      // LoRAs on the canvas for this run (name + strength only) — shown as a LoRA row marked 未发送, same rule as a local block.
      ...(requestedLoras.length ? { requestedLoras } : {}),
    },
  };
}
