import { describe, expect, it } from 'vitest';
import React from 'react';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { SchemaChoiceControls, schemaChoiceFields } from './SchemaChoiceControls';
import { patchInspectorNode } from '../utils/inspectorParameters';
import type { NodeInstance } from '../types/graph';

const elements = (tree: any): any[] =>
  !tree ? [] : Array.isArray(tree) ? tree.flatMap(elements) : typeof tree === 'object' && tree.props ? [tree, ...elements(tree.props.children)] : [];
const texts = (tree: any): string =>
  elements(tree)
    .map((el) => (typeof el.props?.children === 'string' || typeof el.props?.children === 'number' ? String(el.props.children) : Array.isArray(el.props?.children) ? el.props.children.filter((c: any) => typeof c === 'string' || typeof c === 'number').join('') : ''))
    .join('\n');

describe('Venice reverify UI · lora_strength pending never says 不发', () => {
  it('schemaChoiceFields includes lora_strength numberSpec + format enum', () => {
    const fields = schemaChoiceFields({
      properties: {
        lora_strength: { type: 'integer', minimum: 0, maximum: 100 },
        format: { type: 'string', enum: ['jpeg', 'png', 'webp'], default: 'webp' },
      },
    });
    expect(fields.find((f) => f.key === 'lora_strength')?.numberSpec).toMatchObject({ type: 'integer', minimum: 0, maximum: 100 });
    expect(fields.find((f) => f.key === 'format')?.enumValues).toEqual(['jpeg', 'png', 'webp']);
  });

  // clean-1029 #3 supersedes the 待确认 contract: no Schema default declared → 「未填写，不发送」, never 待确认.
  it('unfilled lora_strength (no Schema default) → 未填写，不发送; no 待确认 anywhere', () => {
    const tree = SchemaChoiceControls({
      schemaUnprobed: true,
      inputSchema: { properties: { lora_strength: { type: 'integer', minimum: 0, maximum: 100 } } },
      value: '{}',
      onChange: () => {},
    } as any);
    const placeholders = elements(tree).map((el) => el.props?.placeholder || '').join(' ');
    const blob = texts(tree) + placeholders;
    expect(blob).toContain('未填写，不发送');
    expect(blob).not.toMatch(/待确认/);
    expect(blob).not.toMatch(/Schema 默认/);
  });
});

describe('Venice reverify UI · checkpoint not blanked on same-provider panel patch', () => {
  it('empty checkpoint overlay does not clear ckpt_name when provider unchanged', () => {
    const n = {
      id: 'c', type: 'CheckpointLoaderSimple', title: 't', pos: { x: 0, y: 0 }, inputs: [], outputs: [],
      values: { ckpt_name: 'venice-sd35', targetProvider: 'venice', width: 1024, height: 1024 },
    } as NodeInstance;
    const before: any = { checkpoint: 'venice-sd35', targetProvider: 'venice', width: 1024, height: 1024, loras: [] };
    const after: any = { ...before, checkpoint: '' };
    const patched = patchInspectorNode(n, before, after);
    expect(patched.values.ckpt_name).toBe('venice-sd35');
    expect(patched.values.width).toBe(1024);
  });

  it('explicit provider change may still clear checkpoint', () => {
    const n = {
      id: 'c', type: 'CheckpointLoaderSimple', title: 't', pos: { x: 0, y: 0 }, inputs: [], outputs: [],
      values: { ckpt_name: 'venice-sd35', targetProvider: 'venice' },
    } as NodeInstance;
    const before: any = { checkpoint: 'venice-sd35', targetProvider: 'venice', loras: [] };
    const after: any = { checkpoint: '', targetProvider: 'aimlapi', loras: [] };
    const patched = patchInspectorNode(n, before, after);
    expect(patched.values.ckpt_name).toBe('');
    expect(patched.values.targetProvider).toBe('aimlapi');
  });
});

describe('Venice reverify UI · LoRA hub notice not duplicated', () => {
  it('CivitaiModal skips yellow catalogNotice when empty conclusion already carries noUpstreamCall message', () => {
    const src = readFileSync(resolve(__dirname, 'CivitaiModal.tsx'), 'utf8');
    expect(src).toMatch(/shownEvidence\?\.noUpstreamCall && shownEvidence\?\.message/);
  });
});
