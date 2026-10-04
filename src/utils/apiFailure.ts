/** Build a short explanation without discarding the original response. */
export function describeApiFailure(appStatus:number,data:any,route:string) {
  const nested=data && typeof data==='object' ? Object.values(data).find((v:any)=>v && typeof v==='object' && v.error) as any : undefined;
  const traces=Array.isArray(data?.executionTrace) ? data.executionTrace : [];
  const failed=traces.findLast((t:any)=>t.status>=400 || t.status===null);
  const status=data?.upstreamStatus ?? failed?.status ?? nested?.status;
  const endpoint=data?.exactEndpointCalled || failed?.endpoint || nested?.exactEndpointCalled;
  const source=data?.errorSource || (failed ? failed.status===null ? 'network' : 'upstream' : 'API');
  const detail=data?.error || nested?.error || (typeof data==='string' ? data : '请求失败');
  const raw=failed?.responseBody || data?.details || nested?.details;
  const cloudflare=status===403 && typeof raw==='string' && /cf_chl|challenges.cloudflare.com/.test(raw);
  const reason=cloudflare ? '上游网页要求人机验证，目录抓取被拒绝；此响应不是余额错误' : String(detail).split('\n')[0];
  return `${reason} · ${source} · ${status!=null ? `上游 HTTP ${status} / ` : ''}网站 HTTP ${appStatus} · ${endpoint || route}`;
}
