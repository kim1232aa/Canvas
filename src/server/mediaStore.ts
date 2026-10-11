import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {decodeMediaData, MEDIA_DATA, MEDIA_REF, mediaContainer, mediaField, mediaInputError, rawReference, safeEntries, storageError} from './mediaContract';

export const MEDIA_URL_PREFIX = '/api/media/';
const HASH_PATTERN = /^[a-f0-9]{64}$/;
const digest = (bytes: Buffer) => crypto.createHash('sha256').update(bytes).digest('hex');
export interface StoredMedia {bytes: Buffer; contentType: string}
export interface MigrationResult<T> {items: T[]; migrated: number}

export function createMediaStore(directory: string) {
  fs.mkdirSync(directory, {recursive: true});
  const filePath = (hash: string, raw = false) => path.join(directory, `${raw ? 'raw-' : ''}${hash}`);

  function locate(hash: string, raw = false): {file: string; contentType: string} | null {
    if (!HASH_PATTERN.test(hash)) return null;
    const file = filePath(hash, raw);
    let stat: fs.Stats;
    try {stat = fs.statSync(file);} catch (error: any) {
      if (error.code === 'ENOENT') return null;
      throw storageError(error);
    }
    try {
      const meta = JSON.parse(fs.readFileSync(`${file}.json`, 'utf8'));
      if (!stat.isFile() || meta.sha256 !== hash || meta.size !== stat.size || !stat.size || typeof meta.contentType !== 'string') throw new Error('媒体损坏: 元数据或长度不匹配');
      return {file, contentType: meta.contentType};
    } catch (error) {throw storageError(new Error(`媒体损坏: 元数据不可用: ${(error as Error).message}`,{cause:error}));}
  }

  function read(hash: string, raw = false): StoredMedia | null {
    const located = locate(hash, raw);
    if (!located) return null;
    try {
      const bytes = fs.readFileSync(located.file);
      if (digest(bytes) !== hash) throw new Error('媒体损坏: SHA-256 不匹配');
      return {bytes,contentType:located.contentType};
    } catch (error) {throw storageError(error);}
  }

  function publish(bytes: Buffer, contentType: string, raw = false): string {
    const hash = digest(bytes), file = filePath(hash, raw);
    try {
      const existing = read(hash, raw);
      if (existing) return hash;
    } catch (error: any) {
      const cause = error.cause;
      if (cause?.code !== 'ENOENT' && !(cause instanceof SyntaxError) && !/媒体损坏/.test(cause?.message || '')) throw error;
    }
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, bytes, {flag:'wx'});
      fs.writeFileSync(`${temporary}.json`, JSON.stringify({contentType,sha256:hash,size:bytes.length}), {flag:'wx'});
      fs.renameSync(temporary, file);
      fs.renameSync(`${temporary}.json`, `${file}.json`);
    } catch (error) {throw storageError(error);} finally {
      for (const file of [temporary, `${temporary}.json`]) {
        try {fs.unlinkSync(file);} catch (error: any) {if (error.code !== 'ENOENT') throw storageError(error);}
      }
    }
    return hash;
  }

  function saveBytes(bytes: Buffer, contentType: string): string {
    const type = (contentType || '').split(';')[0].trim().toLowerCase();
    if (!/^(?:image|video|audio)\/[\w.+-]+$/.test(type)) throw mediaInputError('只能保存 image / video / audio 类型的媒体');
    if (!bytes.length) throw mediaInputError('媒体内容为空 (empty)，拒绝保存');
    return `${MEDIA_URL_PREFIX}${publish(bytes,type)}`;
  }
  function saveDataUrl(value: string): string {
    const {bytes,contentType} = decodeMediaData(value);
    return saveBytes(bytes,contentType);
  }
  function saveRaw(text: string) {
    const bytes = Buffer.from(text,'utf8');
    const hash = publish(bytes,'application/octet-stream',true);
    return rawReference(hash,bytes.length,text);
  }

  function externalize<T>(value: T): T {
    const visit = (node: any, key = ''): any => {
      if (typeof node === 'string') {
        if (key === 'responseBody') return saveRaw(node);
        return MEDIA_DATA.test(node) ? saveDataUrl(node) : node;
      }
      if (Array.isArray(node)) return node.map(item => visit(item,key));
      if (node && typeof node === 'object') {
        if (key === 'inlineData' && typeof node.data === 'string' && typeof node.mimeType === 'string' && !MEDIA_REF.test(node.data)) {
          return {...node,data:saveDataUrl(`data:${node.mimeType};base64,${node.data}`)};
        }
        return Object.fromEntries(safeEntries(node).map(([key,item]) => [key,visit(item,key)]));
      }
      return node;
    };
    return visit(value);
  }

  function resolveInput<T>(value: T): T {
    const visit = (node: any, media = false): any => {
      if (typeof node === 'string') {
        const match = media && MEDIA_REF.exec(node);
        if (!match) return node;
        const stored = read(match[1]);
        if (!stored) throw mediaInputError('输入媒体文件已不可用，请重新上传');
        return `data:${stored.contentType};base64,${stored.bytes.toString('base64')}`;
      }
      if (Array.isArray(node)) return node.map(item => visit(item,media));
      if (node && typeof node === 'object') return Object.fromEntries(safeEntries(node).map(([key,item]) => {
        const typedImage = node.type === 'image_url' && key === 'image_url';
        const active = mediaField(key) || typedImage || (media && (key === 'url' || key === 'data'));
        return [key,active || mediaContainer(key) ? visit(item,active) : item];
      }));
      return node;
    };
    return visit(value);
  }
  function migrateItems<T>(items: T[]): MigrationResult<T> {
    const next = externalize(items);
    return {items:next,migrated:items.reduce((count,item,index) => count + (JSON.stringify(item) !== JSON.stringify(next[index]) ? 1 : 0),0)};
  }
  return {directory,saveBytes,saveDataUrl,saveRaw,read,readRaw:(hash:string) => read(hash,true),locate,locateRaw:(hash:string) => locate(hash,true),externalize,resolveInput,migrateItems};
}
export type MediaStore = ReturnType<typeof createMediaStore>;
