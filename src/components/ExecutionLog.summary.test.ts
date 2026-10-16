/**
 * Lightweight coverage for ExecutionLog redaction / summary helpers.
 * Full DOM render is not required.
 */
import {describe,expect,it} from 'vitest';
import {errorScopeTag, humanSummaryText, providerLabelFromRoute, alignRequestSnapshotProvider, plainSuccessConclusion, shortLoraDisplayName, isEmptyClientRequestSnapshot, clientRequestSnapshotText, extractLorasFromRequest, extractLorasFromRecord, actualRequestFromResponse} from './ExecutionLog';
import {MODELSCOPE_MODEL_MISSING_CN} from '../utils/apiFailure';
import type {ExecutionRecord} from '../services/executionTrace';
import {LORA_UNSUPPORTED_MESSAGE} from '../utils/resolveCheckpoint';

function redactSecrets(value:unknown):unknown {
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (!value || typeof value !== 'object') return value;
  const out:Record<string,unknown> = {};
  for (const [k,v] of Object.entries(value as Record<string,unknown>)) {
    if (/key|token|secret|authorization|password|credential/i.test(k) && !/^masked/i.test(k)) {
      out[k] = '[已隐藏]';
      continue;
    }
    if (typeof v === 'string' && /^(sk-|ak_|wsk_|hf_|ms-|Bearer\s)/i.test(v.trim()) && !/^masked/i.test(k)) {
      out[k] = '[已隐藏]';
      continue;
    }
    out[k] = redactSecrets(v);
  }
  return out;
}

describe('ExecutionLog secret redaction (P0-2)', () => {
  it('hides key fields and sk-/wsk_ values from copy report payload', () => {
    const safe = redactSecrets({
      falKey: 'a437ae76-secret',
      nested: {api_key: 'x', prompt: 'rain'},
      token: 'hf_abc',
      wavespeed: 'wsk_live_abc',
      ok: 'hello',
    }) as any;
    expect(safe.falKey).toBe('[已隐藏]');
    expect(safe.nested.api_key).toBe('[已隐藏]');
    expect(safe.nested.prompt).toBe('rain');
    expect(safe.token).toBe('[已隐藏]');
    expect(safe.wavespeed).toBe('[已隐藏]');
    expect(safe.ok).toBe('hello');
  });
});

describe('ExecutionLog plain summary (LoRA unsupported polish)', () => {
  const kreaError: ExecutionRecord = {
    id: 9,
    time: '2026-10-14T16:56:16.158Z',
    method: 'POST',
    route: '/api/engine/civitai/generate',
    status: 400,
    state: 'error',
    request: {},
    response: {
      errorSource: 'local',
      error:
        'Civitai Krea v2 官方不接受 LoRA、负面提示词或宽高像素（见 https://developer.civitai.com/orchestration/recipes/krea）。',
    },
  };

  it('humanSummaryText is next-step only; no method/path/schema jargon', () => {
    const text = humanSummaryText(kreaError);
    // 2026-10-15 hard rule: local block shown verbatim with 未出站 prefix (no plain rewrite).
    expect(text).toBe(`未出站，本地拦截：${(kreaError.response as any).error}`);
    expect(text).not.toMatch(/这模型不能挂 LoRA/);
    expect(text).not.toMatch(/POST|\/api\/|schema|comfy:krea2|HTTP/);
  });

  it('errorScopeTag is 最新失败 for latest error and 较早失败 for older (label, not a retry)', () => {
    expect(errorScopeTag(kreaError, 9)).toBe('最新失败');
    expect(errorScopeTag(kreaError, 8)).toBe('较早失败');
    expect(errorScopeTag({...kreaError, state: 'complete'}, 9)).toBeNull();
  });
});

