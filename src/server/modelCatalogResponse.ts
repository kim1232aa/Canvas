/** Strictly parse provider catalog responses without turning protocol failures into empty catalogs. */
export type CatalogParseResult<T> =
  | { ok: true; data: T; rawResponse: string }
  | {
      ok: false;
      error: string;
      status: number;
      upstreamStatus: number;
      errorSource: 'upstream';
      details: string;
      rawResponse: string;
    };

function redact(rawResponse: string, secret?: string): string {
  return secret ? rawResponse.split(secret).join('[credential redacted]') : rawResponse;
}

function parseJson(rawResponse: string, status: number): { value?: any; error?: CatalogParseResult<never> } {
  try {
    return { value: JSON.parse(rawResponse) };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return {
      error: {
        ok: false,
        error: `上游返回了无效 JSON：${message}`,
        status,
        upstreamStatus: status,
        errorSource: 'upstream',
        details: rawResponse,
        rawResponse,
      },
    };
  }
}

function httpError(provider: string, status: number, rawResponse: string): CatalogParseResult<never> {
  return {
    ok: false,
    error: `${provider} 上游请求失败 (${status})`,
    status,
    upstreamStatus: status,
    errorSource: 'upstream',
    details: rawResponse,
    rawResponse,
  };
}

export function parseRunwareCatalogResponse(status: number, responseBody: string, secret?: string): CatalogParseResult<{ results: any[]; totalResults?: number }> {
  const rawResponse = redact(responseBody, secret);
  if (status < 200 || status >= 300) return httpError('Runware', status, rawResponse);
  const parsed = parseJson(rawResponse, status);
  if (parsed.error) return parsed.error;
  const taskResult = Array.isArray(parsed.value?.data) ? parsed.value.data[0] : null;
  if (!taskResult || !Array.isArray(taskResult.results) || taskResult.results.some((row: unknown) => !row || typeof row !== 'object' || Array.isArray(row))) {
    return {
      ok: false,
      error: 'Runware 上游返回了非预期的 modelSearch 响应（缺少 data[0].results）',
      status,
      upstreamStatus: status,
      errorSource: 'upstream',
      details: rawResponse,
      rawResponse,
    };
  }
  return {
    ok: true,
    data: {
      results: taskResult.results,
      ...(typeof taskResult.totalResults === 'number' ? { totalResults: taskResult.totalResults } : {}),
    },
    rawResponse,
  };
}

export function parseModelsLabCatalogResponse(status: number, responseBody: string, secret?: string): CatalogParseResult<any[]> {
  const rawResponse = redact(responseBody, secret);
  if (status < 200 || status >= 300) return httpError('ModelsLab', status, rawResponse);
  const parsed = parseJson(rawResponse, status);
  if (parsed.error) return parsed.error;
  if (!Array.isArray(parsed.value) || parsed.value.some((row: unknown) => !row || typeof row !== 'object' || Array.isArray(row))) {
    return {
      ok: false,
      error: 'ModelsLab 上游返回了非预期的 model_list 响应（预期 JSON 数组）',
      status,
      upstreamStatus: status,
      errorSource: 'upstream',
      details: rawResponse,
      rawResponse,
    };
  }
  return { ok: true, data: parsed.value, rawResponse };
}

export interface GenericCatalogPagination {
  page?: number;
  limit?: number;
  total?: number;
  hasMore?: boolean;
  sourceUrl?: string;
  sourceNotice?: string;
  catalogAvailable?: boolean;
  lookupOnly?: boolean;
  noRemoteCatalog?: boolean;
  [k: string]: any;
}

/** Provider-neutral determination if a catalog pagination state represents a lookup-only (no remote catalog API) provider. */
export function isLookupOnlyCatalog(pagination?: GenericCatalogPagination | null): boolean {
  if (!pagination || typeof pagination !== 'object') return false;
  if (pagination.lookupOnly === true || pagination.noRemoteCatalog === true) return true;
  const notice = String(pagination.sourceNotice || '').toLowerCase();
  return (
    notice.includes('lookup-only') ||
    notice.includes('no public remote catalog') ||
    notice.includes('no public lora directory')
  );
}
