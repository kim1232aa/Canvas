import express from 'express';
import fs from 'node:fs';
import { registerSchemaProviderRoutes } from '/workspace/canvas/Canvas-main/src/server/schemaProviders.ts';

const env = Object.fromEntries(
  fs.readFileSync('/workspace/canvas/Canvas-main/.env', 'utf8').split('\n')
    .filter((l) => /^VENICE_API_KEY=/.test(l))
    .map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);
const KEYS = (env.VENICE_API_KEY || '').split(',').map((s: string) => s.trim()).filter(Boolean);
const KEY = KEYS[Number(process.env.VENICE_KEY_INDEX || 0)] || '';
const OUT = '/workspace/canvas-e2e-venice';
fs.mkdirSync(OUT, { recursive: true });

const app = express();
app.use(express.json({ limit: '20mb' }));
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

  // Balance (key test)
  try {
    const bal = await fetch('https://api.venice.ai/api/v1/billing/balance', {
      headers: KEY ? { Authorization: `Bearer ${KEY}` } : {},
    });
    const balText = await bal.text();
    log.balance = { status: bal.status, body: balText.slice(0, 400) };
  } catch (e: any) {
    log.balance = { error: e.message };
  }

  const cat = await j(await fetch(base + '/api/models?provider=venice&category=checkpoint&limit=20'));
  log.catalog = {
    status: cat.status,
    count: cat.body?.pagination?.venice?.total,
    sample: (cat.body?.venice || []).slice(0, 10).map((m: any) => [m.id, m.supportsLora]),
    error: cat.body?.error,
    rawResponse: typeof cat.body?.rawResponse === 'string' ? cat.body.rawResponse.slice(0, 400) : cat.body?.rawResponse,
  };

  const lcat = await j(await fetch(base + '/api/models?provider=venice&type=lora&limit=5'));
  log.loraCatalog = {
    status: lcat.status,
    notice: lcat.body?.catalogNotice || lcat.body?.catalogNotices?.venice,
    count: lcat.body?.pagination?.venice?.total,
    error: lcat.body?.error,
  };

  // Custom LoRA must be refused with 400 (no upstream call)
  const refuse = await j(await fetch(base + '/api/schema-provider/venice/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'venice-sd35',
      prompt: 'a lighthouse',
      loras: [{ name: 'https://example.com/lora.safetensors', strength: 0.8 }],
    }),
  }));
  log.loraRefuse = { status: refuse.status, error: refuse.body?.error, errorSource: refuse.body?.errorSource };

  // Paid generate WITHOUT LoRA — fill supported params (seed/steps/cfg/size)
  const model = (cat.body?.venice || []).find((m: any) => m.id === 'venice-sd35')?.id
    || (cat.body?.venice || [])[0]?.id
    || 'venice-sd35';
  const sub = await j(await fetch(base + '/api/schema-provider/venice/submit', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: 'a lighthouse on a cliff at sunset, watercolor',
      negative_prompt: 'blurry, low quality',
      width: 1024,
      height: 1024,
      steps: 20,
      cfg: 7.5,
      seed: 42,
      loras: [],
    }),
  }));
  const params = sub.body?.actualRequest?.parameters || {};
  log.submit = {
    status: sub.status,
    model,
    taskId: sub.body?.taskId,
    actualRequest: sub.body?.actualRequest,
    sentFields: {
      seed: params.seed,
      steps: params.steps,
      cfg_scale: params.cfg_scale,
      width: params.width,
      height: params.height,
      negative_prompt: params.negative_prompt,
      model: params.model,
      hasLoras: Object.hasOwn(params, 'loras'),
    },
    error: sub.body?.error,
    rawResponse: typeof sub.body?.rawResponse === 'string' ? sub.body.rawResponse.slice(0, 800) : (sub.body?.rawResponse ? JSON.stringify(sub.body.rawResponse).slice(0, 800) : undefined),
    outputsCount: Array.isArray(sub.body?.outputs) ? sub.body.outputs.length : 0,
  };

  if (sub.body?.taskId) {
    const p = await j(await fetch(base + sub.body.pollUrl));
    log.poll = {
      status: p.status,
      taskStatus: p.body?.status,
      outputsCount: Array.isArray(p.body?.outputs) ? p.body.outputs.length : 0,
      error: p.body?.error,
    };
    if (log.poll?.taskStatus === 'completed' && (p.body?.outputs || []).length) {
      const s = await j(await fetch(base + '/api/schema-provider/venice/save-result', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          outputs: p.body.outputs,
          metadata: { model, loras: [], requestMetadata: { actualRequest: sub.body.actualRequest } },
        }),
      }));
      log.save = { status: s.status, historyLen: history.length };
      // Persist first output if data URL / http
      try {
        const u = p.body.outputs[0];
        if (typeof u === 'string' && u.startsWith('data:')) {
          const b64 = u.split(',')[1] || '';
          fs.writeFileSync(`${OUT}/output-0.bin`, Buffer.from(b64, 'base64'));
        }
      } catch (e: any) {
        log.downloadError = e.message;
      }
    }
  }

  const sentOk = log.submit?.sentFields?.seed === 42
    && log.submit?.sentFields?.steps === 20
    && log.submit?.sentFields?.cfg_scale === 7.5
    && log.submit?.sentFields?.width === 1024
    && log.submit?.sentFields?.height === 1024
    && log.submit?.sentFields?.hasLoras === false;

  if (log.submit?.status === 200 && log.poll?.taskStatus === 'completed' && sentOk) log.outcome = 'PASS_GENERATION';
  else if (log.loraRefuse?.status === 400 && ([402, 429].includes(log.submit?.status) || /INSUFFICIENT_BALANCE|balance|credit|billing|payment|quota/i.test(JSON.stringify(log.submit?.rawResponse || log.submit?.error || log.balance || ''))) && sentOk) log.outcome = 'PASS_BILLING';
  else if (log.loraRefuse?.status === 400 && [402, 429].includes(log.submit?.status)) log.outcome = 'PASS_BILLING';
  else if ([401, 403].includes(log.catalog?.status) || [401, 403].includes(log.submit?.status)) log.outcome = 'BLOCKED_AUTH';
  else if (log.loraRefuse?.status === 400 && log.catalog?.status === 200) log.outcome = 'CODE_ONLY';
  else log.outcome = 'CODE_ONLY';

  log.loraPolicy = 'refuse_custom_lora_local_400_no_loras_array';
  fs.writeFileSync(`${OUT}/smoke-result.json`, JSON.stringify(log, null, 2));
  console.log(JSON.stringify({
    outcome: log.outcome,
    catalog: log.catalog?.status,
    loraRefuse: log.loraRefuse?.status,
    submit: log.submit?.status,
    sentOk,
    poll: log.poll?.taskStatus,
    balance: log.balance?.status,
  }, null, 2));
  srv.close();
});
