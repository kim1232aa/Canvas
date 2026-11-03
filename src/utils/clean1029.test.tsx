// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import fs from 'node:fs';
import { upstreamFailureToast, LOCAL_BLOCK_NODE_LINE, LOCAL_BLOCK_TOAST_TITLE, TOAST_BODY_FIRST_LINE_MAX } from './apiFailure';
import { schemaFieldBadge, SchemaChoiceControls } from '../components/SchemaChoiceControls';
import { FIELD_STATUS_LABEL } from '../components/FieldStatusBadge';
import { providerSendsSeparateClipStrength, CLIP_STRENGTH_NOT_SENT_NOTE } from './loraClipStrength';
import { historyParameterSourceLabel, HISTORY_UNSUPPORTED_LABEL } from './historyParameters';
import { groupAuxByOperation, auxOperationHeader } from '../components/ExecutionLog';
import type { ExecutionRecord } from '../services/executionTrace';

const read = (p: string) => fs.readFileSync(new URL(p, import.meta.url), 'utf8');

describe('clean-1029 #1 toast = HTTP status + upstream body verbatim', () => {
  const body = '{"error":"Insufficient USD or Diem balance to complete request","code":"PAYMENT_REQUIRED"}';
  it('Venice 402: title HTTP 402, first line = short summary, full body in expand', () => {
    const t = upstreamFailureToast({ ok: false, executionTrace: [{ method: 'POST', status: 402, responseBody: body }] }, '运行：保存图像')!;
    expect(t.title).toBe('HTTP 402');
    expect(t.message.split('\n')[0]).not.toBe(body); // fix4: short first line
    expect(t.message).toContain('完整上游响应原文');
    expect(t.message).toContain(body);
    expect(t.message).not.toMatch(/LoRA|请求未完成/);
  });
  it('401 from upstreamStatus + upstreamResponseBody; full body in expand', () => {
    const long = 'x'.repeat(TOAST_BODY_FIRST_LINE_MAX + 50);
    const t = upstreamFailureToast({ upstreamStatus: 401, upstreamResponseBody: long })!;
    expect(t.title).toBe('HTTP 401');
    expect(t.message).toContain('完整上游响应原文');
    expect(t.message).toContain(long);
  });
  it('App uses the shared toast and no longer prefixes runToastLine on upstream failures', () => {
    const app = read('../App.tsx');
    expect(app).toMatch(/toastFromRunError\(err/);
  });
});

describe('clean-1029 #2 local block line shared by LoRA node / Save node / toast / log', () => {
  it('one copy source', () => {
    expect(LOCAL_BLOCK_NODE_LINE.startsWith(LOCAL_BLOCK_TOAST_TITLE)).toBe(true);
    const node = read('../components/NodeItem.tsx');
    expect(node).toContain('data-testid="node-local-block"');
    expect(node).not.toContain("'没有发出去：");
    expect(read('../components/ExecutionLog.tsx')).toContain('${localBlockTitle(latestError.response)} · ${latestError.runLabel'); // clean-1333 #3
  });
});

describe('clean-1029 #3 four field states, no 待确认', () => {
  it('labels', () => {
    expect(FIELD_STATUS_LABEL.not_sent).toBe('Schema 不支持，不发送');
    expect(FIELD_STATUS_LABEL.schema_unavailable).toBe('Schema 不可用，字段按所填原样发送');
    expect(schemaFieldBadge(undefined, 'png').text).toBe('未填写，不发送（Schema 默认：png）');
    expect(schemaFieldBadge(undefined, undefined).text).toBe('未填写，不发送');
    expect(schemaFieldBadge('webp', 'png').text).toBe('会发送 webp');
    expect(Object.values(FIELD_STATUS_LABEL).join()).not.toContain('待确认');
    expect(Object.values(FIELD_STATUS_LABEL).join()).not.toContain('发送情况未知');
    expect(FIELD_STATUS_LABEL.pending).toBe('Schema 未读取');
    expect(FIELD_STATUS_LABEL.will_send).toBe('会发送');
    expect(FIELD_STATUS_LABEL.not_sent).toBe('Schema 不支持，不发送');
  });
  it('Venice format / lora_strength / variants and z-image output_format render without 待确认', () => {
    const inputSchema = { properties: {
      format: { type: 'string', enum: ['jpeg', 'png', 'webp'], default: 'webp' },
      lora_strength: { type: 'integer', minimum: 0, maximum: 100 },
      variants: { type: 'integer', minimum: 1, maximum: 4, default: 1 },
      output_format: { type: 'string', enum: ['png', 'jpeg'] },
    } };
    const html = renderToStaticMarkup(<SchemaChoiceControls inputSchema={inputSchema} value="{}" onChange={() => {}} schemaUnprobed />);
    expect(html).not.toContain('待确认');
    expect(html).toContain('未填写，不发送（Schema 默认：webp）');
    expect(html).toContain('未填写，不发送（Schema 默认：1）');
    expect(html).toMatch(/data-testid="schema-badge-output_format"[^>]*>未填写，不发送</);
  });
});

describe('clean-1029 #4 CLIP strength hidden unless sent separately', () => {
  it('no provider sends it separately → note for all (incl. venice / wavespeed)', () => {
    for (const p of ['venice', 'wavespeed', 'fal', 'civitai', 'replicate']) expect(providerSendsSeparateClipStrength(p)).toBe(false);
    expect(CLIP_STRENGTH_NOT_SENT_NOTE).toContain('不独立发送');
    expect(read('../components/NodeItem.tsx')).toContain("!providerSendsSeparateClipStrength(currentProvider)");
  });
});

describe('clean-1029 #6 no 「将运行节点」 hover tip', () => {
  it('TopBar run button has no hover title covering the label; reason stays in status line', () => {
    const t = read('../components/TopBar.tsx');
    expect(t).not.toContain('将运行节点');
    expect(t).toContain('aria-describedby="studio-run-status"');
    expect(t).not.toMatch(/data-testid="run-button"[^>]*title=/);
  });
});

describe('clean-1029 #7 exec log catalog/Schema grouped per operation', () => {
  const rec = (id: number, route: string, opSeq?: number, opLabel?: string): ExecutionRecord =>
    ({ id, time: '2026-10-15T03:00:00Z', route, method: 'GET', request: null, status: 200, response: {}, state: 'complete', opSeq, opLabel });
  it('trace tags GETs with the operation; selection / provider switch / run open operations', () => {
    expect(read('../services/userModelSelection.ts')).toContain('beginTraceOperation(`选用模型');
    expect(read('../components/ProviderModelSelect.tsx')).toContain('beginTraceOperation(`切换服务商');
    expect(read('../services/executionTrace.ts')).toContain('beginTraceOperation(`第 ${runSeq} 次运行`');
  });
});
