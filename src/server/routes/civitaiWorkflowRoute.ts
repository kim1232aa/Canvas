import type { Request, Response } from 'express';
import {
  mapSampler,
  mapScheduler,
  resolveImportedNegativePrompt,
  resolveImportedCheckpointRef,
  resolveRawImportNegativeSamplerScheduler,
  isRawBaseModelArchitectureText,
} from '../../utils/civitaiImportMap.ts';

export interface CivitaiWorkflowDeps {
  getSettings: () => Record<string, any>;
  defaultKeys: Record<string, string>;
  upstreamFetch: (meta: any, url: string, options?: any) => Promise<any>;
}

// Helper to fetch real, authentic Civitai image generation metadata via __NEXT_DATA__
export async function fetchCivitaiRealImageMeta(imageId: string, upstreamFetch: (meta: any, url: string, options?: any) => Promise<any>) {
  const targetUrl = `https://civitai.com/images/${imageId}`;
  try {
    const resp = await upstreamFetch(
      { provider: 'civitai', route: 'image-metadata', model: imageId },
      targetUrl,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      }
    );
    if (!resp.ok) {
      const errText = await resp.text();
      return {
        error: `Civitai 上游响应 HTTP ${resp.status}`,
        details: errText,
        rawResponse: errText,
        endpoint: targetUrl,
        status: resp.status,
        errorSource: 'upstream' as const,
      };
    }
    const html = await resp.text();
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) {
      return {
        error: `Civitai 页面未包含 __NEXT_DATA__ 元数据 (Image #${imageId})`,
        status: 404,
        endpoint: targetUrl,
        errorSource: 'upstream' as const,
      };
    }
    let json: any;
    try {
      json = JSON.parse(match[1]);
    } catch (parseErr: any) {
      return {
        error: `Civitai 页面 __NEXT_DATA__ JSON 解析失败: ${parseErr.message}`,
        status: resp.status || 502,
        endpoint: targetUrl,
        rawResponse: match[1],
        errorSource: 'upstream' as const,
        stack: parseErr.stack,
      };
    }
    const queries = json.props?.pageProps?.trpcState?.json?.queries || [];
    let genData: any = null;
    let imgGet: any = null;
    for (const q of queries) {
      const qName = q.queryKey?.[0]?.[1];
      if (qName === 'getGenerationData') genData = q.state?.data;
      if (qName === 'get') imgGet = q.state?.data;
    }
    if (!genData && !imgGet) {
      return {
        error: `Civitai 页面未找到该图片的生成元数据 (Image #${imageId})`,
        status: 404,
        endpoint: targetUrl,
        errorSource: 'upstream' as const,
      };
    }
    return { genData, imgGet, status: 200, endpoint: targetUrl };
  } catch (e: any) {
    return {
      error: `连接 Civitai 发生网络错误: ${e.message}`,
      status: 502,
      endpoint: targetUrl,
      errorSource: 'network' as const,
      stack: e.stack,
    };
  }
}

