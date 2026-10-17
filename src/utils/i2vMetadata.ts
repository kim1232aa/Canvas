/**
 * cleanup-2026-10-17: does existing catalog metadata already mark this model as image-to-video?
 * Sources (no invented model lists):
 *  1) NODE_DEFINITIONS.AIVideoNode model-widget option labels
 *  2) VideoDriver.supportedModels name / description
 * Returns true / false when metadata is decisive; null when unknown (do not invent).
 */
import { NODE_DEFINITIONS } from '../constants/nodes';
import { VideoDriver } from '../engines/drivers/VideoDriver';

const I2V_RE = /Image-to-Video|图生视频|\bi2v\b/i;
const T2V_RE = /Text-to-Video|文生视频|\bt2v\b/i;

export function modelRequiresInputImageFromMetadata(model: string | undefined | null): boolean | null {
  const id = String(model || '').trim();
  if (!id) return null;

  const opts = (NODE_DEFINITIONS.AIVideoNode?.widgets || []).find((w: any) => w.name === 'model')?.options || [];
  const hit = opts.find((o: any) => String(o?.value) === id);
  if (hit) {
    const label = String(hit.label || '');
    if (I2V_RE.test(label)) return true;
    if (T2V_RE.test(label)) return false;
  }

  try {
    const catalog = new VideoDriver().supportedModels || [];
    const m = catalog.find((x) => x.id === id);
    if (m) {
      const text = `${m.name || ''} ${m.description || ''}`;
      if (I2V_RE.test(text)) return true;
      if (T2V_RE.test(text)) return false;
    }
  } catch { /* driver construct failed — treat as unknown */ }

  return null;
}
