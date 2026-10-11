import type { NodeInstance, WorkflowPreset } from '../types/graph';

type Resource = { air: string; file: string; kind: string; source: string };

export const PRESET_RESOURCES: Record<string, Resource> = {
  'civitai-hinablue-armor': { air: 'urn:air:sdxl:lycoris:civitai:536954@2446979', file: 'hinaSciFiArmor_illustrious2_v3.safetensors', kind: 'LoCon', source: 'https://civitai.com/api/v1/model-versions/2446979' },
  'civitai-hinablue-9527': { air: 'urn:air:sdxl:lora:civitai:234556@285546', file: 'hinaTuningFaceDetailer_SDXL-v2-rank256-pruned.safetensors', kind: 'LORA', source: 'https://civitai.com/api/v1/model-versions/285546' },
  'sdxl-photorealism-tweaker': { air: 'urn:air:sdxl:lora:civitai:122359@135867', file: 'add-detail-xl.safetensors', kind: 'LORA', source: 'https://civitai.com/api/v1/model-versions/135867' },
  'civitai-hinablue-136947637': { air: 'urn:air:krea2:lora:civitai:2746042@3130750', file: 'hina_krea2Turbo_lora_tqd.safetensors', kind: 'LORA', source: 'https://civitai.com/api/v1/model-versions/3130750' },
  'civitai-aiimagestudio-134923610': { air: 'urn:air:krea2:lora:civitai:2323765@3071582', file: 'Krea2Turbo_RadianceChromeVoluptuous_v1.0.safetensors', kind: 'LORA', source: 'https://civitai.com/api/v1/model-versions/3071582' },
  'civitai-129705858-zimage-asianmix': { air: 'urn:air:zimageturbo:lycoris:civitai:2328130@2920318', file: 'hina_zImageTurbo_asianMix_v7.0-R-rev1_fp32.safetensors', kind: 'LoCon', source: 'https://civitai.com/api/v1/model-versions/2920318' },
};

const unresolvedReasons: Record<string, string> = {
  'flux-civitai-lora': '旧版本 138944 实为 SDXL 巴士 LyCORIS，无法核实所称 FLUX 赛博朋克资源。',
  'sdxl-anime-dual-lora': '旧 ID 98214 的公开查询未能确认资源与版本；404 不证明资源虚构，吉卜力意图保留。底模 AIR 实为 Juggernaut XL，非 Animagine。',
  'sdxl-shinkai-skies': '旧版本 110294 实为 SD1 Anya embedding，无法核实所称 SDXL 新海诚资源。底模 AIR 实为 Juggernaut XL，非 Animagine。',
  'flux-retro-pixel': '旧版本 132410 实为 SD1 角色 LoRA，无法核实所称 FLUX 像素资源。',
  'flux-analog-film': '旧版本 142850 实为 SD1 氷菓角色 LoRA，无法核实所称 FLUX 胶片资源。',
  'sdxl-chibi-3d': '旧 ID 158320 的公开查询未能确认资源与版本；404 不证明资源虚构，粘土意图保留。',
  'civitai-hinablue-pony-realism': '旧模型 682190 实为 Flux EldritchPunk，不能挂到 Pony；底模 AIR 实为 Juggernaut XL。原 Pony checkpoint 和丝绸资源均待重选。',
};

const nativeKrea = new Set(['civitai-hinablue-136947637', 'civitai-aiimagestudio-134923610']);
const streetId = 'civitai-hinablue-2758-street';
const armorId = 'civitai-hinablue-armor';
const zImageId = 'civitai-129705858-zimage-asianmix';

function correctResource(node: NodeInstance, resource?: Resource, reason?: string): NodeInstance {
  if (node.type !== 'LoRALoader') return node;
  if (resource) {
    return { ...node, title: `加载 ${resource.kind} (${resource.file})`, values: {
      ...node.values, lora_name: resource.file, civitai_id: resource.air, civitaiId: resource.air,
      resource_kind: resource.kind, resource_source: resource.source,
    } };
  }
  return { ...node, title: `${node.title}（未核实，待重选）`, values: { ...node.values, import_unresolved_resource: true, import_resource_reason: reason } };
}

