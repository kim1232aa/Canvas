import type { WidgetOption } from '../types/graph';

/**
 * Official video models shown on AIVideoNode.
 * Each id and aspect-ratio flag was copied from an opened official page on 2026-11-07.
 * `sendsAspectRatio: false` means that page's request schema has no aspect_ratio / aspectRatio / ratio field.
 */
export interface VideoModelEntry {
  provider: string;
  id: string;
  label: string;
  sourceUrl: string;
  sendsAspectRatio: boolean;
}

export const AI_VIDEO_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'] as const;

export const AI_VIDEO_MODEL_REGISTRY: VideoModelEntry[] = [
  {
    provider: 'fal',
    id: 'fal-ai/wan/v2.2-a14b/text-to-video/lora',
    label: '[Fal] Wan 2.2 A14B Text-to-Video LoRA',
    sourceUrl: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/wan/v2.2-a14b/text-to-video/lora',
    sendsAspectRatio: true,
  },
  {
    provider: 'fal',
    id: 'fal-ai/wan/v2.2-a14b/image-to-video/lora',
    label: '[Fal] Wan 2.2 A14B Image-to-Video LoRA',
    sourceUrl: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/wan/v2.2-a14b/image-to-video/lora',
    sendsAspectRatio: true,
  },
  {
    provider: 'fal',
    id: 'fal-ai/wan/v2.7/text-to-video',
    label: '[Fal] Wan 2.7 Text-to-Video',
    sourceUrl: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/wan/v2.7/text-to-video',
    sendsAspectRatio: true,
  },
  {
    provider: 'fal',
    id: 'fal-ai/wan/v2.7/image-to-video',
    label: '[Fal] Wan 2.7 Image-to-Video',
    sourceUrl: 'https://fal.ai/models/fal-ai/wan/v2.7/image-to-video/api',
    sendsAspectRatio: true,
  },
  {
    provider: 'fal',
    id: 'fal-ai/kling-video/v3/standard/text-to-video',
    label: '[Fal] Kling V3 Standard Text-to-Video',
    sourceUrl: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/v3/standard/text-to-video',
    sendsAspectRatio: true,
  },
  {
    provider: 'fal',
    id: 'fal-ai/kling-video/v3/standard/image-to-video',
    label: '[Fal] Kling V3 Standard Image-to-Video',
    sourceUrl: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/kling-video/v3/standard/image-to-video',
    sendsAspectRatio: false,
  },
  {
    provider: 'fal',
    id: 'fal-ai/minimax/video-01',
    label: '[Fal] MiniMax Video-01 Text-to-Video',
    sourceUrl: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/minimax/video-01',
    sendsAspectRatio: false,
  },
  {
    provider: 'fal',
    id: 'fal-ai/minimax/video-01/image-to-video',
    label: '[Fal] MiniMax Video-01 Image-to-Video',
    sourceUrl: 'https://fal.ai/models/fal-ai/minimax/video-01/image-to-video/api',
    sendsAspectRatio: false,
  },
  {
    provider: 'fal',
    id: 'fal-ai/ltx-video',
    label: '[Fal · research-only] LTX Video',
    sourceUrl: 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=fal-ai/ltx-video',
    sendsAspectRatio: false,
  },
  {
    provider: 'agnes',
    id: 'agnes-video-2.5',
    label: '[Agnes] Agnes Video 2.5',
    sourceUrl: 'https://wiki.agnes-ai.com/en/docs/agnes-video-25',
    sendsAspectRatio: true,
  },
  {
    provider: 'agnes',
    id: 'agnes-video-2.5-flash',
    label: '[Agnes] Agnes Video 2.5 Flash',
    sourceUrl: 'https://wiki.agnes-ai.com/en/docs/agnes-video-25-flash',
    sendsAspectRatio: true,
  },
  {
    provider: 'grok_compat',
    id: 'grok-imagine-video',
    label: '[Grok 兼容中转] Imagine Video',
    sourceUrl: 'https://docs.x.ai/developers/model-capabilities/video/overview',
    sendsAspectRatio: true,
  },
  {
    provider: 'grok_compat',
    id: 'grok-imagine-video-1.5',
    label: '[Grok 兼容中转] Imagine Video 1.5',
    sourceUrl: 'https://docs.x.ai/developers/model-capabilities/video/generation',
    sendsAspectRatio: true,
  },
  {
    provider: 'wavespeed',
    id: 'wavespeed-ai/wan-2.2/t2v-720p-lora',
    label: '[WaveSpeed] Wan 2.2 T2V 720p LoRA',
    sourceUrl: 'https://wavespeed.ai/docs/docs-api/wavespeed-ai/wan-2.2-t2v-720p-lora',
    sendsAspectRatio: false,
  },
  {
    provider: 'wavespeed',
    id: 'wavespeed-ai/wan-2.2/i2v-720p-lora',
    label: '[WaveSpeed] Wan 2.2 I2V 720p LoRA',
    sourceUrl: 'https://wavespeed.ai/models/wavespeed-ai/wan-2.2/i2v-720p-lora',
    sendsAspectRatio: false,
  },
  {
    provider: 'sogni',
    id: 'ltx25',
    label: '[Sogni] LTX 2.5 (ltx25)',
    sourceUrl: 'https://raw.githubusercontent.com/Sogni-AI/sogni-protocol/main/schemas/tools/generate_video.schema.json',
    sendsAspectRatio: true,
  },
  {
    provider: 'sogni',
    id: 'wan22',
    label: '[Sogni] Wan 2.2 (wan22)',
    sourceUrl: 'https://raw.githubusercontent.com/Sogni-AI/sogni-protocol/main/schemas/tools/generate_video.schema.json',
    sendsAspectRatio: true,
  },
  {
    provider: 'sogni',
    id: 'minimax-h3-t2v',
    label: '[Sogni] MiniMax H3 Text-to-Video',
    sourceUrl: 'https://raw.githubusercontent.com/Sogni-AI/sogni-protocol/main/schemas/tools/generate_video.schema.json',
    sendsAspectRatio: true,
  },
  {
    provider: 'krea',
    id: 'video/alibaba/wan-3.0',
    label: '[Krea] Wan 3.0',
    sourceUrl: 'https://www.krea.ai/docs/api-reference/video/wan-30.md',
    sendsAspectRatio: true,
  },
  {
    provider: 'venice',
    id: 'seedance-2-0-text-to-video-basic',
    label: '[Venice] Seedance 2.0 Text-to-Video',
    sourceUrl: 'https://docs.venice.ai/models/video.md',
    sendsAspectRatio: true,
  },
  {
    provider: 'venice',
    id: 'wan-2-7-text-to-video',
    label: '[Venice] Wan 2.7 Text-to-Video',
    sourceUrl: 'https://docs.venice.ai/models/wan-2-7-video.md',
    sendsAspectRatio: true,
  },
  {
    provider: 'replicate',
    id: 'wan-video/wan-2.2-t2v-fast',
    label: '[Replicate] Wan 2.2 Fast Text-to-Video',
    sourceUrl: 'https://replicate.com/wan-video/wan-2.2-t2v-fast/api',
    sendsAspectRatio: true,
  },
  {
    provider: 'replicate',
    id: 'wan-video/wan-2.2-i2v-fast',
    label: '[Replicate] Wan 2.2 Fast Image-to-Video',
    sourceUrl: 'https://replicate.com/wan-video/wan-2.2-i2v-fast',
    sendsAspectRatio: false,
  },
  {
    provider: 'civitai',
    id: 'wan:v2.2:fal:text-to-video',
    label: '[Civitai] Wan 2.2 Fal Text-to-Video',
    sourceUrl: 'https://orchestration.civitai.com/v2/consumer/recipes/videoGen/openapi.json',
    sendsAspectRatio: true,
  },
  {
    provider: 'together',
    id: 'Wan-AI/wan2.7-t2v',
    label: '[Together] Wan 2.7 Text-to-Video',
    sourceUrl: 'https://docs.together.ai/docs/wan2.7-quickstart',
    sendsAspectRatio: true,
  },
  {
    provider: 'aimlapi',
    id: 'alibaba/wan2.2-t2v-plus',
    label: '[AIMLAPI] Wan 2.2 Plus Text-to-Video',
    sourceUrl: 'https://docs.aimlapi.com/api-references/video-models/alibaba-cloud/wan-2.2-plus-text-to-video',
    sendsAspectRatio: true,
  },
  {
    provider: 'muapi',
    id: 'wan2.2-text-to-video',
    label: '[MuAPI] Wan 2.2 Text-to-Video',
    sourceUrl: 'https://muapi.ai/playground/wan2.2-text-to-video/api',
    sendsAspectRatio: true,
  },
];

export function aiVideoModelOptions(): WidgetOption[] {
  return [
    { label: '未选择 (请先选择模型)', value: '' },
    ...AI_VIDEO_MODEL_REGISTRY.map((entry) => ({
      label: entry.label,
      value: entry.id,
      provider: entry.provider,
      description: entry.sourceUrl,
    })),
  ];
}

export function aiVideoAspectRatioOptions(): WidgetOption[] {
  return [
    { label: '未指定（不发送）', value: '' },
    ...AI_VIDEO_ASPECT_RATIOS.map((value) => ({ label: value, value })),
  ];
}

const byId = new Map(AI_VIDEO_MODEL_REGISTRY.map((entry) => [entry.id, entry]));

/** Static registry hint. A loaded model Schema still decides the actual request body. */
export function videoModelSendsAspectRatio(modelId: string | undefined): boolean | undefined {
  const id = (modelId || '').trim();
  if (!id) return undefined;
  return byId.get(id)?.sendsAspectRatio;
}
