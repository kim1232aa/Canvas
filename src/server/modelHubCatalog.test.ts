import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getSchemaProviderCatalog } from './schemaProviders';

const serverSource = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
const modelHubModalSource = readFileSync(new URL('../components/ModelHubModal.tsx', import.meta.url), 'utf8');
const civitaiModalSource = readFileSync(new URL('../components/CivitaiModal.tsx', import.meta.url), 'utf8');

describe('ModelHub and Backend Directory Architecture', () => {
  describe('Schema Provider Catalog (Sogni, MuAPI, WaveSpeed)', () => {
    it('Sogni checkpoint catalog correctly attributes versioned protocol schema', () => {
      const res = getSchemaProviderCatalog('sogni', { type: 'checkpoint', limit: 50 });
      expect(res.sourceNotice).toBe('versioned-protocol-schema (@sogni-ai/sogni-protocol@1.0.0-alpha.46)');
      expect(res.items.length).toBeGreaterThan(0);
      expect(res.items[0].provider).toBe('sogni');
      expect(res.total).toBe(res.items.length);
      expect(res.hasMore).toBe(false);
    });

    it('Sogni LoRA catalog returns empty list with explicit catalogNotice', () => {
      const res = getSchemaProviderCatalog('sogni', { type: 'lora' });
      expect(res.items).toEqual([]);
      expect(res.catalogNotice).toContain('Sogni 暂无公共 LoRA 实时搜索接口');
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

    it('pagination calculation bounds hasMore accurately without hardcoding true', () => {
      const page1 = getSchemaProviderCatalog('sogni', { page: 1, limit: 2 });
      expect(page1.items.length).toBe(2);
      expect(page1.hasMore).toBe(true);

      const pageAll = getSchemaProviderCatalog('sogni', { page: 1, limit: 100 });
      expect(pageAll.hasMore).toBe(false);
    });
  });

  describe('Server /api/models Multi-Provider Aggregation', () => {
    it('provider=all covers muapi, wavespeed, sogni, runware, modelslab, sensenova, openai_compat, grok_compat, agnes', () => {
      expect(serverSource).toContain("['muapi', 'wavespeed', 'sogni', 'krea', 'together', 'aimlapi', 'novita', 'venice']");
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

    it('provides custom input placeholders and notices for Runware and ModelsLab', () => {
      expect(modelHubModalSource).toContain('Runware AIR');
      expect(modelHubModalSource).toContain('ModelsLab');
      expect(modelHubModalSource).toContain('catalogNotices[activeProvider]');
    });

    it('ModelHubModal ignores keys ending in Notice when mapping results', () => {
      expect(modelHubModalSource).toContain("key.endsWith('Notice')");
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
