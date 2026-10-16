import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import cards from './__fixtures__/traceFix2Cards-2026-10-16.json';
import { HistoryModal, historyUnsupportedRows } from '../components/HistoryModal';
import { sentHistoryLoras, lorasFromSentParameters, historyUpstreamExchanges, resolveHistoryParameters } from './historyParameters';
import { buildFailedAttemptHistoryItem, lorasFromActualRequest } from '../server/failedAttemptHistory';
import { isLocalNotOutbound } from './apiFailure';
import { aimlapiLoras, schemaLoraMaxItems, aimlapiLoraImageInputSchema } from '../server/schemaProviders';
import { schemaLoraDescriptions, schemaChoiceFields } from '../components/SchemaChoiceControls';
import { hasStaleLoraBlock, clearStaleLoraBlocks } from './graphEngine';
import { loraLoaderNodeTitle } from './providerLabels';
import { LIMIT_CLAUSE, EmphasizeLimit, UrlNoMidBreak } from '../components/TextEmphasis';

const muapi: any = (cards as any).hist_1792126858043_jczni;
const sogni: any = (cards as any).hist_1792127116221_7nqv6;
const render = (items: any[]) => renderToStaticMarkup(<HistoryModal isOpen onClose={() => {}} history={items} onApplyPrompt={() => {}} onDeleteItem={() => {}} onClearAll={() => {}} />).replace(/<!-- -->/g, '');

describe('trace-fix2 P1 — submit failure has an 上游交互 section', () => {
  it('MuAPI 402 card (real) renders 上游交互（共 1 段）', () => {
    expect(historyUpstreamExchanges(muapi).map((r) => `${r.method} ${r.status}`)).toEqual(['POST 402']);
    const html = render([muapi]);
    expect(html).toContain('data-testid="history-upstream-exchanges"');
    expect(html).toContain('上游交互（共 1 段，原样）');
  });
  it('buildFailedAttemptHistoryItem records the request traces as executionTrace', () => {
    const trace = { provider: 'muapi', method: 'POST', endpoint: 'https://api.muapi.ai/api/v1/x', status: 402, responseBody: '{"e":1}' };
    const item = buildFailedAttemptHistoryItem({ route: '/api/schema-provider/muapi/submit', traces: [trace], submissions: [] }, { prompt: 'p' }, 402, { error: 'HTTP 402' })!;
    expect(item.requestMetadata.executionTrace).toEqual([trace]);
  });
});

describe('trace-fix2 P2 — parallel LoRA name/strength arrays', () => {
  it('Sogni card (real): loras + loraStrengths → strength 0.8, never 「未发送强度」', () => {
    expect(sentHistoryLoras(sogni)).toEqual([{ name: 'krea2-detail-enhancer', strength: 0.8 }]);
    const html = render([sogni]);
    expect(html).not.toContain('未发送强度');
    expect(html).toContain('krea2-detail-enhancer (0.8)');
  });
  it('generic: any *lora*strength/weight/scale sibling of equal length; length mismatch → not used', () => {
    expect(lorasFromSentParameters({ lora_ids: ['a', 'b'], lora_weights: [0.1, 0.2] })).toEqual([{ name: 'a', strength: 0.1 }, { name: 'b', strength: 0.2 }]);
    expect(lorasFromSentParameters({ loras: ['a', 'b'], loraStrengths: [0.1] })).toEqual([{ name: 'a', strength: undefined }, { name: 'b', strength: undefined }]);
    expect(lorasFromActualRequest({ parameters: { loras: ['x'], loraStrengths: [0.5] } })).toEqual([{ name: 'x', strength: 0.5 }]);
  });
});

describe('trace-fix2 P3/P4 — outbound failure is never 「本地拦截」', () => {
  it('poll response with only its own GET but a task ledger containing the POST → not local', () => {
    const data = { ok: false, errorSource: 'local', executionTrace: [{ method: 'GET', endpoint: 'https://u/x', status: 200 }], taskExecutionTrace: sogni.requestMetadata.executionTrace };
    expect(isLocalNotOutbound(data)).toBe(false);
  });
  it('poll response carrying the recorded failed history card → not local', () => {
    expect(isLocalNotOutbound({ errorSource: 'local', executionTrace: [{ method: 'GET', endpoint: 'u', status: 200 }], historyItem: sogni })).toBe(false);
  });
  it('a real local block (no POST anywhere) stays local', () => {
    expect(isLocalNotOutbound({ errorSource: 'local', executionTrace: [{ method: 'GET', endpoint: 'u', status: 200 }] })).toBe(true);
  });
  it('Sogni card (real) shows 上游交互 with POST 201 + GET 200', () => {
    expect(historyUpstreamExchanges(sogni).map((r) => `${r.method} ${r.status}`)).toEqual(['POST 201', 'GET 200']);
    expect(render([sogni])).toContain('上游交互（共 2 段，原样）');
  });
});

