/**
 * civitaiTargetSchema.ts
 *
 * Pure data & mapping helpers for aligning Civitai imported recipe resources
 * (LoRAs, parameters, architecture, models) with target provider and model schemas.
 *
 * Browser-safe and node-safe: no server-side or filesystem imports.
 */

export type TargetLoraFormat =
  | 'air'
  | 'download_url'
  | 'styles'
  | 'model_name'
  | 'catalog_id'
  | 'repo_id'
  | 'custom'
  | 'unsupported'
  | 'unverified';

export type TargetLoraStatus =
  | 'compatible'
  | 'requires_reselection'
  | 'requires_consent'
  | 'architecture_mismatch'
  | 'unsupported'
  | 'unverified';

export interface TargetSchemaLoraSpec {
  provider: string;
  model?: string;
  field?: string;
  format: TargetLoraFormat;
  pathOrKeyProp?: string;
  strengthProp?: string;
  maxItems?: number;
  status: 'supported' | 'unsupported' | 'requires_reselection' | 'unverified';
  reason?: string;
  docSource?: string;
}

/**
 * Normalizes an architecture string into standard ecosystem.
 * Crucial rules:
 * - Never conflate Krea with Z-Image.
 * - Distinguish FLUX.1 and FLUX.2.
 * - Distinguish Wan 2.1 and base Wan.
 * - Never default unknown to 'sdxl' or any other architecture.
 */
export function normalizeEcosystem(baseModel?: string): string {
  const b = (baseModel || '').toLowerCase().trim();
  if (!b) return 'unknown';

  if (b.includes('flux 2') || b.includes('flux.2') || b.includes('flux2')) return 'flux2';
  if (b.includes('flux')) return 'flux1';

  if (b.includes('pony')) return 'pony';
  if (b.includes('illustrious') || b.includes('noob')) return 'illustrious';
  if (b.includes('sdxl') || b.includes('xl')) return 'sdxl';
  if (b.includes('sd 1.5') || b.includes('sd1.5') || b.includes('v1-5') || b.includes('sd 1.4') || b.includes('sd15')) return 'sd15';
  if (b.includes('sd 3.5') || b.includes('sd3.5') || b.includes('sd 3')) return 'sd35';

  if (b.includes('krea')) return 'krea';
  if (b.includes('zimage') || b.includes('z-image') || b.includes('z_image')) return 'zimage';

  if (b.includes('wan 2.1') || b.includes('wan2.1') || b.includes('wan21')) return 'wan21';
  if (b.includes('wan')) return 'wan';

  if (b.includes('moss')) return 'moss';
  if (b.includes('minimax') || b.includes('h3')) return 'minimax';

  return 'unknown';
}

/**
 * Resolves target schema LoRA capabilities and parameter specifications.
 * Uses live schema properties if provided, otherwise matches official provider conventions.
 */
