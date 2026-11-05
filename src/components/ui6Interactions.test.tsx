// @vitest-environment jsdom
import React, { act } from 'react';
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { summarizeErrorMessage, NodeErrorDisclosure } from './NodeErrorDisclosure';
import * as keyStatusModule from '../services/providerKeyStatus';
import { HistoryModal } from './HistoryModal';
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
import { formatExecutionStatusText } from '../App';

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
      <CloudProjectModal isOpen={true} onClose={noop} currentProjectId="1" onLoadProject={noop} onSaveCurrentToCloud={async () => {}} />
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
  it('surfaces fetchProviderKeyStatus failure via alert banner and marks rows as 检测失败', async () => {
    vi.spyOn(keyStatusModule, 'fetchProviderKeyStatus').mockRejectedValueOnce(
      new Error('Network connection timeout')
    );
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <BackendSettingsModal
          isOpen={true}
          onClose={() => {}}
          apiKeys={{} as any}
          onSaveKeys={() => {}}
        />
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    expect(container.querySelector('[data-testid="key-status-error"]')?.textContent).toContain(
      '获取服务端密钥配置状态失败：Network connection timeout'
    );
    expect(container.textContent).toContain('检测失败');

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('renders verified key-page links (MuAPI dashboard) and omits unverified homepages', () => {
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

  it('Escape key triggers onClose on HistoryModal and BackendSettingsModal', () => {
    const onHistoryClose = vi.fn();
    const onSettingsClose = vi.fn();
    const c1 = document.createElement('div');
    const c2 = document.createElement('div');
    document.body.appendChild(c1);
    document.body.appendChild(c2);
    const r1 = createRoot(c1);
    const r2 = createRoot(c2);

    act(() => {
      r1.render(<HistoryModal isOpen={true} onClose={onHistoryClose} history={[]} onApplyPrompt={() => {}} onDeleteItem={() => {}} onClearAll={() => {}} />);
      r2.render(<BackendSettingsModal isOpen={true} onClose={onSettingsClose} apiKeys={{} as any} onSaveKeys={() => {}} />);
    });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onHistoryClose).toHaveBeenCalled();
    expect(onSettingsClose).toHaveBeenCalled();

    act(() => {
      r1.unmount();
      r2.unmount();
    });
    c1.remove();
    c2.remove();
  });

  it('formatExecutionStatusText rewrites engineer progress strings to human-friendly copy', () => {
    // Stage 4 initial submit (< 2s)
    expect(
      formatExecutionStatusText('[4/5] 正在向 WAVESPEED 官方算力提交任务并等待渲染回传...', 1)
    ).toBe('正在提交请求至云端服务商...');

    // Stage 4 ongoing request (>= 2s)
    expect(
      formatExecutionStatusText('[4/5] WAVESPEED 请求进行中 (已耗时 2s，等待上游确认状态)...', 2)
    ).toBe('等待上游返回结果 (已耗时 2秒)...');

    // Stage 4 ongoing request at 5s
    expect(
      formatExecutionStatusText('[4/5] NOVITA 请求进行中 (已耗时 5s，等待上游确认状态)...', 5)
    ).toBe('等待上游返回结果 (已耗时 5秒)...');

    // Non-progress messages left unchanged
    expect(formatExecutionStatusText('准备环境...', 0)).toBe('准备环境...');
  });
});
