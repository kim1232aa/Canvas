import { AsyncLocalStorage } from 'node:async_hooks';
import type { CanvasStore } from './store';

export interface HostingContext {
  origin: string;
  authenticatedUserId: string | null;
  ownerUserId: string | null;
  settings: Record<string, any>;
  store: CanvasStore;
  pending: Promise<unknown>[];
}

export const requestContext = new AsyncLocalStorage<HostingContext>();
export function currentRequest(): HostingContext {
  const value = requestContext.getStore();
  if (!value) throw new Error('No active Canvas request context');
  return value;
}
export function currentSettings(): Record<string, any> {
  return requestContext.getStore()?.settings ?? {};
}
