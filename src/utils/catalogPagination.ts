export interface GenericCatalogPagination {
  page?: number;
  limit?: number;
  total?: number;
  hasMore?: boolean;
  sourceUrl?: string;
  sourceNotice?: string;
  catalogAvailable?: boolean;
  noPublicRemoteCatalog?: boolean;
  requiresApiKey?: boolean;
  requiresSearchQuery?: boolean;
  isCustomEndpoint?: boolean;
  [k: string]: any;
}

/**
 * Provider-neutral determination if a catalog pagination state represents a provider that has no public remote catalog API.
 * Uses explicit boolean fields (noPublicRemoteCatalog === true or catalogAvailable === false), and strictly excludes
 * missing-key, missing-query, or custom-endpoint states. Never relies on substring matching like includes('lookup-only').
 */
export function hasNoPublicRemoteCatalog(pagination?: GenericCatalogPagination | null): boolean {
  if (!pagination || typeof pagination !== 'object') return false;
  if (pagination.requiresApiKey === true || pagination.requiresSearchQuery === true || pagination.isCustomEndpoint === true) {
    return false;
  }
  return pagination.noPublicRemoteCatalog === true || pagination.catalogAvailable === false;
}

export const isLookupOnlyCatalog = hasNoPublicRemoteCatalog;
