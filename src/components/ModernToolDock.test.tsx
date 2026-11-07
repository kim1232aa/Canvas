import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const src = fs.readFileSync(new URL('./ModernToolDock.tsx', import.meta.url), 'utf8');

describe('ModernToolDock current-model copy', () => {
  it('has no leftover FLUX.1 + SDXL or Wan 2.1 dock copy', () => {
    expect(src).not.toContain('FLUX.1 + SDXL');
    expect(src).not.toContain('Wan 2.1');
    expect(src).not.toContain('加载 FLUX、SDXL、Wan 等底模');
    expect(src).not.toContain('极速 FLUX / SDXL 云端直出');
    expect(src).not.toContain('FLUX.1 / SDXL / Ideogram 云端直出');
    expect(src).not.toContain('轻量免部署 FLUX / SDXL 云端出图');
    expect(src).not.toContain('Wan 2.1 / LTX 5秒电影运镜');
    expect(src).not.toContain('恢复标准 FLUX.1 + SDXL 预设');
  });

  it('describes Z-Image Turbo / Krea 2 / MOSS-Image / Wan 2.2 in the add-node menu and reset subtitle', () => {
    expect(src).toContain('加载 Z-Image Turbo、Krea 2、MOSS-Image、Wan 2.2 等底模');
    expect(src).toContain('Z-Image Turbo / Krea 2 / Kling 云端直出');
    expect(src).toContain('Z-Image / Krea 2 / Wan 2.2 官方推理直出');
    expect(src).toContain('轻量免部署 Z-Image / Krea 2 云端出图');
    expect(src).toContain('Wan 2.2 / Kling 3.0 / Hailuo 2.3 动态视频');
    expect(src).toContain('恢复 Z-Image Turbo 标准默认工作流');
  });
});
