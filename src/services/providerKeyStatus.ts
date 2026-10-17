/**
 * cleanup-2026-10-17: ask the server whether each provider in POOL_KEY_FIELDS has a key ready.
 * Response is configured:true/false only — never key material.
 */
import { getStoredApiKeys } from './api';

export type ProviderKeyStatusMap = Record<string, { configured: boolean }>;

/** Same header names generate requests use (see api.ts buildGenerateHeaders). */
function keyHeadersFromStored(): Record<string, string> {
  const keys = getStoredApiKeys() as Record<string, string>;
  const out: Record<string, string> = {};
  const put = (header: string, value?: string) => { if (value?.trim()) out[header] = value.trim(); };
  put('x-muapi-key', keys.muapiKey);
  put('x-wavespeed-key', keys.wavespeedKey);
  put('x-sogni-key', keys.sogniKey);
  put('x-krea-key', keys.kreaKey);
  put('x-together-key', keys.togetherKey);
  put('x-aimlapi-key', keys.aimlapiKey);
  put('x-novita-key', keys.novitaKey);
  put('x-venice-key', keys.veniceKey);
  put('x-fal-key', keys.falKey);
  put('x-agnes-key', keys.agnesKey);
  put('x-sensenova-key', keys.sensenovaKey);
  put('x-civitai-key', keys.civitaiKey || keys.civitaiToken);
  put('x-hf-token', keys.hfToken);
  put('x-modelscope-token', keys.modelscopeToken);
  put('x-modelscope-ai-token', keys.modelscopeAiToken);
  put('x-nanogpt-key', keys.nanogptKey);
  put('x-tensorart-key', keys.tensorartKey);
  put('x-gemini-key', keys.geminiKey);
  put('x-openai-compat-key', keys.openaiCompatKey);
  put('x-grok-compat-key', keys.grokCompatKey);
  put('x-runware-key', keys.runwareKey);
  put('x-modelslab-key', keys.modelslabKey);
  put('x-replicate-key', keys.replicateKey);
  return out;
}

export async function fetchProviderKeyStatus(): Promise<ProviderKeyStatusMap> {
  const res = await fetch('/api/provider-key-status', { headers: keyHeadersFromStored() });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`GET /api/provider-key-status → HTTP ${res.status}${body ? `\n${body}` : ''}`);
  }
  const data = await res.json();
  return (data?.providers && typeof data.providers === 'object') ? data.providers : {};
}

export function providerKeyConfigured(status: ProviderKeyStatusMap, provider: string): boolean | null {
  const p = String(provider || '').trim().toLowerCase();
  if (!p) return null;
  if (!(p in status)) return null; // unknown to pool config — don't invent
  return status[p]?.configured === true;
}
