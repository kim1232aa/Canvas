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
 * Strictly live-schema driven:
 * - If target is Civitai: uses native Civitai AIR specification.
 * - If live schema properties are provided: derives field, format, and capabilities from the schema.
 * - Otherwise (no model chosen, or schema is loading/error/missing): returns 'unverified'.
 * There is NO hardcoded static provider fallback table.
 */
export function inspectTargetSchemaForLoras(
  provider: string,
  targetModel?: string,
  schemaProperties?: Record<string, any>,
  schemaReasonOverride?: string
): TargetSchemaLoraSpec {
  const p = (provider || '').toLowerCase().trim();

  // 1. Live schema inspection if schemaProperties provided
  if (schemaProperties && typeof schemaProperties === 'object' && Object.keys(schemaProperties).length > 0) {
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
        status: 'requires_reselection',
        reason: '目标端点声明 styles 数组；需使用该服务商样式目录公布的 style ID。',
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
          reason: '目标端点接受字符串 ID 数组；需使用该服务商模型目录公布的 LoRA ID。',
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

      if (itemProps.air) {
        return {
          provider: p,
          model: targetModel,
          field: 'loras',
          format: 'air',
          pathOrKeyProp: 'air',
          strengthProp: 'strength',
          maxItems,
          status: 'supported',
          reason: '目标端点声明 air 字段；支持规范 Civitai AIR (urn:air:...)。',
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
        format: 'custom',
        maxItems,
        status: 'unverified',
        reason: `目标端点声明了 loras 数组，但其子项属性 (${Object.keys(itemProps).join('、') || '无明确属性定义'}) 未包含已知的直链 (path/url) 或标识规范；状态标为未核实。`,
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
      const itemProps = schemaProperties.image_loras?.items?.properties || {};
      if (itemProps.path || itemProps.url) {
        const pathOrKeyProp = itemProps.path ? 'path' : 'url';
        const strengthProp = ['scale', 'weight', 'strength', 'modelStrength'].find((k) => Object.hasOwn(itemProps, k)) || 'scale';
        return {
          provider: p,
          model: targetModel,
          field: 'image_loras',
          format: 'download_url',
          pathOrKeyProp,
          strengthProp,
          status: 'supported',
        };
      }
      return {
        provider: p,
        model: targetModel,
        field: 'image_loras',
        format: 'custom',
        status: 'unverified',
        reason: '目标端点声明了 image_loras 数组，但其属性格式未包含已知直链定义；状态标为未核实。',
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

    return {
      provider: p,
      model: targetModel,
      format: "custom",
      status: "unverified",
      reason: "当前模型 Schema 未声明显式 LoRA 字段，将按用户填写原样提交上游裁决。",
    };
  }

  // 2. Native Civitai Orchestration provider (no remote schema needed)
  if (p === "civitai") {
    return {
      provider: p,
      field: "loras",
      format: "air",
      status: "supported",
      reason: "Civitai Orchestration 原生支持 AIR 模型规范字典/列表。",
      docSource: "https://civitai.com",
    };
  }

  // 3. Any other provider without live schema -> unverified
  let reason = schemaReasonOverride;
  if (!reason) {
    if (!targetModel) {
      reason = "未选择目标模型；请在上方选用目标模型以加载其实时 Schema 规范。";
    } else {
      reason = "目标端点缺少实时 Schema 规范，状态标为未核实。";
    }
  }

  return {
    provider: p,
    model: targetModel,
    format: "custom",
    status: "unverified",
    reason,
  };
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

  const eco = (ecosystem || '').trim().toLowerCase();
  if (eco && eco !== 'unknown') {
    return `urn:air:${eco}:lora:civitai:${modelId}@${versionId}`;
  }
  // Unknown ecosystem: return undefined; do not fabricate urn:air:civitai:lora:... or default to sdxl!
  return undefined;
}
