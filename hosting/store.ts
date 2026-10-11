import {decodeMediaData, MEDIA_DATA, MEDIA_REF, MEDIA_SANDBOX_CSP, mediaContainer, mediaField, mediaInputError, rawReference, safeEntries, storageError} from '../src/server/mediaContract';

type D1 = import('@cloudflare/workers-types').D1Database;
type Bucket = import('@cloudflare/workers-types').R2Bucket;
type Entry = { id: string; object_key: string; summary: string; updated_at: number };

export class CanvasStore {
  constructor(private db: D1, private bucket: Bucket, private encryptionSecret: string) {}

  private async encryptionKey() {
    if (!this.encryptionSecret) throw new Error('云端密钥加密配置不可用，请联系网站管理员');
    const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(this.encryptionSecret));
    return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  }

  async claimOwner(userId: string) {
    const key = await this.encryptionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, new TextEncoder().encode(userId)));
    const bytes = new Uint8Array(iv.length + cipher.length);
    bytes.set(iv); bytes.set(cipher, iv.length);
    await this.db.prepare('INSERT OR IGNORE INTO canvas_settings(field, encrypted_value) VALUES (?, ?)').bind('__sites_owner_user_id', Buffer.from(bytes).toString('base64')).run();
  }

  async settings(): Promise<Record<string, string>> {
    const rows = await this.db.prepare('SELECT field, encrypted_value FROM canvas_settings').all<{field: string; encrypted_value: string}>();
    const result: Record<string, string> = {};
    if (!rows.results.length) return result;
    const key = await this.encryptionKey();
    for (const row of rows.results) {
      const bytes = Uint8Array.from(atob(row.encrypted_value), c => c.charCodeAt(0));
      const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes.slice(0, 12)}, key, bytes.slice(12));
      result[row.field] = new TextDecoder().decode(plain);
    }
    return result;
  }

  async updateSettings(updates: Record<string, string>) {
    if (!Object.keys(updates).length) return;
    const key = await this.encryptionKey();
    const statements = [];
    for (const [field, value] of Object.entries(updates)) {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const cipher = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv}, key, new TextEncoder().encode(value)));
      const combined = new Uint8Array(iv.length + cipher.length);
      combined.set(iv); combined.set(cipher, iv.length);
      const encoded = Buffer.from(combined).toString('base64');
      statements.push(this.db.prepare('INSERT INTO canvas_settings(field, encrypted_value) VALUES (?, ?) ON CONFLICT(field) DO UPDATE SET encrypted_value = excluded.encrypted_value').bind(field, encoded));
    }
    await this.db.batch(statements);
  }

  async persistMedia(value: any, field = ''): Promise<any> {
    if (typeof value === 'string') {
      const raw = field === 'responseBody';
      if (!raw && !MEDIA_DATA.test(value)) return value;
      const {bytes,contentType} = raw ? {bytes:Buffer.from(value,'utf8'),contentType:'application/octet-stream'} : decodeMediaData(value);
      const hash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
      try {await this.bucket.put(`${raw ? 'raw' : 'media'}/${hash}`,bytes,{httpMetadata:{contentType},customMetadata:{sha256:hash,size:String(bytes.length)}});} catch (error) {throw storageError(error);}
      return raw ? rawReference(hash,bytes.length,value) : `/api/media/${hash}`;
    }
    if (Array.isArray(value)) return Promise.all(value.map(item => this.persistMedia(item,field)));
    if (value && typeof value === 'object') {
      if (field === 'inlineData' && typeof value.data === 'string' && typeof value.mimeType === 'string' && !MEDIA_REF.test(value.data)) return {...value,data:await this.persistMedia(`data:${value.mimeType};base64,${value.data}`)};
      return Object.fromEntries(await Promise.all(safeEntries(value).map(async ([key,item]) => [key,await this.persistMedia(item,key)])));
    }
    return value;
  }

  async resolveInputMedia(value: any, media = false): Promise<any> {
    if (typeof value === 'string') {
      const match = media && MEDIA_REF.exec(value);
      if (!match) return value;
      let object;
      try {object = await this.bucket.get(`media/${match[1]}`);} catch (error) {throw storageError(error);}
      if (!object) throw mediaInputError('输入媒体文件已不可用，请重新上传');
      try {
        const bytes = Buffer.from(await object.arrayBuffer());
        const hash = Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
        if (hash !== match[1]) throw new Error('媒体损坏: SHA-256 不匹配');
        return `data:${object.httpMetadata?.contentType || 'application/octet-stream'};base64,${bytes.toString('base64')}`;
      } catch (error) {throw storageError(error);}
    }
    if (Array.isArray(value)) return Promise.all(value.map(item => this.resolveInputMedia(item,media)));
    if (value && typeof value === 'object') return Object.fromEntries(await Promise.all(safeEntries(value).map(async ([key,item]) => {
      const active = mediaField(key) || (media && (key === 'url' || key === 'data'));
      return [key,active || mediaContainer(key) ? await this.resolveInputMedia(item,active) : item];
    })));
    return value;
  }

  async put(kind: 'project' | 'history', item: any): Promise<any> {
    const stored = await this.persistMedia(item);
    const objectKey = `${kind}/${crypto.randomUUID()}.json`;
    const previous = await this.db.prepare('SELECT object_key FROM canvas_entries WHERE kind = ? AND id = ?').bind(kind, stored.id).first<{object_key: string}>();
    const summary = kind === 'project' ? {
      id: stored.id, name: stored.name, description: stored.description, canvasMode: stored.canvasMode,
      frameCount: stored.spatialFrames?.length || 0, nodeCount: stored.nodes?.length || 0,
      thumbnail: stored.thumbnail || stored.spatialFrames?.[0]?.imageUrl || '',
      createdAt: stored.createdAt, updatedAt: stored.updatedAt,
    } : {id: stored.id, url: stored.url, imageUrl: stored.imageUrl, timestamp: stored.timestamp};
    await this.bucket.put(objectKey, JSON.stringify(stored), {httpMetadata: {contentType: 'application/json'}});
    try {
      await this.db.prepare('INSERT INTO canvas_entries(kind, id, object_key, summary, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(kind, id) DO UPDATE SET object_key = excluded.object_key, summary = excluded.summary, updated_at = excluded.updated_at').bind(kind, stored.id, objectKey, JSON.stringify(summary), stored.updatedAt || stored.timestamp || Date.now()).run();
    } catch (error) {
      await this.bucket.delete(objectKey);
      throw error;
    }
    // Old revision objects remain readable by concurrent in-flight requests.
    // Entry deletion removes the active payload; media are content-addressed and reusable.
    void previous;
    if (kind === 'history') {
      const stale = await this.db.prepare('SELECT id FROM canvas_entries WHERE kind = ? ORDER BY updated_at DESC LIMIT -1 OFFSET 500').bind('history').all<{id: string}>();
      if (stale.results.length) await this.remove('history', stale.results.map(row => row.id));
    }
    return stored;
  }

  async get(kind: string, id: string): Promise<any | null> {
    const row = await this.db.prepare('SELECT object_key FROM canvas_entries WHERE kind = ? AND id = ?').bind(kind, id).first<{object_key: string}>();
    if (!row) return null;
    const object = await this.bucket.get(row.object_key);
    if (!object) throw new Error('云端项目数据不可用，请稍后重试');
    return object.json();
  }

  async summaries(kind: string): Promise<any[]> {
    const rows = await this.db.prepare('SELECT summary FROM canvas_entries WHERE kind = ? ORDER BY updated_at DESC').bind(kind).all<{summary: string}>();
    return rows.results.map(row => JSON.parse(row.summary));
  }

  async history(): Promise<any[]> {
    const rows = await this.db.prepare('SELECT id, object_key, summary, updated_at FROM canvas_entries WHERE kind = ? ORDER BY updated_at DESC LIMIT 500').bind('history').all<Entry>();
    const items = [];
    for (let offset = 0; offset < rows.results.length; offset += 8) {
      const batch = await Promise.all(rows.results.slice(offset, offset + 8).map(async row => {
        const object = await this.bucket.get(row.object_key);
        if (!object) throw new Error('生成历史数据不可用，请稍后重试');
        return object.json();
      }));
      items.push(...batch);
    }
    return items;
  }

  async remove(kind: string, ids: string[]) {
    for (const id of ids) {
      const previous = await this.db.prepare('SELECT object_key FROM canvas_entries WHERE kind = ? AND id = ?').bind(kind, id).first<{object_key: string}>();
      await this.db.prepare('DELETE FROM canvas_entries WHERE kind = ? AND id = ?').bind(kind, id).run();
      if (previous) await this.bucket.delete(previous.object_key);
    }
  }

  async count(kind: string): Promise<number> {
    const row = await this.db.prepare('SELECT COUNT(*) AS count FROM canvas_entries WHERE kind = ?').bind(kind).first<{count: number}>();
    return row?.count ?? 0;
  }

  async media(hash: string, range?: string, raw = false): Promise<Response> {
    if (!/^[a-f0-9]{64}$/.test(hash)) return Response.json({error:'无效的媒体地址',errorSource:'local'},{status:400});
    try {
      const key = `${raw ? 'raw' : 'media'}/${hash}`;
      const object = await this.bucket.get(key);
      if (!object) return Response.json({error:'媒体不存在',errorSource:'local'},{status:404});
      const headers = new Headers({'Cache-Control':'private, max-age=86400','X-Content-Type-Options':'nosniff','Content-Security-Policy':MEDIA_SANDBOX_CSP,'Accept-Ranges':'bytes'});
      object.writeHttpMetadata(headers as any);
      if (raw) {headers.set('Content-Type','application/octet-stream');headers.set('Content-Disposition','attachment');}
      headers.set('etag',object.httpEtag);
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        const start = match?.[1] ? Number(match[1]) : Math.max(0,object.size-Number(match?.[2]));
        const end = match?.[1] ? (match[2] ? Math.min(Number(match[2]),object.size-1) : object.size-1) : object.size-1;
        if (!match || start > end || start >= object.size || !Number.isFinite(start)) return new Response(null,{status:416,headers:{'Content-Range':`bytes */${object.size}`}});
        const part = await this.bucket.get(key,{range:{offset:start,length:end-start+1}});
        if (!part) throw new Error('媒体读取期间消失');
        headers.set('Content-Range',`bytes ${start}-${end}/${object.size}`);
        headers.set('Content-Length',String(end-start+1));
        return new Response(part.body as any,{status:206,headers});
      }
      headers.set('Content-Length',String(object.size));
      return new Response(object.body as any,{headers});
    } catch (error) {throw storageError(error);}
  }
}
