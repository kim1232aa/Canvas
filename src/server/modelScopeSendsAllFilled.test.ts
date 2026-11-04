import { describe, it, expect, vi, afterEach } from 'vitest';
import { ModelScopeDriver } from '../engines/drivers/ModelScopeDriver';
import { ModelScopeAiDriver } from '../engines/drivers/ModelScopeAiDriver';
import { buildModelScopeImagePayload } from './modelScopeImageContract';

// 雁: every parameter the user filled goes upstream as filled. Driver body → server payload builder → outgoing body.
async function outgoing(driver: any, extra: Record<string, unknown>) {
  let sent: any;
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => { sent = JSON.parse(init.body); return new Response(JSON.stringify({ imageUrl: 'x' }), { status: 200 }); }));
  await driver.executeGenerate({ model: 'Tongyi-MAI/Z-Image-Turbo', prompt: 'p', steps: 8, cfg: 1, seed: 42, width: 832, height: 1216, ...extra }, { modelscopeToken: 't', modelscopeAiToken: 't' });
  return buildModelScopeImagePayload(sent).payload;
}

describe('ModelScope CN / AI send sampler, scheduler, denoise, negative_prompt when filled', () => {
  afterEach(() => vi.unstubAllGlobals());
  for (const [name, D] of [['CN', ModelScopeDriver], ['AI', ModelScopeAiDriver]] as const) {
    it(`${name}: filled values are in the outgoing body under canvas names`, async () => {
      const body = await outgoing(new D(), { sampler_name: 'euler', scheduler: 'simple', denoise: 0.7, negative_prompt: 'blurry' });
      expect(body).toMatchObject({ sampler_name: 'euler', scheduler: 'simple', denoise: 0.7, negative_prompt: 'blurry', size: '832x1216', steps: 8, guidance: 1, seed: 42 });
    });
    it(`${name}: empty values are left out`, async () => {
      const body = await outgoing(new D(), { sampler_name: '', scheduler: undefined, negative_prompt: '  ' });
      for (const k of ['sampler_name', 'scheduler', 'denoise', 'negative_prompt']) expect(body).not.toHaveProperty(k);
    });
  }
});