function correctCivitaiPreset(preset: WorkflowPreset): WorkflowPreset {
  const resource = PRESET_RESOURCES[preset.id];
  const reason = unresolvedReasons[preset.id];
  const isStreet = preset.id === streetId;
  const isArmor = preset.id === armorId;
  const isKrea = nativeKrea.has(preset.id);
  const isZImage = preset.id === zImageId;
  const engine = isZImage ? 'sdcpp' : 'comfy';
  const ecosystem = isKrea ? 'krea2' : isZImage ? 'zImage' : isStreet ? 'flux1' : preset.nodes.find(n => n.type === 'CheckpointLoaderSimple')?.values.ckpt_name?.includes(':flux1:') ? 'flux1' : 'sdxl';
  const oldLoader = preset.nodes.find(n => n.type === 'CheckpointLoaderSimple')!;
  const invalidCheckpointIntent = ['sdxl-anime-dual-lora', 'sdxl-shinkai-skies', 'civitai-hinablue-pony-realism'].includes(preset.id);
  const checkpoint = isKrea || isZImage ? 'turbo' : isStreet || isArmor || invalidCheckpointIntent ? '' : oldLoader.values.ckpt_name;
  const modelSelector = isKrea || isZImage ? 'turbo' : undefined;
  const oldSampler = preset.nodes.find(n => n.type === 'KSampler');
  const oldFrame = preset.spatialFrames?.[0];
  const settings: NodeInstance['values'] = isKrea && preset.id === 'civitai-hinablue-136947637'
    ? { ...oldSampler?.values, steps: preset.otherMetadata?.steps, cfg: preset.otherMetadata?.cfgScale, sampler_name: preset.otherMetadata?.sampler, scheduler: preset.otherMetadata?.scheduler }
    : { ...oldSampler?.values, ...(isZImage ? { scheduler: 'simple' } : {}) };
  const nodes = preset.nodes.filter(n => !isStreet || n.type !== 'LoRALoader').map(node => {
    if (node.type === 'CheckpointLoaderSimple') return { ...node,
      title: isStreet ? '2758 Checkpoint（原版版本未核实，待重选）' : isArmor ? 'Illustrious Checkpoint（待显式选择）' : invalidCheckpointIntent ? '底模（历史来源错误，待重选）' : isKrea ? 'Civitai Comfy Krea2 Turbo（内建模型）' : isZImage ? 'Civitai sdcpp ZImage Turbo（内建模型）' : ecosystem === 'sdxl' ? '加载底模（Juggernaut XL Jugg XI）' : '加载底模（FLUX.1 Dev）',
      values: { ...node.values, ckpt_name: checkpoint, targetProvider: 'civitai', civitai_engine: engine, civitai_ecosystem: ecosystem,
        ...(invalidCheckpointIntent ? { import_unresolved_resource: true, import_resource_reason: reason, historical_checkpoint: oldLoader.values.ckpt_name } : {}),
        ...(modelSelector ? { civitai_model: modelSelector } : {}),
        ...(isStreet ? { source_model_id: '705606', resource_source: 'https://civitai.com/api/v1/models/705606' } : {}),
        ...(isArmor || isStreet || preset.id === 'civitai-hinablue-pony-realism' ? { import_unresolved_resource: true } : {}),
      },
    };
    if (node.type === 'KSampler') return { ...node, title: '采样参数（历史记录，固定种子）', values: { ...settings, control_after_generate: 'fixed' } };
    if (isKrea && node.type === 'VAEDecode') return { ...node, title: '上游 Krea2 图像输出' };
    if (node.type === 'CLIPTextEncode') return { ...node, title: '正向提示词（历史记录，来源未核实）' };
    return correctResource(node, resource, reason);
  });
  const removedLora = preset.nodes.find(n => isStreet && n.type === 'LoRALoader');
  const connections = preset.connections.filter(c => !removedLora || c.toNodeId !== removedLora.id).map(c => removedLora && c.fromNodeId === removedLora.id ? { ...c, fromNodeId: oldLoader.id } : c);
  const loras = nodes.filter(n => n.type === 'LoRALoader').map(n => ({
    name: n.values.lora_name, modelStrength: n.values.strength_model, clipStrength: n.values.strength_clip,
    triggerWords: n.values.trigger_words ?? '', civitaiId: n.values.civitai_id ?? n.values.civitaiId,
    ...(reason ? { unresolvedResource: true } : {}),
  }));
  const description = isStreet
    ? '2758（模型 705606）已核实为 Checkpoint，移除错误 LoRA 挂载。来源 #142524199 当前公开 API 的作者、SDXL 资源列表与旧 hinablue/FLUX 记录不符且 meta=null；原版 checkpoint 版本待重选，不选择 latest。保留旧提示词和参数作为历史意图，不能声称复现。'
    : isArmor
      ? 'Fantasy Armor 指定文件已核实为 Illustrious LoCon/LyCORIS（版本 2446979）。旧 Fal fast-sdxl 并非指定 Illustrious checkpoint；底模留空待重选。采样与提示词仅保留历史参数，未核实原作复现。'
      : reason
        ? `${reason} 保留旧名称、ID、权重和提示词作为历史意图；资源未核实，待重选，不能声称已挂载或可复现。`
        : `已核实资源版本与 AIR；使用 Civitai ${engine} / ${ecosystem}${modelSelector ? ` / ${modelSelector}` : ''}。提示词、权重、种子和采样值来自历史模板，未取得原作品完整元数据，不能声称原作复现。${isZImage ? '旧 scheduler=normal 保存在历史元数据；本模板显式采用官方 sdcpp schedule=simple，保留 euler 与 8 步。' : ''}`;
  const spatialFrames = preset.spatialFrames?.map(frame => ({ ...frame,
    title: reason || isArmor || isStreet ? `${frame.title}（待重选）` : frame.title,
    prompt: nodes.find(n => n.type === 'CLIPTextEncode')?.values.text ?? frame.prompt,
    negativePrompt: nodes.find(n => n.type === 'CLIPTextEncodeNegative')?.values.text ?? frame.negativePrompt,
    params: { ...frame.params, checkpoint, targetProvider: 'civitai' as const, civitaiEngine: engine, civitaiEcosystem: ecosystem,
      ...(modelSelector ? { civitaiModel: modelSelector } : {}),
      ...(invalidCheckpointIntent || isStreet || isArmor ? { unresolvedModel: true } : {}),
      seed: settings.seed, seedControl: 'fixed' as const, steps: settings.steps, cfg: settings.cfg,
      sampler: settings.sampler_name, scheduler: settings.scheduler, loras,
    },
  }));
  return { ...preset,
    name: reason ? `${preset.name}（资源未核实）` : isStreet ? 'Civitai 2758 Checkpoint 街拍历史模板（待重选）' : isArmor ? 'Civitai Fantasy Armor Illustrious LyCORIS（底模待重选）' : isKrea ? `Civitai Krea2 Turbo + ${resource.file}（历史参数模板）` : preset.id === 'civitai-hinablue-9527' ? 'Civitai Juggernaut XL + SDXL Face Detailer（历史参数模板）' : preset.id === 'sdxl-photorealism-tweaker' ? 'Civitai Juggernaut XL + Detail Tweaker XL（单 LoRA 历史模板）' : preset.name,
    provider: `Civitai / ${engine} / ${ecosystem}`, category: reason || isStreet || isArmor ? '待配置历史模板' : 'Civitai 参数模板',
    description, loraNames: loras.map(l => l.name), nodes, connections, spatialFrames,
    ...(isKrea ? { tags: ['Civitai', 'Krea 2 Turbo', resource.file, '历史参数模板'] } : {}),
    otherMetadata: { ...preset.otherMetadata, ...(isKrea ? { vae: undefined } : {}),
      sourceMetadataStatus: 'unverified_history', sourceMetadataNote: '公开原图未取得完整生成元数据；以下参数是旧模板记录，不是已核实的原作参数。资源 API 仅证明资源版本与类型。',
      historicalParameters: { checkpoint: oldLoader.values.ckpt_name, sampler: oldSampler?.values, frameParams: oldFrame?.params, unverifiedSourceMetadata: preset.otherMetadata },
      resourceSource: resource?.source, resourceKind: resource?.kind, sourceImage: isStreet ? 'https://civitai.com/api/v1/images?imageId=142524199' : undefined,
      engine, baseModel: isKrea ? 'Krea 2' : isZImage ? 'ZImageTurbo' : isArmor ? 'Illustrious（待选择 checkpoint）' : ecosystem === 'sdxl' ? 'SDXL 1.0' : 'Flux.1 D',
      modelFile: checkpoint, resourceAir: resource?.air,
      sampler: settings.sampler_name, scheduler: settings.scheduler, steps: settings.steps, cfgScale: settings.cfg, seed: settings.seed,
      resources: resource ? [{ name: resource.file, fileName: resource.file, versionId: resource.air.split('@')[1], strength: loras[0]?.modelStrength, baseModel: ecosystem }] : [],
    },
  };
}