export function handleExtractCivitaiWorkflow(deps: CivitaiWorkflowDeps) {
  return async (req: Request, res: Response) => {
    try {
      const { url = '', imageId = '', modelId = '', rawText = '', engine = 'civitai' } = req.body || {};

      const rawTextTrimmed = typeof rawText === 'string' ? rawText.trim() : '';
      const urlTrimmed = typeof url === 'string' ? url.trim() : '';
      const modelIdTrimmed = modelId !== undefined && modelId !== null ? String(modelId).trim() : '';
      const imageIdTrimmed = imageId !== undefined && imageId !== null ? String(imageId).trim() : '';

      const isModelUrlInInput = /(?:civitai\.(?:com|red|work|link)\/models\/|models\/|\/api\/v1\/model-versions\/|model-versions\/|modelVersionId=)/i.test(
        urlTrimmed || imageIdTrimmed || modelIdTrimmed
      );
      const effectiveImageId = isModelUrlInInput ? '' : imageIdTrimmed;
      const effectiveUrl = (urlTrimmed || (isModelUrlInInput && imageIdTrimmed ? imageIdTrimmed : '')).trim();

      const inputModes = [
        rawTextTrimmed ? 'rawText' : null,
        effectiveUrl ? 'url' : null,
        modelIdTrimmed ? 'modelId' : null,
        effectiveImageId ? 'imageId' : null,
      ].filter(Boolean);
      if (inputModes.length > 1) {
        return res.status(400).json({
          error: `extract-workflow 仅支持单个模式输入（rawText / url / modelId / imageId 互斥），同时收到了多个模式: ${inputModes.join(', ')}`,
          errorSource: 'local',
        });
      }
      if (inputModes.length === 0) {
        return res.status(400).json({
          error: 'extract-workflow 缺少有效输入（必须提供 rawText、url、modelId 或 imageId 之一）',
          errorSource: 'local',
        });
      }

      const cloudSettings = deps.getSettings();
      const apiKey =
        (req.headers?.['x-civitai-key'] as string) ||
        (req.headers?.['x-civitai-token'] as string) ||
        cloudSettings['civitaiKey'] ||
        cloudSettings['civitaiToken'] ||
        deps.defaultKeys['civitaiKey'] ||
        '';

      const inputContent = (rawTextTrimmed || effectiveUrl || modelIdTrimmed || effectiveImageId).trim();

      let targetImageId = '';
      let targetModelId = '';
      let targetVersionId = '';

      // Determine raw text vs URL vs IDs with strict mutual exclusivity
      const isExplicitRawParams =
        Boolean(rawText) ||
        inputContent.includes('Negative prompt:') ||
        inputContent.includes('Steps:') ||
        inputContent.includes('Sampler:') ||
        inputContent.includes('<lora:') ||
        (inputContent.includes('\n') && !inputContent.startsWith('http'));

      if (!isExplicitRawParams) {
        // 1. Model version match
        const verMatch = inputContent.match(/(?:modelVersionId=|model-versions\/)(\d+)/i);
        // 2. Model match
        const modelMatch = inputContent.match(/(?:civitai\.(?:com|red|work|link)\/models\/|models\/)(\d+)/i);
        // 3. Image match (must explicitly contain /images/ or be numeric imageId parameter)
        const imgMatch = inputContent.match(/(?:civitai\.(?:com|red|work|link)\/images\/|images\/)(\d{7,10})/i);

        if (verMatch) {
          targetVersionId = verMatch[1];
        } else if (modelMatch) {
          targetModelId = modelMatch[1];
        } else if (imgMatch) {
          targetImageId = imgMatch[1];
        } else if (modelId && /^\d+$/.test(String(modelId).trim())) {
          targetModelId = String(modelId).trim();
        } else if (effectiveImageId && /^\d+$/.test(effectiveImageId)) {
          targetImageId = effectiveImageId;
        } else if (/^\d{7,10}$/.test(inputContent)) {
          // Pure 7-10 digit number with no context defaults to imageId
          targetImageId = inputContent;
        } else if (/^\d{1,6}$/.test(inputContent)) {
          // Shorter pure numeric string defaults to modelId
          targetModelId = inputContent;
        }
      }

      if (targetVersionId && !/^\d+$/.test(targetVersionId)) {
        return res.status(400).json({ error: `Civitai model versionId 必须为纯数字，收到: "${targetVersionId}"`, errorSource: 'local' });
      }
      if (targetModelId && !/^\d+$/.test(targetModelId)) {
        return res.status(400).json({ error: `Civitai model ID 必须为纯数字，收到: "${targetModelId}"`, errorSource: 'local' });
      }
      if (targetImageId && !/^\d+$/.test(targetImageId)) {
        return res.status(400).json({ error: `Civitai image ID 必须为纯数字，收到: "${targetImageId}"`, errorSource: 'local' });
      }

      let presetTitle = '';
      let creatorName = '';
      let previewImage = '';
      let prompt = '';
      let negativePrompt = '';
      let selectedMultiVersionInfo: { id: number | string | null; name: string; isDefaultLatest: boolean; requiresExplicitSelection?: boolean; totalVersionsCount: number; candidates?: Array<{ id: number | string; name: string; baseModel: string }> } | null = null;

      let rawModelName = '';
      let detectedBaseModel = '';
      let importedCheckpointRef = '';
      let detectedVae = '';
      let detectedEngine = '';
      let checkpoint = '';
      let baseModelArchitecture = '';
      let loras: Array<{ name: string; displayName?: string; strength?: number | null; civitaiId?: string; triggers?: string; baseModel?: string }> = [];
      let steps: number | null = null;
      let cfg: number | null = null;
      let sampler = '';
      let scheduler = '';
      let denoise: number | null = null;
      let seed: number | null = null;
      let width: number | null = null;
      let height: number | null = null;
      let extractSource = '';
      let parsedUpstreamData = false;
      let isVideo = false;
      let videoDuration: number | null = null;

      if (isExplicitRawParams) {
        extractSource = 'Civitai / WebUI 复制参数解析';
        presetTitle = 'Civitai 参数导入：一键生成 ComfyUI 工作流';

        const fullText = rawText || inputContent;

        let posText = fullText;
        const negMatch = fullText.match(/Negative prompt:\s*([\s\S]*?)(?=(?:Steps:|$))/i);
        if (negMatch) {
          posText = fullText.substring(0, fullText.indexOf(negMatch[0])).replace(/^Prompt:\s*/i, '').trim();
        } else {
          const stepsIdx = fullText.search(/Steps:\s*\d+/i);
          if (stepsIdx !== -1) {
            posText = fullText.substring(0, stepsIdx).replace(/^Prompt:\s*/i, '').trim();
          }
        }

        const loraRegex = /<lora:([^:>]+)(?::([\d.]+))?(?::([\d.]+))?>/gi;
        const detectedLoras: typeof loras = [];
        let match;
        while ((match = loraRegex.exec(posText)) !== null) {
          detectedLoras.push({
            name: match[1],
            strength: match[2] ? parseFloat(match[2]) : null,
          });
        }

        const PARAM_PATTERNS = [
          /Negative prompt:\s*[\s\S]*?(?=(?:Steps:|$))/gi,
          /Steps:\s*\d+/gi,
          /CFG scale:\s*[\d.]+/gi,
          /Sampler:\s*[^,\n]+/gi,
          /Schedule(?:r)?:\s*[^,\n]+/gi,
          /Seed:\s*\d+/gi,
          /Size:\s*\d+x\d+/gi,
          /Model:\s*[^,\n]+/gi,
          /Model hash:\s*[^,\n]+/gi,
          /Denoising strength:\s*[\d.]+/gi,
          /Clip skip:\s*\d+/gi,
          /ENSD:\s*\d+/gi,
          /Batch size:\s*\d+/gi,
          /Batch pos:\s*\d+/gi,
          /Hires upscale:\s*[\d.]+/gi,
          /Hires steps:\s*\d+/gi,
          /Hires upscaler:\s*[^,\n]+/gi,
          /VAE:\s*[^,\n]+/gi,
        ];
        let cleanedPromptCandidate = posText;
        for (const pat of PARAM_PATTERNS) {
          cleanedPromptCandidate = cleanedPromptCandidate.replace(pat, '');
        }
        cleanedPromptCandidate = cleanedPromptCandidate
          .replace(/^Prompt:\s*/i, '')
          .replace(/<lora:[^>]+>/gi, '')
          .replace(/[,\s]+/g, ' ')
          .trim();

        const hasGenuinePositivePrompt = /[a-zA-Z0-9\u4e00-\u9fa5]{2,}/.test(cleanedPromptCandidate);
        const cleanedPos = hasGenuinePositivePrompt ? posText.replace(loraRegex, '').replace(/,\s*,/g, ',').trim() : '';
        prompt = cleanedPos;

        const rawResolved = resolveRawImportNegativeSamplerScheduler(fullText);
        negativePrompt = rawResolved.negativePrompt || '';
        sampler = rawResolved.sampler || '';
        scheduler = rawResolved.scheduler || '';

        const stepsMatch = fullText.match(/Steps:\s*(\d+)/i);
        if (stepsMatch) steps = parseInt(stepsMatch[1], 10);

        const cfgMatch = fullText.match(/CFG scale:\s*([\d.]+)/i);
        if (cfgMatch) cfg = parseFloat(cfgMatch[1]);

        const seedMatch = fullText.match(/Seed:\s*(\d+)/i);
        if (seedMatch) seed = parseInt(seedMatch[1], 10);

        const sizeMatch = fullText.match(/Size:\s*(\d+)x(\d+)/i);
        if (sizeMatch) {
          width = parseInt(sizeMatch[1], 10);
          height = parseInt(sizeMatch[2], 10);
        }

        const modelMatch = fullText.match(/Model:\s*([^,\n]+)/i);
        rawModelName = modelMatch ? modelMatch[1].trim() : '';
        if (detectedLoras.length > 0) loras = detectedLoras;

        // Strict executable check: require valid model OR genuine positive prompt OR LoRA
        if (!cleanedPos && !rawModelName && detectedLoras.length === 0) {
          return res.status(400).json({
            error: '复制参数解析失败：输入仅包含零散参数片段（如仅步数/采样器）或未提取到有效提示词与模型，无法构建可执行工作流',
            errorSource: 'local',
          });
        }
        parsedUpstreamData = Boolean((cleanedPos || rawModelName || detectedLoras.length > 0) && (hasGenuinePositivePrompt || rawModelName || detectedLoras.length > 0));
      } else if (targetImageId) {
        extractSource = `Civitai Image #${targetImageId}`;
        const civData = await fetchCivitaiRealImageMeta(targetImageId, deps.upstreamFetch);
        if (civData.error) {
          return res.status(civData.status || 500).json({
            error: civData.error,
            details: civData.details || civData.rawResponse,
            endpoint: civData.endpoint,
            status: civData.status,
            errorSource: civData.errorSource || 'upstream',
            stack: civData.stack,
          });
        }

        const { genData, imgGet } = civData;
        const meta = genData?.meta || {};

        if (imgGet?.user?.username) creatorName = imgGet.user.username;
        if (imgGet?.url && typeof imgGet.url === 'string' && imgGet.url.startsWith('http')) {
          previewImage = imgGet.url;
        }

        negativePrompt = '';
        sampler = '';
        scheduler = '';

        if (meta.prompt) prompt = meta.prompt;
        negativePrompt = resolveImportedNegativePrompt(meta.negativePrompt, negativePrompt);

        rawModelName = meta.Model || meta.baseModel || (meta.models && meta.models[0]) || '';

        const resWithBase = Array.isArray(genData?.resources)
          ? genData.resources.find((r: any) => r.baseModel && r.baseModel !== 'Unknown')
          : null;
        if (resWithBase?.baseModel) {
          detectedBaseModel = resWithBase.baseModel;
        } else if (meta.baseModel) {
          detectedBaseModel = meta.baseModel;
        }

        importedCheckpointRef = resolveImportedCheckpointRef(genData?.resources, meta, rawModelName, detectedBaseModel);

        if (meta.sampler) sampler = mapSampler(meta.sampler);
        if (meta.scheduler) scheduler = mapScheduler(meta.scheduler);
        if (meta.steps !== undefined && meta.steps !== null) steps = parseInt(String(meta.steps), 10);
        if (meta.cfgScale !== undefined && meta.cfgScale !== null) cfg = parseFloat(String(meta.cfgScale));
        if (meta.denoise !== undefined && meta.denoise !== null) denoise = parseFloat(String(meta.denoise));
        if (meta.seed !== undefined && meta.seed !== null) seed = parseInt(String(meta.seed), 10);
        if (meta.Size) {
          const sm = String(meta.Size).match(/(\d+)x(\d+)/i);
          if (sm) {
            width = parseInt(sm[1], 10);
            height = parseInt(sm[2], 10);
          }
        }
        if (meta.width !== undefined && meta.width !== null) width = parseInt(String(meta.width), 10);
        if (meta.height !== undefined && meta.height !== null) height = parseInt(String(meta.height), 10);

        if (meta.vae) detectedVae = meta.vae;
        if (meta.engine) detectedEngine = meta.engine;

        const isWanVideo = /wan[-_ ]?2/i.test(prompt) || /wan[-_ ]?2/i.test(rawModelName);
        const isMinimaxVideo = /minimax/i.test(prompt) || /hailuo/i.test(prompt);
        isVideo = isWanVideo || isMinimaxVideo || Boolean(imgGet?.metadata?.duration);
        if (imgGet?.metadata?.duration) {
          videoDuration = imgGet.metadata.duration;
        }

        const rawLorasFromGen = Array.isArray(genData?.resources)
          ? genData.resources.filter((r: any) => {
              const t = (r.modelType || r.type || '').toUpperCase();
              return t === 'LORA' || t === 'LOCON' || t === 'DORA';
            })
          : [];
        const rawLorasFromAdditional = Array.isArray(meta?.additionalResources)
          ? meta.additionalResources.filter((a: any) => a.type === 'lora' || a.modelType === 'lora')
          : [];

        if (rawLorasFromGen.length > 0) {
          rawLorasFromGen.forEach((r: any) => {
            loras.push({
              name: r.name || r.modelName || `Civitai_LoRA_${r.id}`,
              displayName: r.modelName || r.name,
              strength: r.strength !== undefined ? r.strength : null,
              civitaiId: r.modelId ? String(r.modelId) : r.id ? String(r.id) : undefined,
              triggers: r.trainedWords?.join(', ') || '',
              baseModel: r.baseModel || detectedBaseModel,
            });
          });
        } else if (rawLorasFromAdditional.length > 0) {
          rawLorasFromAdditional.forEach((a: any) => {
            loras.push({
              name: a.fileName || a.name || 'LoRA',
              displayName: (a.fileName || a.name || '').replace(/\.safetensors$/, ''),
              strength: a.strength !== undefined ? a.strength : null,
              civitaiId: a.modelId ? String(a.modelId) : '',
              triggers: '',
              baseModel: detectedBaseModel,
            });
          });
        }

        presetTitle = `Civitai 作品 #${targetImageId}：${creatorName || '创作者'} 原作逆向工作流`;

        // Require at least a prompt or model or preview image to declare parsed data
        if (!prompt && !rawModelName && !previewImage) {
          return res.status(404).json({
            error: `Civitai 图片 #${targetImageId} 页面未包含可执行的生图参数`,
            endpoint: `https://civitai.com/images/${targetImageId}`,
            status: 404,
            errorSource: 'upstream',
          });
        }
        parsedUpstreamData = true;
      } else if (targetVersionId) {
        const vUrl = `https://civitai.com/api/v1/model-versions/${targetVersionId}`;
        try {
          const vResp = await deps.upstreamFetch(
            { provider: 'civitai', route: 'workflow-extract-version', model: String(targetVersionId), key: apiKey },
            vUrl,
            {
              headers: apiKey ? { Authorization: `Bearer ${apiKey}`, 'User-Agent': 'ComfyCanvas/1.0' } : { 'User-Agent': 'ComfyCanvas/1.0' },
            }
          );
          const rawBody = await vResp.text();
          if (vResp.ok) {
            let vData: any;
            try {
              vData = JSON.parse(rawBody);
            } catch (parseErr: any) {
              return res.status(502).json({
                error: `Civitai model-version 上游响应 JSON 解析失败: ${parseErr.message}`,
                status: vResp.status || 502,
                endpoint: vUrl,
                rawResponse: rawBody,
                errorSource: 'upstream',
                stack: parseErr.stack,
              });
            }

            if (!vData || (!vData.id && !vData.modelId)) {
              return res.status(400).json({
                error: `Civitai 模型版本 #${targetVersionId} 上游返回空数据或无效模型结构`,
                endpoint: vUrl,
                status: 400,
                errorSource: 'upstream',
              });
            }

            presetTitle = `Civitai 模型版本：${vData.model?.name || vData.name || ''}`;
            creatorName = vData.model?.creator?.username || '';
            if (vData.images?.[0]?.url) previewImage = vData.images[0].url;
            const triggers = Array.isArray(vData.trainedWords) ? vData.trainedWords.join(', ') : '';
            if (triggers) prompt = triggers;
            rawModelName = vData.baseModel || '';
            detectedBaseModel = rawModelName;

            const modelType = (vData.model?.type || vData.type || '').toUpperCase();
            const isLoraType = modelType === 'LORA' || modelType === 'LOCON' || modelType === 'DORA';

            if (isLoraType) {
              loras = [
                {
                  name: vData.files?.[0]?.name || vData.name || '',
                  strength: null,
                  civitaiId: String(vData.id),
                  triggers,
                  baseModel: rawModelName,
                },
              ];
              checkpoint = '';
            } else {
              // Checkpoint or other model type
              loras = [];
              importedCheckpointRef = `civitai:${vData.modelId || ''}@${vData.id}`;
              checkpoint = importedCheckpointRef;
            }
            parsedUpstreamData = true;
          } else {
            return res.status(vResp.status).json({
              error: `Civitai model-version 上游响应 HTTP ${vResp.status}`,
              details: rawBody,
              rawResponse: rawBody,
              endpoint: vUrl,
              status: vResp.status,
              errorSource: 'upstream',
            });
          }
        } catch (e: any) {
          return res.status(502).json({
            error: `Civitai model-version 网络错误: ${e.message}`,
            endpoint: vUrl,
            status: 502,
            errorSource: 'network',
            stack: e.stack,
          });
        }
      } else if (targetModelId) {
        const mUrl = `https://civitai.com/api/v1/models/${targetModelId}`;
        try {
          const mResp = await deps.upstreamFetch(
            { provider: 'civitai', route: 'workflow-extract-model', model: String(targetModelId), key: apiKey },
            mUrl,
            {
              headers: apiKey ? { Authorization: `Bearer ${apiKey}`, 'User-Agent': 'ComfyCanvas/1.0' } : { 'User-Agent': 'ComfyCanvas/1.0' },
            }
          );
          const rawBody = await mResp.text();
          if (mResp.ok) {
            let mData: any;
            try {
              mData = JSON.parse(rawBody);
            } catch (parseErr: any) {
              return res.status(502).json({
                error: `Civitai model 上游响应 JSON 解析失败: ${parseErr.message}`,
                status: mResp.status || 502,
                endpoint: mUrl,
                rawResponse: rawBody,
                errorSource: 'upstream',
                stack: parseErr.stack,
              });
            }

            if (!mData || !mData.id) {
              return res.status(400).json({
                error: `Civitai 模型 #${targetModelId} 上游返回空数据或无效模型结构`,
                endpoint: mUrl,
                status: 400,
                errorSource: 'upstream',
              });
            }

            const versions = mData.modelVersions || [];
            if (!versions.length || !versions[0]?.id) {
              return res.status(400).json({
                error: `Civitai 模型 #${targetModelId} 未包含可用版本数据`,
                endpoint: mUrl,
                status: 400,
                errorSource: 'upstream',
              });
            }

            // Strict Rule: Multiple versions must NEVER silently default to versions[0] ("多版本不取 first")
            const v0 = versions[0];
            const hasMultipleVersions = versions.length > 1;
            const mType = (mData.type || '').toUpperCase();
            const isLoraModel = mType === 'LORA' || mType === 'LOCON' || mType === 'DORA';
            creatorName = mData.creator?.username || '';

            if (hasMultipleVersions) {
              selectedMultiVersionInfo = {
                id: null,
                name: '',
                isDefaultLatest: false,
                requiresExplicitSelection: true,
                totalVersionsCount: versions.length,
                candidates: versions.map((v: any) => ({
                  id: v.id,
                  name: v.name || String(v.id),
                  baseModel: v.baseModel || '',
                })),
              };
              presetTitle = `Civitai 模型：${mData.name || ''} (含 ${versions.length} 个版本，待显式选择 versionId)`;
              rawModelName = '';
              detectedBaseModel = '';
              if (isLoraModel) {
                loras = [
                  {
                    name: mData.name || String(mData.id),
                    strength: null,
                    civitaiId: '',
                    triggers: '',
                    baseModel: '',
                  },
                ];
                checkpoint = '';
              } else {
                loras = [];
                importedCheckpointRef = '';
                checkpoint = '';
              }
            } else {
              selectedMultiVersionInfo = null;
              presetTitle = `Civitai 模型：${mData.name || ''}`;
              if (v0.images?.[0]?.url) previewImage = v0.images[0].url;
              const triggers = Array.isArray(v0.trainedWords) ? v0.trainedWords.join(', ') : '';
              if (triggers) prompt = triggers;
              rawModelName = v0.baseModel || '';
              detectedBaseModel = rawModelName;
              if (isLoraModel) {
                loras = [
                  {
                    name: v0.files?.[0]?.name || v0.name || '',
                    strength: null,
                    civitaiId: String(v0.id),
                    triggers,
                    baseModel: rawModelName,
                  },
                ];
                checkpoint = '';
              } else {
                loras = [];
                importedCheckpointRef = `civitai:${mData.id}@${v0.id}`;
                checkpoint = importedCheckpointRef;
              }
            }
            parsedUpstreamData = true;
          } else {
            return res.status(mResp.status).json({
              error: `Civitai model 上游响应 HTTP ${mResp.status}`,
              details: rawBody,
              rawResponse: rawBody,
              endpoint: mUrl,
              status: mResp.status,
              errorSource: 'upstream',
            });
          }
        } catch (e: any) {
          return res.status(502).json({
            error: `Civitai model 网络错误: ${e.message}`,
            endpoint: mUrl,
            status: 502,
            errorSource: 'network',
            stack: e.stack,
          });
        }
      }

      if (!parsedUpstreamData) {
        return res.status(400).json({
          error: '无法解析输入：请提供有效的 Civitai 图片链接/ID、模型链接/ID，或包含可解析生图参数的文本。未匹配任何有效来源形态。',
          errorSource: 'local',
        });
      }

      const hasLora = loras.length > 0;
      const primaryLora = hasLora ? loras[0] : null;

      let targetProvider = engine || 'civitai';
      let chosenEngineName = 'Civitai 官方原生生成引擎';
      let engineExplanation = '';

      const sourceModelReference = importedCheckpointRef || rawModelName || detectedBaseModel || '';
      if (isVideo && (engine === 'video' || engine === 'civitai')) {
        targetProvider = 'video';
        chosenEngineName = 'AI Video 视频生成引擎';
        checkpoint = '';
        baseModelArchitecture = detectedBaseModel || '';
        engineExplanation = `检测到视频来源；已保留来源模型“${sourceModelReference || '未提供'}”，但不会把 Civitai 模型名猜成其他视频供应商 ID。请在视频节点明确选择实际供应商与模型后再运行。`;
      } else if (engine === 'civitai') {
        targetProvider = 'civitai';
        chosenEngineName = 'Civitai 官方原生生成引擎';
        const isRawArch = isRawBaseModelArchitectureText(sourceModelReference);
        checkpoint = isRawArch ? '' : sourceModelReference;
        baseModelArchitecture = detectedBaseModel || (isRawArch ? sourceModelReference : '');
        engineExplanation = isRawArch
          ? `来源模型“${sourceModelReference}”仅为基础架构标签，非具体 Checkpoint 模型文件或 Civitai AIR；已保留该架构信息，底模节点需要明确选择真实执行 Checkpoint 后方可运行。`
          : '保留 Civitai 解析出的原始模型/版本引用；是否具备在线生成权限以本次上游响应为准。';
      } else {
        targetProvider = engine || '';
        chosenEngineName = `${engine || '未选择'} 目标引擎`;
        checkpoint = '';
        baseModelArchitecture = detectedBaseModel || '';
        engineExplanation = `已保留 Civitai 来源模型“${sourceModelReference || '未提供'}”和 LoRA 意图，但不会跨供应商猜测模型 ID、端点或 LoRA 资源。请先从 ${engine || '目标供应商'} 的模型中心选择真实执行模型；来源 LoRA 也必须在该供应商重新解析后才能运行。`;
      }

      const nodes: any[] = [];
      const connections: any[] = [];

      if (isVideo) {
        nodes.push(
          {
            id: 'node-imp-video',
            type: 'AIVideoNode',
            title: 'AI 视频生成器 (MiniMax H3 / Wan 2.1)',
            pos: { x: 380, y: 120 },
            width: 380,
            inputs: [
              { id: 'prompt', name: 'prompt', type: 'STRING' },
              { id: 'init_image', name: 'init_image', type: 'IMAGE' },
            ],
            outputs: [
              { id: 'video', name: 'video', type: 'VIDEO' },
              { id: 'FIRST_FRAME', name: 'FIRST_FRAME', type: 'IMAGE' },
            ],
            values: {
              model: checkpoint || undefined,
              prompt,
              negative_prompt: negativePrompt || undefined,
              duration: videoDuration !== null ? videoDuration : undefined,
              fps: undefined,
              aspect_ratio: undefined,
            },
          },
          {
            id: 'node-imp-save-video',
            type: 'SaveVideo',
            title: '保存视频产物 (Save Video)',
            pos: { x: 820, y: 120 },
            width: 320,
            inputs: [{ id: 'video', name: 'video', type: 'VIDEO' }],
            outputs: [],
            values: { filename_prefix: creatorName ? `Civitai_Video_${creatorName}` : 'Civitai_Video' },
          }
        );
        connections.push({
          id: 'imp-vc1',
          fromNodeId: 'node-imp-video',
          fromSocketId: 'video',
          toNodeId: 'node-imp-save-video',
          toSocketId: 'video',
          type: 'VIDEO',
        });
      } else {
        nodes.push({
          id: 'node-imp-1',
          type: 'CheckpointLoaderSimple',
          title: `加载底模 (${chosenEngineName})`,
          pos: { x: 60, y: 120 },
          width: 280,
          inputs: [],
          outputs: [
            { id: 'MODEL', name: 'MODEL', type: 'MODEL' },
            { id: 'CLIP', name: 'CLIP', type: 'CLIP' },
            { id: 'VAE', name: 'VAE', type: 'VAE' },
          ],
          values: {
            ckpt_name: checkpoint,
            targetProvider,
            import_source_provider: 'civitai',
            import_source_model: sourceModelReference,
            import_requires_model_selection: !checkpoint || (targetProvider !== 'civitai'),
          },
        });

        if (hasLora && primaryLora) {
          nodes.push({
            id: 'node-imp-2',
            type: 'LoRALoader',
            title: `加载 LoRA (${primaryLora.name.slice(0, 18)}...)`,
            pos: { x: 380, y: 120 },
            width: 320,
            inputs: [
              { id: 'model', name: 'model', type: 'MODEL' },
              { id: 'clip', name: 'clip', type: 'CLIP' },
            ],
            outputs: [
              { id: 'MODEL', name: 'MODEL', type: 'MODEL' },
              { id: 'CLIP', name: 'CLIP', type: 'CLIP' },
            ],
            values: {
              lora_name: primaryLora.name,
              strength_model: primaryLora.strength ?? undefined,
              strength_clip: primaryLora.strength ?? undefined,
              trigger_words: primaryLora.triggers || '',
              civitai_id: primaryLora.civitaiId,
              import_source_provider: 'civitai',
              import_unresolved_resource: targetProvider !== 'civitai',
            },
          });

          connections.push(
            { id: 'imp-c1', fromNodeId: 'node-imp-1', fromSocketId: 'MODEL', toNodeId: 'node-imp-2', toSocketId: 'model', type: 'MODEL' },
            { id: 'imp-c2', fromNodeId: 'node-imp-1', fromSocketId: 'CLIP', toNodeId: 'node-imp-2', toSocketId: 'clip', type: 'CLIP' },
            { id: 'imp-c3', fromNodeId: 'node-imp-2', fromSocketId: 'CLIP', toNodeId: 'node-imp-3', toSocketId: 'clip', type: 'CLIP' },
            { id: 'imp-c4', fromNodeId: 'node-imp-2', fromSocketId: 'CLIP', toNodeId: 'node-imp-4', toSocketId: 'clip', type: 'CLIP' },
            { id: 'imp-c5', fromNodeId: 'node-imp-2', fromSocketId: 'MODEL', toNodeId: 'node-imp-6', toSocketId: 'model', type: 'MODEL' }
          );
        } else {
          connections.push(
            { id: 'imp-c1', fromNodeId: 'node-imp-1', fromSocketId: 'CLIP', toNodeId: 'node-imp-3', toSocketId: 'clip', type: 'CLIP' },
            { id: 'imp-c2', fromNodeId: 'node-imp-1', fromSocketId: 'CLIP', toNodeId: 'node-imp-4', toSocketId: 'clip', type: 'CLIP' },
            { id: 'imp-c5', fromNodeId: 'node-imp-1', fromSocketId: 'MODEL', toNodeId: 'node-imp-6', toSocketId: 'model', type: 'MODEL' }
          );
        }

        nodes.push(
          {
            id: 'node-imp-3',
            type: 'CLIPTextEncode',
            title: 'CLIP 正向提示词 (Positive Prompt)',
            pos: { x: 740, y: 60 },
            width: 380,
            inputs: [{ id: 'clip', name: 'clip', type: 'CLIP' }],
            outputs: [{ id: 'CONDITIONING', name: 'CONDITIONING', type: 'CONDITIONING' }],
            values: { text: prompt },
          },
          {
            id: 'node-imp-4',
            type: 'CLIPTextEncodeNegative',
            title: 'CLIP 负向提示词 (Negative Prompt)',
            pos: { x: 740, y: 280 },
            width: 380,
            inputs: [{ id: 'clip', name: 'clip', type: 'CLIP' }],
            outputs: [{ id: 'CONDITIONING', name: 'CONDITIONING', type: 'CONDITIONING' }],
            values: { text: negativePrompt },
          },
          {
            id: 'node-imp-5',
            type: 'EmptyLatentImage',
            title: '空潜空间张量 (Empty Latent)',
            pos: { x: 740, y: 500 },
            width: 280,
            inputs: [],
            outputs: [{ id: 'LATENT', name: 'LATENT', type: 'LATENT' }],
            values: { width: width || undefined, height: height || undefined, batch_size: 1 },
          },
          {
            id: 'node-imp-6',
            type: 'KSampler',
            title: 'KSampler 核心降噪采样',
            pos: { x: 1180, y: 140 },
            width: 320,
            inputs: [
              { id: 'model', name: 'model', type: 'MODEL' },
              { id: 'positive', name: 'positive', type: 'CONDITIONING' },
              { id: 'negative', name: 'negative', type: 'CONDITIONING' },
              { id: 'latent_image', name: 'latent_image', type: 'LATENT' },
            ],
            outputs: [{ id: 'LATENT', name: 'LATENT', type: 'LATENT' }],
            values: {
              seed,
              control_after_generate: 'randomize',
              steps,
              cfg,
              sampler_name: sampler || undefined,
              scheduler: scheduler || undefined,
              denoise: denoise !== null ? denoise : undefined,
            },
          },
          {
            id: 'node-imp-7',
            type: 'VAEDecode',
            title: 'VAE 图像解码器 (VAE Decode)',
            pos: { x: 1540, y: 140 },
            width: 260,
            inputs: [
              { id: 'samples', name: 'samples', type: 'LATENT' },
              { id: 'vae', name: 'vae', type: 'VAE' },
            ],
            outputs: [{ id: 'IMAGE', name: 'IMAGE', type: 'IMAGE' }],
            values: {},
          },
          {
            id: 'node-imp-8',
            type: 'SaveImage',
            title: '保存图像 (Save Image)',
            pos: { x: 1840, y: 100 },
            width: 360,
            inputs: [{ id: 'images', name: 'images', type: 'IMAGE' }],
            outputs: [],
            values: { filename_prefix: creatorName ? `Civitai_${creatorName}` : 'Civitai' },
          }
        );

        connections.push(
          { id: 'imp-c6', fromNodeId: 'node-imp-3', fromSocketId: 'CONDITIONING', toNodeId: 'node-imp-6', toSocketId: 'positive', type: 'CONDITIONING' },
          { id: 'imp-c7', fromNodeId: 'node-imp-4', fromSocketId: 'CONDITIONING', toNodeId: 'node-imp-6', toSocketId: 'negative', type: 'CONDITIONING' },
          { id: 'imp-c8', fromNodeId: 'node-imp-5', fromSocketId: 'LATENT', toNodeId: 'node-imp-6', toSocketId: 'latent_image', type: 'LATENT' },
          { id: 'imp-c9', fromNodeId: 'node-imp-6', fromSocketId: 'LATENT', toNodeId: 'node-imp-7', toSocketId: 'samples', type: 'LATENT' },
          { id: 'imp-c10', fromNodeId: 'node-imp-1', fromSocketId: 'VAE', toNodeId: 'node-imp-7', toSocketId: 'vae', type: 'VAE' },
          { id: 'imp-c11', fromNodeId: 'node-imp-7', fromSocketId: 'IMAGE', toNodeId: 'node-imp-8', toSocketId: 'images', type: 'IMAGE' }
        );
      }

      const otherMetadata = {
        prompt: prompt || '',
        negativePrompt: negativePrompt || '',
        baseModel: detectedBaseModel || null,
        modelFile: rawModelName && rawModelName.endsWith('.safetensors') ? rawModelName : null,
        vae: detectedVae || null,
        sampler: sampler || null,
        scheduler: scheduler || null,
        steps,
        cfgScale: cfg,
        seed,
        denoise,
        width,
        height,
        resolution: width !== null && height !== null ? `${width} x ${height}` : null,
        aspectRatio: width !== null && height !== null ? `${width}:${height}` : null,
        mediaType: isVideo ? 'video' : 'image',
        duration: videoDuration,
        engine: detectedEngine || null,
        selectedMultiVersion: selectedMultiVersionInfo || null,
        resources: loras.map((l) => ({
          name: l.displayName || l.name,
          fileName: l.name,
          versionId: l.civitaiId,
          strength: l.strength ?? null,
          baseModel: l.baseModel || detectedBaseModel || null,
        })),
      };

      const multiVersionNote = selectedMultiVersionInfo
        ? ` 该模型包含 ${selectedMultiVersionInfo.totalVersionsCount} 个版本，严禁默认取第一个版本 (versions[0])，请显式选择具体 versionId。`
        : '';

      const preset = {
        id: `civitai-imported-${Date.now()}`,
        name: presetTitle,
        prompt,
        negativePrompt,
        category: isVideo ? 'Civitai 视频工作流' : 'Civitai 一键导入',
        provider: chosenEngineName,
        previewImage,
        tags: ['Civitai 导入', creatorName, ...(primaryLora ? [primaryLora.name.replace(/\.safetensors$/, '')] : []), targetProvider.toUpperCase(), '真实解析'].filter(Boolean),
        loraNames: loras.map((l) => l.name),
        description: `从 ${extractSource} 逆向解析提取的工作流。作者: ${creatorName || '未知'}，底模: ${checkpoint || '未指定'}，LoRA 数量: ${loras.length}。${multiVersionNote}${engineExplanation ? ` 说明: ${engineExplanation}` : ''}`,
        architectureExplanation: engineExplanation,
        selectedMultiVersion: selectedMultiVersionInfo || null,
        nodes,
        connections,
        otherMetadata,
        spatialFrames: [
          {
            id: `frame-imp-${Date.now()}`,
            title: `${presetTitle} (取景框)`,
            pos: { x: 260, y: 160 },
            width: 480,
            height: 480,
            prompt,
            negativePrompt,
            params: {
              checkpoint,
              seed,
              seedControl: 'randomize',
              steps,
              cfg,
              sampler,
              scheduler,
              denoise,
              width,
              height,
              batchSize: 1,
              loras: loras.map((l) => ({
                name: l.name,
                modelStrength: l.strength ?? undefined,
                clipStrength: l.strength ?? undefined,
                triggerWords: l.triggers || '',
                civitaiId: l.civitaiId,
                unresolvedResource: targetProvider !== 'civitai',
              })),
              targetProvider,
              videoDuration: isVideo ? videoDuration : undefined,
            },
            status: 'idle',
            imageUrl: previewImage || null,
            createdAt: Date.now(),
          },
        ],
      };

      return res.json({
        success: true,
        preset,
        otherMetadata,
        availableEngines: [
          { id: 'civitai', name: 'Civitai 官方原生引擎', badge: '保留原始引用', recommended: !isVideo, description: '保留解析出的 Civitai 模型/版本引用；生成权限和 LoRA 能力以上游响应为准' },
          { id: 'fal', name: 'Fal.ai', badge: '需重选模型', description: '只保留来源元数据；请从 Fal 目录选择真实端点和 LoRA URL' },
          { id: 'tensorart', name: 'Tensor.Art', badge: '需重选模型', description: '请从 TAMS 目录选择真实模型 ID；不会把 Civitai 名称转换成 Tensor ID' },
          { id: 'nanogpt', name: 'NanoGPT', badge: '需重选模型', description: '请从 NanoGPT 当前目录选择执行模型，参数能力按端点元数据与响应核实' },
          { id: 'modelscope', name: 'ModelScope CN', badge: '需重选模型', description: '国内站与来源 Civitai 不是同一资源命名空间' },
          { id: 'modelscope_ai', name: 'ModelScope AI', badge: '需重选模型', description: '国际站单独选择真实模型与账户，不与国内站互换' },
          { id: 'huggingface', name: 'Hugging Face', badge: '需重选模型', description: '请明确选择 Hub 模型及实际在线推理路由' },
          { id: 'muapi', name: 'MuAPI', badge: '需重选端点', description: '请从 MuAPI 目录选择真实 endpoint_url；不映射 Civitai 模型名' },
          { id: 'wavespeed', name: 'WaveSpeed', badge: '需重选端点', description: '请从 WaveSpeed 目录选择完整 model_id；不映射 Civitai 模型名' },
          { id: 'sogni', name: 'Sogni', badge: '需重选 selector', description: '请从当前官方工具 Schema selector 选择模型；worker ID 不自动转换' },
          { id: 'sensenova', name: 'SenseNova', badge: '需重选模型', description: '请按当前商汤接口配置选择模型；不使用导入来源名替代' },
          { id: 'agnes', name: 'Agnes AI', badge: '需重选模型', description: '请按当前 Agnes 接口配置选择模型；不自动套默认模型' },
          { id: 'gemini', name: 'Google Gemini', badge: '需重选模型', description: '请从 Gemini 模型选项明确选择实际生图模型' },
          ...(isVideo ? [{ id: 'video', name: 'AI Video 视频生成引擎', badge: '需重选供应商/模型', recommended: true, description: '保留视频来源元数据，但不把 Civitai 模型名猜成其他视频供应商模型' }] : [])
        ],
        selectedEngine: targetProvider,
        parsedMeta: {
          creator: creatorName,
          checkpoint,
          architecture: rawModelName || null,
          architectureExplanation: engineExplanation,
          lorasCount: loras.length,
          steps,
          cfg,
          sampler: sampler || null,
          scheduler: scheduler || null,
          seed,
          size: width !== null && height !== null ? `${width}x${height}` : null,
          mediaType: isVideo ? 'video' : 'image',
          duration: videoDuration,
          selectedMultiVersion: selectedMultiVersionInfo || null,
        },
      });
    } catch (error: any) {
      console.error('Extract civitai workflow error:', error);
      return res.status(500).json({
        error: error.message || 'Civitai workflow extraction failed',
        errorSource: 'local',
        stack: error.stack,
      });
    }
  };
}