export function inspectTargetSchemaForLoras(
  provider: string,
  targetModel?: string,
  schemaProperties?: Record<string, any>
): TargetSchemaLoraSpec {
  const p = (provider || '').toLowerCase().trim();

  // 1. Live schema inspection if schemaProperties provided
  if (schemaProperties && typeof schemaProperties === 'object') {
    // Styles (Krea)
    if (schemaProperties.styles) {
      const stylesProp = schemaProperties.styles;
      const maxItems = typeof stylesProp.maxItems === 'number' ? stylesProp.maxItems : undefined;
      return {
        provider: p,
        model: targetModel,
        field: 'styles',
        format: 'styles',
        pathOrKeyProp: 'id',
        strengthProp: 'strength',
        maxItems,
        status: 'supported',
        reason: '目标端点声明 styles 数组；需使用该服务商样式目录的 style ID。',
        docSource: 'OpenAPI styles schema',
      };
    }

    // Loras array
    if (schemaProperties.loras) {
      const lorasProp = schemaProperties.loras;
      const maxItems = typeof lorasProp.maxItems === 'number' ? lorasProp.maxItems : undefined;
      const items = lorasProp.items || (Array.isArray(lorasProp.anyOf) ? lorasProp.anyOf.find((x: any) => x?.items)?.items : undefined);

      if (items?.type === 'string') {
        return {
          provider: p,
          model: targetModel,
          field: 'loras',
          format: 'catalog_id',
          maxItems,
          status: 'requires_reselection',
          reason: '目标端点接受字符串 ID 数组；需使用该服务商模型目录的 LoRA ID。',
        };
      }

      const itemProps = items?.properties || {};
      if (itemProps.model) {
        return {
          provider: p,
          model: targetModel,
          field: 'loras',
          format: 'air',
          pathOrKeyProp: 'model',
          strengthProp: 'weight',
          maxItems,
          status: 'supported',
          reason: '目标端点接受 model/weight 对象；支持模型 AIR 或服务商模型 ID。',
        };
      }

      if (itemProps.model_name) {
        return {
          provider: p,
          model: targetModel,
          field: 'loras',
          format: 'model_name',
          pathOrKeyProp: 'model_name',
          strengthProp: 'strength',
          maxItems,
          status: 'requires_reselection',
          reason: '目标端点接受 model_name/strength 对象；需使用该服务商模型目录的 sd_name_in_api。',
        };
      }

      if (itemProps.path || itemProps.url) {
        const pathOrKeyProp = itemProps.path ? 'path' : 'url';
        const strengthProp = ['scale', 'weight', 'strength', 'modelStrength'].find((k) => Object.hasOwn(itemProps, k)) || 'scale';
        return {
          provider: p,
          model: targetModel,
          field: 'loras',
          format: 'download_url',
          pathOrKeyProp,
          strengthProp,
          maxItems,
          status: 'supported',
          reason: `目标端点接受 ${pathOrKeyProp}/${strengthProp} 对象；支持 HTTP(S) 直链下载权重。`,
        };
      }

      if (itemProps.id) {
        return {
          provider: p,
          model: targetModel,
          field: 'loras',
          format: 'catalog_id',
          pathOrKeyProp: 'id',
          strengthProp: 'strength',
          maxItems,
          status: 'requires_reselection',
          reason: '目标端点接受 id/strength 对象；需使用该服务商模型目录公布的 ID。',
        };
      }

      return {
        provider: p,
        model: targetModel,
        field: 'loras',
        format: 'download_url',
        pathOrKeyProp: 'path',
        strengthProp: 'scale',
        maxItems,
        status: 'supported',
        reason: '目标端点声明 loras 数组。',
      };
    }

    // Image LoRAs (Together)
    if (schemaProperties.image_loras) {
      if (p === 'together') {
        return {
          provider: p,
          model: targetModel,
          field: 'image_loras',
          format: 'unsupported',
          status: 'unsupported',
          reason: 'Together 官方参数指南明文声明：image_loras no longer available / FLUX.2 拒绝此参数。',
          docSource: 'https://docs.together.ai/docs/inference/images/parameters',
        };
      }
      return {
        provider: p,
        model: targetModel,
        field: 'image_loras',
        format: 'download_url',
        pathOrKeyProp: 'path',
        strengthProp: 'scale',
        status: 'supported',
      };
    }

    // ModelsLab lora_model
    if (schemaProperties.lora_model) {
      return {
        provider: p,
        model: targetModel,
        field: 'lora_model',
        format: 'catalog_id',
        pathOrKeyProp: 'lora_model',
        strengthProp: 'lora_strength',
        status: 'requires_reselection',
        reason: 'ModelsLab 接受 lora_model 目录模型名与 lora_strength。',
      };
    }

    // Replicate lora_weights
    if (schemaProperties.lora_weights) {
      return {
        provider: p,
        model: targetModel,
        field: 'lora_weights',
        format: 'download_url',
        pathOrKeyProp: 'lora_weights',
        strengthProp: schemaProperties.lora_scale ? 'lora_scale' : 'scale',
        maxItems: schemaProperties.extra_lora ? 2 : 1,
        status: 'supported',
        reason: 'Replicate 接受 lora_weights 直链 Safetensors 下载地址。',
      };
    }

    // Known official unsupported
    if (p === 'venice') {
      return {
        provider: p,
        model: targetModel,
        format: 'unsupported',
        status: 'unsupported',
        reason: 'Venice 官方 GenerateImageRequest 无自定义 loras 数组参数 (实测报 400)。',
        docSource: 'https://docs.venice.ai/api-reference/endpoint/image/generate',
      };
    }
    if (p === 'deepinfra') {
      return {
        provider: p,
        model: targetModel,
        format: 'unsupported',
        status: 'unsupported',
        reason: 'DeepInfra 官方标准 OpenAI 生图接口无 LoRA 参数。',
        docSource: 'https://docs.deepinfra.com/apis/image-generation',
      };
    }

    return {
      provider: p,
      model: targetModel,
      format: 'custom',
      status: 'unverified',
      reason: '当前模型 Schema 未声明显式 LoRA 字段，将按用户填写原样提交上游裁决。',
    };
  }

  // 2. Fallback to known provider conventions when no schema provided
  switch (p) {
    case 'civitai':
      return {
        provider: p,
        field: 'loras',
        format: 'air',
        status: 'supported',
        reason: 'Civitai Orchestration 原生支持 AIR 模型规范字典/列表。',
      };
    case 'fal':
      return {
        provider: p,
        field: 'loras',
        format: 'download_url',
        pathOrKeyProp: 'path',
        strengthProp: 'scale',
        status: 'supported',
        reason: 'Fal.ai 端点支持 HTTP(S) Safetensors 直链与 scale。',
      };
    case 'wavespeed':
      return {
        provider: p,
        field: 'loras',
        format: 'download_url',
        pathOrKeyProp: 'path',
        strengthProp: 'scale',
        status: 'supported',
        reason: 'WaveSpeed OpenAPI 支持 HTTP(S) 直链与 scale。',
      };
    case 'aimlapi':
      return {
        provider: p,
        field: 'loras',
        format: 'download_url',
        pathOrKeyProp: 'path',
        strengthProp: 'scale',
        status: 'supported',
        reason: 'AIMLAPI 支持 HTTP(S) 直链或 Hugging Face 仓库路径。',
      };
    case 'muapi':
      return {
        provider: p,
        field: 'loras',
        format: 'download_url',
        pathOrKeyProp: 'path',
        strengthProp: 'scale',
        status: 'supported',
        reason: 'MuAPI OpenAPI 支持 HTTP(S) 直链与 scale。',
      };
    case 'replicate':
      return {
        provider: p,
        field: 'lora_weights',
        format: 'download_url',
        pathOrKeyProp: 'lora_weights',
        strengthProp: 'lora_scale',
        maxItems: 2,
        status: 'supported',
        reason: 'Replicate 官方模型端点支持 lora_weights 直链 Safetensors。',
      };
    case 'krea':
      return {
        provider: p,
        field: 'styles',
        format: 'styles',
        pathOrKeyProp: 'id',
        strengthProp: 'strength',
        status: 'requires_reselection',
        reason: 'Krea 官方接口接受 styles 数组；需使用 Krea GET /styles 目录的 style ID。',
      };
    case 'novita':
      return {
        provider: p,
        field: 'loras',
        format: 'model_name',
        pathOrKeyProp: 'model_name',
        strengthProp: 'strength',
        status: 'requires_reselection',
        reason: 'Novita AI 接受 model_name/strength；需使用 Novita 目录的 sd_name_in_api。',
      };
    case 'sogni':
      return {
        provider: p,
        field: 'loras',
        format: 'catalog_id',
        status: 'requires_reselection',
        reason: 'Sogni 接受 loras 目录 ID 数组与 loraStrengths 强度数组。',
      };
    case 'runware':
      return {
        provider: p,
        field: 'lora',
        format: 'air',
        pathOrKeyProp: 'model',
        strengthProp: 'weight',
        status: 'supported',
        reason: 'Runware 原生支持 Civitai AIR (civitai:modelId@versionId) 与 Runware model ID。',
      };
    case 'modelslab':
      return {
        provider: p,
        field: 'lora_model',
        format: 'catalog_id',
        pathOrKeyProp: 'lora_model',
        strengthProp: 'lora_strength',
        status: 'requires_reselection',
        reason: 'ModelsLab 接受 lora_model 与 lora_strength。',
      };
    case 'modelscope':
    case 'modelscope_ai':
      return {
        provider: p,
        field: 'loras',
        format: 'repo_id',
        status: 'requires_reselection',
        reason: 'ModelScope 仅支持魔搭社区内部仓库 ID (owner/model-lora)。',
      };
    case 'tensorart':
      return {
        provider: p,
        field: 'loras',
        format: 'catalog_id',
        status: 'requires_reselection',
        reason: 'Tensor.Art TAMS 仅支持其内部数字 LoRA ID。',
      };
    case 'nanogpt':
      return {
        provider: p,
        format: 'unsupported',
        status: 'unsupported',
        reason: 'NanoGPT 标准生图接口未提供 LoRA 参数字段。',
        docSource: 'https://docs.nano-gpt.com/api-reference/image-generation.md',
      };
    case 'huggingface':
      return {
        provider: p,
        format: 'unsupported',
        status: 'unsupported',
        reason: 'Hugging Face Inference Providers 官方参数表未声明 LoRA 字段。',
        docSource: 'https://huggingface.co/docs/inference-providers/en/tasks/text-to-image',
      };
    case 'together':
      return {
        provider: p,
        format: 'unsupported',
        status: 'unsupported',
        reason: 'Together 官方参数指南明文声明：image_loras no longer available / FLUX.2 拒绝此参数。',
        docSource: 'https://docs.together.ai/docs/inference/images/parameters',
      };
    case 'venice':
      return {
        provider: p,
        format: 'unsupported',
        status: 'unsupported',
        reason: 'Venice 官方 GenerateImageRequest 无自定义 loras 数组参数。',
        docSource: 'https://docs.venice.ai/api-reference/endpoint/image/generate',
      };
    case 'deepinfra':
      return {
        provider: p,
        format: 'unsupported',
        status: 'unsupported',
        reason: 'DeepInfra 官方标准生图接口无 LoRA 字段。',
        docSource: 'https://docs.deepinfra.com/apis/image-generation',
      };
    default:
      return {
        provider: p,
        model: targetModel,
        format: 'custom',
        status: 'unverified',
        reason: '未配置显式 LoRA Schema，将按用户填写原样提交上游裁决。',
      };
  }
}

