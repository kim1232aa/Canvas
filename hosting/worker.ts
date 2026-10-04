import { createServer } from 'node:http';
import { handleAsNodeRequest } from 'cloudflare:node';
import { requestContext } from './context';
import { CanvasStore } from './store';
import { app, refreshHostedKeyPool } from './server.generated';
import { assets } from './assets.generated';

interface Env {
  DB: import('@cloudflare/workers-types').D1Database;
  BUCKET: import('@cloudflare/workers-types').R2Bucket;
  CANVAS_SETTINGS_SECRET: string;
  CANVAS_OWNER_USER_ID?: string;
  CANVAS_OWNER_EMAIL?: string;
  CANVAS_PROVIDER_KEYS?: string;
  MUAPI_KEY?: string;
  WAVESPEED_KEY?: string;
  SOGNI_KEY?: string;
}
const server = createServer(app);
server.listen(3000);

function describeCause(error: unknown, depth = 0): unknown {
  if (error == null || depth >= 8) return undefined;
  if (!(error instanceof Error)) return {message: String(error)};
  const cause = (error as Error & { cause?: unknown }).cause;
  const code = (error as NodeJS.ErrnoException).code;
  return {
    name: error.name,
    message: error.message,
    ...(error.stack ? { stack: error.stack } : {}),
    ...(code ? { code } : {}),
    ...(cause !== undefined ? { cause: describeCause(cause, depth + 1) } : {}),
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      const ownerEmail = env.CANVAS_OWNER_EMAIL?.trim().toLowerCase();
      const forwardedEmail = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
      // Sites forwards authenticated email in production; the user-id header is
      // not always present. Pin email to the owner from Sites access metadata.
      if (ownerEmail && !forwardedEmail) return Response.json({error: '请使用网站所属的 ChatGPT 账号登录后访问'}, {status: 401});
      if (ownerEmail && forwardedEmail !== ownerEmail) return Response.json({error: '仅网站所有者可以访问此工作室'}, {status: 403});
      const userId = ownerEmail
        ? env.CANVAS_OWNER_USER_ID || `owner-email:${ownerEmail}`
        : request.headers.get('oai-authenticated-user-id');
      if (!userId) return Response.json({error: '请使用网站所属的 ChatGPT 账号登录后访问'}, {status: 401});
      // Keep application access owner-only if platform sharing is widened.
      if (!env.DB || !env.BUCKET) return Response.json({error: '云端存储暂不可用，请稍后重试'}, {status: 503});
      const store = new CanvasStore(env.DB, env.BUCKET, env.CANVAS_SETTINGS_SECRET);
      try {
        let settings = await store.settings();
        // Sites keeps the supplied provider keys encrypted as one secret. User
        // settings override it; source and browser bundles never contain keys.
        const configuredKeys = env.CANVAS_PROVIDER_KEYS ? JSON.parse(env.CANVAS_PROVIDER_KEYS) : {};
        settings = {...configuredKeys, ...(env.MUAPI_KEY?{muapiKey:env.MUAPI_KEY}:{}), ...(env.WAVESPEED_KEY?{wavespeedKey:env.WAVESPEED_KEY}:{}), ...(env.SOGNI_KEY?{sogniKey:env.SOGNI_KEY}:{}), ...settings};
        let ownerId = env.CANVAS_OWNER_USER_ID || settings['__sites_owner_user_id'];
        if (!ownerId) {
          await store.claimOwner(userId);
          settings = await store.settings();
          ownerId = settings['__sites_owner_user_id'];
        }
        if (ownerId !== userId) return Response.json({error: '仅网站所有者可以访问此工作室'}, {status: 403});
        if (url.pathname.startsWith('/api/media/')) return store.media(url.pathname.slice('/api/media/'.length));
        const origin = request.headers.get('origin');
        if (origin && origin !== url.origin) return Response.json({error: '跨站请求被拒绝'}, {status: 403});
        const site = request.headers.get('sec-fetch-site');
        if (site === 'cross-site' || site === 'same-site') return Response.json({error: '跨站请求被拒绝'}, {status: 403});
        return await requestContext.run({origin: url.origin, authenticatedUserId: userId, ownerUserId: ownerId, settings, store, pending: []}, async () => {
          refreshHostedKeyPool();
          const result = await handleAsNodeRequest(3000, request);
          const {currentRequest} = await import('./context');
          try {
            await Promise.all(currentRequest().pending);
          } catch (cause) {
            throw Object.assign(new Error('Cloud storage persistence failed', {cause}), {
              errorSource: 'storage',
              status: 500,
              ...((cause as any)?.rawResponse !== undefined ? {rawResponse: (cause as any).rawResponse} : {}),
              cause: describeCause(cause),
            });
          }
          const headers = new Headers(result.headers);
          headers.set('Cache-Control', 'private, no-store');
          return new Response(result.body, {status: result.status, statusText: result.statusText, headers});
        });
      } catch (error: any) {
        const status = Number.isInteger(error?.status) && error.status >= 400 && error.status <= 599 ? error.status : 500;
        const errorSource = error?.errorSource || 'local';
        // Never log exception text, request URLs, response bodies, or credentials.
        console.error(JSON.stringify({route: url.pathname, status, errorSource}));
        const body: Record<string, unknown> = {
          error: error?.message || '云端服务暂不可用，请稍后重试',
          errorSource,
          ...(error?.rawResponse !== undefined ? {rawResponse: error.rawResponse} : {}),
          ...(error?.stack ? {stack: error.stack} : {}),
          ...(error?.cause !== undefined ? {cause: describeCause(error.cause)} : {}),
        };
        return Response.json(body, {status});
      }
    }
    if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status: 405});
    const key = decodeURIComponent(url.pathname);
    const item = assets[key] ?? (key === '/' || !key.split('/').at(-1)?.includes('.') ? assets['/index.html'] : undefined);
    if (!item) return new Response('Not found', {status: 404});
    const body = request.method === 'HEAD' ? null : Buffer.from(item.data, 'base64');
    return new Response(body, {headers: {'Content-Type': item.type, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': key.startsWith('/assets/') ? 'private, max-age=31536000, immutable' : 'private, no-cache'}});
  },
};
