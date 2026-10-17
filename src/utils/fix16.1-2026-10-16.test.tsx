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
  it('#1 seed note is its own full-width line (basis-full), separate from 实际发送 chip', () => {
    expect(html).toMatch(/data-testid="history-seed"[^>]*>|class="basis-full[^"]*"[^>]*data-testid="history-seed"/);
    expect(html).toMatch(/class="basis-full text-slate-500" data-testid="history-seed-upstream-note">上游未返回种子/);
  });
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
  it('#4 CFG row: same label source/size classes as steps (uniform min-h-5, no provider special case)', () => {
    const src0 = readFileSync(join(__dirname, '../components/HistoryModal.tsx'), 'utf8');
    expect(src0).toContain('data-testid="history-cfg" className="basis-full inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 min-h-5">CFG:');
    expect(src0).toContain('data-testid="history-steps" className="basis-full inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 min-h-5">步数:');
    const src = readFileSync(join(__dirname, '../components/HistoryModal.tsx'), 'utf8');
    expect(src).not.toMatch(/modelscope[^\n]*CFG|cFG/);
  });
  it('#5 failed card: Key pill only in status header (no second misaligned copy)', () => {
    expect((html.match(/data-testid="history-key-usage"/g) || []).length).toBeLessThanOrEqual(1);
  });
  it('429 + insufficient balance stay verbatim', () => {
    expect(html).toContain('HTTP 429 Too Many Requests');
    expect(html).toContain('insufficient balance');
  });
});
