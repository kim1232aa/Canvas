// @vitest-environment jsdom
import React, { act } from 'react';
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelHubModal, resolveModelHubInitialProvider, shouldLoadModelHubDirectory } from './ModelHubModal';
import { fetchLiveModels } from '../services/api';

vi.mock('../services/api', async () => {
  const actual = await vi.importActual<typeof import('../services/api')>('../services/api');
  return {
    ...actual,
    fetchLiveModels: vi.fn(),
    fetchHuggingFaceModelInfo: vi.fn(),
    fetchTensorArtModelInfo: vi.fn(),
    fetchReplicateModelInfo: vi.fn(),
  };
});

describe('ModelHubModal initial provider routing', () => {
  it('keeps the default Civitai directory when no provider was passed', () => {
    expect(resolveModelHubInitialProvider()).toBe('civitai');
  });

  it.each(['openai_compat', 'grok_compat', 'agnes'])('%s has no automatic directory target', (provider) => {
    expect(resolveModelHubInitialProvider(provider)).toBeNull();
  });

  it('does not redirect an unknown non-empty provider to Civitai', () => {
    expect(resolveModelHubInitialProvider('future_custom_provider')).toBeNull();
  });

  it('keeps an explicitly supported provider as the initial directory', () => {
    expect(resolveModelHubInitialProvider('replicate')).toBe('replicate');
  });

  it('blocks automatic reloads until a concrete provider tab is selected', () => {
    expect(shouldLoadModelHubDirectory('openai_compat')).toBe(false);
    expect(shouldLoadModelHubDirectory('openai_compat', true)).toBe(true);
    expect(shouldLoadModelHubDirectory(null)).toBe(true);
  });
});

describe('ModelHubModal provider routing and error transparency component behavior', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    container?.remove();
  });

  const renderModal = async (props: Partial<React.ComponentProps<typeof ModelHubModal>> = {}) => {
    await act(async () => {
      root.render(
        React.createElement(ModelHubModal, {
          isOpen: true,
          onClose: vi.fn(),
          onSelectModel: vi.fn(),
          initialCategory: 'all',
          initialProvider: 'openai_compat',
          ...props,
        })
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
  };

  it('does not secretly query any provider directory when opened with an unsupported provider, displaying transparent notice', async () => {
    await renderModal({ initialProvider: 'openai_compat' });

    // Must NOT secretly query any provider
    expect(fetchLiveModels).not.toHaveBeenCalled();

    // Must show the transparent notice to user
    expect(container.textContent).toContain('当前模型中心没有 OpenAI 兼容中转 的对应目录，未请求其他提供商目录。可手动选择上方页签查看其他目录。');
  });

  it('queries the aggregated directory when the user explicitly clicks the "全部服务商" tab', async () => {
    vi.mocked(fetchLiveModels).mockResolvedValue({
      civitai: [{ id: 'agg-model-1', name: 'Aggregated Civitai Model', baseModel: 'SDXL 1.0' }],
      _pagination: {},
    } as never);

    await renderModal({ initialProvider: 'openai_compat' });
    expect(fetchLiveModels).not.toHaveBeenCalled();

    // User explicitly clicks "全部服务商"
    const allTabButton = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent?.includes('全部服务商'));
    expect(allTabButton).toBeDefined();

    await act(async () => {
      allTabButton?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Explicit user action queries 'all'
    expect(fetchLiveModels).toHaveBeenCalled();
    expect(vi.mocked(fetchLiveModels).mock.calls[0][0]).toBe('all');

    // Unsupported notice should be cleared
    expect(container.textContent).not.toContain('当前模型中心没有 OpenAI 兼容中转 的对应目录');
    // Aggregated model should be rendered in UI
    expect(container.textContent).toContain('Aggregated Civitai Model');
  });

  it('queries specific provider on explicit tab click and displays upstream errors faithfully without silent fallback', async () => {
    vi.mocked(fetchLiveModels).mockResolvedValue({
      errors: { replicate: 'Replicate API 401 认证失败：缺少 API Key' },
      _pagination: {},
    } as never);

    await renderModal({ initialProvider: 'openai_compat' });
    expect(fetchLiveModels).not.toHaveBeenCalled();

    // User explicitly selects "Replicate"
    const replicateTabButton = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent === 'Replicate');
    expect(replicateTabButton).toBeDefined();

    await act(async () => {
      replicateTabButton?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    // Requested replicate provider explicitly
    expect(fetchLiveModels).toHaveBeenCalled();
    expect(vi.mocked(fetchLiveModels).mock.calls[0][0]).toBe('replicate');

    // Transparently alerts user with exact error message, no fake green or silent fallback
    expect(container.textContent).toContain('API 请求异常 (Transparency Alert)');
    expect(container.textContent).toContain('Replicate API 401 认证失败：缺少 API Key');
  });

  it('queries specific provider on explicit tab click and renders models when provider request succeeds', async () => {
    vi.mocked(fetchLiveModels).mockResolvedValue({
      replicate: [{ id: 'rep-model-1', name: 'Replicate FLUX Dev', baseModel: 'FLUX.1 [dev]' }],
      _pagination: {},
    } as never);

    await renderModal({ initialProvider: 'openai_compat' });
    expect(fetchLiveModels).not.toHaveBeenCalled();

    const replicateTabButton = Array.from(container.querySelectorAll('button')).find((btn) => btn.textContent === 'Replicate');
    expect(replicateTabButton).toBeDefined();

    await act(async () => {
      replicateTabButton?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchLiveModels).toHaveBeenCalled();
    expect(vi.mocked(fetchLiveModels).mock.calls[0][0]).toBe('replicate');
    expect(container.textContent).toContain('Replicate FLUX Dev');
  });
});
