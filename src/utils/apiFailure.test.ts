import {it,expect} from 'vitest';
import {describeApiFailure, plainFailureConclusion, plainErrorMessage, userFacingApiFailure, unicodeSafeSlice, errorBannerText, isBillingFailureText, MODELSCOPE_MODEL_MISSING_CN, MODELSCOPE_MODEL_MISSING_AI, EXEC_NODE_MISSING} from './apiFailure';
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

it('maps Civitai Krea refuse to plain LoRA conclusion without schema jargon',()=>{
  const jargon='Civitai Krea v2 官方不接受 LoRA、负面提示词或宽高像素（见 https://developer.civitai.com/orchestration/recipes/krea）。请改用 Flux 2 / Qwen 配方，或换到官方支持 LoRA 的供应商端点。';
  expect(plainFailureConclusion(jargon)).toBe('请换支持 LoRA 的模型或先不用这条');
  // 2026-10-15 hard rule: local rejection that never left the server → 「未出站，本地拦截：<原文>」, no rewrite.
  expect(userFacingApiFailure(400,{errorSource:'local',error:jargon},'/api/engine/civitai/generate')).toBe(`未出站，本地拦截：${jargon}`);
});
it('unicodeSafeSlice never cuts mid-grapheme',()=>{
  const s='Civitai Krea v2 官方不接受 LoRA、负面提示词或宽高像素（见 https://example.com）';
  const cut=unicodeSafeSlice(s,20);
  expect(cut.endsWith('…')).toBe(true);
  expect(cut).not.toMatch(/见$/);
});

it('maps HF billing key-rotate summary without path jargon',()=>{
  expect(plainFailureConclusion('几把都额度不够')).toBe('几把都额度不够');
  expect(userFacingApiFailure(402,{error:'几把都额度不够',keyRotation:{summary:'几把都额度不够'}},'/api/engine/huggingface/generate')).toBe('几把都额度不够');
  expect(userFacingApiFailure(402,{error:'x',keyRotation:{summary:'这把额度不够，已换下一把'}},'/api/x')).toBe('这把额度不够，已换下一把');
});

