import { UrlText } from './UrlText';
import React from 'react';
import { CANVAS_TO_SCHEMA_ALIASES } from '../utils/schemaSendHint';

/**
 * Generic node controls for official-Schema fields that no canvas widget maps to
 * (e.g. AIMLAPI image_size enum|{width,height}; Venice lora_strength integer).
 * Driven only by the fetched inputSchema: no provider names hardcoded.
 * Values live in custom_parameters JSON and are sent verbatim.
 * Never maps canvas LoRA nodes into these fields.
 */
const NEVER = new Set(['model', 'provider', 'prompt', 'endpoint', 'inference_provider', 'loras', 'styles', 'lora_list', 'model_id', 'negative_prompt', 'negativePrompt']);
const CANVAS_MAPPED = new Set(Object.values(CANVAS_TO_SCHEMA_ALIASES).flat().filter((name) => !['image_size','format','output_format','outputFormat','aspect_ratio','aspectRatio','resolution','lora_weights','hf_lora','lora_url'].includes(name)));

const CANVAS_ALIAS_NAMES = new Set(Object.values(CANVAS_TO_SCHEMA_ALIASES).flat().filter((n) => !['lora_weights', 'hf_lora', 'lora_url'].includes(n)));

export interface ChoiceField {
  key: string;
  /** Schema `title` verbatim (trace-fix2 #6: shown beside the unchanged English key). */
  title?: string;
  description?: string;
  defaultValue?: unknown;
  enumValues: string[];
  sizeObject?: { width: { minimum?: number; maximum?: number; default?: number }; height: { minimum?: number; maximum?: number; default?: number } };
  /** OpenAPI integer/number scalar (e.g. Venice lora_strength 0–100). */
  numberSpec?: { type: 'integer' | 'number'; minimum?: number; maximum?: number; exclusiveMinimum?: boolean; default?: number };
  /** Plain string field (no enum), e.g. Replicate lora_weights / image (format uri). */
  stringSpec?: { format?: string };
  /** x-liveConfirmed flag (kept for callers; labels no longer depend on it). */
  liveConfirmed: boolean;
}

/** Generic OpenAPI $ref resolver ('#/components/schemas/x') against the full document; cycles stop at the first repeat. */
export function resolveRef(spec: any, doc?: any, seen: string[] = []): any {
  if (!spec || typeof spec !== 'object' || typeof spec.$ref !== 'string' || !spec.$ref.startsWith('#/') || seen.includes(spec.$ref) || !doc) return spec;
  const target = spec.$ref.slice(2).split('/').reduce((a: any, k: string) => a?.[k.replace(/~1/g, '/').replace(/~0/g, '~')], doc);
  return target ? resolveRef(target, doc, [...seen, spec.$ref]) : spec;
}
/** spec + its anyOf/oneOf/allOf members ($ref resolved), so allOf:[{$ref:enum}] (e.g. aspect_ratio) yields its enum. */
const variants = (spec: any, doc?: any): any[] => {
  const s = resolveRef(spec, doc);
  return [s, ...[...(s?.anyOf || []), ...(s?.oneOf || []), ...(s?.allOf || [])].map((v: any) => resolveRef(v, doc))].filter(Boolean);
};
const isSecret = (vs: any[]) => vs.some((v) => v?.writeOnly === true || v?.['x-cog-secret'] === true || v?.format === 'password');
/**
 * Schema keys that receive the canvas LoRA nodes (same generic alias table the payload plan uses).
 * Index 0 = primary LoRA path field, 'extra' = second LoRA slot. Display only: the value comes from the LoRA nodes.
 */
export const LORA_PATH_KEYS = ['lora_weights', 'hf_lora', 'lora_url'];
export const LORA_EXTRA_KEYS = ['extra_lora'];
export function canvasLoraFieldValue(key: string, declared: string[], loras?: Array<{ name?: string }> | null): string | null | undefined {
  const primary = LORA_PATH_KEYS.find((k) => declared.includes(k));
  const isPrimary = key === primary;
  const isExtra = LORA_EXTRA_KEYS.includes(key) && !!primary;
  if (!isPrimary && !isExtra) return undefined; // not a LoRA slot
  if (loras == null) return null; // LoRA nodes not visible on this surface
  const l = loras[isPrimary ? 0 : 1];
  return l?.name ? String(l.name) : undefined;
}

