import { describe, expect, it } from 'vitest';
import { migrateInlineAssets, createInlineAssetMigrator, mergeMigratedAssets, parseAssetCache } from './legacyAssetMigration';
import type { MediaAsset } from '../components/AssetManagerModal';

const asset = (url: string): MediaAsset => ({
  id: 'legacy-1', url, type: 'image', title: '旧素材', prompt: '', provider: '本地导入', model: '', timestamp: 1,
});

describe('legacy inline asset migration', () => {
  it('bounds uploads and does not retry failures until explicitly requested', async () => {
    let active = 0;
    let maximum = 0;
    let calls = 0;
    const migrate = createInlineAssetMigrator(async () => {
      calls++;
      active++;
      maximum = Math.max(maximum, active);
      await new Promise(resolve => setTimeout(resolve, 2));
      active--;
      throw new Error('offline');
    });
    const items = Array.from({ length: 9 }, (_, i) => ({ ...asset(`data:image/png;base64,AAA${i}`), id: String(i) }));
    const first = await migrate(items);
    await migrate(items);
    expect(calls).toBe(9);
    expect(maximum).toBeLessThanOrEqual(3);
    expect(first.assets).toEqual(items);
    await migrate(items, true);
    expect(calls).toBe(18);
  });

  it('shares in-flight uploads across reopen and retains success for persistence retry', async () => {
    let calls = 0;
    const migrate = createInlineAssetMigrator(async () => {
      calls++;
      await new Promise(resolve => setTimeout(resolve, 2));
      return '/api/media/saved';
    });
    const items = [asset('data:image/png;base64,AAAA')];
    const [a, b] = await Promise.all([migrate(items), migrate(items)]);
    expect(a.assets[0].url).toBe('/api/media/saved');
    expect(b.assets[0].url).toBe('/api/media/saved');
    expect((await migrate(items, true)).assets[0].url).toBe('/api/media/saved');
    expect(calls).toBe(1);
  });

  it('merges by original identity and URL without resurrecting deletions or overwriting new media', () => {
    const original = [asset('data:image/png;base64,AAAA')];
    const migrated = [{ ...original[0], url: '/api/media/new' }];
    expect(mergeMigratedAssets([], original, migrated)).toEqual([]);
    const replacement = [{ ...original[0], url: '/api/media/replacement' }];
    expect(mergeMigratedAssets(replacement, original, migrated)).toEqual(replacement);
    const current = [{ ...original[0], title: 'renamed' }, { ...asset('/api/media/added'), id: 'new' }];
    expect(mergeMigratedAssets(current, original, migrated)).toEqual([{ ...current[0], url: '/api/media/new' }, current[1]]);
  });

  it('rejects corrupt caches rather than silently replacing user data', () => {
    expect(() => parseAssetCache('{broken')).toThrow();
    expect(() => parseAssetCache('{"assets":[]}')).toThrow();
    expect(() => parseAssetCache('[{"id":"x"}]')).toThrow();
    expect(parseAssetCache(JSON.stringify([asset('/api/media/a')]))).toEqual([asset('/api/media/a')]);
  });
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
