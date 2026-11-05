import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { summarizeErrorMessage, NodeErrorDisclosure } from './NodeErrorDisclosure';
import {
  formatNodeDisplayTitle,
  formatWidgetLabel,
  formatSocketDisplayName,
  formatSchemaFieldLabel,
  NODE_TITLE_MAP,
  WIDGET_LABEL_MAP,
} from '../utils/nodeUiLabels';
import { SchemaChoiceControls, schemaChoiceFields } from './SchemaChoiceControls';
import { BackendSettingsModal } from './BackendSettingsModal';
import { ComfyGuideModal } from './ComfyGuideModal';
import { CloudProjectModal } from './CloudProjectModal';
import { CanvasManagerModal } from './CanvasManagerModal';
import { AssetManagerModal } from './AssetManagerModal';

describe('NodeErrorDisclosure & summarizeErrorMessage (Project Transparency Rules)', () => {
  it('formats headline strictly as provider + HTTP status (if parsed) + verbatim first line with no guessed diagnosis', () => {
    // WaveSpeed 400 credit refusal: must NOT replace with invented text like "所选模型已下线"
    const wavespeed = summarizeErrorMessage(
      'HTTP 400: {"code":400,"message":"Insufficient credits. Please top up your account to continue."}',
      'WaveSpeed'
    );
    expect(wavespeed.headline).toBe(
      '【WaveSpeed】HTTP 400: {"code":400,"message":"Insufficient credits. Please top up your account to continue."}'
    );
    expect(wavespeed.statusCode).toBe(400);

    // HF 402 billing refusal
    const hf = summarizeErrorMessage(
      'HTTP 402: {"error":"Purchase pre-paid credits to continue using Inference Providers."}\nSecond line',
      'huggingface'
    );
    expect(hf.headline).toBe(
      '【huggingface】HTTP 402: {"error":"Purchase pre-paid credits to continue using Inference Providers."}'
    );

    // Novita 403 balance refusal
    const novita = summarizeErrorMessage(
      'HTTP 403: {"code":403, "reason":"NOT_ENOUGH_BALANCE", "message":"insufficient balance"}',
      'Novita'
    );
    expect(novita.headline).toBe(
      '【Novita】HTTP 403: {"code":403, "reason":"NOT_ENOUGH_BALANCE", "message":"insufficient balance"}'
    );

    // Error without parsed status code
    const raw = summarizeErrorMessage('Network connection lost unexpectedly', 'Fal.ai');
    expect(raw.headline).toBe('【Fal.ai】Network connection lost unexpectedly');
  });

  it('renders endpoint and statusCode in disclosure when provided, and renders NO empty rows when missing', () => {
    // When endpoint and statusCode are provided
    const withDetails = renderToStaticMarkup(
      <NodeErrorDisclosure
        errorMessage={'HTTP 400: Bad Request'}
        provider="WaveSpeed"
        endpoint="/api/wavespeed/generate"
        statusCode={400}
        errorAt="2026-11-05T10:00:00.000Z"
      />
    );
    expect(withDetails).toContain('data-testid="node-error-strip"');
    expect(withDetails).toContain('data-testid="node-error-headline"');

    // When endpoint and statusCode are missing: verify no empty row labels are leaked
    const minimal = renderToStaticMarkup(
      <NodeErrorDisclosure errorMessage="Something went wrong" />
    );
    expect(minimal).not.toContain('请求端点:');
    expect(minimal).not.toContain('HTTP 状态码:');
  });

  it('shows 去配置密钥 button when key is missing and onOpenSettings is wired', () => {
    const onOpenSettings = vi.fn();
    const html = renderToStaticMarkup(
      <NodeErrorDisclosure
        errorMessage="HTTP 401: Unauthorized. Please configure your API key."
        provider="Together"
        onOpenSettings={onOpenSettings}
      />
    );
    expect(html).toContain('去配置密钥');
  });
});

describe('nodeUiLabels render-time mappings', () => {
  it('maps node titles to readable Chinese titles with original context', () => {
    expect(formatNodeDisplayTitle('EmptyLatentImage', 'EmptyLatentImage')).toBe('画布尺寸设定 (Latent)');
    expect(formatNodeDisplayTitle('CLIPTextEncode', 'CLIPTextEncode')).toBe('正向提示词 (CLIP)');
    expect(formatNodeDisplayTitle('VAEDecode', 'VAEDecode')).toBe('图像解码器 (VAE Decode)');
    expect(formatNodeDisplayTitle('SaveImage', 'SaveImage')).toBe('保存与预览图像 (Save Image)');
  });

  it('maps widget names to plain Chinese captions', () => {
    expect(formatWidgetLabel('width', 'width')).toBe('图像宽度');
    expect(formatWidgetLabel('height', 'height')).toBe('图像高度');
    expect(formatWidgetLabel('batch_size', 'batch_size')).toBe('生成张数');
    expect(formatWidgetLabel('seed', 'seed')).toBe('随机种子');
    expect(formatWidgetLabel('steps', 'steps')).toBe('步数');
    expect(formatWidgetLabel('sampler_name', 'sampler_name')).toBe('采样器');
    expect(formatWidgetLabel('scheduler', 'scheduler')).toBe('调度器');
    expect(formatWidgetLabel('denoise', 'denoise')).toBe('去噪强度');
  });

  it('maps socket port names to Chinese paired labels', () => {
    expect(formatSocketDisplayName('MODEL', 'MODEL')).toBe('模型 (MODEL)');
    expect(formatSocketDisplayName('CLIP', 'CLIP')).toBe('文本编码 (CLIP)');
    expect(formatSocketDisplayName('VAE', 'VAE')).toBe('解码 (VAE)');
    expect(formatSocketDisplayName('LATENT', 'LATENT')).toBe('画幅潜空间 (LATENT)');
  });
});

