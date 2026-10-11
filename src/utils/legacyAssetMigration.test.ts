import { describe, expect, it } from 'vitest';
import { migrateInlineAssets } from './legacyAssetMigration';
import type { MediaAsset } from '../components/AssetManagerModal';

const asset = (url: string): MediaAsset => ({
  id: 'legacy-1', url, type: 'image', title: '旧素材', prompt: '', provider: '本地导入', model: '', timestamp: 1,
});

describe('legacy inline asset migration', () => {
  it('replaces stored base64 with the server URL and keeps the original when upload fails', async () => {
    const dataUrl = 'data:image/png;base64,AAAA';
    const result = await migrateInlineAssets(
      [asset(dataUrl), asset('/api/media/already-migrated')],
      async (value) => value === dataUrl ? '/api/media/new' : Promise.reject(new Error('不应上传')),
    );
    expect(result.assets.map((item) => item.url)).toEqual(['/api/media/new', '/api/media/already-migrated']);
    expect(result.failures).toEqual([]);

    const failed = await migrateInlineAssets([asset(dataUrl)], async () => { throw new Error('存储已满'); });
    expect(failed.assets[0].url).toBe(dataUrl);
    expect(failed.failures).toEqual(['旧素材：存储已满']);
  });
});
