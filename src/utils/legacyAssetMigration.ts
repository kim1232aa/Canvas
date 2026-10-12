import type { MediaAsset } from '../components/AssetManagerModal';

const INLINE_MEDIA = /^data:(?:image|video|audio)\/[\w.+-]+;base64,/;

type UploadResult = { url?: string; error?: string };

export function createInlineAssetMigrator(upload: (dataUrl: string) => Promise<string>) {
  const results = new Map<string, Promise<UploadResult>>();
  let active = 0;
  const waiting: Array<() => void> = [];
  const run = async (url: string): Promise<UploadResult> => {
    if (active >= 3) await new Promise<void>(resolve => waiting.push(resolve));
    active++;
    try {
      const saved = await upload(url);
      if (!saved || INLINE_MEDIA.test(saved)) throw new Error('上传未返回持久化地址');
      return { url: saved };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    } finally {
      active--;
      waiting.shift()?.();
    }
  };
  return async (assets: MediaAsset[], retry = false): Promise<{ assets: MediaAsset[]; failures: string[] }> => {
    if (retry) {
      for (const [url, pending] of results) {
        const result = await pending;
        if (result.error) results.delete(url);
      }
    }
    const outcomes = await Promise.all(assets.map(async asset => {
      if (!INLINE_MEDIA.test(asset.url)) return { asset };
      let pending = results.get(asset.url);
      if (!pending) {
        pending = run(asset.url);
        results.set(asset.url, pending);
      }
      const result = await pending;
      return result.url
        ? { asset: { ...asset, url: result.url } }
        : { asset, failure: `${asset.title || asset.id}：${result.error}` };
    }));
    return { assets: outcomes.map(item => item.asset), failures: outcomes.flatMap(item => item.failure ? [item.failure] : []) };
  };
}

export async function migrateInlineAssets(assets: MediaAsset[], upload: (dataUrl: string) => Promise<string>) {
  return createInlineAssetMigrator(upload)(assets);
}

export function mergeMigratedAssets(current: MediaAsset[], original: MediaAsset[], migrated: MediaAsset[]): MediaAsset[] {
  return current.map(asset => {
    const index = original.findIndex(item => item.id === asset.id && item.url === asset.url);
    return index >= 0 && migrated[index]?.url !== asset.url ? { ...asset, url: migrated[index].url } : asset;
  });
}

export function parseAssetCache(value: string): MediaAsset[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some(item => !item || typeof item !== 'object'
    || typeof item.id !== 'string' || typeof item.url !== 'string'
    || !['image', 'video', 'audio'].includes(item.type))) {
    throw new Error('素材缓存格式无效，原始数据已保留');
  }
  return parsed;
}
