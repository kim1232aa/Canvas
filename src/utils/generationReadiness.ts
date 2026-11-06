import {buildZImagePayload} from '../schemas/zImageSpace';
import {isLoraUnsupportedOnEndpoint, isRealLoraEntry} from './resolveCheckpoint';

export function generationReadiness(input: {
  executionBlockedReason?: string;
  sourceLoraAir?: string;
  unresolvedModel?: boolean;
  requireReferenceImage?: boolean;
  referenceImageUrl?: string;
  provider?: string;
  hfProvider?: string;
  model?: string;
  prompt?: string;
  loras?: unknown[];
  resolution?: string;
  shift?: number;
  seed?: number;
  steps?: number;
  cfg?: number;
  negativePrompt?: string;
  width?: number;
  height?: number;
  ksamplerNodeId?: string;
  randomSeed?: boolean;
  galleryImages?: unknown[];
}): string | undefined {
  if (input.executionBlockedReason) {
    return input.executionBlockedReason;
  }
  if (input.sourceLoraAir) return '来源 LoRA 执行链尚未接入；请保留历史档案，创建新的显式生成分支';
  if (input.requireReferenceImage && !input.referenceImageUrl?.trim()) return '编辑输入需要明确参考图，请选择或上传参考图';
  if (!input.provider?.trim()) return '请选择执行服务商';
  if (!input.model?.trim()) return '请先选择模型';
  if ((input.loras || []).some((item:any)=>item?.unresolvedResource===true)) return '导入工作流包含尚未转换为当前供应商资源 ID/URL 的 LoRA；请在当前供应商的 LoRA 中心重新选择或移除该待解析资源';
  // Empty prompt and unresolved models are allowed; upstream decides
}