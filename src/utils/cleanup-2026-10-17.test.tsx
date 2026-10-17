import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { preRunPrecheck } from './graphEngine';
import { unusedLineText } from '../components/HistoryModal';

describe('cleanup-2026-10-17', () => {
  const node = readFileSync('src/components/NodeItem.tsx', 'utf8');
  it('#1 no 未发送 sticky / send badges on canvas nodes', () => {
    expect(node).not.toContain('未发送：${notSent');
    expect(node).not.toContain('<SchemaSendBadge');
  });
  it('#2 no free-text JSON on nodes / inspector; AI video box not in add menu', () => {
    expect(node).not.toContain('视频自定义参数 JSON');
    expect(node).not.toContain('<ApiParameterEditor');
    expect(readFileSync('src/components/ParameterInspector.tsx', 'utf8')).not.toContain('视频自定义参数 JSON');
    expect(readFileSync('src/components/ApiParameterEditor.tsx', 'utf8')).toContain('textarea readOnly');
    expect(readFileSync('src/components/Canvas.tsx', 'utf8')).toContain("def.type !== 'AIVideoNode'");
  });
  it('#3 no auto base-model swap button', () => expect(node).not.toContain('一键自动配对前置底模'));
  it('#3 precheck: broken edge and Schema-required image', () => {
    const nodes: any[] = [{ id: 'v', type: 'AIVideoNode', title: 'V', values: { targetProvider: 'fal', model: 'm' } }];
    expect(preRunPrecheck(nodes, [{ id: 'c', fromNodeId: 'gone', fromSocketId: 'o', toNodeId: 'v', toSocketId: 'positive' } as any], 'v', () => [])).toContain('连线断开');
    expect(preRunPrecheck(nodes, [], 'v', () => ['prompt', 'image_url'])).toBe('图生视频要先连一张参考图');
    expect(preRunPrecheck(nodes, [], 'v', () => ['prompt'])).toBeNull();
    expect(preRunPrecheck(nodes, [], 'v', () => undefined)).toBeNull();
  });
  it('#4 one 这次没用上 line, only user-filled values', () => {
    expect(unusedLineText([{ key: 'sampler', label: '采样器', value: 'euler' }, { key: 'cfg', label: 'CFG' }])).toBe('这次没用上：采样器 euler（该端点不支持，未发送）');
    expect(unusedLineText([{ key: 'cfg', label: 'CFG' }])).toBe('');
  });
});

import { modelRequiresInputImageFromMetadata } from './i2vMetadata';
import { preRunPrecheck as pre2 } from './graphEngine';
import { readFileSync as rf } from 'node:fs';

