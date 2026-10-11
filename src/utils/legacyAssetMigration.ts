import type { MediaAsset } from '../components/AssetManagerModal';

const INLINE_MEDIA = /^data:(?:image|video|audio)\/[\w.+-]+;base64,/;

export async function migrateInlineAssets(
  assets: MediaAsset[],
  upload: (dataUrl: string) => Promise<string>,
): Promise<{ assets: MediaAsset[]; failures: string[] }> {
  const failures: string[] = [];
  const migrated = await Promise.all(assets.map(async (asset) => {
    if (!INLINE_MEDIA.test(asset.url)) return asset;
    try {
      return { ...asset, url: await upload(asset.url) };
    } catch (error) {
      failures.push(`${asset.title || asset.id}：${error instanceof Error ? error.message : String(error)}`);
      return asset;
    }
  }));
  return { assets: migrated, failures };
}
