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

/** Dry run: every filled canvas param must appear in the driver's outbound body (any documented alias). No network. */
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

const ALIASES: Record<string, string[]> = {
  prompt: ['p-dry'],
  negative_prompt: ['neg-dry'],
  seed: ['4242'],
  steps: ['23'],
  cfg: ['6.5'],
  width: ['832'],
  height: ['1216'],
  sampler_name: ['euler-dry'],
  scheduler: ['karras-dry'],
  denoise: ['0.61'],
  loras: ['lora-dry'],
};

/**
 * Explicit, evidence-backed exemptions for drivers that legitimately do not accept specific fields.
 * Video endpoints operate on temporal video schemas (duration/aspect_ratio/fps/num_frames/resolution)
 * rather than spatial pixel dimensions or image-diffusion samplers.
 */
const EXEMPTIONS: Record<string, string[]> = {
  'video:fal': ['width', 'height', 'sampler_name', 'scheduler', 'denoise'],
  'video:grok_compat': ['width', 'height', 'sampler_name', 'scheduler', 'denoise'],
};

const drivers: Array<[string, () => any, string, Record<string, unknown>?]> = [
  ['agnes', () => new AgnesDriver(), 'agnes-model'],
  ['civitai', () => new CivitaiDriver(), 'urn:air:sdxl:checkpoint:civitai:1@2'],
  ['fal', () => new FalDriver(), 'fal-ai/flux/dev'],
  ['gemini', () => new GeminiDriver(), 'gemini-2.5-flash-image'],
  ['grok_compat', () => new GrokCompatDriver(), 'grok-imagine-image'],
  ['huggingface', () => new HuggingFaceDriver(), 'org/model'],
  ['mage', () => new MageDriver(), 'mango-v3'],
  ['modelscope_ai', () => new ModelScopeAiDriver(), 'Tongyi-MAI/Z-Image-Turbo'],
  ['modelscope', () => new ModelScopeDriver(), 'Tongyi-MAI/Z-Image-Turbo'],
  ['modelslab', () => new ModelsLabDriver(), 'flux'],
  ['nanogpt', () => new NanoGPTDriver(), 'hidream'],
  ['openai_compat', () => new OpenAICompatDriver(), 'gpt-image-1'],
  ['replicate', () => new ReplicateDriver(), 'black-forest-labs/flux-dev'],
  ['runware', () => new RunwareDriver(), 'runware:101@1'],
  ['schema:aimlapi', () => new SchemaProviderDriver('aimlapi' as any), 'flux/dev'],
  ['schema:venice', () => new SchemaProviderDriver('venice' as any), 'qwen-image'],
  ['sensenova', () => new SenseNovaDriver(), 'sensenova-u1.5'],
  ['tensorart', () => new TensorArtDriver(), '123456'],
  ['video:fal', () => new VideoDriver(), 'fal-ai/wan-t2v', { targetProvider: 'fal', isVideo: true }],
  ['video:grok_compat', () => new VideoDriver(), 'grok-imagine-video', { targetProvider: 'grok_compat', isVideo: true }],
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
        { falKey: 'dry-key', grokCompatKey: 'dry-key' }
      );

      // Assert request body was built
      expect(bodies.length).toBeGreaterThan(0);
      const body = bodies[0] || '';
      expect(body.trim().length).toBeGreaterThan(0);

      // Assert every filled parameter appears in the body unless explicitly exempted
      const missing = Object.keys(ALIASES).filter((k) => !ALIASES[k].some((v) => body.includes(v)));
      const allowedExemptions = EXEMPTIONS[id] || [];
      const unexemptedMissing = missing.filter((k) => !allowedExemptions.includes(k));

      expect(unexemptedMissing).toEqual([]);
      rows.push(`| ${id} | built | ${missing.length ? missing.join(', ') : '— (all present)'} | ${allowedExemptions.length ? `exempt: ${allowedExemptions.join(', ')}` : 'verified'} |`);
    });
  }

  it('write table', () => {
    const out = process.env.DRYRUN_OUT;
    if (out) {
      writeFileSync(out, ['| driver | request built | filled params missing from body | note |', '|---|---|---|---|', ...rows].join('\n') + '\n');
    }
    expect(rows.length).toBe(drivers.length);
  });
});
