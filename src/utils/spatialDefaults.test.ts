/**
 * @vitest-environment jsdom
 */
import React, { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import App from '../App';
import { BOARDS_KEY, ACTIVE_BOARD_KEY, MODE_KEY } from './workspaceCache';
import { NODE_DEFINITIONS } from '../constants/nodes';
import { spatialRequestParameters } from './frontendParameters';
import { EngineRegistry } from '../engines/EngineRegistry';
import type { SpatialFrame } from '../types/graph';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('M94: Spatial defaults and promptTransform auditability', () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    localStorage.clear();
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }))
    );
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    host?.remove();
    host = null;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    document.body.innerHTML = '';
  });

  it('新建取景框不再注入 fal / FLUX.1-schnell / 步数 / CFG 等硬编码默认值', async () => {
    localStorage.setItem(
      BOARDS_KEY,
      JSON.stringify([
        {
          id: 'board-spatial',
          name: '空间画布',
          nodes: [],
          connections: [],
          spatialFrames: [],
        },
      ])
    );
    localStorage.setItem(ACTIVE_BOARD_KEY, 'board-spatial');
    localStorage.setItem(MODE_KEY, 'spatial');

    await act(async () => {
      root!.render(React.createElement(App));
    });

    const addFrameBtn = document.querySelector('button[aria-label="新建取景框"]') as HTMLButtonElement;
    expect(addFrameBtn).toBeDefined();

    await act(async () => {
      addFrameBtn.click();
    });

    const rawBoards = localStorage.getItem(BOARDS_KEY);
    expect(rawBoards).toBeTruthy();
    const boards = JSON.parse(rawBoards!);
    const board = boards.find((b: any) => b.id === 'board-spatial');
    expect(board.spatialFrames.length).toBe(1);

    const frame: SpatialFrame = board.spatialFrames[0];
    // Prompt & Negative Prompt must be empty (no majestic dragon)
    expect(frame.prompt).toBe('');
    expect(frame.negativePrompt).toBe('');

    // Params must not contain hardcoded model, provider or generation sampling values
    expect(frame.params.checkpoint).toBe('');
    expect(frame.params.targetProvider).toBe('');
    expect(frame.params.steps).toBeUndefined();
    expect(frame.params.cfg).toBeUndefined();
    expect(frame.params.sampler).toBeUndefined();
    expect(frame.params.scheduler).toBeUndefined();
    expect(frame.params.denoise).toBeUndefined();
    expect(frame.params.width).toBeUndefined();
    expect(frame.params.height).toBeUndefined();
    expect(frame.params.seed).toBeUndefined();
    expect(frame.params.seedControl).toBeUndefined();
    expect(frame.params.batchSize).toBeUndefined();
    expect(frame.params.loras).toEqual([]);
  });

  it('NODE_DEFINITIONS["AIVideoNode"] 与新建 AIVideoNode 不再注入 hardcoded 英文 prompt、fps 24/30、steps 30、cfg 5.0/6.0', () => {
    const def = NODE_DEFINITIONS['AIVideoNode'];
    expect(def).toBeDefined();

    // Node definition defaultValues must not invent prompts or sampling parameters
    expect(def.defaultValues.prompt).toBe('');
    expect(def.defaultValues.negative_prompt).toBe('');
    expect(def.defaultValues.fps).toBe('');
    expect(def.defaultValues.duration).toBe('');
    expect(def.defaultValues.aspect_ratio).toBe('');
    expect(def.defaultValues.steps).toBeUndefined();
    expect(def.defaultValues.cfg).toBeUndefined();

    // Simulating node values populated when created from Model Hub
    const nodeValues: Record<string, any> = {
      ...(def ? def.defaultValues : {}),
      model: 'wan-video/wan2.1-t2v-14b',
      targetProvider: 'fal',
    };

    expect(nodeValues.model).toBe('wan-video/wan2.1-t2v-14b');
    expect(nodeValues.targetProvider).toBe('fal');
    expect(nodeValues.prompt).toBe('');
    expect(nodeValues.steps).toBeUndefined();
    expect(nodeValues.cfg).toBeUndefined();
    expect(nodeValues.fps).toBe('');
  });

  it('spatialRequestParameters 在采样参数留空时正常处理，不凭空捏造 25/4.5/euler/0.8', () => {
    const frame: SpatialFrame = {
      id: 'frame-test',
      title: '测试框',
      pos: { x: 0, y: 0 },
      width: 480,
      height: 480,
      prompt: 'a scenic view of mountains',
      negativePrompt: '',
      status: 'idle',
      createdAt: Date.now(),
      params: {
        checkpoint: 'flux-schnell',
        targetProvider: 'fal',
        loras: [],
      },
    };

    const norm = spatialRequestParameters(frame);
    expect(norm.model).toBe('flux-schnell');
    expect(norm.provider).toBe('fal');
    expect(norm.prompt).toBe('a scenic view of mountains');
    // Sampling parameters remain undefined, deferred to upstream or user
    expect(norm.steps).toBeUndefined();
    expect(norm.cfg).toBeUndefined();
    expect(norm.sampler_name).toBeUndefined();
    expect(norm.scheduler).toBeUndefined();
    expect(norm.denoise).toBeUndefined();
    expect(norm.width).toBeUndefined();
    expect(norm.height).toBeUndefined();
  });

  it('空间画布执行时，在 workflowSnapshot.requestMetadata.promptTransform 中如实记录 LoRA 拼接转换', async () => {
    let capturedNormParams: any = null;
    vi.spyOn(EngineRegistry, 'generate').mockImplementation(async (_provider, params) => {
      capturedNormParams = params;
      return {
        mediaUrl: 'https://example.com/output.png',
        provider: 'fal',
        providerId: 'fal',
        model: 'flux-dev',
        mediaType: 'image',
        seed: 12345,
      };
    });

    const initialFrame: SpatialFrame = {
      id: 'frame-audit-1',
      title: '空间审计框',
      pos: { x: 100, y: 100 },
      width: 480,
      height: 480,
      prompt: 'cyberpunk vehicle in rain',
      negativePrompt: '',
      status: 'idle',
      createdAt: Date.now(),
      params: {
        checkpoint: 'black-forest-labs/FLUX.1-dev',
        targetProvider: 'fal',
        loras: [
          {
            name: 'neon-style-lora',
            triggerWords: 'neon glow, synthwave',
          },
        ],
      },
    };

    localStorage.setItem(
      BOARDS_KEY,
      JSON.stringify([
        {
          id: 'board-spatial',
          name: '空间画布',
          nodes: [],
          connections: [],
          spatialFrames: [initialFrame],
        },
      ])
    );
    localStorage.setItem(ACTIVE_BOARD_KEY, 'board-spatial');
    localStorage.setItem(MODE_KEY, 'spatial');

    await act(async () => {
      root!.render(React.createElement(App));
    });

    // Find the queue / generate button for the frame
    const runBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('生成此选区画板')
    ) as HTMLButtonElement;

    expect(runBtn).toBeDefined();

    await act(async () => {
      runBtn.click();
    });

    expect(capturedNormParams).not.toBeNull();
    // The final prompt should have prepended trigger words
    expect(capturedNormParams.prompt).toBe('neon glow, synthwave, cyberpunk vehicle in rain');

    // workflowSnapshot.requestMetadata.promptTransform must record prependedTriggerWords, originalPrompt, and finalPrompt
    const meta = capturedNormParams.workflowSnapshot?.requestMetadata;
    expect(meta).toBeDefined();
    expect(meta.promptTransform).toEqual({
      prependedTriggerWords: 'neon glow, synthwave',
      originalPrompt: 'cyberpunk vehicle in rain',
      finalPrompt: 'neon glow, synthwave, cyberpunk vehicle in rain',
    });
  });

  it('当 prompt 已经包含 triggerWords 时，prependedTriggerWords 为空且不重复拼接', async () => {
    let capturedNormParams: any = null;
    vi.spyOn(EngineRegistry, 'generate').mockImplementation(async (_provider, params) => {
      capturedNormParams = params;
      return {
        mediaUrl: 'https://example.com/output.png',
        provider: 'fal',
        providerId: 'fal',
        model: 'flux-dev',
        mediaType: 'image',
        seed: 12345,
      };
    });

    const initialFrame: SpatialFrame = {
      id: 'frame-audit-2',
      title: '空间审计框2',
      pos: { x: 100, y: 100 },
      width: 480,
      height: 480,
      prompt: 'neon glow, synthwave, futuristic city street',
      negativePrompt: '',
      status: 'idle',
      createdAt: Date.now(),
      params: {
        checkpoint: 'black-forest-labs/FLUX.1-dev',
        targetProvider: 'fal',
        loras: [
          {
            name: 'neon-style-lora',
            triggerWords: 'neon glow, synthwave',
          },
        ],
      },
    };

    localStorage.setItem(
      BOARDS_KEY,
      JSON.stringify([
        {
          id: 'board-spatial',
          name: '空间画布',
          nodes: [],
          connections: [],
          spatialFrames: [initialFrame],
        },
      ])
    );
    localStorage.setItem(ACTIVE_BOARD_KEY, 'board-spatial');
    localStorage.setItem(MODE_KEY, 'spatial');

    await act(async () => {
      root!.render(React.createElement(App));
    });

    const runBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('生成此选区画板')
    ) as HTMLButtonElement;

    expect(runBtn).toBeDefined();

    await act(async () => {
      runBtn.click();
    });

    expect(capturedNormParams).not.toBeNull();
    expect(capturedNormParams.prompt).toBe('neon glow, synthwave, futuristic city street');

    const meta = capturedNormParams.workflowSnapshot?.requestMetadata;
    expect(meta).toBeDefined();
    expect(meta.promptTransform).toEqual({
      prependedTriggerWords: '',
      originalPrompt: 'neon glow, synthwave, futuristic city street',
      finalPrompt: 'neon glow, synthwave, futuristic city street',
    });
  });

  it('onSendToImg2Video 衍生新帧时不注入 width: 832, height: 480, denoise: 1.0', async () => {
    const frameWithImage: SpatialFrame = {
      id: 'frame-img-1',
      title: '已生成原图',
      pos: { x: 100, y: 100 },
      width: 480,
      height: 480,
      prompt: 'a tranquil lake at dusk',
      negativePrompt: '',
      status: 'success',
      imageUrl: 'https://example.com/lake.png',
      createdAt: Date.now(),
      params: {
        checkpoint: 'flux-dev',
        targetProvider: 'fal',
        loras: [],
      },
    };

    localStorage.setItem(
      BOARDS_KEY,
      JSON.stringify([
        {
          id: 'board-spatial',
          name: '空间画布',
          nodes: [],
          connections: [],
          spatialFrames: [frameWithImage],
        },
      ])
    );
    localStorage.setItem(ACTIVE_BOARD_KEY, 'board-spatial');
    localStorage.setItem(MODE_KEY, 'spatial');

    await act(async () => {
      root!.render(React.createElement(App));
    });

    const imgEl = document.querySelector('img[src="https://example.com/lake.png"]') as HTMLImageElement;
    expect(imgEl).toBeDefined();

    await act(async () => {
      imgEl.click();
    });

    const sendToVideoBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('以此图生成 AI 视频')
    ) as HTMLButtonElement;
    expect(sendToVideoBtn).toBeDefined();

    await act(async () => {
      sendToVideoBtn.click();
    });

    const rawBoards = localStorage.getItem(BOARDS_KEY);
    const boards = JSON.parse(rawBoards!);
    const board = boards.find((b: any) => b.id === 'board-spatial');
    expect(board.spatialFrames.length).toBe(2);

    const videoFrame: SpatialFrame = board.spatialFrames.find((f: any) => f.id.startsWith('frame-video-'));
    expect(videoFrame).toBeDefined();
    expect(videoFrame.mediaType).toBe('video');
    expect(videoFrame.referenceImageUrl).toBe('https://example.com/lake.png');
    expect(videoFrame.params.checkpoint).toBe('');
    expect(videoFrame.params.targetProvider).toBe('video');
    expect(videoFrame.params.videoProvider).toBeUndefined();
    expect(videoFrame.params.requireReferenceImage).toBe(true);

    // Ensure width: 832, height: 480, denoise: 1.0 are NOT injected
    expect(videoFrame.params.width).toBeUndefined();
    expect(videoFrame.params.height).toBeUndefined();
    expect(videoFrame.params.denoise).toBeUndefined();
  });

  it('onSendToImg2Img 衍生新图生图分支时，不凭空兜底 steps/cfg/sampler/denoise/1024', async () => {
    const frameWithImage: SpatialFrame = {
      id: 'frame-img-2',
      title: '已生成原图2',
      pos: { x: 100, y: 100 },
      width: 480,
      height: 480,
      prompt: 'cyberpunk street',
      negativePrompt: '',
      status: 'success',
      imageUrl: 'https://example.com/street.png',
      createdAt: Date.now(),
      params: {
        checkpoint: 'flux-dev',
        targetProvider: 'fal',
        loras: [],
      },
    };

    localStorage.setItem(
      BOARDS_KEY,
      JSON.stringify([
        {
          id: 'board-spatial',
          name: '空间画布',
          nodes: [],
          connections: [],
          spatialFrames: [frameWithImage],
        },
      ])
    );
    localStorage.setItem(ACTIVE_BOARD_KEY, 'board-spatial');
    localStorage.setItem(MODE_KEY, 'spatial');

    await act(async () => {
      root!.render(React.createElement(App));
    });

    const imgEl = document.querySelector('img[src="https://example.com/street.png"]') as HTMLImageElement;
    expect(imgEl).toBeDefined();

    await act(async () => {
      imgEl.click();
    });

    const sendToImg2ImgBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('发送到图生图')
    ) as HTMLButtonElement;
    expect(sendToImg2ImgBtn).toBeDefined();

    await act(async () => {
      sendToImg2ImgBtn.click();
    });

    const rawBoards = localStorage.getItem(BOARDS_KEY);
    const boards = JSON.parse(rawBoards!);
    const board = boards.find((b: any) => b.id === 'board-spatial');
    expect(board.spatialFrames.length).toBe(2);

    const derivedFrame: SpatialFrame = board.spatialFrames.find((f: any) => f.title.includes('图生图衍生分支'));
    expect(derivedFrame).toBeDefined();
    expect(derivedFrame.referenceImageUrl).toBe('https://example.com/street.png');
    // Sampling parameters must not be fabricated
    expect(derivedFrame.params.steps).toBeUndefined();
    expect(derivedFrame.params.cfg).toBeUndefined();
    expect(derivedFrame.params.sampler).toBeUndefined();
    expect(derivedFrame.params.scheduler).toBeUndefined();
    expect(derivedFrame.params.width).toBeUndefined();
    expect(derivedFrame.params.height).toBeUndefined();
  });
});