function correctVideoPreset(preset: WorkflowPreset): WorkflowPreset {
  const isHistorical = preset.id === 'civitai-arpalest-143279135';
  const model = isHistorical ? '' : preset.nodes.find(n => n.type === 'AIVideoNode')?.values.model;
  return { ...preset,
    ...(isHistorical ? {
      name: 'Civitai SoftBreastMotion / MiniMax H3 历史模板（待配置）', provider: 'Civitai / MiniMax H3（原作路由待配置）', category: '待配置历史模板',
      description: '资源 3340113 已核实为 Civitai MiniMax H3 LoRA，不能当作 Fal H3 已挂载资源。公开原作查询无结果，无法确认原作图生图/视频路由；保留旧意图、提示词与参数，模型留空待配置，不自动替换为 Fal text-to-video。',
      otherMetadata: { ...preset.otherMetadata, sourceMetadataStatus: 'unverified_history', sourceMetadataNote: '公开原图查询无结果；采样、种子、尺寸及视频时长仅是旧模板记录，不是已核实的原作参数。' },
    } : {}),
    nodes: preset.nodes.map(node => node.type !== 'AIVideoNode' ? node : { ...node,
      title: isHistorical ? 'MiniMax H3 历史节点（路由与模型待配置）' : node.title,
      values: { ...node.values, model, targetProvider: isHistorical ? 'civitai' : node.values.targetProvider,
        ...(isHistorical ? {
          import_unresolved_resource: true, source_lora_air: 'urn:air:minimaxh3:lora:civitai:2949319@3340113', source_resource: 'https://civitai.com/api/v1/model-versions/3340113',
          seed: preset.otherMetadata?.seed, steps: preset.otherMetadata?.steps, cfg: preset.otherMetadata?.cfgScale,
          sampler_name: preset.otherMetadata?.sampler, scheduler: preset.otherMetadata?.scheduler,
          control_after_generate: 'fixed',
        } : {}),
      },
    }),
    spatialFrames: preset.spatialFrames?.map(frame => ({ ...frame, mediaType: 'video' as const,
      title: isHistorical ? 'MiniMax H3 历史取景框（待配置）' : frame.title,
      params: { ...frame.params, checkpoint: model, targetProvider: 'video' as const, videoProvider: isHistorical ? 'civitai' : 'fal',
        ...(isHistorical ? { seed: preset.otherMetadata?.seed, seedControl: 'fixed' as const, steps: preset.otherMetadata?.steps, cfg: preset.otherMetadata?.cfgScale, sampler: preset.otherMetadata?.sampler, scheduler: preset.otherMetadata?.scheduler } : {}),
        loras: frame.params.loras.map(l => ({ ...l, civitaiId: isHistorical ? 'urn:air:minimaxh3:lora:civitai:2949319@3340113' : l.civitaiId, ...(isHistorical ? { unresolvedResource: true } : {}) })),
      },
    })),
  };
}

