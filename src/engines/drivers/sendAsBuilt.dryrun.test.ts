import { describe, it, vi, afterEach, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { AgnesDriver } from './AgnesDriver';
import { CivitaiDriver } from './CivitaiDriver';
import { FalDriver } from './FalDriver';
import { GeminiDriver } from './GeminiDriver';
import { GrokCompatDriver } from './GrokCompatDriver';
import { HuggingFaceDriver } from './HuggingFaceDriver';
import { MageDriver } from './MageDriver';
import { ModelScopeAiDriver } from './ModelScopeAiDriver';
import { ModelScopeDriver } from './ModelScopeDriver';
import { ModelsLabDriver } from './ModelsLabDriver';
import { NanoGPTDriver } from './NanoGPTDriver';
import { OpenAICompatDriver } from './OpenAICompatDriver';
import { ReplicateDriver } from './ReplicateDriver';
import { RunwareDriver } from './RunwareDriver';
import { SchemaProviderDriver } from './SchemaProviderDriver';
import { SenseNovaDriver } from './SenseNovaDriver';
import { TensorArtDriver } from './TensorArtDriver';
import { VideoDriver } from './VideoDriver';

/** Dry run: every filled canvas param must appear in the driver's outbound body (structured JSON). No network. */
const FILLED = {
  prompt: 'p-dry',
  negative_prompt: 'neg-dry',
  seed: 4242,
  steps: 23,
  cfg: 6.5,
  width: 832,
  height: 1216,
  sampler_name: 'euler-dry',
  scheduler: 'karras-dry',
  denoise: 0.61,
  loras: [{ name: 'lora-dry', path: 'https://x.test/lora-dry.safetensors', strength: 0.77 }],
};

export const CHECKED_FIELDS = [
  'prompt',
  'negative_prompt',
  'seed',
  'steps',
  'cfg',
  'width',
  'height',
  'sampler_name',
  'scheduler',
  'denoise',
  'loras',
] as const;

/**
 * Structured field verifier: parses the JSON payload and strictly checks the typed fields and values.
 * String substring matches (e.g. body.includes("23")) are strictly prohibited to prevent false greens
 * like watermark: 23 satisfying steps: 23.
 */
export function checkField(parsed: any, field: string, expected: any): boolean {
  if (!parsed || typeof parsed !== 'object') return false;
  switch (field) {
    case 'prompt':
      return parsed.prompt === expected;
    case 'negative_prompt':
      return parsed.negative_prompt === expected;
    case 'seed':
      return parsed.seed === expected;
    case 'steps':
      return parsed.steps === expected || parsed.num_inference_steps === expected;
    case 'cfg':
      return (
        parsed.cfg === expected ||
        parsed.guidance_scale === expected ||
        parsed.guidance === expected ||
        parsed.cfg_scale === expected
      );
    case 'width':
      return (
        parsed.width === expected ||
        parsed.image_size?.width === expected ||
        (typeof parsed.size === 'string' && parsed.size.includes(String(expected)))
      );
    case 'height':
      return (
        parsed.height === expected ||
        parsed.image_size?.height === expected ||
        (typeof parsed.size === 'string' && parsed.size.includes(String(expected)))
      );
    case 'sampler_name':
      return parsed.sampler_name === expected || parsed.sampler === expected;
    case 'scheduler':
      return parsed.scheduler === expected;
    case 'denoise':
      return parsed.denoise === expected;
    case 'loras':
      if (!Array.isArray(parsed.loras) || parsed.loras.length === 0) return false;
      const l = parsed.loras[0];
      return l?.name === 'lora-dry' || l?.path?.includes('lora-dry') || l?.url?.includes('lora-dry');
    default:
      return false;
  }
}

/**
 * Explicit, evidence-backed exemptions for drivers that legitimately do not accept specific fields.
 * Video endpoints operate on temporal video schemas. NanoGPT video docs (https://docs.nano-gpt.com/api-reference/endpoint/video-generation)
 * define only: model, prompt, imageUrl, duration, aspect_ratio, seed, negative_prompt, cfg_scale, num_inference_steps;
 * spatial sampler_name, scheduler, and denoise do not exist in the official video schema.
 */
const EXEMPTIONS: Record<string, string[]> = {
  'nanogpt:video': ['sampler_name', 'scheduler', 'denoise'],
};

const drivers: Array<[string, () => any, string, Record<string, unknown>?]> = [
  ['agnes', () => new AgnesDriver(), 'agnes-model'],
  ['civitai', () => new CivitaiDriver(), 'urn:air:sdxl:checkpoint:civitai:1@2'],
  ['fal', () => new FalDriver(), 'fal-ai/flux/dev'],
  ['gemini', () => new GeminiDriver(), 'gemini-2.5-flash-image'],
  ['grok_compat', () => new GrokCompatDriver(), 'grok-imagine-image'],
  ['grok_compat:video', () => new GrokCompatDriver(), 'grok-imagine-video', { isVideo: true, videoDuration: 5 }],
  ['huggingface', () => new HuggingFaceDriver(), 'org/model'],
  ['mage', () => new MageDriver(), 'mango-v3'],
  ['modelscope_ai', () => new ModelScopeAiDriver(), 'Tongyi-MAI/Z-Image-Turbo'],
  ['modelscope', () => new ModelScopeDriver(), 'Tongyi-MAI/Z-Image-Turbo'],
  ['modelslab', () => new ModelsLabDriver(), 'flux'],
  ['nanogpt', () => new NanoGPTDriver(), 'hidream'],
  ['nanogpt:video', () => new NanoGPTDriver(), 'wan-2.1-t2v', { isVideo: true, videoDuration: 5 }],
  ['openai_compat', () => new OpenAICompatDriver(), 'gpt-image-1'],
  ['replicate', () => new ReplicateDriver(), 'black-forest-labs/flux-dev'],
  ['runware', () => new RunwareDriver(), 'runware:101@1'],
  ['schema:aimlapi', () => new SchemaProviderDriver('aimlapi' as any), 'flux/dev'],
  ['schema:venice', () => new SchemaProviderDriver('venice' as any), 'qwen-image'],
  ['sensenova', () => new SenseNovaDriver(), 'sensenova-u1.5'],
  ['tensorart', () => new TensorArtDriver(), '123456'],
  ['video:fal', () => new VideoDriver(), 'fal-ai/wan-t2v', { targetProvider: 'fal', isVideo: true, videoDuration: 5 }],
  ['video:grok_compat', () => new VideoDriver(), 'grok-imagine-video', { targetProvider: 'grok_compat', isVideo: true, videoDuration: 5 }],
];

const rows: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
});

