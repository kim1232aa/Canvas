import express from 'express';
import { describe, expect, it } from 'vitest';
import { fetchSchemaProviderRows, fetchSogniGenerateImageSchema, isSogniPersonalLoraRow, normalizeSchemaProviderItems, registerSchemaProviderRoutes, resolveSchemaRefs, sogniAnimatePhotoSchemaSource, sogniGenerateVideoSchemaSource, sogniLoraCover, sogniLoraStrengthRange, sogniSchemaSource, upstreamReferenceUrlIssue, validateSogniLoraStrengthRanges } from './schemaProviders';
import { sogniGenerateImageSchemaFixture } from './fixtures/sogniGenerateImageSchema';
import { sogniAnimatePhotoSchemaFixture, sogniGenerateVideoSchemaFixture } from './fixtures/sogniGenerateVideoSchema';

async function withFixture(
  upstream: (url: string, init?: RequestInit) => Promise<Response>,
  run: (baseUrl: string, calls: Array<{ url: string; init?: RequestInit; meta?: any }>) => Promise<void>,
  key: (provider: string, override?: string) => string = () => '',
  durable: (url: string) => Promise<any> = async (url) => ({ ok: true, dataUrl: url }),
  record: (item: any) => any = (item) => item,
  sogniSchemaResponse?: (url:string,init?:RequestInit)=>Promise<Response>,
) {
  const calls: Array<{ url: string; init?: RequestInit; meta?: any }> = [];
  const app = express();
  registerSchemaProviderRoutes(app, {
    fetch: async (meta, url, init) => {
      calls.push({ url, init, meta });
      if(url===sogniSchemaSource)return sogniSchemaResponse?sogniSchemaResponse(url,init):json(sogniGenerateImageSchemaFixture);
      if(url===sogniGenerateVideoSchemaSource)return json(sogniGenerateVideoSchemaFixture);
      if(url===sogniAnimatePhotoSchemaSource)return json(sogniAnimatePhotoSchemaFixture);
      return upstream(url, init);
    },
    key,
    record,
    durable,
  });

  const baseUrl = 'http://schema-provider.fixture';
  const originalFetch = globalThis.fetch;
  const router = (app as any)._router;
  const layers: any[] = router?.stack || [];
  const matchRoute = (pattern: string, pathname: string) => {
    const expected = pattern.split('/').filter(Boolean);
    const actual = pathname.split('/').filter(Boolean);
    if (expected.length !== actual.length) return undefined;
    const params: Record<string, string> = {};
    for (let i = 0; i < expected.length; i++) {
      if (expected[i].startsWith(':')) params[expected[i].slice(1)] = decodeURIComponent(actual[i]);
      else if (expected[i] !== actual[i]) return undefined;
    }
    return params;
  };

  const fixtureFetch: typeof fetch = async (input: string | URL | Request, init: RequestInit = {}) => {
    const raw = typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const url = new URL(raw, baseUrl);
    if (url.origin !== baseUrl) return originalFetch(input as any, init);
    const method = String(init.method || (input instanceof Request ? input.method : 'GET')).toLowerCase();
    const layer = layers.find((candidate) => {
      const route = candidate.route;
      return route && route.methods?.[method] && typeof route.path === 'string' && matchRoute(route.path, url.pathname);
    });
    if (!layer) return new Response(JSON.stringify({ error: `Fixture route not found: ${method.toUpperCase()} ${url.pathname}` }), { status: 404, headers: { 'Content-Type': 'application/json' } });

    const params = matchRoute(layer.route.path, url.pathname) || {};
    const headers = Object.fromEntries(new Headers(init.headers || (input instanceof Request ? input.headers : undefined)).entries());
    let body: any = undefined;
    const rawBody = init.body ?? (input instanceof Request ? await input.clone().text() : undefined);
    if (typeof rawBody === 'string' && rawBody) {
      try { body = JSON.parse(rawBody); } catch { body = rawBody; }
    }
    const req: any = { method: method.toUpperCase(), path: url.pathname, params, query: Object.fromEntries(url.searchParams.entries()), headers, body };
    let response: Response | undefined;
    const res: any = {
      statusCode: 200,
      status(code: number) { this.statusCode = code; return this; },
      json(payload: unknown) {
        response = new Response(JSON.stringify(payload), { status: this.statusCode, headers: { 'Content-Type': 'application/json' } });
        return this;
      },
    };
    const next = () => { if (!response) response = new Response(JSON.stringify({ error: 'Fixture route passed to next()' }), { status: 404, headers: { 'Content-Type': 'application/json' } }); };
    for (const routeLayer of layer.route.stack) await routeLayer.handle(req, res, next);
    return response || new Response(null, { status: res.statusCode || 204 });
  };
  globalThis.fetch = fixtureFetch;

  try {
    await run(baseUrl, calls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('LoRA submission transparency', () => {
  const objectArray = { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } } } };
  async function submitLoras(properties: any, loras: any[], check: (status: number, data: any, sent: any[]) => void, body: any = {}) {
    const sent: any[] = [];
    await withFixture(async (_url, init) => {
      if (init?.method === 'POST') { sent.push(JSON.parse(String(init.body))); return json({ data: { id: 'task' } }); }
      return json({ data: [{ model_id: 'fixture/model', api_schema: { api_schemas: [{ type: 'model_run', method: 'POST', api_path: '/api/v3/fixture/model', server: 'https://api.wavespeed.ai', request_schema: { properties } }] } }] });
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/schema-provider/wavespeed/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'fixture/model', prompt: 'mountain valley in watercolor, panoramic composition', loras, ...body }) });
      check(response.status, await response.json(), sent);
    });
  }
  it.each([false, true])('keeps explicit default-target entries exactly once and in input order (mixed=%s)', async (mixed) => {
    const loras = [{ target_field: 'loras', path: 'https://example.invalid/a', strength: 0.4 }, ...(mixed ? [{ path: 'https://example.invalid/b', strength: 0 }, { target_field: 'other_loras', path: 'https://example.invalid/c', strength: 0.8 }, { target_field: 'loras', path: 'https://example.invalid/d', strength: 0.6 }] : [])];
    await submitLoras({ loras: objectArray, other_loras: objectArray }, loras, (status, data, sent) => {
      expect(status).toBe(200);
      expect(sent[0].loras).toEqual([{ path: 'https://example.invalid/a', scale: 0.4 }, ...(mixed ? [{ path: 'https://example.invalid/b', scale: 0 }, { path: 'https://example.invalid/d', scale: 0.6 }] : [])]);
      if (mixed) expect(sent[0].other_loras).toEqual([{ path: 'https://example.invalid/c', scale: 0.8 }]);
      expect(data.actualRequest.mapping.find((m: any) => m.to === 'loras').value).toEqual(sent[0].loras);
    });
  });
  it('maps a string URL into the declared object item resource property', async () => {
    await submitLoras({ loras: objectArray }, ['https://example.invalid/style.safetensors'], (status, _data, sent) => {
      expect(status).toBe(200);
      expect(sent[0].loras).toEqual([{ path: 'https://example.invalid/style.safetensors' }]);
    });
  });
  it.each([0, 0.25])('preserves lora_strength=%s for unresolved candidates', async (strength) => {
    await submitLoras({ loras: objectArray }, [{ name: 'foreign.safetensors', air: 'urn:air:flux1:lora:civitai:1@2', lora_strength: strength }], (status, _data, sent) => {
      expect(status).toBe(200);
      expect(sent[0].loras).toEqual([{ path: 'foreign.safetensors', scale: strength }]);
    });
  });
  it.each(['lora_url', 'model_id'])('sends one explicitly targeted %s as its declared string shape', async (target) => {
    await submitLoras({ [target]: { type: 'string' }, lora_weight: { type: 'number' } }, [{ target_field: target, path: 'https://example.invalid/style', lora_strength: 0 }], (status, _data, sent) => {
      expect(status).toBe(200);
      expect(sent[0][target]).toBe('https://example.invalid/style');
      if (target === 'lora_url') expect(sent[0].lora_weight).toBe(0);
    });
  });
  it.each([false, true])('rejects multiple LoRAs targeting a scalar without sending (explicit=%s)', async (explicit) => {
    const loras = ['a', 'b'].map(name => ({ name, ...(explicit ? { target_field: 'lora_url' } : {}) }));
    await submitLoras({ lora_url: { type: 'string' } }, loras, (status, data, sent) => {
      expect(status).toBe(400);
      expect(sent).toEqual([]);
      expect(data.errorSource).toBe('local');
      expect(data.error).toContain('lora_url');
      expect(data.proposedRequest.mapping.flatMap((m: any) => m.unmappedLoras || [])).toHaveLength(2);
    });
  });
  it.each([null, 12, false, [], {}, ''])('diagnoses invalid item %j and never submits a partial LoRA list', async (invalid) => {
    await submitLoras({ loras: objectArray }, [{ path: 'https://example.invalid/valid', strength: 0.3 }, invalid], (status, data, sent) => {
      expect(status).toBe(400);
      expect(sent).toEqual([]);
      expect(data.errorSource).toBe('local');
      expect(data.proposedRequest.mapping.flatMap((m: any) => m.unmappedLoras || [])).toEqual(expect.arrayContaining([expect.objectContaining({ item: invalid, reason: expect.any(String) })]));
    });
  });
  it('does not redirect an undeclared explicit target to the default array', async () => {
    await submitLoras({ loras: objectArray }, [{ target_field: 'missing_loras', path: 'https://example.invalid/a' }], (status, data, sent) => {
      expect(status).toBe(400);
      expect(sent).toEqual([]);
      expect(data.error).toContain('missing_loras');
    });
  });
  it('preserves a declared scalar object target instead of wrapping it in an array', async () => {
    await submitLoras({ adapter: objectArray.items }, [{ target_field: 'adapter', path: 'https://example.invalid/style', strength: 0 }], (status, _data, sent) => {
      expect(status).toBe(200);
      expect(sent[0].adapter).toEqual({ path: 'https://example.invalid/style', scale: 0 });
    });
  });
  it('does not overwrite a filled scalar target with a LoRA', async () => {
    await submitLoras({ model_id: { type: 'string' } }, [{ target_field: 'model_id', name: 'style' }], (status, data, sent) => {
      expect(status).toBe(400);
      expect(sent).toEqual([]);
      expect(data.error).toContain('model_id');
      expect(data.error).toContain('冲突');
    }, { custom_parameters: { model_id: 'selected-model' } });
  });
  it('keeps a scalar LoRA and a separately targeted array with their own strengths', async () => {
    await submitLoras({ lora_url: { type: 'string' }, lora_weight: { type: 'number' }, other_loras: objectArray }, [{ target_field: 'lora_url', path: 'https://example.invalid/a', lora_strength: 0 }, { target_field: 'other_loras', path: 'https://example.invalid/b', strength: 0.6 }], (status, _data, sent) => {
      expect(status).toBe(200);
      expect(sent[0]).toMatchObject({ lora_url: 'https://example.invalid/a', lora_weight: 0, other_loras: [{ path: 'https://example.invalid/b', scale: 0.6 }] });
    });
  });
  it('refuses an explicit LoRA targeting a late-bound provider model selector instead of overwriting it', async () => {
    const sent: any[] = [];
    await withFixture(async (url, init) => {
      if (init?.method === 'POST') { sent.push(JSON.parse(String(init.body))); return json({ data: [{ url: 'https://example.invalid/out.png' }] }); }
      if (url.includes('/models')) return json({ data: [{ id: 'fixture', info: { docsJson: 'https://api.aimlapi.com/docs-json?model=fixture' } }] });
      return json({ paths: { '/v1/images/generations': { post: { requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { model: { type: 'string' }, loras: objectArray } } } } } } } } });
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/schema-provider/aimlapi/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'fixture', prompt: 'A mountain valley in watercolor, panoramic composition', loras: [{ target_field: 'model', name: 'chosen-lora', strength: 0.4 }] }) });
      const data = await response.json() as any;
      expect(response.status).toBe(400);
      expect(sent).toEqual([]);
      expect(data.errorSource).toBe('local');
      expect(data.error).toContain('model');
      expect(data.proposedRequest.mapping.flatMap((m: any) => m.unmappedLoras || [])).toHaveLength(1);
    });
  });
  it.each([0, 0.25])('preserves lora_strength=%s on MuAPI documented-field object arrays without item properties', async (strength) => {
    const sent: any[] = [];
    await withFixture(async (url, init) => {
      if (init?.method === 'POST') { sent.push(JSON.parse(String(init.body))); return json({ request_id: 'muapi-task' }); }
      if (url.endsWith('/api/v1/models')) return json({ models: [{ name: 'flux-lora', endpoint: '/api/v1/flux-lora', endpoint_url: 'flux_lora', group_of: 'image', category: 'Text to Image' }] });
      return json({ paths: { '/api/v1/flux_lora': { post: { requestBody: { content: { 'application/json': { schema: { type: 'object', properties: { prompt: { type: 'string' }, loras: { type: 'array', items: { type: 'object', additionalProperties: true } } } } } } } } } } });
    }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/schema-provider/muapi/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'flux_lora', prompt: 'A mountain valley in watercolor, panoramic composition', loras: [{ path: 'https://example.invalid/style', lora_strength: strength }] }) });
      expect(response.status).toBe(200);
      expect(sent[0].loras).toEqual([{ path: 'https://example.invalid/style', scale: strength }]);
    });
  });
  it('retains schema-declared extra item properties such as trigger_word on candidate fallback items', async () => {
    await submitLoras({ loras: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' }, trigger_word: { type: 'string' } } } } }, [{ name: 'foreign.safetensors', air: 'urn:air:flux1:lora:civitai:1@2', strength: 0.4, trigger_word: 'mountain_watercolor' }], (status, _data, sent) => {
      expect(status).toBe(200);
      expect(sent[0].loras).toEqual([{ path: 'foreign.safetensors', scale: 0.4, trigger_word: 'mountain_watercolor' }]);
    });
  });
  it('accepts nullable JSON Schema scalar type arrays such as ["string", "null"] for lora_url', async () => {
    await submitLoras({ lora_url: { type: ['string', 'null'] }, lora_weight: { type: ['number', 'null'] } }, [{ path: 'https://example.invalid/style', strength: 0.4 }], (status, _data, sent) => {
      expect(status).toBe(200);
      expect(sent[0]).toMatchObject({ lora_url: 'https://example.invalid/style', lora_weight: 0.4 });
    });
  });
  it.each([
    [[{ path: 'https://example.invalid/style', scale: 0.4 }]],
    [[{ path: 'https://example.invalid/override', scale: 0.8 }]],
  ])('preserves existing custom_parameters.loras channel for identical and explicit override arrays (%j)', async (customLoras) => {
    await submitLoras({ loras: objectArray }, [{ path: 'https://example.invalid/style', scale: 0.4 }], (status, data, sent) => {
      expect(status).toBe(200);
      expect(sent[0].loras).toEqual(customLoras);
      expect(data.actualRequest.mapping.find((m: any) => m.from === 'custom_parameters.loras')).toMatchObject({ to: 'loras', value: customLoras, overrides: [{ path: 'https://example.invalid/style', scale: 0.4 }] });
    }, { custom_parameters: { loras: customLoras } });
  });
  const lora = { name: 'foreign-style.safetensors', air: 'urn:air:flux1:lora:civitai:1@2', strength: 0.7 };
  it.each([
    { type: 'array', items: { type: 'string' } },
    { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } } } },
  ])('sends unresolved candidates through the declared LoRA field (%j)', async (field) => {
    await withFixture(async (_url, init) => {
      if (init?.method === 'POST') return json({ error: 'upstream rejected foreign LoRA' }, 422);
      return json({ data: [{ model_id: 'fixture/model', api_schema: { api_schemas: [{ type: 'model_run', method: 'POST', api_path: '/api/v3/fixture/model', server: 'https://api.wavespeed.ai', request_schema: { properties: { loras: field } } }] } }] });
    }, async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/schema-provider/wavespeed/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'fixture/model', prompt: 'cinematic mountain landscape', loras: [lora] }) });
      expect(response.status).toBe(422);
      const data = await response.json() as any;
      const sent = JSON.parse(String(calls.find(c => c.init?.method === 'POST')?.init?.body));
      expect(sent.loras).toEqual(field.items.type === 'string' ? [lora.name] : [{ path: lora.name, scale: 0.7 }]);
      expect(data.actualRequest.mapping.find((m: any) => m.from === 'loras').unmappedLoras).toEqual([expect.objectContaining({ item: lora, reason: expect.any(String) })]);
    });
  });
  it.each(['loras', 'lora_weights', 'lora_list', 'image_loras', 'model_id'])('preserves mixed mapped/unmapped order in the declared %s array', async (target) => {
    const loras = [lora, { path: 'https://example.invalid/native.safetensors', strength: 0.4 }];
    await withFixture(async (_url, init) => init?.method === 'POST' ? json({ data: { id: 'task' } }) : json({ data: [{ model_id: 'fixture/model', api_schema: { api_schemas: [{ type: 'model_run', method: 'POST', api_path: '/api/v3/fixture/model', server: 'https://api.wavespeed.ai', request_schema: { properties: { [target]: { type: 'array', items: { type: 'object', properties: { path: { type: 'string' }, scale: { type: 'number' } } } } } } }] } }] }), async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/schema-provider/wavespeed/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'fixture/model', prompt: 'cinematic mountain landscape', loras }) });
      expect(response.status).toBe(200);
      const sent = JSON.parse(String(calls.find(c => c.init?.method === 'POST')?.init?.body));
      expect(sent[target]).toEqual([{ path: lora.name, scale: 0.7 }, { path: 'https://example.invalid/native.safetensors', scale: 0.4 }]);
      const data = await response.json() as any;
      expect(data.actualRequest.mapping.find((m: any) => m.from === 'loras')).toMatchObject({ to: target, value: sent[target], finalValue: sent[target] });
    });
  });
  it.each([{}, { model_id: { type: 'string' } }])('returns local 400 when the schema has no LoRA field, including scalar model_id (%j)', async (extra) => {
    await withFixture(async () => json({ data: [{ model_id: 'fixture/model', api_schema: { api_schemas: [{ type: 'model_run', method: 'POST', api_path: '/api/v3/fixture/model', server: 'https://api.wavespeed.ai', request_schema: { properties: { prompt: { type: 'string' }, ...extra } } }] } }] }), async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/schema-provider/wavespeed/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'fixture/model', prompt: 'cinematic mountain landscape', loras: [lora, { id: 'native-id', strength: 0.5 }] }) });
      expect(response.status).toBe(400);
      const data = await response.json() as any;
      expect(data.errorSource).toBe('local');
      expect(data.blockedField.field).toBe('loras');
      expect(data.proposedRequest.mapping.find((m: any) => m.from === 'loras').unmappedLoras).toHaveLength(2);
      expect(calls.some(c => c.init?.method === 'POST')).toBe(false);
    });
  });
});

