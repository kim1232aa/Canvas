import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import { strict as assert } from 'node:assert';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const storage = await mkdtemp(path.join(tmpdir(), 'canvas-hosting-'));
const options = {
  modules: true, scriptPath: path.resolve('dist/server/index.js'),
  compatibilityDate: '2026-10-02', compatibilityFlags: ['nodejs_compat', 'enable_nodejs_http_server_modules'],
  bindings: {CANVAS_SETTINGS_SECRET: 'local-test-encryption-secret', CANVAS_OWNER_EMAIL: 'owner@example.test', CANVAS_OWNER_USER_ID: 'local-owner', CANVAS_PROVIDER_KEYS: JSON.stringify({hfToken: 'local-only-token-a\nlocal-only-token-b'}), NODE_ENV: 'production'},
  d1Databases: ['DB'], r2Buckets: ['BUCKET'],
  resourcePersistencePath: storage,
  outboundService: () => {throw new Error('Upstream calls are prohibited in hosting verification');},
};
let runtime;
// Actual production requests contain email but no authenticated-user-id.
const userHeaders = {'oai-authenticated-user-email': 'owner@example.test', 'Content-Type': 'application/json'};
async function call(route, method = 'GET', body, headers = userHeaders) {
  const response = await runtime.dispatchFetch(`https://canvas.test${route}`, {method, headers, ...(body === undefined ? {} : {body: JSON.stringify(body)})});
  const data = await response.json();
  return {status: response.status, data};
}
try {
  runtime = new Miniflare(convertV4MiniflareOptions(options));
  const db = await runtime.getD1Database('DB');
  const sql = await readFile('drizzle/0000_clammy_sentinel.sql', 'utf8');
  for (const statement of sql.split('--> statement-breakpoint')) await db.prepare(statement.trim()).run();
  const page = await runtime.dispatchFetch('https://canvas.test/');
  assert.equal(page.status, 200); assert.match(await page.text(), /ComfyCanvas AI/);
  assert.equal((await call('/api/cloud/health', 'GET', undefined, {})).status, 401);
  assert.equal((await call('/api/cloud/health')).status, 200);
  assert.equal((await call('/api/history')).status, 200);
  const maskedSettings = await call('/api/cloud/settings');
  assert.equal(maskedSettings.status, 200);
  assert.ok(!JSON.stringify(maskedSettings.data).includes('local-only-token-a'));
  assert.equal((await call('/api/cloud-keys/stats')).data.huggingface.totalKeys, 2);
  assert.equal((await call('/api/cloud/health', 'GET', undefined, {...userHeaders, 'oai-authenticated-user-email': 'different@example.test'})).status, 403);
  assert.equal((await call('/api/cloud/health', 'GET', undefined, {'oai-authenticated-user-id': 'local-owner'})).status, 401);
  assert.equal((await call('/api/cloud/health', 'GET', undefined, {...userHeaders, 'oai-authenticated-user-email': ' OWNER@EXAMPLE.TEST '})).status, 200);
  assert.equal((await call('/api/cloud/projects', 'POST', {name: 'blocked'}, {...userHeaders, Origin: 'https://another.test'})).status, 403);
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jDioAAAAASUVORK5CYII=';
  const saved = await call('/api/cloud/projects', 'POST', {id: 'qa-project', name: '持久化检查', canvasMode: 'graph', nodes: [{id: 'node-1'}], connections: [], spatialFrames: [{id: 'frame-1', imageUrl: image}]});
  assert.equal(saved.status, 200); assert.equal(saved.data.success, true);
  const mediaUrl = saved.data.project.spatialFrames[0].imageUrl;
  assert.match(mediaUrl, /^\/api\/media\/[a-f0-9]{64}$/);
  const media = await runtime.dispatchFetch(`https://canvas.test${mediaUrl}`, {headers: userHeaders});
  assert.equal(media.status, 200); assert.equal(media.headers.get('content-type'), 'image/png'); assert.ok((await media.arrayBuffer()).byteLength > 0);
  assert.equal((await call('/api/cloud/projects')).data[0].nodeCount, 1);
  assert.equal((await call('/api/cloud/projects/qa-project/clone', 'POST')).data.success, true);
  const history = await call('/api/history', 'POST', {url: image, prompt: 'local storage QA', provider: 'local', model: 'local'});
  assert.equal(history.status, 200); const historyId = history.data.id;
  assert.equal((await call('/api/history')).data.length, 1);
  assert.equal((await call('/api/cloud/settings', 'POST', {agnesBaseUrl: 'https://test.invalid'})).data.success, true);
  assert.equal((await call('/api/cloud/settings', 'POST', {unknown: 'invalid'})).status, 400);
  assert.equal((await call('/api/cloud-keys/strategy', 'POST', {provider: 'fal', strategy: 'failover'})).status, 200);
  const raw = await db.prepare('SELECT encrypted_value FROM canvas_settings WHERE field = ?').bind('agnesBaseUrl').first();
  assert.ok(!raw.encrypted_value.includes('test.invalid'));
  await runtime.dispose();
  runtime = new Miniflare(convertV4MiniflareOptions(options));
  assert.equal((await call('/api/cloud/projects/qa-project')).data.nodes[0].id, 'node-1');
  assert.equal((await call('/api/history')).data[0].id, historyId);
  assert.equal((await call('/api/cloud/settings')).data.agnesBaseUrl, 'https://test.invalid');
  assert.equal((await call('/api/cloud-keys/stats')).data.fal.strategy, 'failover');
  assert.equal((await call('/api/history/delete-batch', 'POST', {ids: [historyId]})).data.remaining, 0);
  assert.equal((await call('/api/cloud/projects/qa-project', 'DELETE')).data.success, true);
  assert.equal((await call('/api/cloud/projects/qa-project')).status, 404);
  assert.equal((await call('/api/unknown')).status, 404);
  assert.equal((await call('/api/video/generate', 'POST', {})).status, 400);
  assert.equal((await call('/api/fal/generate', 'POST', {})).status, 400);
  assert.equal((await call('/api/gemini/generate', 'POST', {})).status, 400);
  console.log('Hosting checks passed: assets, owner access, CSRF, project/media/history storage, encrypted settings, restart persistence, deletion; no provider calls.');
} finally {
  if (runtime) await runtime.dispose();
  await rm(storage, {recursive: true, force: true});
}
