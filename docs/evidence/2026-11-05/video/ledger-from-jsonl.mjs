#!/usr/bin/env node
/**
 * Build the 2026-11-05 video click ledger from the request jsonl.
 * Classification is derived from endpoint + status + body, not from comments.
 */
import fs from 'node:fs';

const jsonlPath = process.argv[2] || 'temp/logs/requests-2026-11-05.jsonl';
const raw = fs.readFileSync(jsonlPath, 'utf8');
const records = raw.split('\n').filter(Boolean).map((line, i) => {
  const o = JSON.parse(line);
  o._line = i + 1;
  return o;
});

const posts = records.filter((o) => o.kind === 'upstream' && String(o.method).toUpperCase() === 'POST');

function snippet(body, n = 180) {
  const s = typeof body === 'string' ? body : JSON.stringify(body ?? '');
  return s.replace(/\s+/g, ' ').slice(0, n);
}

function classify(o) {
  const ep = String(o.endpoint || '');
  const status = Number(o.status);
  const body = String(o.responseBody || '');
  const req = typeof o.requestBody === 'string' ? o.requestBody : JSON.stringify(o.requestBody || '');
  if (ep.includes('orchestration.civitai.com') && status === 400 && /insufficientBuzz/i.test(body)) {
    return { verdict: 'PASS_BILLING', note: 'Civitai 400 insufficientBuzz' };
  }
  if (ep.includes('queue.fal.run') && status === 403 && /Exhausted balance/i.test(body)) {
    return { verdict: 'PASS_BILLING', note: 'Fal 403 Exhausted balance' };
  }
  if (ep.includes('api.wavespeed.ai') && status === 400 && /Insufficient credits/i.test(body)) {
    return { verdict: 'PASS_BILLING', note: 'WaveSpeed 400 Insufficient credits' };
  }
  if (ep.includes('api.replicate.com') && status === 402 && /Insufficient credit/i.test(body)) {
    return { verdict: 'PASS_BILLING', note: 'Replicate 402 Insufficient credit' };
  }
  if (ep.includes('api.muapi.ai') && status === 403 && /INSUFFICIENT_CREDITS/i.test(body)) {
    return { verdict: 'PASS_BILLING', note: 'MuAPI upload 403 INSUFFICIENT_CREDITS; generate POST not sent' };
  }
  if (ep.includes('api.novita.ai') && status === 403 && /NOT_ENOUGH_BALANCE/i.test(body)) {
    return { verdict: 'PASS_BILLING', note: 'Novita 403 NOT_ENOUGH_BALANCE' };
  }
  if (ep.includes('api.together.ai/v1/images/generations')) {
    return { verdict: 'WIRING', note: 'Together video click sent to /v1/images/generations (catalog 401, image endpoint guessed)' };
  }
  if (ep.includes('api.together.ai/v2/videos') && status === 401) {
    return { verdict: 'BLOCKED_AUTH', note: 'Together /v2/videos 401 invalid api key' };
  }
  if (ep.includes('api.aimlapi.com') && status === 403 && /run out of funds/i.test(body)) {
    return { verdict: 'PASS_BILLING', note: 'AIMLAPI 403 out of funds' };
  }
  if (ep.includes('api.venice.ai') && status === 402 && /Insufficient USD or Diem/i.test(body)) {
    return { verdict: 'PASS_BILLING', note: 'Venice 402 Insufficient USD or Diem' };
  }
  if (ep.includes('api.krea.ai/generate/kling/') && status === 404) {
    return { verdict: 'WIRING', note: 'Krea path missing /video/ prefix → 404 Endpoint not found' };
  }
  if (ep.includes('api.krea.ai/generate/video/') && status === 402) {
    return { verdict: 'PASS_BILLING', note: 'Krea 402 API balance separate from workspace compute' };
  }
  if (ep.includes('api.sogni.ai/v1/creative-agent/workflows') && /"toolName":"generate_image"/.test(req)) {
    return { verdict: 'WIRING', note: 'Sogni video node submitted generate_image (image hosted-tool), not generate_video' };
  }
  return { verdict: 'UNCLASSIFIED', note: snippet(body, 120) };
}

const classified = posts.map((o) => ({ ...o, ...classify(o) }));
const togetherImage = classified.filter((o) => o.verdict === 'WIRING' && String(o.endpoint).includes('/v1/images/generations'));
const togetherVideo = classified.filter((o) => String(o.endpoint).includes('/v2/videos'));
const novita = classified.filter((o) => o.provider === 'novita');
const krea = classified.filter((o) => o.provider === 'krea');
const sogni = classified.filter((o) => o.provider === 'sogni');

const lines = [];
lines.push('| jsonl line | time | provider | endpoint | HTTP | verdict | note |');
lines.push('| --- | --- | --- | --- | --- | --- | --- |');
for (const o of classified) {
  lines.push(`| ${o._line} | ${o.time} | ${o.provider} | ${o.endpoint} | ${o.status} | ${o.verdict} | ${o.note} |`);
}

const summary = [];
summary.push(`source: ${jsonlPath}`);
summary.push(`upstream POST count: ${classified.length}`);
summary.push(`Together /v1/images/generations wiring posts: ${togetherImage.map((o) => o._line).join(', ') || '(none)'}`);
summary.push(`Together /v2/videos posts: ${togetherVideo.map((o) => `${o._line}:${o.status}`).join(', ') || '(none)'}`);
summary.push(`Novita POST count: ${novita.length} lines ${novita.map((o) => o._line).join(', ')}`);
summary.push(`Krea posts: ${krea.map((o) => `${o._line}:${o.status}:${o.verdict}`).join(', ')}`);
summary.push(`Sogni posts: ${sogni.map((o) => `${o._line}:${o.status}:${o.verdict}`).join(', ')}`);
summary.push(`PASS_BILLING: ${classified.filter((o) => o.verdict === 'PASS_BILLING').length}`);
summary.push(`BLOCKED_AUTH: ${classified.filter((o) => o.verdict === 'BLOCKED_AUTH').length}`);
summary.push(`WIRING: ${classified.filter((o) => o.verdict === 'WIRING').length}`);

const out = `${summary.join('\n')}\n\n${lines.join('\n')}\n`;
process.stdout.write(out);
const dest = process.argv[3];
if (dest) fs.writeFileSync(dest, out);