describe('Sogni LoRA catalog covers', () => {
  const example=(caption:string,isMature=false)=>({url:`https://cdn.sogni.ai/ComfyUI/lora-examples/x_${caption}.jpg`,caption,isMature});
  it('uses an upstream positive-strength example, skipping the shared Off baseline, negatives and mature samples', () => {
    expect(sogniLoraCover({ui:{examples:[example('-2'),example('Off'),example('+1',true),example('+3')]}})).toEqual({url:'https://cdn.sogni.ai/ComfyUI/lora-examples/x_+3.jpg',caption:'+3'});
    expect(sogniLoraCover({ui:{examples:[example('Off'),example('-1')]}})?.caption).toBe('-1');
  });
  it('leaves the cover empty when upstream has no usable example', () => {
    expect(sogniLoraCover({ui:{examples:[example('Off'),example('+1',true)]}})).toBeUndefined();
    const [item]=normalizeSchemaProviderItems('sogni',[{loraId:'h3-better-motion',name:'Better Motion',ui:{}}],{lora:true,sourceUrl:'https://api.sogni.ai/v1/loras/comfy'});
    expect(item.imageUrl).toBe('');
  });
  it('maps compatible models, creator and source page from the Sogni row', () => {
    const [item]=normalizeSchemaProviderItems('sogni',[{loraId:'krea2-detail-enhancer',name:'Detail Enhancer',compatibleModels:[{modelId:'a',name:'Krea 2 Turbo'},{modelId:'b',name:'Dark Beast Krea 2 v3'}],ui:{creator:'alcaitiff',sourceUrl:'https://civitai.com/models/2729908',default:1,examples:[example('+1')]}}],{lora:true,sourceUrl:'https://api.sogni.ai/v1/loras/comfy'});
    // Card/chip shows first compatible name only; count lives in baseModelSource tooltip.
    expect(item).toMatchObject({id:'krea2-detail-enhancer',baseModel:'Krea 2 Turbo',creator:'alcaitiff',externalUrl:'https://civitai.com/models/2729908',imageCaption:'+1'});
    expect(String(item.baseModelSource||'')).toMatch(/可兼容底模共 2 个/);
    expect(item.imageUrl).toContain('cdn.sogni.ai');
  });
  it('skips shared baseline_off frames and prefers the strongest positive example', () => {
    const cover=sogniLoraCover({ui:{default:1,examples:[
      {url:'https://cdn.sogni.ai/ComfyUI/lora-examples/baseline_off.jpg',caption:'Off'},
      {url:'https://cdn.sogni.ai/ComfyUI/lora-examples/a_pos3.jpg',caption:'+3'},
      {url:'https://cdn.sogni.ai/ComfyUI/lora-examples/a_pos1.jpg',caption:'+1'},
    ]}});
    expect(cover).toEqual({url:'https://cdn.sogni.ai/ComfyUI/lora-examples/a_pos3.jpg',caption:'+3'});
  });
  it('tags personal-… rows as 我的个人 LoRA and keeps public badge for comfy ids', () => {
    expect(isSogniPersonalLoraRow({loraId:'personal-abc',ui:{category:'personal'}})).toBe(true);
    expect(isSogniPersonalLoraRow({loraId:'krea2-detail-enhancer'})).toBe(false);
    const [mine,pub]=normalizeSchemaProviderItems('sogni',[
      {loraId:'personal-abc',name:'My style',modelIds:['krea2_turbo_fp8_scaled'],ui:{category:'personal',default:1}},
      {loraId:'krea2-detail-enhancer',name:'Detail Enhancer',ui:{}},
    ],{lora:true,sourceUrl:'https://api.sogni.ai/v1/loras/comfy'});
    expect(mine).toMatchObject({id:'personal-abc',badge:'我的个人 LoRA',baseModel:'krea2_turbo_fp8_scaled'});
    expect(pub.badge).toBe('官方 LoRA 资源');
  });
});

