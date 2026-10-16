import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import {
  getStoredApiKeys,
  saveStoredApiKeys,
  fetchLiveModels,
  fetchReplicateModelInfo,
} from '../services/api';
import { checkpointNodeTitle } from '../utils/providerLabels';
import { explicitProvider } from '../utils/graphEditing';

const modelHubModalSource = readFileSync(new URL('./ModelHubModal.tsx', import.meta.url), 'utf8');
const backendSettingsModalSource = readFileSync(new URL('./BackendSettingsModal.tsx', import.meta.url), 'utf8');
const appSource = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const apiSource = readFileSync(new URL('../services/api.ts', import.meta.url), 'utf8');

// Mock localStorage for Node vitest environment
const store = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, val: string) => store.set(key, String(val)),
  removeItem: (key: string) => store.delete(key),
  clear: () => store.clear(),
};
vi.stubGlobal('localStorage', localStorageMock);

describe('Replicate Engine Integration & Wiring', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.restoreAllMocks();
  });

  describe('src/services/api.ts', () => {
    it('getStoredApiKeys reads replicateKey from comfycanvas_replicate_key in localStorage', () => {
      localStorageMock.setItem('comfycanvas_replicate_key', 'r8_testtoken12345');
      const keys = getStoredApiKeys();
      expect(keys.replicateKey).toBe('r8_testtoken12345');
    });

    it('saveStoredApiKeys writes replicateKey to comfycanvas_replicate_key in localStorage', () => {
      const keys = getStoredApiKeys();
      keys.replicateKey = 'r8_newtoken67890';
      saveStoredApiKeys(keys);
      expect(localStorageMock.getItem('comfycanvas_replicate_key')).toBe('r8_newtoken67890');
    });

    it('fetchLiveModels adds x-replicate-key header when replicateKey is present', async () => {
      localStorageMock.setItem('comfycanvas_replicate_key', 'r8_mykey');
      let capturedHeaders: Record<string, string> = {};
      const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        return Promise.resolve(new Response(JSON.stringify({ results: [] }), { status: 200 }));
      });
      vi.stubGlobal('fetch', mockFetch);

      await fetchLiveModels('replicate', '', 'Checkpoint');
      expect(capturedHeaders['x-replicate-key']).toBe('r8_mykey');
    });

    it('fetchReplicateModelInfo calls /api/replicate/model-info with x-replicate-key', async () => {
      localStorageMock.setItem('comfycanvas_replicate_key', 'r8_info_key');
      let capturedUrl = '';
      let capturedHeaders: Record<string, string> = {};
      const mockFetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        capturedUrl = url;
        capturedHeaders = (init?.headers as Record<string, string>) || {};
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ id: 'black-forest-labs/flux-schnell', name: 'FLUX.1 Schnell' }),
        });
      });
      vi.stubGlobal('fetch', mockFetch);

      const info = await fetchReplicateModelInfo('black-forest-labs/flux-schnell');
      expect(capturedUrl).toContain('/api/replicate/model-info?model=black-forest-labs%2Fflux-schnell');
      expect(capturedHeaders['x-replicate-key']).toBe('r8_info_key');
      expect(info.id).toBe('black-forest-labs/flux-schnell');
    });
  });

  describe('src/components/ModelHubModal.tsx', () => {
    it('ProviderTab type includes replicate', () => {
      expect(modelHubModalSource).toMatch(/export type ProviderTab = [^;]*'replicate'/);
    });

    it('includes Replicate in provider tabs list', () => {
      expect(modelHubModalSource).toContain("{ id: 'replicate', name: 'Replicate' }");
    });

    it('contains custom ID input placeholder and description for Replicate', () => {
      expect(modelHubModalSource).toContain("activeProvider === 'replicate'");
      expect(modelHubModalSource).toContain('输入 Replicate 模型 ID (如 black-forest-labs/flux-schnell 或 ideogram-ai/ideogram-v2a)...');
    });

    it('wires fetchReplicateModelInfo and onSelectModel on custom ID import', () => {
      expect(modelHubModalSource).toContain("if (activeProvider === 'replicate')");
      expect(modelHubModalSource).toContain('await fetchReplicateModelInfo(rawId)');
      expect(modelHubModalSource).toContain("onSelectModel(rawId, info?.name || rawId, 'replicate', info)");
    });

    it('provides fallback banner gradient styling for Replicate', () => {
      expect(modelHubModalSource).toContain("providerKey === 'replicate'");
      expect(modelHubModalSource).toContain('bg-gradient-to-br from-[#082032] via-[#0f172a] to-[#1e1b4b]');
    });

    it('contains external link to replicate.com for Replicate models', () => {
      expect(modelHubModalSource).toContain("providerKey === 'replicate'");
      expect(modelHubModalSource).toContain('https://replicate.com/${modelId}');
    });
  });

  describe('Settings & Key Configuration (BackendSettingsModal.tsx)', () => {
    it('ALLOWED_CLOUD_SETTINGS_FIELDS includes replicateKey', () => {
      expect(backendSettingsModalSource).toContain("'replicateKey'");
    });

    it('providers list includes Replicate with REPLICATE_API_TOKEN placeholder', () => {
      expect(backendSettingsModalSource).toContain("id: 'replicate'");
      expect(backendSettingsModalSource).toContain("name: friendlyProviderLabel('replicate')");
      expect(backendSettingsModalSource).toContain("keyName: 'replicateKey'");
      expect(backendSettingsModalSource).toContain('REPLICATE_API_TOKEN');
    });

    it('has connectivity test capability calling testProviderConnection with replicate', () => {
      expect(backendSettingsModalSource).toContain("handleTest(currentProvider.id)");
      expect(backendSettingsModalSource).toContain("testProviderConnection(providerId, key, adminToken)");
    });
  });

  describe('src/App.tsx & utils/providerLabels.ts', () => {
    it('explicitProvider recognizes replicate', () => {
      expect(explicitProvider('replicate')).toBe('replicate');
      expect(explicitProvider('Replicate')).toBe('replicate');
      expect(explicitProvider('replicate 官方')).toBe('replicate');
    });

    it('checkpointNodeTitle returns Load Checkpoint (Replicate · ...) for replicate', () => {
      expect(checkpointNodeTitle('replicate', 'black-forest-labs/flux-schnell')).toBe(
        'Load Checkpoint (Replicate · flux-schnell)'
      );
      expect(checkpointNodeTitle('replicate', 'flux-dev')).toBe(
        'Load Checkpoint (Replicate · flux-dev)'
      );
      expect(checkpointNodeTitle('replicate')).toBe('Load Checkpoint (Replicate)');
    });

    it('App.tsx sets Load Checkpoint (Replicate · ...) title when selecting or adding replicate model', () => {
      expect(appSource).toContain("Load Checkpoint (Replicate · ");
    });
  });
});
