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

const MOCK_VIDEO_CATALOG = {
  civitai: [
    {
      id: 'fal-ai/wan/v2.2-a14b/text-to-video/lora',
      name: 'Wan 2.2 A14B Text-to-Video LoRA',
      category: 'Video',
      type: 'Video',
      provider: 'civitai',
    },
  ],
  fal: [
    {
      id: 'fal-ai/wan/v2.2-a14b/text-to-video/lora',
      name: 'Wan 2.2 A14B Text-to-Video LoRA',
      category: 'Video',
      type: 'Video',
      provider: 'fal',
    },
  ],
};

describe('M94: Spatial defaults and promptTransform auditability', () => {
  let host: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    localStorage.clear();
    if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (typeof url === 'string' && url.includes('/api/models')) {
          return new Response(JSON.stringify(MOCK_VIDEO_CATALOG), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }
        return new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } });
      })
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

  it('P2-1 行为测试：新建空取景框点击生成时不调用 EngineRegistry，显示缺 provider 提示', async () => {
    const generateSpy = vi.spyOn(EngineRegistry, 'generate');

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

    // 1. 新建空取景框 (targetProvider: '', checkpoint: '')
    const addFrameBtn = document.querySelector('button[aria-label="新建取景框"]') as HTMLButtonElement;
    await act(async () => {
      addFrameBtn.click();
    });

    // 2. 点击生成按钮
    const runBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('生成此选区画板')
    ) as HTMLButtonElement;
    expect(runBtn).toBeDefined();

    await act(async () => {
      runBtn.click();
    });

    // 3. 必须被 generationReadiness 拦截，不得调用底层引擎
    expect(generateSpy).toHaveBeenCalledTimes(0);

    // 4. UI 提示必须包含缺服务商警告
    expect(document.body.textContent).toContain('请选择执行服务商');
    expect(document.body.textContent).toContain('无法生成');
  });

  it('P2-3 入口1：通过模型中心「应用为视频模型」创建 AIVideoNode，不注入 prompt/fps/steps/cfg', async () => {
    localStorage.setItem(
      BOARDS_KEY,
      JSON.stringify([
        {
          id: 'board-graph',
          name: '图节点画布',
          nodes: [],
          connections: [],
          spatialFrames: [],
        },
      ])
    );
    localStorage.setItem(ACTIVE_BOARD_KEY, 'board-graph');
    localStorage.setItem(MODE_KEY, 'graph');

    await act(async () => {
      root!.render(React.createElement(App));
    });

    // 1. 打开视频模型中心
    const videoHubBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === '视频模型'
    ) as HTMLButtonElement;
    expect(videoHubBtn).toBeDefined();

    await act(async () => {
      videoHubBtn.click();
    });

    await act(async () => {
      // flush microtasks so the resolved catalog fetch re-renders the modal
    });

    // 2. 点击「应用为视频模型」按钮 (调用 App.tsx:handleSelectModelFromHub 入口)
    const applyBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('应用为视频模型')
    ) as HTMLButtonElement;
    expect(applyBtn).toBeDefined();

    await act(async () => {
      applyBtn.click();
    });

    // 3. 断言生产路径创建的 AIVideoNode 节点属性
    const rawBoards = localStorage.getItem(BOARDS_KEY);
    const boards = JSON.parse(rawBoards!);
    const board = boards.find((b: any) => b.id === 'board-graph');
    const videoNode = board.nodes.find((n: any) => n.type === 'AIVideoNode');
    expect(videoNode).toBeDefined();

    expect(videoNode.values.model).toBe('fal-ai/wan/v2.2-a14b/text-to-video/lora');
    expect(videoNode.values.targetProvider).toBe('civitai');
    expect(videoNode.values.prompt).toBe('');
    expect(videoNode.values.negative_prompt).toBe('');
    expect(videoNode.values.fps).toBe('');
    expect(videoNode.values.duration).toBe('');
    expect(videoNode.values.aspect_ratio).toBe('');
    expect(videoNode.values.steps).toBeUndefined();
    expect(videoNode.values.cfg).toBeUndefined();
  });

  it('P2-3 入口2：通过模型中心「添加视频节点」创建 AIVideoNode，不注入 prompt/fps/steps/cfg', async () => {
    localStorage.setItem(
      BOARDS_KEY,
      JSON.stringify([
        {
          id: 'board-graph',
          name: '图节点画布',
          nodes: [],
          connections: [],
          spatialFrames: [],
        },
      ])
    );
    localStorage.setItem(ACTIVE_BOARD_KEY, 'board-graph');
    localStorage.setItem(MODE_KEY, 'graph');

    await act(async () => {
      root!.render(React.createElement(App));
    });

    // 1. 打开视频模型中心
    const videoHubBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.trim() === '视频模型'
    ) as HTMLButtonElement;
    expect(videoHubBtn).toBeDefined();

    await act(async () => {
      videoHubBtn.click();
    });

    await act(async () => {
      // flush microtasks so the resolved catalog fetch re-renders the modal
    });

    // 2. 点击「添加视频节点」按钮 (调用 App.tsx:onAddModelNode 入口)
    const addNodeBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('添加视频节点')
    ) as HTMLButtonElement;
    expect(addNodeBtn).toBeDefined();

    await act(async () => {
      addNodeBtn.click();
    });

    // 3. 断言生产路径创建的 AIVideoNode 节点属性
    const rawBoards = localStorage.getItem(BOARDS_KEY);
    const boards = JSON.parse(rawBoards!);
    const board = boards.find((b: any) => b.id === 'board-graph');
    const videoNode = board.nodes.find((n: any) => n.type === 'AIVideoNode');
    expect(videoNode).toBeDefined();

    expect(videoNode.values.model).toBe('fal-ai/wan/v2.2-a14b/text-to-video/lora');
    expect(videoNode.values.targetProvider).toBe('civitai');
    expect(videoNode.values.prompt).toBe('');
    expect(videoNode.values.negative_prompt).toBe('');
    expect(videoNode.values.fps).toBe('');
    expect(videoNode.values.duration).toBe('');
    expect(videoNode.values.aspect_ratio).toBe('');
    expect(videoNode.values.steps).toBeUndefined();
    expect(videoNode.values.cfg).toBeUndefined();
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

    const runBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('生成此选区画板')
    ) as HTMLButtonElement;

    expect(runBtn).toBeDefined();

    await act(async () => {
      runBtn.click();
    });

    expect(capturedNormParams).not.toBeNull();
    expect(capturedNormParams.prompt).toBe('neon glow, synthwave, cyberpunk vehicle in rain');

    const meta = capturedNormParams.workflowSnapshot?.requestMetadata;
    expect(meta).toBeDefined();
    expect(meta.promptTransform).toEqual({
      prependedTriggerWords: 'neon glow, synthwave',
      originalPrompt: 'cyberpunk vehicle in rain',
      finalPrompt: 'neon glow, synthwave, cyberpunk vehicle in rain',
    });
  });

  it('P2-2 测试 A：全部触发词已存在但非连续/顺序不同时，不重复拼接且 prependedTriggerWords 为空', async () => {
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

    // 触发词为 "neon glow, synthwave"，但 prompt 中顺序颠倒且不连续
    const initialFrame: SpatialFrame = {
      id: 'frame-audit-2',
      title: '空间审计框2',
      pos: { x: 100, y: 100 },
      width: 480,
      height: 480,
      prompt: 'synthwave street with neon glow',
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
    // 触发词均已存在，不许产生重复前置
    expect(capturedNormParams.prompt).toBe('synthwave street with neon glow');

    const meta = capturedNormParams.workflowSnapshot?.requestMetadata;
    expect(meta).toBeDefined();
    expect(meta.promptTransform).toEqual({
      prependedTriggerWords: '',
      originalPrompt: 'synthwave street with neon glow',
      finalPrompt: 'synthwave street with neon glow',
    });
  });

  it('P2-2 测试 B：只缺部分触发词时，只前置真正缺失的词并准确记录 promptTransform', async () => {
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

    // 触发词为 "neon glow, synthwave"，prompt 已有 "synthwave"，仅缺少 "neon glow"
    const initialFrame: SpatialFrame = {
      id: 'frame-audit-3',
      title: '空间审计框3',
      pos: { x: 100, y: 100 },
      width: 480,
      height: 480,
      prompt: 'synthwave street view',
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
    // 仅前置缺失的 "neon glow"
    expect(capturedNormParams.prompt).toBe('neon glow, synthwave street view');

    const meta = capturedNormParams.workflowSnapshot?.requestMetadata;
    expect(meta).toBeDefined();
    expect(meta.promptTransform).toEqual({
      prependedTriggerWords: 'neon glow',
      originalPrompt: 'synthwave street view',
      finalPrompt: 'neon glow, synthwave street view',
    });
  });

  it('onSendToImg2Video 衍生新帧时不注入 width: 832, height: 480, denoise: 1.0, seedControl', async () => {
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

    // 断言被删字段不出现
    expect(videoFrame.params.width).toBeUndefined();
    expect(videoFrame.params.height).toBeUndefined();
    expect(videoFrame.params.denoise).toBeUndefined();
    expect(videoFrame.params.seedControl).toBeUndefined();
  });

  it('P2-3 无活动帧 Img2Img 测试：真正走 activeFrame?.params || {...} 兜底分支，不出现被删字段', async () => {
    const frameWithImage: SpatialFrame = {
      id: 'frame-to-delete',
      title: '临时帧',
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

    // 1. 点击图片缩略图，打开 ImageDetailModal (此时 inspectingMediaItem 已填充)
    const imgEl = document.querySelector('img[src="https://example.com/street.png"]') as HTMLImageElement;
    expect(imgEl).toBeDefined();
    await act(async () => {
      imgEl.click();
    });

    // 2. 在 ImageDetailModal 开启状态下，删除画布上唯一的取景框
    const deleteFrameBtn = document.querySelector('button[title="删除选区框"]') as HTMLButtonElement;
    expect(deleteFrameBtn).toBeDefined();
    await act(async () => {
      deleteFrameBtn.click();
    });

    // 验证此时画布上已无任何空间画板 (spatialFrames = [])，activeFrame 为 undefined
    const boardsAfterDelete = JSON.parse(localStorage.getItem(BOARDS_KEY)!);
    const spatialBoard = boardsAfterDelete.find((b: any) => b.id === 'board-spatial');
    expect(spatialBoard.spatialFrames.length).toBe(0);

    // 3. 点击「发送到图生图 (Img2Img)」，此时必然触发 activeFrame?.params || {...} 兜底分支
    const sendToImg2ImgBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('发送到图生图')
    ) as HTMLButtonElement;
    expect(sendToImg2ImgBtn).toBeDefined();

    await act(async () => {
      sendToImg2ImgBtn.click();
    });

    // 4. 断言兜底分支创建的衍生分支
    const rawBoards = localStorage.getItem(BOARDS_KEY);
    const boards = JSON.parse(rawBoards!);
    const board = boards.find((b: any) => b.id === 'board-spatial');
    expect(board.spatialFrames.length).toBe(1);

    const derivedFrame: SpatialFrame = board.spatialFrames[0];
    expect(derivedFrame).toBeDefined();
    expect(derivedFrame.title).toContain('图生图衍生分支');
    expect(derivedFrame.referenceImageUrl).toBe('https://example.com/street.png');

    // 严格断言：只保留未配置的诚实初始状态，所有被删硬编码字段均不存在
    expect(derivedFrame.params.checkpoint).toBe('');
    expect(derivedFrame.params.targetProvider).toBe('');
    expect(derivedFrame.params.loras).toEqual([]);

    expect(derivedFrame.params.seed).toBeUndefined();
    expect(derivedFrame.params.seedControl).toBeUndefined();
    expect(derivedFrame.params.steps).toBeUndefined();
    expect(derivedFrame.params.cfg).toBeUndefined();
    expect(derivedFrame.params.sampler).toBeUndefined();
    expect(derivedFrame.params.scheduler).toBeUndefined();
    expect(derivedFrame.params.denoise).toBeUndefined();
    expect(derivedFrame.params.width).toBeUndefined();
    expect(derivedFrame.params.height).toBeUndefined();
    expect(derivedFrame.params.batchSize).toBeUndefined();
  });

  it('新建取景框及打开参数检查器时，缺失字段渲染为未设置，不出现 undefined、NaN 或孤立 ×，且参数保持缺失', async () => {
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

    // 1. 新建空取景框
    const addFrameBtn = document.querySelector('button[aria-label="新建取景框"]') as HTMLButtonElement;
    await act(async () => {
      addFrameBtn.click();
    });

    // 2. 检查取景框标题栏与快捷参数栏文本
    const bodyTextBeforeInspector = document.body.textContent || '';
    expect(bodyTextBeforeInspector).toContain('未设置尺寸');
    expect(bodyTextBeforeInspector).not.toMatch(/\bundefined\b/);
    expect(bodyTextBeforeInspector).not.toMatch(/\bNaN\b/);
    expect(bodyTextBeforeInspector).not.toContain('undefined步');
    expect(bodyTextBeforeInspector).not.toContain('CFG undefined');

    // 3. 点击「ComfyUI 参数」打开参数检查器抽屉
    const openInspectorBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('ComfyUI 参数')
    ) as HTMLButtonElement;
    expect(openInspectorBtn).toBeDefined();

    await act(async () => {
      openInspectorBtn.click();
    });

    // 4. 检查参数检查器内部文本
    const bodyTextWithInspector = document.body.textContent || '';
    expect(bodyTextWithInspector).not.toContain('undefined 步');
    expect(bodyTextWithInspector).not.toContain('undefined步');
    expect(bodyTextWithInspector).not.toContain('CFG undefined');
    expect(bodyTextWithInspector).not.toMatch(/\bundefined\b/);
    expect(bodyTextWithInspector).not.toMatch(/\bNaN\b/);

    // 5. 验证底层数据：参数仍然真实缺失（未被伪造写回 25/4.5 等默认值）
    const rawBoards = localStorage.getItem(BOARDS_KEY);
    const boards = JSON.parse(rawBoards!);
    const board = boards.find((b: any) => b.id === 'board-spatial');
    const frame: SpatialFrame = board.spatialFrames[0];
    expect(frame.params.steps).toBeUndefined();
    expect(frame.params.cfg).toBeUndefined();
    expect(frame.params.width).toBeUndefined();
    expect(frame.params.height).toBeUndefined();
  });

  it('显式 0 必须仍正常显示为 0，不能被误判为未设置', async () => {
    const frameWithZero: SpatialFrame = {
      id: 'frame-zero',
      title: '零值测试框',
      pos: { x: 100, y: 100 },
      width: 480,
      height: 480,
      prompt: 'test zero values',
      negativePrompt: '',
      status: 'idle',
      createdAt: Date.now(),
      params: {
        checkpoint: 'flux-dev',
        targetProvider: 'fal',
        loras: [],
        steps: 0,
        cfg: 0,
        width: 0,
        height: 0,
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
          spatialFrames: [frameWithZero],
        },
      ])
    );
    localStorage.setItem(ACTIVE_BOARD_KEY, 'board-spatial');
    localStorage.setItem(MODE_KEY, 'spatial');

    await act(async () => {
      root!.render(React.createElement(App));
    });

    const bodyText = document.body.textContent || '';
    // 显式 0 必须渲染 0×0、0步、CFG 0，不被当作缺失
    expect(bodyText).toContain('0×0');
    expect(bodyText).toContain('0步');
    expect(bodyText).toContain('CFG 0');

    // 打开检查器
    const openInspectorBtn = Array.from(document.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('ComfyUI 参数')
    ) as HTMLButtonElement;
    await act(async () => {
      openInspectorBtn.click();
    });

    const bodyTextWithInspector = document.body.textContent || '';
    expect(bodyTextWithInspector).toContain('0 步');
    expect(bodyTextWithInspector).toContain('0.0');
  });
});
