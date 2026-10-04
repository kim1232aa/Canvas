import { readFile, writeFile, mkdir, readdir, cp } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { builtinModules } from 'node:module';
import { build } from 'esbuild';

// The original Node server remains usable locally. This adapter changes only
// hosting, authorization and durable storage; provider handlers are retained.
let source = await readFile('server.ts', 'utf8');
const replace = (before, after) => {
  if (!source.includes(before)) throw new Error(`Canvas adapter source mismatch: ${before.slice(0, 80)}`);
  source = source.replace(before, after);
};
const removeRange = (start, end, replacement = '') => {
  const from = source.indexOf(start), to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Canvas adapter source mismatch: ${start}`);
  source = source.slice(0, from) + replacement + source.slice(to);
};
removeRange("import dotenv from 'dotenv';", "import { fieldOptions");
for (const line of ["import path from 'path';\n", "import fs from 'fs';\n", "import { fileURLToPath } from 'url';\n", "import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';\n"]) replace(line, '');
removeRange('dotenv.config();', 'const app = express();');
replace('const app = express();', "const app = express();\napp.disable('x-powered-by');");
replace("app.disable('x-powered-by');", `app.disable('x-powered-by');
for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
  const register = (app[method] as any).bind(app);
  const wrap = (handler: any): any => Array.isArray(handler) ? handler.map(wrap) : typeof handler !== 'function' ? handler : (req: any, res: any, next: any) => {
    try { const result = handler(req, res, next); if (result?.catch) result.catch(next); } catch (error) {next(error);}
  };
  (app as any)[method] = (...args: any[]) => register(...args.map((arg, index) => index ? wrap(arg) : arg));
}`);
replace('const PORT = Number(process.env.PORT) || 3000;', 'const PORT = 3000;');
replace("const UPSTREAM_LOG_FILE = path.join(__dirname, 'logs', 'upstream.log');", '');
removeRange('const logUpstream = (', '// All provider HTTP calls', `const logUpstream = (meta: UpstreamMeta, upstream: string, status: number, startedAt: number, error?: string) => {
  // Do not log provider response bodies: they can contain signed asset links.
  console.log(JSON.stringify({timestamp: new Date().toISOString(), provider: meta.provider, route: meta.route, model: meta.model ?? null, upstream, status, durationMs: Date.now() - startedAt, failed: !!error}));
};
\n`);
removeRange('// Anti CSRF / DNS rebinding:', '// Only application/json', `const ALLOWED_ORIGINS = {has: (origin: string) => origin === currentRequest().origin, *[Symbol.iterator]() {yield currentRequest().origin;}};
app.use((req, res, next) => {
  if (!isApiPath(req.path)) return next();
  const context = currentRequest();
  // The Worker validates the request origin before its internal Node bridge.
  // The bridge may normalize Host to its virtual port, so it is not compared here.
  if (req.headers.origin && !ALLOWED_ORIGINS.has(req.headers.origin)) return res.status(403).json({error: '跨站请求被拒绝'});
  next();
});
\n`);
replace("const adminToken = process.env.CANVAS_ADMIN_TOKEN?.trim();", "if (currentRequest().authenticatedUserId === currentRequest().ownerUserId) return next();\n  const adminToken = process.env.CANVAS_ADMIN_TOKEN?.trim();");
removeRange('// Persistent Storage Directories', '// Cloud Canvas Project Schema');
removeRange('// Helper methods to read/write JSON files safely', 'const defaultKeys:');
source = source.replaceAll('cloudSettings', 'currentSettings()');
// Preserve the full HTTP body and classify a failed durable media copy as a
// storage-stage failure, while retaining the actual media-fetch source/status.
source = source.replaceAll(
  '...(durable.status != null ? { persistStatus: durable.status } : {}),',
  "errorSource: 'storage',\n        rawResponse: durable.rawResponse,\n        stack: durable.stack || new Error(durable.message).stack,\n        cause: durable.cause,\n        persistErrorSource: durable.errorSource,\n        persistRawResponse: durable.rawResponse,\n        persistStack: durable.stack,\n        persistCause: durable.cause,\n        ...(durable.status != null ? { persistStatus: durable.status } : {}),"
);
source = source.replaceAll(
  '...(durableVideo.status != null ? { persistStatus: durableVideo.status } : {}),',
  "errorSource: 'storage',\n            rawResponse: durableVideo.rawResponse,\n            stack: durableVideo.stack || new Error(durableVideo.message).stack,\n            cause: durableVideo.cause,\n            persistErrorSource: durableVideo.errorSource,\n            persistRawResponse: durableVideo.rawResponse,\n            persistStack: durableVideo.stack,\n            persistCause: durableVideo.cause,\n            ...(durableVideo.status != null ? { persistStatus: durableVideo.status } : {}),"
);
// Workers manages request lifetime and has no Node socket timeout methods.
// Provider polling deadlines and upstream validation remain unchanged.
source = source.replace(/\s*(?:req|res)\.setTimeout\(\d+\);/g, '');
replace('  generationHistory.unshift(fullItem);\n  if (generationHistory.length > MAX_HISTORY_COUNT) {\n    generationHistory.splice(MAX_HISTORY_COUNT);\n  }\n  writeJsonFile(HISTORY_FILE, generationHistory);', "  currentRequest().pending.push(currentRequest().store.put('history', fullItem));");
removeRange('// Seed initial history if empty', '// Agnes / SenseNova');
replace("app.post('/api/cloud-keys/strategy', requireAdminAuth, (req, res) => {", "app.post('/api/cloud-keys/strategy', requireAdminAuth, async (req, res) => {");
replace('  writeJsonFile(SETTINGS_FILE, currentSettings());', '  await currentRequest().store.updateSettings({[`${provider}_strategy`]: strategy});');
removeRange("app.get('/api/history',", 'const MAX_HISTORY_ITEM_BYTES');
replace('  generationHistory.unshift(item);\n  // Keep last MAX_HISTORY_COUNT items on server\n  if (generationHistory.length > MAX_HISTORY_COUNT) {\n    generationHistory.splice(MAX_HISTORY_COUNT);\n  }\n  writeJsonFile(HISTORY_FILE, generationHistory);\n  return res.json(item);', "  const stored = await currentRequest().store.put('history', item);\n  return res.json(stored);");
removeRange("app.delete('/api/history/:id'", '// ==========================================\n// 10. Server-Side Settings', 'registerStorageRoutes(app);\n\n');
replace("app.post('/api/cloud/settings', requireAdminAuth, (req, res) => {", "app.post('/api/cloud/settings', requireAdminAuth, async (req, res) => {");
replace('  currentSettings() = {\n    ...currentSettings(),\n    ...updates,\n  };\n  writeJsonFile(SETTINGS_FILE, currentSettings());', '  await currentRequest().store.updateSettings(updates);\n  Object.assign(currentSettings(), updates);');
replace('  for (const [key, value] of Object.entries(settings)) {', "  for (const [key, value] of Object.entries(settings)) {\n    if (key.startsWith('__sites_')) continue;");
removeRange('// ==========================================\n// 11. Cloud Server Status', 'startServer().catch');
source = source.slice(0, source.indexOf('startServer().catch'));
// Media loaded from the private Site must become embedded input bytes before
// any provider call, since upstream providers cannot access private media URLs.
const mediaMiddleware = `
app.use((req, res, next) => {
  if (!/^\\/api\\/(?:engine\\/)?(?:[^/]+\\/)?(?:generate|chat|refine-prompt|upload|submit)$/.test(req.path)) return next();
  currentRequest().store.resolveInputMedia(req.body).then(body => { req.body = body; next(); }).catch(next);
});
`;
replace('// Admin authentication & CSRF validation helpers', mediaMiddleware + '\n// Admin authentication & CSRF validation helpers');
source = `import { currentRequest, currentSettings } from './context';\nimport { registerStorageRoutes } from './routes';\n` + source;
source = source.replaceAll("from './src/", "from '../src/");
source += `\napp.use((req, res) => res.status(404).json({error: 'API route not found'}));
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const status = Number.isInteger(err?.status) && err.status >= 400 && err.status <= 599 ? err.status : 500;
  const errorSource = err?.errorSource || (err?.rawResponse !== undefined || err?.rawBody !== undefined ? 'upstream' : 'local');
  const describeCause = (value: any, depth = 0): any => {
    if (value == null || depth >= 8) return undefined;
    if (!(value instanceof Error)) return typeof value === 'object' ? value : {message: String(value)};
    return {
      name: value.name,
      message: value.message,
      ...(value.stack ? {stack: value.stack} : {}),
      ...((value as any).code ? {code: (value as any).code} : {}),
      ...(value.cause !== undefined ? {cause: describeCause(value.cause, depth + 1)} : {}),
    };
  };
  const cause = describeCause(err?.cause);
  // Do not log exception text or any request/response data; those may contain secrets.
  console.error(JSON.stringify({route: _req.path, status, errorSource}));
  res.status(status).json({
    error: err?.message || '云端服务暂不可用',
    errorSource,
    ...(err?.rawResponse !== undefined ? {rawResponse: err.rawResponse} : err?.rawBody !== undefined ? {rawResponse: err.rawBody} : err?.body !== undefined ? {rawResponse: err.body} : {}),
    ...(err?.stack ? {stack: err.stack} : {}),
    ...(cause !== undefined ? {cause} : {}),
  });
});
export { app };
export function refreshHostedKeyPool() { keyPoolManager.refreshFromSettings(); }
`;
await writeFile('hosting/server.generated.ts', source);

const vite = spawnSync(process.execPath, ['node_modules/vite/bin/vite.js', 'build', '--outDir', 'dist/client'], {stdio: 'inherit', env: {...process.env, VITE_SITES_DEPLOYMENT: 'true'}});
if (vite.status !== 0) process.exit(vite.status || 1);
const types = {'.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2'};
const assets = {};
async function collect(directory, prefix = '') {
  for (const file of await readdir(directory, {withFileTypes: true})) {
    const relative = `${prefix}/${file.name}`;
    if (file.isDirectory()) await collect(path.join(directory, file.name), relative);
    else assets[relative] = {type: types[path.extname(file.name)] || 'application/octet-stream', data: (await readFile(path.join(directory, file.name))).toString('base64')};
  }
}
await collect('dist/client');
await writeFile('hosting/assets.generated.ts', `export const assets: Record<string, {type: string; data: string}> = ${JSON.stringify(assets)};\n`);
await mkdir('dist/server', {recursive: true});
const workerBuild = await build({entryPoints: ['hosting/worker.ts'], outfile: 'dist/server/index.js', bundle: true, write: false, metafile: true, minify: true, format: 'esm', platform: 'node', target: 'es2022', external: ['cloudflare:*', ...builtinModules, ...builtinModules.map(name => `node:${name}`)]});
const requires = [...new Set(Object.values(workerBuild.metafile.outputs).flatMap(output => output.imports.filter(item => item.kind === 'require-call').map(item => item.path)))];
const builtinNames = new Set(builtinModules.map(name => name.replace(/^node:/, '')));
const imports = requires.filter(name => name !== 'process' && name !== 'node:process' && builtinNames.has(name.replace(/^node:/, '')));
const banner = imports.map((name, index) => `import * as __node${index} from ${JSON.stringify(name.startsWith('node:') ? name : `node:${name}`)};`).join('\n') + '\n' +
  `const __builtins = {${imports.map((name, index) => `${JSON.stringify(name)}: __node${index}`).join(',')}};\n` +
  `const require = (name) => {if (name === 'process' || name === 'node:process') return process; const value = __builtins[name]; if (!value) throw new Error('Unsupported Node module: ' + name); return value.default ?? value;};\n`;
await writeFile('dist/server/index.js', banner + workerBuild.outputFiles[0].text);
await mkdir('dist/.openai', {recursive: true});
await cp('.openai/hosting.json', 'dist/.openai/hosting.json');
await cp('drizzle', 'dist/.openai/drizzle', {recursive: true});
await writeFile('dist/server/wrangler.json', JSON.stringify({name: 'comfycanvas-studio', main: 'index.js', compatibility_date: '2026-10-02', compatibility_flags: ['nodejs_compat', 'enable_nodejs_http_server_modules'], d1_databases: [{binding: 'DB', database_name: 'canvas-db', database_id: '00000000-0000-4000-8000-000000000000'}], r2_buckets: [{binding: 'BUCKET', bucket_name: 'canvas-media'}]}, null, 2));
console.log('Canvas Sites Worker built: original provider routes + durable storage');
