// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { NodeErrorDisclosure, summarizeErrorMessage } from './NodeErrorDisclosure';
import {
  upstreamHttpFirstLine,
  upstreamFailureToast,
  plainErrorMessage,
  errorBannerText,
  userFacingApiFailure,
  upstreamFailureParts,
  stripLocalWrapperPrefix,
} from '../utils/apiFailure';
import App from '../App';
import * as graphEngine from '../utils/graphEngine';
import { NODE_DEFINITIONS as D } from '../constants/nodes';
import { BOARDS_KEY, ACTIVE_BOARD_KEY, MODE_KEY } from '../utils/workspaceCache';
import { clearSharedGet } from '../services/sharedGet';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('Task 5 & P1-3: Verbatim upstream error display & mutation sensitivity', () => {
  // Aligned after-phase recorded upstream JSON bodies from docs/evidence/2026-11-05/verbatim-errors.md
  const MAGE_402_BODY = '{"error":{"code":"payment_required","message":"The Mage API and MCP server need a successful payment on this account first: buy any Gem pack or start a plan at https://www.mage.space/gems, then retry. Signup bonus Gems work in the Mage app only."}}';
  const CIVITAI_400_BODY = '{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-089db51091f4345a3219237a503afea7-a5602b6b0e42f089-02"}';
  const FAL_403_BODY = '{"detail":"User is locked. Reason: TOP_UP."}';
  const TOGETHER_401_BODY = '{"id":"f0872edf-aws_ue2","error":{"message":"Invalid API key provided. You can find your API key at https://api.together.ai/settings/api-keys.","type":"invalid_request_error","param":null,"code":"invalid_api_key"}}';
  const MODELSCOPE_400_BODY = '{"errors":{"message":"Invalid model id: nonexistent-model-xyz-12345"},"request_id":"13ff7f2a-bf94-4290-abb6-0248a7c80caf"}';
  const MODELSCOPE_500_BODY = '{"errors":{"message":"apiInferModelDownload call failed: callApiInferModelDownload failed: [Model Exception] 模型不存在"},"request_id":"4c0b7caa-7f63-497c-972e-2f4e0e65a677"}';

  // Retrospective baseline fixtures (run 1 recorded references)
  const BASELINE_CIVITAI_400_BODY = '{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-3fcab5cbc7eb9a45dec553c121621979-a7080901a1cfba97-02"}';
  const BASELINE_TOGETHER_401_BODY = '{"id":"95234f6a-aws_ue2","error":{"message":"Invalid API key provided. You can find your API key at https://api.together.ai/settings/api-keys.","type":"invalid_request_error","param":null,"code":"invalid_api_key"}}';
  const BASELINE_MODELSCOPE_400_BODY = '{"errors":{"message":"Invalid model id: nonexistent-model-xyz-12345"},"request_id":"a12ad933-ae78-45db-8353-3a8eac418c5a"}';

  describe('1. Exact upstream JSON as primary text without app wrappers', () => {
    it('Mage 402: toast message is exact upstream JSON, no app wrapper or ellipsis', () => {
      const data = {
        provider: 'mage',
        upstreamStatus: 402,
        upstreamStatusText: 'Payment Required',
        rawResponse: MAGE_402_BODY,
        executionTrace: [{ provider: 'mage', status: 402, statusText: 'Payment Required', responseBody: MAGE_402_BODY }],
      };
      const toast = upstreamFailureToast(data)!;
      expect(toast.title).toBe('【mage】HTTP 402 Payment Required');
      expect(toast.message).toBe(MAGE_402_BODY);
      expect(toast.message).not.toContain('完整上游响应原文');
      expect(toast.message).not.toContain('（上游响应体见展开）');
      expect(toast.message).not.toContain('…');

      const line = upstreamHttpFirstLine(data)!;
      expect(line).toBe(`【mage】HTTP 402 Payment Required: ${MAGE_402_BODY}`);
      expect(line).not.toContain('…');
    });

    it('Civitai 400: toast message is exact RFC9110 JSON with detail=insufficientBuzz', () => {
      const data = {
        provider: 'civitai',
        upstreamStatus: 400,
        upstreamStatusText: 'Bad Request',
        rawResponse: CIVITAI_400_BODY,
        executionTrace: [{ provider: 'civitai', status: 400, statusText: 'Bad Request', responseBody: CIVITAI_400_BODY }],
      };
      const toast = upstreamFailureToast(data)!;
      expect(toast.title).toBe('【civitai】HTTP 400 Bad Request');
      expect(toast.message).toBe(CIVITAI_400_BODY);
      expect(toast.message).not.toContain('完整上游响应原文');
      expect(toast.message).not.toContain('…');

      const line = upstreamHttpFirstLine(data)!;
      expect(line).toBe(`【civitai】HTTP 400 Bad Request: ${CIVITAI_400_BODY}`);
    });

    it('Civitai 400 (retrospective baseline): supports baseline recorded traceId verbatim', () => {
      const data = {
        provider: 'civitai',
        upstreamStatus: 400,
        upstreamStatusText: 'Bad Request',
        rawResponse: BASELINE_CIVITAI_400_BODY,
        executionTrace: [{ provider: 'civitai', status: 400, statusText: 'Bad Request', responseBody: BASELINE_CIVITAI_400_BODY }],
      };
      const toast = upstreamFailureToast(data)!;
      expect(toast.message).toBe(BASELINE_CIVITAI_400_BODY);
      expect(toast.message).toContain('3fcab5cbc7eb9a45dec553c121621979');
    });

    it('Fal 403: toast message is exact JSON with User is locked. Reason: TOP_UP.', () => {
      const data = {
        provider: 'fal',
        upstreamStatus: 403,
        upstreamStatusText: 'Forbidden',
        rawResponse: FAL_403_BODY,
        executionTrace: [{ provider: 'fal', status: 403, statusText: 'Forbidden', responseBody: FAL_403_BODY }],
      };
      const toast = upstreamFailureToast(data)!;
      expect(toast.title).toBe('【fal】HTTP 403 Forbidden');
      expect(toast.message).toBe(FAL_403_BODY);
      expect(toast.message).not.toContain('完整上游响应原文');
      expect(toast.message).not.toContain('…');

      const line = upstreamHttpFirstLine(data)!;
      expect(line).toBe(`【fal】HTTP 403 Forbidden: ${FAL_403_BODY}`);
    });

    it('Together 401: toast message is exact JSON with id, code, and message intact', () => {
      const data = {
        provider: 'together',
        upstreamStatus: 401,
        upstreamStatusText: 'Unauthorized',
        rawResponse: TOGETHER_401_BODY,
        executionTrace: [{ provider: 'together', status: 401, statusText: 'Unauthorized', responseBody: TOGETHER_401_BODY }],
      };
      const toast = upstreamFailureToast(data)!;
      expect(toast.title).toBe('【together】HTTP 401 Unauthorized');
      expect(toast.message).toBe(TOGETHER_401_BODY);
      expect(toast.message).toContain('f0872edf-aws_ue2');
      expect(toast.message).not.toContain('完整上游响应原文');
      expect(toast.message).not.toContain('…');

      const line = upstreamHttpFirstLine(data)!;
      expect(line).toBe(`【together】HTTP 401 Unauthorized: ${TOGETHER_401_BODY}`);
    });

    it('ModelScope 400: toast message is exact JSON with Invalid model id and request_id', () => {
      const data = {
        provider: 'modelscope',
        upstreamStatus: 400,
        upstreamStatusText: 'Bad Request',
        rawResponse: MODELSCOPE_400_BODY,
        executionTrace: [{ provider: 'modelscope', status: 400, statusText: 'Bad Request', responseBody: MODELSCOPE_400_BODY }],
      };
      const toast = upstreamFailureToast(data)!;
      expect(toast.title).toBe('【modelscope】HTTP 400 Bad Request');
      expect(toast.message).toBe(MODELSCOPE_400_BODY);
      expect(toast.message).toContain('13ff7f2a-bf94-4290-abb6-0248a7c80caf');
      expect(toast.message).not.toContain('完整上游响应原文');
      expect(toast.message).not.toContain('…');

      const line = upstreamHttpFirstLine(data)!;
      expect(line).toBe(`【modelscope】HTTP 400 Bad Request: ${MODELSCOPE_400_BODY}`);
    });
  });

  describe('2. Mutation (c) test: plainErrorMessage never rewrites 模型不存在', () => {
    it('fails if plainErrorMessage rewrites ModelScope 500 模型不存在 to Chinese', () => {
      const err500 = new Error(MODELSCOPE_500_BODY);
      const msg500 = plainErrorMessage(err500);
      expect(msg500).toContain('apiInferModelDownload call failed');
      expect(msg500).toContain('4c0b7caa-7f63-497c-972e-2f4e0e65a677');
      expect(msg500).not.toMatch(/魔搭.*找不到这个模型/);
      expect(msg500).toBe(MODELSCOPE_500_BODY);
    });

    it('fails if plainErrorMessage rewrites ModelScope 400 Invalid model id', () => {
      const err400 = new Error(MODELSCOPE_400_BODY);
      const msg400 = plainErrorMessage(err400);
      expect(msg400).toContain('Invalid model id: nonexistent-model-xyz-12345');
      expect(msg400).toContain('13ff7f2a-bf94-4290-abb6-0248a7c80caf');
      expect(msg400).not.toMatch(/魔搭.*找不到这个模型/);
      expect(msg400).toBe(MODELSCOPE_400_BODY);
    });
  });

  describe('3. Mutation (d) test: 去配置密钥 button ONLY appears on statusCode === 401', () => {
    it('does NOT render 去配置密钥 when statusCode !== 401 even if body contains invalid_api_key or 未配置', () => {
      const html400 = renderToStaticMarkup(
        <NodeErrorDisclosure
          errorMessage={`【together】HTTP 400 Bad Request: {"error":"invalid_api_key: 未配置服务商密钥"}`}
          provider="together"
          statusCode={400}
          onOpenSettings={() => {}}
        />
      );
      expect(html400).not.toContain('去配置密钥');

      const summary400 = summarizeErrorMessage('HTTP 400: invalid_api_key 未配置', 'together', 400);
      expect(summary400.isMissingKey).toBe(false);

      const html403 = renderToStaticMarkup(
        <NodeErrorDisclosure
          errorMessage={`【together】HTTP 403 Forbidden: {"detail":"invalid_api_key"}`}
          provider="together"
          statusCode={403}
          onOpenSettings={() => {}}
        />
      );
      expect(html403).not.toContain('去配置密钥');
    });

    it('renders 去配置密钥 when and only when statusCode === 401', () => {
      const html401 = renderToStaticMarkup(
        <NodeErrorDisclosure
          errorMessage={`【together】HTTP 401 Unauthorized: ${TOGETHER_401_BODY}`}
          provider="together"
          statusCode={401}
          onOpenSettings={() => {}}
        />
      );
      expect(html401).toContain('去配置密钥');

      const summary401 = summarizeErrorMessage(TOGETHER_401_BODY, 'together', 401);
      expect(summary401.isMissingKey).toBe(true);
    });
  });

  describe('4. Real DOM mounting & Mutation (e) test: App Toast renders verbatim body without <details>', () => {
    let root: Root | null = null;
    let hostContainer: HTMLDivElement | null = null;

    const createTestNode = (id: string, type: string, values: any) => ({
      id,
      type,
      title: D[type].title,
      pos: { x: 0, y: 0 },
      width: 300,
      inputs: D[type].inputs,
      outputs: D[type].outputs,
      values: { ...D[type].defaultValues, ...values },
      state: 'idle' as const,
    });

    const createTestEdge = (id: string, f: string, fs: string, t: string, ts: string) => ({
      id,
      fromNodeId: f,
      fromSocketId: fs,
      toNodeId: t,
      toSocketId: ts,
      type: fs,
    });

    function createTestBoard() {
      const nodes = [
        createTestNode('ck', 'CheckpointLoaderSimple', {
          ckpt_name: 'wavespeed-ai/z-image/turbo',
          targetProvider: 'wavespeed',
          custom_parameters: JSON.stringify({ _canvas: { schemaProperties: ['prompt', 'seed', 'size'] } }),
        }),
        createTestNode('pos', 'CLIPTextEncode', { text: 'a red fox' }),
        createTestNode('neg', 'CLIPTextEncodeNegative', { text: 'blurry' }),
        createTestNode('lat', 'EmptyLatentImage', { width: 1024, height: 1024 }),
        createTestNode('ks', 'KSampler', { seed: 42 }),
        createTestNode('vd', 'VAEDecode', {}),
        createTestNode('sv', 'SaveImage', {}),
      ];
      const connections = [
        createTestEdge('e1', 'ck', 'MODEL', 'ks', 'model'),
        createTestEdge('e2', 'ck', 'CLIP', 'pos', 'clip'),
        createTestEdge('e3', 'pos', 'CONDITIONING', 'ks', 'positive'),
        createTestEdge('e4', 'neg', 'CONDITIONING', 'ks', 'negative'),
        createTestEdge('e5', 'lat', 'LATENT', 'ks', 'latent_image'),
        createTestEdge('e6', 'ks', 'LATENT', 'vd', 'samples'),
        createTestEdge('e7', 'ck', 'VAE', 'vd', 'vae'),
        createTestEdge('e8', 'vd', 'IMAGE', 'sv', 'images'),
      ];
      return { id: 'b1', name: 'verbatim-test-board', nodes, connections, spatialFrames: [] };
    }

    const settle = async (n = 3) => {
      for (let i = 0; i < n; i++) {
        await act(async () => {
          await new Promise((r) => setTimeout(r, 40));
        });
      }
    };

    beforeEach(async () => {
      clearSharedGet();
      vi.stubGlobal('fetch', vi.fn(async (u: any) => {
        const url = String(u);
        if (url.includes('/api/model-schema')) {
          return new Response(JSON.stringify({ inputSchema: { properties: { prompt: {}, seed: {}, size: {} } } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        if (url.includes('/api/models')) {
          return new Response(JSON.stringify({
            wavespeed: [{ id: 'wavespeed-ai/z-image/turbo', name: 'Z Image Turbo', type: 'Checkpoint' }],
            _pagination: { wavespeed: { hasMore: false, page: 1 } },
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      }));

      localStorage.setItem(BOARDS_KEY, JSON.stringify([createTestBoard()]));
      localStorage.setItem(ACTIVE_BOARD_KEY, 'b1');
      localStorage.setItem(MODE_KEY, 'graph');

      hostContainer = document.createElement('div');
      document.body.appendChild(hostContainer);
      root = createRoot(hostContainer);
      await act(async () => {
        root!.render(<App />);
      });
      await settle();
    });

    afterEach(async () => {
      if (root) {
        await act(async () => {
          root?.unmount();
        });
      }
      root = null;
      if (hostContainer && hostContainer.parentNode) {
        hostContainer.parentNode.removeChild(hostContainer);
      }
      hostContainer = null;
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      localStorage.clear();
      document.body.innerHTML = '';
    });

    const triggerRunError = async (errorData: any) => {
      vi.spyOn(graphEngine, 'executeWorkflow').mockImplementation(async () => {
        const err = Object.assign(new Error('workflow execution failed'), { data: errorData });
        throw err;
      });
      const runBtn = document.querySelector('[data-testid="run-button"]') as HTMLButtonElement;
      expect(runBtn).not.toBeNull();
      await act(async () => {
        runBtn.click();
      });
      await settle(3);
    };

    it('mounts App in real DOM: Mage 402 renders verbatim raw body, no <details> wrapper', async () => {
      await triggerRunError({
        provider: 'mage',
        upstreamStatus: 402,
        upstreamStatusText: 'Payment Required',
        rawResponse: MAGE_402_BODY,
        executionTrace: [{ provider: 'mage', status: 402, statusText: 'Payment Required', responseBody: MAGE_402_BODY }],
      });

      const toastContainer = document.querySelector('[data-testid="toast-container"]');
      expect(toastContainer).not.toBeNull();

      const toastTitle = document.querySelector('[data-testid="toast-title"]');
      expect(toastTitle?.textContent).toBe('【mage】HTTP 402 Payment Required');

      const toastPre = document.querySelector('[data-testid="toast-first-line"]') as HTMLPreElement;
      expect(toastPre).not.toBeNull();
      expect(toastPre.textContent).toBe(MAGE_402_BODY);

      // Mutation (e) sensitivity: Toast body must never be folded behind a <details> element
      expect(toastPre.closest('details')).toBeNull();
    });

    it('mounts App in real DOM: empty rawResponse "" is preserved empty, never falls back to error wrapper', async () => {
      await triggerRunError({
        provider: 'wavespeed',
        upstreamStatus: 500,
        upstreamStatusText: 'Internal Server Error',
        rawResponse: '',
        error: '执行失败：本地包装文案不应冒充上游响应',
        executionTrace: [{ provider: 'wavespeed', status: 500, statusText: 'Internal Server Error', responseBody: '' }],
      });

      const toastPre = document.querySelector('[data-testid="toast-first-line"]') as HTMLPreElement;
      expect(toastPre).not.toBeNull();
      // Verbatim 0-byte body must remain empty string, never displaying the local error wrapper
      expect(toastPre.textContent).toBe('');
      expect(toastPre.textContent).not.toContain('执行失败');
      expect(toastPre.textContent).not.toContain('本地包装文案');
      expect(toastPre.closest('details')).toBeNull();
    });

    it('mounts App in real DOM: multiline response with trailing whitespace & newline is preserved untouched', async () => {
      const multilineWithTrailingNewline = '{\n  "error": "gateway timeout",\n  "code": 504\n}\n';
      await triggerRunError({
        provider: 'wavespeed',
        upstreamStatus: 504,
        upstreamStatusText: 'Gateway Timeout',
        rawResponse: multilineWithTrailingNewline,
        executionTrace: [{ provider: 'wavespeed', status: 504, statusText: 'Gateway Timeout', responseBody: multilineWithTrailingNewline }],
      });

      const toastPre = document.querySelector('[data-testid="toast-first-line"]') as HTMLPreElement;
      expect(toastPre).not.toBeNull();
      // Verbatim preservation: trailing \n must NOT be trimmed away
      expect(toastPre.textContent).toBe(multilineWithTrailingNewline);
      expect(toastPre.closest('details')).toBeNull();
    });

    it('mounts App in real DOM: upstream JSON containing Chinese prefix words is NOT corrupted', async () => {
      const jsonWithChinesePrefix = '{"error":"执行失败：这是上游包含中文关键词的合法原文","traceId":"ms-9988"}';
      await triggerRunError({
        provider: 'modelscope',
        upstreamStatus: 400,
        upstreamStatusText: 'Bad Request',
        rawResponse: jsonWithChinesePrefix,
        executionTrace: [{ provider: 'modelscope', status: 400, statusText: 'Bad Request', responseBody: jsonWithChinesePrefix }],
      });

      const toastPre = document.querySelector('[data-testid="toast-first-line"]') as HTMLPreElement;
      expect(toastPre).not.toBeNull();
      // Valid JSON starting with { must NEVER have prefix stripped or syntax broken
      expect(toastPre.textContent).toBe(jsonWithChinesePrefix);
      expect(() => JSON.parse(toastPre.textContent!)).not.toThrow();
      expect(toastPre.closest('details')).toBeNull();
    });

    it('mounts App in real DOM: response without provider is preserved with clean HTTP title', async () => {
      const unbrandedBody = 'Service temporarily unavailable due to upstream maintenance';
      await triggerRunError({
        upstreamStatus: 503,
        upstreamStatusText: 'Service Unavailable',
        rawResponse: unbrandedBody,
        executionTrace: [{ status: 503, statusText: 'Service Unavailable', responseBody: unbrandedBody }],
      });

      const toastTitle = document.querySelector('[data-testid="toast-title"]');
      expect(toastTitle?.textContent).toBe('HTTP 503 Service Unavailable');
      expect(toastTitle?.textContent).not.toContain('【undefined】');

      const toastPre = document.querySelector('[data-testid="toast-first-line"]') as HTMLPreElement;
      expect(toastPre).not.toBeNull();
      expect(toastPre.textContent).toBe(unbrandedBody);
      expect(toastPre.closest('details')).toBeNull();
    });

    it('mounts App in real DOM: separates localWrapper into independent container, keeping pre clean', async () => {
      const localStack = 'Error: upstream connection reset\n    at SchemaProviderDriver.ts:120:15\n    at run.ts:45:10';
      await triggerRunError({
        provider: 'fal',
        upstreamStatus: 403,
        upstreamStatusText: 'Forbidden',
        rawResponse: FAL_403_BODY,
        localWrapper: localStack,
        executionTrace: [{ provider: 'fal', status: 403, statusText: 'Forbidden', responseBody: FAL_403_BODY }],
      });

      const toastPre = document.querySelector('[data-testid="toast-first-line"]') as HTMLPreElement;
      expect(toastPre).not.toBeNull();
      // Pre contains ONLY the pure upstream response body
      expect(toastPre.textContent).toBe(FAL_403_BODY);
      expect(toastPre.textContent).not.toContain('SchemaProviderDriver');

      // Local technical wrapper is rendered in its own dedicated container
      const localWrapperEl = document.querySelector('[data-testid="toast-local-wrapper"]');
      expect(localWrapperEl).not.toBeNull();
      expect(localWrapperEl?.textContent).toContain('本地包装与技术详情：');
      expect(localWrapperEl?.textContent).toContain('SchemaProviderDriver.ts:120:15');
      expect(toastPre.closest('details')).toBeNull();
    });
  });

  describe('5. Unstructured & non-provider error preservation (multiline, long body, plain text)', () => {
    it('preserves multiline body without provider or route', () => {
      const multiline = 'line 1\nline 2\nline 3';
      const data = { executionTrace: [{ status: 500, statusText: 'Internal Server Error', responseBody: multiline }] };
      const line = upstreamHttpFirstLine(data)!;
      expect(line).toBe(`HTTP 500 Internal Server Error ${multiline}`);
      expect(line).toContain('line 1\nline 2\nline 3');
    });

    it('preserves multiline plain text in plainErrorMessage', () => {
      const multiline = 'Internal error occurred\nStack trace: at foo.ts:10\nat bar.ts:20';
      const err = new Error(multiline);
      const msg = plainErrorMessage(err);
      expect(msg).toBe(multiline);
      expect(msg).toContain('at bar.ts:20');
    });

    it('handles empty responseBody gracefully without phantom text', () => {
      const data = { executionTrace: [{ status: 502, statusText: 'Bad Gateway', responseBody: '' }] };
      const line = upstreamHttpFirstLine(data)!;
      expect(line).toBe('HTTP 502 Bad Gateway');
    });

    it('stripLocalWrapperPrefix never corrupts valid JSON', () => {
      const json = '{"error":"执行失败：这是上游错误","traceId":"123"}';
      expect(stripLocalWrapperPrefix(json)).toBe(json);
      const arrayJson = '[{"error":"提交失败：上游记录"}]';
      expect(stripLocalWrapperPrefix(arrayJson)).toBe(arrayJson);
      // Strips genuine outer local wrappers before JSON or plain text
      const wrapped = 'Civitai Orchestration 官方算力返回错误 [400]: {"error":"bad"}';
      expect(stripLocalWrapperPrefix(wrapped)).toBe('{"error":"bad"}');
    });
  });
});