function correctPresetResources(preset: WorkflowPreset): WorkflowPreset {
  if (preset.nodes.some(n => n.type === 'AIVideoNode')) return correctVideoPreset(preset);
  if (preset.id === 'gemini-imagen-zero-config') return { ...preset,
    name: 'Google Gemini 生图模板（需显式选择模型）', category: '待配置模板', provider: 'Google Gemini', tags: ['Google Gemini', 'generateContent', '需配置凭据和模型'],
    description: '本站使用 Gemini generateContent 路由。请配置有效凭据并显式选择当前可用的生图模型；不预填 Imagen predict 模型，不承诺免 Key 或开箱可用。',
    nodes: preset.nodes.map(n => n.type === 'GoogleImagenNode' ? { ...n, title: 'Gemini generateContent（需选择模型）', values: { ...n.values, model: '', targetProvider: 'gemini' } } : n),
    spatialFrames: preset.spatialFrames?.map(f => ({ ...f, title: 'Gemini 生图取景框（需选择模型）', params: { ...f.params, checkpoint: '' } })),
  };
  if (preset.id.startsWith('agnes-')) return { ...preset,
    category: 'Agnes AI（需配置凭据）',
    ...(preset.id === 'agnes-flash-img2img' ? { description: '请先在 LoadImage 选择参考图。参考图随 Agnes Image 2.5 Flash 请求提交；模板预览仅供浏览，不作为编辑输入。空间模式仍需显式选择参考图。' } : {}),
    nodes: preset.nodes.map(n => n.type === 'LoadImage' ? { ...n, title: '选择参考图（必填）', values: { ...n.values, image_url: '' } } : n),
    spatialFrames: preset.spatialFrames?.map(f => ({ ...f, params: { ...f.params, width: 2048, height: 2048 } })),
  };
  if (preset.id === 'fal-krea-2-turbo-native') return { ...preset,
    spatialFrames: preset.spatialFrames?.map(f => ({ ...f, params: { ...f.params, targetProvider: 'fal' } })),
  };
  if (PRESET_RESOURCES[preset.id] || unresolvedReasons[preset.id] || preset.id === streetId) return correctCivitaiPreset(preset);
  return preset;
}

