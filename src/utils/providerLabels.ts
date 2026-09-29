/** Human-readable provider labels for node titles (never raw ids like GROK_COMPAT). */
export const PROVIDER_TITLE_LABEL: Record<string, string> = {
  grok_compat: 'Grok 兼容中转',
  openai_compat: 'OpenAI 兼容中转',
  gemini: 'Gemini',
  fal: 'Fal.ai',
  civitai: 'Civitai',
  huggingface: 'Hugging Face',
  modelscope: '魔搭 CN',
  modelscope_ai: '魔搭 AI',
  agnes: 'Agnes',
  nanogpt: 'NanoGPT',
  sensenova: 'SenseNova',
  tensorart: 'Tensor.Art',
  video: 'AI Video',
};

/** CheckpointLoader node title that tracks the current provider (or model short name). */
export function checkpointNodeTitle(provider: string | undefined | null, checkpoint?: string | undefined | null): string {
  const prov = String(provider || '').trim();
  if (prov) {
    const label = PROVIDER_TITLE_LABEL[prov] || prov;
    return `加载底模 (${label})`;
  }
  const ckpt = String(checkpoint || '').trim();
  if (ckpt) return `加载底模 (${ckpt.split('/').pop()})`;
  return '加载底模';
}