describe('send-as-built dry run (driver → our server route body)', () => {
  for (const [id, make, model, extra] of drivers) {
    it(id, async () => {
      const bodies: string[] = [];
      vi.stubGlobal('fetch', vi.fn(async (u: any, init?: any) => {
        const url = String(u);
        if (!init?.body && /model-schema|schema/.test(url)) {
          return new Response(JSON.stringify({ ok: true, inputSchema: { properties: { prompt: {} } }, properties: ['prompt'] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (init?.body && !/prefetch-failure|\/api\/history/.test(url)) {
          bodies.push(typeof init.body === 'string' ? init.body : JSON.stringify(init.body));
        }
        return new Response(JSON.stringify({
          ok: true,
          imageUrl: 'https://x/i.png',
          videoUrl: 'https://x/v.mp4',
          mediaUrl: 'https://x/m.png',
          model,
          provider: id,
          taskId: 'dry-task-1',
          pollUrl: 'https://x/poll',
          status: 'completed',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }));

      // No try/catch swallowing errors: if driver throws, test must fail directly
      await make().generate(
        { ...FILLED, ...(extra || {}), model, apiKey: 'dry', image_url: undefined } as any,
        { falKey: 'dry-key', grokCompatKey: 'dry-key', nanogptKey: 'dry-key' }
      );

      // Assert request body was built
      expect(bodies.length).toBeGreaterThan(0);
      const rawBody = bodies[0] || '';
      expect(rawBody.trim().length).toBeGreaterThan(0);

      // Parse JSON structure - string matching is strictly forbidden
      const parsed = JSON.parse(rawBody);

      // Assert every filled parameter appears in the structured body unless explicitly exempted with documented evidence
      const allowedExemptions = EXEMPTIONS[id] || [];
      const missing = CHECKED_FIELDS.filter((field) => !checkField(parsed, field, (FILLED as any)[field]));
      const unexemptedMissing = missing.filter((k) => !allowedExemptions.includes(k));

      expect(unexemptedMissing).toEqual([]);
      rows.push(`| ${id} | built | ${missing.length ? missing.join(', ') : '— (all present)'} | ${allowedExemptions.length ? `exempt: ${allowedExemptions.join(', ')}` : 'verified'} |`);
    });
  }

  it('mutation check: deleting steps and injecting watermark: 23 fails the structured check and turns red', () => {
    const mutatedBody = JSON.stringify({
      prompt: 'p-dry',
      negative_prompt: 'neg-dry',
      seed: 4242,
      watermark: 23, // injected watermark instead of steps
      cfg: 6.5,
      width: 832,
      height: 1216,
      sampler_name: 'euler-dry',
      scheduler: 'karras-dry',
      denoise: 0.61,
      loras: [{ name: 'lora-dry', path: 'https://x.test/lora-dry.safetensors', strength: 0.77 }],
    });
    const parsed = JSON.parse(mutatedBody);
    // Substring match would falsely succeed on "23":
    expect(mutatedBody.includes('23')).toBe(true);
    // Structured parse must fail:
    expect(checkField(parsed, 'steps', FILLED.steps)).toBe(false);
  });

  it('write table', () => {
    const out = process.env.DRYRUN_OUT;
    if (out) {
      writeFileSync(out, ['| driver | request built | filled params missing from body | note |', '|---|---|---|---|', ...rows].join('\n') + '\n');
    }
    expect(rows.length).toBe(drivers.length);
  });
});
