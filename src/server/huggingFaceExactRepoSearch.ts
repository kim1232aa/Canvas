export type ExactRepoLookup = {
  model?: any;
  error?: { error: string; status: number | null; details?: string; endpoint: string; errorSource: 'upstream' | 'network' | 'local' };
};

/** Exact repo lookup is an additive search. Keep search results if it fails, but return an explicit partial-result error. */
export async function lookupExactHuggingFaceRepo(
  rawSearch: string,
  initialRows: any[],
  fetchExact: (endpoint: string) => Promise<Response>,
): Promise<ExactRepoLookup> {
  if (!rawSearch.includes('/') || initialRows.some((row) => String(row?.id || '').toLowerCase() === rawSearch.toLowerCase())) return {};
  const endpoint = `https://huggingface.co/api/models/${rawSearch.split('/').map(encodeURIComponent).join('/')}?expand[]=siblings&expand[]=tags&expand[]=likes&expand[]=pipeline_tag&expand[]=author&expand[]=cardData`;
  let response: Response;
  try {
    response = await fetchExact(endpoint);
  } catch (error: any) {
    return { error: { error: `HF 精确仓库补查网络错误: ${error?.message || String(error)}`, status: null, endpoint, errorSource: 'network' } };
  }
  if (!response.ok) {
    const details = await response.text();
    return { error: { error: `HF 精确仓库补查失败 (HTTP ${response.status})`, status: response.status, details, endpoint, errorSource: 'upstream' } };
  }
  let responseBody: string;
  try {
    responseBody = await response.text();
  } catch (error: any) {
    return { error: { error: `HF 精确仓库补查响应正文读取失败: ${error?.message || String(error)}`, status: response.status, endpoint, errorSource: 'local' } };
  }
  let model: any;
  try {
    model = JSON.parse(responseBody);
  } catch (error: any) {
    return { error: { error: `HF 精确仓库补查响应 JSON 解析失败: ${error?.message || String(error)}`, status: response.status, details: responseBody, endpoint, errorSource: 'local' } };
  }
  if (!model || typeof model.id !== 'string' || !model.id) {
    return { error: { error: 'HF 精确仓库补查返回无效模型数据', status: response.status, details: JSON.stringify(model), endpoint, errorSource: 'upstream' } };
  }
  return { model };
}
