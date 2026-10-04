import {tensorModelId} from '../schemas/tensorModelApi';

export interface CatalogOption {value:string;label:string;provider:string}
export function isInvalidTensorModel(provider:string,value:string) {
  if (provider !== 'tensorart' || !value) return false;
  try {tensorModelId(value);return false;} catch {return true;}
}
export function readCheckpointCatalog(data:Record<string,any>,provider:string) {
  const rows=data[provider];
  if (rows?.error) throw new Error([rows.error,rows.details].filter(Boolean).join(': '));
  if (!Array.isArray(rows)) throw new Error('目录响应没有返回所选供应商的模型列表');
  const options:CatalogOption[]=rows.filter(row=>row.id && !/lora|locon|lycoris|dora/i.test(row.type || row.category || '')).map(row=>({value:String(row.id),label:`${row.name || row.id} · ${row.id}`,provider})).filter(row=>!isInvalidTensorModel(provider,row.value));
  const pagination=data._pagination?.[provider] || {};
  return {options,nextCursor:pagination.nextCursor || '',hasMore:pagination.hasMore===true,page:Number(pagination.page)||1};
}
export function mergeCheckpointOptions(provider:string,live:CatalogOption[]) {
  const rows=live.filter(row=>row.provider===provider);
  const seen=new Set<string>();
  return rows.filter(row=>!seen.has(row.value) && !!seen.add(row.value));
}
