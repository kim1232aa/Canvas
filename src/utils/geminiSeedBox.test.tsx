// @vitest-environment jsdom
// 雁 2026-11-04: Gemini node shows an editable, empty-by-default seed box; a filled seed reaches the outgoing body. Fixture network only.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeItem } from '../components/NodeItem';
import { WORKFLOW_PRESETS } from '../constants/presets';
import { executeWorkflow } from './graphEngine';

const noop = () => {};
// std-gemini-t2i ships no recipe prompt (empty); simulate the user typing one (test-only).
const preset = () => {
  const p = structuredClone(WORKFLOW_PRESETS.find((x) => x.id === 'std-gemini-t2i')!);
  for (const n of p.nodes) if (n.type === 'CLIPTextEncode') n.values = { ...n.values, text: 'USER_TYPED_TEST_PROMPT' };
  return p;
};
const geminiNode = (nodes: any[]) => nodes.find((n) => n.type === 'GoogleImagenNode');
const render = (node: any) => renderToStaticMarkup(<NodeItem node={{ ...node, state: 'idle' }} isSelected={false} zoom={1} onSelect={noop} onStartDrag={noop} onUpdateValue={noop} onDeleteNode={noop} onToggleCollapse={noop} onToggleBypass={noop} onStartConnecting={noop} onEndConnecting={noop} />);

afterEach(() => vi.unstubAllGlobals());

async function sentBody(seed: unknown, extra: Record<string, unknown> = {}) {
  const p = preset();
  const nodes = p.nodes.map((n: any) => ({ ...n, state: 'idle', values: { ...n.values, ...(n.type === 'GoogleImagenNode' ? { seed, ...extra } : {}) } }));
  const bodies: any[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: any, init: any) => {
    if (init?.method === 'POST' && init.body) bodies.push({ url: String(url), body: JSON.parse(String(init.body)) });
    return new Response(JSON.stringify({ error: 'fixture stop' }), { status: 422, headers: { 'content-type': 'application/json' } });
  }));
  await executeWorkflow(nodes as any, p.connections as any, noop, undefined, geminiNode(nodes).id).catch(() => {});
  return bodies.find((b) => /gemini|generate/.test(b.url))?.body;
}

describe('Gemini generateContent node seed', () => {
  it('preset node renders an editable seed box, empty by default', () => {
    const html = render(geminiNode(preset().nodes));
    const input = html.match(/<input[^>]*aria-label="seed"[^>]*>/)?.[0];
    expect(input).toBeTruthy();
    expect(input).not.toMatch(/disabled|readonly/i);
    expect(input).toMatch(/value=""/);
  });
  it('width / height row shows no stray literal text (was a bare `null` JSX text node)', () => {
    const html = render(geminiNode(preset().nodes));
    const row = html.match(/width \/ height<\/label>([\s\S]*?)<\/div>/)?.[1];
    expect(row).toBe('');
    expect(html).not.toMatch(/>\s*null\s*</);
  });
  it('filled seed reaches the outgoing body; empty seed is not sent', async () => {
    const filled = await sentBody(1234);
    expect(filled).toBeTruthy();
    expect(filled.seed).toBe(1234);
    const empty = await sentBody(undefined);
    expect(empty).toBeTruthy();
    expect('seed' in empty).toBe(false);
  });
  it('filled width/height boxes on the same node are sent too', async () => {
    const body = await sentBody(undefined, { width: 640, height: 960 });
    expect(body).toMatchObject({ width: 640, height: 960 });
  });
});
