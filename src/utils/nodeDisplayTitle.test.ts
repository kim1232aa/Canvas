import { describe, expect, it } from 'vitest';
import {
  formatVideoNodeTitle,
  isTemplateVideoNodeTitle,
  formatCheckpointNodeTitle,
  isTemplateCheckpointNodeTitle,
  formatNodeDisplayTitle,
} from './nodeDisplayTitle';

describe('nodeDisplayTitle', () => {
  describe('formatVideoNodeTitle & isTemplateVideoNodeTitle', () => {
    it('recognizes preset template and default titles as template-generated', () => {
      expect(isTemplateVideoNodeTitle('AI 视频 (Fal.ai)')).toBe(true);
      expect(isTemplateVideoNodeTitle('AI 视频 (Sogni)')).toBe(true);
      expect(isTemplateVideoNodeTitle('AI 视频 (Civitai)')).toBe(true);
      expect(isTemplateVideoNodeTitle('AI 视频 (WaveSpeed)')).toBe(true);
      expect(isTemplateVideoNodeTitle('AI 视频 (MuAPI)')).toBe(true);
      expect(isTemplateVideoNodeTitle('AI 视频 (Novita)')).toBe(true);
      expect(isTemplateVideoNodeTitle('AI 视频 (Replicate)')).toBe(true);
      expect(isTemplateVideoNodeTitle('AI 视频 (Krea)')).toBe(true);
      expect(isTemplateVideoNodeTitle('AI 视频 (Together)')).toBe(true);
      expect(isTemplateVideoNodeTitle('AI 视频 (AIMLAPI)')).toBe(true);
      expect(isTemplateVideoNodeTitle('AI 视频 (Venice)')).toBe(true);
      expect(isTemplateVideoNodeTitle('AI 视频')).toBe(true);
      expect(isTemplateVideoNodeTitle('')).toBe(true);
      expect(isTemplateVideoNodeTitle(undefined)).toBe(true);
      expect(isTemplateVideoNodeTitle(null)).toBe(true);
    });

    it('recognizes user-customized titles as non-template (must not be overwritten)', () => {
      expect(isTemplateVideoNodeTitle('AI 视频（显式 Provider/Model）')).toBe(false);
      expect(isTemplateVideoNodeTitle('我的专属视频生成器')).toBe(false);
      expect(isTemplateVideoNodeTitle('Product Demo Video')).toBe(false);
      expect(isTemplateVideoNodeTitle('Wan 2.1 镜头A')).toBe(false);
      expect(isTemplateVideoNodeTitle('AI 视频 (我的测试)')).toBe(false);
      expect(isTemplateVideoNodeTitle('AI 视频 - 特别定制版')).toBe(false);
    });

    it('switching provider changes the displayed label for template-generated titles', () => {
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'sogni')).toBe('AI 视频 (Sogni)');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'wavespeed')).toBe('AI 视频 (WaveSpeed)');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'krea')).toBe('AI 视频 (Krea)');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'civitai')).toBe('AI 视频 (Civitai)');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'replicate')).toBe('AI 视频 (Replicate)');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'together')).toBe('AI 视频 (Together)');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'aimlapi')).toBe('AI 视频 (AIMLAPI)');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'venice')).toBe('AI 视频 (Venice)');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'novita')).toBe('AI 视频 (Novita)');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', 'muapi')).toBe('AI 视频 (MuAPI)');
      expect(formatVideoNodeTitle('AI 视频', 'sogni')).toBe('AI 视频 (Sogni)');
      expect(formatVideoNodeTitle('', 'sogni')).toBe('AI 视频 (Sogni)');
    });

    it('switching provider to empty yields generic base title', () => {
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', '')).toBe('AI 视频');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', null)).toBe('AI 视频');
      expect(formatVideoNodeTitle('AI 视频 (Fal.ai)', undefined)).toBe('AI 视频');
    });

    it('preserves user-renamed titles regardless of provider switch', () => {
      expect(formatVideoNodeTitle('我的专属视频生成器', 'sogni')).toBe('我的专属视频生成器');
      expect(formatVideoNodeTitle('Product Demo Video', 'wavespeed')).toBe('Product Demo Video');
      expect(formatVideoNodeTitle('AI 视频 (我的测试)', 'krea')).toBe('AI 视频 (我的测试)');
      expect(formatVideoNodeTitle('Wan 2.1 镜头A', 'fal')).toBe('Wan 2.1 镜头A');
    });
  });

  describe('formatCheckpointNodeTitle & isTemplateCheckpointNodeTitle', () => {
    it('recognizes preset and default checkpoint titles as template-generated', () => {
      expect(isTemplateCheckpointNodeTitle('加载底模 (Hugging Face)')).toBe(true);
      expect(isTemplateCheckpointNodeTitle('加载底模 (Fal.ai)')).toBe(true);
      expect(isTemplateCheckpointNodeTitle('加载底模 (Civitai)')).toBe(true);
      expect(isTemplateCheckpointNodeTitle('加载底模 (Tensor.Art OpenWorks)')).toBe(true);
      expect(isTemplateCheckpointNodeTitle('Load Checkpoint (Replicate)')).toBe(true);
      expect(isTemplateCheckpointNodeTitle('加载底模')).toBe(true);
      expect(isTemplateCheckpointNodeTitle('加载 Checkpoint')).toBe(true);
      expect(isTemplateCheckpointNodeTitle('加载底模 (Checkpoint)')).toBe(true);
    });

    it('recognizes user-customized checkpoint titles as non-template', () => {
      expect(isTemplateCheckpointNodeTitle('二次元大模型 SDXL')).toBe(false);
      expect(isTemplateCheckpointNodeTitle('写实摄影底模 v2')).toBe(false);
      expect(isTemplateCheckpointNodeTitle('Custom Main Checkpoint')).toBe(false);
    });

    it('updates template-generated checkpoint titles to follow provider', () => {
      expect(formatCheckpointNodeTitle('加载底模 (Hugging Face)', 'sogni')).toBe('加载底模 (Sogni)');
      expect(formatCheckpointNodeTitle('加载底模 (Fal.ai)', 'replicate', 'black-forest-labs/flux-schnell')).toBe(
        'Load Checkpoint (Replicate · flux-schnell)'
      );
    });

    it('preserves custom checkpoint titles on provider switch', () => {
      expect(formatCheckpointNodeTitle('二次元大模型 SDXL', 'sogni')).toBe('二次元大模型 SDXL');
      expect(formatCheckpointNodeTitle('Custom Main Checkpoint', 'replicate')).toBe('Custom Main Checkpoint');
    });
  });

  describe('formatNodeDisplayTitle', () => {
    it('updates AIVideoNode dynamically when values provided', () => {
      expect(formatNodeDisplayTitle('AIVideoNode', 'AI 视频 (Fal.ai)', { targetProvider: 'sogni' })).toBe(
        'AI 视频 (Sogni)'
      );
      expect(formatNodeDisplayTitle('AIVideoNode', 'AI 视频 (Fal.ai)', { provider: 'krea' })).toBe(
        'AI 视频 (Krea)'
      );
    });

    it('preserves custom title for AIVideoNode even with values', () => {
      expect(formatNodeDisplayTitle('AIVideoNode', '产品渲染短片', { targetProvider: 'sogni' })).toBe(
        '产品渲染短片'
      );
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
      expect(formatNodeDisplayTitle('EmptyLatentImage', '尺寸（空潜空间）', { targetProvider: 'sogni' })).toBe(
        '画布尺寸设定 (Latent)'
      );
      expect(formatNodeDisplayTitle('VAEDecode', 'VAE 解码', { targetProvider: 'sogni' })).toBe(
        '图像解码器 (VAE Decode)'
      );
      expect(formatNodeDisplayTitle('CustomUnknown', '未知节点名', { targetProvider: 'sogni' })).toBe(
        '未知节点名'
      );
    });

    it('backward compatibility: returns currentTitle or type when values are not provided', () => {
      expect(formatNodeDisplayTitle('EmptyLatentImage', 'EmptyLatentImage')).toBe('画布尺寸设定 (Latent)');
      expect(formatNodeDisplayTitle('CLIPTextEncode', 'CLIPTextEncode')).toBe('正向提示词 (CLIP)');
      expect(formatNodeDisplayTitle('AIVideoNode', 'AI 视频 (Fal.ai)')).toBe('AI 视频 (Fal.ai)');
    });
  });
});
