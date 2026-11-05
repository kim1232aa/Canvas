export interface SenseNovaCatalogDeps {
  upstreamFetch: (meta: any, endpoint: string, init?: RequestInit) => Promise<Response>;
}

export type SenseNovaCatalogResult =
  | { ok: true; endpoint: string; items: Array<Record<string, unknown>> }
  | { ok: false; endpoint: string; error: string; status: number; details: unknown; errorSource: 'upstream' | 'upstream-protocol' };

export async function fetchSenseNovaModelCatalog(
  deps: SenseNovaCatalogDeps,
  baseUrl: string,
  apiKey: string,
): Promise<SenseNovaCatalogResult> {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/models`;
  const response = await deps.upstreamFetch(
    { provider: 'sensenova', route: '/api/models', model: 'models', key: apiKey },
    endpoint,
    { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } },
  );
  if (!response.ok) {
    return { ok: false, endpoint, error: `SenseNova 模型列表上游 HTTP ${response.status}`, status: response.status, details: await response.text(), errorSource: 'upstream' };
  }

  let responseText: string;
  try {
    responseText = await response.text();
  } catch (error: any) {
    return {
      ok: false,
      endpoint,
      error: `SenseNova 模型列表响应读取失败: ${error.message}`,
      status: response.status,
      details: error.message,
      errorSource: 'upstream-protocol',
    };
  }
  let raw: any;
  try {
    raw = JSON.parse(responseText);
  } catch (error: any) {
    return {
      ok: false,
      endpoint,
      error: `SenseNova 模型列表返回无效 JSON: ${error.message}`,
      status: response.status,
      details: responseText,
      errorSource: 'upstream-protocol',
    };
  }
  if (!Array.isArray(raw?.data)) {
    return { ok: false, endpoint, error: 'SenseNova 模型列表响应缺少 data 数组', status: response.status, details: raw, errorSource: 'upstream-protocol' };
  }

  const items = raw.data
    .filter((model: any) => typeof model?.id === 'string' && model.id.trim())
    .map((model: any) => {
      const inputModalities = Array.isArray(model.input_modalities) ? model.input_modalities : [];
      const outputModalities = Array.isArray(model.output_modalities) ? model.output_modalities : [];
      const videoOutput = outputModalities.includes('video');
      const imageOutput = outputModalities.includes('image');
      const textOutput = outputModalities.includes('text');
      const category = videoOutput ? 'video' : imageOutput ? 'checkpoint' : textOutput ? 'reasoning' : 'unknown';
      return {
        ...model,
        id: model.id,
        name: typeof model.name === 'string' && model.name ? model.name : model.id,
        provider: 'SenseNova',
        category,
        type: category,
        tags: [...inputModalities.map((v: unknown) => `input:${String(v)}`), ...outputModalities.map((v: unknown) => `output:${String(v)}`)],
        externalUrl: 'https://platform.sensenova.cn/docs',
      };
    });
  return { ok: true, endpoint, items };
}