export function correctPresetLayout(preset: WorkflowPreset): WorkflowPreset {
  const positive = preset.nodes.find(n => n.type === 'CLIPTextEncode');
  const negative = preset.nodes.find(n => n.type === 'CLIPTextEncodeNegative');
  const latent = preset.nodes.find(n => n.type === 'EmptyLatentImage');
  const image = preset.nodes.find(n => n.type === 'LoadImage');
  const checkpoint = preset.nodes.find(n => n.type === 'CheckpointLoaderSimple');
  const sharedPromptColumn = positive && ((negative && negative.pos.x === positive.pos.x) || (latent && latent.pos.x === positive.pos.x));
  return { ...preset, nodes: preset.nodes.map(node => {
    const y = sharedPromptColumn && node.id === positive.id ? 80
      : sharedPromptColumn && node.id === negative?.id && negative.pos.x === positive.pos.x ? 620
      : sharedPromptColumn && node.id === latent?.id && latent.pos.x === positive.pos.x ? 1000
      : image && checkpoint && image.pos.x === checkpoint.pos.x && node.id === checkpoint.id ? image.pos.y + 1000
      : node.pos.y;
    return y === node.pos.y ? node : { ...node, pos: { ...node.pos, y } };
  }) };
}

function correctPresetExecution(preset: WorkflowPreset): WorkflowPreset {
  if (preset.id === 'gemini-imagen-zero-config') return { ...preset,
    spatialFrames: preset.spatialFrames?.map(f => ({ ...f, params: { ...f.params, seed: undefined, seedControl: 'fixed' as const } })),
  };
  if (preset.id === 'agnes-flash-img2img') return { ...preset,
    nodes: preset.nodes.map(n => n.type === 'CheckpointLoaderSimple' ? { ...n, values: { ...n.values, require_reference_image: true } } : n),
    spatialFrames: preset.spatialFrames?.map(f => ({ ...f, params: { ...f.params, requireReferenceImage: true } })),
  };
  if (preset.id === 'civitai-arpalest-143279135') {
    const reason = '来源执行链尚未接入本站；请重新配置完整来源模型/LoRA/引擎，单独更换模型不能解除此档案的来源约束。';
    return { ...preset, category: '待配置档案',
      nodes: preset.nodes.map(n => n.type === 'AIVideoNode' ? { ...n, values: { ...n.values, execution_blocked_reason: reason } } : n),
      spatialFrames: preset.spatialFrames?.map(f => ({ ...f, params: { ...f.params, executionBlockedReason: reason } })),
    };
  }
  if (preset.id === 'wan21-img2video-cinematic') {
    const reason = 'Wan 2.1 历史模板待配置：请选择真实参考图并显式设置官方 num_frames；不将历史 5 秒自动换算为帧数。';
    const video = preset.nodes.find(n => n.type === 'AIVideoNode')!;
    return { ...preset, name: 'Wan 2.1 图生视频历史模板（需参考图与 num_frames）', category: '待配置档案',
      description: reason + ' 历史 5 秒/1080P 意图仅存档，不代表当前端点可直接使用；保留 fal-ai/wan-i2v 来源，不自动换模型。',
      tags: ['Wan 2.1', '图生视频', '待配置', 'num_frames'],
      otherMetadata: { ...preset.otherMetadata, historicalVideoIntent: { duration: video.values.duration, resolution: '1080P', nodeValues: video.values, frameParams: preset.spatialFrames?.[0].params }, sourceMetadataStatus: 'unverified_history' },
      nodes: preset.nodes.map(n => n.type === 'LoadImage' ? { ...n, values: { ...n.values, image_url: '' } } : n.type === 'AIVideoNode' ? { ...n, title: 'Wan 2.1（num_frames 待配置）', values: { ...n.values, duration: undefined, require_reference_image: true, execution_blocked_reason: reason } } : n),
      spatialFrames: preset.spatialFrames?.map(f => ({ ...f, negativePrompt: preset.nodes.find(n => n.type === 'CLIPTextEncodeNegative')?.values.text ?? f.negativePrompt, referenceImageUrl: undefined, videoDuration: undefined, videoFps: video.values.fps, videoAspectRatio: video.values.aspect_ratio,
        params: { ...f.params, videoDuration: undefined, videoFps: video.values.fps, aspectRatio: video.values.aspect_ratio, resolution: video.values.resolution, seed: video.values.seed, seedControl: 'fixed' as const, steps: undefined, cfg: undefined, sampler: undefined, scheduler: undefined, requireReferenceImage: true, executionBlockedReason: reason },
      })),
    };
  }
  return preset;
}

export function correctPreset(preset: WorkflowPreset): WorkflowPreset {
  return correctPresetLayout(correctPresetExecution(correctPresetResources(preset)));
}