function isLiveConfirmed(spec: any): boolean {
  if (spec?.['x-liveConfirmed'] === true) return true;
  return variants(spec).some((v) => v?.['x-liveConfirmed'] === true);
}

/** Pure: pick Schema properties that need a panel control and are not already canvas widgets. */
export function schemaChoiceFields(inputSchema: any, doc?: any): ChoiceField[] {
  const props = inputSchema?.properties;
  if (!props || typeof props !== 'object') return [];
  const out: ChoiceField[] = [];
  for (const [key, spec] of Object.entries<any>(props)) {
    if (NEVER.has(key) || CANVAS_MAPPED.has(key)) continue;
    const vs = variants(spec, doc);
    if (isSecret(vs)) continue; // credentials never rendered/sent from the panel
    const enumValues = vs.flatMap((v) => (Array.isArray(v.enum) && (v.type === 'string' || v.enum.every((x: unknown) => typeof x === 'string')) ? v.enum : [])).map(String);
    const obj = vs.find((v) => v?.type === 'object' && v.properties?.width && v.properties?.height);
    const num = vs.find((v) => v?.type === 'integer' || v?.type === 'number');
    // Plain strings: only keys no canvas widget owns (own-widget aspect_ratio/resolution/format stay single-control).
    const str = !enumValues.length && !obj && !num && !CANVAS_ALIAS_NAMES.has(key) ? vs.find((v) => v?.type === 'string') : undefined;
    if (!enumValues.length && !obj && !num && !str) continue;
    if (enumValues.length === 1 && !obj && !num) continue; // a single allowed value is not a choice
    out.push({
      key,
      stringSpec: str ? { format: typeof str.format === 'string' ? str.format : undefined } : undefined,
      title: typeof spec.title === 'string' ? spec.title : vs.find((v) => typeof v.title === 'string')?.title,
      description: spec.description || vs.find((v) => v.description)?.description,
      defaultValue: spec.default ?? vs.find((v) => v.default !== undefined)?.default,
      enumValues: Array.from(new Set(enumValues)),
      sizeObject: obj ? { width: obj.properties.width, height: obj.properties.height } : undefined,
      numberSpec: num && !enumValues.length && !obj
        ? {
            type: num.type === 'integer' ? 'integer' : 'number',
            minimum: typeof num.minimum === 'number' ? num.minimum : undefined,
            maximum: typeof num.maximum === 'number' ? num.maximum : undefined,
            exclusiveMinimum: num.exclusiveMinimum === true,
            default: typeof num.default === 'number' ? num.default : undefined,
          }
        : undefined,
      liveConfirmed: isLiveConfirmed(spec),
    });
  }
  return out;
}

const parse = (value?: string): Record<string, any> | null => {
  try { const p = JSON.parse(value || '{}'); return p && typeof p === 'object' && !Array.isArray(p) ? p : null; } catch { return null; }
};

/**
 * Badge derives from the same rule the server uses to build actualRequest: every key present in the
 * custom-parameters body is sent verbatim (schemaProviders submit: Object.assign(payload, custom)); absent keys are not sent.
 * So a filled value is 「会发送 <value>」; an unfilled one is 「未填写，不发送」.
 */
export const UNFILLED_NOT_SENT = '未填写，不发送';
export const NOT_IN_SCHEMA_NOT_SENT = 'Schema 不支持，不发送';
const scalarDefault = (d: unknown): string | undefined => d === undefined || d === null || typeof d === 'object' ? undefined : String(d);
/**
 * clean-1029 four-state label (no 「待确认」): a filled key is in the body and sent verbatim; an unfilled key is not sent,
 * with the Schema's own default shown only when the Schema declares one (never guessed).
 */
export function schemaFieldBadge(current: unknown, schemaDefault?: unknown): { kind: 'send' | 'not_sent'; text: string } {
  if (current !== undefined) return { kind: 'send', text: `会发送 ${typeof current === 'object' ? JSON.stringify(current) : String(current)}` };
  const d = scalarDefault(schemaDefault);
  return { kind: 'not_sent', text: d !== undefined ? `${UNFILLED_NOT_SENT}（Schema 默认：${d}）` : UNFILLED_NOT_SENT };
}

/**
 * trace-fix2 #8: LoRA-receiving array fields of the Schema (key names a LoRA, or `styles`) with their `description`
 * verbatim, e.g. MuAPI loras: "List of LoRAs to apply (maximum 3)". Display only — never parsed, never enforced.
 */
