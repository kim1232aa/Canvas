import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createMediaStore, MEDIA_URL_PREFIX} from './mediaStore';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAMAAAADCAIAAADZSiLoAAAAEElEQVR4nGP4z8AAQQxYWACPjgj4kWPEuQAAAABJRU5ErkJggg==', 'base64');
const dataUrl = (buf: Buffer, type = 'image/png') => `data:${type};base64,${buf.toString('base64')}`;

let dir: string;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'media-store-')); });
afterEach(() => { fs.rmSync(dir, {recursive: true, force: true}); });

describe('mediaStore', () => {
  it('stores a data URL as a content-addressed file and returns a short /api/media URL', () => {
    const store = createMediaStore(dir);
    const url = store.saveDataUrl(dataUrl(PNG));
    expect(url).toMatch(new RegExp(`^${MEDIA_URL_PREFIX}[a-f0-9]{64}$`));
    expect(url.length).toBeLessThan(100);
    const hash = url.slice(MEDIA_URL_PREFIX.length);
    expect(fs.readFileSync(path.join(dir, hash))).toEqual(PNG);
    expect(JSON.parse(fs.readFileSync(path.join(dir, `${hash}.json`), 'utf8')).contentType).toBe('image/png');
  });

  it('is idempotent for identical bytes', () => {
    const store = createMediaStore(dir);
    expect(store.saveDataUrl(dataUrl(PNG))).toBe(store.saveDataUrl(dataUrl(PNG)));
    expect(fs.readdirSync(dir).filter(f => !f.endsWith('.json'))).toHaveLength(1);
  });

  it('reads stored media back with its content type', () => {
    const store = createMediaStore(dir);
    const url = store.saveDataUrl(dataUrl(PNG, 'image/webp'));
    const media = store.read(url.slice(MEDIA_URL_PREFIX.length));
    expect(media?.contentType).toBe('image/webp');
    expect(media?.bytes).toEqual(PNG);
  });

  it('rejects path traversal and malformed hashes', () => {
    const store = createMediaStore(dir);
    expect(store.read('../etc/passwd')).toBeNull();
    expect(store.read('abc')).toBeNull();
    expect(store.read('a'.repeat(64))).toBeNull();
  });

  it('locates a stored file for streaming (range-capable) delivery', () => {
    const store = createMediaStore(dir);
    const hash = store.saveDataUrl(dataUrl(PNG)).slice(MEDIA_URL_PREFIX.length);
    expect(store.locate(hash)).toEqual({file: path.join(dir, hash), contentType: 'image/png'});
    expect(store.locate('../x')).toBeNull();
  });

  it('saves raw uploaded bytes with a declared content type', () => {
    const store = createMediaStore(dir);
    const url = store.saveBytes(PNG, 'image/png');
    expect(url).toBe(store.saveDataUrl(dataUrl(PNG)));
    expect(() => store.saveBytes(PNG, 'text/html')).toThrow(/image|video|audio/);
    expect(() => store.saveBytes(Buffer.alloc(0), 'image/png')).toThrow(/empty|空/i);
  });

  it('stores upstream text without parsing or rewriting b64_json', () => {
    const store = createMediaStore(dir);
    const body = JSON.stringify({data:[{b64_json:Buffer.alloc(6000,7).toString('base64')}],task_id:'t'});
    const out = store.externalize({executionTrace:[{status:200,responseBody:body}]}) as any;
    expect(out.executionTrace[0].responseBody.kind).toBe('raw-response');
    expect(store.readRaw(out.executionTrace[0].responseBody.sha256)?.bytes.toString('utf8')).toBe(body);
  });

  it('also preserves short or non-JSON response bodies as raw evidence', () => {
    const store = createMediaStore(dir);
    for (const body of ['{"b64_json":"short"}','not json b64_json']) {
      const out = store.externalize({responseBody:body}) as any;
      expect(store.readRaw(out.responseBody.sha256)?.bytes.toString('utf8')).toBe(body);
    }
  });

  it('refuses non-media data URLs', () => {
    const store = createMediaStore(dir);
    expect(() => store.saveDataUrl('data:text/html;base64,PGgxPmhpPC9oMT4=')).toThrow(/image|video|audio/);
    expect(() => store.saveDataUrl('data:image/png;base64,')).toThrow(/empty|空/i);
  });

  it('externalizes every data URL inside nested values and leaves other strings alone', () => {
    const store = createMediaStore(dir);
    const out = store.externalize({url: dataUrl(PNG), list: [dataUrl(PNG, 'image/png'), 'https://x/y.png'], nested: {prompt: 'data: not media'}, n: 3});
    expect(out.url).toMatch(/^\/api\/media\//);
    expect(out.list[0]).toBe(out.url);
    expect(out.list[1]).toBe('https://x/y.png');
    expect(out.nested.prompt).toBe('data: not media');
    expect(out.n).toBe(3);
  });

  it('resolves /api/media URLs in a request body back to data URLs for upstream calls', () => {
    const store = createMediaStore(dir);
    const url = store.saveDataUrl(dataUrl(PNG));
    const out = store.resolveInput({image_url: url, other: ['/api/media/' + 'f'.repeat(64)], keep: 'x'});
    expect(out.image_url).toBe(dataUrl(PNG));
    expect(out.other[0]).toBe('/api/media/' + 'f'.repeat(64));
    expect(out.keep).toBe('x');
  });

  it('migrates an existing history list and reports what changed', () => {
    const store = createMediaStore(dir);
    const items = [{id: 'a', url: dataUrl(PNG)}, {id: 'b', url: 'https://x/y.png'}];
    const result = store.migrateItems(items);
    expect(result.migrated).toBe(1);
    expect(result.items[0].url).toMatch(/^\/api\/media\//);
    expect(result.items[1].url).toBe('https://x/y.png');
    expect(items[0].url.startsWith('data:')).toBe(true);
  });
});
