import {buildZImagePayload} from '../schemas/zImageSpace';
import {isLoraUnsupportedOnEndpoint, isRealLoraEntry} from './resolveCheckpoint';

export function generationReadiness(input: {provider?: string; hfProvider?: string; model?: string; prompt?: string; loras?: unknown[]; resolution?: string; shift?: number; seed?: number; steps?: number; randomSeed?: boolean; galleryImages?: unknown[]}): string | undefined {
  if (!input.provider?.trim()) return '请选择执行服务商';
  if (!input.model?.trim()) return '请先选择模型';
  if (input.provider==='tensorart' && !/^\d{10,25}$/.test(input.model) && !/^https:\/\/(?:www\.)?(?:tensor\.art|tusiart\.com)\/models\/\d{10,25}/.test(input.model)) return 'Tensor.Art 需要真实模型 ID；旧 OpenWorks 工具不能作为底模，请重新选择';
  if (!input.prompt?.trim()) return '请填写提示词';
  if (input.loras?.some(isRealLoraEntry) && isLoraUnsupportedOnEndpoint(input.provider, input.model).unsupported) {
    return '当前模型接口不支持 LoRA。请旁路或移除 LoRA 节点，或选择支持 LoRA 的接口。';
  }
  if (input.provider === 'huggingface' && !input.hfProvider && ['tongyi-mai/z-image-turbo', 'z-image-turbo'].includes(input.model.toLowerCase())) {
    if (input.randomSeed === undefined) return '请选择 Z-Image 的种子策略';
    if (!Array.isArray(input.galleryImages)) return '请选择 Z-Image 的结果集';
    try { buildZImagePayload({...input, random_seed: input.randomSeed, gallery_images: input.galleryImages}); }
    catch (error: any) {return error.message;}
  }
}
