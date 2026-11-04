// @vitest-environment jsdom
// Load-only UI 2026-11-04 (03–07): video seed box must render only on I2V presets whose declared schemaProperties list seed.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeItem } from '../components/NodeItem';
import { WORKFLOW_PRESETS } from '../constants/presets';

const noop = () => {};
afterEach(() => vi.unstubAllGlobals());
const renderVideoNode = (presetId: string) => {
  const vid = structuredClone(WORKFLOW_PRESETS.find((x) => x.id === presetId)!.nodes.find((n) => n.type === 'AIVideoNode')!);
  return renderToStaticMarkup(<NodeItem node={{ ...vid, state: 'idle' } as any} isSelected={false} zoom={1} onSelect={noop} onStartDrag={noop} onUpdateValue={noop} onDeleteNode={noop} onToggleCollapse={noop} onToggleBypass={noop} onStartConnecting={noop} onEndConnecting={noop} />);
};

describe('AI 视频 seed box gated by preset-declared schema', () => {
  it.each(['std-novita-i2v', 'std-fal-i2v', 'std-wavespeed-i2v'])('%s shows an empty seed box', (id) => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {}))); // cold Schema (never resolves) = real first paint
    const html = renderVideoNode(id);
    expect(html).toContain('种子 (seed)');
  });
  it.each(['std-muapi-i2v', 'std-civitai-i2v', 'std-replicate-i2v'])('%s has no seed box', (id) => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
    const html = renderVideoNode(id);
    expect(html).not.toContain('种子 (seed)');
  });
});