it('maps ModelScope CN 模型不存在 to plain conclusion without JSON or [500]',()=>{
  const jargon='魔搭国内站 (modelscope.cn) API 提交失败 [500]: {"errors":{"message":"apiInferModelDownload call failed: callApiInferModelDownload failed: [Model Exception] 模型不存在"},"request_id":"4c0b7caa-7f63-497c-972e-2f4e0e65a677"}';
  expect(plainFailureConclusion(jargon)).toBe(MODELSCOPE_MODEL_MISSING_CN);
  expect(plainFailureConclusion(jargon)).toBe('魔搭国内站找不到这个模型或 LoRA');
  expect(userFacingApiFailure(500,{error:jargon,errorSource:'upstream'},'/api/modelscope/generate')).toBe(MODELSCOPE_MODEL_MISSING_CN);
  expect(userFacingApiFailure(500,{error:jargon},'/api/modelscope/generate')).not.toMatch(/\[500\]|request_id|apiInferModelDownload|\{/);
});
it('maps ModelScope AI 模型不存在 to international plain conclusion',()=>{
  const jargon='魔搭国际站 (modelscope.ai) API 提交失败 [500]: 模型不存在';
  expect(plainFailureConclusion(jargon)).toBe(MODELSCOPE_MODEL_MISSING_AI);
});

it('透传 Krea HTTP 402 upstream message — never rewrite to Chinese billing summary',()=>{
  const upstreamMsg='Your API balance is separate from your workspace compute balance. Please top up your API balance to continue using the API.';
  const jargon='HTTP 402: {"message":"'+upstreamMsg+'"}';
  expect(plainFailureConclusion(jargon)).toBe(upstreamMsg);
  // fix4: banner/top-bar = HTTP + extracted upstream message (no raw JSON); never Chinese rewrite.
  expect(userFacingApiFailure(402,{error:jargon,errorSource:'upstream',upstreamStatus:402,upstreamResponseBody:jargon.replace(/^HTTP 402:?\s*/, '')},'/api/schema-provider/krea/submit')).toContain('HTTP 402');
  expect(userFacingApiFailure(402,{error:jargon,errorSource:'upstream',upstreamStatus:402,upstreamResponseBody:jargon.replace(/^HTTP 402:?\s*/, '')},'/api/schema-provider/krea/submit')).toContain('API balance');
  expect(userFacingApiFailure(402,{error:jargon,errorSource:'upstream',upstreamStatus:402,upstreamResponseBody:jargon.replace(/^HTTP 402:?\s*/, '')},'/api/schema-provider/krea/submit')).not.toMatch(/API 余额不足/);
  expect(userFacingApiFailure(402,{error:jargon,errorSource:'upstream',upstreamStatus:402,upstreamResponseBody:jargon.replace(/^HTTP 402:?\s*/, '')},'/api/schema-provider/krea/submit')).not.toContain('{"message"');
  expect(userFacingApiFailure(402,{error:jargon},'/api/schema-provider/krea/submit')).toContain('API balance');
  expect(userFacingApiFailure(402,{error:jargon},'/api/schema-provider/krea/submit')).not.toMatch(/API 余额不足/);
  expect(plainErrorMessage(new Error(jargon+'\ntech line\nraw'))).toContain('HTTP 402');
  expect(plainErrorMessage(new Error(jargon+'\ntech line\nraw'))).toContain('API balance');
  expect(plainErrorMessage(new Error(jargon))).not.toMatch(/API 余额不足/);
  expect(plainErrorMessage(new Error(jargon))).not.toContain('{"message"');
});
it('maps missing execution node without exposing raw node- id',()=>{
  expect(plainFailureConclusion('未找到指定的执行节点: node-1791998332520')).toBe(EXEC_NODE_MISSING);
  expect(plainFailureConclusion('未找到指定的执行节点: node-1791998332520')).not.toMatch(/node-/);
  expect(plainErrorMessage(new Error('未找到指定的执行节点: node-1'))).toBe(EXEC_NODE_MISSING);
});
it('402 with opaque body 透传 original detail — no invented Chinese summary',()=>{
  expect(userFacingApiFailure(402,{error:'x'},'/api/x')).toBe('x');
  expect(userFacingApiFailure(402,{error:'Payment Required'},'/api/x')).toBe('Payment Required');
  expect(userFacingApiFailure(402,{error:'x'},'/api/x')).not.toMatch(/API 余额不足/);
});

it('透传 AIMLAPI HTTP 403 run-out-of-funds message — full, no mid-message ellipsis', () => {
  const upstreamMsg =
    "You've run out of funds. Please top up your balance or update your payment method to continue: https://aimlapi.com/app/billing/";
  const bodyJson = JSON.stringify({
    title: 'Forbidden',
    status: 403,
    message: upstreamMsg,
    error: { name: 'ForbiddenException', message: upstreamMsg, data: { kind: 'err_insufficent_credits' } },
  });
  const jargon = `HTTP 403: ${bodyJson}`;
  expect(plainFailureConclusion(jargon)).toBe(upstreamMsg);
  // fix4: short banner = HTTP + extracted message (full JSON in history / toast expand).
  const shaped = { error: jargon, errorSource: 'upstream', upstreamStatus: 403, upstreamResponseBody: bodyJson };
  expect(userFacingApiFailure(403, shaped, '/api/schema-provider/aimlapi/submit')).toContain('HTTP 403');
  expect(userFacingApiFailure(403, shaped, '/api/schema-provider/aimlapi/submit')).toContain('run out of funds');
  expect(userFacingApiFailure(403, shaped, '/api/schema-provider/aimlapi/submit')).toContain('aimlapi.com/app/billing');
  expect(userFacingApiFailure(403, shaped, '/api/schema-provider/aimlapi/submit')).not.toContain('"title":"Forbidden"');
  expect(userFacingApiFailure(403, { error: jargon }, '/api/schema-provider/aimlapi/submit')).not.toMatch(/…$/);
  expect(userFacingApiFailure(403, { error: jargon }, '/api/schema-provider/aimlapi/submit')).toContain('aimlapi.com/app/billing');
  expect(plainErrorMessage(new Error(jargon + '\ntech\nraw'))).toContain('HTTP 403');
  expect(plainErrorMessage(new Error(jargon + '\ntech\nraw'))).toContain('run out of funds');
  expect(plainErrorMessage(new Error(jargon))).not.toMatch(/API 余额不足/);
  expect(plainErrorMessage(new Error(jargon))).not.toContain('"title":"Forbidden"');
  expect(isBillingFailureText(jargon)).toBe(true);
  expect(errorBannerText(jargon)).toContain('HTTP 403');
  expect(errorBannerText(jargon)).toContain('run out of funds');
  expect(errorBannerText(jargon)).not.toContain('"title":"Forbidden"');
  expect(errorBannerText(upstreamMsg)).toBe(upstreamMsg);
});

it('does not treat Cloudflare challenge 403 as billing pass-through', () => {
  expect(isBillingFailureText('HTTP 403: <html>challenges.cloudflare.com cf_chl</html>')).toBe(false);
  expect(userFacingApiFailure(403, { error: 'Forbidden' }, '/api/models')).toMatch(/Forbidden/);
});