describe('SchemaChoiceControls slider and single-value required enum (rev-m4 fix)', () => {
  it('does NOT write unsent defaults or minimums when slider is untouched; displays 未填写，不发送', () => {
    const onChange = vi.fn();
    const html = renderToStaticMarkup(
      <SchemaChoiceControls
        inputSchema={{
          properties: {
            lora_strength: { type: 'integer', minimum: 0, maximum: 100, default: 50 },
          },
        }}
        value="{}"
        onChange={onChange}
      />
    );
    // Untouched slider must not call onChange
    expect(onChange).not.toHaveBeenCalled();
    // Must display placeholder 未填写，不发送
    expect(html).toContain('placeholder="未填写，不发送"');
  });

  it('uses schema multipleOf for slider and numeric step when declared', () => {
    const fields = schemaChoiceFields({
      properties: {
        denoise_factor: { type: 'number', minimum: 0, maximum: 1, multipleOf: 0.05 },
      },
    });
    expect(fields[0].numberSpec?.multipleOf).toBe(0.05);

    const html = renderToStaticMarkup(
      <SchemaChoiceControls
        inputSchema={{
          properties: {
            denoise_factor: { type: 'number', minimum: 0, maximum: 1, multipleOf: 0.05 },
          },
        }}
        value="{}"
        onChange={() => {}}
      />
    );
    expect(html).toContain('step="0.05"');
  });

  it('includes required single-value enum fields as explicit controls (Krea resolution bugfix)', () => {
    // Krea OpenAPI shape: required resolution with enum: ["1K"]
    const schema = {
      type: 'object',
      required: ['prompt', 'aspect_ratio', 'resolution'],
      properties: {
        prompt: { type: 'string' },
        aspect_ratio: { type: 'string', enum: ['1:1', '16:9'] },
        resolution: { type: 'string', enum: ['1K'] },
      },
    };
    const fields = schemaChoiceFields(schema);
    const keys = fields.map((f) => f.key);
    // resolution has enum length 1, but is in required -> MUST be included
    expect(keys).toContain('resolution');
    expect(fields.find((f) => f.key === 'resolution')?.enumValues).toEqual(['1K']);

    // Non-required single-value enum must still be omitted
    const nonRequiredSchema = {
      type: 'object',
      properties: {
        fixed_flavor: { type: 'string', enum: ['vanilla'] },
      },
    };
    expect(schemaChoiceFields(nonRequiredSchema)).toHaveLength(0);
  });
});

describe('Modal Dialog Accessibility & Escape handlers', () => {
  it('all modal dialogs have role="dialog", aria-modal="true", and matching heading ids', () => {
    const noop = () => {};

    const guide = renderToStaticMarkup(<ComfyGuideModal isOpen={true} onClose={noop} />);
    expect(guide).toMatch(/role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="comfy-guide-title"/);
    expect(guide).toContain('id="comfy-guide-title"');

    const canvasMgr = renderToStaticMarkup(
      <CanvasManagerModal
        isOpen={true}
        onClose={noop}
        currentProjectId="p1"
        canvases={[]}
        onSelectCanvas={noop}
        onCreateNewCanvas={noop}
        onCloneCanvas={noop}
        onDeleteCanvas={noop}
        onRenameCanvas={noop}
        onSaveCurrentAsNew={noop}
      />
    );
    expect(canvasMgr).toMatch(/role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="canvas-manager-title"/);
    expect(canvasMgr).toContain('id="canvas-manager-title"');

    const cloud = renderToStaticMarkup(
      <CloudProjectModal isOpen={true} onClose={noop} currentProject={{ id: '1', name: 'Test' } as any} onLoadProject={noop} />
    );
    expect(cloud).toMatch(/role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="cloud-project-title"/);
    expect(cloud).toContain('id="cloud-project-title"');

    const asset = renderToStaticMarkup(
      <AssetManagerModal
        isOpen={true}
        onClose={noop}
        history={[]}
        onAddToCanvasAsFrame={noop}
        onUseAsReference={noop}
        onPreviewImage={noop}
        onDeleteAsset={noop}
      />
    );
    expect(asset).toMatch(/role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="asset-manager-title"/);
    expect(asset).toContain('id="asset-manager-title"');
  });
});

describe('BackendSettingsModal key-page links & key status failure reporting', () => {
  it('surfaces fetchProviderKeyStatus failure via alert banner and avoids leaving rows silently at 未配置', () => {
    const noop = () => {};
    const html = renderToStaticMarkup(
      <BackendSettingsModal
        isOpen={true}
        onClose={noop}
        apiKeys={{} as any}
        onSaveKeys={noop}
        initialProvider="muapi"
      />
    );
    expect(html).toContain('id="api-settings-title"');
    // MuAPI verified dashboard link
    expect(html).toContain('https://muapi.ai/dashboard');
    // Unverified homepages must NOT have the keyPageUrl button
    expect(html).not.toMatch(/href="https:\/\/www\.mage\.space"[^>]*申请 \/ 获取 API Key 直达/);
    expect(html).not.toMatch(/href="https:\/\/modelslab\.com"[^>]*申请 \/ 获取 API Key 直达/);
  });
});