describe('trace-fix2 #5 — AIMLAPI limit comes from Schema maxItems only', () => {
  it('aimlapiLoras no longer caps at 3 itself; the generic reader reads loras.maxItems', () => {
    const four = [1, 2, 3, 4].map((i) => ({ path: `o/r${i}`, strength: 1 }));
    expect(aimlapiLoras(four)).toHaveLength(4);
    expect(schemaLoraMaxItems(aimlapiLoraImageInputSchema.properties)).toEqual({ field: 'loras', maxItems: 3 });
    expect(schemaLoraMaxItems({ loras: { type: 'array' } })).toBeNull();
  });
});

describe('trace-fix2 #6/#8 — Schema title/description shown verbatim', () => {
  it('title + description carried on choice fields', () => {
    const f = schemaChoiceFields({ properties: { aspect_ratio: { type: 'string', enum: ['1:1', '16:9'], title: 'Aspect Ratio', description: 'Output ratio' } } });
    expect(f[0]).toMatchObject({ key: 'aspect_ratio', title: 'Aspect Ratio', description: 'Output ratio' });
  });
  it('LoRA field description verbatim (MuAPI anyOf array|null)', () => {
    const d = schemaLoraDescriptions({ properties: { loras: { anyOf: [{ type: 'array', items: {} }, { type: 'null' }], description: 'List of LoRAs to apply (maximum 3)' }, prompt: { type: 'string', description: 'x' } } });
    expect(d).toEqual([{ key: 'loras', description: 'List of LoRAs to apply (maximum 3)' }]);
  });
});

describe('trace-fix2 #7 — unsupported rows fold into one', () => {
  it('MuAPI card: rows with source unsupported are listed once, card shows 「该端点不支持 N 项 · 未发送」', () => {
    const rows = historyUnsupportedRows(resolveHistoryParameters(muapi) as any);
    expect(rows.length).toBeGreaterThan(1);
    const html = render([muapi]);
    expect(html).toContain(`该端点不支持 ${rows.length} 项 · 未发送`);
    expect(html).not.toContain('data-testid="history-cfg"');
  });
});

describe('trace-fix2 #10 — stale LoRA block is cleared', () => {
  const lora = (id: string, extra: any = {}) => ({ id, type: 'LoRALoader', title: '', pos: { x: 0, y: 0 }, values: {}, inputs: [], outputs: [], ...extra });
  it('count recorded 4, now 1 → stale and cleared', () => {
    const nodes: any[] = [lora('a', { localBlockReason: 'r', localBlockTitle: 't', localBlockField: 'loras', localBlockLoraCount: 4 })];
    expect(hasStaleLoraBlock(nodes)).toBe(true);
    expect(clearStaleLoraBlocks(nodes)[0].localBlockReason).toBeUndefined();
  });
  it('count unchanged → kept', () => {
    const nodes: any[] = [lora('a', { localBlockReason: 'r', localBlockLoraCount: 2 }), lora('b')];
    expect(hasStaleLoraBlock(nodes)).toBe(false);
  });
  it('legacy LoRA chrome without a recorded count → stale', () => {
    expect(hasStaleLoraBlock([lora('a', { localBlockTitle: '本地拦截 · 已读 Schema、未发生成' })] as any)).toBe(true);
  });
});

describe('trace-fix2 #12/#13/#16', () => {
  it('URL LoRA title shows the file name', () => {
    expect(loraLoaderNodeTitle('LoRA: https://huggingface.co/Co/x/resolve/main/krea2_darkbrush.safetensors', 'https://huggingface.co/Co/x/resolve/main/krea2_darkbrush.safetensors')).toBe('LoRA: krea2_darkbrush');
  });
  it('limit clause bolded, text unchanged', () => {
    const t = '该端点 Schema 限制最多 3 个 LoRA，当前 4 个（Schema 字段 loras.maxItems）';
    expect(LIMIT_CLAUSE.exec(t)?.[1]).toBe('最多 3 个 LoRA，当前 4 个');
    const html = renderToStaticMarkup(<EmphasizeLimit text={t} />);
    expect(html).toContain('<strong');
    expect(html.replace(/<[^>]+>/g, '')).toBe(t);
  });
  it('URL breaks only after / — the text is unchanged', () => {
    const u = 'https://api.muapi.ai/api/v1/krea-v2-turbo-lora';
    const html = renderToStaticMarkup(<UrlNoMidBreak text={u} />);
    expect(html).toContain('<span class="whitespace-nowrap">krea-v2-turbo-lora</span>');
    expect(html.replace(/<[^>]+>/g, '')).toBe(u);
  });
});
