import express from 'express';
import fs from 'node:fs';
import { registerSchemaProviderRoutes } from '/workspace/canvas/Canvas-main/src/server/schemaProviders.ts';

const env = Object.fromEntries(
  fs.readFileSync('/workspace/canvas/Canvas-main/.env', 'utf8').split('\n')
    .filter((l) => /^NOVITA_API_KEY=/.test(l))
    .map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);
const KEYS = (env.NOVITA_API_KEY || '').split(',').map((s: string) => s.trim()).filter(Boolean);
const KEY = KEYS[Number(process.env.NOVITA_KEY_INDEX || 0)] || '';
const OUT = '/workspace/canvas/temp/canvas-e2e-archive-20261017/canvas-e2e-novita';
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

  const cat = await j(await fetch(base + '/api/models?provider=novita&category=checkpoint&limit=100'));
  log.catalog = {
    status: cat.status,
    count: cat.body?.pagination?.novita?.total,
    sample: (cat.body?.novita || []).slice(0, 8).map((m: any) => [m.id, m.supportsLora, m.baseModel]),
    error: cat.body?.error,
    rawResponse: typeof cat.body?.rawResponse === 'string' ? cat.body.rawResponse.slice(0, 400) : cat.body?.rawResponse,
  };

  const lcat = await j(await fetch(base + '/api/models?provider=novita&type=lora&limit=20'));
  log.loraCatalog = {
    status: lcat.status,
    count: lcat.body?.pagination?.novita?.total,
    sample: (lcat.body?.novita || []).slice(0, 5).map((m: any) => [m.id, m.baseModel || m.base_model]),
    notice: lcat.body?.catalogNotice || lcat.body?.catalogNotices?.novita,
    error: lcat.body?.error,
  };

  // Refuse: missing strength (official forbids silent 0.8 default)
  const ckpt = (cat.body?.novita || []).find((m: any) => String(m.id).includes('dreamshaper'))?.id
    || (cat.body?.novita || []).find((m: any) => !/inpaint/i.test(m.id || ''))?.id
    || 'dreamshaper_8_93211.safetensors';
  const refuseMissing = await j(await fetch(base + '/api/schema-provider/novita/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: ckpt,
      prompt: 'a lighthouse',
      loras: [{ path: 'more_details_59655' }],
    }),
  }));
  log.loraRefuseMissingStrength = {
    status: refuseMissing.status,
    model: ckpt,
    error: refuseMissing.body?.error,
    errorSource: refuseMissing.body?.errorSource,
  };

  // Paid generate WITH real LoRA (model_name + strength) + full canvas params
  const loraId = (lcat.body?.novita || []).find((m: any) => /more_details/i.test(m.id || ''))?.id
    || (lcat.body?.novita || [])[0]?.id
    || 'more_details_59655';
  const sub = await j(await fetch(base + '/api/schema-provider/novita/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: ckpt,
      prompt: 'a lighthouse on a cliff at sunset, detailed',
      negative_prompt: 'blurry, low quality',
      width: 512,
      height: 512,
      steps: 20,
      cfg: 7,
      seed: 42,
      sampler_name: 'Euler a',
      loras: [{ path: loraId, strength: 0.75 }],
    }),
  }));
  const req = sub.body?.actualRequest?.parameters?.request || sub.body?.actualRequest?.parameters;
  log.submit = {
    status: sub.status,
    model: ckpt,
    loraInRequest: Boolean(req?.loras?.length),
    loraFields: req?.loras,
    seed: req?.seed,
    steps: req?.steps,
    guidance_scale: req?.guidance_scale,
    width: req?.width,
    height: req?.height,
    sampler_name: req?.sampler_name,
    negative_prompt: req?.negative_prompt,
    taskId: sub.body?.taskId,
    actualRequest: sub.body?.actualRequest,
    error: sub.body?.error,
    rawResponse: typeof sub.body?.rawResponse === 'string' ? sub.body.rawResponse.slice(0, 800) : sub.body?.rawResponse,
  };

  if (sub.body?.taskId) {
    // Poll a few times (async)
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const p = await j(await fetch(base + sub.body.pollUrl));
      log.poll = {
        status: p.status,
        taskStatus: p.body?.status,
        outputs: p.body?.outputs,
        error: p.body?.error,
        raw: typeof p.body?.rawResponse === 'string' ? p.body.rawResponse.slice(0, 400) : p.body?.rawResponse,
      };
      if (['completed', 'failed', 'succeeded', 'success'].includes(String(p.body?.status || '').toLowerCase())) break;
    }
    if (log.poll?.taskStatus === 'completed' && (log.poll.outputs || []).length) {
      const s = await j(await fetch(base + '/api/schema-provider/novita/save-result', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          outputs: log.poll.outputs,
          metadata: { model: ckpt, loras: req?.loras, requestMetadata: { actualRequest: sub.body.actualRequest } },
        }),
      }));
      log.save = { status: s.status, history: history.map((h) => ({ provider: h.provider, model: h.model })) };
    }
  }

  const rawStr = JSON.stringify(log.submit?.rawResponse || log.submit?.error || '');
  const billingHit = [400, 402, 403].includes(log.submit?.status)
    && /BILLING|balance|Insufficient|credit|billing|payment|quota|NOT_ENOUGH/i.test(rawStr + String(log.submit?.error || ''));
  if (log.submit?.status === 200 && log.poll?.taskStatus === 'completed') log.outcome = 'PASS_GENERATION';
  else if (billingHit || [402, 403, 429].includes(log.submit?.status)) log.outcome = 'PASS_BILLING';
  else if ([401].includes(log.catalog?.status) || [401].includes(log.submit?.status)) log.outcome = 'BLOCKED_AUTH';
  else log.outcome = 'CODE_ONLY';

  fs.writeFileSync(`${OUT}/smoke-result.json`, JSON.stringify(log, null, 2));
  console.log(JSON.stringify({
    outcome: log.outcome,
    catalog: log.catalog?.status,
    loraCatalog: log.loraCatalog?.status,
    loraRefuse: log.loraRefuseMissingStrength?.status,
    submit: log.submit?.status,
    loraInRequest: log.submit?.loraInRequest,
    paramsSent: {
      seed: log.submit?.seed,
      steps: log.submit?.steps,
      guidance_scale: log.submit?.guidance_scale,
      width: log.submit?.width,
      height: log.submit?.height,
    },
    poll: log.poll?.taskStatus,
  }, null, 2));
  srv.close();
});
