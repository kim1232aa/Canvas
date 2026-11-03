// 雁 rule: a failed catalog / Schema lookup (e.g. Cloudflare 403 HTML) never stops the generation POST.
import express from 'express';
import { describe, expect, it } from 'vitest';
import { registerSchemaProviderRoutes } from './schemaProviders';

const CF = '<!DOCTYPE html><title>Attention Required! | Cloudflare</title>';
describe('Together send despite catalog/OpenAPI 403', () => {
  it('POSTs /images/generations with all filled params and records the 403 verbatim', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const app = express();
    registerSchemaProviderRoutes(app as any, {
      fetch: async (_m: any, url: string, init?: RequestInit) => {
        calls.push({ url, init });
        if (init?.method === 'POST') return new Response('{"error":{"message":"upstream says no"}}', { status: 402 });
        return new Response(CF, { status: 403 });
      },
      key: () => 'k', record: (i: any) => i, durable: async (u: string) => ({ ok: true, dataUrl: u }),
    } as any);
    const layer = (app as any)._router.stack.find((l: any) => l.route?.path === '/api/schema-provider/:provider/submit');
    let status = 200; let payload: any;
    const res: any = { status(c: number) { status = c; return this; }, json(p: any) { payload = p; return this; } };
    await layer.route.stack[0].handle({ method: 'POST', path: '/api/schema-provider/together/submit', params: { provider: 'together' }, query: {}, headers: {},
      body: { model: 'black-forest-labs/FLUX.2-dev', prompt: 'p', steps: 28, seed: 42, width: 1024, height: 768 } }, res, () => {});
    const posts = calls.filter((c) => c.init?.method === 'POST');
    expect(posts.length).toBe(1);
    expect(posts[0].url).toBe('https://api.together.ai/v1/images/generations');
    const sent = JSON.parse(String(posts[0].init?.body));
    expect(sent).toMatchObject({ model: 'black-forest-labs/FLUX.2-dev', prompt: 'p', seed: 42, width: 1024, height: 768 });
    expect(JSON.stringify(sent)).toContain('28');
    expect(status).toBe(402);
    const txt = JSON.stringify(payload);
    expect(txt).toContain('upstream says no');
    expect(txt).toContain('catalogLookupFailure');
    expect(txt).toContain('Attention Required');
  });
});
