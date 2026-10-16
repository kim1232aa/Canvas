import { describe, it, expect } from 'vitest';
import { beginRun, clearExecutionErrors, getExecutions } from '../services/executionTrace';
import { catalogEvidenceFrom } from '../components/CivitaiModal';
import { applyLoraNameToNodeValues, normalizeLoraPayloadItem } from '../utils/resourceSelection';
import { buildCivitaiImageRequest } from './civitaiImageContract';
import { getFieldSpec, schemaFieldWires } from '../schemas/providerSchema';
import { buildLocalRejectionHistoryItem } from './failedAttemptHistory';
import { resolveHistoryParameters, historyParameterSourceLabel } from '../utils/historyParameters';
import { buildNanoImagePayload } from '../schemas/nanoImageApi';
import { fetchSchemaProviderRows, schemaProviders } from './schemaProviders';

describe('batch-0503 · 1 exec-log stale 402 clear', () => {
  it('beginRun drops previous error entries including Krea-style 402 text', () => {
    const list = getExecutions() as any[];
    list.push({
      id: 99, time: new Date().toISOString(), route: '/api/schema-provider/krea/submit', method: 'POST',
      request: null, status: 402,
      response: { error: 'Your API balance is separate from your workspace compute balance. Please top up your API balance to continue using the API.' },
      state: 'error',
    });
    expect(getExecutions().some((r) => r.state === 'error')).toBe(true);
    beginRun();
    // append-only log: the row stays, it only stops driving the bottom-bar alert
    expect(getExecutions().some((r) => r.state === 'error')).toBe(true);
    expect(getExecutions().some((r) => r.state === 'error' && !r.acknowledged)).toBe(false);
  });
  it('clearExecutionErrors drops errors without requiring a new run', () => {
    (getExecutions() as any).push({ id: 100, time: new Date().toISOString(), route: '/x', method: 'POST', request: null, status: 402, response: null, state: 'error' });
    clearExecutionErrors();
    // append-only log: the row stays, it only stops driving the bottom-bar alert
    expect(getExecutions().some((r) => r.state === 'error')).toBe(true);
    expect(getExecutions().some((r) => r.state === 'error' && !r.acknowledged)).toBe(false);
  });
});

describe('batch-0503 · 2 Venice LoRA Hub — no model-catalog source', () => {
  it('catalogEvidenceFrom omits endpoint when noLoraCatalog', () => {
    const ev = catalogEvidenceFrom({
      executionTrace: [],
      _pagination: { venice: { noLoraCatalog: true, message: '无 LoRA 目录接口（仅 lora_strength）', sourceUrl: 'https://api.venice.ai/api/v1/models?type=all' } },
    }, 'venice');
    expect(ev).toMatchObject({ noUpstreamCall: true, message: expect.stringContaining('无 LoRA 目录接口') });
    expect(ev?.endpoint).toBeUndefined();
  });
  it('fetchSchemaProviderRows(venice,lora) has noLoraCatalog and no model-catalog sourceUrl', async () => {
    const read = async () => ({ data: {} });
    const r: any = await fetchSchemaProviderRows('venice', read as any, { lora: true });
    expect(r.rows).toEqual([]);
    expect(r.noLoraCatalog).toBe(true);
    expect(r.sourceUrl).toBeUndefined();
    expect(String(r.notice)).toMatch(/无 LoRA 目录接口/);
    expect(String(r.notice)).not.toMatch(/models\?type/);
    // Model catalog path still declares /models?type=all — must not leak into LoRA notice as「来源」.
    expect(schemaProviders.venice.catalog).toBe('/models?type=all');
  });
});

describe('batch-0503 · 5 Flux2 AIR + history labels', () => {
  const air = 'urn:air:flux2:lora:civitai:2169780@2443422';
  const staleHf = 'https://huggingface.co/Comfy-Org/Krea-2/resolve/main/loras/krea2_darkbrush.safetensors';

  it('applyLoraNameToNodeValues sets civitai_id from AIR and clears stale download_url', () => {
    const next = applyLoraNameToNodeValues({
      lora_name: 'old', civitai_id: '', download_url: staleHf, resource_source: 'wavespeed',
    }, air);
    expect(next).toMatchObject({ lora_name: air, civitai_id: air });
    expect(next.download_url).toBeUndefined();
    expect(next.downloadUrl).toBeUndefined();
  });

  it('normalizeLoraPayloadItem prefers AIR civitaiId and drops stale path', () => {
    const out = normalizeLoraPayloadItem({
      name: air, path: staleHf, downloadUrl: staleHf, civitaiId: '', strength: 1,
    });
    expect(out.civitaiId).toBe(air);
    expect((out as any).path).toBeUndefined();
    expect((out as any).downloadUrl).toBeUndefined();
  });

  it('empty civitaiId falls through to AIR in name for flux2:dev array loras', async () => {
    const get = async () => ({});
    // resolveCivitaiResource will be called — stub by returning AIR-shaped metadata via failing get is hard;
    // contract: raw pickup must not treat "" as present. Use a get that returns version metadata.
    const getOk = async (url: string) => {
      if (url.includes('2169780') || url.includes('2443422')) {
        return { id: 2443422, modelId: 2169780, air, model: { type: 'LORA' }, type: 'LORA' };
      }
      return {};
    };
    const b: any = await buildCivitaiImageRequest({
      model: 'urn:air:flux2:checkpoint:civitai:2165902@2439067',
      engine: 'flux2', ecosystem: 'dev', prompt: 'cat',
      loras: [{ name: air, path: staleHf, civitaiId: '', strength: 1 }],
    }, getOk as any);
    expect(b.payload.loras).toEqual([{ air, strength: 1 }]);
  });

  it('flux2:dev sampler/scheduler/negative are unsupported → history 该端点不支持', () => {
    expect(getFieldSpec('civitai', 'flux2:dev', 'sampler')?.status).toBe('unsupported');
    expect(getFieldSpec('civitai', 'flux2:dev', 'scheduler')?.status).toBe('unsupported');
    expect(getFieldSpec('civitai', 'flux2:dev', 'negative_prompt')?.status).toBe('unsupported');
    const wires = schemaFieldWires('civitai', 'flux2:dev')!;
    expect(wires).toContain('numInferenceSteps');
    expect(wires).toContain('guidanceScale');
    expect(wires).not.toContain('sampleMethod');
    expect(wires).not.toContain('negativePrompt');
    const item = buildLocalRejectionHistoryItem(
      '/api/engine/civitai/generate',
      { prompt: 'p', model: 'urn:air:flux2:checkpoint:civitai:1@2', engine: 'flux2', ecosystem: 'dev', steps: 28, cfg: 2.5, seed: 42, width: 1024, height: 1024 },
      400,
      { error: 'LoRA 资源 AIR/ID 为必填项' },
    );
    const r = resolveHistoryParameters({ ...item, id: 'h', timestamp: 1, seed: null, steps: null, cfg: null } as any);
    expect(r.sampler.source).toBe('unsupported');
    expect(r.scheduler.source).toBe('unsupported');
    expect(r.negativePrompt.source).toBe('unsupported');
    expect(historyParameterSourceLabel(r.sampler.source)).toBe('该端点不支持 · 未发送') // clean-1029 #5;
    expect(r.steps.source).toBe('intended');
  });
});

