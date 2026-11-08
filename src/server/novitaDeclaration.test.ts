import { describe, it, expect } from 'vitest';
import { loadProviderDeclaration, novitaLoras, novitaImg2VideoDedicatedModels } from './schemaProviders';
describe('Novita HTML declaration (config data)', () => {
  it('loads txt2img declaration with model_name + per-field source + fetch date', () => {
    const d = loadProviderDeclaration('novita', '/v3/async/txt2img');
    expect(d).toBeTruthy();
    expect(d.inputSchema.properties.model_name).toBeTruthy();
    expect(Object.values(d.inputSchema.properties).every((f: any) => f['x-liveConfirmed'] === false)).toBe(true);
    for (const k of ['model_name','prompt','seed','steps','guidance_scale','sampler_name','loras']) {
      expect(d.inputSchema.properties[k]['x-source']).toMatch(/^https:\/\//);
      expect(d.inputSchema.properties[k]['x-fetchedAt']).toBe('2026-10-16');
      expect(String(d.inputSchema.properties[k].description || '')).not.toContain('待确认');
    }
    expect(JSON.stringify(d.inputSchema.properties.loras)).toContain('搜索快照，原页 404');
  });
  it('no declaration for txt2video → null (checkpoint video path stays blocked)', () => {
    expect(loadProviderDeclaration('novita', '/v3/async/txt2video')).toBeNull();
  });
  it('loads img2video declaration for dedicated SVD models (not /v3/model checkpoints)', () => {
    const d = loadProviderDeclaration('novita', '/v3/async/img2video');
    expect(d).toBeTruthy();
    expect(d.endpointPath).toBe('/v3/async/img2video');
    expect(d.requestWrapper).toBeNull();
    expect(novitaImg2VideoDedicatedModels(d)).toEqual(['SVD-XT', 'SVD']);
    expect(d.inputSchema.properties.model_name.enum).toEqual(['SVD-XT', 'SVD']);
    for (const k of ['model_name', 'image_file', 'frames_num', 'frames_per_second', 'seed', 'steps', 'image_file_resize_mode']) {
      expect(d.inputSchema.properties[k], k).toBeTruthy();
      expect(d.inputSchema.properties[k]['x-source']).toMatch(/^https:\/\//);
      expect(d.inputSchema.properties[k]['x-fetchedAt']).toBe('2026-11-03');
      expect(d.inputSchema.properties[k]['x-liveConfirmed']).toBe(false);
    }
    expect(d.sources.some((s: string) => s.includes('javascript-sdk'))).toBe(true);
  });
});

import express from 'express';
import type { AddressInfo } from 'node:net';
import { novitaRequestBody, registerSchemaProviderRoutes } from './schemaProviders';
import { schemaSendStatus } from '../utils/schemaSendStatus';

describe('Novita requestWrapper decides the POST body shape (M89)', () => {
  it('requestWrapper null → flat fields, no request wrapper, no default response_image_type', () => {
    const body = novitaRequestBody({ image_file: 'https://e.invalid/a.png', frames_num: 25, seed: 7 }, 'SVD-XT', null);
    expect(body).toEqual({ image_file: 'https://e.invalid/a.png', frames_num: 25, seed: 7, model_name: 'SVD-XT' });
    expect(body).not.toHaveProperty('request');
    expect(JSON.stringify(body)).not.toContain('response_image_type');
  });
  it('requestWrapper null keeps a caller-supplied extra as-is', () => {
    expect(novitaRequestBody({ seed: 1, extra: { webhook: { url: 'https://e.invalid/hook' } } }, 'SVD', null)).toEqual({ seed: 1, model_name: 'SVD', extra: { webhook: { url: 'https://e.invalid/hook' } } });
  });
  it('requestWrapper "request" (txt2img) keeps {extra, request} with the image default extra', () => {
    expect(novitaRequestBody({ prompt: 'p', seed: 1 }, 'm.safetensors', 'request')).toEqual({ extra: { response_image_type: 'jpeg' }, request: { prompt: 'p', seed: 1, model_name: 'm.safetensors' } });
  });

  it('route: SVD-XT submit posts a flat body to /v3/async/img2video and records it as actualRequest', async () => {
    const app = express(); app.use(express.json());
    const calls: Array<{ url: string; body: any }> = [];
    registerSchemaProviderRoutes(app, {
      fetch: async (_m: any, url: string, init?: any) => { calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined }); return new Response(JSON.stringify({ task_id: 't1' }), { status: 200 }); },
      key: () => 'k', record: (i: any) => i, durable: async (u: string) => ({ ok: true, dataUrl: u }),
    } as any);
    const server = app.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      const r = await fetch(`http://127.0.0.1:${port}/api/schema-provider/novita/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'SVD-XT', prompt: 'a lone boat on a misty lake', seed: 7, steps: 20, fps: 6, num_frames: 25, isVideo: true, custom_parameters: { image_file: 'https://e.invalid/a.png', image_file_resize_mode: 'CROP_TO_ASPECT_RATIO' } }) });
      const j: any = await r.json();
      expect(r.status).toBe(200);
      const post = calls.find((c) => c.url.endsWith('/v3/async/img2video'))!;
      expect(post.body).toMatchObject({ model_name: 'SVD-XT', image_file: 'https://e.invalid/a.png', image_file_resize_mode: 'CROP_TO_ASPECT_RATIO', seed: 7, steps: 20 });
      expect(post.body).not.toHaveProperty('request');
      expect(JSON.stringify(post.body)).not.toContain('response_image_type');
      expect(j.actualRequest.parameters).toEqual(post.body);
      // M106: canvas num_frames/fps land on the declared frames_num/frames_per_second, never as undeclared num_frames/fps.
      expect(post.body).toMatchObject({ frames_num: 25, frames_per_second: 6 });
      expect(post.body).not.toHaveProperty('num_frames');
      expect(post.body).not.toHaveProperty('fps');
      const m = (from: string) => j.actualRequest.mapping.find((x: any) => x.from === from);
      expect(m('num_frames')).toMatchObject({ to: 'frames_num', value: 25, schemaDeclared: true, finalValue: 25 });
      expect(m('fps')).toMatchObject({ to: 'frames_per_second', value: 6, schemaDeclared: true, finalValue: 6 });
      expect(m('seed')).toMatchObject({ to: 'seed', value: 7, schemaDeclared: true });
      expect(m('steps')).toMatchObject({ to: 'steps', value: 20, schemaDeclared: true });
      expect(m('custom_parameters.image_file')).toMatchObject({ to: 'image_file', schemaDeclared: true });
      expect(m('custom_parameters.image_file_resize_mode')).toMatchObject({ to: 'image_file_resize_mode', schemaDeclared: true });
      // send badge uses the same planCanvasField: declared frames_num/frames_per_second ⇒ 会发送.
      const cp = JSON.stringify({ _canvas: { schemaProperties: j.actualRequest.schemaFields } });
      expect(schemaSendStatus('novita', 'num_frames', 25, cp)).toBe('will_send');
      expect(schemaSendStatus('novita', 'fps', 6, cp)).toBe('will_send');
    } finally { server.close(); }
  });

  it('route: custom_parameters.frames_num overrides canvas num_frames and is recorded as the override', async () => {
    const app = express(); app.use(express.json());
    const calls: Array<{ url: string; body: any }> = [];
    registerSchemaProviderRoutes(app, {
      fetch: async (_m: any, url: string, init?: any) => { calls.push({ url, body: init?.body ? JSON.parse(init.body) : undefined }); return new Response(JSON.stringify({ task_id: 't2' }), { status: 200 }); },
      key: () => 'k', record: (i: any) => i, durable: async (u: string) => ({ ok: true, dataUrl: u }),
    } as any);
    const server = app.listen(0);
    try {
      const port = (server.address() as AddressInfo).port;
      const r = await fetch(`http://127.0.0.1:${port}/api/schema-provider/novita/submit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'SVD-XT', prompt: 'a lone boat on a misty lake', seed: 7, steps: 20, fps: 6, num_frames: 25, isVideo: true, custom_parameters: { image_file: 'https://e.invalid/a.png', frames_num: 14 } }) });
      const j: any = await r.json();
      expect(r.status).toBe(200);
      const post = calls.find((c) => c.url.endsWith('/v3/async/img2video'))!;
      expect(post.body).toMatchObject({ frames_num: 14, frames_per_second: 6 });
      expect(post.body).not.toHaveProperty('num_frames');
      expect(j.actualRequest.parameters).toEqual(post.body);
      expect(j.actualRequest.mapping.find((x: any) => x.from === 'custom_parameters.frames_num')).toMatchObject({ to: 'frames_num', value: 14, overrides: 25 });
    } finally { server.close(); }
  });
});
