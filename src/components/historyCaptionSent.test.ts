import { describe, it, expect } from 'vitest';
import { historyCaptionSent, historyFaceLoraText } from './HistoryModal';

const p = (value: unknown, source: string) => ({ value, source } as any);
const base = () => ({
  negativePrompt: p('', 'not-sent'), seed: p(42, 'sent'), steps: p(8, 'sent'), cfg: p(1, 'unsupported'),
  sampler: p('euler', 'unsupported'), scheduler: p('simple', 'unsupported'),
  width: p(832, 'sent'), height: p(1216, 'sent'), size: p(undefined, 'unknown'),
});

describe('history big-image caption lists only sent values', () => {
  it('omits not-sent / unsupported fields with no send-status text', () => {
    const r = base();
    expect(historyCaptionSent(r, ['negativePrompt'])).toEqual([]);
    expect(historyCaptionSent(r, ['seed', 'steps', 'cfg'])).toEqual(['Seed: 42 · Steps: 8 步']);
    expect(historyCaptionSent(r, ['sampler', 'scheduler', 'size'])).toEqual(['Size: 832×1216']);
    const all = [...historyCaptionSent(r, ['negativePrompt', 'seed', 'steps', 'cfg', 'sampler', 'scheduler', 'size'])].join('');
    expect(all).not.toMatch(/未发送|该端点不支持/);
  });
  it('shows sent negative prompt and sampler', () => {
    const r = { ...base(), negativePrompt: p('blurry', 'sent'), sampler: p('euler', 'sent') };
    expect(historyCaptionSent(r, ['negativePrompt'])).toEqual(['负向: blurry']);
    expect(historyCaptionSent(r, ['sampler', 'scheduler', 'size'])).toEqual(['Sampler: euler · Size: 832×1216']);
  });
});

describe('history card LoRA line', () => {
  it('labels name and strength correctly', () => {
    expect(historyFaceLoraText([{ name: 'ST-TNG-Rooms', strength: 1 }])).toBe('LoRA: ST-TNG-Rooms × 1');
    expect(historyFaceLoraText([{ name: 'a', strength: 0.8 }, { name: 'b' }])).toBe('LoRA: a × 0.8\nb');
  });
});