describe('batch-0503 · 3 sdcpp flux2Dev fields + kontext LoRA refuse', () => {
  it('sdcpp:flux2Dev declares steps/cfgScale/sampleMethod/schedule/negativePrompt and map loras', () => {
    expect(getFieldSpec('civitai', 'sdcpp:flux2Dev', 'steps')?.wire).toBe('steps');
    expect(getFieldSpec('civitai', 'sdcpp:flux2Dev', 'cfg')?.wire).toBe('cfgScale');
    expect(getFieldSpec('civitai', 'sdcpp:flux2Dev', 'sampler')?.wire).toBe('sampleMethod');
    expect(getFieldSpec('civitai', 'sdcpp:flux2Dev', 'scheduler')?.wire).toBe('schedule');
    expect(getFieldSpec('civitai', 'sdcpp:flux2Dev', 'negative_prompt')?.wire).toBe('negativePrompt');
    expect(getFieldSpec('civitai', 'sdcpp:flux2Dev', 'steps')?.status).toBe('supported');
    // Native stays array + numInferenceSteps
    expect(getFieldSpec('civitai', 'flux2:dev', 'steps')?.wire).toBe('numInferenceSteps');
    expect(getFieldSpec('civitai', 'flux2:dev', 'cfg')?.wire).toBe('guidanceScale');
  });

  it('sdcpp:flux2Dev createVariant sends steps/cfgScale and loras as object map', async () => {
    const lora = 'urn:air:flux2:lora:civitai:5@6';
    const getOk = async () => ({ id: 6, modelId: 5, air: lora, model: { type: 'LORA' }, type: 'LORA' });
    const b: any = await buildCivitaiImageRequest({
      model: 'urn:air:flux2:checkpoint:civitai:1@2',
      ecosystem: 'flux2Dev', prompt: 'x',
      image_url: 'https://image.civitai.com/a.jpeg', denoise: 0.5,
      steps: 20, cfg: 1, negative_prompt: 'blur',
      loras: [{ civitaiId: lora, strength: 0.8 }],
    }, getOk as any);
    expect(b.payload).toMatchObject({
      engine: 'sdcpp', ecosystem: 'flux2Dev', operation: 'createVariant',
      steps: 20, cfgScale: 1, negativePrompt: 'blur',
    });
    expect(b.payload.numInferenceSteps).toBeUndefined();
    expect(b.payload.guidanceScale).toBeUndefined();
    expect(b.payload.loras).toEqual({ [lora]: 0.8 });
  });

  it('flux1-kontext with LoRA is refused locally', async () => {
    await expect(buildCivitaiImageRequest({
      model: 'urn:air:flux1:checkpoint:civitai:1@2',
      engine: 'flux1-kontext', ecosystem: 'dev', prompt: 'x',
      loras: [{ civitaiId: 'urn:air:flux1:lora:civitai:3@4', strength: 1 }],
    }, (async () => ({})) as any)).rejects.toThrow(/flux1-kontext|不接受 LoRA/);
  });
});

describe('batch-0503 · 4 NanoGPT catalog-driven send', () => {
  it('only sends seed when supported_parameters declares it', () => {
    const bare = { supported_parameters: { resolutions: ['1024x1024'] }, capabilities: {} };
    const a = buildNanoImagePayload({ model: 'flux-schnell', prompt: 'x', seed: 42, steps: 8, cfg: 3 }, bare);
    expect(a.payload).toEqual({ model: 'flux-schnell', prompt: 'x' });
    expect(a.capabilityNotes.every((n) => n.capability === 'not_sent')).toBe(true);
    const withSeed = buildNanoImagePayload(
      { model: 'nano-banana-2.1', prompt: 'x', seed: 7 },
      { supported_parameters: { seed: { min: 0 }, resolutions: ['1024x1024'] }, capabilities: {} },
    );
    expect(withSeed.payload.seed).toBe(7);
  });
});
