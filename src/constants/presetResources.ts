import type { WorkflowPreset } from '../types/graph';

/** Historical AIR map cleared with the 34 junk presets (2026-10-17). Kept empty so old imports resolve. */
export const PRESET_RESOURCES: Record<string, { air: string; file: string; kind: string; source: string }> = {};

/**
 * Vertical spacing only for shared prompt columns. Does not mutate topology or parameters.
 * New std-* presets are already laid out; this remains for any imported/custom graphs.
 */
export function correctPresetLayout(preset: WorkflowPreset): WorkflowPreset {
  const positive = preset.nodes.find(n => n.type === 'CLIPTextEncode');
  const negative = preset.nodes.find(n => n.type === 'CLIPTextEncodeNegative');
  const latent = preset.nodes.find(n => n.type === 'EmptyLatentImage');
  const image = preset.nodes.find(n => n.type === 'LoadImage');
  const checkpoint = preset.nodes.find(n => n.type === 'CheckpointLoaderSimple');
  const sharedPromptColumn = positive && ((negative && negative.pos.x === positive.pos.x) || (latent && latent.pos.x === positive.pos.x));
  return {
    ...preset,
    nodes: preset.nodes.map(node => {
      const y = sharedPromptColumn && node.id === positive.id ? 80
        : sharedPromptColumn && node.id === negative?.id && negative.pos.x === positive.pos.x ? 620
        : sharedPromptColumn && node.id === latent?.id && latent.pos.x === positive.pos.x ? 1000
        : image && checkpoint && image.pos.x === checkpoint.pos.x && node.id === checkpoint.id ? image.pos.y + 1000
        : node.pos.y;
      return y === node.pos.y ? node : { ...node, pos: { ...node.pos, y } };
    }),
  };
}

/** Identity for new std presets; layout-only pass for compatibility with older callers. */
export function correctPreset(preset: WorkflowPreset): WorkflowPreset {
  return correctPresetLayout(preset);
}