describe('cleanup-2026-10-17 key + I2V + sampler disable', () => {
  it('A server exposes /api/provider-key-status driven by POOL_KEY_FIELDS', () => {
    const src = rf('server.ts', 'utf8');
    expect(src).toContain("app.get('/api/provider-key-status'");
    expect(src).toContain('Object.keys(POOL_KEY_FIELDS)');
    expect(src).toMatch(/configured:\s*Boolean\(keyPoolManager\.getNextKey/);
    expect(src).not.toMatch(/providers\[prov\]\s*=\s*\{[^}]*key:/);
  });
  it('A App blocks Run when key missing', () => {
    const src = rf('src/App.tsx', 'utf8');
    expect(src).toContain('fetchProviderKeyStatus');
    expect(src).toContain('未配置 ${label} 的密钥');
  });
  it('B I2V metadata from catalog labels, not invented lists', () => {
    expect(modelRequiresInputImageFromMetadata('fal-ai/kling-video/v3/standard/image-to-video')).toBe(true);
    expect(modelRequiresInputImageFromMetadata('fal-ai/kling-video/v3/standard/text-to-video')).toBe(false);
    expect(modelRequiresInputImageFromMetadata('totally-unknown-model-xyz')).toBeNull();
  });
  it('B precheck fires on I2V metadata when Schema not loaded', () => {
    const nodes: any[] = [{ id: 'v', type: 'AIVideoNode', title: 'V', values: { targetProvider: 'fal', model: 'fal-ai/kling-video/v3/standard/image-to-video' } }];
    expect(pre2(nodes, [], 'v', () => undefined)).toBe('图生视频要先连一张参考图');
    expect(pre2(nodes, [], 'v', () => [])).toBeNull(); // Schema loaded, no image in required
    expect(pre2(nodes, [], 'v', () => ['prompt'])).toBeNull();
    expect(pre2(nodes, [], 'v', () => ['image_url'])).toBe('图生视频要先连一张参考图');
  });
  it('C KSampler hides schema-omitted widgets; only filled-not-sent gets a one-line note', () => {
    const src = rf('src/components/NodeItem.tsx', 'utf8');
    expect(src).not.toContain('data-testid="node-sampler-unused"');
    expect(src).toContain('SAMPLER_SCHEMA_WIDGETS');
    expect(src).toContain('node-filled-not-sent');
    expect(src).toContain('已填，此模型不支持，不会发送');
  });
});


describe('cleanup-serious toast / SaveImage / strength', () => {
  it('toast actions: key → 去 API 设置; I2V → 去连参考图; never 查看历史 on those', () => {
    const src = rf('src/App.tsx', 'utf8');
    expect(src).toContain("action: 'api-settings'");
    expect(src).toContain("action: pre === '图生视频要先连一张参考图' ? 'connect-ref'");
    expect(src).toContain('去 API 设置');
    expect(src).toContain('去连参考图');
    expect(src).toContain("act === 'api-settings'");
    expect(src).toContain("act === 'connect-ref'");
    // missing-key toast must carry provider id so settings opens on that tab (not default Fal)
    expect(src).toContain('actionProviderId: prov');
    expect(src).toContain('setSettingsInitialProvider');
    expect(src).toContain('initialProvider={settingsInitialProvider}');
  });
  it('API settings modal selects initialProvider from missing-key toast', () => {
    const src = rf('src/components/BackendSettingsModal.tsx', 'utf8');
    expect(src).toContain('initialProvider?: string');
    expect(src).toContain('setActiveProviderTab(id as ProviderId)');
    expect(src).toContain('data-provider-tab={p.id}');
    expect(src).toContain('[data-provider-tab="${id}"]');
  });
  it('SaveImage clears prior preview on model switch / blocked run; prefix retitled only on new image', () => {
    const app = rf('src/App.tsx', 'utf8');
    expect(app).toContain('clearPriorMediaPreview');
    expect(app).toContain('clearPriorMediaPreviews');
    expect(app).not.toContain('stalePriorOutput: true');
    // prefix retitle only when a NEW image lands
    expect(app).toContain("output !== undefined && n.type === 'SaveImage'");
    expect(app).toContain('filename_prefix: prefix');
  });
  it('KSampler schema-omitted steps/CFG/seed/denoise are hidden (no empty adjustable shells)', () => {
    const src = rf('src/components/NodeItem.tsx', 'utf8');
    expect(src).toContain("SAMPLER_SCHEMA_WIDGETS.has(widget.name) && (schemaUnused || unsupported)");
    expect(src).toContain('filledCanvasValue');
    expect(src).not.toContain('data-testid="node-sampler-unused"');
  });
  it('denoise/strength disabled without reference image when Schema declares it', () => {
    const src = rf('src/components/NodeItem.tsx', 'utf8');
    expect(src).toContain('strengthNeedsImage');
    expect(src).toContain("widget.name === 'denoise' || widget.name === 'strength'");
  });
  it('Run button has no title tooltip covering label', () => {
    const src = rf('src/components/TopBar.tsx', 'utf8');
    expect(src).toContain('data-testid="run-button"');
    expect(src).not.toMatch(/data-testid="run-button"[^>]*title=/);
    expect(src).not.toMatch(/data-testid="run-button-label"[^>]*title=/);
  });
});