export function schemaLoraDescriptions(inputSchema: any, doc?: any): Array<{ key: string; description: string }> {
  const props = inputSchema?.properties;
  if (!props || typeof props !== 'object') return [];
  const out: Array<{ key: string; description: string }> = [];
  for (const [key, spec] of Object.entries<any>(props)) {
    if (!(/lora/i.test(key) || key === 'styles')) continue;
    const vs = variants(spec, doc);
    if (!vs.some((v) => v?.type === 'array')) continue;
    const d = typeof spec?.description === 'string' ? spec.description : vs.find((v) => typeof v?.description === 'string')?.description;
    if (typeof d === 'string' && d.trim()) out.push({ key, description: d });
  }
  return out;
}

export function SchemaChoiceControls({
  inputSchema,
  sourceUrl,
  value,
  onChange,
  schemaUnprobed,
  openapi,
  canvasLoras,
}: {
  inputSchema: any;
  /** Full OpenAPI document, for resolving $ref in inputSchema. */
  openapi?: any;
  /** Canvas LoRA nodes feeding this model (undefined = not visible on this surface). */
  canvasLoras?: Array<{ name?: string; strength?: number }> | null;
  sourceUrl?: string;
  value?: string;
  onChange: (value: string) => void;
  /** Official OpenAPI not yet FE-confirmed (informational). */
  schemaUnprobed?: boolean;
}) {
  const fields = schemaChoiceFields(inputSchema, openapi);
  const loraDescriptions = schemaLoraDescriptions(inputSchema, openapi);
  const declaredKeys = Object.keys(inputSchema?.properties || {});
  if (!fields.length && !loraDescriptions.length) return null;
  const body = parse(value);
  const write = (key: string, next: unknown) => {
    const b = parse(value);
    if (!b) return;
    if (next === undefined) delete b[key]; else b[key] = next;
    onChange(JSON.stringify(b, null, 2));
  };
  return (
    <div className="rounded-xl border border-slate-700 bg-[#111620] p-3 text-xs text-slate-200 space-y-2" data-testid="schema-choice-controls" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <p className="text-slate-400">官方 Schema 字段{sourceUrl ? <>（来源：<UrlText url={sourceUrl} />）</> : ''}</p>
      {loraDescriptions.map((d) => (
        <details key={d.key} className="rounded border border-purple-500/50 bg-purple-950/40 px-2 py-1 text-purple-100" data-testid={`schema-lora-description-${d.key}`}>
          <summary className="cursor-pointer [overflow-wrap:anywhere]">
            <span className="font-mono">{d.key}</span>
            <span className="text-purple-300/90"> · 官方 Schema 说明</span>
            <span className="ml-1 text-[10px] text-purple-300/70">（点开看全文 · 仅显示，不解析）</span>
            <span className="mt-0.5 block line-clamp-2 font-mono text-[11px] text-purple-200/90">{d.description}</span>
          </summary>
          <p className="mt-1 font-mono text-[11px] whitespace-pre-wrap [overflow-wrap:anywhere] border-t border-purple-800/50 pt-1">{d.description}</p>
        </details>
      ))}
      {fields.map((f) => {
        const current = body?.[f.key];
        const isObj = current && typeof current === 'object' && !Array.isArray(current);
        const mode = current === undefined ? '' : isObj ? '__custom__' : String(current);
        const sent = current !== undefined;
        const unfilledLabel = schemaFieldBadge(undefined, f.numberSpec?.default ?? f.defaultValue).text;
        return (
          <div key={f.key} className="space-y-1" data-testid={`schema-choice-${f.key}`}>
            <label className="flex flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 [overflow-wrap:anywhere]" title={f.description}>
                <span className="font-mono">{f.key}</span>
                {(f.title || f.description) && <span className="ml-1.5 text-slate-400 line-clamp-2" data-testid={`schema-field-doc-${f.key}`} title={[f.title, f.description].filter(Boolean).join(' · ')}>{f.title ? f.title : ''}{f.title && f.description && f.description !== f.title ? ' · ' : ''}{f.description && f.description !== f.title ? f.description : ''}</span>}
              </span>
              {(() => {
                const fromLora = current === undefined ? canvasLoraFieldValue(f.key, declaredKeys, canvasLoras) : undefined;
                if (fromLora) return <span data-testid={`schema-badge-${f.key}`} className="text-[10px] px-1.5 py-0.5 rounded border border-emerald-500/50 text-emerald-300 [overflow-wrap:anywhere]">{`会发送 ${fromLora}（来自 LoRA 节点）`}</span>;
                if (fromLora === null) return <span data-testid={`schema-badge-${f.key}`} className="text-[10px] px-1.5 py-0.5 rounded border border-slate-600 text-slate-400">取自画布 LoRA 节点（见参数面板）</span>;
                const b = schemaFieldBadge(current, f.numberSpec?.default ?? f.defaultValue);
                return <span data-testid={`schema-badge-${f.key}`} className={`text-[10px] px-1.5 py-0.5 rounded border ${b.kind === 'send' ? 'border-emerald-500/50 text-emerald-300' : 'border-slate-600 text-slate-400'}`}>{b.text}</span>;
              })()}
            </label>
            {f.stringSpec ? (() => {
              const fromLora = current === undefined ? canvasLoraFieldValue(f.key, declaredKeys, canvasLoras) : undefined;
              return (
                <input
                  type="text"
                  aria-label={f.key}
                  disabled={!body || typeof fromLora === 'string'}
                  value={typeof fromLora === 'string' ? fromLora : current === undefined || current === null ? '' : String(current)}
                  placeholder={f.stringSpec.format === 'uri' ? 'URL（留空则不发送）' : '留空则不发送'}
                  title={f.description}
                  onChange={(e) => write(f.key, e.target.value === '' ? undefined : e.target.value)}
                  className="w-full rounded border border-slate-600 bg-black/30 px-2 py-1"
                />
              );
            })() : f.numberSpec && !f.enumValues.length && !f.sizeObject ? (
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  aria-label={f.key}
                  disabled={!body}
                  min={f.numberSpec.minimum}
                  max={f.numberSpec.maximum}
                  step={f.numberSpec.type === 'integer' ? 1 : 'any'}
                  value={current === undefined || current === null ? '' : Number(current)}
                  placeholder={f.numberSpec.default !== undefined ? `默认 ${f.numberSpec.default}` : '留空则不发送'}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === '') write(f.key, undefined);
                    else {
                      const n = f.numberSpec!.type === 'integer' ? parseInt(raw, 10) : Number(raw);
                      write(f.key, Number.isFinite(n) ? n : undefined);
                    }
                  }}
                  className="w-32 rounded border border-slate-600 bg-black/30 px-2 py-1"
                />
                <span className="text-slate-500">
                  
                  {f.numberSpec.minimum !== undefined || f.numberSpec.maximum !== undefined
                    ? `范围 ${f.numberSpec.exclusiveMinimum ? '>' : ''}${f.numberSpec.minimum ?? '?'}–${f.numberSpec.maximum ?? '?'}`
                    : ''}
                </span>
              </div>
            ) : (
              <>
                <select
                  aria-label={f.key}
                  disabled={!body}
                  value={mode}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '') write(f.key, undefined);
                    else if (v === '__custom__') write(f.key, { width: f.sizeObject?.width.default ?? f.sizeObject?.width.minimum, height: f.sizeObject?.height.default ?? f.sizeObject?.height.minimum });
                    else write(f.key, v);
                  }}
                  className="w-full rounded border border-slate-600 bg-black/30 px-2 py-1"
                >
                  <option value="" title={unfilledLabel}>（不发送）</option>
                  {f.enumValues.map((v) => <option key={v} value={v}>{v}</option>)}
                  {f.sizeObject && <option value="__custom__">自定义宽高（width × height）</option>}
                </select>
                {isObj && f.sizeObject && (
                  <div className="flex items-center gap-2">
                    {(['width', 'height'] as const).map((dim) => (
                      <input
                        key={dim}
                        type="number"
                        aria-label={`${f.key}.${dim}`}
                        min={f.sizeObject![dim].minimum}
                        max={f.sizeObject![dim].maximum}
                        value={current[dim] ?? ''}
                        onChange={(e) => write(f.key, { ...current, [dim]: e.target.value === '' ? undefined : Number(e.target.value) })}
                        className="w-24 rounded border border-slate-600 bg-black/30 px-2 py-1"
                      />
                    ))}
                    <span className="text-slate-500">范围 {f.sizeObject.width.minimum ?? '?'}–{f.sizeObject.width.maximum ?? '?'}</span>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