describe('ExecutionLog keyRotation plain summary', () => {
  it('humanSummaryText prefers keyRotation.summary over jargon error', () => {
    const r: ExecutionRecord = {
      id: 1,
      time: '2026-10-15T00:00:00.000Z',
      method: 'POST',
      route: '/api/engine/huggingface/generate',
      status: 402,
      state: 'error',
      request: {},
      response: {
        error: '几把都额度不够',
        details: 'HTTP 402 POST /api/...',
        keyRotation: {
          summary: '几把都额度不够',
          attempts: [
            {maskedKey:'hf_a...aaaa', result:'额度不够', status:402, responseBody:'no remaining credits', outcome:'billing'},
            {maskedKey:'hf_b...bbbb', result:'额度不够', status:402, responseBody:'INSUFFICIENT_CREDITS', outcome:'billing'},
          ],
        },
      },
    };
    expect(humanSummaryText(r)).toBe('几把都额度不够');
    expect(humanSummaryText(r)).not.toMatch(/POST|\/api\/|schema/);
  });

  it('success after rotate shows plain rotate conclusion', () => {
    const r: ExecutionRecord = {
      id: 2,
      time: '2026-10-15T00:00:00.000Z',
      method: 'POST',
      route: '/api/engine/huggingface/generate',
      status: 200,
      state: 'complete',
      request: {},
      response: {
        imageUrl: '/api/media/x',
        keyRotation: {summary:'这把额度不够，已换下一把', attempts:[{maskedKey:'hf_a...aaaa',result:'额度不够',status:402,outcome:'billing'},{maskedKey:'hf_b...bbbb',result:'成功',status:200,outcome:'success'}]},
      },
    };
    expect(humanSummaryText(r)).toBe('这把额度不够，已换下一把');
  });

  it('redactSecrets keeps maskedKey visible', () => {
    const safe = redactSecrets({maskedKey:'hf_a...aaaa', hfToken:'hf_secretsecret', prompt:'x'}) as any;
    expect(safe.maskedKey).toBe('hf_a...aaaa');
    expect(safe.hfToken).toBe('[已隐藏]');
  });
});


