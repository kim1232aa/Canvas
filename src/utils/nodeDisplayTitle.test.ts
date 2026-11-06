import { describe, expect, it } from 'vitest';
import {
  formatVideoNodeTitle,
  formatCheckpointNodeTitle,
  applyHubCheckpointTitle,
  formatNodeDisplayTitle,
} from './nodeDisplayTitle';

describe('nodeDisplayTitle - explicit titleSource and zero heuristic protection', () => {
  describe('AIVideoNode title behavior', () => {
    it('template-generated video node title (titleSource: "template") follows provider dynamically', () => {
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'sogni', 'template')).toBe('AI 视频 (Sogni)');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'wavespeed', 'template')).toBe('AI 视频 (WaveSpeed)');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'krea', 'template')).toBe('AI 视频 (Krea)');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'civitai', 'template')).toBe('AI 视频 (Civitai)');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'replicate', 'template')).toBe('AI 视频 (Replicate)');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'together', 'template')).toBe('AI 视频 (Together)');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'aimlapi', 'template')).toBe('AI 视频 (AIMLAPI)');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'venice', 'template')).toBe('AI 视频 (Venice)');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'novita', 'template')).toBe('AI 视频 (Novita)');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'muapi', 'template')).toBe('AI 视频 (MuAPI)');
      // Palette default when marked as template (P2-1)
      expect(formatVideoNodeTitle('AI 视频（显式 Provider/Model）', 'sogni', 'template')).toBe('AI 视频 (Sogni)');
      // Empty provider
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', '', 'template')).toBe('AI 视频');
    });

    it('P1-2: locks reviewer lookalike and base titles without titleSource or with titleSource="user" (never overwritten)', () => {
      // Inputs specifically highlighted in review findings:
      expect(formatVideoNodeTitle('AI 视频 (Fal)', 'sogni', undefined)).toBe('AI 视频 (Fal)');
      expect(formatVideoNodeTitle('AI 视频 (Fal)', 'sogni', 'user')).toBe('AI 视频 (Fal)');

      expect(formatVideoNodeTitle('AI 视频 (Sogni)', 'krea', undefined)).toBe('AI 视频 (Sogni)');
      expect(formatVideoNodeTitle('AI 视频 (Sogni)', 'krea', 'user')).toBe('AI 视频 (Sogni)');

      expect(formatVideoNodeTitle('AI 视频', 'sogni', undefined)).toBe('AI 视频');
      expect(formatVideoNodeTitle('AI 视频', 'krea', 'user')).toBe('AI 视频');

      expect(formatVideoNodeTitle('AI 视频 (fal)', 'wavespeed', undefined)).toBe('AI 视频 (fal)');
      expect(formatVideoNodeTitle('AI 视频 (FAL.AI)', 'sogni', undefined)).toBe('AI 视频 (FAL.AI)');
      expect(formatVideoNodeTitle('AI 视频 (mage)', 'sogni', undefined)).toBe('AI 视频 (mage)');

      // Custom titles
      expect(formatVideoNodeTitle('我的专属短片生成器', 'sogni', undefined)).toBe('我的专属短片生成器');
      expect(formatVideoNodeTitle('Product Demo Video', 'wavespeed', 'user')).toBe('Product Demo Video');
      expect(formatVideoNodeTitle('AI 视频 (我的测试)', 'krea', undefined)).toBe('AI 视频 (我的测试)');
    });
  });

  describe('CheckpointLoaderSimple title behavior', () => {
    it('template-generated checkpoint node title (titleSource: "template") follows provider dynamically', () => {
      expect(formatCheckpointNodeTitle('加载底模 (Hugging Face)', 'sogni', undefined, 'template')).toBe(
        '加载底模 (Sogni)'
      );
      expect(
        formatCheckpointNodeTitle(
          '加载底模 (Fal.ai)',
          'replicate',
          'black-forest-labs/flux-schnell',
          'template'
        )
      ).toBe('Load Checkpoint (Replicate · flux-schnell)');
    });

    it('P1-1: locks reviewer lookalike titles without titleSource or with titleSource="user" (never overwritten)', () => {
      // Inputs specifically highlighted in review findings:
      expect(formatCheckpointNodeTitle('加载底模 (v2)', 'sogni', undefined, undefined)).toBe('加载底模 (v2)');
      expect(formatCheckpointNodeTitle('加载底模 (v2)', 'sogni', undefined, 'user')).toBe('加载底模 (v2)');

      expect(formatCheckpointNodeTitle('加载底模 (my-model)', 'sogni', undefined, undefined)).toBe(
        '加载底模 (my-model)'
      );
      expect(formatCheckpointNodeTitle('加载底模 (my-model)', 'sogni', undefined, 'user')).toBe(
        '加载底模 (my-model)'
      );

      expect(formatCheckpointNodeTitle('加载底模 (foo.safetensors)', 'sogni', undefined, undefined)).toBe(
        '加载底模 (foo.safetensors)'
      );
      expect(formatCheckpointNodeTitle('Load Checkpoint (v2)', 'sogni', undefined, undefined)).toBe(
        'Load Checkpoint (v2)'
      );
      expect(
        formatCheckpointNodeTitle('Load Checkpoint (anything-goes here)', 'sogni', undefined, undefined)
      ).toBe('Load Checkpoint (anything-goes here)');

      // Custom titles
      expect(formatCheckpointNodeTitle('二次元大模型 SDXL', 'sogni', undefined, undefined)).toBe(
        '二次元大模型 SDXL'
      );
      expect(formatCheckpointNodeTitle('Custom Main Checkpoint', 'replicate', undefined, 'user')).toBe(
        'Custom Main Checkpoint'
      );
    });
  });

  describe('P1-2: applyHubCheckpointTitle guard for existing CheckpointLoaderSimple', () => {
    it('preserves user lookalike titles and custom titles when titleSource is not template', () => {
      // Inputs from review findings:
      expect(applyHubCheckpointTitle('加载底模 (v2)', 'sogni', 'ltx25', undefined, undefined)).toBe('加载底模 (v2)');
      expect(applyHubCheckpointTitle('加载底模 (v2)', 'sogni', 'ltx25', undefined, 'user')).toBe('加载底模 (v2)');
      expect(applyHubCheckpointTitle('加载底模 (my-model)', 'fal', 'fal-ai/flux', undefined, undefined)).toBe('加载底模 (my-model)');
      expect(applyHubCheckpointTitle('Load Checkpoint (v2)', 'replicate', 'black-forest-labs/flux-schnell', 'flux-schnell', undefined)).toBe('Load Checkpoint (v2)');
      expect(applyHubCheckpointTitle('二次元大模型 SDXL', 'sogni', 'ltx25', undefined, undefined)).toBe('二次元大模型 SDXL');
    });

    it('updates title when titleSource is template', () => {
      expect(applyHubCheckpointTitle('加载底模 (Fal.ai)', 'sogni', 'ltx25', undefined, 'template')).toBe('加载底模 (Sogni)');
      expect(applyHubCheckpointTitle('加载底模 (Hugging Face)', 'replicate', 'black-forest-labs/flux-schnell', 'flux-schnell', 'template')).toBe(
        'Load Checkpoint (Replicate · flux-schnell)'
      );
    });
  });

  describe('formatNodeDisplayTitle', () => {
    it('delegates to formatVideoNodeTitle with titleSource', () => {
      expect(
        formatNodeDisplayTitle('AIVideoNode', 'AI 视频 (Fal.ai)', { targetProvider: 'sogni' }, 'template')
      ).toBe('AI 视频 (Sogni)');

      expect(
        formatNodeDisplayTitle('AIVideoNode', 'AI 视频 (Fal)', { targetProvider: 'sogni' }, undefined)
      ).toBe('AI 视频 (Fal)');
    });

    it('delegates to formatCheckpointNodeTitle with titleSource', () => {
      expect(
        formatNodeDisplayTitle(
          'CheckpointLoaderSimple',
          '加载底模 (Hugging Face)',
          { targetProvider: 'sogni' },
          'template'
        )
      ).toBe('加载底模 (Sogni)');

      expect(
        formatNodeDisplayTitle(
          'CheckpointLoaderSimple',
          '加载底模 (v2)',
          { targetProvider: 'sogni' },
          undefined
        )
      ).toBe('加载底模 (v2)');
    });

    it('presets without a provider suffix remain unchanged', () => {
      expect(formatNodeDisplayTitle('SaveImage', '保存图像', { targetProvider: 'sogni' })).toBe(
        '保存与预览图像 (Save Image)'
      );
      expect(formatNodeDisplayTitle('SaveVideo', '保存视频', { targetProvider: 'sogni' })).toBe(
        '保存与预览视频 (Save Video)'
      );
      expect(formatNodeDisplayTitle('KSampler', '采样器', { targetProvider: 'sogni' })).toBe(
        'KSampler 采样器'
      );
    });
  });
});
