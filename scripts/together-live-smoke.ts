import express from 'express';
import fs from 'node:fs';
import { registerSchemaProviderRoutes } from '/workspace/canvas/Canvas-main/src/server/schemaProviders.ts';

const env = Object.fromEntries(
  fs.readFileSync('/workspace/canvas/Canvas-main/.env', 'utf8').split('\n')
    .filter((l) => /^TOGETHER_API_KEY=/.test(l))
    .map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);
const KEYS = (env.TOGETHER_API_KEY || '').split(',').map((s: string) => s.trim()).filter(Boolean);
const KEY = KEYS[Number(process.env.TOGETHER_KEY_INDEX || 0)] || '';
const OUT = '/workspace/canvas-e2e-together';
fs.mkdirSync(OUT, { recursive: true });

const app = express();
app.use(express.json());
const history: any[] = [];
registerSchemaProviderRoutes(app, {
  fetch: (_m, u, i) => fetch(u, i),
  key: () => KEY,
  record: (x: any) => { history.push(x); return x; },
  durable: async (url: string) => ({ ok: true, dataUrl: url }),
});

const srv = app.listen(0, async () => {
  const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  const log: any = { keyPresent: Boolean(KEY), keyLen: KEY.length, keyPrefix: KEY ? KEY.slice(0, 4) + '…' : '' };
  const j = async (r: Response) => ({ status: r.status, body: await r.json().catch(() => null) });

  // Key test equivalent: live catalog
  const cat = await j(await fetch(base + '/api/models?provider=together&category=checkpoint&limit=20'));
  log.catalog = {
    status: cat.status,
    count: cat.body?.pagination?.together?.total,
    sample: (cat.body?.together || []).slice(0, 8).map((m: any) => [m.id, m.supportsLora]),
    error: cat.body?.error,
    rawResponse: typeof cat.body?.rawResponse === 'string' ? cat.body.rawResponse.slice(0, 400) : cat.body?.rawResponse,
  };

  const lcat = await j(await fetch(base + '/api/models?provider=together&type=lora&limit=5'));
  log.loraCatalog = {
    status: lcat.status,
    notice: lcat.body?.catalogNotice || lcat.body?.catalogNotices?.together,
    count: lcat.body?.pagination?.together?.total,
    error: lcat.body?.error,
  };

  // LoRA must be refused with 400 (no upstream call) — official serverless image_loras deprecated
  const refuse = await j(await fetch(base + '/api/schema-provider/together/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'black-forest-labs/FLUX.2-dev',
      prompt: 'a lighthouse',
      loras: [{ name: 'https://huggingface.co/example/lora', strength: 0.8 }],
    }),
  }));
  log.loraRefuse = { status: refuse.status, error: refuse.body?.error, errorSource: refuse.body?.errorSource };

  // Paid generate without LoRA (official capability). Prefer FLUX.2-dev from catalog sample.
  const model = (cat.body?.together || []).find((m: any) => /FLUX\.2-dev/i.test(m.id))?.id
    || (cat.body?.together || [])[0]?.id
    || 'black-forest-labs/FLUX.2-dev';
  const sub = await j(await fetch(base + '/api/schema-provider/together/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: 'a lighthouse on a cliff at sunset, watercolor',
      width: 1024,
      height: 1024,
      steps: 4,
      seed: 42,
      loras: [],
    }),
  }));
  log.submit = {
    status: sub.status,
    model,
    taskId: sub.body?.taskId,
    actualRequest: sub.body?.actualRequest,
    error: sub.body?.error,
    rawResponse: typeof sub.body?.rawResponse === 'string' ? sub.body.rawResponse.slice(0, 800) : sub.body?.rawResponse,
    outputs: sub.body?.outputs,
  };

  if (sub.body?.taskId) {
    const p = await j(await fetch(base + sub.body.pollUrl));
    log.poll = {
      status: p.status,
      taskStatus: p.body?.status,
      outputs: p.body?.outputs,
      error: p.body?.error,
      raw: typeof p.body?.rawResponse === 'string' ? p.body.rawResponse.slice(0, 400) : p.body?.rawResponse,
    };
    if (log.poll?.taskStatus === 'completed' && (log.poll.outputs || []).length) {
      const s = await j(await fetch(base + '/api/schema-provider/together/save-result', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          outputs: log.poll.outputs,
          metadata: { model, loras: [], requestMetadata: { actualRequest: sub.body.actualRequest } },
        }),
      }));
      log.save = { status: s.status, history: history.map((h) => ({ provider: h.provider, model: h.model, loras: h.loras })) };
      for (const [i, u] of (log.poll.outputs || []).entries()) {
        try {
          const b = Buffer.from(await (await fetch(u, { headers: { 'User-Agent': 'canvas-together-smoke/1.0' } })).arrayBuffer());
          fs.writeFileSync(`${OUT}/output-${i}.bin`, b);
        } catch (e: any) {
          log.downloadError = e.message;
        }
      }
    }
  }

  // Outcome label
  if (log.submit?.status === 200 && log.poll?.taskStatus === 'completed') log.outcome = 'PASS_GENERATION';
  else if ([402, 429].includes(log.submit?.status) || /balance|credit|billing|payment|quota/i.test(JSON.stringify(log.submit?.rawResponse || log.submit?.error || ''))) log.outcome = 'PASS_BILLING';
  else if ([401, 403].includes(log.catalog?.status) || [401, 403].includes(log.submit?.status)) log.outcome = 'BLOCKED_AUTH';
  else log.outcome = 'CODE_ONLY';

  fs.writeFileSync(`${OUT}/smoke-result.json`, JSON.stringify(log, null, 2));
  console.log(JSON.stringify({ outcome: log.outcome, catalog: log.catalog?.status, loraRefuse: log.loraRefuse?.status, submit: log.submit?.status, poll: log.poll?.taskStatus }, null, 2));
  srv.close();
});
