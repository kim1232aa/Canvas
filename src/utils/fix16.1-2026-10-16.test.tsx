import { describe, it, expect } from 'vitest';
import React from 'react';
import { readFileSync } from 'fs';
import { join } from 'path';
import { renderToStaticMarkup } from 'react-dom/server';
import { JsonNoMidBreak } from '../components/TextEmphasis';
import { BreakAfterSlashDash } from '../components/NodeItem';
import { HistoryModal } from '../components/HistoryModal';

const ZW = /[\u200B\u200C\u200D\u2060\uFEFF]/;
const failed: any = {
  id: 'hist_x_eigrc', status: 'failed', upstreamStatus: 429, upstreamStatusText: 'Too Many Requests',
  upstreamResponseBody: '{"errors":{"message":"insufficient balance"}}',
  prompt: 'a starship corridor interior, cinematic lighting', provider: 'modelscope_ai', model: 'Tongyi-MAI/Z-Image-Turbo', loras: [],
  requestMetadata: {
    actualRequest: { endpoint: 'https://api-inference.modelscope.ai/v1/images/generations', parameters: { model: 'Tongyi-MAI/Z-Image-Turbo', prompt: 'a starship corridor interior, cinematic lighting', size: '1024x1024', steps: 8, seed: 42 } },
    executionTrace: [{ keyIndex: 0, keyCount: 2 }],
  },
};
const html = renderToStaticMarkup(<HistoryModal isOpen onClose={() => {}} history={[failed]} onApplyPrompt={() => {}} onDeleteItem={() => {}} onClearAll={() => {}} />);

describe('fix16.1 real render paths', () => {
  it('#2 JSON prompt line gets break points at spaces (no single nowrap span)', () => {
    const j = renderToStaticMarkup(<JsonNoMidBreak value={{ prompt: 'a starship corridor interior, cinematic lighting' }} />);
    expect(j).not.toContain('<span class="whitespace-nowrap">  &quot;prompt&quot;: &quot;a starship corridor interior, cinematic lighting&quot;</span>');
    expect((j.match(/<wbr\/>/g) || []).length).toBeGreaterThan(3);
    expect(j.replace(/<[^>]+>/g, '')).toContain('a starship corridor interior, cinematic lighting');
    expect(ZW.test(j)).toBe(false);
  });
  it('#3 LoRA title breaks after / and - with <wbr>, text verbatim, no ZWSP', () => {
    const name = 'LoRA: LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1';
    const out = renderToStaticMarkup(<BreakAfterSlashDash text={name} />);
    expect(out.replace(/<wbr\/>/g, '')).toBe(name);
    expect((out.match(/<wbr\/>/g) || []).length).toBe(7);
    expect(ZW.test(out)).toBe(false);
    const src = readFileSync(join(__dirname, '../components/NodeItem.tsx'), 'utf8');
    expect(src).toContain('data-testid="lora-name-input"');
    expect(src).toMatch(/<textarea[\s\S]{0,400}lora-name-input|lora-name-input[\s\S]{0,800}whitespace-pre-wrap/);
  });
  it('#5 failed card: Key pill only in status header (no second misaligned copy)', () => {
    expect((html.match(/data-testid="history-key-usage"/g) || []).length).toBeLessThanOrEqual(1);
  });
});
