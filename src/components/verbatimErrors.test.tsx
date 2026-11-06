// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NodeErrorDisclosure, summarizeErrorMessage } from './NodeErrorDisclosure';
import {
  upstreamHttpFirstLine,
  upstreamFailureToast,
  plainErrorMessage,
  errorBannerText,
  userFacingApiFailure,
  upstreamFailureParts,
} from '../utils/apiFailure';

describe('Task 5 & P1-3: Verbatim upstream error display & mutation sensitivity', () => {
  // After-phase actual recorded upstream JSON bodies from docs/evidence/2026-11-05/verbatim-errors.md
  const MAGE_402_BODY = '{"error":{"code":"payment_required","message":"The Mage API and MCP server need a successful payment on this account first: buy any Gem pack or start a plan at https://www.mage.space/gems, then retry. Signup bonus Gems work in the Mage app only."}}';
  const CIVITAI_400_BODY = '{"type":"https://tools.ietf.org/html/rfc9110#section-15.5.1","title":"Bad Request","status":400,"detail":"insufficientBuzz","traceId":"00-3fcab5cbc7eb9a45dec553c121621979-a7080901a1cfba97-02"}';
  const FAL_403_BODY = '{"detail":"User is locked. Reason: TOP_UP."}';
  const TOGETHER_401_BODY = '{"id":"95234f6a-aws_ue2","error":{"message":"Invalid API key provided. You can find your API key at https://api.together.ai/settings/api-keys.","type":"invalid_request_error","param":null,"code":"invalid_api_key"}}';
  const MODELSCOPE_400_BODY = '{"errors":{"message":"Invalid model id: nonexistent-model-xyz-12345"},"request_id":"a12ad933-ae78-45db-8353-3a8eac418c5a"}';
  const MODELSCOPE_500_BODY = '{"errors":{"message":"apiInferModelDownload call failed: callApiInferModelDownload failed: [Model Exception] 模型不存在"},"request_id":"4c0b7caa-7f63-497c-972e-2f4e0e65a677"}';

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
      expect(msg400).toContain('a12ad933-ae78-45db-8353-3a8eac418c5a');
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

  describe('4. Mutation (e) test: Toast body is never folded behind <details>', () => {
    it('verifies App.tsx Toast JSX does not wrap toast text in <details> or 展开全文', () => {
      const appPath = resolve(__dirname, '../App.tsx');
      const appSource = readFileSync(appPath, 'utf8');
      expect(appSource).not.toContain('<details data-testid="toast-more"');
      expect(appSource).not.toContain('展开全文');
      expect(appSource).toContain('data-testid="toast-first-line"');
    });

    it('verifies NodeErrorDisclosure headline does not duplicate HTTP status', () => {
      const html = renderToStaticMarkup(
        <NodeErrorDisclosure
          errorMessage={`【civitai】HTTP 400 Bad Request: ${CIVITAI_400_BODY}`}
          provider="civitai"
          statusCode={400}
        />
      );
      // Ensure headline does not produce 【civitai】HTTP 400: 【civitai】HTTP 400 Bad Request:
      expect(html).not.toMatch(/【civitai】HTTP 400:\s*【civitai】/);
      expect(html).toContain('【civitai】HTTP 400 Bad Request:');
      expect(html).toContain('insufficientBuzz');
    });
  });
});
