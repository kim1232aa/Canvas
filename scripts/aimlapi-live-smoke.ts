import express from 'express';
import fs from 'node:fs';
import { registerSchemaProviderRoutes } from '/workspace/canvas/Canvas-main/src/server/schemaProviders.ts';

const env = Object.fromEntries(
  fs.readFileSync('/workspace/canvas/Canvas-main/.env', 'utf8').split('\n')
    .filter((l) => /^AIMLAPI_KEY=/.test(l))
    .map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);
const KEYS = (env.AIMLAPI_KEY || '').split(',').map((s: string) => s.trim()).filter(Boolean);
const KEY = KEYS[Number(process.env.AIMLAPI_KEY_INDEX || 0)] || '';
const OUT = '/workspace/canvas-e2e-aimlapi';
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

  const cat = await j(await fetch(base + '/api/models?provider=aimlapi&category=checkpoint&limit=200'));
  log.catalog = {
    status: cat.status,
    count: cat.body?.pagination?.aimlapi?.total,
    sample: (cat.body?.aimlapi || []).slice(0, 10).map((m: any) => [m.id, m.supportsLora]),
    loraCapable: (cat.body?.aimlapi || []).filter((m: any) => m.supportsLora).slice(0, 8).map((m: any) => m.id),
    error: cat.body?.error,
    rawResponse: typeof cat.body?.rawResponse === 'string' ? cat.body.rawResponse.slice(0, 400) : cat.body?.rawResponse,
  };

  const lcat = await j(await fetch(base + '/api/models?provider=aimlapi&type=lora&limit=5'));
  log.loraCatalog = {
    status: lcat.status,
    notice: lcat.body?.catalogNotice || lcat.body?.catalogNotices?.aimlapi,
    count: lcat.body?.pagination?.aimlapi?.total,
    error: lcat.body?.error,
  };

  // Non-LoRA model must refuse LoRA with 400
  const nonLora = (cat.body?.aimlapi || []).find((m: any) => !m.supportsLora)?.id || 'flux/schnell';
  const refuse = await j(await fetch(base + '/api/schema-provider/aimlapi/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: nonLora,
      prompt: 'a lighthouse',
      loras: [{ path: 'ostris/z_image_turbo_childrens_drawings', strength: 0.85 }],
    }),
  }));
  log.loraRefuseNonCapable = { status: refuse.status, model: nonLora, error: refuse.body?.error, errorSource: refuse.body?.errorSource };

  // Paid generate WITH real LoRA on official LoRA model
  const model = (cat.body?.aimlapi || []).find((m: any) => m.id === 'alibaba/z-image-turbo-lora')?.id
    || (cat.body?.aimlapi || []).find((m: any) => m.supportsLora)?.id
    || 'alibaba/z-image-turbo-lora';
  const loraPath = 'ostris/z_image_turbo_childrens_drawings';
  const sub = await j(await fetch(base + '/api/schema-provider/aimlapi/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: 'a lighthouse on a cliff at sunset, watercolor',
      width: 1024,
      height: 768,
      seed: 42,
      loras: [{ path: loraPath, strength: 0.85 }],
    }),
  }));
  log.submit = {
    status: sub.status,
    model,
    loraInRequest: Boolean(sub.body?.actualRequest?.parameters?.loras?.length),
    loraFields: sub.body?.actualRequest?.parameters?.loras,
    image_size: sub.body?.actualRequest?.parameters?.image_size,
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
      const s = await j(await fetch(base + '/api/schema-provider/aimlapi/save-result', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          outputs: log.poll.outputs,
          metadata: { model, loras: sub.body.actualRequest?.parameters?.loras, requestMetadata: { actualRequest: sub.body.actualRequest } },
        }),
      }));
      log.save = { status: s.status, history: history.map((h) => ({ provider: h.provider, model: h.model, loras: h.loras })) };
      for (const [i, u] of (log.poll.outputs || []).entries()) {
        try {
          const b = Buffer.from(await (await fetch(u, { headers: { 'User-Agent': 'canvas-aimlapi-smoke/1.0' } })).arrayBuffer());
          fs.writeFileSync(`${OUT}/output-${i}.bin`, b);
        } catch (e: any) {
          log.downloadError = e.message;
        }
      }
    }
  }

  const rawStr = JSON.stringify(log.submit?.rawResponse || log.submit?.error || '');
  if (log.submit?.status === 200 && log.poll?.taskStatus === 'completed') log.outcome = 'PASS_GENERATION';
  else if ([402, 403, 429].includes(log.submit?.status) || /balance|credit|billing|payment|quota|run out of credits/i.test(rawStr)) log.outcome = 'PASS_BILLING';
  else if ([401].includes(log.catalog?.status) || [401].includes(log.submit?.status)) log.outcome = 'BLOCKED_AUTH';
  else log.outcome = 'CODE_ONLY';

  fs.writeFileSync(`${OUT}/smoke-result.json`, JSON.stringify(log, null, 2));
  console.log(JSON.stringify({
    outcome: log.outcome,
    catalog: log.catalog?.status,
    loraRefuse: log.loraRefuseNonCapable?.status,
    submit: log.submit?.status,
    loraInRequest: log.submit?.loraInRequest,
    poll: log.poll?.taskStatus,
  }, null, 2));
  srv.close();
});