describe('Sogni LoRA strength ranges', () => {
  it('uses only complete numeric ranges from exact catalog rows and accepts both inclusive boundaries', () => {
    const rows=[{loraId:'bipolar',ui:{min:-3,max:5,step:0.1}},{loraId:'personal-owned',ui:{min:0.2,max:1}}];
    expect(sogniLoraStrengthRange(rows[0])).toEqual({min:-3,max:5,step:0.1});
    expect(validateSogniLoraStrengthRanges(['bipolar','personal-owned'],[-3,1],rows)).toMatchObject({
      checked:[{id:'bipolar',minimum:-3,maximum:5},{id:'personal-owned',minimum:0.2,maximum:1}],unknown:[],violations:[],
    });
  });
  it('flags only values beyond the returned per-LoRA bounds; it does not clamp them', () => {
    const result=validateSogniLoraStrengthRanges(['a','b'],[5.01,-2],[
      {loraId:'a',ui:{min:-2,max:5}},
      {loraId:'b',ui:{min:-1,max:3}},
    ]);
    expect(result.violations).toEqual([
      {id:'a',strength:5.01,minimum:-2,maximum:5},
      {id:'b',strength:-2,minimum:-1,maximum:3},
    ]);
  });
  it('leaves unmatched IDs and incomplete or malformed catalog ranges unknown without inventing bounds', () => {
    const rows=[
      {loraId:'partial',ui:{min:-1}},
      {loraId:'reversed',ui:{min:2,max:-2}},
      {loraId:'string-range',ui:{min:'-1',max:'1'}},
    ];
    expect(sogniLoraStrengthRange(rows[0])).toBeUndefined();
    const result=validateSogniLoraStrengthRanges(['personal-abc','partial','reversed','string-range'],[50,50,50,50],rows);
    expect(result.checked).toEqual([]);
    expect(result.violations).toEqual([]);
    expect(result.unknown).toHaveLength(4);
  });
  it('uses the official omitted-array default only when the entire strength array is absent', () => {
    expect(validateSogniLoraStrengthRanges(['a'],undefined,[{loraId:'a',ui:{min:2,max:4}}]).violations)
      .toEqual([{id:'a',strength:1,minimum:2,maximum:4}]);
    expect(validateSogniLoraStrengthRanges(['a'],[],[{loraId:'a',ui:{min:2,max:4}}]).unknown[0].reason)
      .toMatch(/缺少对应位置/);
    const nullValue=validateSogniLoraStrengthRanges(['a'],[null],[{loraId:'a',ui:{min:-1,max:1}}]);
    expect(nullValue.violations).toEqual([]);
    expect(nullValue.unknown[0].reason).toMatch(/JSON number/);
  });
});

