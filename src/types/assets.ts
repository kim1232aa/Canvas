export interface MediaAsset {
  id: string;
  url: string;
  type: 'image' | 'video';
  title?: string;
  prompt: string;
  negativePrompt?: string;
  provider: string;
  model: string;
  timestamp: number;
  width?: number;
  height?: number;
  seed?: number | null;
  steps?: number | null;
  cfg?: number | null;
  sampler?: string;
  scheduler?: string;
  loras?: Array<{ name: string; strength?: number }>;
  isReference?: boolean;
}
