import {it,expect} from 'vitest';
import {describeApiFailure, plainErrorMessage, userFacingApiFailure, unicodeSafeSlice, errorBannerText, isBillingFailureText, extractUpstreamMessage, historyFacingErrorMessage, shortUpstreamSummary} from './apiFailure';
it('distinguishes app 200 from upstream 403 and explains a challenge without guessing balance',()=>{
 const data={ok:false,tensorart:{error:'catalog failed',status:403},executionTrace:[{status:403,endpoint:'https://tensor.art/models/',responseBody:'<html>challenges.cloudflare.com cf_chl</html>'}]};
 const text=describeApiFailure(200,data,'/api/models');
 expect(text).toContain('上游 HTTP 403 / 网站 HTTP 200');
 expect(text).toContain('人机验证');
 expect(text).toContain('https://tensor.art/models/');
});
it('does not invent an upstream HTTP code when no response was received',()=>{
 const text=describeApiFailure(502,{error:'connect failed',executionTrace:[{status:null,endpoint:'https://example.com'}]},'/api/models');
 expect(text).toContain('network');expect(text).not.toContain('上游 HTTP');
});
it('keeps local validation distinct from an upstream rejection',()=>{
 expect(describeApiFailure(400,{errorSource:'local',error:'模型为必填项'},'/api/generate')).toContain('local · /api/generate（未调用任何上游）');
});

it('does not rewrite Civitai Krea refuse with app-written Chinese conclusion',()=>{
  const jargon='Civitai Krea v2 官方不接受 LoRA、负面提示词或宽高像素（见 https://developer.civitai.com/orchestration/recipes/krea）。请改用 Flux 2 / Qwen 配方，或换到官方支持 LoRA 的供应商端点。';
  // 2026-10-15 hard rule: local rejection that never left the server → 「没有发出去：<原文>」, no rewrite.
  expect(userFacingApiFailure(400,{errorSource:'local',error:jargon},'/api/engine/civitai/generate')).toBe(`没有发出去：${jargon}`);
});
it('unicodeSafeSlice never cuts mid-grapheme',()=>{
  const s='Civitai Krea v2 官方不接受 LoRA、负面提示词或宽高像素（见 https://example.com）';
  const cut=unicodeSafeSlice(s,20);
  expect(cut.endsWith('…')).toBe(true);
  expect(cut).not.toMatch(/见$/);
});

it('maps HF billing key-rotate summary without path jargon',()=>{
  expect(userFacingApiFailure(402,{error:'x',keyRotation:{summary:'hf_0...a: HTTP 402: Purchase pre-paid credits'}},'/api/engine/huggingface/generate')).toBe('hf_0...a: HTTP 402: Purchase pre-paid credits');
  expect(userFacingApiFailure(402,{error:'x',keyRotation:{summary:'完成\nhf_0...a: HTTP 402: no credits'}},'/api/x')).toBe('完成\nhf_0...a: HTTP 402: no credits');
});

it('shows ModelScope CN 模型不存在 verbatim without app-written Chinese rewrite',()=>{
  const jargon='魔搭国内站 (modelscope.cn) API 提交失败 [500]: {"errors":{"message":"apiInferModelDownload call failed: callApiInferModelDownload failed: [Model Exception] 模型不存在"},"request_id":"4c0b7caa-7f63-497c-972e-2f4e0e65a677"}';
  const text = userFacingApiFailure(500,{error:jargon,errorSource:'upstream'},'/api/modelscope/generate');
  expect(text).toContain('apiInferModelDownload call failed');
  expect(text).toContain('模型不存在');
  expect(text).toContain('request_id');
  expect(text).toContain('4c0b7caa-7f63-497c-972e-2f4e0e65a677');
  expect(text).toContain('{"errors":');
  expect(text).not.toContain('魔搭国内站找不到这个模型或 LoRA');
});
it('shows ModelScope AI 模型不存在 verbatim without app-written Chinese rewrite',()=>{
  const jargon='魔搭国际站 (modelscope.ai) API 提交失败 [500]: 模型不存在';
  expect(userFacingApiFailure(500,{error:jargon},'/api/modelscope/generate')).toContain('模型不存在');
});