describe('Sogni public LoRA catalog (comfy only)', () => {
  const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
  it('returns only GET /v1/loras/comfy rows and never calls personal endpoints', async () => {
    await withFixture(async (url) => {
      if (url.includes('/v1/loras/comfy')) return json({status:'success',data:[{loraId:'krea2-detail-enhancer',name:'Detail Enhancer',ui:{}}]});
      if (url.includes('/v1/loras/personal')) throw new Error(`personal must not be called: ${url}`);
      throw new Error(`unexpected ${url}`);
    }, async (baseUrl, calls) => {
      const res = await (await fetch(`${baseUrl}/api/models?provider=sogni&type=lora&limit=50`)).json() as any;
      const rows = res.sogni || res.results?.sogni || [];
      expect(rows.some((r:any)=>r.id==='krea2-detail-enhancer')).toBe(true);
      expect(rows.every((r:any)=>r.badge==='官方 LoRA 资源')).toBe(true);
      expect(res.personalNotice).toBeFalsy();
      expect(res.personalLibrary).toBeFalsy();
      expect(calls.every(c=>c.url.includes('/v1/loras/comfy'))).toBe(true);
      expect(calls.some(c=>c.url.includes('/v1/loras/personal'))).toBe(false);
    }, () => 'test-sogni-key');
  });
});

