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

  async persistMedia(value: any): Promise<any> {
    if (typeof value === 'string' && /^data:(image|video|audio)\/[\w.+-]+;base64,/.test(value)) {
      const comma = value.indexOf(',');
      const type = value.slice(5, value.indexOf(';'));
      const bytes = Buffer.from(value.slice(comma + 1), 'base64');
      const hash = Buffer.from(await crypto.subtle.digest('SHA-256', bytes)).toString('hex');
      await this.bucket.put(`media/${hash}`, bytes, {httpMetadata: {contentType: type}});
      return `/api/media/${hash}`;
    }
    if (Array.isArray(value)) {
      const result = [];
      for (const item of value) result.push(await this.persistMedia(item));
      return result;
    }
    if (value && typeof value === 'object') {
      const result: Record<string, any> = {};
      for (const [key, item] of Object.entries(value)) result[key] = await this.persistMedia(item);
      return result;
    }
    return value;
  }

  async resolveInputMedia(value: any): Promise<any> {
    if (typeof value === 'string' && /^\/api\/media\/[a-f0-9]{64}$/.test(value)) {
      const object = await this.bucket.get(value.slice(5));
      if (!object) throw new Error('输入媒体文件已不可用，请重新上传');
      const data = Buffer.from(await object.arrayBuffer()).toString('base64');
      return `data:${object.httpMetadata?.contentType || 'application/octet-stream'};base64,${data}`;
    }
    if (Array.isArray(value)) return Promise.all(value.map(v => this.resolveInputMedia(v)));
    if (value && typeof value === 'object') {
      const result: Record<string, any> = {};
      for (const [key, item] of Object.entries(value)) result[key] = await this.resolveInputMedia(item);
      return result;
    }
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

  async media(hash: string): Promise<Response> {
    if (!/^[a-f0-9]{64}$/.test(hash)) return Response.json({error: '无效的媒体地址'}, {status: 400});
    const object = await this.bucket.get(`media/${hash}`);
    if (!object) return Response.json({error: '媒体不存在'}, {status: 404});
    const headers = new Headers({'Cache-Control': 'private, max-age=86400', 'X-Content-Type-Options': 'nosniff'});
    object.writeHttpMetadata(headers as any);
    headers.set('etag', object.httpEtag);
    return new Response(object.body as any, {headers});
  }
}