it('透传 Krea HTTP 402 upstream message verbatim — never rewrite or drop body JSON',()=>{
  const upstreamMsg='Your API balance is separate from your workspace compute balance. Please top up your API balance to continue using the API.';
  const jargon='HTTP 402: {"message":"'+upstreamMsg+'"}';
  // Verbatim error display: preserves full body JSON and never rewrites
  const outShaped = userFacingApiFailure(402,{error:jargon,errorSource:'upstream',upstreamStatus:402,upstreamResponseBody:jargon.replace(/^HTTP 402:?\s*/, '')},'/api/schema-provider/krea/submit');
  expect(outShaped).toContain('HTTP 402');
  expect(outShaped).toContain('API balance');
  expect(outShaped).not.toMatch(/API 余额不足/);
  expect(outShaped).toContain('{"message"');
  expect(userFacingApiFailure(402,{error:jargon},'/api/schema-provider/krea/submit')).toContain('API balance');
  expect(userFacingApiFailure(402,{error:jargon},'/api/schema-provider/krea/submit')).not.toMatch(/API 余额不足/);
  expect(plainErrorMessage(new Error(jargon+'\ntech line\nraw'))).toContain('HTTP 402');
  expect(plainErrorMessage(new Error(jargon+'\ntech line\nraw'))).toContain('API balance');
  expect(plainErrorMessage(new Error(jargon))).not.toMatch(/API 余额不足/);
  expect(plainErrorMessage(new Error(jargon))).toContain('{"message"');
});
it('does not rewrite missing execution node error via plainFailureConclusion',()=>{
  expect(plainErrorMessage(new Error('未找到指定的执行节点: node-1'))).toContain('未找到指定的执行节点: node-1');
});
it('402 with opaque body 透传 original detail — no invented Chinese summary',()=>{
  expect(userFacingApiFailure(402,{error:'x'},'/api/x')).toBe('x');
  expect(userFacingApiFailure(402,{error:'Payment Required'},'/api/x')).toBe('Payment Required');
  expect(userFacingApiFailure(402,{error:'x'},'/api/x')).not.toMatch(/API 余额不足/);
});

it('透传 AIMLAPI HTTP 403 run-out-of-funds message — full verbatim body, no mid-message ellipsis', () => {
  const upstreamMsg =
    "You've run out of funds. Please top up your balance or update your payment method to continue: https://aimlapi.com/app/billing/";
  const bodyJson = JSON.stringify({
    title: 'Forbidden',
    status: 403,
    message: upstreamMsg,
    error: { name: 'ForbiddenException', message: upstreamMsg, data: { kind: 'err_insufficent_credits' } },
  });
  const jargon = `HTTP 403: ${bodyJson}`;
  // Verbatim banner: HTTP + full response body JSON preserved
  const shaped = { error: jargon, errorSource: 'upstream', upstreamStatus: 403, upstreamResponseBody: bodyJson };
  expect(userFacingApiFailure(403, shaped, '/api/schema-provider/aimlapi/submit')).toContain('HTTP 403');
  expect(userFacingApiFailure(403, shaped, '/api/schema-provider/aimlapi/submit')).toContain('run out of funds');
  expect(userFacingApiFailure(403, shaped, '/api/schema-provider/aimlapi/submit')).toContain('aimlapi.com/app/billing');
  expect(userFacingApiFailure(403, shaped, '/api/schema-provider/aimlapi/submit')).toContain('"title":"Forbidden"');
  expect(userFacingApiFailure(403, { error: jargon }, '/api/schema-provider/aimlapi/submit')).not.toMatch(/…$/);
  expect(userFacingApiFailure(403, { error: jargon }, '/api/schema-provider/aimlapi/submit')).toContain('aimlapi.com/app/billing');
  expect(plainErrorMessage(new Error(jargon + '\ntech\nraw'))).toContain('HTTP 403');
  expect(plainErrorMessage(new Error(jargon + '\ntech\nraw'))).toContain('run out of funds');
  expect(plainErrorMessage(new Error(jargon))).not.toMatch(/API 余额不足/);
  expect(plainErrorMessage(new Error(jargon))).toContain('"title":"Forbidden"');
  expect(isBillingFailureText(jargon)).toBe(true);
  expect(errorBannerText(jargon)).toContain('HTTP 403');
  expect(errorBannerText(jargon)).toContain('run out of funds');
  expect(errorBannerText(jargon)).toContain('"title":"Forbidden"');
  expect(errorBannerText(upstreamMsg)).toBe(upstreamMsg);
});

it('does not treat Cloudflare challenge 403 as billing pass-through', () => {
  expect(isBillingFailureText('HTTP 403: <html>challenges.cloudflare.com cf_chl</html>')).toBe(false);
  expect(userFacingApiFailure(403, { error: 'Forbidden' }, '/api/models')).toMatch(/Forbidden/);
});


