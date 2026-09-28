import {
  IEngineDriver,
  ProviderId,
  NormalizedGenerateParams,
  NormalizedGenerateResult,
  NormalizedChatParams,
  NormalizedChatResult,
} from './types';
import { AgnesDriver } from './drivers/AgnesDriver';
import { SenseNovaDriver } from './drivers/SenseNovaDriver';
import { FalDriver } from './drivers/FalDriver';
import { ModelScopeDriver } from './drivers/ModelScopeDriver';
import { ModelScopeAiDriver } from './drivers/ModelScopeAiDriver';
import { NanoGPTDriver } from './drivers/NanoGPTDriver';
import { GeminiDriver } from './drivers/GeminiDriver';
import { HuggingFaceDriver } from './drivers/HuggingFaceDriver';
import { VideoDriver } from './drivers/VideoDriver';
import { CivitaiDriver } from './drivers/CivitaiDriver';
import { TensorArtDriver } from './drivers/TensorArtDriver';

/**
 * 引擎注册管理中心 (Central Engine Registry Shell)
 * 职责：
 * 1. 负责所有模块化引擎驱动的生命周期托管与插件化注册
 * 2. 贯彻“严格意图遵从”铁律：绝不静默降级或暗中切换服务商
 * 3. 统一调度生图/生视频与文本大模型推理
 */
export class EngineRegistryClass {
  private drivers = new Map<ProviderId, IEngineDriver>();

  constructor() {
    // 内置全量官方驱动注册
    this.register(new CivitaiDriver());
    this.register(new AgnesDriver());
    this.register(new SenseNovaDriver());
    this.register(new FalDriver());
    this.register(new VideoDriver());
    this.register(new ModelScopeDriver());
    this.register(new ModelScopeAiDriver());
    this.register(new NanoGPTDriver());
    this.register(new GeminiDriver());
    this.register(new HuggingFaceDriver());
    this.register(new TensorArtDriver());
  }

  /**
   * 注册新引擎驱动 (模块化 / 插件化扩展，方便后续无痛新增任意引擎)
   */
  register(driver: IEngineDriver): void {
    this.drivers.set(driver.id, driver);
  }

  /**
   * 获取指定引擎驱动
   */
  getDriver(id: ProviderId | string): IEngineDriver | undefined {
    return this.drivers.get(id as ProviderId);
  }

  /**
   * 获取所有已注册引擎列表
   */
  getAllDrivers(): IEngineDriver[] {
    return Array.from(this.drivers.values());
  }

  /**
   * 获取具备指定能力的引擎列表
   */
  getDriversByCapability(capability: string): IEngineDriver[] {
    return this.getAllDrivers().filter((d) => d.capabilities.includes(capability as any));
  }

  /**
   * 统一执行生图/生视频核心壳方法 (归一化入参与回参)
   */
  async generate(
    providerId: ProviderId | string,
    params: NormalizedGenerateParams,
    keys: Record<string, string> = {}
  ): Promise<NormalizedGenerateResult> {
    const driver = this.getDriver(providerId);
    if (!driver) {
      throw new Error(`未找到执行引擎驱动: [${providerId}]。请确认引擎标识或前往右上角设置面板配置。`);
    }

    return driver.generate(params, keys || {});
  }

  /**
   * 统一执行文本大模型推理 (用于提示词扩写、逆向推导、反思与节点辅助)
   */
  async chat(
    providerId: ProviderId | string,
    params: NormalizedChatParams,
    keys: Record<string, string> = {}
  ): Promise<NormalizedChatResult> {
    const driver = this.getDriver(providerId);
    if (!driver) {
      throw new Error(`未找到文本推理引擎: [${providerId}]。请选择商汤日日新 (SenseNova)、Agnes AI 或 Google Gemini。`);
    }

    if (!driver.chat) {
      throw new Error(`引擎 [${driver.name}] 不支持文本大模型推理能力。支持推理的引擎包括：商汤日日新 (DeepSeek V4)、Agnes AI (Agnes 3.0)、Google Gemini。`);
    }

    return driver.chat(params, keys || {});
  }
}

// 统一导出引擎注册中心单例
export const EngineRegistry = new EngineRegistryClass();