/**
 * Builds a valid download URL safely without credential leaks or double query marks.
 */
export function buildSendableLoraUrl(
  downloadUrl?: string,
  options?: {
    allowTokenInUrl?: boolean;
    civitaiToken?: string;
    requireAuth?: boolean;
  }
): { url?: string; requiresConsent?: boolean; reason?: string } {
  const trimmed = (downloadUrl || '').trim();
  if (!trimmed) {
    return { reason: '缺少可直接下载的 Safetensors 权重直链' };
  }

  if (options?.requireAuth) {
    if (!options.allowTokenInUrl) {
      return {
        requiresConsent: true,
        reason: '该 Civitai LoRA 需登录鉴权；未获显式授权不向第三方发送凭据。',
      };
    }
    if (options.civitaiToken) {
      try {
        const u = new URL(trimmed);
        u.searchParams.set('token', options.civitaiToken);
        return { url: u.toString() };
      } catch {
        const sep = trimmed.includes('?') ? '&' : '?';
        return { url: `${trimmed}${sep}token=${encodeURIComponent(options.civitaiToken)}` };
      }
    }
  }

  return { url: trimmed };
}

/**
 * Builds a canonical Civitai AIR without defaulting to 'sdxl'.
 */
export function buildCivitaiCanonicalAir(
  modelId?: number | string,
  versionId?: number | string,
  ecosystem?: string,
  originalAir?: string
): string | undefined {
  if (originalAir && originalAir.trim()) return originalAir.trim();
  if (!modelId || !versionId) return undefined;

  const eco = (ecosystem || '').trim();
  if (eco && eco !== 'unknown') {
    return `urn:air:${eco}:lora:civitai:${modelId}@${versionId}`;
  }
  // Unknown ecosystem: do NOT default to sdxl! Keep raw model@version reference
  return `urn:air:civitai:lora:${modelId}@${versionId}`;
}
