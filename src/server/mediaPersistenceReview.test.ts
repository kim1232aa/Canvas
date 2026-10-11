import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {createMediaStore} from './mediaStore';
import {CanvasStore} from '../../hosting/store';

const bytes = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("/api/cloud/settings")</script></svg>');
const data = `data:image/svg+xml;base64,${bytes.toString('base64')}`;
let dir: string;
beforeEach(() => {dir = fs.mkdtempSync(path.join(os.tmpdir(), 'canvas-media-review-'));});
afterEach(() => {vi.restoreAllMocks(); fs.rmSync(dir, {recursive:true, force:true});});

function bucketFixture() {
  const objects = new Map<string, {bytes: Buffer; type: string}>();
  return {objects, bucket: {
    put: async (key: string, body: any, options: any) => {objects.set(key, {bytes: Buffer.from(body), type: options?.httpMetadata?.contentType});},
    get: async (key: string) => {const obj = objects.get(key); return obj ? {body: obj.bytes, size:obj.bytes.length, httpMetadata:{contentType:obj.type}, httpEtag:'"fixture"', arrayBuffer:async () => obj.bytes, writeHttpMetadata:(headers:Headers) => headers.set('Content-Type', obj.type)} : null;},
  }};
}

describe('media review persistence regressions', () => {
  it('isolates SVG documents in the actual R2 media response', async () => {
    const {bucket} = bucketFixture();
    const store = new CanvasStore({} as any, bucket as any, '');
    const url = await store.persistMedia(data);
    const response = await store.media(url.split('/').pop());
    expect(response.headers.get('content-security-policy')).toMatch(/sandbox(?:;|$)/);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  it('repairs truncated or metadata-less deduplicated bytes, never returns the fragment', () => {
    const store = createMediaStore(dir);
    const url = store.saveDataUrl(data), hash = url.split('/').pop()!;
    fs.writeFileSync(path.join(dir, hash), bytes.subarray(0, 5));
    expect(() => store.read(hash)).toThrow(/损坏|corrupt/);
    store.saveDataUrl(data);
    expect(store.read(hash)?.bytes).toEqual(bytes);
    fs.unlinkSync(path.join(dir, `${hash}.json`));
    expect(() => store.read(hash)).toThrow(/损坏|metadata|元数据/);
    store.saveDataUrl(data);
    expect(store.read(hash)?.bytes).toEqual(bytes);
  });

  it('locates video using stat and metadata without reading all media bytes', () => {
    const store = createMediaStore(dir);
    const url = store.saveBytes(Buffer.alloc(6000, 7), 'video/mp4');
    const read = vi.spyOn(fs, 'readFileSync');
    store.locate(url.split('/').pop()!);
    expect(read.mock.calls.every(([file]) => String(file).endsWith('.json'))).toBe(true);
  });

  it('retains exact UTF8 response text, integer precision and whitespace via explicit raw reference', async () => {
    const store = createMediaStore(dir);
    const raw = '{ "id":9007199254740993, "data":[{"b64_json":"' + Buffer.alloc(6000, 3).toString('base64') + '"}] }\n';
    const out = store.externalize({executionTrace:[{status:201,responseBody:raw}]}) as any;
    const ref = out.executionTrace[0].responseBody;
    expect(ref).toMatchObject({kind:'raw-response', sha256:crypto.createHash('sha256').update(raw).digest('hex'), size:Buffer.byteLength(raw), encoding:'utf-8', fidelity:'original'});
    expect((store as any).readRaw(ref.sha256)?.bytes.toString('utf8')).toBe(raw);
    expect(out.executionTrace[0].status).toBe(201);
    expect(JSON.stringify(out)).not.toContain('b64_json');
  });

  it('externalizes Gemini bare inline data and shared complete provenance', async () => {
    const {bucket} = bucketFixture();
    const store = new CanvasStore({} as any, bucket as any, '');
    const out = await store.persistMedia({requestMetadata:{submissions:[{parameters:{contents:{parts:[{inlineData:{mimeType:'image/png',data:Buffer.alloc(6000,2).toString('base64')}}]}}}],executionTrace:[{responseBody:'{"data":"original"}'}]}});
    expect(out.requestMetadata.submissions[0].parameters.contents.parts[0].inlineData.data).toMatch(/^\/api\/media\//);
    expect(out.requestMetadata.executionTrace[0].responseBody.kind).toBe('raw-response');
    expect(JSON.stringify(out).length).toBeLessThan(2000);
  });

  it('restores only typed media fields, never prompt/content/credentials/prototype/custom JSON', async () => {
    const local = createMediaStore(dir), url = local.saveDataUrl(data);
    const input = JSON.parse(JSON.stringify({image_url:url,prompt:url,content:url,text:url,customJSON:url,apiKey:url,metadata:{image_url:url},custom_parameters:{image_url:url,freeform:url},image:{url},images:[url]}));
    const out = local.resolveInput(input);
    expect(out.image_url).toBe(data);
    expect(out.image.url).toBe(data);
    expect(out.images[0]).toBe(data);
    for (const key of ['prompt','content','text','customJSON','apiKey']) expect(out[key]).toBe(url);
    expect(out.metadata.image_url).toBe(url);
    expect(out.custom_parameters.image_url).toBe(data);
    expect(out.custom_parameters.freeform).toBe(url);
    expect(() => local.resolveInput({image_url:'/api/media/'+'f'.repeat(64)})).toThrow(/输入媒体/);
    const {bucket} = bucketFixture();
    const hosted = new CanvasStore({} as any, bucket as any, '');
    await hosted.persistMedia(data);
    expect(await hosted.resolveInputMedia(input)).toEqual(out);
    await expect(hosted.resolveInputMedia({image_url:'/api/media/'+'f'.repeat(64)})).rejects.toMatchObject({errorSource:'local'});
  });
});
