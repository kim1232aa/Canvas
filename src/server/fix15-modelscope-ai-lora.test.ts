import { describe, it, expect } from 'vitest';
import { buildModelScopeImagePayload } from './modelScopeImageContract';
import { buildModelScopeLoras } from '../schemas/modelScopeLoras';
import { MODELSCOPE_REGIONS, parseLoraListResponse } from './modelScopeLoraList';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('fix15 ModelScope AI intl loras', () => {
  it('image payload puts official loras map (not path/scale)', () => {
    const r = buildModelScopeImagePayload({
      model: 'Tongyi-MAI/Z-Image-Turbo',
      prompt: 'a room',
      loras: [{ name: 'LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1', strength: 1 }],
      width: 1024,
      height: 1024,
    });
    expect(r.payload.loras).toEqual({ 'LcarsPicturesDatabase/ST-TNG-Rooms-Z-Image-Turbo-v1': 1 });
    expect(r.schemaFields).toContain('loras');
    expect(JSON.stringify(r.payload)).not.toMatch(/"path"|"scale"|"path_or_id"/);
  });

  it('string loras repo id is preserved', () => {
    expect(buildModelScopeLoras('owner/style-lora')).toBe('owner/style-lora');
    const r = buildModelScopeImagePayload({ model: 'm', prompt: 'p', loras: 'owner/style-lora' });
    expect(r.payload.loras).toBe('owner/style-lora');
  });

  it('weight sum and max-6 enforced without silent rescale', () => {
    expect(() => buildModelScopeLoras([{ name: 'a/b', strength: 0.5 }])).toThrow(/1\.0/);
    expect(() => buildModelScopeLoras(
      Array.from({ length: 7 }, (_, i) => ({ name: `o/l${i}`, strength: 1 / 7 }))
    )).toThrow(/1–6/);
  });

  it('intl LoRA list rows use provider id modelscope_ai (not CN label)', () => {
    const cfg = MODELSCOPE_REGIONS.modelscope_ai;
    const out = parseLoraListResponse(cfg, {
      Code: 200,
      Data: { Model: { TotalCount: 1, Models: [{ Path: 'Org', Name: 'Lora', BaseModel: ['Tongyi-MAI/Z-Image-Turbo'], Tags: ['LoRA'] }] } },
    });
    expect(out.items[0].provider).toBe('modelscope_ai');
    expect(out.items[0].id).toBe('Org/Lora');
    expect(out.items[0].externalUrl).toContain('modelscope.ai');
    expect(out.items[0].externalUrl).not.toContain('.cn');
  });

  it('server route binds AI to .ai root and rejects CN token header mix (source check)', () => {
    const src = readFileSync(resolve(__dirname, '../../server.ts'), 'utf8');
    const block = src.slice(src.indexOf('// 4. ModelScope'), src.indexOf('respondWithGeneratedImages', src.indexOf('// 4. ModelScope')) + 200);
    expect(block).toContain("https://api-inference.modelscope.ai/v1");
    expect(block).toContain("X-ModelScope-Async-Mode");
    expect(block).toContain("X-ModelScope-Task-Type");
    expect(block).toContain('魔搭站点冲突');
    // AI branch must not fall back to CN header
    expect(block).toMatch(/isAiSite\s*\?\s*\(req\.headers\['x-modelscope-ai-token'\]/);
    expect(block).not.toMatch(/x-modelscope-ai-token[\s\S]{0,80}\|\|\s*\(req\.headers\['x-modelscope-token'\]/);
    expect(block).toContain('actualRequest');
  });
});
