import { describe, expect, it, vi } from 'vitest';
import { EngineRegistry } from './EngineRegistry';

describe('EngineRegistry - no-fallback verification', () => {
  it('throws explicit error when chosen provider has no video capability, refusing silent fallback to video driver', async () => {
    // gemini only has text2img, img2img, reasoning (no video)
    const geminiDriver = EngineRegistry.getDriver('gemini');
    expect(geminiDriver?.capabilities).not.toContain('text2video');
    expect(geminiDriver?.capabilities).not.toContain('img2video');

    const videoSpy = vi.spyOn(EngineRegistry, 'getDriver');

    await expect(
      EngineRegistry.generate(
        'video',
        {
          provider: 'gemini',
          targetProvider: 'gemini',
          model: 'gemini-3.1-flash-image',
          prompt: 'a running horse',
          isVideo: true,
          videoDuration: 5,
        } as any,
        {}
      )
    ).rejects.toThrow(/服务商 \[Google Gemini \(官方直连\)\] \(gemini\) 不支持视频生成，且不存在对应的视频执行路由。拒绝静默切换到其他视频驱动。/);

    // Ensure getDriver('video') was NOT called as a silent fallback
    expect(videoSpy).not.toHaveBeenCalledWith('video');
    videoSpy.mockRestore();
  });
});
