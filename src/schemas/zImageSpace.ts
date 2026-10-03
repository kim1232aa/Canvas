// Verified from the live official /gradio_api/info on 2026-10-02.
// Shared by the UI schema and server; no generated defaults are injected.
export const Z_IMAGE_SOURCE = 'https://tongyi-mai-z-image-turbo.hf.space/gradio_api/info';
export const Z_IMAGE_RESOLUTIONS: string[] = [
  "1024x1024 ( 1:1 )",
  "1152x896 ( 9:7 )",
  "896x1152 ( 7:9 )",
  "1152x864 ( 4:3 )",
  "864x1152 ( 3:4 )",
  "1248x832 ( 3:2 )",
  "832x1248 ( 2:3 )",
  "1280x720 ( 16:9 )",
  "720x1280 ( 9:16 )",
  "1344x576 ( 21:9 )",
  "576x1344 ( 9:21 )",
  "1280x1280 ( 1:1 )",
  "1440x1120 ( 9:7 )",
  "1120x1440 ( 7:9 )",
  "1472x1104 ( 4:3 )",
  "1104x1472 ( 3:4 )",
  "1536x1024 ( 3:2 )",
  "1024x1536 ( 2:3 )",
  "1536x864 ( 16:9 )",
  "864x1536 ( 9:16 )",
  "1680x720 ( 21:9 )",
  "720x1680 ( 9:21 )",
  "1536x1536 ( 1:1 )",
  "1728x1344 ( 9:7 )",
  "1344x1728 ( 7:9 )",
  "1728x1296 ( 4:3 )",
  "1296x1728 ( 3:4 )",
  "1872x1248 ( 3:2 )",
  "1248x1872 ( 2:3 )",
  "2048x1152 ( 16:9 )",
  "1152x2048 ( 9:16 )",
  "2016x864 ( 21:9 )",
  "864x2016 ( 9:21 )"
];

export function buildZImagePayload(input: Record<string, unknown>) {
  if (typeof input.resolution !== 'string' || !Z_IMAGE_RESOLUTIONS.includes(input.resolution)) {
    throw new Error('请为 Z-Image 选择官方 resolution 分辨率选项');
  }
  // The live schema lists seed as an integer with no upper bound. JS must still
  // represent it exactly; the Space source explicitly accepts -1 for random.
  for (const [field, min, max] of [['seed', -1, Number.MAX_SAFE_INTEGER], ['steps', 1, 100], ['shift', 1, 10]] as const) {
    const value = input[field];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (field !== 'shift' && !Number.isInteger(value))) {
      throw new Error(`Z-Image 必须填写有效的 ${field}（${min}–${max}${field === 'shift' ? '' : '，整数'}）`);
    }
  }
  if (typeof input.random_seed !== 'boolean') throw new Error('Z-Image 必须提供 random_seed 布尔值');
  if (!Array.isArray(input.gallery_images)) throw new Error('Z-Image 必须提供 gallery_images 数组');
  return {data: [input.prompt ?? '', input.resolution, input.seed, input.steps, input.shift, input.random_seed, input.gallery_images]};
}
