import {tensorModelId} from '../schemas/tensorModelApi';
import {isLookupOnlyCatalog} from './catalogPagination';
import {EngineRegistry} from '../engines/EngineRegistry';

export interface CatalogOption {value:string;label:string;provider:string}

export interface CheckpointCatalogResult {
  options: CatalogOption[];
  nextCursor: string;
  hasMore: boolean;
  page: number;
  sourceUrl?: string;
  sourceNotice?: string;
  catalogNotice?: string;
  isLookupOnly: boolean;
}

export interface DriverModelSuggestion {
  id: string;
  name: string;
  description?: string;
  declaredInDriver: true;
}

export function isInvalidTensorModel(provider:string,value:string) {
  if (provider !== 'tensorart' || !value) return false;
  try {tensorModelId(value);return false;} catch {return true;}
}

export function readCheckpointCatalog(data:Record<string,any>,provider:string): CheckpointCatalogResult {
  const rows=data[provider];
  if (rows?.error) throw new Error([rows.error,rows.details].filter(Boolean).join(': '));
  if (!Array.isArray(rows)) throw new Error('目录响应没有返回所选供应商的模型列表');
  const options:CatalogOption[]=rows.filter(row=>row.id && !/lora|locon|lycoris|dora/i.test(row.type || row.category || '')).map(row=>({value:String(row.id),label:`${row.name || row.id} · ${row.id}`,provider})).filter(row=>!isInvalidTensorModel(provider,row.value));
  const pagination=data._pagination?.[provider] || data.pagination?.[provider] || {};
  const sourceUrl = typeof pagination.sourceUrl === 'string' && pagination.sourceUrl ? pagination.sourceUrl : undefined;
  const sourceNotice = typeof pagination.sourceNotice === 'string' && pagination.sourceNotice ? pagination.sourceNotice : undefined;
  const catalogNotice = typeof data.catalogNotices?.[provider] === 'string'
    ? data.catalogNotices[provider]
    : (typeof pagination.message === 'string' ? pagination.message : undefined);
  const isLookupOnly = isLookupOnlyCatalog(pagination);

  return {
    options,
    nextCursor:pagination.nextCursor || '',
    hasMore:pagination.hasMore===true,
    page:Number(pagination.page)||1,
    sourceUrl,
    sourceNotice,
    catalogNotice,
    isLookupOnly,
  };
}

export function mergeCheckpointOptions(provider:string,live:CatalogOption[]) {
  const rows=live.filter(row=>row.provider===provider);
  const seen=new Set<string>();
  return rows.filter(row=>!seen.has(row.value) && !!seen.add(row.value));
}

export function getDriverModelSuggestions(
  provider: string,
  driverRegistry: { getDriver: (id: string) => { supportedModels?: Array<{ id: string; name?: string; description?: string; type?: string }> } | undefined } = EngineRegistry
): DriverModelSuggestion[] {
  const driver = driverRegistry?.getDriver?.(provider);
  if (!driver || !Array.isArray(driver.supportedModels)) return [];
  return driver.supportedModels
    .filter((m) => m && typeof m.id === 'string' && m.id.trim() && m.type !== 'video')
    .map((m) => ({
      id: m.id.trim(),
      name: m.name || m.id,
      description: m.description,
      declaredInDriver: true as const,
    }));
}