describe('Sogni live hosted-tool Schema',()=>{
  it('builds selector rows and generation schema from the official live document without sending a Sogni key to GitHub',async()=>{
    await withFixture(async(url,init)=>{
      if(url==='https://api.sogni.ai/v1/model-catalog?mediaType=image&include=parameters')return json({data:{models:[{id:'krea2_turbo_fp8_scaled',name:'Krea 2 Turbo worker'}]}});
      if(init?.method==='POST'&&url==='https://api.sogni.ai/v1/creative-agent/workflows')return json({data:{workflow:{workflowId:'live-selector-task'}}},201);
      throw new Error(`Unexpected fixture URL: ${url}`);
    },async(baseUrl,calls)=>{
      const catalogResponse=await fetch(`${baseUrl}/api/models?provider=sogni`,{headers:{'x-sogni-key':'sogni-secret'}});
      const catalog=await catalogResponse.json() as any;
      expect(catalog.sogni.some((row:any)=>row.id==='flux-3-klein')).toBe(true);
      expect(catalog.pagination.sogni.sourceUrl).toBe(sogniSchemaSource);
      expect(catalog.pagination.sogni.sourceNotice).toBe('live-official-generate_image-schema');

      const schemaResponse=await fetch(`${baseUrl}/api/model-schema?provider=sogni&model=flux-3-klein`,{headers:{'x-sogni-key':'sogni-secret'}});
      const schema=await schemaResponse.json() as any;
      expect(schema.inputSchema.properties.model.enum).toContain('flux-3-klein');
      expect(schema.sourceUrl).toBe(sogniSchemaSource);

      const submitResponse=await fetch(`${baseUrl}/api/schema-provider/sogni/submit`,{
        method:'POST',headers:{'Content-Type':'application/json','x-canvas-credential-ref':schema.credentialRef},
        body:JSON.stringify({model:'flux-3-klein',prompt:'live schema test',custom_parameters:{guidance:7.25}}),
      });
      const submitted=await submitResponse.json() as any;
      expect(submitted.taskId).toBe('live-selector-task');
      expect(submitted.actualRequest.parameters.input.steps[0].toolName).toBe('generate_image');
      expect(submitted.actualRequest.parameters.input.steps[0].arguments).toMatchObject({model:'flux-3-klein',guidance:7.25});
      expect(submitted.actualRequest.parameters.input.steps[0].arguments).not.toHaveProperty('videoModel');

      const githubCalls=calls.filter(c=>c.url===sogniSchemaSource);
      expect(githubCalls.length).toBeGreaterThanOrEqual(2);
      for(const call of githubCalls){
        expect(call.meta).toMatchObject({provider:'sogni',key:''});
        const headers=new Headers(call.init?.headers);
        expect(headers.has('authorization')).toBe(false);
        expect(headers.has('x-sogni-key')).toBe(false);
      }
      const submitCall=calls.find(c=>c.url==='https://api.sogni.ai/v1/creative-agent/workflows');
      expect(submitCall?.meta?.key).toBe('sogni-secret');
      expect(new Headers(submitCall?.init?.headers).get('authorization')).toBe('Bearer sogni-secret');

      const workersResponse=await fetch(`${baseUrl}/api/models?provider=sogni&catalog=workers`,{headers:{'x-sogni-key':'sogni-secret'}});
      const workers=await workersResponse.json() as any;
      expect(workers.sogni.map((row:any)=>row.id)).toEqual(['krea2_turbo_fp8_scaled']);
      expect(workers.pagination.sogni.sourceUrl).toContain('/v1/model-catalog');
      expect(workers.sogni.some((row:any)=>row.id==='flux-3-klein')).toBe(false);
    },()=> 'sogni-secret');
  });

  it('reports official-schema HTTP failure without selectors or a generation request; it never falls back to the bundled package',async()=>{
    await withFixture(async()=>{throw new Error('generation endpoint must not be reached');},async(baseUrl,calls)=>{
      const catalogResponse=await fetch(`${baseUrl}/api/models?provider=sogni`,{headers:{'x-sogni-key':'sogni-secret'}});
      const catalog=await catalogResponse.json() as any;
      expect(catalogResponse.status).toBe(503);
      expect(catalog.error).toContain('HTTP 503');
      expect(catalog.rawResponse).toBe('official schema temporarily unavailable');
      expect(catalog.endpoint).toBe(sogniSchemaSource);
      expect(catalog.sogni).toBeUndefined();

      const submitResponse=await fetch(`${baseUrl}/api/schema-provider/sogni/submit`,{method:'POST',headers:{'Content-Type':'application/json','x-sogni-key':'sogni-secret'},body:JSON.stringify({model:'krea-2-turbo',prompt:'must not submit'})});
      const submit=await submitResponse.json() as any;
      expect(submitResponse.status).toBe(503);
      expect(submit.endpoint).toBe(sogniSchemaSource);
      expect(calls.some(c=>c.url==='https://api.sogni.ai/v1/creative-agent/workflows')).toBe(false);
      expect(calls.every(c=>c.url===sogniSchemaSource)).toBe(true);
      expect(calls.every(c=>c.meta?.key==='')).toBe(true);
    },()=> 'sogni-secret',undefined,undefined,async()=>new Response('official schema temporarily unavailable',{status:503}));
  });

  it('exposes network failure as network error and does not retry or use a stale Schema',async()=>{
    let meta:any;let init:RequestInit|undefined;
    const error=await fetchSogniGenerateImageSchema(async(m,_url,i)=>{meta=m;init=i;throw new Error('socket refused');},'/test','flux-3-klein').then(()=>null,e=>e);
    expect(error).toMatchObject({status:502,errorSource:'network',endpoint:sogniSchemaSource});
    expect(error.message).toContain('no HTTP response was received');
    expect(meta).toMatchObject({provider:'sogni',key:''});
    expect(new Headers(init?.headers).has('authorization')).toBe(false);
    expect(new Headers(init?.headers).has('x-sogni-key')).toBe(false);
  });

  it('T2V submit uses the live generate_video Schema: toolName from $id, videoModel, never generate_image', async()=>{
    await withFixture(async(url,init)=>{
      if(init?.method==='POST'&&url==='https://api.sogni.ai/v1/creative-agent/workflows')return json({data:{workflow:{workflowId:'video-t2v'}}},201);
      throw new Error(`Unexpected fixture URL: ${url}`);
    },async(baseUrl,calls)=>{
      const schemaResponse=await fetch(`${baseUrl}/api/model-schema?provider=sogni&model=ltx25&isVideo=true`,{headers:{'x-sogni-key':'sogni-secret'}});
      const schema=await schemaResponse.json() as any;
      expect(schema.schemaStatus).toBe('hosted-tool:generate_video');
      expect(schema.hostedToolName).toBe('generate_video');
      expect(schema.selectorField).toBe('videoModel');
      expect(schema.inputSchema.properties.videoModel.enum).toContain('ltx25');
      expect(schema.inputSchema.properties.model).toBeUndefined();
      expect(schema.sourceUrl).toBe(sogniGenerateVideoSchemaSource);

      const catalogResponse=await fetch(`${baseUrl}/api/models?provider=sogni&category=video`,{headers:{'x-sogni-key':'sogni-secret'}});
      const catalog=await catalogResponse.json() as any;
      expect(catalog.sogni.some((row:any)=>row.id==='ltx25')).toBe(true);
      expect(catalog.sogni.some((row:any)=>row.id==='flux-3-klein')).toBe(false);
      expect(catalog.pagination.sogni.sourceUrl).toBe(sogniGenerateVideoSchemaSource);
      expect(catalog.pagination.sogni.sourceNotice).toBe('live-official-generate_video-schema');

      const submitResponse=await fetch(`${baseUrl}/api/schema-provider/sogni/submit`,{
        method:'POST',headers:{'Content-Type':'application/json','x-canvas-credential-ref':schema.credentialRef},
        body:JSON.stringify({model:'ltx25',prompt:'a paper boat',duration:5,isVideo:true}),
      });
      const submitted=await submitResponse.json() as any;
      expect(submitResponse.status).toBe(201);
      const step=submitted.actualRequest.parameters.input.steps[0];
      expect(step.toolName).toBe('generate_video');
      expect(step.id).toBe('clip');
      expect(step.arguments).toMatchObject({prompt:'a paper boat',videoModel:'ltx25',duration:5});
      expect(step.arguments).not.toHaveProperty('model');
      expect(JSON.stringify(submitted.actualRequest.parameters)).not.toContain('generate_image');
      expect(calls.filter(c=>c.url===sogniGenerateVideoSchemaSource).length).toBeGreaterThanOrEqual(1);
      expect(calls.some(c=>c.url===sogniSchemaSource && c.init?.method==='POST')).toBe(false);
    },()=> 'sogni-secret');
  });

  it('I2V submit uses the live animate_photo Schema: toolName from $id and sourceImageIndex, never generate_image', async()=>{
    await withFixture(async(url,init)=>{
      if(init?.method==='POST'&&url==='https://api.sogni.ai/v1/creative-agent/workflows')return json({data:{workflow:{workflowId:'video-i2v'}}},201);
      throw new Error(`Unexpected fixture URL: ${url}`);
    },async(baseUrl)=>{
      const submitResponse=await fetch(`${baseUrl}/api/schema-provider/sogni/submit`,{
        method:'POST',headers:{'Content-Type':'application/json','x-sogni-key':'sogni-secret'},
        body:JSON.stringify({model:'ltx25',prompt:'slow dolly in',duration:5,isVideo:true,image_url:'https://cdn.example/frame.png'}),
      });
      const submitted=await submitResponse.json() as any;
      expect(submitResponse.status).toBe(201);
      const step=submitted.actualRequest.parameters.input.steps[0];
      expect(step.toolName).toBe('animate_photo');
      expect(step.arguments).toMatchObject({prompt:'slow dolly in',videoModel:'ltx25',sourceImageIndex:-1});
      expect(step.arguments).not.toHaveProperty('model');
      expect(submitted.actualRequest.parameters.media_references).toEqual([{kind:'image',url:'https://cdn.example/frame.png'}]);
      expect(JSON.stringify(submitted.actualRequest.parameters)).not.toContain('generate_image');
    },()=> 'sogni-secret');
  });

  it('does not reuse a remembered image Schema when the video node submits', async()=>{
    await withFixture(async(url,init)=>{
      if(init?.method==='POST'&&url==='https://api.sogni.ai/v1/creative-agent/workflows')return json({data:{workflow:{workflowId:'after-image'}}},201);
      throw new Error(`Unexpected fixture URL: ${url}`);
    },async(baseUrl,calls)=>{
      await fetch(`${baseUrl}/api/model-schema?provider=sogni&model=ltx25`,{headers:{'x-sogni-key':'sogni-secret'}});
      const submitResponse=await fetch(`${baseUrl}/api/schema-provider/sogni/submit`,{
        method:'POST',headers:{'Content-Type':'application/json','x-sogni-key':'sogni-secret'},
        body:JSON.stringify({model:'ltx25',prompt:'must be video tool',duration:5,isVideo:true}),
      });
      const submitted=await submitResponse.json() as any;
      const step=submitted.actualRequest.parameters.input.steps[0];
      expect(step.toolName).toBe('generate_video');
      expect(step.arguments.videoModel).toBe('ltx25');
      expect(JSON.stringify(step)).not.toContain('generate_image');
      expect(calls.some(c=>c.url===sogniGenerateVideoSchemaSource)).toBe(true);
    },()=> 'sogni-secret');
  });
});

