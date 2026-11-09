// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BackendSettingsModal } from './BackendSettingsModal';
import { EMPTY_KEYS } from '../services/api';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('BackendSettingsModal refine model settings', () => {
  let host: HTMLDivElement;
  let root: Root;
  const onClose = vi.fn();
  const onSaveKeys = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/refine-prompt/capabilities')) {
        return new Response(JSON.stringify({ providers: [
          { provider: 'gemini', label: 'Google Gemini', catalog: 'live' },
          { provider: 'agnes', label: 'Agnes AI', catalog: 'manual' },
        ] }), { status: 200 });
      }
      if (String(url).includes('/api/models?')) {
        return new Response(JSON.stringify({ results: { gemini: [{ id: 'runtime-refine-model', name: 'Runtime Refine Model', category: 'reasoning' }] } }), { status: 200 });
      }
      return new Response('{}', { status: 200 });
    }));
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('shows the server-declared provider/model picker and persists the selection for the prompt surfaces', async () => {
    await act(async () => root.render(
      <BackendSettingsModal
        isOpen
        onClose={onClose}
        apiKeys={{ ...EMPTY_KEYS, geminiKey: 'configured-key' }}
        onSaveKeys={onSaveKeys}
      />
    ));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });

    const providers = host.querySelector<HTMLSelectElement>('select[aria-label="润色服务商"]');
    expect(Array.from(providers!.options).map((option) => option.value)).toEqual(['', 'gemini', 'agnes']);
    await act(async () => {
      providers!.value = 'agnes';
      providers!.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(host.querySelector('input[aria-label="润色模型"]')).not.toBeNull();
    expect(host.textContent).toContain('该服务商没有公开模型目录，请手动填写模型 ID');

    const manualModel = host.querySelector<HTMLInputElement>('input[aria-label="润色模型"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(manualModel, 'custom-runtime-model-id');
      manualModel.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(localStorage.getItem('comfycanvas_refine_provider')).toBe('agnes');
    expect(localStorage.getItem('comfycanvas_refine_model')).toBe('custom-runtime-model-id');
    expect(JSON.parse(localStorage.getItem('comfycanvas_api_keys') || '{}')).toMatchObject({
      refineProvider: 'agnes',
      refineModel: 'custom-runtime-model-id',
    });
  });
});