describe('ExecutionLog ModelScope plain summary + snapshot provider label', () => {
  it('humanSummaryText maps 模型不存在 to plain CN conclusion', () => {
    const r: ExecutionRecord = {
      id: 3,
      time: '2026-10-14T17:25:17.474Z',
      method: 'POST',
      route: '/api/modelscope/generate',
      status: 500,
      state: 'error',
      request: {},
      response: {
        errorSource: 'upstream',
        error:
          '魔搭国内站 (modelscope.cn) API 提交失败 [500]: {"errors":{"message":"apiInferModelDownload call failed: callApiInferModelDownload failed: [Model Exception] 模型不存在"},"request_id":"4c0b7caa-7f63-497c-972e-2f4e0e65a677"}',
      },
    };
    expect(humanSummaryText(r)).toBe(MODELSCOPE_MODEL_MISSING_CN);
    expect(humanSummaryText(r)).toBe('魔搭国内站找不到这个模型或 LoRA');
    expect(humanSummaryText(r)).not.toMatch(/\[500\]|request_id|\{/);
  });

  it('providerLabelFromRoute matches modelscope route, not WaveSpeed', () => {
    expect(providerLabelFromRoute('/api/modelscope/generate')).toBe('魔搭 CN');
    expect(providerLabelFromRoute('/api/modelscope_ai/generate')).toBe('魔搭 AI');
    expect(providerLabelFromRoute('/api/engine/wavespeed/generate')).toBe('WaveSpeed');
    expect(providerLabelFromRoute('/api/modelscope/generate')).not.toBe('WaveSpeed');
  });

  it('alignRequestSnapshotProvider rewrites WaveSpeed leftover title to 魔搭 CN', () => {
    const request = {
      model: 'Tongyi-MAI/Z-Image-Turbo',
      workflowSnapshot: {
        nodes: [
          {
            type: 'CheckpointLoaderSimple',
            title: '加载基础模型 (WaveSpeed)',
            values: { targetProvider: 'modelscope', ckpt_name: 'Tongyi-MAI/Z-Image-Turbo' },
          },
        ],
      },
    };
    const aligned = alignRequestSnapshotProvider(request, '/api/modelscope/generate') as any;
    expect(aligned.workflowSnapshot.nodes[0].title).toBe('加载底模 (魔搭 CN)');
    expect(aligned.workflowSnapshot.nodes[0].title).not.toMatch(/WaveSpeed/);
    expect(providerLabelFromRoute('/api/modelscope/generate')).toBe('魔搭 CN');
  });
});


describe('ExecutionLog success plain conclusion + empty request hide', () => {
  const msRealismSuccess: ExecutionRecord = {
    id: 42,
    time: '2026-10-14T17:33:11.000Z',
    method: 'POST',
    route: '/api/modelscope/generate',
    status: 200,
    state: 'complete',
    request: {
      model: 'Tongyi-MAI/Z-Image-Turbo',
      prompt: 'A golden cat sitting on a wooden windowsill, soft daylight, photorealistic',
      loras: [{ name: 'suayptalha/Z-Image-Turbo-Realism-LoRA', strength: 1 }],
      workflowSnapshot: {
        nodes: [
          {
            type: 'CheckpointLoaderSimple',
            title: '加载底模 (魔搭 CN)',
            values: { targetProvider: 'modelscope', ckpt_name: 'Tongyi-MAI/Z-Image-Turbo' },
          },
        ],
      },
    },
    response: {
      imageUrl: '/api/media/golden-cat.png',
      model: 'Tongyi-MAI/Z-Image-Turbo',
    },
  };

  it('humanSummaryText success is plain MS CN + LoRA (not bare 完成)', () => {
    const text = humanSummaryText(msRealismSuccess);
    expect(text).toBe('魔搭国内站出图 1 张，挂了 Realism LoRA，强度 1');
    expect(text).not.toBe('完成');
    expect(plainSuccessConclusion(msRealismSuccess)).toBe(text);
  });

  it('shortLoraDisplayName strips Z-Image-Turbo prefix', () => {
    expect(shortLoraDisplayName('suayptalha/Z-Image-Turbo-Realism-LoRA')).toBe('Realism LoRA');
  });

  it('object-map loras also feed success conclusion', () => {
    const r: ExecutionRecord = {
      ...msRealismSuccess,
      request: { model: 'Tongyi-MAI/Z-Image-Turbo', loras: { 'suayptalha/Z-Image-Turbo-Realism-LoRA': 1 } },
    };
    expect(humanSummaryText(r)).toBe('魔搭国内站出图 1 张，挂了 Realism LoRA，强度 1');
    expect(extractLorasFromRequest(r.request)).toEqual([{ name: 'suayptalha/Z-Image-Turbo-Realism-LoRA', strength: 1 }]);
  });

  it('success without LoRA still names site + count', () => {
    const r: ExecutionRecord = {
      ...msRealismSuccess,
      request: { model: 'Tongyi-MAI/Z-Image-Turbo', prompt: 'x' },
      response: { imageUrl: '/api/media/a.png' },
    };
    expect(humanSummaryText(r)).toBe('魔搭国内站出图 1 张');
  });

  it('hides empty / {} / null client request snapshot', () => {
    expect(isEmptyClientRequestSnapshot(null, '/api/modelscope/generate')).toBe(true);
    expect(isEmptyClientRequestSnapshot(undefined, '/api/modelscope/generate')).toBe(true);
    expect(isEmptyClientRequestSnapshot({}, '/api/modelscope/generate')).toBe(true);
    expect(clientRequestSnapshotText({}, '/api/modelscope/generate')).toBeNull();
    expect(clientRequestSnapshotText(null, '/api/modelscope/generate')).toBeNull();
  });

  it('keeps non-empty client request snapshot text', () => {
    const snap = clientRequestSnapshotText(msRealismSuccess.request, msRealismSuccess.route);
    expect(snap).not.toBeNull();
    expect(snap!).toMatch(/Tongyi-MAI\/Z-Image-Turbo/);
    expect(snap!).toMatch(/Realism-LoRA/);
    expect(isEmptyClientRequestSnapshot(msRealismSuccess.request, msRealismSuccess.route)).toBe(false);
  });
});

describe('ExecutionLog Krea 402 透传 summary', () => {
  it('humanSummaryText keeps upstream English message — not Chinese rewrite', () => {
    const upstreamMsg = 'Your API balance is separate from your workspace compute balance. Please top up your API balance to continue using the API.';
    const r: ExecutionRecord = {
      id: 42,
      time: '2026-10-15T00:00:00.000Z',
      method: 'POST',
      route: '/api/schema-provider/krea/submit',
      status: 402,
      state: 'error',
      request: {},
      response: {
        error: 'HTTP 402: {"message":"' + upstreamMsg + '"}',
        errorSource: 'upstream',
        upstreamStatus: 402,
      },
    };
    expect(humanSummaryText(r)).toContain('HTTP 402');
    expect(humanSummaryText(r)).toContain('API balance');
    expect(humanSummaryText(r)).not.toContain('{"message"');
    expect(humanSummaryText(r)).toContain('API balance');
    expect(humanSummaryText(r)).not.toMatch(/API 余额不足/);
  });
});

describe('ExecutionLog AIMLAPI FE P0 — no fake 出图 + actualRequest loras', () => {
  it('catalog / model-schema complete must NOT say 出图完成', () => {
    const catalog: ExecutionRecord = {
      id: 1,
      time: '2026-10-14T18:07:04.000Z',
      method: 'GET',
      route: '/api/models?provider=aimlapi',
      status: 200,
      state: 'complete',
      request: undefined,
      response: { results: { aimlapi: [] } },
    };
    expect(plainSuccessConclusion(catalog)).toBeNull();
    expect(humanSummaryText(catalog)).not.toMatch(/出图/);
    const schema: ExecutionRecord = {
      ...catalog,
      id: 2,
      route: '/api/model-schema?provider=aimlapi&model=alibaba/z-image-turbo-lora',
      response: { inputSchema: { properties: {} } },
    };
    expect(plainSuccessConclusion(schema)).toBeNull();
    expect(humanSummaryText(schema)).not.toMatch(/出图完成|上游出图/);
  });

  it('AIMLAPI 403 error surfaces full funds message and loras from actualRequest', () => {
    const upstreamMsg =
      "You've run out of funds. Please top up your balance or update your payment method to continue: https://aimlapi.com/app/billing/";
    const r: ExecutionRecord = {
      id: 3,
      time: '2026-10-14T18:07:05.000Z',
      method: 'POST',
      route: '/api/schema-provider/aimlapi/submit',
      status: 403,
      state: 'error',
      request: {
        model: 'alibaba/z-image-turbo-lora',
        prompt: 'a childrens drawing of a red boat',
        loras: [{ path: 'ostris/z_image_turbo_childrens_drawings', scale: 0.85 }],
      },
      response: {
        ok: false,
        error: `HTTP 403: ${JSON.stringify({ title: 'Forbidden', status: 403, message: upstreamMsg })}`,
        errorSource: 'upstream',
        actualRequest: {
          endpoint: 'https://api.aimlapi.com/v1/images/generations',
          parameters: {
            model: 'alibaba/z-image-turbo-lora',
            prompt: 'a childrens drawing of a red boat',
            loras: [{ path: 'ostris/z_image_turbo_childrens_drawings', scale: 0.85 }],
          },
        },
      },
    };
    expect(humanSummaryText(r)).toBe(upstreamMsg);
    expect(humanSummaryText(r)).toContain('aimlapi.com/app/billing');
    expect(humanSummaryText(r)).not.toMatch(/…$/);
    expect(humanSummaryText(r)).not.toMatch(/出图完成/);
    expect(extractLorasFromRequest(r.request)).toEqual([
      { name: 'ostris/z_image_turbo_childrens_drawings', strength: 0.85 },
    ]);
    expect(extractLorasFromRecord(r)).toEqual([
      { name: 'ostris/z_image_turbo_childrens_drawings', strength: 0.85 },
    ]);
    expect(actualRequestFromResponse(r.response)).toMatchObject({
      parameters: { loras: [{ path: 'ostris/z_image_turbo_childrens_drawings', scale: 0.85 }] },
    });
    expect(providerLabelFromRoute(r.route)).toBe('AIMLAPI');
  });
});
