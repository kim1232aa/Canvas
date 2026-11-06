/** 2026-11-04: std i2v preset load → model dropdown on the catalog entry (no duplicate custom box), filled cfg editable, official Schema props as inputs. */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { NodeItem } from '../components/NodeItem';
import { NODE_DEFINITIONS } from '../constants/nodes';
import { WORKFLOW_PRESETS } from '../constants/presets';
import { ensureModelSchema } from '../services/modelSchemaCache';

const noop = () => {};
const flush = () => new Promise((r) => setTimeout(r, 0));
const vidOf = (id: string) => (WORKFLOW_PRESETS.find((p: any) => p.id === id) as any).nodes.find((n: any) => n.type === 'AIVideoNode');
const render = (values: Record<string, any>) => { const d = NODE_DEFINITIONS.AIVideoNode; return renderToStaticMarkup(<NodeItem node={{ id: 'v1', type: 'AIVideoNode', title: d.title, pos: { x: 0, y: 0 }, width: 320, inputs: d.inputs, outputs: d.outputs, values, state: 'idle' } as any} isSelected={false} zoom={1} onSelect={noop} onStartDrag={noop} onUpdateValue={noop} onDeleteNode={noop} onToggleCollapse={noop} onToggleBypass={noop} onStartConnecting={noop} onEndConnecting={noop} />); };

describe('AI video node after std i2v preset load', () => {
  it('preset values follow video-param-table (no fields the official Schema lacks)', () => {
    const fal = vidOf('std-fal-i2v').values, ws = vidOf('std-wavespeed-i2v').values, mu = vidOf('std-muapi-i2v').values, rep = vidOf('std-replicate-i2v').values;
    expect(fal).toMatchObject({ num_frames: 81, resolution: '480p', aspect_ratio: '16:9', fps: 16, cfg: 4, seed: 24231881 });
    expect(fal).not.toHaveProperty('duration'); expect(fal).not.toHaveProperty('size');
    expect(ws).not.toHaveProperty('fps'); expect(ws).not.toHaveProperty('size'); expect(ws).not.toHaveProperty('cfg');
    expect(ws).toMatchObject({ duration: 5, seed: 42 });
    for (const k of ['seed', 'cfg', 'fps', 'size', 'negative_prompt']) expect(mu).not.toHaveProperty(k);
    expect(mu).toMatchObject({ resolution: '480p', aspect_ratio: '16:9', duration: 5 });
    for (const k of ['fps', 'duration', 'size']) expect(rep).not.toHaveProperty(k);
    expect(rep).toMatchObject({ model: '', num_frames: 81, resolution: '480p', aspect_ratio: '16:9' });
  });
  it('catalog model is the selected dropdown entry and the custom box stays empty; filled cfg has an editable input', () => {
    const h = render({ targetProvider: 'fal', model: 'fal-ai/wan/v2.2-a14b/text-to-video/lora', cfg: 4 });
    expect(h).toMatch(/<option value="fal-ai\/wan\/v2\.2-a14b\/text-to-video\/lora" selected=""/);
    expect(h).not.toContain('自定义视频端点');
    expect(h).toMatch(/data-testid="video-extra-cfg"[\s\S]*?aria-label="cfg"[^>]*value="4"/);
  });
  it('official Schema properties render as inputs; enum → dropdown', async () => {
    ensureModelSchema('fal', 'fal-ai/test-i2v-props', (async () => new Response(JSON.stringify({ inputSchema: { properties: { prompt: {}, shift: { type: 'number' }, turbo_mode: { type: 'boolean' }, quality: { enum: ['medium', 'high'] }, guide_scale: { type: 'number' } } } }), { status: 200 })) as any);
    await flush(); await flush();
    const h = render({ targetProvider: 'fal', model: 'fal-ai/test-i2v-props' });
    expect(h).toMatch(/data-testid="video-schema-prop-shift"[\s\S]*?<input aria-label="shift" type="number"/);
    expect(h).toMatch(/data-testid="video-schema-prop-quality"[\s\S]*?<select aria-label="quality"/);
    expect(h).toMatch(/data-testid="video-schema-prop-guide_scale"/); // CFG input box when cfg not yet filled
    expect(h).not.toContain('video-schema-prop-prompt');
  });
  it('Replicate/Cog allOf-wrapped enums: after user selects model on std-replicate-i2v, preset aspect_ratio 16:9 / resolution 480p selected and Schema input `model` shows 14b from custom_parameters', async () => {
    const en = (e: unknown[]) => ({ allOf: [{ enum: e, type: typeof e[0] === 'number' ? 'integer' : 'string' }] });
    ensureModelSchema('replicate', 'wan-video/wan2.1-with-lora', (async () => new Response(JSON.stringify({ inputSchema: { properties: { prompt: {}, aspect_ratio: en(['16:9', '9:16', '1:1']), resolution: en(['480p', '720p']), model: en(['1.3b', '14b']), frames: en([17, 33, 49, 65, 81]), fast_mode: en(['Off', 'Balanced', 'Fast']) } } }), { status: 200 })) as any);
    await flush(); await flush();
    const baseValues = vidOf('std-replicate-i2v').values;
    const baseCustom = JSON.parse(baseValues.custom_parameters || '{}');
    const h = render({
      ...baseValues,
      model: 'wan-video/wan2.1-with-lora',
      custom_parameters: JSON.stringify({ ...baseCustom, model: '14b' }),
    });
    const sel = (label: string) => (h.match(new RegExp(`<select aria-label="${label.replace(/[()]/g, '\\$&')}"[^>]*>([\\s\\S]*?)</select>`)) || [])[1]?.match(/<option value="([^"]*)" selected=""/)?.[1];
    expect(sel('画面比例 (Aspect Ratio)')).toBe('16:9');
    expect(sel('model')).toBe('14b');
    expect(sel('fast_mode')).toBe('');
    expect(h).toMatch(/<select[^>]*>[\s\S]*?<option value="480p" selected=""/);
  });
  it('every filled preset value is an editable input, incl. custom_parameters (Civitai shift 7, width 480, height 832), even before the Schema loads', () => {
    const h = render(vidOf('std-civitai-i2v').values);
    expect(h).toMatch(/data-testid="video-schema-prop-shift"[\s\S]*?<input aria-label="shift"[^>]*value="7"/);
    expect(h).toMatch(/aria-label="width"[^>]*value="480"/);
    expect(h).toMatch(/aria-label="height"[^>]*value="832"/);
    expect(h).toMatch(/aria-label="cfg"[^>]*value="3"/);
    expect(h).not.toContain('aria-label="_canvas"');
    for (const id of ['std-fal-i2v', 'std-wavespeed-i2v', 'std-muapi-i2v', 'std-replicate-i2v', 'std-civitai-i2v', 'std-novita-i2v']) {
      const v = vidOf(id).values; const html = render(v);
      const custom = JSON.parse(v.custom_parameters || '{}');
      for (const [k, val] of Object.entries(custom)) if (k !== '_canvas') expect(html, `${id}.${k}`).toMatch(new RegExp(`aria-label="${k}"(?:[^>]*value="${String(val)}"|[^>]*>[\\s\\S]*?<option value="${String(val)}" selected="")`));
    }
  });
});
