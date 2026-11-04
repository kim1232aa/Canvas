/**
 * Fal image outbound gate: live OpenAPI Input properties only.
 * Static PROVIDER_SCHEMA / FAL_MODELS is a UI clue and must never alone authorize outbound.
 */

export type FalOmission = { from: string; to: null; value: unknown; sent: false; reason: string };

export interface FalSchemaFetchFailure {
  url: string;
  status: number | null;
  body: string;
}

/** Thrown when live (or caller-supplied) Fal Input properties are missing: nothing is POSTed to fal.run. */
export class FalSchemaMissingError extends Error {
  endpoint: string;
  schemaFetch?: FalSchemaFetchFailure;
  httpStatus: number;
  constructor(endpoint: string, schemaFetch?: FalSchemaFetchFailure) {
    const local = `没有发出去：拿不到该端点 Schema，未发送 fal.run（endpoint=${endpoint}）`;
    let first: string;
    let httpStatus: number;
    if (!schemaFetch) {
      first = '无上游请求：缺少 live OpenAPI Input properties，未向上游发出任何请求';
      httpStatus = 400;
    } else if (schemaFetch.status === null) {
      first = `无上游响应：Schema 拉取网络错误 ${schemaFetch.url}: ${schemaFetch.body}`;
      httpStatus = 502;
    } else if (schemaFetch.status >= 400 || schemaFetch.status < 200) {
      first = `HTTP ${schemaFetch.status}: ${schemaFetch.body} (${schemaFetch.url})`;
      httpStatus = schemaFetch.status;
    } else {
      first = `HTTP ${schemaFetch.status}: ${schemaFetch.body} (${schemaFetch.url})`;
      httpStatus = 422;
    }
    super(`${first}\n${local}`);
    this.name = 'FalSchemaMissingError';
    this.endpoint = endpoint;
    this.schemaFetch = schemaFetch;
    this.httpStatus = httpStatus;
  }
}

/** Official per-endpoint queue OpenAPI (no key). Prefer this when expand=openapi-3.0 fails. */
export const falQueueOpenApiUrl = (endpointId: string): string =>
  `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(endpointId)}`;

/** Platform catalog expand URL (may return expansion_failed for some endpoints). */
export const falExpandOpenApiUrl = (endpointId: string): string =>
  `https://api.fal.ai/v1/models?endpoint_id=${encodeURIComponent(endpointId)}&expand=openapi-3.0`;

const provided = (v: unknown) => v !== undefined && v !== null && v !== '';

/** Extract request-body Input properties from a Fal queue/platform OpenAPI document. */
/** Inline array `items.$ref` (e.g. loras → LoraWeight) from the same OpenAPI document so item shapes are readable. */
export function inlineFalItemRefs(props: Record<string, unknown>, openapi: unknown): Record<string, unknown> {
  const schemas = (openapi as any)?.components?.schemas;
  if (!schemas) return props;
  const out: Record<string, unknown> = { ...props };
  for (const [key, value] of Object.entries(props)) {
    const ref = (value as any)?.items?.$ref;
    if (typeof ref === 'string' && ref.startsWith('#/components/schemas/') && schemas[ref.slice(21)]) {
      out[key] = { ...(value as any), items: schemas[ref.slice(21)] };
    }
  }
  return out;
}

export function extractFalInputProperties(openapi: unknown): Record<string, unknown> | undefined {
  const doc = openapi as any;
  if (!doc || typeof doc !== 'object') return undefined;
  const fromPaths = (): Record<string, unknown> | undefined => {
    for (const pathItem of Object.values(doc.paths || {})) {
      const post = (pathItem as any)?.post;
      const schema =
        post?.requestBody?.content?.['application/json']?.schema ||
        post?.requestBody?.content?.['application/json; charset=utf-8']?.schema;
      if (!schema) continue;
      if (schema.$ref && typeof schema.$ref === 'string') {
        const name = schema.$ref.split('/').pop();
        const props = name ? doc.components?.schemas?.[name]?.properties : undefined;
        if (props && typeof props === 'object' && !Array.isArray(props)) return props;
      }
      if (schema.properties && typeof schema.properties === 'object' && !Array.isArray(schema.properties)) {
        return schema.properties;
      }
    }
    return undefined;
  };
  const fromExpandRecord = (): Record<string, unknown> | undefined => {
    const record = Array.isArray(doc.models)
      ? doc.models.find((m: any) => m?.openapi || m?.['openapi-3.0'] || m?.openapi_schema) || doc.models[0]
      : undefined;
    const nested = record?.openapi || record?.['openapi-3.0'] || record?.openapi_schema;
    if (nested) return extractFalInputProperties(nested);
    return undefined;
  };
  return fromPaths() || fromExpandRecord();
}

const FIELD_WIRES: Record<'steps' | 'cfg' | 'seed' | 'negative_prompt', string[]> = {
  steps: ['num_inference_steps', 'steps'],
  cfg: ['guidance_scale', 'guide_scale', 'cfg_scale', 'cfg'],
  seed: ['seed'],
  negative_prompt: ['negative_prompt'],
};

/**
 * Schema gate for fal image endpoints.
 * - Requires live (or caller) Input properties — static FAL_MODELS never alone authorizes outbound.
 * - Field absent from live props → omitted (not sent), with reason.
 * - loras: sent as built even if absent from live OpenAPI or above maxItems (upstream decides).
 */
export function falImageFieldGate(
  endpoint: string,
  values: Partial<Record<'steps' | 'cfg' | 'seed' | 'negative_prompt', unknown>>,
  loras: unknown[] = [],
  liveInputProperties?: Record<string, unknown>,
  schemaFetchFailure?: FalSchemaFetchFailure,
) {
  if (!liveInputProperties || typeof liveInputProperties !== 'object' || Array.isArray(liveInputProperties)) {
    throw new FalSchemaMissingError(endpoint, schemaFetchFailure);
  }
  const props = liveInputProperties;
  const send: Record<string, unknown> = {};
  const omitted: FalOmission[] = [];
  for (const field of ['steps', 'cfg', 'seed', 'negative_prompt'] as const) {
    const value = values[field];
    if (!provided(value)) continue;
    const wires = FIELD_WIRES[field];
    const wire = wires.find((w) => w in props);
    if (!wire) { send[field] = value; continue; } // undeclared: sent unchanged; upstream decides
    send[wire] = field === 'negative_prompt' ? value : Number(value);
  }
  // LoRAs go out as built even when the OpenAPI lists no `loras` / fewer maxItems; upstream decides.
  return { send, omitted, schemaFields: Object.keys(props) };
}

/** True when live OpenAPI declares an image reference field the canvas can fill. */
export function falLiveAcceptsImageUrl(liveInputProperties: Record<string, unknown>): boolean {
  return ['image_url', 'image', 'input_image', 'start_image_url'].some((w) => w in liveInputProperties);
}

/** Strength / denoise wire from live props, if any. */
export function falLiveStrengthWire(liveInputProperties: Record<string, unknown>): string | null {
  return (['strength', 'denoise', 'prompt_strength'] as const).find((w) => w in liveInputProperties) ?? null;
}
