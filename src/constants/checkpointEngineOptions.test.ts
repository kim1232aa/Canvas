import { describe, it, expect } from 'vitest';
import { NODE_DEFINITIONS } from './nodes';
import { EngineRegistry } from '../engines/EngineRegistry';

// 图像底模节点（CheckpointLoaderSimple）的目标执行引擎下拉：
// 服务端 SchemaProviderDriver('deepinfra')、模型中心与设置项均已存在，
// 缺的只是节点入口——DeepInfra 必须像其他引擎一样可手动选择。
function checkpointEngineOptionValues(): string[] {
  const def = NODE_DEFINITIONS['CheckpointLoaderSimple'];
  const widget = def.widgets?.find((w) => w.name === 'targetProvider');
  return (widget?.options ?? [])
    .map((o) => String(o.value ?? '').trim())
    .filter(Boolean);
}

describe('CheckpointLoaderSimple 目标执行引擎下拉', () => {
  it('DeepInfra 可手动选择', () => {
    expect(checkpointEngineOptionValues()).toContain('deepinfra');
  });

  it('可选的 DeepInfra 解析到具备生图能力的注册驱动', () => {
    const driver = EngineRegistry.getDriver('deepinfra');
    expect(driver).toBeDefined();
    expect(driver!.capabilities as readonly string[]).toContain('text2img');
  });

  it('既有引擎选项不被移除', () => {
    const values = checkpointEngineOptionValues();
    for (const p of ['huggingface', 'civitai', 'fal', 'modelscope', 'nanogpt', 'replicate']) {
      expect(values).toContain(p);
    }
  });
});
