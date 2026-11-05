import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getSchemaProviderCatalog, normalizeSchemaProviderItems } from './schemaProviders';

const serverSource = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
const modelHubModalSource = readFileSync(new URL('../components/ModelHubModal.tsx', import.meta.url), 'utf8');
const civitaiModalSource = readFileSync(new URL('../components/CivitaiModal.tsx', import.meta.url), 'utf8');

describe('ModelHub and Backend Directory Architecture', () => {
  describe('Schema Provider Catalog (Sogni, MuAPI, WaveSpeed)', () => {
    it('Sogni sync helper does not serve a bundled selector snapshot', () => {
      const res = getSchemaProviderCatalog('sogni', { type: 'checkpoint', limit: 50 });
      expect(res.sourceNotice).toBe('live-official-generate_image-schema (queried by asynchronous /api/models)');
      expect(res.items).toEqual([]);
      expect(res.sourceUrl).toBe('https://raw.githubusercontent.com/Sogni-AI/sogni-protocol/main/schemas/tools/generate_image.schema.json');
      expect(res.catalogNotice).toContain('does not return a bundled snapshot');
      expect(res.total).toBe(res.items.length);
      expect(res.hasMore).toBe(false);
    });

    it('Sogni LoRA catalog returns empty list with explicit catalogNotice', () => {
      const res = getSchemaProviderCatalog('sogni', { type: 'lora' });
      expect(res.items).toEqual([]);
      expect(res.catalogNotice).toContain('Sogni LoRA 目录由 /api/models?type=lora 实时读取');
      expect(res.catalogNotice).not.toContain('暂无公共 LoRA');
      expect(res.hasMore).toBe(false);
    });

    it('MuAPI LoRA catalog returns empty list with explicit notice', () => {
      const res = getSchemaProviderCatalog('muapi', { type: 'lora' });
      expect(res.items).toEqual([]);
      expect(res.catalogNotice).toContain('MuAPI 目前未提供公开 LoRA 实时检索目录');
      expect(res.hasMore).toBe(false);
    });

    it('WaveSpeed LoRA catalog returns empty list with explicit notice', () => {
      const res = getSchemaProviderCatalog('wavespeed', { type: 'lora' });
      expect(res.items).toEqual([]);
      expect(res.catalogNotice).toContain('WaveSpeed 目前未提供公开 LoRA 实时检索目录');
      expect(res.hasMore).toBe(false);
    });

    it('synchronous Sogni helper does not paginate a stale bundled selector list', () => {
      const page1 = getSchemaProviderCatalog('sogni', { page: 1, limit: 2 });
      expect(page1.items).toEqual([]);
      expect(page1.hasMore).toBe(false);

      const pageAll = getSchemaProviderCatalog('sogni', { page: 1, limit: 100 });
      expect(pageAll.hasMore).toBe(false);
    });
  });

  describe('Server /api/models Multi-Provider Aggregation', () => {
    it('provider=all covers muapi, wavespeed, sogni, deepinfra, openworks, runware, modelslab, sensenova, openai_compat, grok_compat, agnes', () => {
      expect(serverSource).toContain("['muapi', 'wavespeed', 'sogni', 'krea', 'together', 'aimlapi', 'novita', 'venice', 'deepinfra']");
      expect(serverSource).toContain("provider === 'all' || provider === 'openworks'");
      expect(serverSource).toContain("provider === 'all' || provider === 'runware'");
      expect(serverSource).toContain("provider === 'all' || provider === 'modelslab'");
      expect(serverSource).toContain("provider === 'all' || provider === 'sensenova'");
      expect(serverSource).toContain("provider === 'all' || provider === 'openai_compat'");
      expect(serverSource).toContain("provider === 'all' || provider === 'grok_compat'");
      expect(serverSource).toContain("provider === 'all' || provider === 'agnes'");
    });

    it('uses Promise.allSettled for schema providers to prevent cascading 500 errors', () => {
      expect(serverSource).toContain('await Promise.allSettled(');
    });

    it('Runware live search uses official modelSearch taskType and handles missing key gracefully', () => {
      expect(serverSource).toContain("taskType: 'modelSearch'");
      expect(serverSource).toContain('lookup-only (no api key configured)');
      expect(serverSource).toContain('catalogNoticesAccum.runware');
    });

    it('ModelsLab live model list uses dreambooth/model_list and handles missing key gracefully', () => {
      expect(serverSource).toContain('dreambooth/model_list');
      expect(serverSource).toContain('catalogNoticesAccum.modelslab');
      // LoRA tab must classify model_subcategory===lora as adapters (not empty fake notice).
      expect(serverSource).toContain("String(m.model_subcategory || '').toLowerCase() === 'lora'");
      expect(serverSource).toContain("resourceKind: isLora ? 'adapter' : 'model-endpoint'");
    });

    it('does not present OpenWorks tool names as Tensor checkpoint catalog rows', () => {
      const catalog = serverSource.slice(serverSource.indexOf('// 9. TAMS has no list API'), serverSource.indexOf('// Sort all provider arrays'));
      expect(catalog).not.toContain("modelType: 'CHECKPOINT'");
      expect(catalog).not.toContain('photoreal_studio_z_image');
      expect(catalog).not.toContain('anime_lab_wai_illustrious');
      expect(catalog).not.toContain('strong_text2image_wan27');
    });

    it('OpenAI Compat, Grok Compat, and Agnes report clear lookup-only notices', () => {
      expect(serverSource).toContain("provider === 'openai_compat'");
      expect(serverSource).toContain('catalogNoticesAccum.openai_compat');
      expect(serverSource).toContain("provider === 'grok_compat'");
      expect(serverSource).toContain('catalogNoticesAccum.grok_compat');
      expect(serverSource).toContain("provider === 'agnes'");
      expect(serverSource).toContain('catalogNoticesAccum.agnes');
    });

    it('provider=all results keys stay provider ids only (no *Notice siblings)', () => {
      expect(serverSource).toContain('const catalogNoticesAccum: Record<string, string> = {};');
      expect(serverSource).toContain('delete (results as any)[k]');
      expect(serverSource).toMatch(/k\.endsWith\('Notice'\)/);
      // Notices are written to catalogNoticesAccum, not results.*Notice
      expect(serverSource).not.toContain('(results as any).openai_compatNotice');
      expect(serverSource).not.toContain('(results as any).grok_compatNotice');
      expect(serverSource).not.toContain('(results as any).agnesNotice');
    });

    it('HF exact repo supplement failures are returned as partial errors while keeping ordinary results', () => {
      expect(serverSource).toContain('lookupExactHuggingFaceRepo(rawSearch, rawModelList');
      expect(serverSource).toContain('(results as any).huggingfaceExactLookupError = exactLookup.error');
      expect(serverSource).toContain('catalogNoticesAccum.huggingface =');
      expect(modelHubModalSource).toContain('(data as any).errors');
      expect(modelHubModalSource).toContain('if (prov !== \'all\' && errors[prov])');
      expect(modelHubModalSource).toContain("key === 'catalogNotices'");
    });

    it('/api/models category=all passes category: cat to keep video models alongside checkpoints', () => {
      expect(serverSource).toContain('category: cat,');
      expect(serverSource).not.toContain("category: cat === 'all' ? 'checkpoint' : cat");
    });

    it('sets video-catalog notices when cat === video for providers without a video catalog', () => {
      expect(serverSource).toContain('if (isVideoCat && filtered.length === 0)');
      expect(serverSource).toContain("catalogNoticesAccum.novita = 'Novita AI 官方模型目录 API (GET /v3/model) 仅支持 checkpoint / lora，无公开视频模型列表");
      expect(serverSource).toContain("catalogNoticesAccum.sogni = 'Sogni 协议官方目前仅提供文生图端点与 LoRA 目录，无公开视频模型列表");
      expect(serverSource).toContain("catalogNoticesAccum.deepinfra = 'DeepInfra 官方公开模型列表为文生图（OpenAI images），无独立视频模型列表");
      expect(serverSource).toContain("catalogNoticesAccum.gemini = 'Google Gemini 官方模型列表目前未包含 Veo 视频模型");
    });

    it('normalizeSchemaProviderItems preserves both checkpoint and video rows when category is all', () => {
      const mockRows = [
        { id: 'img-1', name: 'Image 1', category: 'text-to-image', type: 'image' },
        { id: 'vid-1', name: 'Video 1', category: 'text-to-video', type: 'video' },
      ];
      const allItems = normalizeSchemaProviderItems('krea' as any, mockRows, { category: 'all' });
      expect(allItems).toHaveLength(2);
      expect(allItems.map((m: any) => m.category)).toEqual(['Checkpoint', 'Video']);

      const cpItems = normalizeSchemaProviderItems('krea' as any, mockRows, { category: 'checkpoint' });
      expect(cpItems).toHaveLength(1);
      expect(cpItems[0].id).toBe('img-1');

      const vidItems = normalizeSchemaProviderItems('krea' as any, mockRows, { category: 'video' });
      expect(vidItems).toHaveLength(1);
      expect(vidItems[0].id).toBe('vid-1');
    });
  });

  describe('Fal LoRA-named generation endpoints stay Checkpoint', () => {
    it('server matchCategory no longer drops Checkpoint by id containing lora', () => {
      expect(serverSource).toContain('isLoraWeightResource');
      expect(serverSource).toContain("resourceKind: 'model-endpoint'");
      // Old bug: !itemId.includes("lora") removed fal-ai/krea-2/turbo/lora from Checkpoint
      expect(serverSource).not.toContain('!itemId.includes("lora")');
      expect(serverSource).not.toContain("itemId.includes('lora')");
    });

    it('ModelHubModal / CivitaiModal use isLoraWeightResource instead of id.includes(lora)', () => {
      expect(modelHubModalSource).toContain('isLoraWeightResource');
      expect(modelHubModalSource).not.toContain("modelId.toLowerCase().includes('lora')");
      expect(civitaiModalSource).toContain('isLoraWeightResource');
      expect(civitaiModalSource).not.toContain('m.id.toLowerCase().includes("lora")');
    });
  });

  describe('ModelHubModal Frontend Integration', () => {
    it('ProviderTab includes runware and modelslab', () => {
      expect(modelHubModalSource).toContain("{ id: 'runware', name: 'Runware' }");
      expect(modelHubModalSource).toContain("{ id: 'modelslab', name: 'ModelsLab' }");
      expect(modelHubModalSource).toContain("'runware'");
      expect(modelHubModalSource).toContain("'modelslab'");
    });

    it('ModelHubModal ignores keys ending in Notice when mapping results', () => {
      expect(modelHubModalSource).toContain("key.endsWith('Notice')");
    });

    it('ModelHubModal renders the lookup-only ID input panel with format hints and official links when provider has no list API', () => {
      expect(modelHubModalSource).toContain('getProviderFormatHint');
      expect(modelHubModalSource).toContain('按 ID 直接选用（输入真实模型 ID 后挂载到画布）：');
      expect(modelHubModalSource).toContain('选用此 ID');
      expect(modelHubModalSource).toContain('hintInfo.docUrl');
      expect(modelHubModalSource).toContain('hintInfo.format');
      expect(modelHubModalSource).not.toContain('PROVIDER_EXAMPLE_IDS');
    });
  });

  describe('CivitaiModal LoRA Hub Integration', () => {
    it('LoraProviderFilter includes runware and modelslab alongside existing providers', () => {
      expect(civitaiModalSource).toContain("'runware'");
      expect(civitaiModalSource).toContain("'modelslab'");
      expect(civitaiModalSource).toContain("{ id: 'runware', name: 'Runware' }");
      expect(civitaiModalSource).toContain("{ id: 'modelslab', name: 'ModelsLab' }");
    });

    it('protects against LoRA ID corruption by stripping provider prefix in cleanName', () => {
      expect(civitaiModalSource).toContain('const cleanName = model.resourceId || model.selection?.name');
      expect(civitaiModalSource).toContain('model.id.replace(new RegExp(`^${model.providerKey}-`), \'\')');
    });

    it('direct input handles Runware AIR and ModelsLab LoRA IDs cleanly', () => {
      expect(civitaiModalSource).toContain("activeProvider === 'runware'");
      expect(civitaiModalSource).toContain("activeProvider === 'modelslab'");
    });
  });
});