describe('schema provider server contract', () => {

  it('binds schema, submit, and poll to one credential reference instead of rotating accounts', async () => {
    let keyCalls = 0;
    const selectedKeys = ['account-a', 'account-b', 'account-c'];
    await withFixture(async (url, init) => {
      if (url.endsWith('/api/v1/models')) return json({models:[{name:'flux-dev-lora',endpoint:'/api/v1/flux-dev-lora',endpoint_url:'flux_dev_lora_image',group_of:'image',category:'Training'}]});
      if (url.endsWith('/openapi.json')) return json({paths:{'/api/v1/flux_dev_lora_image':{post:{requestBody:{content:{'application/json':{schema:{type:'object',properties:{prompt:{type:'string'}}}}}}}}}});
      if (init?.method==='POST' && url.endsWith('/api/v1/flux_dev_lora_image')) return json({request_id:'bound-task'});
      if (url.endsWith('/api/v1/predictions/bound-task/result')) return json({status:'completed',outputs:['https://fixture.invalid/output.png']});
      throw new Error(`Unexpected fixture route: ${url}`);
    }, async (baseUrl,calls) => {
      const schemaResponse=await fetch(`${baseUrl}/api/model-schema?provider=muapi&model=flux_dev_lora_image`);
      const schema=await schemaResponse.json() as any;
      expect(schema.credentialRef).toMatch(/^[0-9a-f-]{36}$/i);

      const submitResponse=await fetch(`${baseUrl}/api/schema-provider/muapi/submit`,{method:'POST',headers:{'Content-Type':'application/json','x-canvas-credential-ref':schema.credentialRef},body:JSON.stringify({model:'flux_dev_lora_image',prompt:'bound account'})});
      const submitted=await submitResponse.json() as any;
      expect(submitted.credentialRef).toBe(schema.credentialRef);

      const pollResponse=await fetch(`${baseUrl}${submitted.pollUrl}`,{headers:{'x-canvas-credential-ref':schema.credentialRef}});
      const polled=await pollResponse.json() as any;
      expect(polled).toMatchObject({status:'completed',credentialRef:schema.credentialRef});
      expect(keyCalls).toBe(1);
      // clean-1333 #4: submit reuses the Schema read by /api/model-schema (schemaRead.reused) → 2 schema GETs + POST + poll.
      expect(submitted.schemaRead).toMatchObject({fetched:false,reused:true});
      expect(calls.length).toBe(4);
      for (const call of calls) expect((call.init?.headers as Record<string,string> | undefined)?.['x-api-key']).toBe('account-a');
    }, (_provider,override) => override || selectedKeys[keyCalls++ % selectedKeys.length]);
  });

  it('refuses an unknown credential reference instead of silently choosing another key', async () => {
    let keyCalls=0;
    await withFixture(async () => { throw new Error('upstream must not be called'); }, async (baseUrl) => {
      const response=await fetch(`${baseUrl}/api/schema-provider/muapi/submit`,{method:'POST',headers:{'Content-Type':'application/json','x-canvas-credential-ref':'expired-ref'},body:JSON.stringify({model:'flux_dev_lora_image',prompt:'must not rotate'})});
      const body=await response.json() as any;
      expect(response.status).toBe(409);
      expect(body.errorSource).toBe('local');
      expect(body.error).toContain('未自动切换 Key');
      expect(keyCalls).toBe(0);
    },()=>{keyCalls++;return 'fallback-key';});
  });

  it('rejects private Sogni reference URLs without pretending they were uploaded', () => {
    expect(upstreamReferenceUrlIssue('data:image/png;base64,abc')).toContain('HTTP');
    expect(upstreamReferenceUrlIssue('/private/history.png')).toContain('HTTP');
    expect(upstreamReferenceUrlIssue('http://127.0.0.1:3000/private.png')).toContain('本机');
    expect(upstreamReferenceUrlIssue('http://192.168.1.20/ref.png')).toContain('私有');
    expect(upstreamReferenceUrlIssue('https://cdn.example.com/ref.png')).toBeUndefined();
  });

  it('resolves nested and escaped JSON Schema $refs while retaining sibling properties', () => {
    const schema = {
      definitions: {
        'image/input': { type: 'object', properties: { prompt: { type: 'string' } } },
        request: { allOf: [{ $ref: '#/definitions/image~1input' }], required: ['prompt'] },
      },
      paths: { '/generate': { post: { schema: { $ref: '#/definitions/request' } } } },
    };
    expect(resolveSchemaRefs(schema.paths['/generate'].post.schema, schema)).toMatchObject({
      allOf: [{ type: 'object', properties: { prompt: { type: 'string' } } }],
      required: ['prompt'],
    });
  });

  it('does not treat an HTTP 200 business error as a submitted task', async () => {
    await withFixture(async (url, init) => {
      if (url.endsWith('/v1/model-catalog?mediaType=image&include=parameters')) {
        return json({ data: { models: [{ id: 'worker-model', name: 'Worker model' }] } });
      }
      if (init?.method === 'POST') return json({ code: 403, message: 'organization is not authorized' });
      throw new Error(`Unexpected fixture route: ${url}`);
    }, async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/schema-provider/sogni/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'worker-model', prompt: 'fixture prompt' }),
      });
      const body = await response.json() as Record<string, unknown>;
      expect(response.status).toBe(200);
      expect(body.ok).toBe(false);
      expect(body.error).toContain('organization is not authorized');
      expect(JSON.parse(String(body.rawResponse))).toMatchObject({ code: 403 });
      expect(body).not.toHaveProperty('taskId');
      expect(calls.filter((call) => call.init?.method === 'POST')).toHaveLength(1);
    });
  });

  it('awaits an asynchronous history record instead of returning an unresolved promise', async () => {
    const recorded: unknown[] = [];
    await withFixture(async () => { throw new Error('upstream must not be called during save-result'); }, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/schema-provider/wavespeed/save-result`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputs: ['https://fixture.invalid/one.png'], metadata: { model: 'fixture-model', prompt: 'fixture' } }),
      });
      expect(response.status).toBe(200);
      const body = await response.json() as any;
      expect(body.historyItems).toEqual([{ id: 'recorded-fixture', url: 'https://fixture.invalid/one.png' }]);
      expect(body.transientOutputs).toEqual([]);
      expect(recorded).toHaveLength(1);
    }, undefined, async (url) => ({ ok: true, dataUrl: url }), async (item) => {
      await Promise.resolve();
      recorded.push(item);
      return { id: 'recorded-fixture', url: item.url };
    });
  });

  it('keeps upstream generation success while reporting partial multi-image persistence failures', async () => {
    const saved: string[] = [];
    await withFixture(async () => { throw new Error('upstream must not be called during save-result'); }, async (baseUrl, calls) => {
      const response = await fetch(`${baseUrl}/api/schema-provider/wavespeed/save-result`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ outputs: ['https://fixture.invalid/one.png', 'https://fixture.invalid/two.png'], metadata: { model: 'fixture-model', prompt: 'fixture' } }),
      });
      expect(response.status).toBe(200);
      const body = await response.json() as any;
      expect(body.historyItems).toHaveLength(1);
      expect(body.historyItems[0]).toMatchObject({ url: 'data:image/png;base64,one', provider: 'WaveSpeed' });
      expect(body.historyWarning).toContain('部分图片保存失败');
      expect(body.transientOutputs).toHaveLength(1);
      expect(body.transientOutputs[0]).toMatchObject({ url: 'https://fixture.invalid/two.png', error: 'fixture storage denied' });
      expect(saved).toEqual(['https://fixture.invalid/one.png', 'https://fixture.invalid/two.png']);
      expect(calls).toHaveLength(0);
    }, undefined, async (url) => {
      saved.push(url);
      return url.endsWith('/one.png')
        ? { ok: true, dataUrl: 'data:image/png;base64,one' }
        : { ok: false, status: 403, message: 'fixture storage denied', errorSource: 'upstream' };
    });
  });

  it('maps Sogni LoRAs in original order and parametersOnly submits only custom JSON, prompt, and model', async () => {
    const submittedBodies: unknown[] = [];
    await withFixture(async (url, init) => {
      if (url.endsWith('/v1/model-catalog?mediaType=image&include=parameters')) {
        return json({ data: { models: [{ id: 'krea-2-turbo', name: 'Worker model' }] } });
      }
      if (init?.method === 'POST' && url.endsWith('/v1/creative-agent/workflows')) {
        const body = JSON.parse(String(init.body));
        submittedBodies.push(body);
        return json({ data: { workflow: { workflowId: `task-${submittedBodies.length}` } } }, 201);
      }
      if (url.includes('/v1/creative-agent/workflows/task-')) {
        return json({ data: { workflow: { status: 'completed', steps: [{ artifacts: [{ url: 'https://fixture.invalid/output.png' }] }] } } });
      }
      throw new Error(`Unexpected fixture route: ${url}`);
    }, async (baseUrl, calls) => {
      const standardResponse = await fetch(`${baseUrl}/api/schema-provider/sogni/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'krea-2-turbo', prompt: 'portrait', width: 640,
          loras: [
            { name: 'krea2-detail-enhancer', strength: 0.4 },
            { name: 'krea2-warm-light', strength: 0.9 },
          ],
        }),
      });
      expect(standardResponse.status).toBe(201);
      const standard = await standardResponse.json() as any;
      expect(standard.rawResponse.data.workflow.workflowId).toBe('task-1');
      expect(standard.actualRequest.parameters.input.steps[0].arguments).toMatchObject({
        model: 'krea-2-turbo', prompt: 'portrait', width: 640,
        loras: ['krea2-detail-enhancer', 'krea2-warm-light'],
        loraStrengths: [0.4, 0.9],
      });

      const exactResponse = await fetch(`${baseUrl}/api/schema-provider/sogni/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'krea-2-turbo', prompt: 'only these plus custom', width: 1024,
          loras: [{ name: 'ignored in exact mode', path: 'https://fixture.invalid/ignored', strength: 1 }],
          custom_parameters: { _canvas: { parametersOnly: true }, seed: 13, custom_text: 'literal' },
        }),
      });
      const exact = await exactResponse.json() as any;
      const args = exact.actualRequest.parameters.input.steps[0].arguments;
      expect(args).toEqual({ prompt: 'only these plus custom', seed: 13, custom_text: 'literal', model: 'krea-2-turbo' });
      expect(exact.actualRequest.parametersOnly).toBe(true);
      expect(JSON.stringify(submittedBodies[1])).not.toContain('parametersOnly');

      const taskResponse = await fetch(`${baseUrl}${standard.pollUrl}`);
      const task = await taskResponse.json() as any;
      expect(task).toMatchObject({ status: 'completed', outputs: ['https://fixture.invalid/output.png'], upstreamStatus: 200 });
      expect(task.rawResponse.data.workflow.status).toBe('completed');
      expect(calls.filter((call) => call.init?.method === 'POST' && call.url.endsWith('/v1/creative-agent/workflows'))).toHaveLength(2);
      expect(submittedBodies).toHaveLength(2);
    });
  });

});
