import express from 'express';
import { describe, expect, it } from 'vitest';
import { registerSchemaProviderRoutes, resolveSchemaRefs, upstreamReferenceUrlIssue } from './schemaProviders';

async function withFixture(
  upstream: (url: string, init?: RequestInit) => Promise<Response>,
  run: (baseUrl: string, calls: Array<{ url: string; init?: RequestInit }>) => Promise<void>,
  key: (provider: string, override?: string) => string = () => '',
  durable: (url: string) => Promise<any> = async (url) => ({ ok: true, dataUrl: url }),
) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const app = express();
  registerSchemaProviderRoutes(app, {
    fetch: async (_meta, url, init) => {
      calls.push({ url, init });
      return upstream(url, init);
    },
    key,
    record: (item) => item,
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

describe('schema provider server contract', () => {
  it('uses the MuAPI execution identifier rather than the display alias, with weighted model objects', async () => {
    await withFixture(async (url, init) => {
      if (url.endsWith('/api/v1/models')) return json({models:[{name:'flux-dev-lora',endpoint:'/api/v1/flux-dev-lora',endpoint_url:'flux_dev_lora_image',group_of:'image',category:'Training'}]});
      if (url.endsWith('/openapi.json')) return json({paths:{'/api/v1/flux_dev_lora_image':{post:{requestBody:{content:{'application/json':{schema:{$ref:'#/components/schemas/Input'}}}}}}},components:{schemas:{Input:{type:'object',properties:{prompt:{type:'string'},width:{type:'integer'},model_id:{type:'array',items:{$ref:'#/components/schemas/ModelItem'}}}},ModelItem:{type:'object',properties:{model:{type:'string'},weight:{type:'number'}},required:['model']}}}});
      if (init?.method==='POST' && url.endsWith('/api/v1/flux_dev_lora_image')) return json({request_id:'weighted-task'});
      throw new Error(`Unexpected fixture route: ${url}`);
    }, async (baseUrl,calls) => {
      const catalog=await (await fetch(`${baseUrl}/api/models?provider=muapi`)).json() as any;
      expect(catalog.muapi[0]).toMatchObject({id:'flux_dev_lora_image',name:'flux-dev-lora'});
      const response=await fetch(`${baseUrl}/api/schema-provider/muapi/submit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'flux_dev_lora_image',prompt:'weighted portrait',width:640,steps:20,loras:[{name:'style',url:'https://fixture.invalid/style.safetensors',strength:0.8}],custom_parameters:{width:768,custom_field:'explicit'}})});
      const body=await response.json() as any;
      expect(body.actualRequest.parameters).toEqual({prompt:'weighted portrait',width:768,model_id:[{model:'https://fixture.invalid/style.safetensors',weight:0.8}],custom_field:'explicit'});
      expect(body.actualRequest.mapping.find((x:any)=>x.from==='steps')).toMatchObject({sent:false,value:20});
      expect(body.actualRequest.mapping.find((x:any)=>x.from==='width')).toMatchObject({value:640,finalValue:768});
      expect(calls.filter(x=>x.init?.method==='POST')).toHaveLength(1);
    });
  });

  it('places Sogni reference images in the workflow envelope and preserves explicit JSON',async()=>{
    await withFixture(async(url,init)=>{
      if(init?.method==='POST' && url.endsWith('/v1/creative-agent/workflows'))return json({data:{workflow:{workflowId:'reference-task'}}},201);
      throw new Error(`Unexpected fixture route: ${url}`);
    },async(baseUrl)=>{
      const response=await fetch(`${baseUrl}/api/schema-provider/sogni/submit`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model:'krea-2-turbo',prompt:'reference portrait',steps:20,image_url:'https://fixture.invalid/reference.png',denoise:0.6,custom_parameters:{seed:0,_canvas:{workflowOptions:{token_type:'spark'}}}})});
      const body=await response.json() as any;
      expect(body.actualRequest.parameters).toEqual({token_type:'spark',media_references:[{kind:'image',url:'https://fixture.invalid/reference.png'}],input:{title:'Canvas · krea-2-turbo',steps:[{id:'image1',toolName:'generate_image',arguments:{prompt:'reference portrait',model:'krea-2-turbo',sourceImageIndex:-1,starting_image_strength:0.6,seed:0}}]}});
      expect(body.actualRequest.mapping.find((x:any)=>x.from==='steps').sent).toBe(false);
    });
  });

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
      expect(calls.length).toBeGreaterThanOrEqual(6);
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
        return json({ data: { models: [{ id: 'worker-model', name: 'Worker model' }] } });
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
          model: 'worker-model', prompt: 'portrait', width: 640,
          loras: [
            { name: 'first', path: 'https://fixture.invalid/first.safetensors', strength: 0.4 },
            { name: 'second', path: 'https://fixture.invalid/second.safetensors', strength: 0.9 },
          ],
        }),
      });
      expect(standardResponse.status).toBe(201);
      const standard = await standardResponse.json() as any;
      expect(standard.rawResponse.data.workflow.workflowId).toBe('task-1');
      expect(standard.actualRequest.parameters.input.steps[0].arguments).toMatchObject({
        model: 'worker-model', prompt: 'portrait', width: 640,
        loras: ['https://fixture.invalid/first.safetensors', 'https://fixture.invalid/second.safetensors'],
        loraStrengths: [0.4, 0.9],
      });

      const exactResponse = await fetch(`${baseUrl}/api/schema-provider/sogni/submit`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'worker-model', prompt: 'only these plus custom', width: 1024,
          loras: [{ name: 'ignored in exact mode', path: 'https://fixture.invalid/ignored', strength: 1 }],
          custom_parameters: { _canvas: { parametersOnly: true }, seed: 13, custom_text: 'literal' },
        }),
      });
      const exact = await exactResponse.json() as any;
      const args = exact.actualRequest.parameters.input.steps[0].arguments;
      expect(args).toEqual({ prompt: 'only these plus custom', seed: 13, custom_text: 'literal', model: 'worker-model' });
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