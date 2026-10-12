import type { PersistRemoteResult } from '../utils/persistMediaAsDataUrl';

export interface GeneratedImage {
  url: string;
  seed: number | null;
  model?: string;
  index: number;
}

export interface TransientOutput {
  index: number;
  url: string;
  stage: 'response' | 'media' | 'history';
  error: string;
  errorSource: 'local' | 'network' | 'upstream' | 'storage';
  status?: number;
  mediaUrl?: string;
}

const MIME_BY_FORMAT: Record<string, string> = { png: 'image/png', jpeg: 'image/jpeg', jpg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

function mimeFor(format: unknown, fallback = 'image/png'): string {
  return MIME_BY_FORMAT[String(format ?? '').toLowerCase()] || fallback;
}

/** Map heterogeneous provider image arrays to URLs while keeping each image's own format, seed and model. */
export function normalizeGeneratedImages(images: unknown[], options: { outputFormat?: string } = {}): GeneratedImage[] {
  const defaultMime = mimeFor(options.outputFormat);
  return images.map((image: any, index) => {
    if (typeof image === 'string') return { url: image, seed: null, index };
    const seed = typeof image?.seed === 'number' ? image.seed : null;
    const model = typeof image?.model === 'string' && image.model ? image.model : undefined;
    let url = '';
    if (typeof image?.url === 'string' && image.url) url = image.url;
    else if (typeof image?.imageURL === 'string' && image.imageURL) url = image.imageURL;
    else if (typeof image?.b64_json === 'string' && image.b64_json) {
      url = image.b64_json.startsWith('data:') ? image.b64_json : `data:${mimeFor(image.output_format ?? image.format, defaultMime)};base64,${image.b64_json}`;
    } else if (typeof image?.inlineData?.data === 'string' && image.inlineData.data) {
      url = `data:${image.inlineData.mimeType || defaultMime};base64,${image.inlineData.data}`;
    }
    return { url, seed, ...(model ? { model } : {}), index };
  });
}

export interface PersistDeps<T> {
  persist: (url: string) => Promise<PersistRemoteResult>;
  record: (item: Record<string, any>) => Promise<T>;
}

/**
 * Persist each returned image as its own history item. A failure for one image never hides the others:
 * it is returned in transientOutputs with the stage and true source of the failure. skipIndexes lists
 * images the caller already persisted (normally index 0, the canvas preview); pass the full upstream array.
 */
export async function persistGeneratedImages<T>(images: unknown[], metadata: Record<string, any>, deps: PersistDeps<T>, options: { outputFormat?: string; skipIndexes?: number[] } = {}) {
  const historyItems: T[] = [];
  const transientOutputs: TransientOutput[] = [];
  const normalized = normalizeGeneratedImages(images, options);
  for (const image of normalized) {
    if (options.skipIndexes?.includes(image.index)) continue;
    if (!image.url) {
      transientOutputs.push({ index: image.index, url: '', stage: 'response', error: '上游返回的图片缺少 URL / Base64 数据', errorSource: 'upstream' });
      continue;
    }
    let durable: PersistRemoteResult;
    try {
      durable = await deps.persist(image.url);
    } catch (error: any) {
      durable = {
        ok: false,
        message: error?.message || String(error),
        errorSource: 'local',
      };
    }
    if (!durable.ok) {
      transientOutputs.push({ index: image.index, url: image.url, stage: 'media', error: durable.message, errorSource: durable.errorSource, ...(durable.status != null ? { status: durable.status } : {}) });
      continue;
    }
    try {
      historyItems.push(await deps.record({
        ...metadata,
        url: durable.dataUrl,
        seed: image.seed ?? metadata.seed ?? null,
        actualModel: image.model ?? metadata.actualModel ?? metadata.model,
        imageIndex: image.index,
        imageCount: normalized.length,
      }));
    } catch (error: any) {
      transientOutputs.push({ index: image.index, url: image.url, stage: 'history', error: error?.message || String(error), errorSource: 'storage', mediaUrl: durable.dataUrl });
    }
  }
  return {
    first: historyItems[0],
    historyItems,
    transientOutputs,
    ...(transientOutputs.length ? { historyWarning: `${transientOutputs.length} 张图片未能保存到历史；请从 transientOutputs 查看原因并另存` } : {}),
  };
}
