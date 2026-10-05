import {it, expect} from 'vitest';
import {NODE_DEFINITIONS} from '../constants/nodes';

it('positive CLIP node exposes refine provider/model widgets so AI 润色 is configurable (B02)', () => {
  const widgets = NODE_DEFINITIONS.CLIPTextEncode.widgets || [];
  const rp = widgets.find((w: any) => w.name === 'refineProvider');
  const rm = widgets.find((w: any) => w.name === 'refineModel');
  expect(rp, 'refineProvider widget missing').toBeTruthy();
  expect(rm, 'refineModel widget missing').toBeTruthy();
  expect(rp!.type).toBe('select');
  const values = (rp!.options || []).map((o: any) => o.value);
  expect(values).toContain('sensenova');
  expect(values).toContain('gemini');
  // negative prompt node must NOT gain refine widgets
  const neg = NODE_DEFINITIONS.CLIPTextEncodeNegative.widgets || [];
  expect(neg.find((w: any) => w.name === 'refineProvider')).toBeUndefined();
});