it('extractUpstreamMessage reads ModelScope errors.message (bind account)', () => {
  const body = '{"errors":{"message":"Please bind your Alibaba Cloud account before use. You can bind it at: https://modelscope.ai/my/settings/account"},"request_id":"2f99b065-cd8d-42ac-bdd0-8ed2b02ad0ce"}';
  expect(extractUpstreamMessage(body)).toContain('bind your Alibaba Cloud account');
  expect(shortUpstreamSummary(`HTTP 401 Unauthorized ${body}`)).toContain('bind your Alibaba Cloud account');
  expect(shortUpstreamSummary(`HTTP 401 Unauthorized ${body}`)).not.toMatch(/^HTTP 401 Unauthorized$/);
});

it('historyFacingErrorMessage reuses history item.error (Magento 401 bind), not short HTTP status', () => {
  const histError = '魔搭国际站 (modelscope.ai) API 提交失败 [401]: {"errors":{"message":"Please bind your Alibaba Cloud account before use. You can bind it at: https://modelscope.ai/my/settings/account"},"request_id":"2f99b065-cd8d-42ac-bdd0-8ed2b02ad0ce"}';
  const body = '{"errors":{"message":"Please bind your Alibaba Cloud account before use. You can bind it at: https://modelscope.ai/my/settings/account"},"request_id":"2f99b065-cd8d-42ac-bdd0-8ed2b02ad0ce"}';
  const err = {
    name: 'ApiTraceError',
    message: `HTTP 401 Unauthorized\ntech\n${histError}`,
    data: {
      error: histError,
      errorSource: 'upstream',
      upstreamStatus: 401,
      upstreamStatusText: 'Unauthorized',
      upstreamResponseBody: body,
      details: body,
      historyItem: { error: histError, status: 'failed', upstreamStatus: 401, upstreamResponseBody: body },
      executionTrace: [{ method: 'POST', endpoint: 'https://api-inference.modelscope.ai/v1/images/generations', status: 401, statusText: 'Unauthorized', responseBody: body }],
    },
  };
  const facing = historyFacingErrorMessage(err)!;
  expect(facing).toBe(histError);
  expect(facing).toContain('bind your Alibaba Cloud account');
  expect(facing).toContain('"errors"');
  // Short banner path still exists for sampler / status bar — Save Image must not stop there.
  expect(plainErrorMessage(Object.assign(new Error(err.message), { data: err.data }))).toMatch(/HTTP 401/);
  expect(facing).not.toMatch(/^HTTP 401 Unauthorized$/);
});

import {readResponseBody, httpErrorMessageFromBody, httpErrorFromResponse} from './apiFailure';
it('errorBannerText keeps the full multi-line text (no first-line clipping)',()=>{
  const multi='HTTP 500 upstream\n{"error":"boom",\n"stack":"at a\\nat b"}\nline4';
  expect(errorBannerText(multi)).toBe(multi);
  const local='没有发出去：该服务商不支持: loras（krea）\n更多细节';
  expect(errorBannerText(local)).toBe(local);
});
it('httpErrorFromResponse: non-JSON body kept verbatim with real status',async()=>{
  const html='<html>502 Bad Gateway cf-ray</html>';
  const err=await httpErrorFromResponse(new Response(html,{status:502,statusText:'Bad Gateway'}));
  expect(err.message).toBe(`HTTP 502 Bad Gateway: ${html}`);
  expect((err as any).status).toBe(502);
  expect((err as any).responseBody).toBe(html);
});
it('httpErrorMessageFromBody: JSON picks details, then error, else raw text',async()=>{
  const mk=(o:unknown)=>readResponseBody(new Response(JSON.stringify(o),{status:400}));
  expect(httpErrorMessageFromBody(await mk({error:'e',details:'d'}))).toBe('HTTP 400: d');
  expect(httpErrorMessageFromBody(await mk({error:'e'}))).toBe('HTTP 400: e');
  expect(httpErrorMessageFromBody(await mk({other:1}))).toBe('HTTP 400: {"other":1}');
  expect(httpErrorMessageFromBody(await mk({error:{code:7}}))).toBe('HTTP 400: {"code":7}');
  expect(httpErrorMessageFromBody(await readResponseBody(new Response('',{status:503})))).toBe('HTTP 503: (空响应体)');
});
