import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/modelscopeSuccess1121.json';
import { historyActualRequest, historyModelSent, historySeedStatement, historySeedRowText, historyUpstreamExchanges } from './historyParameters';
import { findRunHistoryItem } from './runHistoryItem';
import { resolveFillLoraNodeId } from './fillLoraNode';
import { countActualRequestLoras } from './actualRequestLoras';
import { HistoryModal } from '../components/HistoryModal';

// Real stored success entry from the 1121 run (hist_1792121319067_i9lp9): actualParameters + submissions, no actualRequest key.
const item: any = fixture;
const render = (items: any[]) => renderToStaticMarkup(<HistoryModal isOpen onClose={() => {}} history={items} onApplyPrompt={() => {}} onDeleteItem={() => {}} onClearAll={() => {}} />);

describe('success card shows the verbatim request (fix 1)', () => {
  it('reads the outbound submission when the route recorded no actualRequest', () => {
    expect(item.requestMetadata.actualRequest).toBeUndefined();
    const actual = historyActualRequest(item)!;
    expect(actual.endpoint).toBe('https://api-inference.modelscope.ai/v1/images/generations');
    expect(actual.parameters).toEqual(item.requestMetadata.submissions[0].parameters);
    expect(countActualRequestLoras(actual)).toBe(1);
  });
  it('prefers a recorded actualRequest and returns nothing when the POST never left', () => {
    const ar = { endpoint: 'e', parameters: { model: 'm' } };
    expect(historyActualRequest({ ...item, requestMetadata: { ...item.requestMetadata, actualRequest: ar } })).toBe(ar);
    expect(historyActualRequest({ status: 'failed', requestMetadata: { postSent: false, submissions: [{ endpoint: 'e', parameters: {} }] } } as any)).toBeUndefined();
  });
  it('lists submit + poll exchanges verbatim', () => {
    const rows = historyUpstreamExchanges(item);
    expect(rows.map((r) => `${r.method} ${r.status}`)).toEqual(['POST 200', 'GET 200']);
    expect((rows[1].responseBody as any).kind).toBe('raw-response');
  });
  it('renders request JSON and the upstream exchanges on the success card', () => {
    const html = render([item]);
    expect(html).toContain('data-testid="history-success-actual"');
    // fix3 O: JsonNoMidBreak may insert <wbr/> inside path segments — strip tags then assert.
    const jsonText = html.replace(/<wbr\/>/g, '').replace(/<\/?span[^>]*>/g, '');
    expect(jsonText).toContain('data-testid="history-success-actual-json"');
    expect(jsonText).toContain('LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1');
    expect(html).toContain('data-testid="history-upstream-exchanges"');
    // trace-fix2 #16: URL segments are nowrap spans with <wbr/>; the visible text is unchanged.
    const text = html.replace(/<wbr\/>/g, '').replace(/<\/?span[^>]*>/g, '');
    expect(text).toContain('POST https://api-inference.modelscope.ai/v1/images/generations → HTTP 200 OK');
    expect(text).toContain('GET https://api-inference.modelscope.ai/v1/tasks/bcab04fd-5df9-409a-b010-b7319586739d → HTTP 200 OK');
  });
});

describe('seed: one source of truth (fix 2)', () => {
  it('upstream responses carry no seed, so both surfaces say sent / not returned', () => {
    expect(historySeedStatement(item)).toBe('种子 42（实际发送）。上游未返回种子');
    expect(historySeedRowText(item)).toBe('种子 42');
  });
  it('toast resolves the same stored entry by the response historyItem id', () => {
    const responses = [{ historyItem: { id: item.id, status: undefined } }];
    expect(findRunHistoryItem(responses, [{ id: 'other' } as any, item])).toBe(item);
    expect(findRunHistoryItem(responses, [])).toBeUndefined();
    expect(findRunHistoryItem([{}], [item])).toBeUndefined();
  });
});

describe('model 实际发送 chip (fix 3)', () => {
  it('chip when the submitted model equals the shown model', () => {
    expect(historyModelSent(item)).toBe(true);
    expect(historyModelSent({ ...item, actualModel: 'x', model: 'x' })).toBe(false);
    expect(render([item])).toMatch(/data-testid="history-model">模型: Tongyi-MAI\/Z-Image-Turbo<span data-source="sent"/);
  });
});

describe('仅填入当前节点 fills, never creates (fix 4)', () => {
  const nodes: any[] = [{ id: 'ck', type: 'CheckpointLoaderSimple' }, { id: 'lora1', type: 'LoRALoader' }, { id: 'ks', type: 'KSampler' }];
  it('uses picker target, else selected LoRA node', () => {
    expect(resolveFillLoraNodeId(nodes, 'lora1', 'ks')).toBe('lora1');
    expect(resolveFillLoraNodeId(nodes, null, 'lora1')).toBe('lora1');
    expect(resolveFillLoraNodeId(nodes, 'gone', 'lora1')).toBe('lora1');
  });
  it('throws (no new node) when no current LoRA node', () => {
    expect(() => resolveFillLoraNodeId(nodes, null, 'ks')).toThrow(/不会新建节点/);
  });
});
