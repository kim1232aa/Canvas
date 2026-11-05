import { describe, expect, it } from 'vitest';
import express from 'express';
import { registerSchemaProviderRoutes } from './schemaProviders';
import { buildOpenWorksRequest, openWorksInputSchema } from './openWorksProvider';
import { ReplicateDriver } from '../engines/drivers/ReplicateDriver';
import { MageDriver } from '../engines/drivers/MageDriver';
import { SenseNovaDriver } from '../engines/drivers/SenseNovaDriver';

describe('Mission M4 regression tests', () => {
  it('1. Sogni polling handles waiting_for_user with insufficient_credit and marks failed with Debit Error', async () => {
    const app = express();
    app.use(express.json());
    const workflowId = 'wf_test_123';

    const mockSogniSchema = {
      type: 'object',
      properties: {
        model: { type: 'string', enum: ['krea-2-turbo', 'z-turbo'] },
        prompt: { type: 'string' },
      },
      required: ['prompt'],
    };

    registerSchemaProviderRoutes(app as any, {
      fetch: async (_m: any, url: string, init?: RequestInit) => {
        if (url.includes('generate_image.schema.json')) {
          return new Response(JSON.stringify(mockSogniSchema), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (init?.method === 'POST') {
          return new Response(JSON.stringify({
            status: 'success',
            data: { workflow: { workflowId } }
          }), { status: 201, headers: { 'Content-Type': 'application/json' } });
        }
        if (url.includes('/workflows/' + workflowId)) {
          return new Response(JSON.stringify({
            status: 'success',
            data: {
              workflow: {
                workflowId,
                status: 'waiting_for_user',
                waitingReason: 'insufficient_credit',
                events: [
                  {
                    type: 'step_failed',
                    message: 'Debit Error: Insufficient funds',
                    data: { errorType: 'COST_LIMIT_EXCEEDED' }
                  }
                ],
                steps: []
              }
            }
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
      key: () => 'test_key',
      record: (i: any) => i,
      durable: async (u: string) => ({ ok: true, dataUrl: u }),
    } as any);

    const server = app.listen(0);
    const port = (server.address() as any).port;

    try {
      // 1. Submit task
      const subRes = await fetch(`http://127.0.0.1:${port}/api/schema-provider/sogni/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'krea-2-turbo', prompt: 'test' })
      });
      const sub = await subRes.json();
      expect(sub.taskId).toBe(workflowId);

      // 2. Poll task
      const pollRes = await fetch(`http://127.0.0.1:${port}/api/schema-provider/sogni/tasks/${workflowId}`, {
        headers: { 'x-canvas-credential-ref': sub.credentialRef }
      });
      const poll = await pollRes.json();

      expect(poll.status).toBe('failed');
      expect(poll.error).toBe('Debit Error: Insufficient funds');
      expect(poll.waitingReason).toBe('insufficient_credit');
    } finally {
      server.close();
    }
  });

  it('2. OpenWorks maps count and defaults result image count to 1 when omitted', () => {
    const mockTool = {
      name: 'photoreal_studio_z_image',
      inputs: [
        { type: 'STRING', description: 'prompt' },
        { type: 'INTEGER', description: 'image width' },
        { type: 'INTEGER', description: 'image height' },
        { type: 'INTEGER', description: 'result image count' }
      ]
    };
    const schema = openWorksInputSchema(mockTool);

    // Prompt, width, height supplied without count
    const res = buildOpenWorksRequest('photoreal_studio_z_image', schema, {
      prompt: 'snow mountain',
      width: 1024,
      height: 1024,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // Verify 4 positional inputs are all filled, including result image count = 1
    expect(res.wire.inputs[0]).toEqual({ type: 'STRING', value: 'snow mountain' });
    expect(res.wire.inputs[1]).toEqual({ type: 'INTEGER', value: 1024 });
    expect(res.wire.inputs[2]).toEqual({ type: 'INTEGER', value: 1024 });
    expect(res.wire.inputs[3]).toEqual({ type: 'INTEGER', value: 1 });

    const countMapping = res.mapping.find(m => m.to === 'result image count');
    expect(countMapping).toBeDefined();
    expect(countMapping?.value).toBe(1);
    expect(countMapping?.sent).toBe(true);
  });

  it('3. ReplicateDriver preserves error status and raw response data on failure', async () => {
    const driver = new ReplicateDriver();
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({
        error: 'Replicate Insufficient credit',
        details: 'You have insufficient credit to run this model',
        upstreamStatus: 402,
      }), { status: 402, headers: { 'Content-Type': 'application/json' } });
    }) as any;

    try {
      await expect(driver.generate({
        model: 'black-forest-labs/flux-schnell',
        prompt: 'test prompt',
      }, {})).rejects.toMatchObject({
        appStatus: 402,
        data: expect.objectContaining({ upstreamStatus: 402 }),
      });
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('4. MageDriver preserves error status and raw response data on failure', async () => {
    const driver = new MageDriver();
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({
        error: { code: 'payment_required', message: 'The Mage API needs payment' },
        status: 402,
      }), { status: 402, headers: { 'Content-Type': 'application/json' } });
    }) as any;

    try {
      await expect(driver.generate({
        model: 'mango-v3',
        prompt: 'test prompt',
      }, {})).rejects.toMatchObject({
        appStatus: 402,
        data: expect.objectContaining({ status: 402 }),
      });
    } finally {
      globalThis.fetch = origFetch;
    }
  });

  it('5. SenseNovaDriver preserves error status and raw response data on failure', async () => {
    const driver = new SenseNovaDriver();
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      return new Response(JSON.stringify({
        error: '未配置 sensenova API 密钥',
        errorSource: 'local',
      }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }) as any;

    try {
      await expect(driver.generate({
        model: 'sensenova-u1.5-lite',
        prompt: 'test prompt',
      }, {})).rejects.toMatchObject({
        appStatus: 400,
        data: expect.objectContaining({ errorSource: 'local' }),
      });
    } finally {
      globalThis.fetch = origFetch;
    }
  });
});
