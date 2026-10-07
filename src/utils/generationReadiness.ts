import {buildZImagePayload} from '../schemas/zImageSpace';
import {isLoraUnsupportedOnEndpoint, isRealLoraEntry} from './resolveCheckpoint';

export function generationReadiness(input: {provider?: string; hfProvider?: string; model?: string; prompt?: string; loras?: unknown[]; resolution?: string; shift?: number; seed?: number; steps?: number; randomSeed?: boolean; galleryImages?: unknown[]}): string | undefined {
  if (!input.provider?.trim()) return '请选择执行服务商';
  if (!input.model?.trim()) return '请先选择模型';
  if ((input.loras || []).some((item:any)=>item?.unresolvedResource===true)) return '导入工作流包含尚未转换为当前供应商资源 ID/URL 的 LoRA；请在当前供应商的 LoRA 中心重新选择或移除该待解析资源';
  if (input.provider==='tensorart' && !/^\d{10,25}$/.test(input.model) && !/^https:\/\/(?:www\.)?(?:tensor\.art|tusiart\.com)\/models\/\d{10,25}/.test(input.model)) return 'Tensor.Art 需要真实模型 ID；旧 OpenWorks 工具不能作为底模，请重新选择';
  if (!input.prompt?.trim()) return '请填写提示词';
  if (input.provider === 'huggingface' && input.hfProvider==='z-image-space') {
    if (input.randomSeed === undefined) return '请选择 Z-Image 的种子策略';
    if (!Array.isArray(input.galleryImages)) return '请选择 Z-Image 的结果集';
    try { buildZImagePayload({...input, random_seed: input.randomSeed, gallery_images: input.galleryImages}); }
    catch (error: any) {return error.message;}
  }
}